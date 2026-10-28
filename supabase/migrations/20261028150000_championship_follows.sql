/*
  Seguir campeonatos.

  - championship_follows: qué campeonatos sigue cada usuario (máx. 200 por usuario).
    Cada uno ve y maneja solo los suyos (RLS).
  - follow_league(liga, seguir): sigue o deja de seguir todas las series de una liga en una llamada.
  - championship_follower_count(campeonato): cantidad de seguidores (público).
  - my_follow_feed(limite): para el Inicio, los campeonatos que sigo con sus últimos resultados y
    próximos partidos, calculado en el servidor en una sola llamada (índices por campeonato y fecha).

  Idempotente.
*/

CREATE TABLE IF NOT EXISTS public.championship_follows (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  championship_id uuid NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, championship_id)
);
CREATE INDEX IF NOT EXISTS idx_championship_follows_championship ON public.championship_follows (championship_id);
CREATE INDEX IF NOT EXISTS idx_matches_champ_date ON public.matches (championship_id, match_date);

ALTER TABLE public.championship_follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.championship_follows FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.championship_follows TO authenticated;

DROP POLICY IF EXISTS "Veo lo que sigo" ON public.championship_follows;
CREATE POLICY "Veo lo que sigo" ON public.championship_follows
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Sigo campeonatos" ON public.championship_follows;
CREATE POLICY "Sigo campeonatos" ON public.championship_follows
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Dejo de seguir" ON public.championship_follows;
CREATE POLICY "Dejo de seguir" ON public.championship_follows
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Tope por usuario (evita abuso)
CREATE OR REPLACE FUNCTION public.trg_championship_follows_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM championship_follows WHERE user_id = NEW.user_id) >= 200 THEN
    RAISE EXCEPTION 'Puedes seguir hasta 200 campeonatos.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_championship_follows_limit ON public.championship_follows;
CREATE TRIGGER trg_championship_follows_limit BEFORE INSERT ON public.championship_follows
  FOR EACH ROW EXECUTE FUNCTION public.trg_championship_follows_limit();

CREATE OR REPLACE FUNCTION public.championship_follower_count(p_championship_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT count(*)::int FROM championship_follows WHERE championship_id = p_championship_id $$;

CREATE OR REPLACE FUNCTION public.follow_league(p_league_id uuid, p_follow boolean)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;
  IF p_follow THEN
    IF (SELECT count(*) FROM championship_follows WHERE user_id = v_uid)
       + (SELECT count(*) FROM championships c WHERE c.league_id = p_league_id
          AND NOT EXISTS (SELECT 1 FROM championship_follows f WHERE f.user_id = v_uid AND f.championship_id = c.id)) > 200 THEN
      RAISE EXCEPTION 'Puedes seguir hasta 200 campeonatos.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO championship_follows (user_id, championship_id)
    SELECT v_uid, c.id FROM championships c WHERE c.league_id = p_league_id
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM championship_follows f
    USING championships c
    WHERE f.user_id = v_uid AND c.id = f.championship_id AND c.league_id = p_league_id;
  END IF;
  SELECT count(*) INTO v_count
  FROM championship_follows f JOIN championships c ON c.id = f.championship_id
  WHERE f.user_id = v_uid AND c.league_id = p_league_id;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_follow_feed(p_limit integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 6), 1), 20);
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(championship_id), '{}') INTO v_ids FROM championship_follows WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'championships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'series_name', c.series_name, 'league_name', l.name,
        'image_url', COALESCE(c.image_url, l.logo_url), 'status', c.status
      ) ORDER BY COALESCE(l.name, c.name), c.display_order, c.name)
      FROM championships c LEFT JOIN leagues l ON l.id = c.league_id
      WHERE c.id = ANY (v_ids)
    ), '[]'::jsonb),
    'results', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'match_date' DESC) FROM (
        SELECT jsonb_build_object(
          'id', m.id, 'championship_id', m.championship_id, 'match_date', m.match_date,
          'home_score', m.home_score, 'away_score', m.away_score, 'status', m.status, 'venue', m.venue,
          'home_team_name', COALESCE(th.name, 'Por definir'), 'away_team_name', COALESCE(ta.name, 'Por definir'),
          'competition', CASE WHEN l.name IS NOT NULL THEN l.name || ' · ' || COALESCE(c.series_name, c.name) ELSE c.name END
        ) AS x
        FROM matches m
        JOIN championships c ON c.id = m.championship_id
        LEFT JOIN leagues l ON l.id = c.league_id
        LEFT JOIN teams th ON th.id = m.home_team_id
        LEFT JOIN teams ta ON ta.id = m.away_team_id
        WHERE m.championship_id = ANY (v_ids) AND m.status IN ('finished', 'completed')
        ORDER BY m.match_date DESC
        LIMIT v_limit
      ) r
    ), '[]'::jsonb),
    'upcoming', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'match_date') FROM (
        SELECT jsonb_build_object(
          'id', m.id, 'championship_id', m.championship_id, 'match_date', m.match_date,
          'home_score', m.home_score, 'away_score', m.away_score, 'status', m.status, 'venue', m.venue,
          'home_team_name', COALESCE(th.name, 'Por definir'), 'away_team_name', COALESCE(ta.name, 'Por definir'),
          'competition', CASE WHEN l.name IS NOT NULL THEN l.name || ' · ' || COALESCE(c.series_name, c.name) ELSE c.name END
        ) AS x
        FROM matches m
        JOIN championships c ON c.id = m.championship_id
        LEFT JOIN leagues l ON l.id = c.league_id
        LEFT JOIN teams th ON th.id = m.home_team_id
        LEFT JOIN teams ta ON ta.id = m.away_team_id
        WHERE m.championship_id = ANY (v_ids) AND m.status IN ('scheduled', 'playing') AND m.match_date >= now() - interval '3 hours'
        ORDER BY m.match_date
        LIMIT v_limit
      ) u
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.championship_follower_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.follow_league(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_follow_feed(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.championship_follower_count(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.follow_league(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_follow_feed(integer) TO authenticated;
