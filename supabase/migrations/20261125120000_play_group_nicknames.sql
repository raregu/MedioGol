/*
  # Grupos fijos: apodos

  - Cada jugador se muestra con su APODO (display_name) en la lista, la espera, los equipos,
    el mensaje de WhatsApp y el Inicio.
  - Nombre real opcional (real_name): solo lo ve el organizador (y los admin del grupo).
  - Apodos de 1 a 20 letras y sin repetir dentro del grupo (sin importar mayúsculas).
  - El jugador puede cambiar su propio apodo (play_set_nickname); el organizador, el de cualquiera.
  - Los nombres actuales pasan a ser el apodo; si había repetidos en un grupo se les agrega " 2", " 3"...

  Idempotente.
*/

ALTER TABLE public.play_group_members ADD COLUMN IF NOT EXISTS real_name text;
DO $$ BEGIN
  ALTER TABLE public.play_group_members ADD CONSTRAINT play_group_members_real_name_len
    CHECK (real_name IS NULL OR char_length(real_name) <= 60);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Repetidos que ya existan (mismo grupo, activos): se numeran para poder crear el índice único
WITH d AS (
  SELECT id, row_number() OVER (PARTITION BY group_id, lower(btrim(display_name)) ORDER BY created_at, id) AS n
  FROM public.play_group_members WHERE active
)
UPDATE public.play_group_members m SET display_name = left(btrim(m.display_name), 36) || ' ' || d.n
FROM d WHERE d.id = m.id AND d.n > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_play_members_nick
  ON public.play_group_members (group_id, lower(btrim(display_name))) WHERE active;

-- Valida un apodo para el grupo y lo devuelve limpio; si está tomado, sugiere otro
CREATE OR REPLACE FUNCTION public.play_nick(p_group uuid, p_name text, p_except uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v text := btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g')); v_sug text; i int := 2;
BEGIN
  IF char_length(v) < 1 OR char_length(v) > 20 THEN
    RAISE EXCEPTION 'El apodo debe tener entre 1 y 20 letras.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM play_group_members WHERE group_id = p_group AND active AND id IS DISTINCT FROM p_except
             AND lower(btrim(display_name)) = lower(v)) THEN
    LOOP
      v_sug := left(v, 17) || ' ' || i;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM play_group_members WHERE group_id = p_group AND active AND lower(btrim(display_name)) = lower(v_sug));
      i := i + 1;
      EXIT WHEN i > 50;
    END LOOP;
    RAISE EXCEPTION 'Ya hay un «%» en el grupo. Prueba con «%» u otro apodo.', v, v_sug USING ERRCODE = '22023';
  END IF;
  RETURN v;
END;
$$;

