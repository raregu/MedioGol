/*
  # Grupos fijos (pichanga semanal)

  Un organizador arma su grupo una vez (día, hora, cancha, cupos, valor) y cada semana la lista
  funciona sola:
    - Los FIJOS quedan adentro sin confirmar (solo avisan si no van). Con fixed_mode = 'confirm'
      deben confirmar antes del cierre o pierden el cupo esa semana.
    - Los SUPLENTES entran desde subs_at por orden de llegada; sin cupo quedan en ESPERA.
    - Si alguien se baja, sube el primero de la espera.
    - Pagos de la cancha, equipos parejos (nivel privado del organizador que se ajusta con los
      resultados, tipo ranking de ajedrez) y sugerencias de ascenso a fijo por asistencia.
  Los jugadores sin cuenta entran con el link del grupo (código de invitación): eligen su nombre una
  vez y su teléfono guarda un token secreto (se guarda solo su hash).

  Todo el acceso es por funciones SECURITY DEFINER que validan permisos; las tablas no se exponen.
  La semana se crea y se "liquida" (cierre, espera) de forma perezosa cada vez que alguien la mira o
  responde: no depende de tareas programadas. Idempotente.
*/

-- ============================== Tablas ==============================
CREATE TABLE IF NOT EXISTS public.play_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 60),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),          -- 0 = domingo … 6 = sábado
  start_time time NOT NULL,
  venue text CHECK (venue IS NULL OR char_length(venue) <= 120),
  slots smallint NOT NULL DEFAULT 14 CHECK (slots BETWEEN 4 AND 40),
  price integer CHECK (price IS NULL OR price BETWEEN 0 AND 10000000),  -- valor total de la cancha
  timezone text NOT NULL DEFAULT 'America/Santiago',
  open_days_before smallint NOT NULL DEFAULT 2 CHECK (open_days_before BETWEEN 0 AND 6),
  open_time time NOT NULL DEFAULT '20:00',
  subs_days_before smallint NOT NULL DEFAULT 1 CHECK (subs_days_before BETWEEN 0 AND 6),
  subs_time time NOT NULL DEFAULT '12:00',
  close_days_before smallint NOT NULL DEFAULT 1 CHECK (close_days_before BETWEEN 0 AND 6),
  close_time time NOT NULL DEFAULT '22:00',
  fixed_mode text NOT NULL DEFAULT 'auto' CHECK (fixed_mode IN ('auto', 'confirm')),
  allow_guests boolean NOT NULL DEFAULT true,
  promote_threshold smallint NOT NULL DEFAULT 75 CHECK (promote_threshold BETWEEN 50 AND 100),
  invite_code text NOT NULL UNIQUE DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_play_groups_owner ON public.play_groups (owner_id);

CREATE TABLE IF NOT EXISTS public.play_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.play_groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 40),
  role text NOT NULL DEFAULT 'sub' CHECK (role IN ('fixed', 'sub')),
  is_admin boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  claim_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_play_members_group ON public.play_group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_play_members_user ON public.play_group_members (user_id) WHERE user_id IS NOT NULL;

