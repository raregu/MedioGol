/*
  # Simplify base_team_players RLS Policies

  1. Changes
    - Replace complex policies with simple direct comparison
    - player_profiles.id = auth.users.id (same UUID)
    - base_teams.owner_id = player_profiles.id = auth.uid()
*/

DROP POLICY IF EXISTS "Team owners can view players" ON base_team_players;
DROP POLICY IF EXISTS "Team owners can add players" ON base_team_players;
DROP POLICY IF EXISTS "Team owners can update players" ON base_team_players;
DROP POLICY IF EXISTS "Team owners can remove players" ON base_team_players;

CREATE POLICY "Owner can view players"
  ON base_team_players FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_players.base_team_id
        AND bt.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can add players"
  ON base_team_players FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_players.base_team_id
        AND bt.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update players"
  ON base_team_players FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_players.base_team_id
        AND bt.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_players.base_team_id
        AND bt.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner can remove players"
  ON base_team_players FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = base_team_players.base_team_id
        AND bt.owner_id = auth.uid()
    )
  );
