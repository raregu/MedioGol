/*
  # Inicio "Siguiendo | Todo"

  El usuario que sigue ligas o campeonatos elige qué ve en el Inicio:
  - "Siguiendo": solo lo que sigue (avisos, resultados, próximos, tabla general de sus ligas, goleadores).
  - "Todo": el Inicio general.
  La elección se guarda en su cuenta (profiles.home_view) y vale en todos sus dispositivos.

  1. profiles.home_view ('following' | 'all'; NULL = automático: "Siguiendo" si sigue algo).
  2. set_home_view(vista): cambia solo esa columna del usuario conectado (no toca rol ni otros datos).
  3. my_follow_feed: agrega `leagues` (ids de las ligas que sigo) y `scorers` (goleadores de lo que sigo),
     calculado en el servidor en la misma llamada. Mantiene las claves existentes.

  Requiere 20261028150000_championship_follows.sql. Idempotente.
*/

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS home_view text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_home_view_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_home_view_check CHECK (home_view IS NULL OR home_view IN ('following', 'all'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_home_view(p_view text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;
  IF p_view IS NOT NULL AND p_view NOT IN ('following', 'all') THEN
    RAISE EXCEPTION 'Vista no válida' USING ERRCODE = '22023';
  END IF;
  UPDATE profiles SET home_view = p_view WHERE id = auth.uid();
  RETURN p_view;
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
    -- Ligas de lo que sigo (para sus tarjetas con tabla general y avisos)
    'leagues', COALESCE((
      SELECT jsonb_agg(x.league_id ORDER BY x.name)
      FROM (
        SELECT DISTINCT l.id AS league_id, l.name
        FROM championships c JOIN leagues l ON l.id = c.league_id
        WHERE c.id = ANY (v_ids)
      ) x
    ), '[]'::jsonb),
    -- Goleadores solo de lo que sigo (sin autogoles)
    'scorers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('player_id', s.player_id, 'player_name', s.full_name, 'team_name', s.team_name, 'goals', s.goals)
                       ORDER BY s.goals DESC, s.full_name)
      FROM (
        SELECT e.player_id, pp.full_name, (array_agg(t.name ORDER BY e.created_at DESC))[1] AS team_name, count(*)::int AS goals
        FROM match_events e
        JOIN matches m ON m.id = e.match_id
        JOIN player_profiles pp ON pp.id = e.player_id
        LEFT JOIN teams t ON t.id = e.team_id
        WHERE m.championship_id = ANY (v_ids)
          AND e.event_type = 'goal'
          AND e.player_id IS NOT NULL
          AND COALESCE(e.additional_info ->> 'type', '') <> 'own_goal'
        GROUP BY e.player_id, pp.full_name
        ORDER BY count(*) DESC, pp.full_name
        LIMIT 5
      ) s
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

REVOKE ALL ON FUNCTION public.set_home_view(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_home_view(text) TO authenticated;
REVOKE ALL ON FUNCTION public.my_follow_feed(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_follow_feed(integer) TO authenticated;
