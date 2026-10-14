/*
  Pagos de campeonatos: cuenta corriente por equipo (sin pago en línea).

  Modelo
  - El deudor es el equipo del campeonato (teams). El capitán se arregla con sus jugadores.
  - championship_fee_settings: cobros del campeonato (inscripción en cuotas, arbitraje por partido
    o incluido en la inscripción, multas por tarjeta y W.O., instrucciones de pago).
  - team_charges: cargos. Los automáticos tienen source_key (idempotencia):
      registration:<team>:<n>  cuotas de inscripción (siguen la configuración mientras estén activas)
      referee:<match>:<team>   arbitraje al finalizar el partido (monto fijo al momento de generarse)
      card:<event>             multa por tarjeta (desde match_events, incluida la papeleta)
    Los manuales (W.O., garantía, otros) no tienen source_key. Un cargo no se borra: se anula con motivo.
  - team_payments: pagos. El personal los registra aprobados; el capitán informa una transferencia
    con comprobante y queda "por revisar". Un pago no se borra: se anula con motivo.
  - Saldo = cargos activos − pagos aprobados. Los pagos cubren primero lo que vence antes (FIFO),
    por eso lo vencido impago = máx(0, cargos vencidos − pagado). Todo se calcula en Postgres.
  - Morosos: solo aviso (team_overdue), no bloquea nada.

  Permisos
  - Configurar, cargos manuales, anular: admin_sistema, admin del campeonato o de su liga.
  - Registrar pagos y revisar comprobantes: lo anterior + encargados de turno activos (cobran en cancha).
  - Capitán confirmado (teams.captain_id) o dueño del equipo base: ve su estado de cuenta e informa pagos.
  - Nadie más ve montos.

  Montos en pesos enteros (bigint). Fechas de vencimiento en hora de Chile.
  Idempotente: se puede ejecutar más de una vez.
*/

