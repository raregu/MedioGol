/*
  # Create function to get user emails

  1. New Function
    - `get_user_emails()` - Returns user IDs and emails from auth.users
    - Available to system admins only
    - Returns: id, email
  
  2. Security
    - Only system admins can execute this function
    - Accesses auth.users table for email data
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_user_emails();

-- Create function to get user emails
CREATE OR REPLACE FUNCTION get_user_emails()
RETURNS TABLE (
  id uuid,
  email text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if user is system admin
  IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin_sistema' THEN
    RAISE EXCEPTION 'Only system admins can view user emails';
  END IF;

  -- Return emails from auth.users
  RETURN QUERY
  SELECT 
    au.id,
    au.email::text
  FROM auth.users au
  ORDER BY au.created_at DESC;
END;
$$;