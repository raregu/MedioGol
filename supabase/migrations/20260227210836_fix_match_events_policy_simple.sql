DROP POLICY IF EXISTS "Admin and shift managers can insert match events" ON match_events;

CREATE POLICY "Admin and shift managers can insert match events"
  ON match_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt()->>'role') IN ('admin_sistema', 'admin_campeonato', 'admin', 'encargado_turno')
  );