/*
  # Simplificar Política de Actualización de Championships

  1. Cambios
    - Recrear la política de actualización de championships
    - Usar el mismo patrón que funciona en playoff_matches
    - Asegurar que los admins puedan actualizar phase, champion_team_id, etc.

  2. Seguridad
    - Mantener restricción de que solo admin_sistema o admin del campeonato pueden actualizar
*/

-- Eliminar política antigua
DROP POLICY IF EXISTS "System admins and championship admins can update championships" ON championships;

-- Crear nueva política con el mismo patrón que playoff_matches
CREATE POLICY "System admins and championship admins can update championships"
  ON championships FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role = 'admin_sistema'
        OR (p.role = 'admin_campeonato' AND championships.admin_id = auth.uid())
      )
    )
  );