/*
  # Create Championship Storage Buckets

  1. New Storage Buckets
    - `championship-images` - stores championship banner/logo images
    - `championship-rules` - stores championship rules PDF documents
    - Both buckets are public for easy access

  2. Security Policies
    - Anyone can view files (public read)
    - Championship admins and system admins can upload/update/delete their championship files
    - File size limits applied

  3. Notes
    - Replaces the single 'championships' bucket approach with separate buckets
    - Provides better organization and different size limits per file type
*/

-- Create championship-images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'championship-images',
  'championship-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

-- Create championship-rules bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'championship-rules',
  'championship-rules',
  true,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/pdf'];

-- Policies for championship-images bucket

DROP POLICY IF EXISTS "Public can view championship images" ON storage.objects;
CREATE POLICY "Public can view championship images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'championship-images');

DROP POLICY IF EXISTS "Championship admins can upload images" ON storage.objects;
CREATE POLICY "Championship admins can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'championship-images'
  AND (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin_sistema', 'admin_campeonato')
  )
);

DROP POLICY IF EXISTS "Championship admins can update images" ON storage.objects;
CREATE POLICY "Championship admins can update images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'championship-images'
  AND (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin_sistema', 'admin_campeonato')
  )
)
WITH CHECK (
  bucket_id = 'championship-images'
  AND (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin_sistema', 'admin_campeonato')
  )
);

DROP POLICY IF EXISTS "Championship admins can delete images" ON storage.objects;
CREATE POLICY "Championship admins can delete images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'championship-images'
  AND (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin_sistema', 'admin_campeonato')
  )
);

-- Policies for championship-rules bucket

DROP POLICY IF EXISTS "Public can view championship rules" ON storage.objects;
CREATE POLICY "Public can view championship rules"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'championship-rules');

DROP POLICY IF EXISTS "Championship admins can upload rules" ON storage.objects;
CREATE POLICY "Championship admins can upload rules"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'championship-rules'
  AND (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin_sistema', 'admin_campeonato')
  )
);

DROP POLICY IF EXISTS "Championship admins can update rules" ON storage.objects;
CREATE POLICY "Championship admins can update rules"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'championship-rules'
  AND (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin_sistema', 'admin_campeonato')
  )
)
WITH CHECK (
  bucket_id = 'championship-rules'
  AND (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin_sistema', 'admin_campeonato')
  )
);

DROP POLICY IF EXISTS "Championship admins can delete rules" ON storage.objects;
CREATE POLICY "Championship admins can delete rules"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'championship-rules'
  AND (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin_sistema', 'admin_campeonato')
  )
);
