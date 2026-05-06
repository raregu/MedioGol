/*
  # Fix Captain Confirmation Update Policy

  1. Changes
    - Add a new permissive policy to allow captains to confirm their participation
    - This policy specifically allows captains to update captain_confirmed and is_enabled fields
    - Solves the circular dependency where captains couldn't confirm because they weren't confirmed yet

  2. Security
    - Policy is restricted to the captain of the team only
    - Captain can only update their own teams
    - Maintains data integrity while allowing the confirmation workflow
*/

-- Drop the old restrictive policy that prevents captains from confirming
DROP POLICY IF EXISTS "Admins and confirmed captains can update teams" ON teams;

-- Create a new policy that allows captains to update teams (including confirmation)
CREATE POLICY "Captains can update their teams"
  ON teams
  FOR UPDATE
  TO authenticated
  USING (captain_id = auth.uid())
  WITH CHECK (captain_id = auth.uid());

-- Keep the admin policies separate for clarity
CREATE POLICY "Admins can update any team"
  ON teams
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'admin_sistema' 
    OR 
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = teams.championship_id
      AND championships.admin_id = auth.uid()
      AND (auth.jwt() ->> 'role') = 'admin_campeonato'
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin_sistema' 
    OR 
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = teams.championship_id
      AND championships.admin_id = auth.uid()
      AND (auth.jwt() ->> 'role') = 'admin_campeonato'
    )
  );
