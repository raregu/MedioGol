/*
  # Convocatoria de partidos de liga ("¿Vas al partido?")

  Para cada partido (fecha regular o playoff) un equipo arma su lista: el que la abre la comparte por
  WhatsApp y cada jugador responde Voy / En duda / No voy con un toque, con un comentario opcional.

  - Lista por equipo de la serie (teams.id): los jugadores quedan guardados para los siguientes partidos.
  - Si el plantel está cargado (team_players), sus jugadores aparecen solos (con su cuenta).
  - Sin cuenta: eligen o escriben su apodo una vez; el teléfono guarda un token (en la base solo el hash).
  - La abre cualquier usuario con cuenta (en muchas ligas el capitán no está en la app); la administran
    quien la abrió, el capitán del equipo y el organizador del campeonato.
  - Todo por funciones SECURITY DEFINER; las tablas no se exponen.

  Requiere 20261119150000_play_groups.sql (usa play_hash). Idempotente.
*/

CREATE TABLE IF NOT EXISTS public.team_callup_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 20),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  claim_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_callup_member_nick ON public.team_callup_members (team_id, lower(btrim(display_name)));
CREATE INDEX IF NOT EXISTS idx_callup_member_user ON public.team_callup_members (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.match_callups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  playoff_match_id uuid REFERENCES public.playoff_matches(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((match_id IS NULL) <> (playoff_match_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_callup_match ON public.match_callups (team_id, match_id) WHERE match_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_callup_playoff ON public.match_callups (team_id, playoff_match_id) WHERE playoff_match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_callups_creator ON public.match_callups (created_by, created_at);

CREATE TABLE IF NOT EXISTS public.match_callup_replies (
  callup_id uuid NOT NULL REFERENCES public.match_callups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.team_callup_members(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('yes', 'maybe', 'no')),
  note text CHECK (note IS NULL OR char_length(note) <= 80),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (callup_id, member_id)
);

ALTER TABLE public.team_callup_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_callups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_callup_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_callup_members, public.match_callups, public.match_callup_replies FROM anon, authenticated;

-- ---------- Ayudas ----------
-- Apodo válido y libre en el equipo (si está tomado, sugiere otro)
CREATE OR REPLACE FUNCTION public.callup_nick(p_team uuid, p_name text, p_except uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v text := btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g')); v_sug text; i int := 2;
BEGIN
  IF char_length(v) < 1 OR char_length(v) > 20 THEN
    RAISE EXCEPTION 'El apodo debe tener entre 1 y 20 letras.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM team_callup_members WHERE team_id = p_team AND id IS DISTINCT FROM p_except AND lower(btrim(display_name)) = lower(v)) THEN
    LOOP
      v_sug := left(v, 17) || ' ' || i;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM team_callup_members WHERE team_id = p_team AND lower(btrim(display_name)) = lower(v_sug)) OR i > 50;
      i := i + 1;
    END LOOP;
    RAISE EXCEPTION 'Ya hay un «%» en la lista. Si eres tú, tócalo arriba; si no, prueba con «%».', v, v_sug USING ERRCODE = '22023';
  END IF;
  RETURN v;
END;
$$;

-- ¿El usuario conectado administra esta convocatoria?
CREATE OR REPLACE FUNCTION public.callup_can_manage(p_callup uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM match_callups c
    JOIN teams t ON t.id = c.team_id
    JOIN championships ch ON ch.id = t.championship_id
    LEFT JOIN profiles p ON p.id = auth.uid()
    WHERE c.id = p_callup
      AND (c.created_by = auth.uid() OR t.captain_id = auth.uid() OR ch.admin_id = auth.uid() OR p.role::text = 'admin_sistema')
  );
$$;

-- Miembro que actúa: por cuenta o por el token del teléfono
CREATE OR REPLACE FUNCTION public.callup_actor(p_team uuid, p_token text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id FROM team_callup_members m
  WHERE m.team_id = p_team
    AND ((auth.uid() IS NOT NULL AND m.user_id = auth.uid())
         OR (p_token IS NOT NULL AND char_length(p_token) >= 32 AND m.claim_hash = play_hash(p_token)))
  ORDER BY (m.user_id = auth.uid()) DESC NULLS LAST
  LIMIT 1;
$$;

-- Los jugadores del plantel cargado entran solos a la lista del equipo (con su cuenta)
CREATE OR REPLACE FUNCTION public.callup_seed_roster(p_team uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; v_nick text; i int;
BEGIN
  FOR r IN
    SELECT pp.id, pp.full_name FROM team_players tp JOIN player_profiles pp ON pp.id = tp.player_id
    JOIN profiles pr ON pr.id = pp.id
    WHERE tp.team_id = p_team AND COALESCE(tp.is_active, true)
      AND NOT EXISTS (SELECT 1 FROM team_callup_members m WHERE m.team_id = p_team AND m.user_id = pp.id)
    ORDER BY pp.full_name LIMIT 60
  LOOP
    -- "Juan Pérez Soto" → "Juan P."; si se repite, "Juan P. 2"
    v_nick := left(btrim(split_part(btrim(r.full_name), ' ', 1) ||
              CASE WHEN split_part(btrim(r.full_name), ' ', 2) <> '' THEN ' ' || left(split_part(btrim(r.full_name), ' ', 2), 1) || '.' ELSE '' END), 17);
    IF v_nick = '' THEN v_nick := 'Jugador'; END IF;
    i := 2;
    WHILE EXISTS (SELECT 1 FROM team_callup_members WHERE team_id = p_team AND lower(display_name) = lower(v_nick)) AND i < 60 LOOP
      v_nick := left(v_nick, 17) || ' ' || i; i := i + 1;
    END LOOP;
    INSERT INTO team_callup_members (team_id, display_name, user_id) VALUES (p_team, v_nick, r.id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ---------- Abrir (o retomar) la convocatoria de un equipo para un partido ----------
-- Fecha regular: p_match + p_team (teams.id). Playoff: p_playoff + p_base_team (club).
CREATE OR REPLACE FUNCTION public.callup_start(p_match uuid DEFAULT NULL, p_team uuid DEFAULT NULL, p_playoff uuid DEFAULT NULL, p_base_team uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_team uuid; v_code text; v_ch uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión para armar la lista.' USING ERRCODE = '42501'; END IF;
  IF p_match IS NOT NULL THEN
    SELECT CASE WHEN p_team IN (m.home_team_id, m.away_team_id) THEN p_team END INTO v_team FROM matches m WHERE m.id = p_match;
  ELSIF p_playoff IS NOT NULL THEN
    SELECT t.id INTO v_team FROM playoff_matches pm
    JOIN teams t ON t.championship_id = pm.championship_id AND t.base_team_id = p_base_team
    WHERE pm.id = p_playoff AND p_base_team IN (pm.team1_id, pm.team2_id)
    ORDER BY t.created_at LIMIT 1;
  END IF;
  IF v_team IS NULL THEN RAISE EXCEPTION 'Ese equipo no juega este partido.' USING ERRCODE = '22023'; END IF;

  SELECT code INTO v_code FROM match_callups
  WHERE team_id = v_team AND ((p_match IS NOT NULL AND match_id = p_match) OR (p_playoff IS NOT NULL AND playoff_match_id = p_playoff));
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  IF (SELECT count(*) FROM match_callups WHERE created_by = v_uid AND created_at > now() - interval '1 day') >= 20 THEN
    RAISE EXCEPTION 'Abriste muchas listas hoy. Intenta mañana.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO match_callups (team_id, match_id, playoff_match_id, created_by)
  VALUES (v_team, p_match, p_playoff, v_uid)
  ON CONFLICT DO NOTHING
  RETURNING code INTO v_code;
  IF v_code IS NULL THEN  -- otro la abrió al mismo tiempo
    SELECT code INTO v_code FROM match_callups
    WHERE team_id = v_team AND ((p_match IS NOT NULL AND match_id = p_match) OR (p_playoff IS NOT NULL AND playoff_match_id = p_playoff));
    RETURN v_code;
  END IF;
  PERFORM callup_seed_roster(v_team);
  -- Quien la abre queda en la lista (con su primer nombre si no estaba)
  IF NOT EXISTS (SELECT 1 FROM team_callup_members WHERE team_id = v_team AND user_id = v_uid) THEN
    BEGIN
      INSERT INTO team_callup_members (team_id, display_name, user_id)
      SELECT v_team, left(COALESCE(NULLIF(split_part(btrim(full_name), ' ', 1), ''), 'Capitán'), 20), v_uid FROM profiles WHERE id = v_uid;
    EXCEPTION WHEN unique_violation THEN
      INSERT INTO team_callup_members (team_id, display_name, user_id)
      SELECT v_team, left(COALESCE(NULLIF(split_part(btrim(full_name), ' ', 1), ''), 'Capitán'), 15) || ' ' || substr(md5(random()::text), 1, 3), v_uid FROM profiles WHERE id = v_uid;
    END;
  END IF;
  RETURN v_code;
END;
$$;

-- ---------- Vista pública por código ----------
CREATE OR REPLACE FUNCTION public.callup_view(p_code text, p_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c match_callups%ROWTYPE; t teams%ROWTYPE; v_match jsonb; v_me uuid; v_manage boolean;
BEGIN
  SELECT * INTO c FROM match_callups WHERE code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lista no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO t FROM teams WHERE id = c.team_id;

  IF c.match_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'kind', 'match', 'date', m.match_date, 'venue', m.venue, 'status', m.status, 'round', m.round,
      'home', ht.name, 'away', at.name, 'is_home', m.home_team_id = c.team_id,
      'home_score', m.home_score, 'away_score', m.away_score,
      'championship', ch.name, 'championship_id', ch.id)
    INTO v_match
    FROM matches m JOIN teams ht ON ht.id = m.home_team_id JOIN teams at ON at.id = m.away_team_id
    JOIN championships ch ON ch.id = m.championship_id WHERE m.id = c.match_id;
  ELSE
    SELECT jsonb_build_object(
      'kind', 'playoff', 'date', pm.match_date, 'venue', pm.venue, 'status', pm.status, 'round_name', pm.round,
      'home', b1.name, 'away', b2.name, 'is_home', b1.id = t.base_team_id,
      'home_score', pm.team1_score, 'away_score', pm.team2_score,
      'championship', ch.name, 'championship_id', ch.id)
    INTO v_match
    FROM playoff_matches pm LEFT JOIN base_teams b1 ON b1.id = pm.team1_id LEFT JOIN base_teams b2 ON b2.id = pm.team2_id
    JOIN championships ch ON ch.id = pm.championship_id WHERE pm.id = c.playoff_match_id;
  END IF;

  v_me := callup_actor(c.team_id, p_token);
  v_manage := callup_can_manage(c.id);
  RETURN jsonb_build_object(
    'callup', jsonb_build_object('id', c.id, 'code', c.code, 'team', t.name, 'team_id', t.id),
    'match', v_match,
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.display_name, 'claimed', (m.user_id IS NOT NULL OR m.claim_hash IS NOT NULL),
        'status', r.status, 'note', r.note, 'updated_at', r.updated_at
      ) ORDER BY lower(m.display_name))
      FROM team_callup_members m LEFT JOIN match_callup_replies r ON r.callup_id = c.id AND r.member_id = m.id
      WHERE m.team_id = c.team_id
    ), '[]'::jsonb),
    'me', v_me,
    'can_manage', v_manage
  );
END;
$$;

-- ---------- Sumarse (apodo nuevo) o tomar un nombre de la lista ----------
CREATE OR REPLACE FUNCTION public.callup_join(p_code text, p_name text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c match_callups%ROWTYPE; v_uid uuid := auth.uid(); v_id uuid; v_token text; v_nick text;
BEGIN
  SELECT * INTO c FROM match_callups WHERE code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lista no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_uid IS NOT NULL THEN
    SELECT id INTO v_id FROM team_callup_members WHERE team_id = c.team_id AND user_id = v_uid;
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('member_id', v_id); END IF;
  END IF;
  IF (SELECT count(*) FROM team_callup_members WHERE team_id = c.team_id) >= 60 THEN
    RAISE EXCEPTION 'La lista del equipo llegó a 60 jugadores.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM team_callup_members WHERE team_id = c.team_id AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Demasiados ingresos seguidos. Intenta en un rato.' USING ERRCODE = '22023';
  END IF;
  v_nick := callup_nick(c.team_id, p_name);
  IF v_uid IS NULL THEN v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); END IF;
  INSERT INTO team_callup_members (team_id, display_name, user_id, claim_hash)
  VALUES (c.team_id, v_nick, v_uid, CASE WHEN v_token IS NULL THEN NULL ELSE play_hash(v_token) END)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('member_id', v_id, 'token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.callup_claim(p_code text, p_member uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c match_callups%ROWTYPE; m team_callup_members%ROWTYPE; v_uid uuid := auth.uid(); v_token text;
BEGIN
  SELECT * INTO c FROM match_callups WHERE code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lista no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO m FROM team_callup_members WHERE id = p_member AND team_id = c.team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF m.user_id IS NOT NULL OR m.claim_hash IS NOT NULL THEN
    RAISE EXCEPTION 'Ese nombre ya está tomado en otro teléfono. Pídele a quien armó la lista que lo libere.' USING ERRCODE = '22023';
  END IF;
  IF v_uid IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM team_callup_members WHERE team_id = c.team_id AND user_id = v_uid) THEN
      RAISE EXCEPTION 'Tu cuenta ya está en esta lista con otro nombre.' USING ERRCODE = '22023';
    END IF;
    UPDATE team_callup_members SET user_id = v_uid WHERE id = p_member;
    RETURN jsonb_build_object('member_id', p_member);
  END IF;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  UPDATE team_callup_members SET claim_hash = play_hash(v_token) WHERE id = p_member;
  RETURN jsonb_build_object('member_id', p_member, 'token', v_token);
END;
$$;

-- ---------- Responder: 'yes' | 'maybe' | 'no' (quien administra puede responder por otros) ----------
CREATE OR REPLACE FUNCTION public.callup_reply(p_code text, p_status text, p_note text DEFAULT NULL, p_token text DEFAULT NULL, p_member uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c match_callups%ROWTYPE; v_actor uuid; v_target uuid;
BEGIN
  IF p_status NOT IN ('yes', 'maybe', 'no') THEN RAISE EXCEPTION 'Respuesta no válida' USING ERRCODE = '22023'; END IF;
  SELECT * INTO c FROM match_callups WHERE code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lista no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_actor := callup_actor(c.team_id, p_token);
  v_target := COALESCE(p_member, v_actor);
  IF v_target IS NULL OR (v_target IS DISTINCT FROM v_actor AND NOT callup_can_manage(c.id)) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM team_callup_members WHERE id = v_target AND team_id = c.team_id) THEN
    RAISE EXCEPTION 'Jugador no encontrado' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO match_callup_replies (callup_id, member_id, status, note, updated_at)
  VALUES (c.id, v_target, p_status, left(NULLIF(btrim(COALESCE(p_note, '')), ''), 80), now())
  ON CONFLICT (callup_id, member_id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = now();
  RETURN p_status;
END;
$$;

-- ---------- Quien administra: agregar a alguien, cambiar apodo, liberar teléfono, quitar ----------
CREATE OR REPLACE FUNCTION public.callup_member_manage(p_code text, p_action text, p_member uuid DEFAULT NULL, p_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c match_callups%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO c FROM match_callups WHERE code = p_code;
  IF NOT FOUND OR NOT callup_can_manage(c.id) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF p_action = 'add' THEN
    IF (SELECT count(*) FROM team_callup_members WHERE team_id = c.team_id) >= 60 THEN
      RAISE EXCEPTION 'La lista del equipo llegó a 60 jugadores.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO team_callup_members (team_id, display_name) VALUES (c.team_id, callup_nick(c.team_id, p_name)) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM team_callup_members WHERE id = p_member AND team_id = c.team_id) THEN
    RAISE EXCEPTION 'Jugador no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF p_action = 'rename' THEN
    UPDATE team_callup_members SET display_name = callup_nick(c.team_id, p_name, p_member) WHERE id = p_member;
  ELSIF p_action = 'release' THEN
    UPDATE team_callup_members SET claim_hash = NULL WHERE id = p_member;
  ELSIF p_action = 'remove' THEN
    DELETE FROM team_callup_members WHERE id = p_member AND user_id IS DISTINCT FROM auth.uid();
  ELSE
    RAISE EXCEPTION 'Acción no válida' USING ERRCODE = '22023';
  END IF;
  RETURN p_member;
END;
$$;

-- El jugador cambia su propio apodo en la lista del equipo
CREATE OR REPLACE FUNCTION public.callup_set_nickname(p_code text, p_name text, p_token text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE c match_callups%ROWTYPE; v_me uuid; v_nick text;
BEGIN
  SELECT * INTO c FROM match_callups WHERE code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lista no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_me := callup_actor(c.team_id, p_token);
  IF v_me IS NULL THEN RAISE EXCEPTION 'No estás en esta lista' USING ERRCODE = '42501'; END IF;
  v_nick := callup_nick(c.team_id, p_name, v_me);
  UPDATE team_callup_members SET display_name = v_nick WHERE id = v_me;
  RETURN v_nick;
END;
$$;

-- Convocatorias ya abiertas de un partido (para mostrar "Ver lista" en vez de "Armar lista")
CREATE OR REPLACE FUNCTION public.callups_for(p_match uuid DEFAULT NULL, p_playoff uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', c.code, 'team_id', c.team_id, 'base_team_id', t.base_team_id,
    'yes', (SELECT count(*) FROM match_callup_replies r WHERE r.callup_id = c.id AND r.status = 'yes')
  )), '[]'::jsonb)
  FROM match_callups c JOIN teams t ON t.id = c.team_id
  WHERE (p_match IS NOT NULL AND c.match_id = p_match) OR (p_playoff IS NOT NULL AND c.playoff_match_id = p_playoff);
$$;

-- ---------- Permisos ----------
REVOKE ALL ON FUNCTION public.callup_nick(uuid, text, uuid), public.callup_can_manage(uuid), public.callup_actor(uuid, text),
  public.callup_seed_roster(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.callup_view(text, text), public.callup_join(text, text), public.callup_claim(text, uuid),
  public.callup_reply(text, text, text, text, uuid), public.callup_set_nickname(text, text, text), public.callups_for(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.callup_view(text, text), public.callup_join(text, text), public.callup_claim(text, uuid),
  public.callup_reply(text, text, text, text, uuid), public.callup_set_nickname(text, text, text), public.callups_for(uuid, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.callup_start(uuid, uuid, uuid, uuid), public.callup_member_manage(text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.callup_start(uuid, uuid, uuid, uuid), public.callup_member_manage(text, text, uuid, text) TO authenticated;
