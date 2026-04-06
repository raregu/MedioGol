/*
  # Fix profiles update policy to allow full_name updates

  1. Changes
    - Drop existing restrictive update policy for users
    - Create new policy that allows users to update their own profile
    - Users can only update full_name field, role must remain unchanged
    - Simplified check that doesn't require role in WITH CHECK when role is not being changed
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can update own profile data" ON profiles;

-- Create new policy that allows users to update their own full_name
-- The key is to allow updates where the user is updating their own record
-- and the role is either not being changed OR stays the same
CREATE POLICY "Users can update own profile full_name"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      -- Role is not being changed (comparing new role with current role in DB)
      role = (SELECT role FROM profiles WHERE id = auth.uid())
    )
  );
