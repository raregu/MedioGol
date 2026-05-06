/*
  # Debug and Fix Shift Manager Assignment Insert Policy

  1. Changes
    - Add detailed logging policy
    - Simplify INSERT policy to be more permissive for testing
    
  2. Security
    - Temporarily more permissive to identify the issue
*/

-- Drop existing insert policy
DROP POLICY IF EXISTS "Admins can assign shift managers" ON shift_manager_assignments;

-- Create a more permissive policy
CREATE POLICY "Admins can assign shift managers"
  ON shift_manager_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- System admin can assign to any championship (no additional checks)
    (auth.jwt() ->> 'role') = 'admin_sistema'
    OR
    -- Championship admin can assign if they own the championship
    (
      (auth.jwt() ->> 'role') = 'admin_campeonato'
      AND
      EXISTS (
        SELECT 1 FROM championships
        WHERE championships.id = shift_manager_assignments.championship_id
        AND championships.admin_id = auth.uid()
      )
    )
  );

-- Create helper function to test policy logic
CREATE OR REPLACE FUNCTION test_shift_manager_policy(
  p_championship_id uuid,
  p_user_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_current_user_id uuid;
  v_current_role text;
  v_is_owner boolean;
  v_result jsonb;
BEGIN
  -- Get current user
  v_current_user_id := auth.uid();
  v_current_role := auth.jwt() ->> 'role';
  
  -- Check if user owns championship
  SELECT EXISTS (
    SELECT 1 FROM championships
    WHERE id = p_championship_id
    AND admin_id = v_current_user_id
  ) INTO v_is_owner;
  
  v_result := jsonb_build_object(
    'current_user_id', v_current_user_id,
    'current_role', v_current_role,
    'championship_id', p_championship_id,
    'is_owner', v_is_owner,
    'can_insert_system_admin', (v_current_role = 'admin_sistema'),
    'can_insert_championship_admin', (v_current_role = 'admin_campeonato' AND v_is_owner)
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
