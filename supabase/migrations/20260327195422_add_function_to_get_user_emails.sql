/*
  # Add Function to Get User Emails for Admin

  1. New Function
    - `get_users_with_emails()` - Returns user profiles with their email addresses
    - Only accessible by system admins
    - Joins profiles table with auth.users to get email addresses

  2. Security
    - Function uses SECURITY DEFINER to access auth.users table
    - Only system admins can execute this function
*/

-- Function to get users with their emails (admin only)
CREATE OR REPLACE FUNCTION get_users_with_emails()
RETURNS TABLE (
  id uuid,
  full_name text,
  role text,
  email text,
  created_at timestamptz
) 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the caller is a system admin
  IF (auth.jwt() ->> 'role') != 'admin_sistema' THEN
    RAISE EXCEPTION 'Only system admins can view user emails';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.role,
    u.email,
    p.created_at
  FROM profiles p
  LEFT JOIN auth.users u ON p.id = u.id
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql;
