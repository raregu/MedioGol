/*
  # Caja de los grupos fijos: cuota por jugador, cancha y fondo común

  Antes el grupo dividía el valor de la cancha entre los cupos. Ahora se separan:
    - fee (cuota por partido): lo que paga cada jugador; guest_fee: lo que paga un invitado (null = igual a fee).
    - price (costo de la cancha): lo que paga el grupo cada semana.
  La diferencia queda en la caja del grupo (pelotas, asados, petos…).

  Caja = cuotas pagadas de las semanas ya empezadas − cancha de esas semanas + ingresos manuales − gastos manuales.
  Entran a la caja solo las semanas con cuota (fee no nulo): las anteriores a esta migración no generan
  deudas ni movimientos retroactivos. La semana en curso y las próximas toman la cuota del grupo.
  Deudas: quien estuvo en la lista de una semana ya empezada y no pagó queda debiendo hasta que pague.
  Todos los del grupo ven la caja y las deudas; solo el organizador registra, anula y salda.
  Nada se borra: los movimientos se anulan con motivo. Boletas en el bucket privado play-receipts/<group_id>/.
  Idempotente.
*/

-- ============================== Columnas y tablas ==============================
ALTER TABLE public.play_groups ADD COLUMN IF NOT EXISTS fee integer;
ALTER TABLE public.play_groups ADD COLUMN IF NOT EXISTS guest_fee integer;
ALTER TABLE public.play_sessions ADD COLUMN IF NOT EXISTS fee integer;
ALTER TABLE public.play_sessions ADD COLUMN IF NOT EXISTS guest_fee integer;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'play_groups_fee_chk') THEN
    ALTER TABLE public.play_groups ADD CONSTRAINT play_groups_fee_chk
      CHECK ((fee IS NULL OR fee BETWEEN 0 AND 1000000) AND (guest_fee IS NULL OR guest_fee BETWEEN 0 AND 1000000));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'play_sessions_fee_chk') THEN
    ALTER TABLE public.play_sessions ADD CONSTRAINT play_sessions_fee_chk
      CHECK ((fee IS NULL OR fee BETWEEN 0 AND 1000000) AND (guest_fee IS NULL OR guest_fee BETWEEN 0 AND 1000000));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.play_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.play_groups(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('in', 'out')),
  category text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  occurred_on date NOT NULL CHECK (occurred_on >= DATE '2020-01-01'),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 120),
  receipt_path text CHECK (receipt_path IS NULL OR char_length(receipt_path) <= 300),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  void_reason text CHECK (void_reason IS NULL OR char_length(void_reason) <= 200),
  voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT play_cash_category_kind CHECK (
    (kind = 'in' AND category IN ('opening', 'contribution', 'fine', 'other_in'))
    OR (kind = 'out' AND category IN ('balls', 'bbq', 'bibs', 'referee', 'field', 'other_out'))
  )
);
CREATE INDEX IF NOT EXISTS idx_play_cash_group_day ON public.play_cash_movements (group_id, occurred_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_sessions_cash ON public.play_sessions (group_id, starts_at) WHERE fee IS NOT NULL AND status <> 'cancelled';
ALTER TABLE public.play_cash_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.play_cash_movements FROM anon, authenticated;

-- Cuota inicial de los grupos que ya existen: la misma que se cobraba (cancha / cupos, redondeado a $100)
UPDATE public.play_groups SET fee = (ceil(price::numeric / slots / 100) * 100)::int
WHERE fee IS NULL AND price IS NOT NULL AND price > 0 AND slots > 0;
-- La semana en curso y las próximas toman la cuota (las pasadas quedan fuera de la caja)
UPDATE public.play_sessions s SET fee = g.fee, guest_fee = g.guest_fee
FROM public.play_groups g
WHERE s.group_id = g.id AND s.fee IS NULL AND g.fee IS NOT NULL AND s.status = 'open' AND s.starts_at > now() - interval '3 hours';

-- Grupos nuevos sin cuota: parte con cancha / cupos. Semanas nuevas: copian la cuota del grupo.
CREATE OR REPLACE FUNCTION public.play_groups_default_fee()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.fee IS NULL AND NEW.price IS NOT NULL AND NEW.price > 0 AND NEW.slots > 0 THEN
    NEW.fee := (ceil(NEW.price::numeric / NEW.slots / 100) * 100)::int;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_play_groups_default_fee ON public.play_groups;
CREATE TRIGGER trg_play_groups_default_fee BEFORE INSERT ON public.play_groups
  FOR EACH ROW EXECUTE FUNCTION public.play_groups_default_fee();

CREATE OR REPLACE FUNCTION public.play_sessions_copy_fee()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.fee IS NULL THEN
    SELECT g.fee, g.guest_fee INTO NEW.fee, NEW.guest_fee FROM play_groups g WHERE g.id = NEW.group_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_play_sessions_copy_fee ON public.play_sessions;
CREATE TRIGGER trg_play_sessions_copy_fee BEFORE INSERT ON public.play_sessions
  FOR EACH ROW EXECUTE FUNCTION public.play_sessions_copy_fee();

-- ============================== Cálculo ==============================
-- Semanas que cuentan para la caja: con cuota, no canceladas y ya empezadas
CREATE OR REPLACE FUNCTION public.play_cash_sessions(p_group uuid)
RETURNS TABLE (session_id uuid, starts_at timestamptz, fee integer, guest_fee integer, cost integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.starts_at, s.fee, COALESCE(s.guest_fee, s.fee), COALESCE(s.price, 0)
  FROM play_sessions s
  WHERE s.group_id = p_group AND s.fee IS NOT NULL AND s.status <> 'cancelled' AND s.starts_at <= now();
$$;

-- Saldo y deudas (lo ven todos los del grupo)
CREATE OR REPLACE FUNCTION public.play_cash_summary(p_group uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH cs AS (SELECT * FROM play_cash_sessions(p_group)),
  att AS (
    SELECT a.member_id, a.paid, cs.session_id, cs.starts_at, (cs.fee + a.guests * cs.guest_fee) AS owed
    FROM cs JOIN play_attendance a ON a.session_id = cs.session_id AND a.status IN ('in', 'auto')
  ),
  man AS (
    SELECT COALESCE(sum(amount) FILTER (WHERE kind = 'in'), 0) AS m_in, COALESCE(sum(amount) FILTER (WHERE kind = 'out'), 0) AS m_out
    FROM play_cash_movements WHERE group_id = p_group AND status = 'active'
  )
  SELECT jsonb_build_object(
    'collected', (SELECT COALESCE(sum(owed) FILTER (WHERE paid), 0) FROM att),
    'field', (SELECT COALESCE(sum(cost), 0) FROM cs),
    'manual_in', (SELECT m_in FROM man),
    'manual_out', (SELECT m_out FROM man),
    'balance', (SELECT COALESCE(sum(owed) FILTER (WHERE paid), 0) FROM att) - (SELECT COALESCE(sum(cost), 0) FROM cs)
               + (SELECT m_in - m_out FROM man),
    'debts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('member_id', d.member_id, 'name', m.display_name, 'amount', d.amount, 'count', d.n, 'since', d.since) ORDER BY d.amount DESC, lower(m.display_name))
      FROM (SELECT member_id, sum(owed) AS amount, count(*) AS n, min(starts_at) AS since FROM att WHERE NOT paid AND owed > 0 GROUP BY member_id) d
      JOIN play_group_members m ON m.id = d.member_id
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.play_cash_sessions(uuid), public.play_cash_summary(uuid) FROM PUBLIC, anon, authenticated;

-- ============================== Lectura ==============================
-- Caja completa: resumen, semanas (cuotas y cancha) y movimientos manuales. Miembros y organizador.
CREATE OR REPLACE FUNCTION public.play_cash_view(p_group uuid, p_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_admin boolean := play_is_admin(p_group);
BEGIN
  IF NOT v_admin AND play_actor(p_group, p_token) IS NULL THEN
    RAISE EXCEPTION 'No perteneces a este grupo' USING ERRCODE = '42501';
  END IF;
  RETURN play_cash_summary(p_group) || jsonb_build_object(
    'can_edit', v_admin,
    'weeks', COALESCE((
      SELECT jsonb_agg(w ORDER BY w->>'starts_at' DESC) FROM (
        SELECT jsonb_build_object(
          'session_id', cs.session_id, 'starts_at', cs.starts_at, 'fee', cs.fee, 'cost', cs.cost,
          'players', count(a.member_id), 'paid', count(a.member_id) FILTER (WHERE a.paid),
          'collected', COALESCE(sum(cs.fee + a.guests * cs.guest_fee) FILTER (WHERE a.paid), 0)
        ) AS w
        FROM (SELECT * FROM play_cash_sessions(p_group) ORDER BY starts_at DESC LIMIT 104) cs
        LEFT JOIN play_attendance a ON a.session_id = cs.session_id AND a.status IN ('in', 'auto')
        GROUP BY cs.session_id, cs.starts_at, cs.fee, cs.cost
      ) x
    ), '[]'::jsonb),
    'movements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'category', c.category, 'amount', c.amount, 'occurred_on', c.occurred_on,
        'description', c.description, 'has_receipt', c.receipt_path IS NOT NULL, 'status', c.status, 'void_reason', c.void_reason
      ) ORDER BY c.occurred_on DESC, c.created_at DESC)
      FROM (SELECT * FROM play_cash_movements WHERE group_id = p_group ORDER BY occurred_on DESC, created_at DESC LIMIT 300) c
    ), '[]'::jsonb)
  );
END;
$$;

-- Ruta de la boleta (para firmar la URL): organizador o miembro con cuenta
CREATE OR REPLACE FUNCTION public.play_cash_receipt(p_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_group uuid; v_path text;
BEGIN
  SELECT group_id, receipt_path INTO v_group, v_path FROM play_cash_movements WHERE id = p_id;
  IF v_group IS NULL OR NOT public.can_access_play_receipt(v_group::text || '/x') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN v_path;
END;
$$;

-- ============================== Escritura (organizador) ==============================
CREATE OR REPLACE FUNCTION public.play_group_set_fees(p_group uuid, p_fee integer, p_guest_fee integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT play_is_admin(p_group) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF (p_fee IS NOT NULL AND p_fee NOT BETWEEN 0 AND 1000000) OR (p_guest_fee IS NOT NULL AND p_guest_fee NOT BETWEEN 0 AND 1000000) THEN
    RAISE EXCEPTION 'Revisa los montos' USING ERRCODE = '22023';
  END IF;
  UPDATE play_groups SET fee = p_fee, guest_fee = p_guest_fee, updated_at = now() WHERE id = p_group;
  -- La semana que aún no empieza toma la cuota nueva
  UPDATE play_sessions SET fee = p_fee, guest_fee = p_guest_fee
  WHERE group_id = p_group AND status = 'open' AND starts_at > now();
END;
$$;

-- Corregir la cancha o la cuota de una semana (ej. cancha gratis, o se jugó en otra)
CREATE OR REPLACE FUNCTION public.play_session_set_money(p_session uuid, p_cost integer, p_fee integer)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_group uuid;
BEGIN
  SELECT group_id INTO v_group FROM play_sessions WHERE id = p_session;
  IF v_group IS NULL OR NOT play_is_admin(v_group) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF (p_cost IS NOT NULL AND p_cost NOT BETWEEN 0 AND 10000000) OR (p_fee IS NOT NULL AND p_fee NOT BETWEEN 0 AND 1000000) THEN
    RAISE EXCEPTION 'Revisa los montos' USING ERRCODE = '22023';
  END IF;
  UPDATE play_sessions SET price = p_cost, fee = p_fee WHERE id = p_session;
END;
$$;

-- El jugador pagó todo lo que debía (marca pagadas sus semanas pendientes)
CREATE OR REPLACE FUNCTION public.play_settle_debts(p_group uuid, p_member uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT play_is_admin(p_group) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  UPDATE play_attendance a SET paid = true, updated_at = now()
  FROM play_cash_sessions(p_group) cs
  JOIN play_group_members m ON m.id = p_member AND m.group_id = p_group
  WHERE a.session_id = cs.session_id AND a.member_id = p_member AND a.status IN ('in', 'auto') AND NOT a.paid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.play_cash_add(
  p_group uuid, p_kind text, p_category text, p_amount integer, p_day date, p_description text, p_receipt_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT play_is_admin(p_group) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN
    RAISE EXCEPTION 'Ingresa un monto válido' USING ERRCODE = '22023';
  END IF;
  IF p_day IS NULL OR p_day > (now() AT TIME ZONE 'America/Santiago')::date OR p_day < DATE '2020-01-01' THEN
    RAISE EXCEPTION 'La fecha no puede ser futura' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_description, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Escribe una descripción (máximo 120 caracteres)' USING ERRCODE = '22023';
  END IF;
  IF p_receipt_path IS NOT NULL AND p_receipt_path NOT LIKE p_group::text || '/%' THEN
    RAISE EXCEPTION 'Boleta no válida' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM play_cash_movements WHERE group_id = p_group AND created_at > now() - interval '1 day') >= 100 THEN
    RAISE EXCEPTION 'Llegaste al máximo de movimientos por día' USING ERRCODE = '22023';
  END IF;
  INSERT INTO play_cash_movements (group_id, kind, category, amount, occurred_on, description, receipt_path, created_by)
  VALUES (p_group, p_kind, p_category, p_amount, p_day, btrim(p_description), p_receipt_path, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'Revisa el tipo y la categoría' USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION public.play_cash_void(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_group uuid;
BEGIN
  SELECT group_id INTO v_group FROM play_cash_movements WHERE id = p_id AND status = 'active' FOR UPDATE;
  IF v_group IS NULL THEN RAISE EXCEPTION 'El movimiento no existe o ya está anulado' USING ERRCODE = 'P0002'; END IF;
  IF NOT play_is_admin(v_group) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'Escribe el motivo de la anulación' USING ERRCODE = '22023';
  END IF;
  UPDATE play_cash_movements SET status = 'void', void_reason = btrim(p_reason), voided_by = auth.uid(), voided_at = now() WHERE id = p_id;
END;
$$;

-- ============================== Boletas ==============================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('play-receipts', 'play-receipts', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Ver: organizador o miembro con cuenta. Subir: solo organizador.
CREATE OR REPLACE FUNCTION public.can_access_play_receipt(p_name text, p_write boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_group uuid;
BEGIN
  IF auth.uid() IS NULL OR split_part(p_name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_group := split_part(p_name, '/', 1)::uuid;
  IF play_is_admin(v_group) THEN RETURN true; END IF;
  RETURN NOT p_write AND EXISTS (SELECT 1 FROM play_group_members m WHERE m.group_id = v_group AND m.user_id = auth.uid() AND m.active);
END;
$$;

DROP POLICY IF EXISTS "Grupo sube boletas" ON storage.objects;
CREATE POLICY "Grupo sube boletas" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'play-receipts' AND public.can_access_play_receipt(name, true));
DROP POLICY IF EXISTS "Grupo ve boletas" ON storage.objects;
CREATE POLICY "Grupo ve boletas" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'play-receipts' AND public.can_access_play_receipt(name, false));

-- ============================== Vista del grupo (agrega cuota y caja) ==============================
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
      'venue', g.venue, 'slots', g.slots, 'price', g.price, 'fee', g.fee, 'guest_fee', g.guest_fee, 'fixed_mode', g.fixed_mode,
      'allow_guests', g.allow_guests, 'invite_code', g.invite_code,
      'open_days_before', g.open_days_before, 'open_time', to_char(g.open_time, 'HH24:MI'),
      'subs_days_before', g.subs_days_before, 'subs_time', to_char(g.subs_time, 'HH24:MI'),
      'close_days_before', g.close_days_before, 'close_time', to_char(g.close_time, 'HH24:MI'),
      'promote_threshold', g.promote_threshold
    ),
    'session', jsonb_build_object(
      'id', s.id, 'starts_at', s.starts_at, 'opens_at', s.opens_at, 'subs_at', s.subs_at, 'closes_at', s.closes_at,
      'venue', s.venue, 'slots', s.slots, 'price', s.price, 'fee', s.fee, 'guest_fee', s.guest_fee, 'status', s.status, 'score_a', s.score_a, 'score_b', s.score_b,
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

  -- Caja del grupo (saldo y deudas): la ven todos los del grupo
  IF v_me IS NOT NULL OR v_admin THEN
    v_result := v_result || jsonb_build_object('cash', play_cash_summary(g.id));
  END IF;

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


-- ============================== Permisos ==============================
REVOKE ALL ON FUNCTION public.play_cash_view(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.play_cash_view(uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.play_cash_receipt(uuid), public.play_group_set_fees(uuid, integer, integer),
  public.play_session_set_money(uuid, integer, integer), public.play_settle_debts(uuid, uuid),
  public.play_cash_add(uuid, text, text, integer, date, text, text), public.play_cash_void(uuid, text),
  public.can_access_play_receipt(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.play_cash_receipt(uuid), public.play_group_set_fees(uuid, integer, integer),
  public.play_session_set_money(uuid, integer, integer), public.play_settle_debts(uuid, uuid),
  public.play_cash_add(uuid, text, text, integer, date, text, text), public.play_cash_void(uuid, text),
  public.can_access_play_receipt(text, boolean) TO authenticated;
