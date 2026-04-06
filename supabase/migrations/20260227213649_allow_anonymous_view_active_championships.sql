/*
  # Allow anonymous users to view active championships

  1. Changes
    - Drop the restrictive SELECT policy that requires authentication
    - Create a new policy that allows both authenticated and anonymous users to view championships
  
  2. Security
    - Anonymous users can only SELECT (read) data
    - Still maintains RLS protection
    - Other operations (INSERT, UPDATE, DELETE) still require authentication
*/

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Championships are viewable by everyone" ON championships;

-- Create new policy that allows anonymous and authenticated users to view
CREATE POLICY "Anyone can view championships"
  ON championships
  FOR SELECT
  TO anon, authenticated
  USING (true);
