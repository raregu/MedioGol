/*
  # Nómina por Excel y jugadores sin cuenta

  Hasta ahora cada jugador (player_profiles) tenía que ser un usuario: player_profiles.id = auth.users.id.
  Para cargar nóminas completas (como las de las asociaciones) se permiten "fichas" sin cuenta:
    - Se quita la llave foránea player_profiles.id → auth.users. Los jugadores con cuenta siguen igual
      (su id es el de su usuario y todos los permisos "id = auth.uid()" funcionan como antes).
    - Las fichas sin cuenta tienen un id propio, is_placeholder = true y created_by = quien la cargó.
      Sirven para papeleta, goles, tarjetas, sanciones y goleadores. (Reclamar la ficha con el RUT: fase 2.)
  Importación (organizador del campeonato o capitán del equipo):
    - roster_import_check(team, rows): revisa cada fila (RUT válido, ya existe, ya está en el equipo,
      inscrito en otro equipo del mismo campeonato) sin escribir nada.
    - roster_import(team, rows): crea las fichas que faltan (por RUT no se duplican) y las inscribe en el
      equipo del campeonato (team_players) y en el plantel del club (base_team_players).
  El RUT y la fecha de nacimiento van a player_private (el trigger existente los saca de la tabla pública).
  Máximo 80 filas por carga y 60 jugadores activos por equipo. Idempotente.
*/

-- ---------- Fichas sin cuenta ----------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname FROM pg_constraint c
    WHERE c.conrelid = 'public.player_profiles'::regclass AND c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.player_profiles DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS is_placeholder boolean NOT NULL DEFAULT false;
ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_team_players_player ON public.team_players (player_id) WHERE is_active;

-- RUT chileno válido (dígito verificador módulo 11)
CREATE OR REPLACE FUNCTION public.rut_is_valid(p text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v text := public.normalize_rut(p);
  body text; dv text; s int := 0; m int := 2; i int; calc text;
BEGIN
  IF v IS NULL OR length(v) < 2 OR length(v) > 9 THEN RETURN false; END IF;
  body := left(v, length(v) - 1);
  dv := right(v, 1);
  IF body !~ '^[0-9]+$' THEN RETURN false; END IF;
  FOR i IN REVERSE length(body)..1 LOOP
    s := s + substr(body, i, 1)::int * m;
    m := CASE WHEN m = 7 THEN 2 ELSE m + 1 END;
  END LOOP;
  calc := CASE 11 - (s % 11) WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE (11 - (s % 11))::text END;
  RETURN calc = dv;
END;
$$;

-- ¿Puede cargar la nómina de este equipo? Organizador del campeonato (o liga, o admin_sistema) o capitán.
CREATE OR REPLACE FUNCTION public.roster_can_manage(p_team uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teams t
    WHERE t.id = p_team
      AND (public.can_manage_championship_payments(t.championship_id) OR public.is_team_captain(t.id))
  );
$$;

-- ---------- Revisión previa (no escribe) ----------
-- p_rows: [{ "i": 1, "rut": "12.345.678-5" }, ...]
CREATE OR REPLACE FUNCTION public.roster_import_check(p_team uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_champ uuid;
BEGIN
  IF NOT public.roster_can_manage(p_team) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 80 THEN
    RAISE EXCEPTION 'Máximo 80 jugadores por carga' USING ERRCODE = '22023';
  END IF;
  SELECT championship_id INTO v_champ FROM teams WHERE id = p_team;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'i', r.i,
      'valid', public.rut_is_valid(r.rut),
      'exists', pp.player_id IS NOT NULL,
      'in_team', EXISTS (SELECT 1 FROM team_players tp WHERE tp.team_id = p_team AND tp.player_id = pp.player_id AND tp.is_active),
      'other_team', (SELECT t2.name FROM team_players tp JOIN teams t2 ON t2.id = tp.team_id
                     WHERE tp.player_id = pp.player_id AND tp.is_active AND t2.championship_id = v_champ AND t2.id <> p_team LIMIT 1)
    ) ORDER BY r.i)
    FROM (
      SELECT (e->>'i')::int AS i, public.normalize_rut(e->>'rut') AS rut FROM jsonb_array_elements(p_rows) e
    ) r
    LEFT JOIN LATERAL (
      SELECT x.player_id FROM player_private x WHERE r.rut IS NOT NULL AND x.rut = r.rut
      ORDER BY (SELECT p.is_placeholder FROM player_profiles p WHERE p.id = x.player_id) NULLS LAST LIMIT 1
    ) pp ON true
  ), '[]'::jsonb);
