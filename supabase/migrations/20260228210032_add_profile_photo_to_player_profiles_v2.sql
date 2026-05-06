/*
  # Add profile_photo column to player_profiles

  1. Changes
    - Add `profile_photo` text column to store photo file path in storage
    - Column is nullable to allow players without photos

  2. Notes
    - Photos will be stored in Supabase storage and resized automatically
    - This column stores the storage path, not the full URL
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_profiles' AND column_name = 'profile_photo'
  ) THEN
    ALTER TABLE player_profiles ADD COLUMN profile_photo text;
  END IF;
END $$;
