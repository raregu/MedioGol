/*
  # Add Championship Files and Contact Information

  1. Changes to championships table
    - Add `image_url` (text) - URL for championship banner/logo image
    - Add `rules_pdf_url` (text) - URL for championship rules PDF document
    - Add `location` (text) - Physical location/address details
    - Add `contact_phone` (text) - Contact phone number for inquiries
  
  2. Security
    - Existing RLS policies remain unchanged
    - These fields can be updated by championship admins

  3. Notes
    - Files will be stored in Supabase Storage
    - URLs will reference the storage bucket paths
*/

-- Add new columns to championships table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'championships' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE championships ADD COLUMN image_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'championships' AND column_name = 'rules_pdf_url'
  ) THEN
    ALTER TABLE championships ADD COLUMN rules_pdf_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'championships' AND column_name = 'location'
  ) THEN
    ALTER TABLE championships ADD COLUMN location text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'championships' AND column_name = 'contact_phone'
  ) THEN
    ALTER TABLE championships ADD COLUMN contact_phone text;
  END IF;
END $$;

-- Create storage bucket for championship files if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('championships', 'championships', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for team logos if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('teams', 'teams', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for championships bucket
CREATE POLICY "Championship admins can upload files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'championships' AND
    (
      auth.uid() IN (
        SELECT admin_id FROM championships WHERE id::text = (storage.foldername(storage.objects.name))[1]
      )
      OR
      EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema'
      )
    )
  );

CREATE POLICY "Championship files are publicly accessible"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'championships');

CREATE POLICY "Championship admins can update files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'championships' AND
    (
      auth.uid() IN (
        SELECT admin_id FROM championships WHERE id::text = (storage.foldername(storage.objects.name))[1]
      )
      OR
      EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema'
      )
    )
  );

CREATE POLICY "Championship admins can delete files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'championships' AND
    (
      auth.uid() IN (
        SELECT admin_id FROM championships WHERE id::text = (storage.foldername(storage.objects.name))[1]
      )
      OR
      EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema'
      )
    )
  );

-- Storage policies for teams bucket
CREATE POLICY "Team captains and admins can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'teams' AND
    (
      auth.uid() IN (
        SELECT captain_id FROM teams WHERE id::text = (storage.foldername(storage.objects.name))[1]
      )
      OR
      auth.uid() IN (
        SELECT c.admin_id FROM teams t
        JOIN championships c ON t.championship_id = c.id
        WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      )
      OR
      EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema'
      )
    )
  );

CREATE POLICY "Team logos are publicly accessible"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'teams');

CREATE POLICY "Team captains and admins can update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'teams' AND
    (
      auth.uid() IN (
        SELECT captain_id FROM teams WHERE id::text = (storage.foldername(storage.objects.name))[1]
      )
      OR
      auth.uid() IN (
        SELECT c.admin_id FROM teams t
        JOIN championships c ON t.championship_id = c.id
        WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      )
      OR
      EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema'
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
        SELECT captain_id FROM teams WHERE id::text = (storage.foldername(storage.objects.name))[1]
      )
      OR
      auth.uid() IN (
        SELECT c.admin_id FROM teams t
        JOIN championships c ON t.championship_id = c.id
        WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      )
      OR
      EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema'
      )
    )
  );