END;
$$;

-- ---------- Importación ----------
-- p_rows: [{ "name": "Juan Pérez Soto", "rut": "12.345.678-5", "birth": "1970-01-10" }, ...]
CREATE OR REPLACE FUNCTION public.roster_import(p_team uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t teams%ROWTYPE;
  e jsonb;
  v_name text; v_rut text; v_birth date; v_pid uuid;
  v_added int := 0; v_created int := 0; v_already int := 0; v_skipped int := 0;
  v_active int;
BEGIN
  IF NOT public.roster_can_manage(p_team) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 80 THEN
    RAISE EXCEPTION 'Máximo 80 jugadores por carga' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO t FROM teams WHERE id = p_team FOR UPDATE;

  FOR e IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_name := regexp_replace(btrim(COALESCE(e->>'name', '')), '\s+', ' ', 'g');
    v_rut := public.normalize_rut(e->>'rut');
    v_birth := NULL;
    BEGIN
      v_birth := NULLIF(e->>'birth', '')::date;
      IF v_birth < DATE '1920-01-01' OR v_birth > CURRENT_DATE THEN v_birth := NULL; END IF;
    EXCEPTION WHEN others THEN v_birth := NULL;
    END;
    IF char_length(v_name) NOT BETWEEN 3 AND 80 OR (v_rut IS NOT NULL AND NOT public.rut_is_valid(v_rut)) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_pid := NULL;
    IF v_rut IS NOT NULL THEN
      SELECT x.player_id INTO v_pid FROM player_private x WHERE x.rut = v_rut
      ORDER BY (SELECT p.is_placeholder FROM player_profiles p WHERE p.id = x.player_id) NULLS LAST LIMIT 1;
    END IF;
    IF v_pid IS NULL THEN
      INSERT INTO player_profiles (id, full_name, rut, date_of_birth, is_placeholder, created_by)
      VALUES (gen_random_uuid(), v_name, v_rut, v_birth, true, auth.uid())
      RETURNING id INTO v_pid;
      v_created := v_created + 1;
    END IF;

    IF EXISTS (SELECT 1 FROM team_players WHERE team_id = p_team AND player_id = v_pid AND is_active) THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;
    SELECT count(*) INTO v_active FROM team_players WHERE team_id = p_team AND is_active;
    IF v_active >= 60 THEN
      RAISE EXCEPTION 'El equipo ya tiene 60 jugadores activos' USING ERRCODE = '22023';
    END IF;
    INSERT INTO team_players (team_id, player_id, is_active) VALUES (p_team, v_pid, true) ON CONFLICT DO NOTHING;
    IF t.base_team_id IS NOT NULL THEN
      INSERT INTO base_team_players (base_team_id, player_id, role, status, joined_at)
      VALUES (t.base_team_id, v_pid, 'player', 'active', now()) ON CONFLICT DO NOTHING;
    END IF;
    v_added := v_added + 1;
  END LOOP;

  RETURN jsonb_build_object('added', v_added, 'created', v_created, 'already', v_already, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.roster_can_manage(uuid), public.roster_import_check(uuid, jsonb), public.roster_import(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roster_can_manage(uuid), public.roster_import_check(uuid, jsonb), public.roster_import(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rut_is_valid(text) TO authenticated;
