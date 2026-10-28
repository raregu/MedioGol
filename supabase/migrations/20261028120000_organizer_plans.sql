/*
  Planes de organizador (Gratis / Premium), validados en el servidor.

  - Cualquier usuario puede volverse organizador al registrarse: become_organizer() le da el rol
    admin_campeonato con plan Gratis (sin aprobación).
  - Plan Gratis:
      * 1 liga (sus campeonatos deben ser series de esa liga; sin campeonatos sueltos).
      * 6 meses gratis desde que crea su liga. Al vencer, la liga queda en SOLO LECTURA:
        no se pueden crear ni editar series, equipos, partidos, eventos ni sanciones.
      * 5 papeletas de prueba leídas con IA (se cuentan partidos distintos con lectura exitosa;
        releer el mismo partido no gasta otra, con tope de 3 lecturas por partido).
  - Premium: sin límites. Por ahora lo activa a mano el administrador del sistema (sin cobro en línea).
  - Organizadores existentes al aplicar esta migración quedan en Premium (no se les quita nada).
  - Administrador del sistema: siempre sin límites.
  - Dueño de una liga/serie para los límites: leagues.admin_id (o championships.admin_id si es suelto).

  Además: al crear un perfil desde la app, el rol queda siempre 'usuario' (antes la política de
  INSERT no limitaba el rol). Idempotente.
*/

