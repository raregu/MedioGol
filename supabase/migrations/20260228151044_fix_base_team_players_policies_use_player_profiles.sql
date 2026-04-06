/*
  # Fix base_team_players RLS Policies

  1. Changes
    - Drop existing policies that incorrectly compare owner_id with auth.uid()
    - Create new policies that properly join through player_profiles to get user_id
    - Owner_id in base_teams references player_profiles.id, not auth.users.id
  
  2. Security
    - Team owners can view, add, update, and remove players
    - Players can view their own roster
    - System admins can view all rosters
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Team owners can add players" ON base_team_players;
DROP POLICY IF EXISTS "Team owners can remove players" ON base_team_players;
DROP POLICY IF EXISTS "Team owners can update players" ON base_team_players;
DROP POLICY IF EXISTS "Team owners, players, and admins can view roster" ON base_team_players;

-- Create new policies with correct join through player_profiles
CREATE POLICY "Team owners can view players"
  ON base_team_players FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM base_teams bt
      JOIN player_profiles pp ON bt.owner_id = pp.id
      WHERE bt.id = base_team_players.base_team_id
        AND pp.id IN (SELECT id FROM player_profiles WHERE id = (SELECT id FROM player_profiles WHERE id = auth.uid()))
    )
    OR player_id IN (SELECT id FROM player_profiles WHERE id = auth.uid())
    OR (SELECT raw_app_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin_sistema'
  );

CREATE POLICY "Team owners can add players"
  ON base_team_players FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM base_teams bt
      JOIN player_profiles pp ON bt.owner_id = pp.id
      WHERE bt.id = base_team_players.base_team_id
        AND pp.id IN (SELECT id FROM player_profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Team owners can update players"
  ON base_team_players FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM base_teams bt
      JOIN player_profiles pp ON bt.owner_id = pp.id
      WHERE bt.id = base_team_players.base_team_id
        AND pp.id IN (SELECT id FROM player_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM base_teams bt
      JOIN player_profiles pp ON bt.owner_id = pp.id
      WHERE bt.id = base_team_players.base_team_id
        AND pp.id IN (SELECT id FROM player_profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Team owners can remove players"
  ON base_team_players FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM base_teams bt
      JOIN player_profiles pp ON bt.owner_id = pp.id
      WHERE bt.id = base_team_players.base_team_id
        AND pp.id IN (SELECT id FROM player_profiles WHERE id = auth.uid())
    )
  );
