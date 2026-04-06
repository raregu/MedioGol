/*
  # Fix Sanctions Table and Policies

  1. Changes
    - Drop old foreign key constraint to players table
    - Add new foreign key constraint to player_profiles table
    - Update RLS policies to allow public read access
    - Keep write access restricted to admins and shift managers

  2. Security
    - Enable RLS on sanctions table
    - Allow all users (authenticated and anonymous) to view sanctions
    - Allow championship admins and shift managers to manage sanctions
*/

-- Drop the old foreign key constraint
ALTER TABLE sanctions 
DROP CONSTRAINT IF EXISTS sanctions_player_id_fkey;

-- Add new foreign key constraint to player_profiles
ALTER TABLE sanctions 
ADD CONSTRAINT sanctions_player_id_fkey 
FOREIGN KEY (player_id) 
REFERENCES player_profiles(id) 
ON DELETE CASCADE;

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view sanctions" ON sanctions;
DROP POLICY IF EXISTS "Admins can insert sanctions" ON sanctions;
DROP POLICY IF EXISTS "Admins can update sanctions" ON sanctions;
DROP POLICY IF EXISTS "Admins can delete sanctions" ON sanctions;
DROP POLICY IF EXISTS "Championship admins can insert sanctions" ON sanctions;
DROP POLICY IF EXISTS "Championship admins can update sanctions" ON sanctions;
DROP POLICY IF EXISTS "Championship admins can delete sanctions" ON sanctions;
DROP POLICY IF EXISTS "Authenticated users can update sanctions" ON sanctions;
DROP POLICY IF EXISTS "System admins and championship admins can update sanctions" ON sanctions;
DROP POLICY IF EXISTS "System admins and championship admins can delete sanctions" ON sanctions;

-- Create new policy for public read access
CREATE POLICY "Anyone can view sanctions"
  ON sanctions
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Create policies for championship admins and shift managers
CREATE POLICY "Admins and shift managers can insert sanctions"
  ON sanctions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = championship_id
      AND championships.admin_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'system_admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM shift_manager_assignments
      WHERE shift_manager_assignments.championship_id = sanctions.championship_id
      AND shift_manager_assignments.user_id = auth.uid()
      AND shift_manager_assignments.is_active = true
    )
  );

CREATE POLICY "Admins and shift managers can update sanctions"
  ON sanctions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = championship_id
      AND championships.admin_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'system_admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM shift_manager_assignments
      WHERE shift_manager_assignments.championship_id = sanctions.championship_id
      AND shift_manager_assignments.user_id = auth.uid()
      AND shift_manager_assignments.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = championship_id
      AND championships.admin_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'system_admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM shift_manager_assignments
      WHERE shift_manager_assignments.championship_id = sanctions.championship_id
      AND shift_manager_assignments.user_id = auth.uid()
      AND shift_manager_assignments.is_active = true
    )
  );

CREATE POLICY "Admins and shift managers can delete sanctions"
  ON sanctions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = championship_id
      AND championships.admin_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'system_admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM shift_manager_assignments
      WHERE shift_manager_assignments.championship_id = sanctions.championship_id
      AND shift_manager_assignments.user_id = auth.uid()
      AND shift_manager_assignments.is_active = true
    )
  );
