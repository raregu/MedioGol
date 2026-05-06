/*
  # Update change_user_role function to include new roles

  1. Changes
    - Update the change_user_role function to accept additional roles:
      - encargado_turno (shift manager)
      - capitan (team captain)
    - These roles were added to the system but the role change function wasn't updated

  2. Security
    - Maintains all existing security checks
    - Only admin_sistema can change user roles
    - Prevents removing the last admin_sistema
*/

-- Update the function to include all valid roles
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
  -- Verify that the current user is admin_sistema
  SELECT role INTO current_user_role
  FROM profiles
  WHERE id = auth.uid();

  IF current_user_role != 'admin_sistema' THEN
    RAISE EXCEPTION 'Only system administrators can change user roles';
  END IF;

  -- Verify that the new role is valid (updated to include all roles)
  IF new_role NOT IN ('admin_sistema', 'admin_campeonato', 'usuario', 'encargado_turno', 'capitan') THEN
    RAISE EXCEPTION 'Invalid role. Must be: admin_sistema, admin_campeonato, encargado_turno, capitan, or usuario';
  END IF;

  -- Do not allow the user to remove their own admin_sistema role if they are the only one
  IF target_user_id = auth.uid() AND new_role != 'admin_sistema' THEN
    IF (SELECT COUNT(*) FROM profiles WHERE role = 'admin_sistema') <= 1 THEN
      RAISE EXCEPTION 'Cannot remove admin_sistema role from the only system administrator';
    END IF;
  END IF;

  -- Update the role
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
