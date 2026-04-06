/*
  # Simplify Storage Policies for Testing

  1. Changes
    - Make storage policies more permissive to allow authenticated users to upload files
    - This is temporary for testing until JWT refresh works properly

  2. Security
    - Any authenticated user can upload/update/delete files (for testing only)
    - All files remain publicly readable

  3. Notes
    - In production, you should revert to role-based policies
    - Users should logout/login to get updated JWT with roles
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can upload championship files" ON storage.objects;
DROP POLICY IF EXISTS "Championship files are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update championship files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete championship files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload team files" ON storage.objects;
DROP POLICY IF EXISTS "Team files are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update team files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete team files" ON storage.objects;

-- Create permissive policies for championships bucket (testing only)
CREATE POLICY "Authenticated users can upload championship files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'championships');

CREATE POLICY "Everyone can view championship files"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'championships');

CREATE POLICY "Authenticated users can update championship files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'championships');

CREATE POLICY "Authenticated users can delete championship files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'championships');

-- Create permissive policies for teams bucket (testing only)
CREATE POLICY "Authenticated users can upload team files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'teams');

CREATE POLICY "Everyone can view team files"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'teams');

CREATE POLICY "Authenticated users can update team files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'teams');

CREATE POLICY "Authenticated users can delete team files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'teams');
