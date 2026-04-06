/*
  # Allow championship admins to create teams without captain

  1. Changes
    - Make teams.captain_id nullable (already nullable, just documenting)
    - Add function to assign team captain
    - Update RLS policies to allow championship admins to create/manage unassigned teams
  
  2. Security
    - Championship admins can create teams for their championships without captain
    - Championship admins can assign captains to unassigned teams
    - Once assigned, normal team ownership rules apply
    - System admins can also manage all teams
*/

-- Create function to assign team captain
CREATE OR REPLACE FUNCTION assign_team_captain(
  team_id_param uuid,
  new_captain_id uuid
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  team_championship_id uuid;
  user_role text;
BEGIN
  -- Get user role
  user_role := auth.jwt() -> 'app_metadata' ->> 'role';
  
  -- Get team's championship
  SELECT championship_id INTO team_championship_id
  FROM teams
  WHERE id = team_id_param;
  
  -- Check if user is championship admin for this championship or system admin
  IF user_role = 'admin_sistema' OR 
     (user_role = 'admin_campeonato' AND 
      EXISTS (
        SELECT 1 FROM championships
        WHERE id = team_championship_id
        AND admin_id = auth.uid()
      )) THEN
    
    -- Assign the captain
    UPDATE teams
    SET captain_id = new_captain_id,
        created_at = created_at  -- Keep original timestamp
    WHERE id = team_id_param;
    
  ELSE
    RAISE EXCEPTION 'Only championship admins can assign team captains';
  END IF;
END;
$$;

-- Drop existing teams policies
DROP POLICY IF EXISTS "Championship admins can create teams for their championships" ON teams;
DROP POLICY IF EXISTS "Anyone can view teams in active championships" ON teams;
DROP POLICY IF EXISTS "Championship admins or owners can update teams" ON teams;
DROP POLICY IF EXISTS "Championship admins can delete teams" ON teams;
DROP POLICY IF EXISTS "Users can view teams in active championships" ON teams;
DROP POLICY IF EXISTS "Team owners can update their teams" ON teams;
DROP POLICY IF EXISTS "Team owners can delete their teams" ON teams;
DROP POLICY IF EXISTS "Authenticated users can view teams in active championships" ON teams;
DROP POLICY IF EXISTS "Championship admins or captains can update teams" ON teams;

-- Recreate policies with support for unassigned teams

-- SELECT: Anyone authenticated can view teams in active championships
CREATE POLICY "Authenticated users can view teams in active championships"
ON teams FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM championships c
    WHERE c.id = teams.championship_id
    AND c.status = 'active'
  )
);

-- INSERT: Championship admins can create teams (with or without captain)
CREATE POLICY "Championship admins can create teams"
ON teams FOR INSERT
TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_sistema', 'admin_campeonato')
  AND EXISTS (
    SELECT 1 FROM championships c
    WHERE c.id = championship_id
    AND c.admin_id = auth.uid()
  )
);

-- UPDATE: Championship admins or team captains can update teams
CREATE POLICY "Championship admins or captains can update teams"
ON teams FOR UPDATE
TO authenticated
USING (
  -- User is the captain
  (captain_id IS NOT NULL AND auth.uid() = captain_id)
  OR
  -- User is championship admin for this team's championship
  ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_sistema', 'admin_campeonato')
   AND EXISTS (
     SELECT 1 FROM championships c
     WHERE c.id = teams.championship_id
     AND c.admin_id = auth.uid()
   ))
)
WITH CHECK (
  -- User is the captain
  (captain_id IS NOT NULL AND auth.uid() = captain_id)
  OR
  -- User is championship admin for this team's championship
  ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_sistema', 'admin_campeonato')
   AND EXISTS (
     SELECT 1 FROM championships c
     WHERE c.id = teams.championship_id
     AND c.admin_id = auth.uid()
   ))
);

-- DELETE: Championship admins can delete teams
CREATE POLICY "Championship admins can delete teams"
ON teams FOR DELETE
TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin_sistema', 'admin_campeonato')
  AND EXISTS (
    SELECT 1 FROM championships c
    WHERE c.id = teams.championship_id
    AND c.admin_id = auth.uid()
  )
);