/*
  # Create Sports Complexes System

  1. New Tables
    - `sports_complexes`
      - `id` (uuid, primary key)
      - `name` (text) - Nombre del complejo deportivo
      - `address` (text) - Dirección completa
      - `location_url` (text) - URL de Google Maps/Waze para navegación
      - `latitude` (numeric) - Coordenada de latitud
      - `longitude` (numeric) - Coordenada de longitud
      - `phone` (text, optional) - Teléfono de contacto
      - `description` (text, optional) - Descripción del complejo
      - `facilities` (text, optional) - Instalaciones disponibles
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes to Existing Tables
    - Add `sports_complex_id` to `matches` table
    - Add foreign key constraint from matches to sports_complexes

  3. Security
    - Enable RLS on `sports_complexes` table
    - Add policies for authenticated users to view complexes
    - Add policies for admins to manage complexes
*/

-- Create sports_complexes table
CREATE TABLE IF NOT EXISTS sports_complexes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  location_url text,
  latitude numeric(10, 8),
  longitude numeric(11, 8),
  phone text,
  description text,
  facilities text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add sports_complex_id to matches table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'sports_complex_id'
  ) THEN
    ALTER TABLE matches ADD COLUMN sports_complex_id uuid REFERENCES sports_complexes(id);
  END IF;
END $$;

-- Enable RLS on sports_complexes
ALTER TABLE sports_complexes ENABLE ROW LEVEL SECURITY;

-- Policies for sports_complexes
CREATE POLICY "Anyone can view sports complexes"
  ON sports_complexes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System admins can insert sports complexes"
  ON sports_complexes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'system_admin'
    )
  );

CREATE POLICY "System admins can update sports complexes"
  ON sports_complexes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'system_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'system_admin'
    )
  );

CREATE POLICY "System admins can delete sports complexes"
  ON sports_complexes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'system_admin'
    )
  );

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_matches_sports_complex_id ON matches(sports_complex_id);

-- Add some sample sports complexes
INSERT INTO sports_complexes (name, address, location_url, latitude, longitude, phone, description, facilities)
VALUES
  (
    'Complejo Deportivo Central',
    'Av. Principal 123, Ciudad',
    'https://maps.google.com/?q=-34.603722,-58.381592',
    -34.603722,
    -58.381592,
    '+54 11 1234-5678',
    'Complejo deportivo con canchas de fútbol 5 y 7',
    'Canchas sintéticas, vestuarios, estacionamiento, cantina'
  ),
  (
    'Club Deportivo Norte',
    'Calle Norte 456, Ciudad',
    'https://maps.google.com/?q=-34.593722,-58.391592',
    -34.593722,
    -58.391592,
    '+54 11 2345-6789',
    'Club con múltiples canchas y servicios',
    'Canchas de césped, iluminación, vestuarios, buffet'
  ),
  (
    'Polideportivo Sur',
    'Av. Sur 789, Ciudad',
    'https://maps.google.com/?q=-34.613722,-58.371592',
    -34.613722,
    -58.371592,
    '+54 11 3456-7890',
    'Polideportivo municipal con canchas de diferentes tamaños',
    'Canchas techadas y al aire libre, tribunas, sanitarios'
  )
ON CONFLICT DO NOTHING;
