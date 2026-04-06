/*
  # Create Sponsors System

  1. New Tables
    - `sponsors`
      - `id` (uuid, primary key) - Unique identifier
      - `name` (text) - Sponsor name
      - `logo_url` (text) - Sponsor logo image URL
      - `website_url` (text, optional) - Sponsor website URL
      - `description` (text, optional) - Sponsor description
      - `championship_id` (uuid) - Championship this sponsor belongs to
      - `display_order` (integer) - Order in which to display sponsors
      - `is_active` (boolean) - Whether the sponsor is currently active
      - `created_by` (uuid) - ID of the admin who created it
      - `created_at` (timestamptz) - When the sponsor was created
      - `updated_at` (timestamptz) - When the sponsor was last updated

  2. Security
    - Enable RLS on `sponsors` table
    - Allow everyone to view active sponsors for any championship
    - System admins can manage all sponsors
    - Championship admins can only manage sponsors for their championships

  3. Storage
    - Create storage bucket for sponsor logos
    - Allow admins to upload logos
    - Allow public read access to logos
*/

-- Create sponsors table
CREATE TABLE IF NOT EXISTS sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  website_url text,
  description text,
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view active sponsors
CREATE POLICY "Anyone can view active sponsors"
  ON sponsors
  FOR SELECT
  USING (is_active = true);

-- Allow system admins to view all sponsors
CREATE POLICY "System admins can view all sponsors"
  ON sponsors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Allow championship admins to view their sponsors
CREATE POLICY "Championship admins can view their sponsors"
  ON sponsors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = championship_id
      AND championships.admin_id = auth.uid()
    )
  );

-- Allow system admins to insert sponsors
CREATE POLICY "System admins can create sponsors"
  ON sponsors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Allow championship admins to insert sponsors for their championships
CREATE POLICY "Championship admins can create sponsors for their championships"
  ON sponsors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = championship_id
      AND championships.admin_id = auth.uid()
    )
  );

-- Allow system admins to update sponsors
CREATE POLICY "System admins can update sponsors"
  ON sponsors
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Allow championship admins to update their sponsors
CREATE POLICY "Championship admins can update their sponsors"
  ON sponsors
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = championship_id
      AND championships.admin_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = championship_id
      AND championships.admin_id = auth.uid()
    )
  );

-- Allow system admins to delete sponsors
CREATE POLICY "System admins can delete sponsors"
  ON sponsors
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Allow championship admins to delete their sponsors
CREATE POLICY "Championship admins can delete their sponsors"
  ON sponsors
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = championship_id
      AND championships.admin_id = auth.uid()
    )
  );

-- Create storage bucket for sponsor logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('sponsor-logos', 'sponsor-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for sponsor logos
CREATE POLICY "Admins can upload sponsor logos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sponsor-logos' AND
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin_sistema', 'admin_campeonato')
      )
    )
  );

CREATE POLICY "Admins can update sponsor logos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'sponsor-logos' AND
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin_sistema', 'admin_campeonato')
      )
    )
  );

CREATE POLICY "Admins can delete sponsor logos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'sponsor-logos' AND
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin_sistema', 'admin_campeonato')
      )
    )
  );

CREATE POLICY "Anyone can view sponsor logos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'sponsor-logos');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_sponsors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sponsors_updated_at
  BEFORE UPDATE ON sponsors
  FOR EACH ROW
  EXECUTE FUNCTION update_sponsors_updated_at();