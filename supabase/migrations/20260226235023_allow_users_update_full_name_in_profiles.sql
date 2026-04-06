/*
  # Permitir a usuarios actualizar su nombre completo en profiles

  ## Problema
  - Usuarios necesitan poder actualizar su full_name en la tabla profiles
  - La política actual solo verifica que el rol no cambie
  - Pero no permite actualizar otros campos como full_name

  ## Solución
  - Modificar la política para permitir actualizar full_name y avatar_url
  - Mantener la restricción de que el rol no puede cambiar
  - Separar las políticas para mayor claridad

  ## Seguridad
  - Usuarios pueden actualizar SOLO su propio perfil (auth.uid() = id)
  - Usuarios NO pueden cambiar su rol
  - Admin sistema tiene políticas separadas para gestión completa
*/

-- Drop existing policy for users updating their own profile
DROP POLICY IF EXISTS "Users can update own profile except role" ON profiles;

-- Create new policy that allows users to update their profile but not their role
CREATE POLICY "Users can update own profile data"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND role = (auth.jwt()->>'role')::text
  );