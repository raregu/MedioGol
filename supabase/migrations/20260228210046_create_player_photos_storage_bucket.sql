/*
  # Create player-photos storage bucket

  1. New Storage Bucket
    - `player-photos` - stores player profile photos
    - Public bucket for easy access to photos

  2. Security Policies
    - Anyone can view photos (public read)
    - Only authenticated users can upload to their own folder
    - Only owners can delete their own photos
    - File size limit: 5MB
*/

-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'player-photos',
  'player-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

-- Policy: Anyone can view photos
DROP POLICY IF EXISTS "Public can view player photos" ON storage.objects;
CREATE POLICY "Public can view player photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'player-photos');

-- Policy: Authenticated users can upload to their own folder
DROP POLICY IF EXISTS "Users can upload own photos" ON storage.objects;
CREATE POLICY "Users can upload own photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'player-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can update their own photos
DROP POLICY IF EXISTS "Users can update own photos" ON storage.objects;
CREATE POLICY "Users can update own photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'player-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'player-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own photos
DROP POLICY IF EXISTS "Users can delete own photos" ON storage.objects;
CREATE POLICY "Users can delete own photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'player-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
