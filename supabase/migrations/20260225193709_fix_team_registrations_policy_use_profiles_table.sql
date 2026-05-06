/*
  # Corregir política de INSERT en team_registrations - usar tabla profiles

  ## Descripción
  Modifica la política para verificar roles tanto en JWT como en la tabla profiles,
  eliminando la necesidad de cerrar sesión para que funcione.

  ## Cambios
  - DROP y recrear la política de INSERT en team_registrations
  - Verificar roles en profiles.role además del JWT
  - Simplificar la lógica para hacerla más robusta

  ## Seguridad
  - Dueños de equipos pueden inscribir sus propios equipos a cualquier campeonato
  - Admins del sistema pueden inscribir cualquier equipo a cualquier campeonato
  - Admins de campeonato pueden inscribir cualquier equipo a SU campeonato
*/

-- Eliminar política existente
DROP POLICY IF EXISTS "Team owners and championship admins can register teams" ON team_registrations;

-- Recrear política consultando directamente la tabla profiles
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
    -- Admin del sistema puede inscribir cualquier equipo (verificar en profiles)
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin_sistema'
    )
    -- Admin del campeonato puede inscribir cualquier equipo a SU campeonato (verificar en profiles)
    OR EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
        AND p.role = 'admin_campeonato'
        AND c.admin_id = auth.uid()
    )
  );