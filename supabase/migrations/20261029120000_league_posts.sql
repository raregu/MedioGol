/*
  # Muro de avisos por liga

  El organizador publica avisos de su liga ("Fecha suspendida", "Cambio de horario", avisos
  generales). El aviso vigente más importante se muestra destacado en la tarjeta de la liga
  (Inicio y /leagues), en la página de la liga, en cada serie y en "Siguiendo".

  1. Tabla `league_posts`
     - kind: 'aviso' | 'suspension' | 'horario'
     - title (3..120), body opcional (hasta 2000), pinned (fijado), expires_at (visible hasta).
     - Vigente = no vencido y (fijado o publicado hace menos de 7 días).
  2. Seguridad (RLS)
     - Lectura pública (anon y authenticated): los avisos son públicos como la liga.
     - Escritura: quien administra la liga (can_manage_league) o admin_sistema.
     - Tope: 30 avisos por liga cada 24 horas (evita abuso).
  3. Lecturas para miles de usuarios (una sola llamada, índice por liga y fecha)
     - league_summaries(...) ahora incluye `notice` (aviso vigente) para las tarjetas.
     - league_active_notice(liga): aviso vigente de una liga (página de la serie).
     - my_league_notices(): avisos vigentes de las ligas que sigo (Inicio, "Siguiendo").

  Idempotente.
*/

CREATE TABLE IF NOT EXISTS public.league_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  author_id uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'aviso' CHECK (kind IN ('aviso', 'suspension', 'horario')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  body text CHECK (body IS NULL OR char_length(body) <= 2000),
  pinned boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_league_posts_league_created ON public.league_posts (league_id, created_at DESC);

ALTER TABLE public.league_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_posts FROM anon, authenticated;
GRANT SELECT ON public.league_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.league_posts TO authenticated;

DROP POLICY IF EXISTS "Avisos de liga públicos" ON public.league_posts;
CREATE POLICY "Avisos de liga públicos" ON public.league_posts
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Organizador publica avisos" ON public.league_posts;
CREATE POLICY "Organizador publica avisos" ON public.league_posts
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND can_manage_league(league_id));
DROP POLICY IF EXISTS "Organizador edita avisos" ON public.league_posts;
CREATE POLICY "Organizador edita avisos" ON public.league_posts
  FOR UPDATE TO authenticated
  USING (can_manage_league(league_id)) WITH CHECK (can_manage_league(league_id));
DROP POLICY IF EXISTS "Organizador borra avisos" ON public.league_posts;
CREATE POLICY "Organizador borra avisos" ON public.league_posts
  FOR DELETE TO authenticated USING (can_manage_league(league_id));

-- Normaliza, controla el tope diario y mantiene updated_at
CREATE OR REPLACE FUNCTION public.trg_league_posts_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.title := btrim(NEW.title);
  NEW.body := NULLIF(btrim(COALESCE(NEW.body, '')), '');
  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM league_posts
        WHERE league_id = NEW.league_id AND created_at > now() - interval '24 hours') >= 30 THEN
      RAISE EXCEPTION 'Llegaste al máximo de 30 avisos por día en esta liga.' USING ERRCODE = '22023';
    END IF;
    NEW.created_at := now();
  ELSE
    NEW.league_id := OLD.league_id;
    NEW.author_id := OLD.author_id;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_league_posts_guard ON public.league_posts;
CREATE TRIGGER trg_league_posts_guard BEFORE INSERT OR UPDATE ON public.league_posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_league_posts_guard();

-- Aviso vigente de una liga (o NULL). Fijados primero; luego el más reciente de los últimos 7 días.
CREATE OR REPLACE FUNCTION public.league_active_notice(p_league_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'league_id', p.league_id, 'kind', p.kind, 'title', p.title, 'body', p.body,
    'pinned', p.pinned, 'created_at', p.created_at
  )
  FROM league_posts p
  WHERE p.league_id = p_league_id
    AND (p.expires_at IS NULL OR p.expires_at > now())
    AND (p.pinned OR p.created_at > now() - interval '7 days')
  ORDER BY p.pinned DESC, p.created_at DESC
  LIMIT 1;
$$;

-- Avisos vigentes de las ligas que sigo (a través de sus series), máx. 10
CREATE OR REPLACE FUNCTION public.my_league_notices()
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(s.x ORDER BY s.x->>'created_at' DESC), '[]'::jsonb)
  FROM (
    SELECT n.notice || jsonb_build_object('league_name', n.name) AS x
    FROM (
      SELECT l.name, league_active_notice(l.id) AS notice
      FROM leagues l
      WHERE l.id IN (
        SELECT c.league_id FROM championship_follows f
        JOIN championships c ON c.id = f.championship_id
        WHERE f.user_id = auth.uid() AND c.league_id IS NOT NULL
      )
    ) n
    WHERE n.notice IS NOT NULL
    ORDER BY n.notice->>'created_at' DESC
    LIMIT 10
  ) s;
$$;

-- league_summaries: se agrega `notice` (cambia el tipo de retorno, por eso DROP + CREATE)
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
  notice jsonb
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
         league_active_notice(pk.id)
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
GRANT EXECUTE ON FUNCTION public.league_active_notice(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.my_league_notices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_league_notices() TO authenticated;
