/*
  # Add status column to base_teams

  1. Changes
    - Add status column to base_teams table
    - Default value is 'active'
    - Allows team owners to activate/deactivate their teams

  2. New Columns
    - `status` (text) - Team status: 'active' or 'inactive'
*/

-- Add status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'base_teams' AND column_name = 'status'
  ) THEN
    ALTER TABLE base_teams ADD COLUMN status text DEFAULT 'active' CHECK (status IN ('active', 'inactive'));
  END IF;
END $$;

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_base_teams_status ON base_teams(status);

-- Update existing teams to have active status
UPDATE base_teams SET status = 'active' WHERE status IS NULL;
