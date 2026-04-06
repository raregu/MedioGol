/*
  # Update Advertisements to Support Championship-Specific Ads

  1. Changes
    - Add `championship_id` column to `advertisements` table (nullable)
    - If NULL, the ad is system-wide (appears in all championships)
    - If set, the ad only appears in that specific championship
    - Update policies to allow championship admins to view ads for their championships

  2. Security
    - System admins can create ads for any championship or system-wide
    - Championship admins can only view ads for their championships
*/

-- Add championship_id column to advertisements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'advertisements' AND column_name = 'championship_id'
  ) THEN
    ALTER TABLE advertisements ADD COLUMN championship_id uuid REFERENCES championships(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Drop existing policy and create new one
DROP POLICY IF EXISTS "System admins can view all advertisements" ON advertisements;

CREATE POLICY "System admins and championship admins can view relevant advertisements"
  ON advertisements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
    OR
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin_campeonato'
      )
      AND (
        championship_id IS NULL
        OR
        championship_id IN (
          SELECT id FROM championships WHERE admin_id = auth.uid()
        )
      )
    )
  );