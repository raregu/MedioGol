/*
  # Sync All User Roles to JWT and Create Trigger

  1. Problem
    - Roles are stored in profiles table but NOT in JWT token
    - Policies use auth.jwt()->>'role' but JWT is null
    - This causes permission errors

  2. Solution
    - Copy all existing roles from profiles to auth.users.raw_app_meta_data
    - Create trigger to automatically sync role changes to JWT
    - This ensures JWT always has current role

  3. Changes
    - Update all existing users to have role in JWT
    - Create function to sync role to JWT
    - Create trigger on profiles to auto-sync on INSERT/UPDATE
*/

-- Sync all existing roles from profiles to JWT
UPDATE auth.users
SET raw_app_meta_data = 
  COALESCE(raw_app_meta_data, '{}'::jsonb) || 
  jsonb_build_object('role', p.role)
FROM profiles p
WHERE auth.users.id = p.id
  AND p.role IS NOT NULL;

-- Create function to sync role to JWT when profile is updated
CREATE OR REPLACE FUNCTION sync_role_to_jwt()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the user's raw_app_meta_data with the new role
  UPDATE auth.users
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically sync role changes
DROP TRIGGER IF EXISTS sync_role_to_jwt_trigger ON profiles;
CREATE TRIGGER sync_role_to_jwt_trigger
  AFTER INSERT OR UPDATE OF role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_role_to_jwt();
