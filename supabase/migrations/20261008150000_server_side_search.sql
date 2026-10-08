/*
  # Búsqueda en el servidor (escalable)

  El buscador ya no descarga todos los campeonatos/equipos/jugadores al navegador.
  Todo se filtra y pagina en Postgres, con índices trigram que funcionan con
  búsquedas parciales y sin tildes.

  1. Extensiones: unaccent y pg_trgm (schema extensions).
  2. f_unaccent(text): wrapper IMMUTABLE para poder indexar.
  3. championships.search_text: texto normalizado (sin tildes, minúsculas) con
     nombre, recinto, ubicación, serie, liga y nombres de equipos.
     Se mantiene con triggers sobre championships, teams y leagues.
     Índice GIN trigram → LIKE '%palabra%' usa índice.
  4. leagues.search_text + índice, player_profiles índice por nombre.
  5. RPCs paginadas (SECURITY INVOKER, respetan RLS):
     - search_championships(...)
     - search_leagues(...)
     - search_players(...)
     - championship_sports()
*/

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
SET search_path = public, extensions
AS $$
  SELECT lower(extensions.unaccent('extensions.unaccent'::regdictionary, $1));
$$;

-- Palabras de la consulta normalizadas (máximo 6)
CREATE OR REPLACE FUNCTION public.search_words(p_query text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (SELECT array_agg(w) FROM (
       SELECT w FROM unnest(regexp_split_to_array(trim(public.f_unaccent(coalesce(p_query, ''))), '\s+')) AS w
       WHERE w <> '' LIMIT 6
     ) x),
    '{}'::text[]
  );
$$;

-- ------------------------------------------------------------------
-- championships.search_text
-- ------------------------------------------------------------------
ALTER TABLE championships ADD COLUMN IF NOT EXISTS search_text text;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS search_text text;

