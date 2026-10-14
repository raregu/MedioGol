/*
  Pagos a nivel liga.

  - league_payment_summary(league): resumen de cobros por serie (una consulta para toda la liga).
  - copy_fee_settings_to_league(championship): copia la configuración de cobros de una serie a
    las demás series de su liga y genera sus cargos. Solo series que el usuario puede administrar.

  Requiere 20261015120000_championship_payments.sql. Idempotente.
*/

CREATE INDEX IF NOT EXISTS idx_championships_league ON public.championships (league_id) WHERE league_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.league_payment_summary(p_league_id uuid)
RETURNS TABLE (
  championship_id uuid, championship_name text, series_name text, display_order integer,
  configured boolean, teams integer, to_collect bigint, overdue bigint, paid bigint,
  debtors integer, pending_review integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_league(p_league_id) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH per_team AS (
    SELECT t.championship_id AS champ,
           COALESCE(c.charged, 0) - COALESCE(p.paid, 0) AS balance,
           GREATEST(0, COALESCE(c.due_past, 0) - COALESCE(p.paid, 0)) AS overdue,
           COALESCE(p.paid, 0) AS paid,
           COALESCE(p.pending, 0) AS pending
    FROM teams t
    JOIN championships ch ON ch.id = t.championship_id AND ch.league_id = p_league_id
    LEFT JOIN LATERAL (
      SELECT sum(x.amount) AS charged,
             sum(x.amount) FILTER (WHERE x.due_date < public.cl_today()) AS due_past
      FROM team_charges x WHERE x.team_id = t.id AND x.status = 'active'
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT sum(y.amount) FILTER (WHERE y.status = 'approved') AS paid,
             count(*) FILTER (WHERE y.status = 'pending') AS pending
      FROM team_payments y WHERE y.team_id = t.id
    ) p ON true
  )
  SELECT ch.id, ch.name, ch.series_name, ch.display_order,
         (s.championship_id IS NOT NULL),
         COUNT(pt.champ)::int,
         COALESCE(sum(GREATEST(pt.balance, 0)), 0)::bigint,
         COALESCE(sum(pt.overdue), 0)::bigint,
         COALESCE(sum(pt.paid), 0)::bigint,
         COUNT(*) FILTER (WHERE pt.overdue > 0)::int,
         COALESCE(sum(pt.pending), 0)::int
  FROM championships ch
  LEFT JOIN championship_fee_settings s ON s.championship_id = ch.id
  LEFT JOIN per_team pt ON pt.champ = ch.id
  WHERE ch.league_id = p_league_id
  GROUP BY ch.id, ch.name, ch.series_name, ch.display_order, s.championship_id
  ORDER BY ch.display_order, ch.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.copy_fee_settings_to_league(p_championship_id uuid)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s championship_fee_settings%ROWTYPE;
  v_league uuid;
  v_target uuid;
  v_count integer := 0;
BEGIN
  IF NOT public.can_manage_championship_payments(p_championship_id) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  SELECT league_id INTO v_league FROM championships WHERE id = p_championship_id;
  IF v_league IS NULL THEN
    RAISE EXCEPTION 'Este campeonato no pertenece a una liga' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO s FROM championship_fee_settings WHERE championship_id = p_championship_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Primero guarda los cobros de esta serie' USING ERRCODE = '22023';
  END IF;

  FOR v_target IN
    SELECT id FROM championships
    WHERE league_id = v_league AND id <> p_championship_id
    ORDER BY display_order, name
  LOOP
    CONTINUE WHEN NOT public.can_manage_championship_payments(v_target);
    INSERT INTO championship_fee_settings (
      championship_id, registration_amount, registration_installments, registration_first_due,
      registration_interval_days, referee_mode, referee_fee, yellow_card_fine, red_card_fine,
      walkover_fine, fine_due_days, payment_instructions, updated_by, updated_at
    ) VALUES (
      v_target, s.registration_amount, s.registration_installments, s.registration_first_due,
      s.registration_interval_days, s.referee_mode, s.referee_fee, s.yellow_card_fine, s.red_card_fine,
      s.walkover_fine, s.fine_due_days, s.payment_instructions, auth.uid(), now()
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
    PERFORM public.sync_championship_charges(v_target);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.league_payment_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.copy_fee_settings_to_league(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_payment_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_fee_settings_to_league(uuid) TO authenticated;