CREATE TABLE IF NOT EXISTS public.organizer_plans (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  trial_ends_at timestamptz,
  premium_until timestamptz,
  sheet_limit integer NOT NULL DEFAULT 5 CHECK (sheet_limit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_organizer_plans_plan ON public.organizer_plans (plan, created_at DESC);

ALTER TABLE public.organizer_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organizer_plans FROM anon, authenticated;
GRANT SELECT ON public.organizer_plans TO authenticated;
DROP POLICY IF EXISTS "Organizador ve su plan" ON public.organizer_plans;
CREATE POLICY "Organizador ve su plan" ON public.organizer_plans
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin_sistema');

-- Índices que usan los límites
CREATE INDEX IF NOT EXISTS idx_leagues_admin_id ON public.leagues (admin_id);
CREATE INDEX IF NOT EXISTS idx_championships_admin_id ON public.championships (admin_id);
CREATE INDEX IF NOT EXISTS idx_championships_league ON public.championships (league_id) WHERE league_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_championship_id ON public.matches (championship_id);
CREATE INDEX IF NOT EXISTS idx_match_sheets_match ON public.match_sheets (match_id, created_at DESC);

-- Los organizadores que ya existen quedan en Premium
INSERT INTO public.organizer_plans (user_id, plan)
SELECT p.id, 'premium' FROM public.profiles p WHERE p.role::text = 'admin_campeonato'
ON CONFLICT (user_id) DO NOTHING;

-- ¿Es plan Gratis? (admin del sistema nunca; Premium vencido vuelve a Gratis; sin fila = Gratis)
CREATE OR REPLACE FUNCTION public.organizer_is_free(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user IS NULL THEN false
    WHEN EXISTS (SELECT 1 FROM profiles WHERE id = p_user AND role::text = 'admin_sistema') THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM organizer_plans op
      WHERE op.user_id = p_user AND op.plan = 'premium'
        AND (op.premium_until IS NULL OR op.premium_until > now())
    )
  END
$$;

-- Dueño (para límites) de un campeonato: el admin de su liga o, si es suelto, su admin
CREATE OR REPLACE FUNCTION public.championship_owner(p_championship uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(l.admin_id, c.admin_id)
  FROM championships c LEFT JOIN leagues l ON l.id = c.league_id
  WHERE c.id = p_championship
$$;

-- ¿El periodo gratis del dueño terminó? (solo lectura)
CREATE OR REPLACE FUNCTION public.organizer_is_locked(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.organizer_is_free(p_user) AND EXISTS (
    SELECT 1 FROM organizer_plans op
    WHERE op.user_id = p_user AND op.trial_ends_at IS NOT NULL AND op.trial_ends_at <= now()
  )
$$;

CREATE OR REPLACE FUNCTION public.championship_is_locked(p_championship uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(public.organizer_is_locked(public.championship_owner(p_championship)), false) $$;

-- Quien bypassa los límites: admin del sistema o procesos del servidor sin sesión (service role / SQL)
CREATE OR REPLACE FUNCTION public.plan_limits_bypass()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT auth.uid() IS NULL OR COALESCE(public.current_user_role() = 'admin_sistema', false) $$;

-- ===================== Alta de organizador =====================
CREATE OR REPLACE FUNCTION public.become_organizer()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;
  SELECT role::text INTO v_role FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Perfil no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'encargado_turno' THEN
    RAISE EXCEPTION 'Tu cuenta es de encargado de turno. Pide al administrador que la cambie.' USING ERRCODE = '22023';
  END IF;
  IF v_role IN ('usuario', 'capitan') THEN
    UPDATE profiles SET role = 'admin_campeonato', updated_at = now() WHERE id = v_uid;
  END IF;
  IF v_role <> 'admin_sistema' THEN
    INSERT INTO organizer_plans (user_id, plan) VALUES (v_uid, 'free') ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN public.my_organizer_plan();
END;
$$;

-- ===================== Estado del plan =====================
CREATE OR REPLACE FUNCTION public.organizer_plan_of(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  op organizer_plans%ROWTYPE;
  v_free boolean := public.organizer_is_free(p_user);
  v_leagues integer;
  v_used integer;
BEGIN
  SELECT * INTO op FROM organizer_plans WHERE user_id = p_user;
  SELECT count(*) INTO v_leagues FROM leagues WHERE admin_id = p_user;
  SELECT count(DISTINCT s.match_id) INTO v_used
  FROM match_sheets s
  JOIN matches m ON m.id = s.match_id
  JOIN championships c ON c.id = m.championship_id
  LEFT JOIN leagues l ON l.id = c.league_id
  WHERE COALESCE(l.admin_id, c.admin_id) = p_user AND s.ai_result IS NOT NULL;
  RETURN jsonb_build_object(
    'plan',          CASE WHEN v_free THEN 'free' ELSE 'premium' END,
    'premium_until', op.premium_until,
    'trial_ends_at', op.trial_ends_at,
    'locked',        public.organizer_is_locked(p_user),
    'leagues',       v_leagues,
    'league_limit',  CASE WHEN v_free THEN 1 END,
    'sheets_used',   v_used,
    'sheet_limit',   CASE WHEN v_free THEN COALESCE(op.sheet_limit, 5) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.my_organizer_plan()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;
  RETURN public.organizer_plan_of(auth.uid());
END;
$$;

-- ¿Se puede leer con IA una papeleta de este partido? (lo usa la Edge Function antes de llamar a la IA)
CREATE OR REPLACE FUNCTION public.match_sheet_quota(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_champ uuid;
  v_owner uuid;
  v_plan jsonb;
  v_reads integer;
  v_used integer;
  v_limit integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;
  SELECT championship_id INTO v_champ FROM matches WHERE id = p_match_id;
  IF v_champ IS NULL THEN
    RAISE EXCEPTION 'Partido no encontrado' USING ERRCODE = 'P0002';
  END IF;
  v_owner := public.championship_owner(v_champ);
  v_plan := public.organizer_plan_of(v_owner);

  IF (v_plan->>'locked')::boolean THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'locked', 'plan', 'free',
      'message', 'El periodo gratis de esta liga terminó: está en solo lectura hasta activar el plan Premium.');
  END IF;
  IF v_plan->>'plan' = 'premium' THEN
    RETURN jsonb_build_object('allowed', true, 'plan', 'premium');
  END IF;

  SELECT count(*) INTO v_reads FROM match_sheets WHERE match_id = p_match_id AND ai_result IS NOT NULL;
  v_used := (v_plan->>'sheets_used')::int;
  v_limit := (v_plan->>'sheet_limit')::int;

  IF v_reads > 0 THEN
    IF v_reads >= 3 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'retries', 'plan', 'free', 'used', v_used, 'limit', v_limit,
        'message', 'Ya se leyó 3 veces la papeleta de este partido. Corrige los datos a mano con «Registrar Detalles».');
    END IF;
    RETURN jsonb_build_object('allowed', true, 'plan', 'free', 'used', v_used, 'limit', v_limit, 'counts', false);
  END IF;
  IF v_used >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota', 'plan', 'free', 'used', v_used, 'limit', v_limit,
      'message', format('Usaste las %s papeletas de prueba. La lectura automática de papeletas es una función Premium.', v_limit));
  END IF;
  RETURN jsonb_build_object('allowed', true, 'plan', 'free', 'used', v_used, 'limit', v_limit, 'counts', true);
END;
$$;

-- ===================== Límites (triggers) =====================
-- Ligas: plan Gratis = 1 liga; la primera liga inicia los 6 meses gratis.
CREATE OR REPLACE FUNCTION public.trg_leagues_plan_limits()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.plan_limits_bypass() OR NOT public.organizer_is_free(NEW.admin_id) THEN
    RETURN NEW;
  END IF;
  IF public.organizer_is_locked(NEW.admin_id) THEN
    RAISE EXCEPTION 'Tu periodo gratis terminó. Activa el plan Premium para crear o seguir editando tu liga.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM leagues WHERE admin_id = NEW.admin_id) THEN
    RAISE EXCEPTION 'Con el plan Gratis puedes publicar una liga. Agrega tus campeonatos como series de esa liga.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO organizer_plans (user_id, plan, trial_ends_at)
  VALUES (NEW.admin_id, 'free', now() + interval '6 months')
  ON CONFLICT (user_id) DO UPDATE
    SET trial_ends_at = COALESCE(organizer_plans.trial_ends_at, EXCLUDED.trial_ends_at), updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_leagues_plan_limits ON public.leagues;
CREATE TRIGGER trg_leagues_plan_limits
  BEFORE INSERT ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.trg_leagues_plan_limits();

-- Campeonatos: en Gratis deben ser series de su liga; en solo lectura no se crean ni editan.
CREATE OR REPLACE FUNCTION public.trg_championships_plan_limits()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF public.plan_limits_bypass() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND public.championship_is_locked(OLD.id) THEN
    RAISE EXCEPTION 'Tu periodo gratis terminó: esta liga está en solo lectura. Activa el plan Premium para editarla.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  v_owner := COALESCE((SELECT admin_id FROM leagues WHERE id = NEW.league_id), NEW.admin_id);
  IF public.organizer_is_locked(v_owner) THEN
    RAISE EXCEPTION 'Tu periodo gratis terminó: esta liga está en solo lectura. Activa el plan Premium para editarla.' USING ERRCODE = '42501';
  END IF;
  IF public.organizer_is_free(NEW.admin_id) AND NEW.league_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.league_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Con el plan Gratis los campeonatos se crean como series de tu liga. Crea tu liga primero y elígela.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_championships_plan_limits ON public.championships;
CREATE TRIGGER trg_championships_plan_limits
  BEFORE INSERT OR UPDATE OR DELETE ON public.championships
  FOR EACH ROW EXECUTE FUNCTION public.trg_championships_plan_limits();

-- Solo lectura para lo que cuelga de un campeonato (equipos, partidos, sanciones)
CREATE OR REPLACE FUNCTION public.trg_championship_child_readonly()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.plan_limits_bypass() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF (TG_OP <> 'INSERT' AND public.championship_is_locked(OLD.championship_id))
     OR (TG_OP <> 'DELETE' AND public.championship_is_locked(NEW.championship_id)) THEN
    RAISE EXCEPTION 'Tu periodo gratis terminó: esta liga está en solo lectura. Activa el plan Premium para editarla.' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_teams_plan_readonly ON public.teams;
CREATE TRIGGER trg_teams_plan_readonly BEFORE INSERT OR UPDATE OR DELETE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.trg_championship_child_readonly();
DROP TRIGGER IF EXISTS trg_matches_plan_readonly ON public.matches;
CREATE TRIGGER trg_matches_plan_readonly BEFORE INSERT OR UPDATE OR DELETE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.trg_championship_child_readonly();
DROP TRIGGER IF EXISTS trg_sanctions_plan_readonly ON public.sanctions;
CREATE TRIGGER trg_sanctions_plan_readonly BEFORE INSERT OR UPDATE OR DELETE ON public.sanctions
  FOR EACH ROW EXECUTE FUNCTION public.trg_championship_child_readonly();

-- Eventos de partido (goles y tarjetas)
CREATE OR REPLACE FUNCTION public.trg_match_events_plan_readonly()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_champ uuid;
BEGIN
  IF public.plan_limits_bypass() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT championship_id INTO v_champ FROM matches WHERE id = COALESCE(NEW.match_id, OLD.match_id);
  IF v_champ IS NOT NULL AND public.championship_is_locked(v_champ) THEN
    RAISE EXCEPTION 'Tu periodo gratis terminó: esta liga está en solo lectura. Activa el plan Premium para editarla.' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_match_events_plan_readonly ON public.match_events;
CREATE TRIGGER trg_match_events_plan_readonly BEFORE INSERT OR UPDATE OR DELETE ON public.match_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_match_events_plan_readonly();

-- Perfiles creados desde la app: siempre 'usuario' (el rol se cambia solo por RPC o el admin)
CREATE OR REPLACE FUNCTION public.trg_profiles_force_default_role()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND COALESCE(public.current_user_role(), '') <> 'admin_sistema' THEN
    NEW.role := 'usuario';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_force_default_role ON public.profiles;
CREATE TRIGGER trg_profiles_force_default_role BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_force_default_role();

-- ===================== Administración (admin del sistema) =====================
CREATE OR REPLACE FUNCTION public.admin_list_organizers(p_search text DEFAULT NULL, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE (
  user_id uuid, full_name text, plan text, premium_until timestamptz, trial_ends_at timestamptz,
  locked boolean, leagues integer, sheets_used integer, sheet_limit integer, created_at timestamptz, total bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin_sistema' THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.full_name, op.created_at AS joined
    FROM profiles p
    LEFT JOIN organizer_plans op ON op.user_id = p.id
    WHERE p.role::text = 'admin_campeonato'
      AND (p_search IS NULL OR p_search = '' OR p.full_name ILIKE '%' || p_search || '%')
  ), page AS (
    SELECT b.*, count(*) OVER () AS total FROM base b
    ORDER BY b.joined DESC NULLS LAST, b.full_name
    LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0)
  )
  SELECT pg.id, pg.full_name, j->>'plan', (j->>'premium_until')::timestamptz, (j->>'trial_ends_at')::timestamptz,
         (j->>'locked')::boolean, (j->>'leagues')::int, (j->>'sheets_used')::int, (j->>'sheet_limit')::int,
         pg.joined, pg.total
  FROM page pg CROSS JOIN LATERAL public.organizer_plan_of(pg.id) j
  ORDER BY pg.joined DESC NULLS LAST, pg.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_organizer_plan(p_user uuid, p_plan text, p_premium_until timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin_sistema' THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_plan NOT IN ('free', 'premium') THEN
    RAISE EXCEPTION 'Plan inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user AND role::text = 'admin_campeonato') THEN
    RAISE EXCEPTION 'El usuario no es organizador' USING ERRCODE = '22023';
  END IF;
  INSERT INTO organizer_plans (user_id, plan, premium_until, updated_by)
  VALUES (p_user, p_plan, CASE WHEN p_plan = 'premium' THEN p_premium_until END, auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET plan = EXCLUDED.plan, premium_until = EXCLUDED.premium_until, updated_by = EXCLUDED.updated_by, updated_at = now();
  RETURN public.organizer_plan_of(p_user);
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_is_free(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.championship_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organizer_is_locked(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.championship_is_locked(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plan_limits_bypass() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organizer_plan_of(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.become_organizer() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_organizer_plan() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_sheet_quota(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_organizers(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_organizer_plan(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.championship_is_locked(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.become_organizer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_organizer_plan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_sheet_quota(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_organizers(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_organizer_plan(uuid, text, timestamptz) TO authenticated;
