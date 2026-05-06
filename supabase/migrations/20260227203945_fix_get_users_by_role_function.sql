/*
  # Fix get_users_by_role function type mismatch

  1. Changes
    - Drop existing function
    - Recreate with correct return types matching auth.users structure
    - Cast email to text type explicitly
    
  2. Purpose
    - Fix type mismatch error between varchar and text
    - Ensure function works correctly with auth.users email column
*/

-- Drop existing function
DROP FUNCTION IF EXISTS get_users_by_role(text);

-- Recreate function with correct types
CREATE OR REPLACE FUNCTION get_users_by_role(role_filter text)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    COALESCE(au.email::text, 'Sin email') as email,
    p.role
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE p.role = role_filter
  ORDER BY p.full_name;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_users_by_role(text) TO authenticated;
