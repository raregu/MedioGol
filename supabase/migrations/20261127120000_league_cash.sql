/*
  # Caja de la liga (ingresos y egresos)

  La liga lleva su caja general:
    - INGRESOS AUTOMÁTICOS: los pagos de equipos ya aprobados en Cobros (team_payments 'approved'
      de las series de la liga). No se registran dos veces: se leen de donde ya están.
    - INGRESOS MANUALES: auspicios, entradas, kiosco, aportes, otros, y el saldo inicial.
    - EGRESOS: árbitros, cancha, premios, implementos, asociación/ANFA, seguros, administración, otros.
  Saldo de caja = ingresos (automáticos + manuales) − egresos.

  Quién: el administrador de la liga (y admin_sistema) y los tesoreros que él nombre.
  Nada se borra: un movimiento se anula con motivo y queda quién lo hizo.
  Montos en pesos enteros. Categorías fijas (+ "Otros"). Comprobantes en el bucket privado
  league-receipts/<league_id>/<archivo>.

  Todo el acceso es por funciones SECURITY DEFINER; las tablas no se exponen. Idempotente.
*/

-- ============================== Tablas ==============================
CREATE TABLE IF NOT EXISTS public.league_treasurers (
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_league_treasurers_user ON public.league_treasurers (user_id);

CREATE TABLE IF NOT EXISTS public.league_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('in', 'out')),
  category text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 10000000000),
  occurred_on date NOT NULL CHECK (occurred_on >= DATE '2000-01-01'),
  championship_id uuid REFERENCES public.championships(id) ON DELETE SET NULL,
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 200),
  method text NOT NULL CHECK (method IN ('cash', 'transfer', 'other')),
  receipt_path text CHECK (receipt_path IS NULL OR char_length(receipt_path) <= 300),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  void_reason text CHECK (void_reason IS NULL OR char_length(void_reason) <= 300),
  voided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_cash_category_kind CHECK (
    (kind = 'in' AND category IN ('opening', 'sponsor', 'tickets', 'kiosk', 'contribution', 'other_in'))
    OR (kind = 'out' AND category IN ('referees', 'field', 'prizes', 'equipment', 'association', 'insurance', 'admin', 'other_out'))
  )
);
CREATE INDEX IF NOT EXISTS idx_league_cash_league_day
  ON public.league_cash_movements (league_id, occurred_on DESC, created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_league_cash_creator_day ON public.league_cash_movements (created_by, created_at);
-- Ingresos automáticos: pagos aprobados por serie y fecha
CREATE INDEX IF NOT EXISTS idx_team_payments_champ_approved
  ON public.team_payments (championship_id, paid_on) WHERE status = 'approved';

ALTER TABLE public.league_treasurers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_cash_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_treasurers, public.league_cash_movements FROM anon, authenticated;

-- ============================== Permisos ==============================
-- 'admin' (admin de la liga o admin_sistema) | 'treasurer' | null
CREATE OR REPLACE FUNCTION public.league_cash_role(p_league uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR p_league IS NULL THEN NULL
    WHEN public.can_manage_league(p_league) THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM league_treasurers t WHERE t.league_id = p_league AND t.user_id = auth.uid()) THEN 'treasurer'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.league_cash_require(p_league uuid, p_admin boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role text := public.league_cash_role(p_league);
BEGIN
  IF v_role IS NULL OR (p_admin AND v_role <> 'admin') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN v_role;
END;
$$;

-- ============================== Lectura ==============================
/*
  Resumen del período [p_from, p_to] (ambos inclusive; null = sin límite):
  totales, saldo de caja a la fecha p_to (histórico), por cobrar a equipos (hoy), meses,
  categorías, ingresos automáticos por mes y serie, tesoreros (solo admin) y series de la liga.
*/
CREATE OR REPLACE FUNCTION public.league_cash_overview(p_league uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := public.league_cash_require(p_league);
  v_from date := COALESCE(p_from, DATE '2000-01-01');
  v_to date := COALESCE(p_to, public.cl_today());
  v jsonb;
BEGIN
  IF v_from > v_to THEN
    RAISE EXCEPTION 'El período no es válido' USING ERRCODE = '22023';
  END IF;

  WITH champs AS (
    SELECT id, COALESCE(NULLIF(btrim(series_name), ''), name) AS label, display_order
    FROM championships WHERE league_id = p_league
  ),
  auto_all AS (
    SELECT tp.paid_on AS day, tp.amount, tp.championship_id
    FROM team_payments tp JOIN champs c ON c.id = tp.championship_id
    WHERE tp.status = 'approved' AND tp.paid_on <= v_to
  ),
  man_all AS (
    SELECT occurred_on AS day, kind, category, amount
    FROM league_cash_movements
    WHERE league_id = p_league AND status = 'active' AND occurred_on <= v_to
  ),
  auto_p AS (SELECT * FROM auto_all WHERE day >= v_from),
  man_p AS (SELECT * FROM man_all WHERE day >= v_from),
  months AS (
    SELECT to_char(day, 'YYYY-MM') AS m, sum(amount) FILTER (WHERE src = 'in') AS income, sum(amount) FILTER (WHERE src = 'out') AS expense
    FROM (
      SELECT day, amount, 'in' AS src FROM auto_p
      UNION ALL SELECT day, amount, kind FROM man_p
    ) x GROUP BY 1
  ),
  receivable AS (
    SELECT COALESCE(sum(GREATEST(COALESCE(ch.charged, 0) - COALESCE(pa.paid, 0), 0)), 0) AS total
    FROM teams t
    JOIN champs c ON c.id = t.championship_id
    LEFT JOIN LATERAL (SELECT sum(x.amount) AS charged FROM team_charges x WHERE x.team_id = t.id AND x.status = 'active') ch ON true
    LEFT JOIN LATERAL (SELECT sum(y.amount) AS paid FROM team_payments y WHERE y.team_id = t.id AND y.status = 'approved') pa ON true
  )
  SELECT jsonb_build_object(
    'role', v_role,
    'from', p_from,
    'to', v_to,
    'income_auto', (SELECT COALESCE(sum(amount), 0) FROM auto_p),
    'income_manual', (SELECT COALESCE(sum(amount), 0) FROM man_p WHERE kind = 'in'),
    'expense', (SELECT COALESCE(sum(amount), 0) FROM man_p WHERE kind = 'out'),
    'balance', (SELECT COALESCE(sum(amount), 0) FROM auto_all)
             + (SELECT COALESCE(sum(CASE WHEN kind = 'in' THEN amount ELSE -amount END), 0) FROM man_all),
    'receivable', (SELECT total FROM receivable),
    'months', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', m, 'income', COALESCE(income, 0), 'expense', COALESCE(expense, 0)) ORDER BY m) FROM months), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kind', kind, 'category', category, 'total', total, 'count', n) ORDER BY kind, total DESC)
      FROM (SELECT kind, category, sum(amount) AS total, count(*) AS n FROM man_p GROUP BY kind, category) s
    ), '[]'::jsonb),
    'auto', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', m, 'championship_id', championship_id, 'series', label, 'total', total, 'count', n) ORDER BY m DESC, display_order, label)
      FROM (
        SELECT to_char(a.day, 'YYYY-MM') AS m, a.championship_id, c.label, c.display_order, sum(a.amount) AS total, count(*) AS n
        FROM auto_p a JOIN champs c ON c.id = a.championship_id
        GROUP BY 1, 2, 3, 4
      ) s
    ), '[]'::jsonb),
    'series', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'label', label) ORDER BY display_order, label) FROM champs), '[]'::jsonb),
    'treasurers', CASE WHEN v_role = 'admin' THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('user_id', t.user_id, 'name', COALESCE(p.full_name, 'Sin nombre')) ORDER BY t.created_at)
      FROM league_treasurers t LEFT JOIN profiles p ON p.id = t.user_id WHERE t.league_id = p_league
    ), '[]'::jsonb) ELSE NULL END
  ) INTO v;
  RETURN v;
