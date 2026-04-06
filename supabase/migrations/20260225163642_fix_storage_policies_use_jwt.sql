/*
  # Fix Storage Policies to Use JWT and Avoid Recursion

  1. Changes
    - Drop all existing storage policies for championships and teams buckets
    - Recreate policies using auth.jwt() instead of querying profiles table
    - Simplify policies to allow system admins and championship admins to upload files

  2. Security
    - System admins (role in JWT = 'admin_sistema') can upload/update/delete all files
    - Championship admins (role in JWT = 'admin_campeonato') can upload/update/delete files
    - All championship and team files are publicly readable
    - No recursion issues since we only check JWT, not database tables

  3. Notes
    - This fixes the 42P17 error caused by policies querying undefined tables
    - Uses JWT role check which is fast and doesn't cause recursion
*/

-- Drop all existing storage policies for championships bucket
DROP POLICY IF EXISTS "Championship admins can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Championship files are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Championship admins can update files" ON storage.objects;
DROP POLICY IF EXISTS "Championship admins can delete files" ON storage.objects;

-- Drop all existing storage policies for teams bucket
DROP POLICY IF EXISTS "Team captains and admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Team logos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Team captains and admins can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Team captains and admins can delete logos" ON storage.objects;

-- Create new simplified policies for championships bucket
CREATE POLICY "Admins can upload championship files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'championships' AND
    (auth.jwt() ->> 'role')::text IN ('admin_sistema', 'admin_campeonato')
  );

CREATE POLICY "Championship files are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'championships');

CREATE POLICY "Admins can update championship files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'championships' AND
    (auth.jwt() ->> 'role')::text IN ('admin_sistema', 'admin_campeonato')
  );

CREATE POLICY "Admins can delete championship files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'championships' AND
    (auth.jwt() ->> 'role')::text IN ('admin_sistema', 'admin_campeonato')
  );

-- Create new simplified policies for teams bucket
CREATE POLICY "Admins can upload team files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'teams' AND
    (auth.jwt() ->> 'role')::text IN ('admin_sistema', 'admin_campeonato')
  );

CREATE POLICY "Team files are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'teams');

CREATE POLICY "Admins can update team files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'teams' AND
    (auth.jwt() ->> 'role')::text IN ('admin_sistema', 'admin_campeonato')
  );

CREATE POLICY "Admins can delete team files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'teams' AND
    (auth.jwt() ->> 'role')::text IN ('admin_sistema', 'admin_campeonato')
  );
