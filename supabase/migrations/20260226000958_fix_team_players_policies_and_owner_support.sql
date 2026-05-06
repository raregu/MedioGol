/*
  # Fix team_players policies and add base_teams owner support

  1. Changes
    - Add policy to allow base_teams owners to add players
    - Fix unique constraint on team_players to allow reactivation
    - Add support for base_teams ownership

  2. Security
    - Base team owners can manage their team players
    - Team captains can manage their championship team players
*/

DROP POLICY IF EXISTS "Team captains can add players to their teams" ON team_players;
DROP POLICY IF EXISTS "Team captains can update their team players" ON team_players;

CREATE POLICY "Team captains and base team owners can add players"
  ON team_players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_id AND t.captain_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM teams t
      JOIN base_teams bt ON t.base_team_id = bt.id
      WHERE t.id = team_id AND bt.owner_id = auth.uid()
    )
  );

CREATE POLICY "Team captains and base team owners can update players"
  ON team_players
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_id AND t.captain_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM teams t
      JOIN base_teams bt ON t.base_team_id = bt.id
      WHERE t.id = team_id AND bt.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_id AND t.captain_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM teams t
      JOIN base_teams bt ON t.base_team_id = bt.id
      WHERE t.id = team_id AND bt.owner_id = auth.uid()
    )
  );

CREATE POLICY "Team captains and base team owners can delete players"
  ON team_players
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = team_id AND t.captain_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM teams t
      JOIN base_teams bt ON t.base_team_id = bt.id
      WHERE t.id = team_id AND bt.owner_id = auth.uid()
    )
  );
