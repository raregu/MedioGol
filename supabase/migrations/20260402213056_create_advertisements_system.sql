/*
  # Create Advertisements System

  1. New Tables
    - `advertisements`
      - `id` (uuid, primary key) - Unique identifier
      - `title` (text) - Advertisement title
      - `description` (text, optional) - Advertisement description
      - `image_url` (text, optional) - Image URL for the ad
      - `link_url` (text, optional) - External link when clicked
      - `is_active` (boolean) - Whether the ad is currently active
      - `created_by` (uuid) - ID of the system admin who created it
      - `display_order` (integer) - Order in which to display ads
      - `created_at` (timestamptz) - When the ad was created
      - `updated_at` (timestamptz) - When the ad was last updated

  2. Security
    - Enable RLS on `advertisements` table
    - Allow all users to view active advertisements
    - Only system admins can create, update, or delete advertisements

  3. Storage
    - Create storage bucket for advertisement images
    - Allow system admins to upload images
    - Allow public read access to images
*/

-- Create advertisements table
CREATE TABLE IF NOT EXISTS advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text,
  link_url text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view active advertisements
CREATE POLICY "Anyone can view active advertisements"
  ON advertisements
  FOR SELECT
  USING (is_active = true);

-- Allow system admins to view all advertisements
CREATE POLICY "System admins can view all advertisements"
  ON advertisements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Allow system admins to insert advertisements
CREATE POLICY "System admins can create advertisements"
  ON advertisements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Allow system admins to update advertisements
CREATE POLICY "System admins can update advertisements"
  ON advertisements
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

-- Allow system admins to delete advertisements
CREATE POLICY "System admins can delete advertisements"
  ON advertisements
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Create storage bucket for advertisement images
INSERT INTO storage.buckets (id, name, public)
VALUES ('advertisement-images', 'advertisement-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for advertisement images
CREATE POLICY "System admins can upload advertisement images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'advertisement-images' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

CREATE POLICY "System admins can update advertisement images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'advertisement-images' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

CREATE POLICY "System admins can delete advertisement images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'advertisement-images' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

CREATE POLICY "Anyone can view advertisement images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'advertisement-images');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_advertisements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_advertisements_updated_at
  BEFORE UPDATE ON advertisements
  FOR EACH ROW
  EXECUTE FUNCTION update_advertisements_updated_at();