CREATE OR REPLACE FUNCTION public.trg_championship_search_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  NEW.search_text := public.f_unaccent(concat_ws(' ',
    NEW.name, NEW.venue, NEW.location, NEW.sport, NEW.series_name,
    (SELECT concat_ws(' ', l.name, l.season) FROM leagues l WHERE l.id = NEW.league_id),
    (SELECT string_agg(t.name, ' ') FROM teams t WHERE t.championship_id = NEW.id)
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_championship_search_text ON championships;
CREATE TRIGGER trg_championship_search_text
  BEFORE INSERT OR UPDATE OF name, venue, location, sport, series_name, league_id, search_text
  ON championships
  FOR EACH ROW EXECUTE FUNCTION public.trg_championship_search_text();

-- Cambios en equipos → recalcular el campeonato
CREATE OR REPLACE FUNCTION public.trg_team_refresh_championship_search()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE championships SET search_text = NULL WHERE id = OLD.championship_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.championship_id IS DISTINCT FROM OLD.championship_id OR NEW.name IS DISTINCT FROM OLD.name) THEN
    UPDATE championships SET search_text = NULL WHERE id = NEW.championship_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_refresh_championship_search ON teams;
CREATE TRIGGER trg_team_refresh_championship_search
  AFTER INSERT OR DELETE OR UPDATE OF name, championship_id ON teams
  FOR EACH ROW EXECUTE FUNCTION public.trg_team_refresh_championship_search();

-- leagues.search_text y propagación a sus campeonatos
CREATE OR REPLACE FUNCTION public.trg_league_search_text()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  NEW.search_text := public.f_unaccent(concat_ws(' ', NEW.name, NEW.season, NEW.location, NEW.description));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_league_search_text ON leagues;
CREATE TRIGGER trg_league_search_text
  BEFORE INSERT OR UPDATE OF name, season, location, description ON leagues
  FOR EACH ROW EXECUTE FUNCTION public.trg_league_search_text();

CREATE OR REPLACE FUNCTION public.trg_league_refresh_championships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.season IS DISTINCT FROM OLD.season THEN
    UPDATE championships SET search_text = NULL WHERE league_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_league_refresh_championships ON leagues;
CREATE TRIGGER trg_league_refresh_championships
  AFTER UPDATE OF name, season ON leagues
  FOR EACH ROW EXECUTE FUNCTION public.trg_league_refresh_championships();

-- Rellenar datos existentes
UPDATE leagues SET name = name;
UPDATE championships SET search_text = NULL;

-- Índices
CREATE INDEX IF NOT EXISTS idx_championships_search_text_trgm ON championships USING gin (search_text extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leagues_search_text_trgm ON leagues USING gin (search_text extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_player_profiles_name_trgm ON player_profiles USING gin (public.f_unaccent(full_name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_championships_status_created ON championships (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teams_championship_id ON teams (championship_id);

-- ------------------------------------------------------------------
-- Condición "todas las palabras" con un LIKE por palabra (usa el índice trigram).
-- Los comodines % y _ que escriba el usuario se escapan.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_like_clause(p_column text, p_words text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text := '';
  w text;
BEGIN
  FOREACH w IN ARRAY coalesce(p_words, '{}'::text[]) LOOP
    v := v || format(' AND %s LIKE %L', p_column,
      '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%');
  END LOOP;
  RETURN v;
END;
$$;

-- ------------------------------------------------------------------
-- RPC: campeonatos
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_championships(
  p_query text DEFAULT NULL,
  p_sport text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_league_id uuid DEFAULT NULL,
  p_without_league boolean DEFAULT false,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  sport text,
  venue text,
  description text,
  status text,
  start_date date,
  image_url text,
  admin_id uuid,
  league_id uuid,
  series_name text,
  league_name text,
  league_season text,
  team_count bigint,
  matched_team text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_words text[] := public.search_words(p_query);
BEGIN
  RETURN QUERY EXECUTE format($q$
    WITH me AS (
      SELECT auth.uid() AS uid,
             EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin_sistema') AS is_sys
    ),
    filtered AS (
      SELECT c.*
      FROM championships c, me
      WHERE (c.status <> 'draft' OR c.admin_id = me.uid OR me.is_sys)
        AND ($1::text IS NULL OR public.f_unaccent(c.sport) = public.f_unaccent($1))
        AND ($2::text IS NULL OR c.status = $2)
        AND ($3::uuid IS NULL OR c.league_id = $3)
        AND (NOT $4 OR c.league_id IS NULL)
        %s
    )
    SELECT
      f.id, f.name, f.sport, f.venue, f.description, f.status::text, f.start_date, f.image_url, f.admin_id,
      f.league_id, f.series_name, l.name, l.season,
      (SELECT count(*) FROM teams t WHERE t.championship_id = f.id),
      (SELECT t.name FROM teams t
        WHERE t.championship_id = f.id AND cardinality($5) > 0
          AND EXISTS (SELECT 1 FROM unnest($5) AS word WHERE public.f_unaccent(t.name) LIKE '%%' || word || '%%')
          AND EXISTS (
            SELECT 1 FROM unnest($5) AS word
            WHERE public.f_unaccent(concat_ws(' ', f.name, f.venue, f.location, f.series_name, l.name)) NOT LIKE '%%' || word || '%%'
          )
        LIMIT 1),
      count(*) OVER ()
    FROM filtered f
    LEFT JOIN leagues l ON l.id = f.league_id
    ORDER BY CASE f.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, f.created_at DESC
    LIMIT $6 OFFSET $7
  $q$, public.search_like_clause('c.search_text', v_words))
  USING p_sport, p_status, p_league_id, coalesce(p_without_league, false), v_words,
        least(greatest(coalesce(p_limit, 24), 1), 100), greatest(coalesce(p_offset, 0), 0);
END;
$fn$;

-- ------------------------------------------------------------------
-- RPC: ligas
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_leagues(
  p_query text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 12,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  season text,
  location text,
  logo_url text,
  status text,
  admin_id uuid,
  series_count bigint,
  series_names text[],
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH w AS (SELECT public.search_words(p_query) AS words),
  me AS (
    SELECT auth.uid() AS uid,
           EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin_sistema') AS is_sys
  )
  SELECT
    l.id, l.name, l.season, l.location, l.logo_url, l.status, l.admin_id,
    (SELECT count(*) FROM championships c WHERE c.league_id = l.id),
    (SELECT array_agg(coalesce(c.series_name, c.name) ORDER BY c.display_order, c.name) FROM championships c WHERE c.league_id = l.id),
    count(*) OVER ()
  FROM leagues l, w, me
  WHERE (l.status <> 'draft' OR l.admin_id = me.uid OR me.is_sys)
    AND (p_status IS NULL OR l.status = p_status)
    AND NOT EXISTS (
      SELECT 1 FROM unnest(w.words) AS word
      WHERE coalesce(l.search_text, '') NOT LIKE '%' || word || '%'
        -- también encuentra la liga por sus series o equipos
        AND NOT EXISTS (
          SELECT 1 FROM championships c
          WHERE c.league_id = l.id AND coalesce(c.search_text, '') LIKE '%' || word || '%'
        )
    )
  ORDER BY CASE l.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, l.name
  LIMIT least(greatest(coalesce(p_limit, 12), 1), 100)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

-- ------------------------------------------------------------------
-- RPC: jugadores (solo ids de la página; las estadísticas se piden aparte)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_players(
  p_query text DEFAULT NULL,
  p_position text DEFAULT NULL,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (id uuid, full_name text, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $fn$
BEGIN
  RETURN QUERY EXECUTE format($q$
    SELECT p.id, p.full_name, count(*) OVER ()
    FROM player_profiles p
    WHERE ($1::text IS NULL OR p.position = $1) %s
    ORDER BY p.full_name
    LIMIT $2 OFFSET $3
  $q$, public.search_like_clause('public.f_unaccent(p.full_name)', public.search_words(p_query)))
  USING p_position, least(greatest(coalesce(p_limit, 24), 1), 100), greatest(coalesce(p_offset, 0), 0);
END;
$fn$;

-- ------------------------------------------------------------------
-- RPC: deportes distintos (para el filtro)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.championship_sports()
RETURNS TABLE (sport text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT DISTINCT ON (public.f_unaccent(c.sport)) c.sport
  FROM championships c
  WHERE c.sport IS NOT NULL AND c.status <> 'draft'
  ORDER BY public.f_unaccent(c.sport), c.sport;
$$;

GRANT EXECUTE ON FUNCTION public.search_championships(text, text, text, uuid, boolean, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_leagues(text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_players(text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.championship_sports() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f_unaccent(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_words(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_like_clause(text, text[]) TO anon, authenticated;
