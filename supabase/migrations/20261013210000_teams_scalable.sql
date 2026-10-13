-- =====================================================================
-- Equipos escalables: /teams y /my-teams sin descargar todo ni N+1.
--  * search_base_teams(): búsqueda + paginación en el servidor, con conteos
--    de jugadores y campeonatos calculados solo para la página pedida.
--  * my_team_challenges() / my_sent_invitations(): actividad de los equipos
--    que capitaneo, sin mandar cientos de ids desde el navegador.
--  * Índices para las consultas de equipos.
-- Idempotente.
-- =====================================================================

-- ---------- Índices ----------
CREATE INDEX IF NOT EXISTS idx_base_teams_name_trgm
  ON public.base_teams USING gin (public.f_unaccent(name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_base_teams_status_name ON public.base_teams (status, name);
CREATE INDEX IF NOT EXISTS idx_base_team_players_team_status ON public.base_team_players (base_team_id, status);
CREATE INDEX IF NOT EXISTS idx_base_team_players_player_status ON public.base_team_players (player_id, status);
CREATE INDEX IF NOT EXISTS idx_team_registrations_base_team ON public.team_registrations (base_team_id, status);
CREATE INDEX IF NOT EXISTS idx_teams_captain_created ON public.teams (captain_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_players_team ON public.team_players (team_id);
CREATE INDEX IF NOT EXISTS idx_team_players_player_active ON public.team_players (player_id, is_active);
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON public.challenges (challenger_team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_challenges_challenged ON public.challenges (challenged_team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_team ON public.invitations (team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_status ON public.invitations (invited_user_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_to_type ON public.messages (to_user_id, message_type);

-- ---------- Directorio de equipos ----------
-- Datos públicos del equipo + conteos (los conteos no exponen a nadie).
-- Equipos inactivos solo los ve su dueño.
CREATE OR REPLACE FUNCTION public.search_base_teams(p_query text DEFAULT NULL, p_limit int DEFAULT 24, p_offset int DEFAULT 0)
RETURNS TABLE (
  id uuid,
  name text,
  logo_url text,
  description text,
  status text,
  founded_date date,
  owner_id uuid,
  owner_name text,
  players_count int,
  championships_count int,
  total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH q AS (
    SELECT NULLIF(public.f_unaccent(btrim(COALESCE(p_query, ''))), '') AS t
  ),
  page AS (
    SELECT bt.id, bt.name, bt.logo_url, bt.description, bt.status, bt.founded_date, bt.owner_id,
           count(*) OVER () AS total_count
    FROM base_teams bt, q
    WHERE (bt.status IS DISTINCT FROM 'inactive' OR bt.owner_id = auth.uid())
      AND (q.t IS NULL OR public.f_unaccent(bt.name) LIKE '%' || q.t || '%')
    ORDER BY (bt.status IS NOT DISTINCT FROM 'inactive'), bt.name
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 60)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT p.id, p.name::text, p.logo_url::text, p.description::text, p.status::text, p.founded_date::date, p.owner_id,
         pr.full_name::text,
         (SELECT count(*)::int FROM base_team_players btp WHERE btp.base_team_id = p.id AND btp.status = 'active'),
         (SELECT count(*)::int FROM team_registrations tr WHERE tr.base_team_id = p.id AND tr.status = 'confirmed'),
         p.total_count
  FROM page p
  LEFT JOIN profiles pr ON pr.id = p.owner_id
  ORDER BY (p.status IS NOT DISTINCT FROM 'inactive'), p.name;
$$;

-- ---------- Actividad de mis equipos (capitán) ----------
-- SECURITY INVOKER: respetan las políticas RLS de challenges e invitations.
CREATE OR REPLACE FUNCTION public.my_team_challenges(p_limit int DEFAULT 50)
RETURNS SETOF jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT to_jsonb(c)
         || jsonb_build_object(
              'challenger_team', jsonb_build_object('name', t1.name),
              'challenged_team', jsonb_build_object('name', t2.name),
              'i_am_challenged', (t2.captain_id = auth.uid())
            )
  FROM challenges c
  JOIN teams t1 ON t1.id = c.challenger_team_id
  JOIN teams t2 ON t2.id = c.challenged_team_id
  WHERE t1.captain_id = auth.uid() OR t2.captain_id = auth.uid()
  ORDER BY c.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

CREATE OR REPLACE FUNCTION public.my_sent_invitations(p_limit int DEFAULT 50)
RETURNS SETOF jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT to_jsonb(i)
         || jsonb_build_object(
              'team', jsonb_build_object('name', t.name),
              'invited_user', jsonb_build_object('full_name', pr.full_name)
            )
  FROM invitations i
  JOIN teams t ON t.id = i.team_id
  LEFT JOIN profiles pr ON pr.id = i.invited_user_id
  WHERE t.captain_id = auth.uid()
  ORDER BY i.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

GRANT EXECUTE ON FUNCTION public.search_base_teams(text, int, int) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.my_team_challenges(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_sent_invitations(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_challenges(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_sent_invitations(int) TO authenticated;
