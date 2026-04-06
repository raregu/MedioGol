/*
  # Allow championship admins to delete their own championships

  1. Changes
    - Drop existing delete policy for championships
    - Create new policy allowing system admins to delete any championship
    - Create new policy allowing championship admins to delete their own championships
  
  2. Security
    - System admins can delete any championship
    - Championship admins can only delete championships they administer
*/

-- Drop existing policy
DROP POLICY IF EXISTS "System admins can delete championships" ON championships;

-- Allow system admins to delete any championship
CREATE POLICY "System admins can delete any championship"
  ON championships FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Allow championship admins to delete their own championships
CREATE POLICY "Championship admins can delete their own championships"
  ON championships FOR DELETE
  TO authenticated
  USING (
    admin_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin_campeonato', 'admin_sistema')
    )
  );
