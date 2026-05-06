/*
  # Fix sanctions DELETE policy to support Spanish role names

  1. Changes
    - Update DELETE policy to check for both English and Spanish role names
    - Support 'championship_admin' and 'admin_campeonato' roles
    - Support 'system_admin' and 'admin_sistema' roles
    - Ensures championship admins can delete sanctions regardless of role name format

  2. Security
    - Verifies user is admin of the specific championship using profiles table
    - System admins retain full access
    - Shift managers retain access to assigned championships
*/

-- Drop existing delete policy
DROP POLICY IF EXISTS "Admins and shift managers can delete sanctions" ON sanctions;

-- Create new delete policy supporting both English and Spanish role names
CREATE POLICY "Admins and shift managers can delete sanctions"
  ON sanctions
  FOR DELETE
  TO authenticated
  USING (
    -- System admins can delete any sanction (both English and Spanish role names)
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('system_admin', 'admin_sistema')
      )
    )
    OR
    -- Championship admins can delete sanctions in their championships (both English and Spanish)
    (
      EXISTS (
        SELECT 1 FROM championships
        WHERE championships.id = sanctions.championship_id
        AND championships.admin_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('championship_admin', 'admin_campeonato')
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