END;
$$;

/*
  Movimientos manuales del período, del más reciente al más antiguo, con paginación por cursor
  (p_before_day, p_before_created). Incluye anulados si p_include_void.
*/
CREATE OR REPLACE FUNCTION public.league_cash_list(
  p_league uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_kind text DEFAULT NULL, p_category text DEFAULT NULL, p_include_void boolean DEFAULT false,
  p_before_day date DEFAULT NULL, p_before_created timestamptz DEFAULT NULL, p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid, kind text, category text, amount bigint, occurred_on date, championship_id uuid, series text,
  description text, method text, has_receipt boolean, status text, void_reason text,
  created_by_name text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.league_cash_require(p_league);
  RETURN QUERY
  SELECT m.id, m.kind, m.category, m.amount, m.occurred_on, m.championship_id,
         COALESCE(NULLIF(btrim(c.series_name), ''), c.name),
         m.description, m.method, (m.receipt_path IS NOT NULL), m.status, m.void_reason,
         p.full_name, m.created_at
  FROM league_cash_movements m
  LEFT JOIN championships c ON c.id = m.championship_id
  LEFT JOIN profiles p ON p.id = m.created_by
  WHERE m.league_id = p_league
    AND (p_include_void OR m.status = 'active')
    AND (p_from IS NULL OR m.occurred_on >= p_from)
    AND (p_to IS NULL OR m.occurred_on <= p_to)
    AND (p_kind IS NULL OR m.kind = p_kind)
    AND (p_category IS NULL OR m.category = p_category)
    AND (p_before_day IS NULL OR (m.occurred_on, m.created_at) < (p_before_day, COALESCE(p_before_created, 'infinity'::timestamptz)))
  ORDER BY m.occurred_on DESC, m.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000);
