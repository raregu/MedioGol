/*
  # Fix All Shift Manager Assignment Policies - Use Profiles Table

  1. Changes
    - Update all policies (SELECT, UPDATE, DELETE) to check roles from profiles table
    - This ensures policies work even if JWT is not updated
    
  2. Security
    - System admins can manage all assignments
    - Championship admins can manage assignments for their championships
    - Shift managers can view their own assignments
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Admins can view shift manager assignments" ON shift_manager_assignments;
DROP POLICY IF EXISTS "Shift managers can view their assignments" ON shift_manager_assignments;
DROP POLICY IF EXISTS "Admins can update shift manager assignments" ON shift_manager_assignments;
DROP POLICY IF EXISTS "Admins can delete shift manager assignments" ON shift_manager_assignments;

-- SELECT policies
CREATE POLICY "Admins can view shift manager assignments"
  ON shift_manager_assignments
  FOR SELECT
  TO authenticated
  USING (
    -- System admin can view all
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
    OR
    -- Championship admin can view their championship's assignments
    EXISTS (
      SELECT 1 
      FROM profiles
      JOIN championships ON championships.admin_id = profiles.id
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_campeonato'
      AND championships.id = shift_manager_assignments.championship_id
    )
  );

CREATE POLICY "Shift managers can view their assignments"
  ON shift_manager_assignments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- UPDATE policy
CREATE POLICY "Admins can update shift manager assignments"
  ON shift_manager_assignments
  FOR UPDATE
  TO authenticated
  USING (
    -- System admin can update all
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
    OR
    -- Championship admin can update their championship's assignments
    EXISTS (
      SELECT 1 
      FROM profiles
      JOIN championships ON championships.admin_id = profiles.id
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_campeonato'
      AND championships.id = shift_manager_assignments.championship_id
    )
  )
  WITH CHECK (
    -- System admin can update all
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
    OR
    -- Championship admin can update their championship's assignments
    EXISTS (
      SELECT 1 
      FROM profiles
      JOIN championships ON championships.admin_id = profiles.id
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_campeonato'
      AND championships.id = shift_manager_assignments.championship_id
    )
  );

-- DELETE policy
CREATE POLICY "Admins can delete shift manager assignments"
  ON shift_manager_assignments
  FOR DELETE
  TO authenticated
  USING (
    -- System admin can delete all
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
    OR
    -- Championship admin can delete their championship's assignments
    EXISTS (
      SELECT 1 
      FROM profiles
      JOIN championships ON championships.admin_id = profiles.id
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_campeonato'
      AND championships.id = shift_manager_assignments.championship_id
    )
  );
