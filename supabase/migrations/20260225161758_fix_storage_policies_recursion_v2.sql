/*
  # Fix Storage Policies Recursion Issue

  1. Problem
    - Infinite recursion in policies when checking roles
    - Storage policies checking championships which check profiles which check profiles
    
  2. Solution
    - Simplify storage policies to avoid complex joins
    - Use direct auth.uid() checks where possible
    - Remove recursive profile checks
*/

-- Drop existing problematic storage policies
DROP POLICY IF EXISTS "Championship admins can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Championship admins can update files" ON storage.objects;
DROP POLICY IF EXISTS "Championship admins can delete files" ON storage.objects;
DROP POLICY IF EXISTS "Team captains and admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Team captains and admins can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Team captains and admins can delete logos" ON storage.objects;

-- Recreate championship storage policies with simplified checks
CREATE POLICY "Championship admins can upload files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'championships' AND
    auth.uid() IN (
      SELECT admin_id FROM championships
      WHERE id::text = (storage.foldername(objects.name))[1]
    )
  );

CREATE POLICY "Championship admins can update files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'championships' AND
    auth.uid() IN (
      SELECT admin_id FROM championships
      WHERE id::text = (storage.foldername(objects.name))[1]
    )
  );

CREATE POLICY "Championship admins can delete files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'championships' AND
    auth.uid() IN (
      SELECT admin_id FROM championships
      WHERE id::text = (storage.foldername(objects.name))[1]
    )
  );

-- Recreate team logo storage policies with simplified checks
CREATE POLICY "Team captains and admins can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'teams' AND
    (
      auth.uid() IN (
        SELECT captain_id FROM teams
        WHERE id::text = (storage.foldername(objects.name))[1]
      ) OR
      auth.uid() IN (
        SELECT c.admin_id
        FROM teams t
        JOIN championships c ON t.championship_id = c.id
        WHERE t.id::text = (storage.foldername(objects.name))[1]
      )
    )
  );

CREATE POLICY "Team captains and admins can update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'teams' AND
    (
      auth.uid() IN (
        SELECT captain_id FROM teams
        WHERE id::text = (storage.foldername(objects.name))[1]
      ) OR
      auth.uid() IN (
        SELECT c.admin_id
        FROM teams t
        JOIN championships c ON t.championship_id = c.id
        WHERE t.id::text = (storage.foldername(objects.name))[1]
      )
    )
  );

CREATE POLICY "Team captains and admins can delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'teams' AND
    (
      auth.uid() IN (
        SELECT captain_id FROM teams
        WHERE id::text = (storage.foldername(objects.name))[1]
      ) OR
      auth.uid() IN (
        SELECT c.admin_id
        FROM teams t
        JOIN championships c ON t.championship_id = c.id
        WHERE t.id::text = (storage.foldername(objects.name))[1]
      )
    )
  );
