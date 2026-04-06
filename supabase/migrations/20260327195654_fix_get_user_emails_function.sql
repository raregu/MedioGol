/*
  # Fix get_users_with_emails Function

  1. Changes
    - Fix email column type from text to varchar to match auth.users table
    - Ensures compatibility with Supabase auth schema
*/

-- Drop and recreate the function with correct type
DROP FUNCTION IF EXISTS get_users_with_emails();

CREATE OR REPLACE FUNCTION get_users_with_emails()
RETURNS TABLE (
  id uuid,
  full_name text,
  role text,
  email varchar,
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
