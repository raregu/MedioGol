/*
  # Add profile photo to player profiles

  1. Changes
    - Add photo_url column to player_profiles table for storing profile pictures
    - Column is optional (nullable) and uses text type for URL storage
  
  2. Storage
    - Profile photos will be stored in Supabase Storage bucket 'player-photos'
    - URLs will reference the storage bucket location
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'player_profiles' AND column_name = 'photo_url'
  ) THEN
    ALTER TABLE player_profiles ADD COLUMN photo_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND policyname = 'Anyone can view player photos'
  ) THEN
    CREATE POLICY "Anyone can view player photos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'player-photos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload player photos'
  ) THEN
    CREATE POLICY "Authenticated users can upload player photos"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'player-photos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND policyname = 'Users can update own player photos'
  ) THEN
    CREATE POLICY "Users can update own player photos"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'player-photos' AND (storage.foldername(name))[1] = (auth.jwt()->>'sub'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' AND policyname = 'Users can delete own player photos'
  ) THEN
    CREATE POLICY "Users can delete own player photos"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'player-photos' AND (storage.foldername(name))[1] = (auth.jwt()->>'sub'));
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('player-photos', 'player-photos', true)
ON CONFLICT (id) DO NOTHING;
