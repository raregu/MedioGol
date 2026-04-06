/*
  # Restore Role-Based Policies with System Admin Full Access

  1. Changes
    - Remove permissive testing policies
    - Restore role-based access control
    - System admins can update/delete everything
    - Championship admins can only update/delete their assigned championships

  2. Security
    - Proper role-based access control
    - System admins have full access
    - Championship admins restricted to their championships
    - All policies check JWT roles

  3. Notes
    - Uses auth.jwt() to check roles from JWT token
    - Requires users to logout/login after role changes
*/

-- ==========================================
-- CHAMPIONSHIPS POLICIES
-- ==========================================

DROP POLICY IF EXISTS "Authenticated users can update championships" ON championships;
DROP POLICY IF EXISTS "System admins and championship admins can update their champion" ON championships;

CREATE POLICY "System admins and championship admins can update championships"
  ON championships FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    ((auth.jwt() ->> 'role' = 'admin_campeonato') AND admin_id = auth.uid())
  )
  WITH CHECK (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    ((auth.jwt() ->> 'role' = 'admin_campeonato') AND admin_id = auth.uid())
  );

-- ==========================================
-- TEAMS POLICIES
-- ==========================================

DROP POLICY IF EXISTS "Authenticated users can update teams" ON teams;
DROP POLICY IF EXISTS "System admins and championship admins can update teams" ON teams;

CREATE POLICY "System admins and championship admins can update teams"
  ON teams FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = teams.championship_id
      AND championships.admin_id = auth.uid()
      AND auth.jwt() ->> 'role' = 'admin_campeonato'
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = teams.championship_id
      AND championships.admin_id = auth.uid()
      AND auth.jwt() ->> 'role' = 'admin_campeonato'
    )
  );

DROP POLICY IF EXISTS "System admins can delete teams" ON teams;

CREATE POLICY "System admins and championship admins can delete teams"
  ON teams FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = teams.championship_id
      AND championships.admin_id = auth.uid()
      AND auth.jwt() ->> 'role' = 'admin_campeonato'
    )
  );

-- ==========================================
-- MATCHES POLICIES
-- ==========================================

DROP POLICY IF EXISTS "Authenticated users can update matches" ON matches;
DROP POLICY IF EXISTS "System admins and championship admins can update matches" ON matches;

CREATE POLICY "System admins and championship admins can update matches"
  ON matches FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = matches.championship_id
      AND championships.admin_id = auth.uid()
      AND auth.jwt() ->> 'role' = 'admin_campeonato'
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = matches.championship_id
      AND championships.admin_id = auth.uid()
      AND auth.jwt() ->> 'role' = 'admin_campeonato'
    )
  );

DROP POLICY IF EXISTS "System admins can delete matches" ON matches;

CREATE POLICY "System admins and championship admins can delete matches"
  ON matches FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = matches.championship_id
      AND championships.admin_id = auth.uid()
      AND auth.jwt() ->> 'role' = 'admin_campeonato'
    )
  );

-- ==========================================
-- SANCTIONS POLICIES
-- ==========================================

DROP POLICY IF EXISTS "Authenticated users can update sanctions" ON sanctions;
DROP POLICY IF EXISTS "System admins and championship admins can update sanctions" ON sanctions;

CREATE POLICY "System admins and championship admins can update sanctions"
  ON sanctions FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = sanctions.championship_id
      AND championships.admin_id = auth.uid()
      AND auth.jwt() ->> 'role' = 'admin_campeonato'
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = sanctions.championship_id
      AND championships.admin_id = auth.uid()
      AND auth.jwt() ->> 'role' = 'admin_campeonato'
    )
  );

DROP POLICY IF EXISTS "System admins can delete sanctions" ON sanctions;

CREATE POLICY "System admins and championship admins can delete sanctions"
  ON sanctions FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = sanctions.championship_id
      AND championships.admin_id = auth.uid()
      AND auth.jwt() ->> 'role' = 'admin_campeonato'
    )
  );

-- ==========================================
-- PLAYERS POLICIES
-- ==========================================

DROP POLICY IF EXISTS "System admins and team captains can update players" ON players;

CREATE POLICY "System admins and team captains can update players"
  ON players FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = players.team_id
      AND teams.captain_id = auth.uid()
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = players.team_id
      AND teams.captain_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "System admins and team captains can delete players" ON players;

CREATE POLICY "System admins and team captains can delete players"
  ON players FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'admin_sistema') OR
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = players.team_id
      AND teams.captain_id = auth.uid()
    )
  );
