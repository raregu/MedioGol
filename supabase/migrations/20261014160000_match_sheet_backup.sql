/*
  Respaldo de papeletas: ver la foto original y no acumular fotos que no sirven.

  - Las fotos de papeletas CONFIRMADAS (status 'applied') se conservan siempre.
  - discard_match_sheet() ahora devuelve las rutas de las fotos para que la app las borre.
  - Política de borrado en Storage: solo personal del partido y nunca fotos de una papeleta confirmada.
  - match_sheets.images_purged_at: la Edge Function read-match-sheet limpia en segundo plano
    las fotos de papeletas no confirmadas con más de 30 días (fallidas, descartadas o abandonadas).

  Idempotente: se puede ejecutar más de una vez.
*/

ALTER TABLE public.match_sheets ADD COLUMN IF NOT EXISTS images_purged_at timestamptz;

-- Para la limpieza: solo filas pendientes de purgar (pocas), ordenadas por antigüedad
CREATE INDEX IF NOT EXISTS idx_match_sheets_purge
  ON public.match_sheets (created_at)
  WHERE status <> 'applied' AND images_purged_at IS NULL;

-- Para "Ver papeleta original" en el detalle del partido
CREATE INDEX IF NOT EXISTS idx_match_sheets_applied
  ON public.match_sheets (match_id, applied_at DESC)
  WHERE status = 'applied';

-- Descartar: ahora devuelve las rutas para borrar las fotos (cambia el tipo de retorno → DROP)
DROP FUNCTION IF EXISTS public.discard_match_sheet(uuid);
CREATE FUNCTION public.discard_match_sheet(p_sheet_id uuid)
RETURNS text[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_paths text[];
BEGIN
  UPDATE match_sheets SET status = 'discarded'
  WHERE id = p_sheet_id AND status IN ('uploaded', 'read', 'failed') AND public.can_manage_match(match_id)
  RETURNING image_paths INTO v_paths;
  RETURN COALESCE(v_paths, '{}');
END;
$$;
REVOKE ALL ON FUNCTION public.discard_match_sheet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_match_sheet(uuid) TO authenticated;

-- Borrar fotos: personal del partido, y nunca la foto de una papeleta confirmada
DROP POLICY IF EXISTS "Personal borra fotos de papeletas no confirmadas" ON storage.objects;
CREATE POLICY "Personal borra fotos de papeletas no confirmadas" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'match-sheets'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_manage_match(((storage.foldername(name))[1])::uuid)
    AND NOT EXISTS (
      SELECT 1 FROM public.match_sheets s
      WHERE s.match_id = ((storage.foldername(objects.name))[1])::uuid
        AND s.status = 'applied'
        AND s.image_paths @> ARRAY[objects.name]
    )
  );
