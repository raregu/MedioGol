/*
  # Create Player Profiles and Statistics System

  1. Changes
    - Add player_profiles table that links users to their player data
    - Add match_statistics table to track individual player performance per match
    - Add player_reviews table for community opinions
    - Add player_career_stats view for aggregated statistics
    - Update team_players to reference player_profiles instead of standalone players
    - Add triggers to automatically update career statistics

  2. New Tables
    - `player_profiles` - Links users to their player information
      - `id` (uuid, FK to auth.users)
      - `full_name` (text)
      - `date_of_birth` (date)
      - `position` (text)
      - `jersey_number` (int)
      - `photo_url` (text)
      - `bio` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `match_statistics` - Individual player stats per match
      - `id` (uuid)
      - `match_id` (uuid, FK)
      - `player_id` (uuid, FK to player_profiles)
      - `team_id` (uuid, FK)
      - `goals` (int)
      - `assists` (int)
      - `yellow_cards` (int)
      - `red_cards` (int)
      - `minutes_played` (int)
      - `created_at` (timestamptz)
    
    - `player_reviews` - Community reviews for players
      - `id` (uuid)
      - `player_id` (uuid, FK to player_profiles)
      - `reviewer_id` (uuid, FK to profiles)
      - `rating` (int, 1-5)
      - `comment` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `team_players` - Links players to teams
      - `id` (uuid)
      - `team_id` (uuid, FK)
      - `player_id` (uuid, FK to player_profiles)
      - `joined_at` (timestamptz)
      - `left_at` (timestamptz, nullable)
      - `is_active` (boolean)

  3. Views
    - `player_career_stats` - Aggregated career statistics

  4. Security
    - Enable RLS on all new tables
    - Player profiles viewable by everyone
    - Match statistics viewable by everyone, editable by admins
    - Reviews viewable by everyone, creatable by authenticated users
    - Users can edit their own reviews
*/

-- Create player_profiles table
CREATE TABLE IF NOT EXISTS player_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  date_of_birth date,
  position text,
  jersey_number int,
  photo_url text,
  bio text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create match_statistics table
CREATE TABLE IF NOT EXISTS match_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  goals int DEFAULT 0,
  assists int DEFAULT 0,
  yellow_cards int DEFAULT 0,
  red_cards int DEFAULT 0,
  minutes_played int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(match_id, player_id)
);

-- Create player_reviews table
CREATE TABLE IF NOT EXISTS player_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(player_id, reviewer_id)
);

-- Create team_players table
CREATE TABLE IF NOT EXISTS team_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  left_at timestamptz,
  is_active boolean DEFAULT true,
  UNIQUE(team_id, player_id, is_active)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_match_statistics_player ON match_statistics(player_id);
CREATE INDEX IF NOT EXISTS idx_match_statistics_match ON match_statistics(match_id);
CREATE INDEX IF NOT EXISTS idx_player_reviews_player ON player_reviews(player_id);
CREATE INDEX IF NOT EXISTS idx_team_players_team ON team_players(team_id);
CREATE INDEX IF NOT EXISTS idx_team_players_player ON team_players(player_id);
CREATE INDEX IF NOT EXISTS idx_team_players_active ON team_players(is_active) WHERE is_active = true;

-- Create view for career statistics
CREATE OR REPLACE VIEW player_career_stats AS
SELECT 
  p.id,
  p.full_name,
  p.position,
  p.photo_url,
  COUNT(DISTINCT ms.match_id) as matches_played,
  COALESCE(SUM(ms.goals), 0) as total_goals,
  COALESCE(SUM(ms.assists), 0) as total_assists,
  COALESCE(SUM(ms.yellow_cards), 0) as total_yellow_cards,
  COALESCE(SUM(ms.red_cards), 0) as total_red_cards,
  COALESCE(SUM(ms.minutes_played), 0) as total_minutes,
  COALESCE(AVG(pr.rating), 0) as avg_rating,
  COUNT(DISTINCT pr.id) as review_count
FROM player_profiles p
LEFT JOIN match_statistics ms ON p.id = ms.player_id
LEFT JOIN player_reviews pr ON p.id = pr.player_id
GROUP BY p.id, p.full_name, p.position, p.photo_url;

-- Enable RLS
ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;

-- Player profiles policies
CREATE POLICY "Everyone can view player profiles"
  ON player_profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own player profile"
  ON player_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "System admins can update any player profile"
  ON player_profiles
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin_sistema')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin_sistema');

CREATE POLICY "Users can insert their own player profile"
  ON player_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Match statistics policies
CREATE POLICY "Everyone can view match statistics"
  ON match_statistics
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System admins can insert match statistics"
  ON match_statistics
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin_sistema');

CREATE POLICY "System admins can update match statistics"
  ON match_statistics
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin_sistema')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin_sistema');

CREATE POLICY "Championship admins can insert match statistics"
  ON match_statistics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin_campeonato' AND
    EXISTS (
      SELECT 1 FROM matches m
      JOIN championships c ON m.championship_id = c.id
      WHERE m.id = match_id AND c.admin_id = auth.uid()
    )
  );

CREATE POLICY "Championship admins can update match statistics"
  ON match_statistics
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'admin_campeonato' AND
    EXISTS (
      SELECT 1 FROM matches m
      JOIN championships c ON m.championship_id = c.id
      WHERE m.id = match_id AND c.admin_id = auth.uid()
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin_campeonato' AND
    EXISTS (
      SELECT 1 FROM matches m
      JOIN championships c ON m.championship_id = c.id
      WHERE m.id = match_id AND c.admin_id = auth.uid()
    )
  );

-- Player reviews policies
CREATE POLICY "Everyone can view player reviews"
  ON player_reviews
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert reviews"
  ON player_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Users can update their own reviews"
  ON player_reviews
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = reviewer_id)
  WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Users can delete their own reviews"
  ON player_reviews
  FOR DELETE
  TO authenticated
  USING (auth.uid() = reviewer_id);

-- Team players policies
CREATE POLICY "Everyone can view team players"
  ON team_players
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Team captains can add players to their teams"
  ON team_players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_id AND t.captain_id = auth.uid()
    )
  );

CREATE POLICY "System admins can manage team players"
  ON team_players
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin_sistema')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin_sistema');

CREATE POLICY "Team captains can update their team players"
  ON team_players
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_id AND t.captain_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_id AND t.captain_id = auth.uid()
    )
  );

-- Create trigger to update player_profiles updated_at
CREATE OR REPLACE FUNCTION update_player_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_player_profiles_updated_at
  BEFORE UPDATE ON player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_player_profile_updated_at();

-- Create trigger to update player_reviews updated_at
CREATE OR REPLACE FUNCTION update_player_review_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_player_reviews_updated_at
  BEFORE UPDATE ON player_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_player_review_updated_at();
