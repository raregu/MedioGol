/*
  # Allow anonymous users to view profiles

  1. Changes
    - Add SELECT policy for profiles table to allow anonymous users to view profiles
    - This enables anonymous users to see championship admin names and captain names
  
  2. Security
    - Only SELECT permission is granted to anonymous users
    - INSERT/UPDATE/DELETE remain restricted to profile owners
*/

-- Drop old restrictive policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

-- Create new policy that allows anonymous and authenticated users to view profiles
CREATE POLICY "Anyone can view profiles"
  ON profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);
