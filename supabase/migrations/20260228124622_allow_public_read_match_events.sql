/*
  # Allow public read access to match events

  1. Changes
    - Add SELECT policy for match_events table to allow anyone to view match events
    - This enables the Top Scorers section to work for all users
  
  2. Security
    - Only SELECT permission is granted
    - INSERT/UPDATE/DELETE remain restricted to admins and shift managers
*/

CREATE POLICY "Anyone can view match events"
  ON match_events
  FOR SELECT
  TO public
  USING (true);
