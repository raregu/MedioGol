/*
  # Fix match_events policies to accept all admin types

  1. Changes
    - Update policies to accept admin_sistema and admin_campeonato roles
    - These are the actual role values in the database
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admin users can insert match events" ON match_events;
DROP POLICY IF EXISTS "Admin users can update match events" ON match_events;
DROP POLICY IF EXISTS "Admin users can delete match events" ON match_events;

-- Create new policies that accept both admin types
CREATE POLICY "Admin users can insert match events"
  ON match_events FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt()->>'role')::text IN ('admin_sistema', 'admin_campeonato', 'admin'));

CREATE POLICY "Admin users can update match events"
  ON match_events FOR UPDATE
  TO authenticated
  USING ((auth.jwt()->>'role')::text IN ('admin_sistema', 'admin_campeonato', 'admin'))
  WITH CHECK ((auth.jwt()->>'role')::text IN ('admin_sistema', 'admin_campeonato', 'admin'));

CREATE POLICY "Admin users can delete match events"
  ON match_events FOR DELETE
  TO authenticated
  USING ((auth.jwt()->>'role')::text IN ('admin_sistema', 'admin_campeonato', 'admin'));