-- Apodo libre automático (para reactivar a alguien sin chocar con otro)
CREATE OR REPLACE FUNCTION public.play_free_nick(p_group uuid, p_name text, p_except uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v text := left(btrim(p_name), 20); c text := v; i int := 2;
BEGIN
  WHILE EXISTS (SELECT 1 FROM play_group_members WHERE group_id = p_group AND active AND id <> p_except AND lower(btrim(display_name)) = lower(c)) AND i < 100 LOOP
    c := left(v, 17) || ' ' || i; i := i + 1;
  END LOOP;
  RETURN c;
END;
$$;

-- ---------- Vista del grupo: el nombre real va solo en el bloque privado del organizador ----------
CREATE OR REPLACE FUNCTION public.play_group_view(p_code text DEFAULT NULL, p_group uuid DEFAULT NULL, p_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  g play_groups%ROWTYPE;
  v_session uuid;
  s play_sessions%ROWTYPE;
  v_me uuid;
  v_admin boolean;
  v_result jsonb;
BEGIN
  IF p_code IS NOT NULL THEN
    SELECT * INTO g FROM play_groups WHERE invite_code = p_code;
  ELSE
    SELECT * INTO g FROM play_groups WHERE id = p_group;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grupo no encontrado' USING ERRCODE = 'P0002'; END IF;

  v_me := play_actor(g.id, p_token);
  v_admin := play_is_admin(g.id);
  IF p_code IS NULL AND v_me IS NULL AND NOT v_admin THEN
    RAISE EXCEPTION 'No perteneces a este grupo' USING ERRCODE = '42501';
  END IF;

  v_session := play_ensure_session(g.id);
  PERFORM play_settle(v_session);
  SELECT * INTO s FROM play_sessions WHERE id = v_session;

  v_result := jsonb_build_object(
    'group', jsonb_build_object(
      'id', g.id, 'name', g.name, 'weekday', g.weekday, 'start_time', to_char(g.start_time, 'HH24:MI'),
      'venue', g.venue, 'slots', g.slots, 'price', g.price, 'fixed_mode', g.fixed_mode,
      'allow_guests', g.allow_guests, 'invite_code', g.invite_code,
      'open_days_before', g.open_days_before, 'open_time', to_char(g.open_time, 'HH24:MI'),
      'subs_days_before', g.subs_days_before, 'subs_time', to_char(g.subs_time, 'HH24:MI'),
      'close_days_before', g.close_days_before, 'close_time', to_char(g.close_time, 'HH24:MI'),
      'promote_threshold', g.promote_threshold
    ),
    'session', jsonb_build_object(
      'id', s.id, 'starts_at', s.starts_at, 'opens_at', s.opens_at, 'subs_at', s.subs_at, 'closes_at', s.closes_at,
      'venue', s.venue, 'slots', s.slots, 'price', s.price, 'status', s.status, 'score_a', s.score_a, 'score_b', s.score_b,
      'used', play_used(s.id), 'lineup', s.lineup, 'mvp', s.mvp_member_id
    ),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.display_name, 'role', m.role, 'is_admin', m.is_admin,
        'claimed', (m.user_id IS NOT NULL OR m.claim_hash IS NOT NULL),
        'status', a.status, 'guests', COALESCE(a.guests, 0), 'paid', COALESCE(a.paid, false),
        'team', a.team, 'queued_at', a.queued_at
      ) ORDER BY m.role, lower(m.display_name))
      FROM play_group_members m
      LEFT JOIN play_attendance a ON a.session_id = s.id AND a.member_id = m.id
      WHERE m.group_id = g.id AND m.active
    ), '[]'::jsonb),
    'me', v_me,
    'is_admin', v_admin
  );

  IF v_admin THEN
    v_result := v_result || jsonb_build_object(
      'private', COALESCE((
        SELECT jsonb_object_agg(m.id, jsonb_build_object(
          'real_name', m.real_name,
          'position', p.position, 'stars', p.stars, 'rating', COALESCE(p.rating, 1000), 'games', COALESCE(p.games, 0),
          'attended', st.attended, 'sessions', st.total
        ))
        FROM play_group_members m
        LEFT JOIN play_member_private p ON p.member_id = m.id
        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE a.status IN ('in', 'auto'))::int AS attended, count(*)::int AS total
          FROM (SELECT id FROM play_sessions ps WHERE ps.group_id = g.id AND ps.starts_at < now() AND ps.status <> 'cancelled'
                ORDER BY ps.starts_at DESC LIMIT 12) last
          LEFT JOIN play_attendance a ON a.session_id = last.id AND a.member_id = m.id
        ) st ON true
        WHERE m.group_id = g.id AND m.active
      ), '{}'::jsonb),
      'recent', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('starts_at', ps.starts_at, 'score_a', ps.score_a, 'score_b', ps.score_b, 'status', ps.status, 'lineup', ps.lineup) ORDER BY ps.starts_at DESC)
        FROM (SELECT * FROM play_sessions WHERE group_id = g.id AND id <> s.id ORDER BY starts_at DESC LIMIT 6) ps
      ), '[]'::jsonb)
    );
  END IF;
  RETURN v_result;
END;
$$;

-- ---------- Crear grupo: el organizador entra con su primer nombre como apodo ----------
CREATE OR REPLACE FUNCTION public.play_group_create(p_name text, p_weekday int, p_start time, p_venue text, p_slots int, p_price int)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_full text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM play_groups WHERE owner_id = v_uid) >= 10 THEN
    RAISE EXCEPTION 'Puedes organizar hasta 10 grupos.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO play_groups (owner_id, name, weekday, start_time, venue, slots, price)
  VALUES (v_uid, btrim(p_name), p_weekday, p_start, NULLIF(btrim(COALESCE(p_venue, '')), ''), COALESCE(p_slots, 14), p_price)
  RETURNING id INTO v_id;
  SELECT NULLIF(btrim(full_name), '') INTO v_full FROM profiles WHERE id = v_uid;
  INSERT INTO play_group_members (group_id, user_id, display_name, real_name, role, is_admin)
  VALUES (v_id, v_uid, left(COALESCE(split_part(v_full, ' ', 1), 'Organizador'), 20), left(v_full, 60), 'fixed', true);
  RETURN v_id;
END;
$$;

-- ---------- Agregar jugador (organizador): apodo + nombre real opcional ----------
DROP FUNCTION IF EXISTS public.play_member_add(uuid, text, text);
CREATE OR REPLACE FUNCTION public.play_member_add(p_group uuid, p_name text, p_role text DEFAULT 'sub', p_real_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_session uuid; v_nick text;
BEGIN
  IF NOT play_is_admin(p_group) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM play_group_members WHERE group_id = p_group AND active) >= 80 THEN
    RAISE EXCEPTION 'El grupo llegó a 80 jugadores.' USING ERRCODE = '22023';
  END IF;
  v_nick := play_nick(p_group, p_name);
  INSERT INTO play_group_members (group_id, display_name, real_name, role)
  VALUES (p_group, v_nick, left(NULLIF(btrim(COALESCE(p_real_name, '')), ''), 60), COALESCE(p_role, 'sub'))
  RETURNING id INTO v_id;
  IF p_role = 'fixed' THEN
    v_session := play_ensure_session(p_group);
    INSERT INTO play_attendance (session_id, member_id, status) VALUES (v_session, v_id, 'auto') ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_id;
END;
$$;

