/*
  # Fix Championship INSERT and UPDATE Policies

  This migration fixes issues with championship creation and admin assignment:

  1. Changes Made
    - Drop and recreate INSERT policy to allow system admins to create championships
    - Drop and recreate UPDATE policy to allow proper admin assignment
    - Simplify policies to avoid recursion issues
    - Use auth.uid() for direct user checks where possible

  2. Security
    - System admins can INSERT championships with any admin_id
    - System admins can UPDATE any championship (including changing admin_id)
    - Championship admins can UPDATE only their assigned championships
    - All policies maintain proper authentication checks
*/

-- Drop existing policies
DROP POLICY IF EXISTS "System admins can insert championships" ON championships;
DROP POLICY IF EXISTS "System admins and championship admins can update championships" ON championships;

-- Recreate INSERT policy with simpler check
CREATE POLICY "System admins can insert championships"
  ON championships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Recreate UPDATE policy with better logic
CREATE POLICY "System admins and championship admins can update championships"
  ON championships
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'admin_sistema'
        OR (profiles.role = 'admin_campeonato' AND championships.admin_id = auth.uid())
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        profiles.role = 'admin_sistema'
        OR (profiles.role = 'admin_campeonato' AND championships.admin_id = auth.uid())
      )
    )
  );
