/*
  # Add Player Profile Trigger and Update Existing Users

  1. Changes
    - Create trigger to automatically create player_profile when a new user registers
    - Update existing users to have player profiles
    - Link profiles table with player_profiles table

  2. Security
    - Maintains existing RLS policies
*/

-- Create function to automatically create player profile when user registers
CREATE OR REPLACE FUNCTION create_player_profile_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create player profile with data from profiles table
  INSERT INTO player_profiles (id, full_name, photo_url)
  VALUES (
    NEW.id,
    NEW.full_name,
    NEW.avatar_url
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS on_profile_created_create_player_profile ON profiles;
CREATE TRIGGER on_profile_created_create_player_profile
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_player_profile_for_new_user();

-- Create player profiles for all existing users
INSERT INTO player_profiles (id, full_name, photo_url)
SELECT 
  p.id,
  p.full_name,
  p.avatar_url
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM player_profiles pp WHERE pp.id = p.id
)
ON CONFLICT (id) DO NOTHING;

-- Create function to sync profile updates to player profiles
CREATE OR REPLACE FUNCTION sync_profile_to_player_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Update player profile when profile is updated
  UPDATE player_profiles
  SET 
    full_name = NEW.full_name,
    photo_url = NEW.avatar_url,
    updated_at = now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to sync profile updates
DROP TRIGGER IF EXISTS on_profile_updated_sync_player_profile ON profiles;
CREATE TRIGGER on_profile_updated_sync_player_profile
  AFTER UPDATE ON profiles
  FOR EACH ROW
  WHEN (OLD.full_name IS DISTINCT FROM NEW.full_name OR OLD.avatar_url IS DISTINCT FROM NEW.avatar_url)
  EXECUTE FUNCTION sync_profile_to_player_profile();
