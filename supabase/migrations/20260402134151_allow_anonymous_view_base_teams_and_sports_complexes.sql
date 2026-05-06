/*
  # Allow anonymous users to view base teams and sports complexes

  1. Changes
    - Add SELECT policy for base_teams table to allow anonymous users to view base teams
    - Add SELECT policy for sports_complexes table to allow anonymous users to view sports complexes
    - This enables the standings page to show team logos and match locations for anonymous users
  
  2. Security
    - Only SELECT permission is granted to anonymous users
    - INSERT/UPDATE/DELETE remain restricted to authenticated users
*/

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Anyone can view base teams" ON base_teams;
DROP POLICY IF EXISTS "Anyone can view sports complexes" ON sports_complexes;

-- Create new policies that allow anonymous and authenticated users to view
CREATE POLICY "Anyone can view base teams"
  ON base_teams
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can view sports complexes"
  ON sports_complexes
  FOR SELECT
  TO anon, authenticated
  USING (true);
