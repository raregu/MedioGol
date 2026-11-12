/*
  # Ligas en playoffs: destacadas en sus tarjetas

  league_summaries agrega `in_playoffs` (alguna serie de la liga está en fase de playoffs), para que la
  tarjeta de la liga en el Inicio y en /leagues muestre "Playoffs en curso" sin consultas extra.
  Cambia el tipo de retorno: DROP + CREATE (mantiene `notice`).

  Requiere 20261029120000_league_posts.sql. Idempotente.
*/

DROP FUNCTION IF EXISTS public.league_summaries(uuid[], int);
CREATE FUNCTION public.league_summaries(p_league_ids uuid[] DEFAULT NULL, p_limit int DEFAULT 4)
RETURNS TABLE (
  id uuid,
  name text,
  season text,
  location text,
  logo_url text,
  status text,
  phase_name text,
  series jsonb,
  club_count int,
  top jsonb,
  notice jsonb,
  in_playoffs boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH picked AS (
    SELECT l.*, array_position(p_league_ids, l.id) AS pos
    FROM leagues l
    WHERE p_league_ids IS NOT NULL AND l.id = ANY (p_league_ids[1:50])
    UNION ALL
    SELECT x.*, NULL::int FROM (
      SELECT l.* FROM leagues l
      WHERE p_league_ids IS NULL AND l.status = 'active'
      ORDER BY l.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 4), 1), 50)
    ) x
  )
  SELECT pk.id, pk.name, pk.season, pk.location, pk.logo_url, pk.status::text,
         dp.name,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'series_name', c.series_name)
                            ORDER BY c.display_order NULLS LAST, c.name)
           FROM championships c WHERE c.league_id = pk.id
         ), '[]'::jsonb),
         COALESCE(st.n, 0),
         COALESCE(st.top, '[]'::jsonb),
         league_active_notice(pk.id),
         EXISTS (SELECT 1 FROM championships c WHERE c.league_id = pk.id AND c.phase = 'playoffs')
  FROM picked pk
  LEFT JOIN LATERAL (
    SELECT p.id, p.name FROM league_phases p
    WHERE p.league_id = pk.id AND p.is_default
    ORDER BY p.display_order LIMIT 1
  ) dp ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS n,
           jsonb_agg(jsonb_build_object('club_key', g.club_key, 'name', g.club_name, 'points', g.points) ORDER BY g.rn)
             FILTER (WHERE g.rn <= 3) AS top
    FROM (
      SELECT s.*, row_number() OVER (ORDER BY s.points DESC, s.goal_difference DESC, s.club_name) AS rn
      FROM league_general_standings(pk.id, dp.id) s
    ) g
  ) st ON true
  ORDER BY pk.pos NULLS LAST, pk.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.league_summaries(uuid[], int) TO anon, authenticated;
