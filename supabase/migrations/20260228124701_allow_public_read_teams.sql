/*
  # Allow public read access to teams

  1. Changes
    - Add SELECT policy for teams table to allow anyone to view teams
    - This enables the Top Scorers section to show team names for anonymous users
  
  2. Security
    - Only SELECT permission is granted
    - INSERT/UPDATE/DELETE remain restricted to team owners and admins
*/

CREATE POLICY "Public can view teams"
  ON teams
  FOR SELECT
  TO public
  USING (true);
