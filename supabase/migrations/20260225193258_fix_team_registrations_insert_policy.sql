/*
  # Corregir política de INSERT en team_registrations

  ## Descripción
  Permite que los administradores de campeonato puedan inscribir equipos a sus campeonatos.

  ## Cambios
  - DROP y recrear la política de INSERT en team_registrations
  - Agregar validación para que admins de campeonato puedan inscribir cualquier equipo a su campeonato

  ## Seguridad
  - Dueños de equipos pueden inscribir sus propios equipos a cualquier campeonato
  - Admins del sistema pueden inscribir cualquier equipo a cualquier campeonato
  - Admins de campeonato pueden inscribir cualquier equipo a SU campeonato
*/

-- Eliminar política existente
DROP POLICY IF EXISTS "Team owners can register their teams" ON team_registrations;

-- Recrear política con validación mejorada
CREATE POLICY "Team owners and championship admins can register teams"
  ON team_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Dueño del equipo puede inscribir su equipo
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_id
        AND bt.owner_id = auth.uid()
    )
    -- Admin del sistema puede inscribir cualquier equipo
    OR (auth.jwt() ->> 'role' = 'admin_sistema')
    -- Admin del campeonato puede inscribir cualquier equipo a SU campeonato
    OR EXISTS (
      SELECT 1 FROM championships c
      WHERE c.id = championship_id
        AND (auth.jwt() ->> 'role' = 'admin_campeonato' AND c.admin_id = auth.uid())
    )
  );