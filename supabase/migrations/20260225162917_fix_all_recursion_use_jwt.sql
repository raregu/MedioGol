/*
  # Fix All Recursion - Use JWT Role Everywhere

  1. Problem
    - Storage policies check championship_files
    - championship_files checks championships
    - championships checks profiles table
    - This creates infinite recursion (error 42P17)

  2. Solution
    - Remove ALL queries to profiles table in policies
    - Use auth.jwt()->>'role' to read role directly from JWT token
    - This breaks the recursion chain completely

  3. Changes
    - Update ALL championship policies to use JWT instead of profiles table
    - Keeps existing logic but reads from token instead of database
*/

-- Drop and recreate championship policies without profiles table dependency
DROP POLICY IF EXISTS "System admins can insert championships" ON championships;
DROP POLICY IF EXISTS "System admins and championship admins can update their champion" ON championships;
DROP POLICY IF EXISTS "System admins can delete championships" ON championships;

-- System admins can insert championships (using JWT role)
CREATE POLICY "System admins can insert championships"
  ON championships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt()->>'role') = 'admin_sistema'
  );

-- System admins and championship admins can update their championships (using JWT role)
CREATE POLICY "System admins and championship admins can update their champion"
  ON championships
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt()->>'role') = 'admin_sistema' 
    OR 
    ((auth.jwt()->>'role') = 'admin_campeonato' AND admin_id = auth.uid())
  )
  WITH CHECK (
    (auth.jwt()->>'role') = 'admin_sistema' 
    OR 
    ((auth.jwt()->>'role') = 'admin_campeonato' AND admin_id = auth.uid())
  );

-- System admins can delete championships (using JWT role)
CREATE POLICY "System admins can delete championships"
  ON championships
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt()->>'role') = 'admin_sistema'
  );
