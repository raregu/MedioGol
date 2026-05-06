/*
  # Permitir a admins de campeonato crear campeonatos

  ## Problema
  - Actualmente solo admin_sistema puede crear campeonatos
  - Los admin_campeonato necesitan poder crear sus propios campeonatos

  ## Solución
  - Modificar política de INSERT para permitir tanto a admin_sistema como admin_campeonato
  - El admin_campeonato solo puede asignarse a sí mismo como admin del campeonato
  - El admin_sistema puede asignar cualquier admin

  ## Seguridad
  - admin_campeonato puede crear campeonatos pero SOLO con admin_id = auth.uid()
  - admin_sistema puede crear campeonatos con cualquier admin_id
*/

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "System admins can insert championships" ON championships;

-- Create new INSERT policy that allows both admin_sistema and admin_campeonato
CREATE POLICY "Admins can insert championships"
  ON championships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- admin_sistema can create championships with any admin_id
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin_sistema'
      )
    )
    OR
    -- admin_campeonato can create championships but only with themselves as admin
    (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin_campeonato'
      )
      AND admin_id = auth.uid()
    )
  );