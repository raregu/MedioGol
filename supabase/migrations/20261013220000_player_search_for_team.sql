-- =====================================================================
-- Agregar un jugador existente a un equipo: búsqueda en el servidor.
-- Reemplaza el combobox que descargaba TODOS los jugadores de la plataforma.
--  * Mínimo 2 letras, máximo 20 resultados, sin tildes ni mayúsculas.
--  * Excluye a quienes ya están activos en ese equipo.
--  * Usa el índice trigram de player_profiles(full_name) (idx_player_profiles_name_trgm).
-- SECURITY INVOKER: respeta RLS. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.search_players_for_base_team(
  p_base_team_id uuid,
  p_query text,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (id uuid, full_name text, "position" text, photo_url text, profile_photo text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $fn$
BEGIN
  IF length(btrim(COALESCE(p_query, ''))) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format($q$
    SELECT p.id, p.full_name::text, p.position::text, p.photo_url::text, p.profile_photo::text
    FROM player_profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM base_team_players b
      WHERE b.base_team_id = $1 AND b.player_id = p.id AND b.status = 'active'
    ) %s
    ORDER BY p.full_name
    LIMIT $2
  $q$, public.search_like_clause('public.f_unaccent(p.full_name)', public.search_words(p_query)))
  USING p_base_team_id, LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);
END;
$fn$;

REVOKE ALL ON FUNCTION public.search_players_for_base_team(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_players_for_base_team(uuid, text, integer) TO authenticated;
