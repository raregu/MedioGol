/*
  # Gestión de Usuarios por Administrador del Sistema

  ## Descripción
  Permite que el administrador del sistema pueda:
  1. Ver todos los usuarios registrados
  2. Cambiar roles de usuarios
  3. Asignar administradores de campeonato

  ## Cambios
  1. Actualizar política RLS para que admin_sistema pueda actualizar roles
  2. Función para cambiar rol de usuario de forma segura

  ## Seguridad
  - Solo admin_sistema puede cambiar roles
  - Los usuarios no pueden cambiar su propio rol
*/

-- Eliminar política existente de actualización de profiles
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Crear nueva política que permite a usuarios actualizar su perfil excepto el rol
CREATE POLICY "Users can update own profile except role"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND (
      -- El usuario puede actualizar todo excepto el rol
      role = (SELECT role FROM profiles WHERE id = auth.uid())
    )
  );

-- Crear política para que admin_sistema pueda actualizar cualquier perfil incluyendo roles
CREATE POLICY "System admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Función para cambiar rol de usuario (solo para admin_sistema)
CREATE OR REPLACE FUNCTION change_user_role(
  target_user_id uuid,
  new_role text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_role text;
BEGIN
  -- Verificar que el usuario actual es admin_sistema
  SELECT role INTO current_user_role
  FROM profiles
  WHERE id = auth.uid();

  IF current_user_role != 'admin_sistema' THEN
    RAISE EXCEPTION 'Only system administrators can change user roles';
  END IF;

  -- Verificar que el nuevo rol es válido
  IF new_role NOT IN ('admin_sistema', 'admin_campeonato', 'usuario') THEN
    RAISE EXCEPTION 'Invalid role. Must be: admin_sistema, admin_campeonato, or usuario';
  END IF;

  -- No permitir que el usuario se quite a sí mismo el rol de admin_sistema si es el único
  IF target_user_id = auth.uid() AND new_role != 'admin_sistema' THEN
    IF (SELECT COUNT(*) FROM profiles WHERE role = 'admin_sistema') <= 1 THEN
      RAISE EXCEPTION 'Cannot remove admin_sistema role from the only system administrator';
    END IF;
  END IF;

  -- Actualizar el rol
  UPDATE profiles
  SET role = new_role,
      updated_at = now()
  WHERE id = target_user_id;

  RETURN json_build_object(
    'success', true,
    'user_id', target_user_id,
    'new_role', new_role
  );
END;
$$;

-- Política para que admin_sistema pueda eliminar usuarios (opcional, por seguridad)
CREATE POLICY "System admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
    AND id != auth.uid() -- No puede eliminarse a sí mismo
  );
