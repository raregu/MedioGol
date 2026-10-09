-- =====================================================================
-- Inicio escalable: tabla general de ligas, resúmenes de liga y goleadores
-- calculados en el servidor + índices para resultados y próximos partidos.
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================================

-- ---------- Índices ----------
CREATE INDEX IF NOT EXISTS idx_matches_championship_id ON public.matches (championship_id);
-- Últimos resultados / próximos partidos: filtro por estado y orden por fecha
CREATE INDEX IF NOT EXISTS idx_matches_status_date ON public.matches (status, match_date);
-- Goles: índice parcial, solo filas de gol
CREATE INDEX IF NOT EXISTS idx_match_events_goals ON public.match_events (match_id, player_id) WHERE event_type = 'goal';
CREATE INDEX IF NOT EXISTS idx_championships_league_id ON public.championships (league_id);
CREATE INDEX IF NOT EXISTS idx_championships_status ON public.championships (status);
CREATE INDEX IF NOT EXISTS idx_league_phases_league ON public.league_phases (league_id);
CREATE INDEX IF NOT EXISTS idx_league_adjustments_league ON public.league_adjustments (league_id);

-- ---------- Tabla general de una liga ----------
-- Fuente única de la regla (equivalente a generalStandings en src/utils/leagueStandings.ts):
--  * club = base_team_id, o "name:<nombre en minúsculas>" si el equipo no tiene club base
--  * por serie se suman los partidos finalizados de la fase (round_from..round_to) o todos si p_phase_id es NULL
--  * ajustes: los sin fase siempre; los de una fase solo en esa fase
--  * pendiente: partido no finalizado ni cancelado, de la fase, con fecha ya pasada
CREATE OR REPLACE FUNCTION public.league_general_standings(p_league_id uuid, p_phase_id uuid DEFAULT NULL)
RETURNS TABLE (
  club_key text,
  club_name text,
  logo_url text,
  played int,
  goal_difference int,
  points int,
  adjustment_points int,
  adjustment_gd int,
  by_series jsonb,
  has_pending boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH lg AS (
    SELECT l.points_win, l.points_draw, l.points_loss FROM leagues l WHERE l.id = p_league_id
  ),
  ph AS (
    SELECT p.round_from, p.round_to FROM league_phases p WHERE p.id = p_phase_id AND p.league_id = p_league_id
  ),
  ser AS (
    SELECT c.id FROM championships c WHERE c.league_id = p_league_id
  ),
  tm AS (
    SELECT t.id, t.championship_id, btrim(t.name) AS name,
           COALESCE(t.base_team_id::text, 'name:' || lower(btrim(t.name))) AS club_key,
           COALESCE(bt.logo_url, t.logo_url) AS logo
    FROM teams t
    JOIN ser ON ser.id = t.championship_id
    LEFT JOIN base_teams bt ON bt.id = t.base_team_id
  ),
  clubs AS (
    SELECT tm.club_key,
           (array_agg(tm.name ORDER BY tm.id))[1] AS club_name,
           (array_agg(tm.logo ORDER BY tm.id) FILTER (WHERE tm.logo IS NOT NULL))[1] AS logo_url
    FROM tm GROUP BY tm.club_key
  ),
  mt AS (
    SELECT m.id, m.championship_id, m.home_team_id, m.away_team_id, m.home_score, m.away_score, m.status, m.match_date
    FROM matches m
    JOIN ser ON ser.id = m.championship_id
    WHERE p_phase_id IS NULL OR EXISTS (SELECT 1 FROM ph WHERE m.round BETWEEN ph.round_from AND ph.round_to)
  ),
  fin AS (
    -- solo partidos cuyos dos equipos pertenecen a la serie
    SELECT mt.* FROM mt
    JOIN tm th ON th.id = mt.home_team_id AND th.championship_id = mt.championship_id
    JOIN tm ta ON ta.id = mt.away_team_id AND ta.championship_id = mt.championship_id
    WHERE mt.status IN ('finished', 'completed')
  ),
  side AS (
    SELECT f.championship_id, f.home_team_id AS team_id, COALESCE(f.home_score, 0) AS gf, COALESCE(f.away_score, 0) AS ga FROM fin f
    UNION ALL
    SELECT f.championship_id, f.away_team_id, COALESCE(f.away_score, 0), COALESCE(f.home_score, 0) FROM fin f
  ),
  per_series AS (
    SELECT s.championship_id, tm.club_key,
           count(*)::int AS played,
           sum(s.gf - s.ga)::int AS gd,
           sum(CASE WHEN s.gf > s.ga THEN lg.points_win WHEN s.gf = s.ga THEN lg.points_draw ELSE lg.points_loss END)::int AS pts
    FROM side s
    JOIN tm ON tm.id = s.team_id
    CROSS JOIN lg
    GROUP BY s.championship_id, tm.club_key
  ),
  team_series AS (
    SELECT DISTINCT tm.championship_id, tm.club_key FROM tm
  ),
  series_pts AS (
    SELECT c.club_key,
           jsonb_object_agg(ser.id::text, CASE WHEN ts.club_key IS NULL THEN NULL ELSE COALESCE(ps.pts, 0) END) AS by_series
    FROM clubs c
    CROSS JOIN ser
    LEFT JOIN team_series ts ON ts.club_key = c.club_key AND ts.championship_id = ser.id
    LEFT JOIN per_series ps ON ps.club_key = c.club_key AND ps.championship_id = ser.id
    GROUP BY c.club_key
  ),
  totals AS (
    SELECT ps.club_key, sum(ps.played)::int AS played, sum(ps.gd)::int AS gd, sum(ps.pts)::int AS pts
    FROM per_series ps GROUP BY ps.club_key
  ),
  adj AS (
    SELECT a.base_team_id::text AS club_key, sum(a.points)::int AS ap, sum(a.goal_difference)::int AS agd
    FROM league_adjustments a
    WHERE a.league_id = p_league_id AND (a.phase_id IS NULL OR a.phase_id = p_phase_id)
    GROUP BY a.base_team_id
  ),
  pending AS (
    SELECT DISTINCT tm.club_key
    FROM mt
    JOIN tm ON tm.id IN (mt.home_team_id, mt.away_team_id)
    WHERE mt.status NOT IN ('finished', 'completed', 'cancelled') AND mt.match_date < now()
  )
  SELECT c.club_key,
         c.club_name,
         c.logo_url,
         COALESCE(t.played, 0),
         COALESCE(t.gd, 0) + COALESCE(a.agd, 0),
         COALESCE(t.pts, 0) + COALESCE(a.ap, 0),
         COALESCE(a.ap, 0),
         COALESCE(a.agd, 0),
         COALESCE(sp.by_series, '{}'::jsonb),
         p.club_key IS NOT NULL
  FROM clubs c
  LEFT JOIN totals t ON t.club_key = c.club_key
  LEFT JOIN adj a ON a.club_key = c.club_key
  LEFT JOIN series_pts sp ON sp.club_key = c.club_key
  LEFT JOIN pending p ON p.club_key = c.club_key
  ORDER BY 6 DESC, 5 DESC, c.club_name;
$$;

-- ---------- Resumen para tarjetas de liga (Inicio y /leagues) ----------
-- p_league_ids NULL: las p_limit ligas activas más recientes (Inicio).
-- p_league_ids con valores: esas ligas en ese orden (página de ligas, máx. 50).
-- Una sola llamada reemplaza ~5 consultas y la descarga de todos los partidos por tarjeta.
CREATE OR REPLACE FUNCTION public.league_summaries(p_league_ids uuid[] DEFAULT NULL, p_limit int DEFAULT 4)
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
  top jsonb
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
         COALESCE(st.top, '[]'::jsonb)
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

-- ---------- Goleadores de campeonatos en curso ----------
CREATE OR REPLACE FUNCTION public.home_top_scorers(p_limit int DEFAULT 5)
RETURNS TABLE (player_id uuid, player_name text, team_name text, goals int)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT e.player_id,
         pp.full_name,
         (array_agg(t.name ORDER BY e.created_at DESC))[1],
         count(*)::int
  FROM match_events e
  JOIN matches m ON m.id = e.match_id
  JOIN championships c ON c.id = m.championship_id AND c.status = 'active'
  JOIN player_profiles pp ON pp.id = e.player_id
  LEFT JOIN teams t ON t.id = e.team_id
  WHERE e.event_type = 'goal'
    AND e.player_id IS NOT NULL
    AND COALESCE(e.additional_info ->> 'type', '') <> 'own_goal'
  GROUP BY e.player_id, pp.full_name
  ORDER BY count(*) DESC, pp.full_name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20);
$$;

-- Funciones SECURITY INVOKER (por defecto): respetan las políticas RLS de cada tabla.
GRANT EXECUTE ON FUNCTION public.league_general_standings(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.league_summaries(uuid[], int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.home_top_scorers(int) TO anon, authenticated;
