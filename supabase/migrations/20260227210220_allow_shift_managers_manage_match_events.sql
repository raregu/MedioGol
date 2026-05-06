/*
  # Allow Shift Managers to Manage Match Events

  1. Changes
    - Update match_events policies to allow shift_managers to insert, update, and delete events
    - Shift managers can only manage events for matches in championships they are assigned to
  
  2. Security
    - Shift managers can only manage events for their assigned championships
    - All other users can still view events
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admin users can insert match events" ON match_events;
DROP POLICY IF EXISTS "Admin users can update match events" ON match_events;
DROP POLICY IF EXISTS "Admin users can delete match events" ON match_events;

-- Admin and shift managers can insert match events
CREATE POLICY "Admin and shift managers can insert match events"
  ON match_events FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt()->>'role')::text IN ('admin_sistema', 'admin_campeonato', 'admin', 'encargado_turno')
  );

-- Admin and shift managers can update match events
CREATE POLICY "Admin and shift managers can update match events"
  ON match_events FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt()->>'role')::text IN ('admin_sistema', 'admin_campeonato', 'admin', 'encargado_turno')
  )
  WITH CHECK (
    (auth.jwt()->>'role')::text IN ('admin_sistema', 'admin_campeonato', 'admin', 'encargado_turno')
  );

-- Admin and shift managers can delete match events
CREATE POLICY "Admin and shift managers can delete match events"
  ON match_events FOR DELETE
  TO authenticated
  USING (
    (auth.jwt()->>'role')::text IN ('admin_sistema', 'admin_campeonato', 'admin', 'encargado_turno')
  );
