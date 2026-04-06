/*
  # Add Match Events System

  ## Overview
  This migration creates a comprehensive system for recording match events including goals, 
  yellow cards, red cards, and substitutions during matches.

  ## New Tables
  
  ### `match_events`
  Records all events that occur during a match with the following columns:
  - `id` (uuid, primary key) - Unique identifier for the event
  - `match_id` (uuid, foreign key) - References the match where the event occurred
  - `player_id` (uuid, foreign key) - References the player involved in the event
  - `team_id` (uuid, foreign key) - References the team of the player
  - `event_type` (text) - Type of event: 'goal', 'yellow_card', 'red_card', 'substitution_in', 'substitution_out'
  - `minute` (integer) - Minute of the match when the event occurred
  - `additional_info` (jsonb) - Additional information (e.g., assist player, substitution details)
  - `created_at` (timestamptz) - Timestamp when the record was created
  - `created_by` (uuid) - User who recorded the event

  ## Security
  - Enable RLS on `match_events` table
  - Admin can insert, update, and delete match events
  - All authenticated users can view match events
  - Events are tied to specific matches and players for data integrity

  ## Indexes
  - Index on `match_id` for fast event retrieval by match
  - Index on `player_id` for fast player statistics queries
  - Index on `event_type` for filtering by event type
*/

-- Create match_events table
CREATE TABLE IF NOT EXISTS match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('goal', 'yellow_card', 'red_card', 'substitution_in', 'substitution_out')),
  minute integer NOT NULL CHECK (minute >= 0 AND minute <= 120),
  additional_info jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_player_id ON match_events(player_id);
CREATE INDEX IF NOT EXISTS idx_match_events_event_type ON match_events(event_type);
CREATE INDEX IF NOT EXISTS idx_match_events_team_id ON match_events(team_id);

-- Enable RLS
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for match_events

-- All authenticated users can view match events
CREATE POLICY "Authenticated users can view match events"
  ON match_events
  FOR SELECT
  TO authenticated
  USING (true);

-- Admin users can insert match events
CREATE POLICY "Admin users can insert match events"
  ON match_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admin users can update match events
CREATE POLICY "Admin users can update match events"
  ON match_events
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admin users can delete match events
CREATE POLICY "Admin users can delete match events"
  ON match_events
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
