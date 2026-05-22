-- Solicitudes de ingreso a equipos base
CREATE TABLE IF NOT EXISTS base_team_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_team_id uuid NOT NULL REFERENCES base_teams(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(base_team_id, requester_id)
);

ALTER TABLE base_team_join_requests ENABLE ROW LEVEL SECURITY;

-- El solicitante y el dueño del equipo pueden ver las solicitudes
CREATE POLICY "Ver solicitudes propias o de mi equipo"
  ON base_team_join_requests FOR SELECT
  USING (
    auth.uid() = requester_id
    OR auth.uid() IN (SELECT owner_id FROM base_teams WHERE id = base_team_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema')
  );

-- Usuarios autenticados pueden crear solicitudes (solo para sí mismos)
CREATE POLICY "Crear solicitud de ingreso"
  ON base_team_join_requests FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- El dueño del equipo puede aprobar o rechazar
CREATE POLICY "Dueño puede responder solicitudes"
  ON base_team_join_requests FOR UPDATE
  USING (
    auth.uid() IN (SELECT owner_id FROM base_teams WHERE id = base_team_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin_sistema')
  );
