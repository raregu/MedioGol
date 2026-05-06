/*
  # Fix infinite recursion in players policies

  1. Problem
    - The policy "Users can view players from their teams" causes infinite recursion
    - It queries the players table within a players policy (checking p2.user_id)
    - This creates a circular dependency

  2. Solution
    - Drop the problematic policy
    - Create a simpler policy that doesn't reference players table recursively
    - Use direct team membership check without nested player queries

  3. Changes
    - Drop old "Users can view players from their teams" policy
    - Create new policy that only checks:
      - User is team captain
      - User is admin (via JWT role)
      - User can see all players in public championships (optional)
*/

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view players from their teams" ON players;

-- Create a non-recursive policy for viewing players
CREATE POLICY "Users can view players in their teams"
  ON players
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = players.team_id
        AND t.captain_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM teams t
      JOIN championships c ON c.id = t.championship_id
      WHERE t.id = players.team_id
        AND (
          (auth.jwt() ->> 'role' = 'admin_sistema')
          OR (auth.jwt() ->> 'role' = 'admin_campeonato' AND c.admin_id = auth.uid())
        )
    )
  );
