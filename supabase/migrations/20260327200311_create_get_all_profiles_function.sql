/*
  # Create function to get all user profiles

  1. New Function
    - `get_all_profiles()` - Returns all user profiles with basic info
    - Available to system admins only
    - Returns: id, full_name, role, created_at from profiles table
  
  2. Security
    - Only system admins can execute this function
    - Does not expose sensitive email data
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_all_profiles();

-- Create function to get all user profiles
CREATE OR REPLACE FUNCTION get_all_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  role text,
  created_at timestamptz
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if user is system admin
  IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin_sistema' THEN
    RAISE EXCEPTION 'Only system admins can view all profiles';
  END IF;

  -- Return all profiles
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.role,
    p.created_at
  FROM profiles p
  ORDER BY p.created_at DESC;
END;
$$;