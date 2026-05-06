/*
  # Create function to get users by role with email

  1. New Functions
    - `get_users_by_role` - Returns user profiles with their email addresses from auth.users
      - Parameters:
        - role_filter (text): The role to filter by
      - Returns: JSON array with id, full_name, email, and role
      
  2. Security
    - Function is SECURITY DEFINER to access auth.users
    - Only authenticated users can call this function
    - Returns only basic user information (no sensitive auth data)

  3. Purpose
    - Allows admin users to see email addresses when assigning shift managers
    - Combines profile data with auth.users email in a secure way
*/

-- Create function to get users by role including their email
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
    COALESCE(au.email, 'Sin email') as email,
    p.role
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE p.role = role_filter
  ORDER BY p.full_name;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_users_by_role(text) TO authenticated;
