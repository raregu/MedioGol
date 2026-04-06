/*
  # Allow viewing base team players in championships

  1. Changes
    - Add policy to allow authenticated users to view players of teams registered in championships
    - Keep existing owner policies
*/

-- Drop existing select policy
DROP POLICY IF EXISTS "Owner can view players" ON base_team_players;

-- Allow owners to view their team players
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

-- Allow authenticated users to view players of teams registered in championships
CREATE POLICY "Authenticated users can view championship team players"
  ON base_team_players FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_registrations tr
      WHERE tr.base_team_id = base_team_players.base_team_id
    )
  );
