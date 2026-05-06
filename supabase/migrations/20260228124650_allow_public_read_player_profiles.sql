/*
  # Allow public read access to player profiles

  1. Changes
    - Add SELECT policy for player_profiles table to allow anyone to view profiles
    - This enables the Top Scorers section to work for anonymous users
  
  2. Security
    - Only SELECT permission is granted
    - UPDATE/DELETE remain restricted to the profile owner
*/

CREATE POLICY "Public can view player profiles"
  ON player_profiles
  FOR SELECT
  TO public
  USING (true);
