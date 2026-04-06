/*
  # Create base team players management system

  1. New Tables
    - `base_team_players`
      - `id` (uuid, primary key)
      - `base_team_id` (uuid, references base_teams)
      - `player_id` (uuid, references player_profiles)
      - `role` (text) - captain, subcaptain, player
      - `jersey_number` (integer)
      - `position` (text) - goalkeeper, defender, midfielder, forward
      - `joined_at` (timestamptz)
      - `status` (text) - active, inactive
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `base_team_invitations`
      - `id` (uuid, primary key)
      - `base_team_id` (uuid, references base_teams)
      - `player_email` (text)
      - `player_id` (uuid, references player_profiles, nullable)
      - `invited_by` (uuid, references auth.users)
      - `status` (text) - pending, accepted, rejected, cancelled
      - `expires_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Base team owners can manage their players
    - Players can view their team roster
    - Players can accept/reject invitations
    - Admins can view all

  3. Indexes
    - Index on base_team_id for faster queries
    - Index on player_id for faster lookups
    - Unique constraint on base_team_id + player_id + status
*/

-- Create base_team_players table
CREATE TABLE IF NOT EXISTS base_team_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_team_id uuid NOT NULL REFERENCES base_teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('captain', 'subcaptain', 'player')),
  jersey_number integer CHECK (jersey_number >= 0 AND jersey_number <= 99),
  position text CHECK (position IN ('goalkeeper', 'defender', 'midfielder', 'forward')),
  joined_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create base_team_invitations table
CREATE TABLE IF NOT EXISTS base_team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_team_id uuid NOT NULL REFERENCES base_teams(id) ON DELETE CASCADE,
  player_email text NOT NULL,
  player_id uuid REFERENCES player_profiles(id) ON DELETE SET NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_base_team_players_base_team ON base_team_players(base_team_id);
CREATE INDEX IF NOT EXISTS idx_base_team_players_player ON base_team_players(player_id);
CREATE INDEX IF NOT EXISTS idx_base_team_players_status ON base_team_players(status);
CREATE INDEX IF NOT EXISTS idx_base_team_invitations_base_team ON base_team_invitations(base_team_id);
CREATE INDEX IF NOT EXISTS idx_base_team_invitations_player ON base_team_invitations(player_id);
CREATE INDEX IF NOT EXISTS idx_base_team_invitations_email ON base_team_invitations(player_email);
CREATE INDEX IF NOT EXISTS idx_base_team_invitations_status ON base_team_invitations(status);

-- Unique constraint: one active player per base team
CREATE UNIQUE INDEX IF NOT EXISTS idx_base_team_players_unique_active 
  ON base_team_players(base_team_id, player_id) 
  WHERE status = 'active';

-- Enable RLS
ALTER TABLE base_team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_team_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for base_team_players

-- SELECT: Team owners, team players, and admins can view
CREATE POLICY "Team owners, players, and admins can view roster"
  ON base_team_players
  FOR SELECT
  TO authenticated
  USING (
    -- Team owner
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_id AND bt.owner_id = auth.uid()
    )
    OR
    -- Player in the team (player_id references player_profiles.id which is auth.users.id)
    player_id = auth.uid()
    OR
    -- Admin
    (auth.jwt() ->> 'role') = 'admin_sistema'
  );

-- INSERT: Only team owners can add players
CREATE POLICY "Team owners can add players"
  ON base_team_players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_id AND bt.owner_id = auth.uid()
    )
  );

-- UPDATE: Team owners can update player info
CREATE POLICY "Team owners can update players"
  ON base_team_players
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_id AND bt.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_id AND bt.owner_id = auth.uid()
    )
  );

-- DELETE: Team owners can remove players
CREATE POLICY "Team owners can remove players"
  ON base_team_players
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_id AND bt.owner_id = auth.uid()
    )
  );

-- RLS Policies for base_team_invitations

-- SELECT: Team owners, invited players, and admins can view
CREATE POLICY "Team owners, invited players, and admins can view invitations"
  ON base_team_invitations
  FOR SELECT
  TO authenticated
  USING (
    -- Team owner
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_id AND bt.owner_id = auth.uid()
    )
    OR
    -- Invited player by player_id
    player_id = auth.uid()
    OR
    -- Admin
    (auth.jwt() ->> 'role') = 'admin_sistema'
  );

-- INSERT: Team owners can create invitations
CREATE POLICY "Team owners can create invitations"
  ON base_team_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_id AND bt.owner_id = auth.uid()
    )
  );

-- UPDATE: Team owners can update their invitations, players can accept/reject
CREATE POLICY "Team owners and invited players can update invitations"
  ON base_team_invitations
  FOR UPDATE
  TO authenticated
  USING (
    -- Team owner
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_id AND bt.owner_id = auth.uid()
    )
    OR
    -- Invited player
    player_id = auth.uid()
  )
  WITH CHECK (
    -- Team owner
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_id AND bt.owner_id = auth.uid()
    )
    OR
    -- Invited player
    player_id = auth.uid()
  );

-- DELETE: Team owners can delete invitations
CREATE POLICY "Team owners can delete invitations"
  ON base_team_invitations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_id AND bt.owner_id = auth.uid()
    )
  );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_base_team_players_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_base_team_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_base_team_players_updated_at ON base_team_players;
CREATE TRIGGER update_base_team_players_updated_at
  BEFORE UPDATE ON base_team_players
  FOR EACH ROW
  EXECUTE FUNCTION update_base_team_players_updated_at();

DROP TRIGGER IF EXISTS update_base_team_invitations_updated_at ON base_team_invitations;
CREATE TRIGGER update_base_team_invitations_updated_at
  BEFORE UPDATE ON base_team_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_base_team_invitations_updated_at();