-- ---------- Cambios del organizador: ahora también apodo y nombre real ----------
CREATE OR REPLACE FUNCTION public.play_member_update(p_member uuid, p_changes jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE m play_group_members%ROWTYPE; v_session uuid; v_nick text;
BEGIN
  SELECT * INTO m FROM play_group_members WHERE id = p_member;
  IF NOT FOUND OR NOT play_is_admin(m.group_id) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF p_changes ? 'name' THEN
    v_nick := play_nick(m.group_id, p_changes->>'name', p_member);
  ELSIF (p_changes->>'active')::boolean AND NOT m.active THEN
    v_nick := play_free_nick(m.group_id, m.display_name, p_member);  -- vuelve sin chocar con otro apodo
  END IF;
  UPDATE play_group_members SET
    display_name = COALESCE(v_nick, display_name),
    real_name = CASE WHEN p_changes ? 'real_name' THEN left(NULLIF(btrim(COALESCE(p_changes->>'real_name', '')), ''), 60) ELSE real_name END,
    role = COALESCE(p_changes->>'role', role),
    is_admin = COALESCE((p_changes->>'is_admin')::boolean, is_admin),
    active = COALESCE((p_changes->>'active')::boolean, active),
    claim_hash = CASE WHEN (p_changes->>'reset_claim')::boolean THEN NULL ELSE claim_hash END
  WHERE id = p_member;
  -- Ascendido a fijo: entra a la semana en curso si aún no respondió
  IF p_changes->>'role' = 'fixed' AND m.role <> 'fixed' THEN
    v_session := play_ensure_session(m.group_id);
    INSERT INTO play_attendance (session_id, member_id, status) VALUES (v_session, p_member, 'auto') ON CONFLICT DO NOTHING;
  END IF;
  IF p_changes ? 'position' OR p_changes ? 'stars' THEN
    INSERT INTO play_member_private (member_id) VALUES (p_member) ON CONFLICT DO NOTHING;
    UPDATE play_member_private SET
      position = CASE WHEN p_changes ? 'position' THEN NULLIF(p_changes->>'position', '') ELSE position END,
      stars = CASE WHEN p_changes ? 'stars' THEN (p_changes->>'stars')::smallint ELSE stars END,
      rating = CASE WHEN games = 0 AND p_changes ? 'stars' AND p_changes->>'stars' IS NOT NULL
                    THEN 1000 + ((p_changes->>'stars')::int - 3) * 100 ELSE rating END,
      updated_at = now()
    WHERE member_id = p_member;
  END IF;
END;
$$;

-- ---------- Entrar con el link: el nombre que escribe es su apodo ----------
CREATE OR REPLACE FUNCTION public.play_join(p_code text, p_name text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE g play_groups%ROWTYPE; v_id uuid; v_old play_group_members%ROWTYPE; v_token text; v_uid uuid := auth.uid(); v_nick text;
BEGIN
  SELECT * INTO g FROM play_groups WHERE invite_code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grupo no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_uid IS NOT NULL THEN
    SELECT * INTO v_old FROM play_group_members WHERE group_id = g.id AND user_id = v_uid;
    IF FOUND THEN
      IF NOT v_old.active THEN
        UPDATE play_group_members SET active = true, display_name = play_free_nick(g.id, v_old.display_name, v_old.id) WHERE id = v_old.id;
      END IF;
      RETURN jsonb_build_object('member_id', v_old.id);
    END IF;
  END IF;
  IF (SELECT count(*) FROM play_group_members WHERE group_id = g.id AND active) >= 80 THEN
    RAISE EXCEPTION 'El grupo llegó a 80 jugadores.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM play_group_members WHERE group_id = g.id AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Demasiados ingresos seguidos. Intenta en un rato.' USING ERRCODE = '22023';
  END IF;
  v_nick := play_nick(g.id, p_name);
  IF v_uid IS NULL THEN v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); END IF;
  INSERT INTO play_group_members (group_id, user_id, display_name, role, claim_hash)
  VALUES (g.id, v_uid, v_nick, 'sub', CASE WHEN v_token IS NULL THEN NULL ELSE play_hash(v_token) END)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('member_id', v_id, 'token', v_token);
END;
$$;

-- ---------- El jugador cambia su propio apodo ----------
CREATE OR REPLACE FUNCTION public.play_set_nickname(p_group uuid, p_name text, p_token text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_me uuid; v_nick text;
BEGIN
  v_me := play_actor(p_group, p_token);
  IF v_me IS NULL THEN RAISE EXCEPTION 'No perteneces a este grupo' USING ERRCODE = '42501'; END IF;
  v_nick := play_nick(p_group, p_name, v_me);
  UPDATE play_group_members SET display_name = v_nick WHERE id = v_me;
  RETURN v_nick;
END;
$$;

-- ---------- Permisos ----------
REVOKE ALL ON FUNCTION public.play_nick(uuid, text, uuid), public.play_free_nick(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.play_set_nickname(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.play_set_nickname(uuid, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.play_member_add(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.play_member_add(uuid, text, text, text) TO authenticated;
