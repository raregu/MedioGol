/*
  # Corregir Políticas de Playoff Matches con Roles Correctos

  1. Cambios
    - Eliminar políticas antiguas con roles incorrectos
    - Crear nuevas políticas usando los roles correctos del sistema
    - Usar 'admin_sistema' en lugar de 'administrador_sistema'
    - Usar 'admin_campeonato' en lugar de 'administrador_campeonato'

  2. Seguridad
    - Mantener RLS habilitado
    - Políticas para admins del campeonato actualizar partidos de playoff
*/

-- Eliminar políticas antiguas
DROP POLICY IF EXISTS "Championship admins can create playoff config" ON playoff_config;
DROP POLICY IF EXISTS "Championship admins can update playoff config" ON playoff_config;
DROP POLICY IF EXISTS "Championship admins can delete playoff config" ON playoff_config;
DROP POLICY IF EXISTS "Championship admins can create playoff matches" ON playoff_matches;
DROP POLICY IF EXISTS "Championship admins can update playoff matches" ON playoff_matches;
DROP POLICY IF EXISTS "Championship admins can delete playoff matches" ON playoff_matches;

-- Políticas para playoff_config con roles correctos

CREATE POLICY "Championship admins can create playoff config"
  ON playoff_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('admin_sistema', 'admin_campeonato')
      )
    )
  );

CREATE POLICY "Championship admins can update playoff config"
  ON playoff_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('admin_sistema', 'admin_campeonato')
      )
    )
  );

CREATE POLICY "Championship admins can delete playoff config"
  ON playoff_config FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('admin_sistema', 'admin_campeonato')
      )
    )
  );

-- Políticas para playoff_matches con roles correctos

CREATE POLICY "Championship admins can create playoff matches"
  ON playoff_matches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('admin_sistema', 'admin_campeonato', 'encargado_turno')
      )
    )
  );

CREATE POLICY "Championship admins can update playoff matches"
  ON playoff_matches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('admin_sistema', 'admin_campeonato', 'encargado_turno')
      )
    )
  );

CREATE POLICY "Championship admins can delete playoff matches"
  ON playoff_matches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('admin_sistema', 'admin_campeonato')
      )
    )
  );