-- =====================================================================
-- Permisos
-- =====================================================================
CREATE OR REPLACE FUNCTION public.can_manage_championship_payments(p_championship_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM championships c
    JOIN profiles p ON p.id = auth.uid()
    WHERE c.id = p_championship_id
      AND (
        p.role::text = 'admin_sistema'
        OR c.admin_id = auth.uid()
        OR (c.league_id IS NOT NULL AND public.can_manage_league(c.league_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_collect_championship_payments(p_championship_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_manage_championship_payments(p_championship_id)
      OR EXISTS (
        SELECT 1 FROM shift_manager_assignments s
        WHERE s.championship_id = p_championship_id AND s.user_id = auth.uid() AND s.is_active
      );
$$;

CREATE OR REPLACE FUNCTION public.is_team_captain(p_team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM teams t
    LEFT JOIN base_teams b ON b.id = t.base_team_id
    WHERE t.id = p_team_id
      AND ((t.captain_id = auth.uid() AND t.captain_confirmed IS TRUE) OR b.owner_id = auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_championship_payments(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_collect_championship_payments(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_team_captain(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_championship_payments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_collect_championship_payments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_captain(uuid) TO authenticated;

-- Fecha de hoy en Chile (los vencimientos son por día calendario chileno)
CREATE OR REPLACE FUNCTION public.cl_today()
RETURNS date
LANGUAGE sql STABLE SET search_path = public
AS $$ SELECT (now() AT TIME ZONE 'America/Santiago')::date $$;

-- =====================================================================
-- Tablas
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.championship_fee_settings (
  championship_id uuid PRIMARY KEY REFERENCES public.championships(id) ON DELETE CASCADE,
  registration_amount bigint NOT NULL DEFAULT 0 CHECK (registration_amount BETWEEN 0 AND 100000000),
  registration_installments integer NOT NULL DEFAULT 1 CHECK (registration_installments BETWEEN 1 AND 12),
  registration_first_due date,
  registration_interval_days integer NOT NULL DEFAULT 30 CHECK (registration_interval_days BETWEEN 1 AND 120),
  referee_mode text NOT NULL DEFAULT 'per_match' CHECK (referee_mode IN ('per_match', 'included')),
  referee_fee bigint NOT NULL DEFAULT 0 CHECK (referee_fee BETWEEN 0 AND 10000000),
  yellow_card_fine bigint NOT NULL DEFAULT 0 CHECK (yellow_card_fine BETWEEN 0 AND 10000000),
  red_card_fine bigint NOT NULL DEFAULT 0 CHECK (red_card_fine BETWEEN 0 AND 10000000),
  walkover_fine bigint NOT NULL DEFAULT 0 CHECK (walkover_fine BETWEEN 0 AND 10000000),
  fine_due_days integer NOT NULL DEFAULT 7 CHECK (fine_due_days BETWEEN 0 AND 60),
  payment_instructions text CHECK (payment_instructions IS NULL OR char_length(payment_instructions) <= 1000),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (registration_amount = 0 OR registration_amount >= registration_installments)
);

CREATE TABLE IF NOT EXISTS public.team_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  concept text NOT NULL CHECK (concept IN ('registration', 'referee', 'yellow_card', 'red_card', 'walkover', 'deposit', 'other')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  due_date date NOT NULL,
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  source_key text UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  void_reason text CHECK (void_reason IS NULL OR char_length(void_reason) <= 300),
  voided_by uuid REFERENCES public.profiles(id),
  voided_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  paid_on date NOT NULL,
  method text NOT NULL CHECK (method IN ('cash', 'transfer', 'other')),
  reference text CHECK (reference IS NULL OR char_length(reference) <= 120),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  receipt_path text CHECK (receipt_path IS NULL OR char_length(receipt_path) <= 300),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'void')),
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Saldos por equipo: solo cargos activos / pagos por estado
CREATE INDEX IF NOT EXISTS idx_team_charges_team_active ON public.team_charges (team_id, due_date, created_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_team_charges_championship ON public.team_charges (championship_id);
CREATE INDEX IF NOT EXISTS idx_team_charges_match ON public.team_charges (match_id) WHERE match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_payments_team_status ON public.team_payments (team_id, status, paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_team_payments_pending ON public.team_payments (championship_id, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_teams_championship ON public.teams (championship_id);
CREATE INDEX IF NOT EXISTS idx_matches_championship ON public.matches (championship_id);

-- =====================================================================
-- RLS: lectura para personal del campeonato y capitán del equipo. Escrituras solo por RPC.
-- =====================================================================
ALTER TABLE public.championship_fee_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.championship_fee_settings, public.team_charges, public.team_payments FROM anon, authenticated;
GRANT SELECT ON public.championship_fee_settings, public.team_charges, public.team_payments TO authenticated;

DROP POLICY IF EXISTS "Personal ve cobros del campeonato" ON public.championship_fee_settings;
CREATE POLICY "Personal ve cobros del campeonato" ON public.championship_fee_settings
  FOR SELECT TO authenticated USING (public.can_collect_championship_payments(championship_id));

DROP POLICY IF EXISTS "Personal o capitán ven cargos" ON public.team_charges;
CREATE POLICY "Personal o capitán ven cargos" ON public.team_charges
  FOR SELECT TO authenticated
  USING (public.can_collect_championship_payments(championship_id) OR public.is_team_captain(team_id));

DROP POLICY IF EXISTS "Personal o capitán ven pagos" ON public.team_payments;
CREATE POLICY "Personal o capitán ven pagos" ON public.team_payments
  FOR SELECT TO authenticated
  USING (public.can_collect_championship_payments(championship_id) OR public.is_team_captain(team_id));

-- =====================================================================
-- Cargos automáticos
-- =====================================================================

-- Cuotas de inscripción (derivadas de la configuración). Una cuota anulada (equipo exento) no se recrea.
CREATE OR REPLACE FUNCTION public.sync_registration_charges(p_championship_id uuid, p_team_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s championship_fee_settings%ROWTYPE;
  v_first date;
  v_base bigint;
BEGIN
  SELECT * INTO s FROM championship_fee_settings WHERE championship_id = p_championship_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF s.registration_amount = 0 THEN
    DELETE FROM team_charges
    WHERE championship_id = p_championship_id AND status = 'active' AND source_key LIKE 'registration:%'
      AND (p_team_id IS NULL OR team_id = p_team_id);
    RETURN;
  END IF;

  SELECT COALESCE(s.registration_first_due, c.start_date, public.cl_today()) INTO v_first
  FROM championships c WHERE c.id = p_championship_id;
  v_base := s.registration_amount / s.registration_installments;

  INSERT INTO team_charges (championship_id, team_id, concept, description, amount, due_date, source_key)
  SELECT p_championship_id, t.id, 'registration',
         CASE WHEN s.registration_installments = 1 THEN 'Inscripción'
              ELSE 'Inscripción cuota ' || n || '/' || s.registration_installments END,
         CASE WHEN n = s.registration_installments
              THEN s.registration_amount - v_base * (s.registration_installments - 1)
              ELSE v_base END,
         v_first + (n - 1) * s.registration_interval_days,
         'registration:' || t.id || ':' || n
  FROM teams t
  CROSS JOIN generate_series(1, s.registration_installments) n
  WHERE t.championship_id = p_championship_id AND (p_team_id IS NULL OR t.id = p_team_id)
  ON CONFLICT (source_key) DO UPDATE
    SET amount = EXCLUDED.amount, due_date = EXCLUDED.due_date, description = EXCLUDED.description
    WHERE team_charges.status = 'active';

  -- Si se redujo el número de cuotas
  DELETE FROM team_charges
  WHERE championship_id = p_championship_id AND status = 'active' AND source_key LIKE 'registration:%'
    AND (p_team_id IS NULL OR team_id = p_team_id)
    AND split_part(source_key, ':', 3)::int > s.registration_installments;
END;
$$;

-- Arbitraje y multas por tarjeta de un partido.
-- Arbitraje: al quedar "finalizado" (monto fijo al generarse; si el partido vuelve atrás, se quita).
-- Multas: una por tarjeta registrada; si el evento se borra (p. ej. se reemplaza la papeleta), se quita.
CREATE OR REPLACE FUNCTION public.sync_match_charges(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  m matches%ROWTYPE;
  s championship_fee_settings%ROWTYPE;
  v_day date;
BEGIN
  SELECT * INTO m FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO s FROM championship_fee_settings WHERE championship_id = m.championship_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_day := (m.match_date AT TIME ZONE 'America/Santiago')::date;

  IF m.status = 'finished' THEN
    IF s.referee_mode = 'per_match' AND s.referee_fee > 0 THEN
      INSERT INTO team_charges (championship_id, team_id, concept, description, amount, due_date, match_id, source_key)
      SELECT m.championship_id, x.team_id, 'referee',
             left('Arbitraje fecha ' || m.round || ' vs ' || COALESCE(r.name, 'rival'), 200),
             s.referee_fee, v_day, m.id, 'referee:' || m.id || ':' || x.team_id
      FROM (VALUES (m.home_team_id, m.away_team_id), (m.away_team_id, m.home_team_id)) AS x(team_id, rival_id)
      LEFT JOIN teams r ON r.id = x.rival_id
      ON CONFLICT (source_key) DO NOTHING;
    END IF;
  ELSE
    DELETE FROM team_charges WHERE match_id = m.id AND source_key LIKE 'referee:%';
  END IF;

  INSERT INTO team_charges (championship_id, team_id, concept, description, amount, due_date, match_id, source_key)
  SELECT m.championship_id, e.team_id, e.event_type,
         left(CASE e.event_type WHEN 'yellow_card' THEN 'Multa amarilla · ' ELSE 'Multa roja · ' END
              || COALESCE(pp.full_name, e.additional_info ->> 'player_name',
                          'N° ' || (e.additional_info ->> 'jersey'), 'jugador')
              || ' · fecha ' || m.round, 200),
         CASE e.event_type WHEN 'yellow_card' THEN s.yellow_card_fine ELSE s.red_card_fine END,
         v_day + s.fine_due_days, m.id, 'card:' || e.id
  FROM match_events e
  LEFT JOIN player_profiles pp ON pp.id = e.player_id
  WHERE e.match_id = m.id
    AND e.event_type IN ('yellow_card', 'red_card')
    AND e.team_id IN (m.home_team_id, m.away_team_id)
    AND (CASE e.event_type WHEN 'yellow_card' THEN s.yellow_card_fine ELSE s.red_card_fine END) > 0
  ON CONFLICT (source_key) DO NOTHING;

  DELETE FROM team_charges c
  WHERE c.match_id = m.id AND c.source_key LIKE 'card:%'
    AND NOT EXISTS (
      SELECT 1 FROM match_events e
      WHERE e.match_id = m.id AND 'card:' || e.id = c.source_key
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_championship_charges(p_championship_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_match uuid;
BEGIN
  PERFORM public.sync_registration_charges(p_championship_id, NULL);
  FOR v_match IN
    SELECT m.id FROM matches m
    WHERE m.championship_id = p_championship_id
      AND (m.status = 'finished' OR EXISTS (SELECT 1 FROM match_events e WHERE e.match_id = m.id))
  LOOP
    PERFORM public.sync_match_charges(v_match);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_registration_charges(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_match_charges(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_championship_charges(uuid) FROM PUBLIC, anon, authenticated;

-- ---------- Triggers ----------
CREATE OR REPLACE FUNCTION public.trg_team_registration_charges()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_registration_charges(NEW.championship_id, NEW.id);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS team_registration_charges ON public.teams;
CREATE TRIGGER team_registration_charges
  AFTER INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.trg_team_registration_charges();

CREATE OR REPLACE FUNCTION public.trg_match_charges()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_match_charges(NEW.id);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS match_charges ON public.matches;
CREATE TRIGGER match_charges
  AFTER INSERT OR UPDATE OF status, match_date, round, home_team_id, away_team_id ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.trg_match_charges();

-- match_events: una sincronización por partido afectado y por sentencia (la papeleta inserta muchas filas)
CREATE OR REPLACE FUNCTION public.trg_match_events_charges()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_match uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR v_match IN SELECT DISTINCT match_id FROM old_rows LOOP PERFORM public.sync_match_charges(v_match); END LOOP;
  ELSIF TG_OP = 'INSERT' THEN
    FOR v_match IN SELECT DISTINCT match_id FROM new_rows LOOP PERFORM public.sync_match_charges(v_match); END LOOP;
  ELSE
    FOR v_match IN SELECT match_id FROM new_rows UNION SELECT match_id FROM old_rows LOOP
      PERFORM public.sync_match_charges(v_match);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS match_events_charges_ins ON public.match_events;
DROP TRIGGER IF EXISTS match_events_charges_del ON public.match_events;
DROP TRIGGER IF EXISTS match_events_charges_upd ON public.match_events;
CREATE TRIGGER match_events_charges_ins AFTER INSERT ON public.match_events
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_match_events_charges();
CREATE TRIGGER match_events_charges_del AFTER DELETE ON public.match_events
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_match_events_charges();
CREATE TRIGGER match_events_charges_upd AFTER UPDATE ON public.match_events
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.trg_match_events_charges();

-- =====================================================================
-- Acciones (RPC)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.save_fee_settings(p_championship_id uuid, p_settings jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_championship_payments(p_championship_id) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  INSERT INTO championship_fee_settings AS f (
    championship_id, registration_amount, registration_installments, registration_first_due,
    registration_interval_days, referee_mode, referee_fee, yellow_card_fine, red_card_fine,
    walkover_fine, fine_due_days, payment_instructions, updated_by, updated_at
  ) VALUES (
    p_championship_id,
    COALESCE((p_settings ->> 'registration_amount')::bigint, 0),
    COALESCE((p_settings ->> 'registration_installments')::int, 1),
    NULLIF(p_settings ->> 'registration_first_due', '')::date,
    COALESCE((p_settings ->> 'registration_interval_days')::int, 30),
    COALESCE(NULLIF(p_settings ->> 'referee_mode', ''), 'per_match'),
    COALESCE((p_settings ->> 'referee_fee')::bigint, 0),
    COALESCE((p_settings ->> 'yellow_card_fine')::bigint, 0),
    COALESCE((p_settings ->> 'red_card_fine')::bigint, 0),
    COALESCE((p_settings ->> 'walkover_fine')::bigint, 0),
    COALESCE((p_settings ->> 'fine_due_days')::int, 7),
    NULLIF(btrim(p_settings ->> 'payment_instructions'), ''),
    auth.uid(), now()
  )
  ON CONFLICT (championship_id) DO UPDATE SET
    registration_amount = EXCLUDED.registration_amount,
    registration_installments = EXCLUDED.registration_installments,
    registration_first_due = EXCLUDED.registration_first_due,
    registration_interval_days = EXCLUDED.registration_interval_days,
    referee_mode = EXCLUDED.referee_mode,
    referee_fee = EXCLUDED.referee_fee,
    yellow_card_fine = EXCLUDED.yellow_card_fine,
    red_card_fine = EXCLUDED.red_card_fine,
    walkover_fine = EXCLUDED.walkover_fine,
    fine_due_days = EXCLUDED.fine_due_days,
    payment_instructions = EXCLUDED.payment_instructions,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

  PERFORM public.sync_championship_charges(p_championship_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_team_charge(
  p_team_id uuid, p_concept text, p_description text, p_amount bigint, p_due_date date
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_champ uuid;
  v_id uuid;
BEGIN
  SELECT championship_id INTO v_champ FROM teams WHERE id = p_team_id;
  IF v_champ IS NULL OR NOT public.can_manage_championship_payments(v_champ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_concept NOT IN ('registration', 'referee', 'yellow_card', 'red_card', 'walkover', 'deposit', 'other') THEN
    RAISE EXCEPTION 'Concepto inválido' USING ERRCODE = '22023';
  END IF;
  INSERT INTO team_charges (championship_id, team_id, concept, description, amount, due_date, created_by)
  VALUES (v_champ, p_team_id, p_concept, btrim(p_description), p_amount, COALESCE(p_due_date, public.cl_today()), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_team_charge(p_charge_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_champ uuid;
BEGIN
  SELECT championship_id INTO v_champ FROM team_charges WHERE id = p_charge_id AND status = 'active' FOR UPDATE;
  IF v_champ IS NULL OR NOT public.can_manage_championship_payments(v_champ) THEN
    RAISE EXCEPTION 'No autorizado o cargo ya anulado' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Indica el motivo de la anulación' USING ERRCODE = '22023';
  END IF;
  UPDATE team_charges
  SET status = 'void', void_reason = left(btrim(p_reason), 300), voided_by = auth.uid(), voided_at = now()
  WHERE id = p_charge_id;
END;
$$;

-- Personal: el pago queda aprobado. Capitán: queda "por revisar" y debe adjuntar comprobante.
CREATE OR REPLACE FUNCTION public.record_team_payment(
  p_team_id uuid, p_amount bigint, p_paid_on date, p_method text,
  p_reference text DEFAULT NULL, p_note text DEFAULT NULL, p_receipt_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_champ uuid;
  v_staff boolean;
  v_id uuid;
BEGIN
  SELECT championship_id INTO v_champ FROM teams WHERE id = p_team_id;
  IF v_champ IS NULL THEN RAISE EXCEPTION 'Equipo no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_staff := public.can_collect_championship_payments(v_champ);
  IF NOT v_staff AND NOT public.is_team_captain(p_team_id) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_method NOT IN ('cash', 'transfer', 'other') THEN
    RAISE EXCEPTION 'Medio de pago inválido' USING ERRCODE = '22023';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on > public.cl_today() + 1 OR p_paid_on < DATE '2020-01-01' THEN
    RAISE EXCEPTION 'Fecha de pago inválida' USING ERRCODE = '22023';
  END IF;
  IF p_receipt_path IS NOT NULL AND p_receipt_path NOT LIKE v_champ || '/' || p_team_id || '/%' THEN
    RAISE EXCEPTION 'Comprobante inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT v_staff THEN
    IF p_receipt_path IS NULL THEN
      RAISE EXCEPTION 'Adjunta el comprobante' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM team_payments WHERE team_id = p_team_id AND status = 'pending') >= 10 THEN
      RAISE EXCEPTION 'Tienes 10 pagos por revisar. Espera a que el campeonato los revise.' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO team_payments (
    championship_id, team_id, amount, paid_on, method, reference, note, receipt_path,
    status, submitted_by, reviewed_by, reviewed_at
  ) VALUES (
    v_champ, p_team_id, p_amount, p_paid_on, p_method,
    NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_note), ''), p_receipt_path,
    CASE WHEN v_staff THEN 'approved' ELSE 'pending' END,
    auth.uid(),
    CASE WHEN v_staff THEN auth.uid() END,
    CASE WHEN v_staff THEN now() END
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_team_payment(p_payment_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_champ uuid;
BEGIN
  SELECT championship_id INTO v_champ FROM team_payments WHERE id = p_payment_id AND status = 'pending' FOR UPDATE;
  IF v_champ IS NULL OR NOT public.can_collect_championship_payments(v_champ) THEN
    RAISE EXCEPTION 'No autorizado o pago ya revisado' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approve AND char_length(btrim(COALESCE(p_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Indica por qué se rechaza' USING ERRCODE = '22023';
  END IF;
  UPDATE team_payments
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = NULLIF(left(btrim(p_note), 300), '')
  WHERE id = p_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_team_payment(p_payment_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_champ uuid;
BEGIN
  SELECT championship_id INTO v_champ FROM team_payments
  WHERE id = p_payment_id AND status IN ('approved', 'pending') FOR UPDATE;
  IF v_champ IS NULL OR NOT public.can_manage_championship_payments(v_champ) THEN
    RAISE EXCEPTION 'No autorizado o pago ya anulado' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Indica el motivo de la anulación' USING ERRCODE = '22023';
  END IF;
  UPDATE team_payments
  SET status = 'void', review_note = left(btrim(p_reason), 300), reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_payment_id;
END;
$$;

-- =====================================================================
-- Consultas (RPC)
-- =====================================================================

-- Panel del campeonato: saldo de todos los equipos en una sola consulta.
CREATE OR REPLACE FUNCTION public.championship_balances(p_championship_id uuid)
RETURNS TABLE (
  team_id uuid, team_name text, charged bigint, paid bigint, balance bigint,
  overdue bigint, pending_review integer, last_payment_on date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_collect_championship_payments(p_championship_id) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT t.id, t.name,
         COALESCE(c.charged, 0)::bigint,
         COALESCE(p.paid, 0)::bigint,
         (COALESCE(c.charged, 0) - COALESCE(p.paid, 0))::bigint,
         GREATEST(0, COALESCE(c.due_past, 0) - COALESCE(p.paid, 0))::bigint,
         COALESCE(p.pending, 0)::int,
         p.last_paid
  FROM teams t
  LEFT JOIN LATERAL (
    SELECT sum(ch.amount) AS charged,
           sum(ch.amount) FILTER (WHERE ch.due_date < public.cl_today()) AS due_past
    FROM team_charges ch
    WHERE ch.team_id = t.id AND ch.status = 'active'
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT sum(py.amount) FILTER (WHERE py.status = 'approved') AS paid,
           count(*) FILTER (WHERE py.status = 'pending') AS pending,
           max(py.paid_on) FILTER (WHERE py.status = 'approved') AS last_paid
    FROM team_payments py
    WHERE py.team_id = t.id
  ) p ON true
  WHERE t.championship_id = p_championship_id
  ORDER BY 6 DESC, t.name;
END;
$$;

-- Estado de cuenta de un equipo (personal o capitán): cargos con lo cubierto (FIFO) y pagos.
CREATE OR REPLACE FUNCTION public.team_statement(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_team teams%ROWTYPE;
  v_collect boolean;
  v_manage boolean;
  v_captain boolean;
  v_paid bigint;
  v_today date := public.cl_today();
  v_result jsonb;
BEGIN
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Equipo no encontrado' USING ERRCODE = 'P0002'; END IF;
  v_manage := public.can_manage_championship_payments(v_team.championship_id);
  v_collect := v_manage OR public.can_collect_championship_payments(v_team.championship_id);
  v_captain := public.is_team_captain(p_team_id);
  IF NOT v_collect AND NOT v_captain THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_paid FROM team_payments WHERE team_id = p_team_id AND status = 'approved';

  SELECT jsonb_build_object(
    'team', jsonb_build_object('id', v_team.id, 'name', v_team.name),
    'championship', jsonb_build_object('id', c.id, 'name', c.name),
    'permissions', jsonb_build_object('manage', v_manage, 'collect', v_collect, 'captain', v_captain),
    'settings', CASE WHEN s.championship_id IS NULL THEN NULL ELSE jsonb_build_object(
        'payment_instructions', s.payment_instructions,
        'walkover_fine', s.walkover_fine,
        'referee_mode', s.referee_mode) END,
    'today', v_today
  )
  INTO v_result
  FROM championships c
  LEFT JOIN championship_fee_settings s ON s.championship_id = c.id
  WHERE c.id = v_team.championship_id;

  WITH ch AS (
    SELECT x.*,
           sum(x.amount) FILTER (WHERE x.status = 'active')
             OVER (ORDER BY x.status = 'active' DESC, x.due_date, x.created_at, x.id ROWS UNBOUNDED PRECEDING) AS running
    FROM team_charges x
    WHERE x.team_id = p_team_id
  ), cov AS (
    SELECT ch.*,
           CASE WHEN ch.status = 'active'
                THEN LEAST(ch.amount, GREATEST(0, v_paid - (ch.running - ch.amount))) ELSE 0 END AS covered
    FROM ch
  )
  SELECT v_result || jsonb_build_object(
    'totals', jsonb_build_object(
      'charged', COALESCE(sum(amount) FILTER (WHERE status = 'active'), 0),
      'paid', v_paid,
      'balance', COALESCE(sum(amount) FILTER (WHERE status = 'active'), 0) - v_paid,
      'overdue', GREATEST(0, COALESCE(sum(amount) FILTER (WHERE status = 'active' AND due_date < v_today), 0) - v_paid)
    ),
    'charges', COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'concept', concept, 'description', description, 'amount', amount,
        'due_date', due_date, 'match_id', match_id, 'automatic', source_key IS NOT NULL,
        'status', status, 'void_reason', void_reason, 'covered', covered,
        'state', CASE WHEN status = 'void' THEN 'void'
                      WHEN covered >= amount THEN 'paid'
                      WHEN due_date < v_today THEN 'overdue'
                      WHEN covered > 0 THEN 'partial'
                      ELSE 'pending' END
      ) ORDER BY (status = 'active') DESC, due_date, created_at, id), '[]'::jsonb)
  )
  INTO v_result
  FROM cov;

  SELECT v_result || jsonb_build_object('payments', COALESCE(jsonb_agg(row_to_json(q)::jsonb ORDER BY q.paid_on DESC, q.created_at DESC), '[]'::jsonb))
  INTO v_result
  FROM (
    SELECT id, amount, paid_on, method, reference, note, receipt_path, status, review_note, created_at,
           (submitted_by = auth.uid()) AS mine
    FROM team_payments
    WHERE team_id = p_team_id
    ORDER BY paid_on DESC, created_at DESC
    LIMIT 300
  ) q;

  RETURN v_result;
END;
$$;

-- Aviso de morosos (solo personal del campeonato): vencido impago por equipo.
CREATE OR REPLACE FUNCTION public.team_overdue(p_team_ids uuid[])
RETURNS TABLE (team_id uuid, overdue bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id,
         GREATEST(0,
           COALESCE((SELECT sum(ch.amount) FROM team_charges ch
                     WHERE ch.team_id = t.id AND ch.status = 'active' AND ch.due_date < public.cl_today()), 0)
           - COALESCE((SELECT sum(py.amount) FROM team_payments py
                       WHERE py.team_id = t.id AND py.status = 'approved'), 0)
         )::bigint
  FROM teams t
  WHERE t.id = ANY (p_team_ids[1:50])
    AND public.can_collect_championship_payments(t.championship_id);
$$;

REVOKE ALL ON FUNCTION public.save_fee_settings(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_team_charge(uuid, text, text, bigint, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_team_charge(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_team_payment(uuid, bigint, date, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_team_payment(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_team_payment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.championship_balances(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_statement(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_overdue(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fee_settings(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_team_charge(uuid, text, text, bigint, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_team_charge(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_team_payment(uuid, bigint, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_team_payment(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_team_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.championship_balances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_statement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_overdue(uuid[]) TO authenticated;

-- =====================================================================
-- Comprobantes: bucket privado. Ruta <championship_id>/<team_id>/<archivo>
-- =====================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-receipts', 'payment-receipts', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

CREATE OR REPLACE FUNCTION public.can_access_payment_receipt(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] !~ '^[0-9a-f-]{36}$'
      OR (storage.foldername(p_name))[2] !~ '^[0-9a-f-]{36}$' THEN false
    ELSE EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = ((storage.foldername(p_name))[2])::uuid
        AND t.championship_id = ((storage.foldername(p_name))[1])::uuid
        AND (public.can_collect_championship_payments(t.championship_id) OR public.is_team_captain(t.id))
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.can_access_payment_receipt(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_payment_receipt(text) TO authenticated;

DROP POLICY IF EXISTS "Personal o capitán suben comprobantes" ON storage.objects;
CREATE POLICY "Personal o capitán suben comprobantes" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-receipts' AND public.can_access_payment_receipt(name));
DROP POLICY IF EXISTS "Personal o capitán ven comprobantes" ON storage.objects;
CREATE POLICY "Personal o capitán ven comprobantes" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-receipts' AND public.can_access_payment_receipt(name));
