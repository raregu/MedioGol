/*
  Tesorería interna del equipo (equipo base / club).

  - Cobros a jugadores (cuota de temporada en N cuotas, u otros), opcionalmente asociados a un
    campeonato. El arbitraje va incluido en la cuota (no se reparte aparte).
  - Pagos de jugadores registrados por quien administra la tesorería. Se descuentan primero de lo
    que vence antes (FIFO). Nada se borra: se anula con motivo.
  - Caja: recaudado − pagado a campeonatos (team_payments aprobados) − otros gastos.
  - Administran: dueño del equipo, capitán (base_team_players.role = 'captain') y tesoreros
    nombrados por ellos (cualquier jugador activo del plantel).
  - Cada jugador ve SOLO su propio estado de cuenta. Los gastos y la caja solo los ve quien administra.

  Requiere 20261015120000_championship_payments.sql (cl_today, team_payments). Idempotente.
*/

-- =====================================================================
-- Tablas
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.team_treasurers (
  base_team_id uuid NOT NULL REFERENCES public.base_teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (base_team_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.treasury_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_team_id uuid NOT NULL REFERENCES public.base_teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  installment integer NOT NULL DEFAULT 1 CHECK (installment BETWEEN 1 AND 12),
  installments integer NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 12),
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  due_date date NOT NULL,
  championship_id uuid REFERENCES public.championships(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  void_reason text CHECK (void_reason IS NULL OR char_length(void_reason) <= 300),
  voided_by uuid REFERENCES public.profiles(id),
  voided_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.treasury_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_team_id uuid NOT NULL REFERENCES public.base_teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  paid_on date NOT NULL,
  method text NOT NULL CHECK (method IN ('cash', 'transfer', 'other')),
  reference text CHECK (reference IS NULL OR char_length(reference) <= 120),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'void')),
  void_reason text CHECK (void_reason IS NULL OR char_length(void_reason) <= 300),
  voided_by uuid REFERENCES public.profiles(id),
  voided_at timestamptz,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.treasury_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_team_id uuid NOT NULL REFERENCES public.base_teams(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  spent_on date NOT NULL,
  category text NOT NULL CHECK (category IN ('equipment', 'field', 'referee', 'social', 'other')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 2 AND 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  void_reason text CHECK (void_reason IS NULL OR char_length(void_reason) <= 300),
  voided_by uuid REFERENCES public.profiles(id),
  voided_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_charges_player ON public.treasury_charges (base_team_id, player_id, due_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_treasury_charges_batch ON public.treasury_charges (batch_id);
CREATE INDEX IF NOT EXISTS idx_treasury_payments_player ON public.treasury_payments (base_team_id, player_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_expenses_team ON public.treasury_expenses (base_team_id, spent_on DESC);
CREATE INDEX IF NOT EXISTS idx_teams_base_team ON public.teams (base_team_id);

-- =====================================================================
-- Permisos
-- =====================================================================
-- Rol del usuario actual en la tesorería: owner | captain | treasurer | player | NULL
CREATE OR REPLACE FUNCTION public.treasury_role(p_base_team_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM base_teams b WHERE b.id = p_base_team_id AND b.owner_id = auth.uid()) THEN 'owner'
    WHEN EXISTS (SELECT 1 FROM base_team_players x
                 WHERE x.base_team_id = p_base_team_id AND x.player_id = auth.uid()
                   AND x.status = 'active' AND x.role = 'captain') THEN 'captain'
    WHEN EXISTS (SELECT 1 FROM team_treasurers t
                 JOIN base_team_players x ON x.base_team_id = t.base_team_id AND x.player_id = t.player_id AND x.status = 'active'
                 WHERE t.base_team_id = p_base_team_id AND t.player_id = auth.uid()) THEN 'treasurer'
    WHEN EXISTS (SELECT 1 FROM base_team_players x
                 WHERE x.base_team_id = p_base_team_id AND x.player_id = auth.uid()) THEN 'player'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_treasury(p_base_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(public.treasury_role(p_base_team_id) IN ('owner', 'captain', 'treasurer'), false) $$;

REVOKE ALL ON FUNCTION public.treasury_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_treasury(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.treasury_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_treasury(uuid) TO authenticated;

-- =====================================================================
-- RLS: el jugador ve lo suyo; quien administra ve todo. Escrituras solo por RPC.
-- =====================================================================
ALTER TABLE public.team_treasurers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_treasurers, public.treasury_charges, public.treasury_payments, public.treasury_expenses FROM anon, authenticated;
GRANT SELECT ON public.team_treasurers, public.treasury_charges, public.treasury_payments, public.treasury_expenses TO authenticated;

DROP POLICY IF EXISTS "Tesorería o el propio tesorero" ON public.team_treasurers;
CREATE POLICY "Tesorería o el propio tesorero" ON public.team_treasurers FOR SELECT TO authenticated
  USING (player_id = auth.uid() OR public.can_manage_treasury(base_team_id));
DROP POLICY IF EXISTS "Tesorería o el propio jugador ven cobros" ON public.treasury_charges;
CREATE POLICY "Tesorería o el propio jugador ven cobros" ON public.treasury_charges FOR SELECT TO authenticated
  USING (player_id = auth.uid() OR public.can_manage_treasury(base_team_id));
DROP POLICY IF EXISTS "Tesorería o el propio jugador ven pagos" ON public.treasury_payments;
CREATE POLICY "Tesorería o el propio jugador ven pagos" ON public.treasury_payments FOR SELECT TO authenticated
  USING (player_id = auth.uid() OR public.can_manage_treasury(base_team_id));
DROP POLICY IF EXISTS "Solo tesorería ve gastos" ON public.treasury_expenses;
CREATE POLICY "Solo tesorería ve gastos" ON public.treasury_expenses FOR SELECT TO authenticated
  USING (public.can_manage_treasury(base_team_id));

-- =====================================================================
-- Acciones
-- =====================================================================
CREATE OR REPLACE FUNCTION public.treasury_assert_manage(p_base_team_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_treasury(p_base_team_id) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.treasury_assert_manage(uuid) FROM PUBLIC, anon, authenticated;

-- Nuevo cobro para varios jugadores (NULL = todo el plantel activo), en N cuotas.
CREATE OR REPLACE FUNCTION public.create_treasury_charge(
  p_base_team_id uuid, p_title text, p_amount bigint, p_installments integer,
  p_first_due date, p_interval_days integer, p_player_ids uuid[] DEFAULT NULL, p_championship_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_players uuid[];
  v_batch uuid := gen_random_uuid();
  v_base bigint;
  v_n integer := COALESCE(p_installments, 1);
BEGIN
  PERFORM public.treasury_assert_manage(p_base_team_id);
  IF char_length(btrim(COALESCE(p_title, ''))) < 2 THEN
    RAISE EXCEPTION 'Escribe un nombre para el cobro' USING ERRCODE = '22023';
  END IF;
  IF v_n NOT BETWEEN 1 AND 12 OR COALESCE(p_interval_days, 30) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Cuotas o intervalo inválidos' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount < v_n OR p_amount > 10000000 THEN
    RAISE EXCEPTION 'Monto inválido' USING ERRCODE = '22023';
  END IF;
  IF p_championship_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM teams t WHERE t.championship_id = p_championship_id AND t.base_team_id = p_base_team_id
  ) THEN
    RAISE EXCEPTION 'El equipo no participa en ese campeonato' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT x.player_id) INTO v_players
  FROM base_team_players x
  WHERE x.base_team_id = p_base_team_id AND x.status = 'active'
    AND (p_player_ids IS NULL OR x.player_id = ANY (p_player_ids));
  IF v_players IS NULL THEN
    RAISE EXCEPTION 'Elige al menos un jugador del plantel' USING ERRCODE = '22023';
  END IF;

  v_base := p_amount / v_n;
  INSERT INTO treasury_charges (base_team_id, player_id, batch_id, title, installment, installments, amount, due_date, championship_id, created_by)
  SELECT p_base_team_id, pl, v_batch, btrim(p_title), n, v_n,
         CASE WHEN n = v_n THEN p_amount - v_base * (v_n - 1) ELSE v_base END,
         COALESCE(p_first_due, public.cl_today()) + (n - 1) * COALESCE(p_interval_days, 30),
         p_championship_id, auth.uid()
  FROM unnest(v_players) pl CROSS JOIN generate_series(1, v_n) n;

  RETURN array_length(v_players, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_treasury_charge(p_charge_id uuid, p_reason text, p_whole_batch boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c treasury_charges%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO c FROM treasury_charges WHERE id = p_charge_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobro no encontrado' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.treasury_assert_manage(c.base_team_id);
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Indica el motivo de la anulación' USING ERRCODE = '22023';
  END IF;
  UPDATE treasury_charges
  SET status = 'void', void_reason = left(btrim(p_reason), 300), voided_by = auth.uid(), voided_at = now()
  WHERE status = 'active' AND (id = p_charge_id OR (p_whole_batch AND batch_id = c.batch_id));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_treasury_payment(
  p_base_team_id uuid, p_player_id uuid, p_amount bigint, p_paid_on date, p_method text,
  p_reference text DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.treasury_assert_manage(p_base_team_id);
  IF NOT EXISTS (SELECT 1 FROM base_team_players x WHERE x.base_team_id = p_base_team_id AND x.player_id = p_player_id) THEN
    RAISE EXCEPTION 'El jugador no es del plantel' USING ERRCODE = '22023';
  END IF;
  IF p_method NOT IN ('cash', 'transfer', 'other') THEN
    RAISE EXCEPTION 'Medio de pago inválido' USING ERRCODE = '22023';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on > public.cl_today() + 1 OR p_paid_on < DATE '2020-01-01' THEN
    RAISE EXCEPTION 'Fecha de pago inválida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO treasury_payments (base_team_id, player_id, amount, paid_on, method, reference, note, recorded_by)
  VALUES (p_base_team_id, p_player_id, p_amount, p_paid_on, p_method,
          NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_note), ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_treasury_payment(p_payment_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_team uuid;
BEGIN
  SELECT base_team_id INTO v_team FROM treasury_payments WHERE id = p_payment_id AND status = 'approved' FOR UPDATE;
  IF v_team IS NULL THEN RAISE EXCEPTION 'Pago no encontrado o ya anulado' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.treasury_assert_manage(v_team);
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Indica el motivo de la anulación' USING ERRCODE = '22023';
  END IF;
  UPDATE treasury_payments
  SET status = 'void', void_reason = left(btrim(p_reason), 300), voided_by = auth.uid(), voided_at = now()
  WHERE id = p_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_treasury_expense(
  p_base_team_id uuid, p_amount bigint, p_spent_on date, p_category text, p_description text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.treasury_assert_manage(p_base_team_id);
  IF p_spent_on IS NULL OR p_spent_on > public.cl_today() + 1 OR p_spent_on < DATE '2020-01-01' THEN
    RAISE EXCEPTION 'Fecha inválida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO treasury_expenses (base_team_id, amount, spent_on, category, description, created_by)
  VALUES (p_base_team_id, p_amount, p_spent_on, p_category, btrim(p_description), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_treasury_expense(p_expense_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_team uuid;
BEGIN
  SELECT base_team_id INTO v_team FROM treasury_expenses WHERE id = p_expense_id AND status = 'active' FOR UPDATE;
  IF v_team IS NULL THEN RAISE EXCEPTION 'Gasto no encontrado o ya anulado' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.treasury_assert_manage(v_team);
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Indica el motivo de la anulación' USING ERRCODE = '22023';
  END IF;
  UPDATE treasury_expenses
  SET status = 'void', void_reason = left(btrim(p_reason), 300), voided_by = auth.uid(), voided_at = now()
  WHERE id = p_expense_id;
END;
$$;

-- Nombrar o quitar tesorero: solo dueño o capitán. Debe ser jugador activo del plantel.
CREATE OR REPLACE FUNCTION public.set_team_treasurer(p_base_team_id uuid, p_player_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.treasury_role(p_base_team_id), '') NOT IN ('owner', 'captain') THEN
    RAISE EXCEPTION 'Solo el dueño o el capitán pueden nombrar tesoreros' USING ERRCODE = '42501';
  END IF;
  IF p_enabled THEN
    IF NOT EXISTS (SELECT 1 FROM base_team_players x
                   WHERE x.base_team_id = p_base_team_id AND x.player_id = p_player_id AND x.status = 'active') THEN
      RAISE EXCEPTION 'El tesorero debe ser un jugador activo del plantel' USING ERRCODE = '22023';
    END IF;
    INSERT INTO team_treasurers (base_team_id, player_id, added_by)
    VALUES (p_base_team_id, p_player_id, auth.uid())
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM team_treasurers WHERE base_team_id = p_base_team_id AND player_id = p_player_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_treasury_charge(uuid, text, bigint, integer, date, integer, uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_treasury_charge(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_treasury_payment(uuid, uuid, bigint, date, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_treasury_payment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_treasury_expense(uuid, bigint, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_treasury_expense(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_team_treasurer(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_treasury_charge(uuid, text, bigint, integer, date, integer, uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_treasury_charge(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_treasury_payment(uuid, uuid, bigint, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_treasury_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_treasury_expense(uuid, bigint, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_treasury_expense(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_treasurer(uuid, uuid, boolean) TO authenticated;

-- =====================================================================
-- Consultas
-- =====================================================================

-- Panel de tesorería (quien administra): plantel con saldos, cobros, caja y movimientos.
CREATE OR REPLACE FUNCTION public.treasury_overview(p_base_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.treasury_role(p_base_team_id);
  v_today date := public.cl_today();
  v_result jsonb;
BEGIN
  IF v_role NOT IN ('owner', 'captain', 'treasurer') OR v_role IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  WITH roster AS (
    -- Plantel activo + quien tenga movimientos aunque ya no esté
    SELECT x.player_id, bool_or(x.status = 'active') AS active, max(x.role) FILTER (WHERE x.status = 'active') AS role
    FROM base_team_players x WHERE x.base_team_id = p_base_team_id
    GROUP BY x.player_id
  ), ch AS (
    SELECT player_id, sum(amount) AS charged, sum(amount) FILTER (WHERE due_date < v_today) AS due_past
    FROM treasury_charges WHERE base_team_id = p_base_team_id AND status = 'active'
    GROUP BY player_id
  ), py AS (
    SELECT player_id, sum(amount) AS paid, max(paid_on) AS last_paid
    FROM treasury_payments WHERE base_team_id = p_base_team_id AND status = 'approved'
    GROUP BY player_id
  ), players AS (
    SELECT r.player_id, COALESCE(pp.full_name, 'Jugador') AS name, r.active, r.role,
           EXISTS (SELECT 1 FROM team_treasurers t WHERE t.base_team_id = p_base_team_id AND t.player_id = r.player_id) AS treasurer,
           COALESCE(ch.charged, 0) AS charged, COALESCE(py.paid, 0) AS paid,
           COALESCE(ch.charged, 0) - COALESCE(py.paid, 0) AS balance,
           GREATEST(0, COALESCE(ch.due_past, 0) - COALESCE(py.paid, 0)) AS overdue,
           py.last_paid
    FROM roster r
    LEFT JOIN player_profiles pp ON pp.id = r.player_id
    LEFT JOIN ch ON ch.player_id = r.player_id
    LEFT JOIN py ON py.player_id = r.player_id
    WHERE r.active OR ch.charged IS NOT NULL OR py.paid IS NOT NULL
  )
  SELECT jsonb_build_object(
    'team', (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM base_teams b WHERE b.id = p_base_team_id),
    'role', v_role,
    'today', v_today,
    'players', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.overdue DESC, p.balance DESC, p.name) FROM players p), '[]'::jsonb),
    'totals', jsonb_build_object(
      'charged', COALESCE((SELECT sum(charged) FROM players), 0),
      'collected', COALESCE((SELECT sum(paid) FROM players), 0),
      'to_collect', COALESCE((SELECT sum(GREATEST(balance, 0)) FROM players), 0),
      'overdue', COALESCE((SELECT sum(overdue) FROM players), 0),
      'debtors', (SELECT count(*) FROM players WHERE overdue > 0)
    )
  ) INTO v_result;

  -- Cobros agrupados (lo creado de una vez para varios jugadores)
  SELECT v_result || jsonb_build_object('batches', COALESCE(jsonb_agg(b ORDER BY b->>'created_at' DESC), '[]'::jsonb))
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'batch_id', c.batch_id, 'title', min(c.title), 'installments', max(c.installments),
      'players', count(DISTINCT c.player_id) FILTER (WHERE c.status = 'active'),
      'per_player', max(per.total),
      'total', COALESCE(sum(c.amount) FILTER (WHERE c.status = 'active'), 0),
      'first_due', min(c.due_date), 'any_charge_id', (array_agg(c.id ORDER BY c.status = 'active' DESC, c.created_at))[1],
      'active', bool_or(c.status = 'active'),
      'championship', min(chp.name), 'created_at', min(c.created_at)
    ) AS b
    FROM treasury_charges c
    LEFT JOIN championships chp ON chp.id = c.championship_id
    LEFT JOIN LATERAL (
      SELECT sum(c2.amount) AS total FROM treasury_charges c2 WHERE c2.batch_id = c.batch_id AND c2.player_id = c.player_id
    ) per ON true
    WHERE c.base_team_id = p_base_team_id
    GROUP BY c.batch_id
    ORDER BY min(c.created_at) DESC
    LIMIT 100
  ) q;

  -- Caja
  SELECT v_result || jsonb_build_object('cash', jsonb_build_object(
    'collected', COALESCE((SELECT sum(amount) FROM treasury_payments WHERE base_team_id = p_base_team_id AND status = 'approved'), 0),
    'expenses', COALESCE((SELECT sum(amount) FROM treasury_expenses WHERE base_team_id = p_base_team_id AND status = 'active'), 0),
    'championships', COALESCE((SELECT sum(tp.amount) FROM team_payments tp JOIN teams t ON t.id = tp.team_id
                                WHERE t.base_team_id = p_base_team_id AND tp.status = 'approved'), 0)
  )) INTO v_result;

  SELECT v_result || jsonb_build_object('expenses', COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.spent_on DESC, e.created_at DESC), '[]'::jsonb))
  INTO v_result
  FROM (
    SELECT id, amount, spent_on, category, description, status, void_reason, created_at
    FROM treasury_expenses WHERE base_team_id = p_base_team_id
    ORDER BY spent_on DESC, created_at DESC LIMIT 200
  ) e;

  SELECT v_result || jsonb_build_object('championship_payments', COALESCE(jsonb_agg(to_jsonb(cp) ORDER BY cp.paid_on DESC), '[]'::jsonb))
  INTO v_result
  FROM (
    SELECT tp.id, tp.amount, tp.paid_on, c.name AS championship, t.id AS team_id
    FROM team_payments tp
    JOIN teams t ON t.id = tp.team_id
    JOIN championships c ON c.id = t.championship_id
    WHERE t.base_team_id = p_base_team_id AND tp.status = 'approved'
    ORDER BY tp.paid_on DESC LIMIT 100
  ) cp;

  SELECT v_result || jsonb_build_object('championships', COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.created_at DESC), '[]'::jsonb))
  INTO v_result
  FROM championships c
  WHERE EXISTS (SELECT 1 FROM teams t WHERE t.championship_id = c.id AND t.base_team_id = p_base_team_id);

  RETURN v_result;
END;
$$;

-- Estado de cuenta de un jugador: el propio jugador o quien administra.
CREATE OR REPLACE FUNCTION public.treasury_player_statement(p_base_team_id uuid, p_player_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_player uuid := COALESCE(p_player_id, auth.uid());
  v_manage boolean := public.can_manage_treasury(p_base_team_id);
  v_today date := public.cl_today();
  v_paid bigint;
  v_result jsonb;
BEGIN
  IF v_player IS NULL OR (v_player <> auth.uid() AND NOT v_manage) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM base_team_players x WHERE x.base_team_id = p_base_team_id AND x.player_id = v_player) THEN
    RAISE EXCEPTION 'No eres parte de este equipo' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_paid
  FROM treasury_payments WHERE base_team_id = p_base_team_id AND player_id = v_player AND status = 'approved';

  WITH ch AS (
    SELECT c.*, chp.name AS championship,
           sum(c.amount) FILTER (WHERE c.status = 'active')
             OVER (ORDER BY c.status = 'active' DESC, c.due_date, c.created_at, c.installment, c.id ROWS UNBOUNDED PRECEDING) AS running
    FROM treasury_charges c
    LEFT JOIN championships chp ON chp.id = c.championship_id
    WHERE c.base_team_id = p_base_team_id AND c.player_id = v_player
  ), cov AS (
    SELECT ch.*, CASE WHEN status = 'active' THEN LEAST(amount, GREATEST(0, v_paid - (running - amount))) ELSE 0 END AS covered
    FROM ch
  )
  SELECT jsonb_build_object(
    'team', (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM base_teams b WHERE b.id = p_base_team_id),
    'player', (SELECT jsonb_build_object('id', pp.id, 'name', pp.full_name) FROM player_profiles pp WHERE pp.id = v_player),
    'manage', v_manage,
    'is_self', v_player = auth.uid(),
    'today', v_today,
    'totals', jsonb_build_object(
      'charged', COALESCE(sum(amount) FILTER (WHERE status = 'active'), 0),
      'paid', v_paid,
      'balance', COALESCE(sum(amount) FILTER (WHERE status = 'active'), 0) - v_paid,
      'overdue', GREATEST(0, COALESCE(sum(amount) FILTER (WHERE status = 'active' AND due_date < v_today), 0) - v_paid)
    ),
    'charges', COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'installment', installment, 'installments', installments,
        'amount', amount, 'due_date', due_date, 'championship', championship,
        'status', status, 'void_reason', void_reason, 'covered', covered,
        'state', CASE WHEN status = 'void' THEN 'void'
                      WHEN covered >= amount THEN 'paid'
                      WHEN due_date < v_today THEN 'overdue'
                      WHEN covered > 0 THEN 'partial'
                      ELSE 'pending' END
      ) ORDER BY (status = 'active') DESC, due_date, created_at, installment), '[]'::jsonb)
  ) INTO v_result
  FROM cov;

  SELECT v_result || jsonb_build_object('payments', COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.paid_on DESC, p.created_at DESC), '[]'::jsonb))
  INTO v_result
  FROM (
    SELECT id, amount, paid_on, method, reference, note, status, void_reason, created_at
    FROM treasury_payments
    WHERE base_team_id = p_base_team_id AND player_id = v_player
    ORDER BY paid_on DESC, created_at DESC LIMIT 300
  ) p;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.treasury_overview(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.treasury_player_statement(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.treasury_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.treasury_player_statement(uuid, uuid) TO authenticated;
