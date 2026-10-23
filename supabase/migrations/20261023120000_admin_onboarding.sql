/*
  Guía de inicio para administradores de campeonato.

  - profiles.onboarding_hidden_at: cuándo eligió "No volver a mostrar" (NULL = se muestra).
  - admin_onboarding_status(): avance de los pasos calculado en el servidor, una sola llamada
    con EXISTS (corta en la primera fila) sobre índices. Sirve para miles de administradores.
  - set_admin_onboarding_hidden(bool): ocultar o volver a mostrar la guía (solo la propia).

  Idempotente.
*/
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_hidden_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_championships_admin_id ON public.championships (admin_id);
CREATE INDEX IF NOT EXISTS idx_leagues_admin_id ON public.leagues (admin_id);
CREATE INDEX IF NOT EXISTS idx_championships_league ON public.championships (league_id) WHERE league_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_teams_championship_id ON public.teams (championship_id);
CREATE INDEX IF NOT EXISTS idx_matches_championship_id ON public.matches (championship_id);

CREATE OR REPLACE FUNCTION public.admin_onboarding_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hidden timestamptz;
  v_ids uuid[];
  v_league uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT onboarding_hidden_at INTO v_hidden FROM profiles WHERE id = v_uid;
  SELECT id INTO v_league FROM leagues WHERE admin_id = v_uid ORDER BY created_at LIMIT 1;

  -- Campeonatos propios o series de mis ligas (los más recientes primero, con tope)
  SELECT coalesce(array_agg(s.id ORDER BY s.created_at DESC), '{}') INTO v_ids
  FROM (
    SELECT c.id, c.created_at
    FROM championships c
    WHERE c.admin_id = v_uid
       OR c.league_id IN (SELECT l.id FROM leagues l WHERE l.admin_id = v_uid)
    ORDER BY c.created_at DESC
    LIMIT 300
  ) s;

  RETURN jsonb_build_object(
    'hidden',           v_hidden IS NOT NULL,
    'championship_id',  v_ids[1],
    'league_id',        v_league,
    'has_championship', cardinality(v_ids) > 0,
    'has_teams',        EXISTS (SELECT 1 FROM teams t WHERE t.championship_id = ANY (v_ids)),
    'has_captain',      EXISTS (SELECT 1 FROM teams t WHERE t.championship_id = ANY (v_ids) AND t.captain_id IS NOT NULL),
    'has_matches',      EXISTS (SELECT 1 FROM matches m WHERE m.championship_id = ANY (v_ids)),
    'has_result',       EXISTS (SELECT 1 FROM matches m WHERE m.championship_id = ANY (v_ids) AND m.status IN ('finished', 'completed')),
    'has_fees',         EXISTS (SELECT 1 FROM championship_fee_settings f WHERE f.championship_id = ANY (v_ids))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_onboarding_hidden(p_hidden boolean)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  UPDATE profiles
  SET onboarding_hidden_at = CASE WHEN p_hidden THEN now() ELSE NULL END
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_onboarding_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_admin_onboarding_hidden(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_onboarding_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_onboarding_hidden(boolean) TO authenticated;