-- Datos privados del organizador: posición y nivel (nunca los ven los jugadores)
CREATE TABLE IF NOT EXISTS public.play_member_private (
  member_id uuid PRIMARY KEY REFERENCES public.play_group_members(id) ON DELETE CASCADE,
  position text CHECK (position IS NULL OR position IN ('arquero', 'defensa', 'medio', 'delantero')),
  stars smallint CHECK (stars IS NULL OR stars BETWEEN 1 AND 5),
  rating numeric(7,2) NOT NULL DEFAULT 1000,
  games integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.play_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.play_groups(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  opens_at timestamptz NOT NULL,
  subs_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  venue text,
  slots smallint NOT NULL,
  price integer,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'played', 'cancelled')),
  score_a smallint CHECK (score_a IS NULL OR score_a BETWEEN 0 AND 99),
  score_b smallint CHECK (score_b IS NULL OR score_b BETWEEN 0 AND 99),
  closed_settled boolean NOT NULL DEFAULT false,
  lineup jsonb,                      -- {"<member_id>" | "g:<member_id>": "A" | "B"} (incluye invitados)
  mvp_member_id uuid REFERENCES public.play_group_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, starts_at)
);
CREATE INDEX IF NOT EXISTS idx_play_sessions_group_start ON public.play_sessions (group_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS public.play_attendance (
  session_id uuid NOT NULL REFERENCES public.play_sessions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.play_group_members(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('in', 'auto', 'out', 'wait')),   -- auto = fijo que aún no responde
  guests smallint NOT NULL DEFAULT 0 CHECK (guests BETWEEN 0 AND 1),
  paid boolean NOT NULL DEFAULT false,
  team text CHECK (team IS NULL OR team IN ('A', 'B')),
  rating_delta numeric(7,2) NOT NULL DEFAULT 0,
  queued_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_play_attendance_member ON public.play_attendance (member_id);

ALTER TABLE public.play_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_member_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_attendance ENABLE ROW LEVEL SECURITY;
-- Sin políticas: nadie lee ni escribe las tablas directo; todo pasa por las funciones de abajo.
REVOKE ALL ON public.play_groups, public.play_group_members, public.play_member_private,
              public.play_sessions, public.play_attendance FROM anon, authenticated;

-- ============================== Ayudas internas ==============================
CREATE OR REPLACE FUNCTION public.play_hash(p_token text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT encode(sha256(convert_to(COALESCE(p_token, ''), 'UTF8')), 'hex') $$;

-- ¿El usuario conectado administra el grupo?
CREATE OR REPLACE FUNCTION public.play_is_admin(p_group uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM play_groups g WHERE g.id = p_group AND g.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM play_group_members m WHERE m.group_id = p_group AND m.user_id = auth.uid() AND m.is_admin AND m.active)
  );
$$;

-- Miembro que actúa: el de la cuenta conectada, o el del token del teléfono
CREATE OR REPLACE FUNCTION public.play_actor(p_group uuid, p_token text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id FROM play_group_members m
  WHERE m.group_id = p_group AND m.active
    AND ((auth.uid() IS NOT NULL AND m.user_id = auth.uid())
         OR (p_token IS NOT NULL AND char_length(p_token) >= 32 AND m.claim_hash = play_hash(p_token)))
  ORDER BY (m.user_id = auth.uid()) DESC NULLS LAST
  LIMIT 1;
$$;

-- Asientos ocupados (cada confirmado + su invitado)
CREATE OR REPLACE FUNCTION public.play_used(p_session uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(sum(1 + guests), 0)::int FROM play_attendance WHERE session_id = p_session AND status IN ('in', 'auto') $$;

-- Semana actual (o próxima) del grupo: la crea si no existe, con los fijos adentro
CREATE OR REPLACE FUNCTION public.play_ensure_session(p_group uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  g play_groups%ROWTYPE;
  v_local timestamp;
  v_day date;
  v_start timestamptz;
  v_id uuid;
BEGIN
  SELECT * INTO g FROM play_groups WHERE id = p_group;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_local := now() AT TIME ZONE g.timezone;
  v_day := v_local::date + ((g.weekday - extract(dow FROM v_local)::int + 7) % 7);
  -- La semana sigue siendo "la actual" hasta 3 horas después del inicio
  IF (v_day + g.start_time) + interval '3 hours' < v_local THEN v_day := v_day + 7; END IF;
  v_start := (v_day + g.start_time) AT TIME ZONE g.timezone;

  SELECT id INTO v_id FROM play_sessions WHERE group_id = p_group AND starts_at = v_start;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO play_sessions (group_id, starts_at, opens_at, subs_at, closes_at, venue, slots, price)
  VALUES (p_group, v_start,
          ((v_day - g.open_days_before) + g.open_time) AT TIME ZONE g.timezone,
          ((v_day - g.subs_days_before) + g.subs_time) AT TIME ZONE g.timezone,
          ((v_day - g.close_days_before) + g.close_time) AT TIME ZONE g.timezone,
          g.venue, g.slots, g.price)
  ON CONFLICT (group_id, starts_at) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM play_sessions WHERE group_id = p_group AND starts_at = v_start;
    RETURN v_id;
  END IF;

  INSERT INTO play_attendance (session_id, member_id, status)
  SELECT v_id, m.id, 'auto' FROM play_group_members m
  WHERE m.group_id = p_group AND m.active AND m.role = 'fixed'
  ON CONFLICT DO NOTHING;
  RETURN v_id;
END;
$$;

-- Aplica las reglas de la semana: cierre de fijos sin confirmar y subida desde la espera
CREATE OR REPLACE FUNCTION public.play_settle(p_session uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s play_sessions%ROWTYPE;
  g play_groups%ROWTYPE;
  w record;
  v_free int;
BEGIN
  SELECT * INTO s FROM play_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR s.status <> 'open' THEN RETURN; END IF;
  SELECT * INTO g FROM play_groups WHERE id = s.group_id;

  IF now() >= s.closes_at AND NOT s.closed_settled THEN
    IF g.fixed_mode = 'confirm' THEN
      UPDATE play_attendance SET status = 'out', updated_at = now() WHERE session_id = p_session AND status = 'auto';
    END IF;
    UPDATE play_sessions SET closed_settled = true WHERE id = p_session;
  END IF;

  IF now() >= s.subs_at THEN
    v_free := s.slots - play_used(p_session);
    FOR w IN SELECT member_id, guests FROM play_attendance
             WHERE session_id = p_session AND status = 'wait' ORDER BY queued_at, member_id LOOP
      EXIT WHEN v_free <= 0;
      IF 1 + w.guests <= v_free THEN
        UPDATE play_attendance SET status = 'in', updated_at = now() WHERE session_id = p_session AND member_id = w.member_id;
        v_free := v_free - 1 - w.guests;
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- ============================== Lectura ==============================
-- Vista del grupo: por código de invitación (cualquiera con el link) o por id (miembros y admins)
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

-- Mis grupos (Inicio y Mis equipos): la semana de cada grupo con mi estado y, si organizo, el resumen
CREATE OR REPLACE FUNCTION public.my_play_groups()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r record;
  v_session uuid;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  FOR r IN
    SELECT DISTINCT g.id, g.name FROM play_groups g
    LEFT JOIN play_group_members m ON m.group_id = g.id AND m.user_id = v_uid AND m.active
    WHERE g.owner_id = v_uid OR m.id IS NOT NULL
    ORDER BY g.name LIMIT 20
  LOOP
    v_session := play_ensure_session(r.id);
    PERFORM play_settle(v_session);
    v_out := v_out || jsonb_build_array((
      SELECT jsonb_build_object(
        'group_id', r.id, 'name', r.name, 'is_admin', play_is_admin(r.id),
        'starts_at', s.starts_at, 'opens_at', s.opens_at, 'subs_at', s.subs_at, 'closes_at', s.closes_at,
        'fixed_mode', (SELECT fixed_mode FROM play_groups WHERE id = r.id), 'status', s.status,
        'venue', s.venue, 'slots', s.slots, 'used', play_used(s.id),
        'my_status', (SELECT a.status FROM play_attendance a JOIN play_group_members m ON m.id = a.member_id
                      WHERE a.session_id = s.id AND m.user_id = v_uid LIMIT 1),
        'my_paid', (SELECT a.paid FROM play_attendance a JOIN play_group_members m ON m.id = a.member_id
                    WHERE a.session_id = s.id AND m.user_id = v_uid LIMIT 1),
        'pending', (SELECT count(*) FROM play_attendance a WHERE a.session_id = s.id AND a.status = 'auto')::int,
        'waiting', (SELECT count(*) FROM play_attendance a WHERE a.session_id = s.id AND a.status = 'wait')::int,
        'paid', (SELECT count(*) FROM play_attendance a WHERE a.session_id = s.id AND a.paid)::int,
        'price', s.price
      ) FROM play_sessions s WHERE s.id = v_session));
  END LOOP;
  RETURN v_out;
END;
$$;

-- ============================== Grupo y plantel (organizador) ==============================
CREATE OR REPLACE FUNCTION public.play_group_create(p_name text, p_weekday int, p_start time, p_venue text, p_slots int, p_price int)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM play_groups WHERE owner_id = v_uid) >= 10 THEN
    RAISE EXCEPTION 'Puedes organizar hasta 10 grupos.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO play_groups (owner_id, name, weekday, start_time, venue, slots, price)
  VALUES (v_uid, btrim(p_name), p_weekday, p_start, NULLIF(btrim(COALESCE(p_venue, '')), ''), COALESCE(p_slots, 14), p_price)
  RETURNING id INTO v_id;
  SELECT COALESCE(NULLIF(btrim(full_name), ''), 'Organizador') INTO v_name FROM profiles WHERE id = v_uid;
  INSERT INTO play_group_members (group_id, user_id, display_name, role, is_admin)
  VALUES (v_id, v_uid, left(COALESCE(v_name, 'Organizador'), 40), 'fixed', true);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.play_group_update(p_group uuid, p_settings jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT play_is_admin(p_group) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  UPDATE play_groups SET
    name = COALESCE(btrim(p_settings->>'name'), name),
    weekday = COALESCE((p_settings->>'weekday')::smallint, weekday),
    start_time = COALESCE((p_settings->>'start_time')::time, start_time),
    venue = CASE WHEN p_settings ? 'venue' THEN NULLIF(btrim(p_settings->>'venue'), '') ELSE venue END,
    slots = COALESCE((p_settings->>'slots')::smallint, slots),
    price = CASE WHEN p_settings ? 'price' THEN (p_settings->>'price')::int ELSE price END,
    open_days_before = COALESCE((p_settings->>'open_days_before')::smallint, open_days_before),
    open_time = COALESCE((p_settings->>'open_time')::time, open_time),
    subs_days_before = COALESCE((p_settings->>'subs_days_before')::smallint, subs_days_before),
    subs_time = COALESCE((p_settings->>'subs_time')::time, subs_time),
    close_days_before = COALESCE((p_settings->>'close_days_before')::smallint, close_days_before),
    close_time = COALESCE((p_settings->>'close_time')::time, close_time),
    fixed_mode = COALESCE(p_settings->>'fixed_mode', fixed_mode),
    allow_guests = COALESCE((p_settings->>'allow_guests')::boolean, allow_guests),
    promote_threshold = COALESCE((p_settings->>'promote_threshold')::smallint, promote_threshold),
    updated_at = now()
  WHERE id = p_group;
  -- La semana en curso toma cancha, cupos y valor nuevos si aún no se juega
  UPDATE play_sessions s SET venue = g.venue, slots = g.slots, price = g.price
  FROM play_groups g WHERE g.id = p_group AND s.group_id = p_group AND s.status = 'open' AND s.starts_at > now();
END;
$$;

CREATE OR REPLACE FUNCTION public.play_member_add(p_group uuid, p_name text, p_role text DEFAULT 'sub')
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_session uuid;
BEGIN
  IF NOT play_is_admin(p_group) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM play_group_members WHERE group_id = p_group AND active) >= 80 THEN
    RAISE EXCEPTION 'El grupo llegó a 80 jugadores.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO play_group_members (group_id, display_name, role) VALUES (p_group, btrim(p_name), COALESCE(p_role, 'sub'))
  RETURNING id INTO v_id;
  IF p_role = 'fixed' THEN
    v_session := play_ensure_session(p_group);
    INSERT INTO play_attendance (session_id, member_id, status) VALUES (v_session, v_id, 'auto') ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_id;
END;
$$;

-- Cambios del organizador sobre un jugador: rol, admin, nombre, baja, posición y estrellas (privado)
CREATE OR REPLACE FUNCTION public.play_member_update(p_member uuid, p_changes jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE m play_group_members%ROWTYPE; v_session uuid;
BEGIN
  SELECT * INTO m FROM play_group_members WHERE id = p_member;
  IF NOT FOUND OR NOT play_is_admin(m.group_id) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  UPDATE play_group_members SET
    display_name = COALESCE(btrim(p_changes->>'name'), display_name),
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
      -- Sin partidos jugados, el nivel parte de las estrellas (3 = 1000, cada estrella ±100)
      rating = CASE WHEN games = 0 AND p_changes ? 'stars' AND p_changes->>'stars' IS NOT NULL
                    THEN 1000 + ((p_changes->>'stars')::int - 3) * 100 ELSE rating END,
      updated_at = now()
    WHERE member_id = p_member;
  END IF;
END;
$$;

-- ============================== Jugadores (con cuenta o con el link) ==============================
-- Entrar con el link: nuevo suplente con nombre. Devuelve el token para este teléfono (si no tiene cuenta).
CREATE OR REPLACE FUNCTION public.play_join(p_code text, p_name text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE g play_groups%ROWTYPE; v_id uuid; v_token text; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO g FROM play_groups WHERE invite_code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grupo no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_uid IS NOT NULL THEN
    SELECT id INTO v_id FROM play_group_members WHERE group_id = g.id AND user_id = v_uid;
    IF v_id IS NOT NULL THEN
      UPDATE play_group_members SET active = true WHERE id = v_id;
      RETURN jsonb_build_object('member_id', v_id);
    END IF;
  END IF;
  IF (SELECT count(*) FROM play_group_members WHERE group_id = g.id AND active) >= 80 THEN
    RAISE EXCEPTION 'El grupo llegó a 80 jugadores.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM play_group_members WHERE group_id = g.id AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Demasiados ingresos seguidos. Intenta en un rato.' USING ERRCODE = '22023';
  END IF;
  IF v_uid IS NULL THEN v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); END IF;
  INSERT INTO play_group_members (group_id, user_id, display_name, role, claim_hash)
  VALUES (g.id, v_uid, btrim(p_name), 'sub', CASE WHEN v_token IS NULL THEN NULL ELSE play_hash(v_token) END)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('member_id', v_id, 'token', v_token);
END;
$$;

-- "Soy yo": tomar un nombre del plantel que aún nadie reclamó (lo agregó el organizador)
CREATE OR REPLACE FUNCTION public.play_claim(p_code text, p_member uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE m play_group_members%ROWTYPE; v_token text; v_uid uuid := auth.uid();
BEGIN
  SELECT m2.* INTO m FROM play_group_members m2 JOIN play_groups g ON g.id = m2.group_id
  WHERE m2.id = p_member AND g.invite_code = p_code AND m2.active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF m.user_id IS NOT NULL OR m.claim_hash IS NOT NULL THEN
    RAISE EXCEPTION 'Ese nombre ya está tomado en otro teléfono. Pídele al organizador que lo libere.' USING ERRCODE = '22023';
  END IF;
  IF v_uid IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM play_group_members WHERE group_id = m.group_id AND user_id = v_uid) THEN
      RAISE EXCEPTION 'Tu cuenta ya está en este grupo con otro nombre.' USING ERRCODE = '22023';
    END IF;
    UPDATE play_group_members SET user_id = v_uid WHERE id = p_member;
    RETURN jsonb_build_object('member_id', p_member);
  END IF;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  UPDATE play_group_members SET claim_hash = play_hash(v_token) WHERE id = p_member;
  RETURN jsonb_build_object('member_id', p_member, 'token', v_token);
END;
$$;

-- Responder la semana: 'in' (voy) o 'out' (no voy), con invitado opcional.
-- El organizador puede responder por cualquiera (p_member); el jugador, solo por sí mismo.
CREATE OR REPLACE FUNCTION public.play_respond(p_session uuid, p_status text, p_guests int DEFAULT 0, p_member uuid DEFAULT NULL, p_token text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s play_sessions%ROWTYPE; g play_groups%ROWTYPE; m play_group_members%ROWTYPE;
  v_actor uuid; v_target uuid; v_guests int := LEAST(GREATEST(COALESCE(p_guests, 0), 0), 1);
  v_cur play_attendance%ROWTYPE; v_free int; v_new text;
BEGIN
  IF p_status NOT IN ('in', 'out') THEN RAISE EXCEPTION 'Respuesta no válida' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM play_sessions WHERE id = p_session;
  IF NOT FOUND THEN RAISE EXCEPTION 'Semana no encontrada' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO g FROM play_groups WHERE id = s.group_id;
  IF s.status <> 'open' OR now() > s.starts_at THEN RAISE EXCEPTION 'Esta semana ya se jugó.' USING ERRCODE = '22023'; END IF;

  v_actor := play_actor(g.id, p_token);
  v_target := COALESCE(p_member, v_actor);
  IF v_target IS NULL OR (v_target <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) AND NOT play_is_admin(g.id)) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO m FROM play_group_members WHERE id = v_target AND group_id = g.id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jugador no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_guests > 0 AND NOT g.allow_guests THEN RAISE EXCEPTION 'Este grupo no permite invitados.' USING ERRCODE = '22023'; END IF;
  IF p_status = 'in' AND now() < s.opens_at AND m.role <> 'fixed' THEN
    RAISE EXCEPTION 'La lista aún no se abre.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM play_sessions WHERE id = p_session FOR UPDATE;  -- un cupo a la vez
  SELECT * INTO v_cur FROM play_attendance WHERE session_id = p_session AND member_id = v_target;

  IF p_status = 'out' THEN
    v_new := 'out';
  ELSE
    v_free := s.slots - play_used(p_session) + CASE WHEN v_cur.status IN ('in', 'auto') THEN 1 + v_cur.guests ELSE 0 END;
    IF v_cur.status IN ('in', 'auto') THEN
      IF 1 + v_guests > v_free THEN                   -- nunca pierde su cupo por pedir invitado
        RAISE EXCEPTION 'No queda cupo para tu invitado.' USING ERRCODE = '22023';
      END IF;
      v_new := 'in';                                  -- ya tenía cupo: confirma
    ELSIF m.role = 'fixed' AND now() < s.subs_at AND 1 + v_guests <= v_free THEN
      v_new := 'in';                                  -- fijo dentro de su ventana de prioridad
    ELSIF now() >= s.subs_at AND 1 + v_guests <= v_free
          AND NOT EXISTS (SELECT 1 FROM play_attendance WHERE session_id = p_session AND status = 'wait' AND member_id <> v_target) THEN
      v_new := 'in';                                  -- hay cupo y nadie esperando antes
    ELSE
      v_new := 'wait';
    END IF;
  END IF;

  INSERT INTO play_attendance (session_id, member_id, status, guests, queued_at)
  VALUES (p_session, v_target, v_new, CASE WHEN v_new = 'out' THEN 0 ELSE v_guests END, now())
  ON CONFLICT (session_id, member_id) DO UPDATE SET
    status = EXCLUDED.status,
    guests = EXCLUDED.guests,
    queued_at = CASE WHEN EXCLUDED.status = 'wait' AND play_attendance.status <> 'wait' THEN now() ELSE play_attendance.queued_at END,
    updated_at = now();

  PERFORM play_settle(p_session);
  RETURN jsonb_build_object('status', (SELECT status FROM play_attendance WHERE session_id = p_session AND member_id = v_target));
END;
$$;

CREATE OR REPLACE FUNCTION public.play_set_paid(p_session uuid, p_paid boolean, p_member uuid DEFAULT NULL, p_token text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE s play_sessions%ROWTYPE; v_actor uuid; v_target uuid;
BEGIN
  SELECT * INTO s FROM play_sessions WHERE id = p_session;
  IF NOT FOUND THEN RAISE EXCEPTION 'Semana no encontrada' USING ERRCODE = 'P0002'; END IF;
  v_actor := play_actor(s.group_id, p_token);
  v_target := COALESCE(p_member, v_actor);
  IF v_target IS NULL OR (v_target <> COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) AND NOT play_is_admin(s.group_id)) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  UPDATE play_attendance SET paid = COALESCE(p_paid, false), updated_at = now()
  WHERE session_id = p_session AND member_id = v_target AND status IN ('in', 'auto');
  IF NOT FOUND THEN RAISE EXCEPTION 'Solo pagan los que están en la lista.' USING ERRCODE = '22023'; END IF;
END;
$$;

-- ============================== Equipos y resultado (organizador) ==============================
-- p_teams: {"<member_id>" | "g:<member_id>": "A" | "B"}; las claves g: son los invitados (solo para mostrar)
CREATE OR REPLACE FUNCTION public.play_set_teams(p_session uuid, p_teams jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE s play_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM play_sessions WHERE id = p_session;
  IF NOT FOUND OR NOT play_is_admin(s.group_id) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF p_teams IS NULL OR jsonb_typeof(p_teams) <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_teams)) > 90 THEN
    RAISE EXCEPTION 'Equipos no válidos' USING ERRCODE = '22023';
  END IF;
  UPDATE play_attendance a SET team = CASE WHEN p_teams->>a.member_id::text IN ('A', 'B') THEN p_teams->>a.member_id::text END, updated_at = now()
  WHERE a.session_id = p_session;
  UPDATE play_sessions SET lineup = (SELECT jsonb_object_agg(k, v) FROM jsonb_each_text(p_teams) e(k, v) WHERE v IN ('A', 'B'))
  WHERE id = p_session;
END;
$$;

-- Resultado de la semana: ajusta el nivel de cada jugador (tipo ranking de ajedrez, K = 32).
-- Se puede corregir: primero deshace el ajuste anterior de esa semana.
DROP FUNCTION IF EXISTS public.play_set_result(uuid, int, int);
CREATE OR REPLACE FUNCTION public.play_set_result(p_session uuid, p_score_a int, p_score_b int, p_mvp uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s play_sessions%ROWTYPE;
  v_ra numeric; v_rb numeric; v_ea numeric; v_res numeric; v_k numeric := 32; v_na int; v_nb int;
BEGIN
  SELECT * INTO s FROM play_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR NOT play_is_admin(s.group_id) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF p_score_a IS NULL OR p_score_b IS NULL OR p_score_a < 0 OR p_score_b < 0 THEN
    RAISE EXCEPTION 'Resultado no válido' USING ERRCODE = '22023';
  END IF;

  -- Deshacer el ajuste previo de esta semana
  UPDATE play_member_private p SET rating = p.rating - a.rating_delta, games = GREATEST(p.games - 1, 0)
  FROM play_attendance a WHERE a.session_id = p_session AND a.member_id = p.member_id AND a.rating_delta <> 0;
  UPDATE play_attendance SET rating_delta = 0 WHERE session_id = p_session;

  INSERT INTO play_member_private (member_id)
  SELECT member_id FROM play_attendance WHERE session_id = p_session AND team IS NOT NULL
  ON CONFLICT DO NOTHING;

  SELECT avg(p.rating), count(*) INTO v_ra, v_na FROM play_attendance a JOIN play_member_private p ON p.member_id = a.member_id
  WHERE a.session_id = p_session AND a.team = 'A' AND a.status IN ('in', 'auto');
  SELECT avg(p.rating), count(*) INTO v_rb, v_nb FROM play_attendance a JOIN play_member_private p ON p.member_id = a.member_id
  WHERE a.session_id = p_session AND a.team = 'B' AND a.status IN ('in', 'auto');

  IF v_na > 0 AND v_nb > 0 THEN
    v_ea := 1 / (1 + power(10, (v_rb - v_ra) / 400));
    v_res := CASE WHEN p_score_a > p_score_b THEN 1 WHEN p_score_a = p_score_b THEN 0.5 ELSE 0 END;
    UPDATE play_attendance a SET rating_delta = round(CASE WHEN a.team = 'A' THEN v_k * (v_res - v_ea) ELSE v_k * ((1 - v_res) - (1 - v_ea)) END, 2)
    WHERE a.session_id = p_session AND a.team IN ('A', 'B') AND a.status IN ('in', 'auto');
    -- La figura del partido (opcional) suma un poco más
    UPDATE play_attendance SET rating_delta = rating_delta + 4
    WHERE session_id = p_session AND member_id = p_mvp AND team IN ('A', 'B') AND status IN ('in', 'auto');
    UPDATE play_member_private p SET rating = p.rating + a.rating_delta, games = p.games + 1, updated_at = now()
    FROM play_attendance a WHERE a.session_id = p_session AND a.member_id = p.member_id AND a.team IN ('A', 'B') AND a.status IN ('in', 'auto');
  END IF;

  UPDATE play_sessions SET score_a = p_score_a, score_b = p_score_b, status = 'played',
    mvp_member_id = (SELECT member_id FROM play_attendance WHERE session_id = p_session AND member_id = p_mvp)
  WHERE id = p_session;
END;
$$;

-- ============================== Permisos ==============================
REVOKE ALL ON FUNCTION public.play_hash(text), public.play_is_admin(uuid), public.play_actor(uuid, text),
  public.play_used(uuid), public.play_ensure_session(uuid), public.play_settle(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.play_group_view(text, uuid, text), public.play_join(text, text), public.play_claim(text, uuid),
  public.play_respond(uuid, text, int, uuid, text), public.play_set_paid(uuid, boolean, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.play_group_view(text, uuid, text), public.play_join(text, text), public.play_claim(text, uuid),
  public.play_respond(uuid, text, int, uuid, text), public.play_set_paid(uuid, boolean, uuid, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.my_play_groups(), public.play_group_create(text, int, time, text, int, int),
  public.play_group_update(uuid, jsonb), public.play_member_add(uuid, text, text), public.play_member_update(uuid, jsonb),
  public.play_set_teams(uuid, jsonb), public.play_set_result(uuid, int, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_play_groups(), public.play_group_create(text, int, time, text, int, int),
  public.play_group_update(uuid, jsonb), public.play_member_add(uuid, text, text), public.play_member_update(uuid, jsonb),
  public.play_set_teams(uuid, jsonb), public.play_set_result(uuid, int, int, uuid) TO authenticated;
