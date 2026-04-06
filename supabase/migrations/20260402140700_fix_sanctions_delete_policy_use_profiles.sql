/*
  # Fix sanctions DELETE policy to use profiles table consistently

  1. Changes
    - Update DELETE policy to check profiles.role instead of JWT
    - Make it consistent with INSERT and UPDATE policies
    - Ensures championship admins can delete sanctions reliably

  2. Security
    - Verifies user is admin of the specific championship using profiles table
    - System admins retain full access
    - Shift managers retain access to assigned championships
*/

-- Drop existing delete policy
DROP POLICY IF EXISTS "Admins and shift managers can delete sanctions" ON sanctions;

-- Create new delete policy using profiles table (consistent with INSERT/UPDATE)
CREATE POLICY "Admins and shift managers can delete sanctions"
  ON sanctions
  FOR DELETE
  TO authenticated
  USING (
    -- System admins can delete any sanction
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'system_admin'
      )
    )
    OR
    -- Championship admins can delete sanctions in their championships
    (
      EXISTS (
        SELECT 1 FROM championships
        WHERE championships.id = sanctions.championship_id
        AND championships.admin_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'championship_admin'
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
