/*
  # Fix match_events policies to read role from correct JWT location

  1. Changes
    - Update all match_events policies to read role from app_metadata in JWT
    - The role is stored in auth.users.raw_app_meta_data, which appears as app_metadata in JWT
  
  2. Security
    - Maintains same access control
    - Fixes the policy to correctly read the role from JWT
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admin and shift managers can insert match events" ON match_events;
DROP POLICY IF EXISTS "Admin and shift managers can update match events" ON match_events;
DROP POLICY IF EXISTS "Admin and shift managers can delete match events" ON match_events;

-- Create new policies with correct JWT path
CREATE POLICY "Admin and shift managers can insert match events"
  ON match_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = ANY (
      ARRAY['admin_sistema', 'admin_campeonato', 'admin', 'encargado_turno']
    )
  );

CREATE POLICY "Admin and shift managers can update match events"
  ON match_events
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = ANY (
      ARRAY['admin_sistema', 'admin_campeonato', 'admin', 'encargado_turno']
    )
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = ANY (
      ARRAY['admin_sistema', 'admin_campeonato', 'admin', 'encargado_turno']
    )
  );

CREATE POLICY "Admin and shift managers can delete match events"
  ON match_events
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = ANY (
      ARRAY['admin_sistema', 'admin_campeonato', 'admin', 'encargado_turno']
    )
  );
