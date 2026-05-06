/*
  # Allow championship admins to delete sanctions using JWT role

  1. Changes
    - Update sanctions DELETE policy to check JWT role for championship_admin
    - This ensures championship admins can delete sanctions in their championships
    - Maintains system_admin and shift_manager access

  2. Security
    - Verifies user is admin of the specific championship
    - System admins retain full access
    - Shift managers retain access to assigned championships
*/

-- Drop existing delete policy
DROP POLICY IF EXISTS "Admins and shift managers can delete sanctions" ON sanctions;

-- Create new delete policy using JWT role
CREATE POLICY "Admins and shift managers can delete sanctions"
  ON sanctions
  FOR DELETE
  TO authenticated
  USING (
    -- System admins can delete any sanction
    (auth.jwt()->>'role' = 'system_admin')
    OR
    -- Championship admins can delete sanctions in their championships
    (
      auth.jwt()->>'role' = 'championship_admin'
      AND EXISTS (
        SELECT 1 FROM championships
        WHERE championships.id = sanctions.championship_id
        AND championships.admin_id = auth.uid()
      )
    )
    OR
    -- Shift managers can delete sanctions in assigned championships
    EXISTS (
      SELECT 1 FROM shift_manager_assignments
      WHERE shift_manager_assignments.championship_id = sanctions.championship_id
      AND shift_manager_assignments.user_id = auth.uid()
      AND shift_manager_assignments.is_active = true
    )
  );