/*
  # Allow Championship Admins to Delete Matches

  1. Changes
    - Drop duplicate DELETE policies on matches table
    - Create single consistent policy using profiles table
    - Allow system admins and championship admins to delete matches from their championships

  2. Security
    - System admins can delete any match
    - Championship admins can only delete matches from championships they manage
    - Uses profiles table for role verification (consistent with other policies)
*/

-- Drop existing duplicate policies
DROP POLICY IF EXISTS "System admins and championship admins can delete matches" ON matches;
DROP POLICY IF EXISTS "Championship admins can delete matches" ON matches;

-- Create single consistent DELETE policy
CREATE POLICY "Championship admins can delete matches from their championships"
  ON matches
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = matches.championship_id
      AND (
        p.role = 'system_admin'
        OR (p.role = 'championship_admin' AND c.admin_id = auth.uid())
      )
    )
  );
