/*
  # Fix match_events RLS policies to use JWT

  1. Changes
    - Drop existing policies that use profiles table lookup
    - Create new policies using auth.jwt() to avoid recursion
    - Admin users can insert, update, delete match events
    - All authenticated users can view match events
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admin users can insert match events" ON match_events;
DROP POLICY IF EXISTS "Admin users can update match events" ON match_events;
DROP POLICY IF EXISTS "Admin users can delete match events" ON match_events;
DROP POLICY IF EXISTS "Authenticated users can view match events" ON match_events;

-- Create new policies using JWT
CREATE POLICY "Admin users can insert match events"
  ON match_events FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt()->>'role')::text = 'admin');

CREATE POLICY "Admin users can update match events"
  ON match_events FOR UPDATE
  TO authenticated
  USING ((auth.jwt()->>'role')::text = 'admin')
  WITH CHECK ((auth.jwt()->>'role')::text = 'admin');

CREATE POLICY "Admin users can delete match events"
  ON match_events FOR DELETE
  TO authenticated
  USING ((auth.jwt()->>'role')::text = 'admin');

CREATE POLICY "Authenticated users can view match events"
  ON match_events FOR SELECT
  TO authenticated
  USING (true);
