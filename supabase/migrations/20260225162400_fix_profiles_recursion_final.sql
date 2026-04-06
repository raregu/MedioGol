/*
  # Fix Profiles Table Recursion

  1. Problem
    - Policies on profiles table query profiles table = infinite recursion
    - This breaks storage policies that check championships->profiles
    
  2. Solution
    - Use auth.jwt() to check role instead of querying profiles table
    - Store role in JWT claims for instant access without recursion
*/

-- Drop all problematic policies
DROP POLICY IF EXISTS "System admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "System admins can delete profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile except role" ON profiles;

-- Recreate policies using JWT claims instead of table queries
CREATE POLICY "System admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING ((auth.jwt()->>'role')::text = 'admin_sistema')
  WITH CHECK ((auth.jwt()->>'role')::text = 'admin_sistema');

CREATE POLICY "System admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    (auth.jwt()->>'role')::text = 'admin_sistema' 
    AND id <> auth.uid()
  );

CREATE POLICY "Users can update own profile except role"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND role = (auth.jwt()->>'role')::text
  );
