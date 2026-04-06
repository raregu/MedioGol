/*
  # Fix Shift Manager Assignment Policy - Use Profiles Table

  1. Changes
    - Change INSERT policy to check roles from profiles table instead of JWT
    - This ensures the policy works even if JWT is not updated
    
  2. Security
    - System admins can assign to any championship
    - Championship admins can assign to their own championships
*/

-- Drop existing insert policy
DROP POLICY IF EXISTS "Admins can assign shift managers" ON shift_manager_assignments;

-- Create new policy that checks profiles table
CREATE POLICY "Admins can assign shift managers"
  ON shift_manager_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- System admin can assign to any championship
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
    OR
    -- Championship admin can assign if they own the championship
    EXISTS (
      SELECT 1 
      FROM profiles
      JOIN championships ON championships.admin_id = profiles.id
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_campeonato'
      AND championships.id = shift_manager_assignments.championship_id
    )
  );