END;
$$;

-- Ruta del comprobante (para firmar la URL desde el cliente), solo para quien tiene acceso
CREATE OR REPLACE FUNCTION public.league_cash_receipt(p_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_league uuid; v_path text;
BEGIN
  SELECT league_id, receipt_path INTO v_league, v_path FROM league_cash_movements WHERE id = p_id;
  IF v_league IS NULL THEN RAISE EXCEPTION 'Movimiento no encontrado' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.league_cash_require(v_league);
  RETURN v_path;
END;
$$;

-- ============================== Escritura ==============================
CREATE OR REPLACE FUNCTION public.league_cash_add(
  p_league uuid, p_kind text, p_category text, p_amount bigint, p_occurred_on date,
  p_description text, p_method text, p_championship uuid DEFAULT NULL, p_receipt_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.league_cash_require(p_league);
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000000000 THEN
    RAISE EXCEPTION 'Ingresa un monto válido' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_on IS NULL OR p_occurred_on > public.cl_today() OR p_occurred_on < DATE '2000-01-01' THEN
    RAISE EXCEPTION 'La fecha no puede ser futura' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_description, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Escribe una descripción (máximo 200 caracteres)' USING ERRCODE = '22023';
  END IF;
  IF p_championship IS NOT NULL AND NOT EXISTS (SELECT 1 FROM championships WHERE id = p_championship AND league_id = p_league) THEN
    RAISE EXCEPTION 'La serie no pertenece a esta liga' USING ERRCODE = '22023';
  END IF;
  IF p_receipt_path IS NOT NULL AND p_receipt_path NOT LIKE p_league::text || '/%' THEN
    RAISE EXCEPTION 'Comprobante no válido' USING ERRCODE = '22023';
  END IF;
  -- Freno contra cargas masivas por error (o scripts): 300 movimientos por persona al día
  IF (SELECT count(*) FROM league_cash_movements WHERE created_by = auth.uid() AND created_at > now() - interval '1 day') >= 300 THEN
    RAISE EXCEPTION 'Llegaste al máximo de movimientos por día' USING ERRCODE = '22023';
  END IF;

  INSERT INTO league_cash_movements (league_id, kind, category, amount, occurred_on, championship_id, description, method, receipt_path, created_by)
  VALUES (p_league, p_kind, p_category, p_amount, p_occurred_on, p_championship, btrim(p_description), p_method, p_receipt_path, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'Revisa el tipo, la categoría y el medio de pago' USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION public.league_cash_void(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_league uuid;
BEGIN
  SELECT league_id INTO v_league FROM league_cash_movements WHERE id = p_id AND status = 'active' FOR UPDATE;
  IF v_league IS NULL THEN RAISE EXCEPTION 'El movimiento no existe o ya está anulado' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.league_cash_require(v_league);
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 3 AND 300 THEN
    RAISE EXCEPTION 'Escribe el motivo de la anulación' USING ERRCODE = '22023';
  END IF;
  UPDATE league_cash_movements
  SET status = 'void', void_reason = btrim(p_reason), voided_by = auth.uid(), voided_at = now()
  WHERE id = p_id;
END;
$$;

-- Tesoreros: los nombra el administrador por correo (máx. 5 por liga)
CREATE OR REPLACE FUNCTION public.league_treasurer_add(p_league uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid; v_name text;
BEGIN
  PERFORM public.league_cash_require(p_league, true);
  SELECT u.id INTO v_user FROM auth.users u WHERE lower(u.email) = lower(btrim(COALESCE(p_email, ''))) LIMIT 1;
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user) THEN
    RAISE EXCEPTION 'No hay una cuenta de MedioGol con ese correo' USING ERRCODE = 'P0002';
  END IF;
  IF (SELECT count(*) FROM league_treasurers WHERE league_id = p_league) >= 5 THEN
    RAISE EXCEPTION 'La liga ya tiene 5 tesoreros' USING ERRCODE = '22023';
  END IF;
  INSERT INTO league_treasurers (league_id, user_id, added_by) VALUES (p_league, v_user, auth.uid())
  ON CONFLICT DO NOTHING;
  SELECT full_name INTO v_name FROM profiles WHERE id = v_user;
  RETURN jsonb_build_object('user_id', v_user, 'name', COALESCE(v_name, 'Sin nombre'));
END;
$$;

CREATE OR REPLACE FUNCTION public.league_treasurer_remove(p_league uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.league_cash_require(p_league, true);
  DELETE FROM league_treasurers WHERE league_id = p_league AND user_id = p_user;
END;
$$;

REVOKE ALL ON FUNCTION public.league_cash_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.league_cash_require(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.league_cash_overview(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.league_cash_list(uuid, date, date, text, text, boolean, date, timestamptz, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.league_cash_receipt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.league_cash_add(uuid, text, text, bigint, date, text, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.league_cash_void(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.league_treasurer_add(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.league_treasurer_remove(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_cash_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_cash_overview(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_cash_list(uuid, date, date, text, text, boolean, date, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_cash_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_cash_add(uuid, text, text, bigint, date, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_cash_void(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_treasurer_add(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_treasurer_remove(uuid, uuid) TO authenticated;

-- ============================== Comprobantes ==============================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('league-receipts', 'league-receipts', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

CREATE OR REPLACE FUNCTION public.can_access_league_receipt(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN false
    ELSE public.league_cash_role(((storage.foldername(p_name))[1])::uuid) IS NOT NULL
  END;
$$;
REVOKE ALL ON FUNCTION public.can_access_league_receipt(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_league_receipt(text) TO authenticated;

DROP POLICY IF EXISTS "Caja de la liga sube comprobantes" ON storage.objects;
CREATE POLICY "Caja de la liga sube comprobantes" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'league-receipts' AND public.can_access_league_receipt(name));
DROP POLICY IF EXISTS "Caja de la liga ve comprobantes" ON storage.objects;
CREATE POLICY "Caja de la liga ve comprobantes" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'league-receipts' AND public.can_access_league_receipt(name));
