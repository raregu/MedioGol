/*
  # Allow anonymous users to view matches

  1. Changes
    - Add SELECT policy for matches table to allow anonymous users to view matches
    - This enables the standings calculation and match listings for anonymous users
  
  2. Security
    - Only SELECT permission is granted to anonymous users
    - INSERT/UPDATE/DELETE remain restricted to admins
*/

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Matches are viewable by everyone" ON matches;

-- Create new policy that allows anonymous and authenticated users to view matches
CREATE POLICY "Anyone can view matches"
  ON matches
  FOR SELECT
  TO anon, authenticated
  USING (true);
