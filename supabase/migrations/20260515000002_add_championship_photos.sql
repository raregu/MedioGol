-- Tabla para fotos de campeonatos
CREATE TABLE IF NOT EXISTS championship_photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  url text NOT NULL,
  caption text,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE championship_photos ENABLE ROW LEVEL SECURITY;

-- Todos pueden ver fotos
CREATE POLICY "Public can view championship photos"
  ON championship_photos FOR SELECT
  USING (true);

-- Solo admins del campeonato pueden insertar
CREATE POLICY "Admins can insert championship photos"
  ON championship_photos FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema')
      OR
      EXISTS (SELECT 1 FROM championships WHERE id = championship_id AND admin_id = auth.uid())
    )
  );

-- Solo admins del campeonato pueden eliminar
CREATE POLICY "Admins can delete championship photos"
  ON championship_photos FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema')
    OR
    EXISTS (SELECT 1 FROM championships WHERE id = championship_id AND admin_id = auth.uid())
  );
