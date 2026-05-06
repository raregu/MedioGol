/*
  # Team Registration and Captain Management System

  ## Overview
  This migration implements a complete team registration workflow where:
  - Admins create teams and assign captains
  - Captains receive messages to confirm their role
  - Only confirmed captains can manage their team (add/remove players)
  - Admins can enable/disable teams

  ## Changes Made

  ### 1. Teams Table Updates
    - Add `is_enabled` boolean (controls if team can participate)
    - Add `captain_confirmed` boolean (tracks if captain accepted role)
    - Add `captain_confirmed_at` timestamp (when captain accepted)

  ### 2. Messages Table Updates
    - Add `message_type` enum (general, captain_invitation, team_notification)
    - Add `action_required` boolean (if message needs response)
    - Add `action_taken` boolean (if user responded)
    - Add `action_taken_at` timestamp (when user responded)
    - Add `metadata` jsonb (for storing extra data like team_id, action type)

  ### 3. New Policies
    - Captains can only manage teams after confirmation
    - Admins can enable/disable teams
    - Players table policies for captain management
    - Message policies for captain invitations

  ## Security
  - RLS enabled on all tables
  - Captains must be confirmed before managing teams
  - Only admins can create teams and assign captains
  - Only captains can add players to their confirmed teams
*/

-- Add new columns to teams table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'is_enabled'
  ) THEN
    ALTER TABLE teams ADD COLUMN is_enabled boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'captain_confirmed'
  ) THEN
    ALTER TABLE teams ADD COLUMN captain_confirmed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'captain_confirmed_at'
  ) THEN
    ALTER TABLE teams ADD COLUMN captain_confirmed_at timestamptz;
  END IF;
END $$;

-- Create message type enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE message_type AS ENUM ('general', 'captain_invitation', 'team_notification');
  END IF;
END $$;

-- Add new columns to messages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'message_type'
  ) THEN
    ALTER TABLE messages ADD COLUMN message_type message_type DEFAULT 'general';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'action_required'
  ) THEN
    ALTER TABLE messages ADD COLUMN action_required boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'action_taken'
  ) THEN
    ALTER TABLE messages ADD COLUMN action_taken boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'action_taken_at'
  ) THEN
    ALTER TABLE messages ADD COLUMN action_taken_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE messages ADD COLUMN metadata jsonb;
  END IF;
END $$;

-- Update existing team policies to include captain confirmation check
DROP POLICY IF EXISTS "Championship admins and captains can update their teams" ON teams;

CREATE POLICY "Admins and confirmed captains can update teams"
  ON teams
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN championships c ON c.id = teams.championship_id
      WHERE p.id = auth.uid()
      AND (
        p.role = 'admin_sistema'
        OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid())
        OR (teams.captain_id = auth.uid() AND teams.captain_confirmed = true)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN championships c ON c.id = teams.championship_id
      WHERE p.id = auth.uid()
      AND (
        p.role = 'admin_sistema'
        OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid())
        OR (teams.captain_id = auth.uid() AND teams.captain_confirmed = true)
      )
    )
  );

-- Update players policies to allow confirmed captains to manage players
DROP POLICY IF EXISTS "Championship admins can insert players" ON players;
DROP POLICY IF EXISTS "Championship admins can update players" ON players;
DROP POLICY IF EXISTS "Championship admins can delete players" ON players;

CREATE POLICY "Admins and confirmed captains can insert players"
  ON players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN teams t ON t.id = players.team_id
      LEFT JOIN championships c ON c.id = t.championship_id
      WHERE p.id = auth.uid()
      AND (
        p.role = 'admin_sistema'
        OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid())
        OR (t.captain_id = auth.uid() AND t.captain_confirmed = true)
      )
    )
  );

CREATE POLICY "Admins and confirmed captains can update players"
  ON players
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN teams t ON t.id = players.team_id
      LEFT JOIN championships c ON c.id = t.championship_id
      WHERE p.id = auth.uid()
      AND (
        p.role = 'admin_sistema'
        OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid())
        OR (t.captain_id = auth.uid() AND t.captain_confirmed = true)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN teams t ON t.id = players.team_id
      LEFT JOIN championships c ON c.id = t.championship_id
      WHERE p.id = auth.uid()
      AND (
        p.role = 'admin_sistema'
        OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid())
        OR (t.captain_id = auth.uid() AND t.captain_confirmed = true)
      )
    )
  );

CREATE POLICY "Admins and confirmed captains can delete players"
  ON players
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      LEFT JOIN teams t ON t.id = players.team_id
      LEFT JOIN championships c ON c.id = t.championship_id
      WHERE p.id = auth.uid()
      AND (
        p.role = 'admin_sistema'
        OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid())
        OR (t.captain_id = auth.uid() AND t.captain_confirmed = true)
      )
    )
  );

-- Function to send captain invitation message when captain is assigned
CREATE OR REPLACE FUNCTION send_captain_invitation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only send invitation if captain_id is being set and not confirmed yet
  IF NEW.captain_id IS NOT NULL AND (OLD.captain_id IS NULL OR OLD.captain_id != NEW.captain_id) AND NEW.captain_confirmed = false THEN
    INSERT INTO messages (
      from_user_id,
      to_user_id,
      team_id,
      subject,
      content,
      message_type,
      action_required,
      metadata
    ) VALUES (
      auth.uid(), -- admin who assigned captain
      NEW.captain_id,
      NEW.id,
      'Invitación como Capitán de Equipo',
      'Has sido designado como capitán del equipo "' || NEW.name || '". Por favor confirma tu participación para poder gestionar el equipo.',
      'captain_invitation',
      true,
      jsonb_build_object('team_id', NEW.id, 'action', 'confirm_captain')
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for captain invitation
DROP TRIGGER IF EXISTS send_captain_invitation_trigger ON teams;
CREATE TRIGGER send_captain_invitation_trigger
  AFTER INSERT OR UPDATE OF captain_id ON teams
  FOR EACH ROW
  EXECUTE FUNCTION send_captain_invitation();

-- Function to confirm captain role
CREATE OR REPLACE FUNCTION confirm_captain_role(p_team_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_team teams;
  v_result jsonb;
BEGIN
  -- Get team and verify user is the captain
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Equipo no encontrado');
  END IF;
  
  IF v_team.captain_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'message', 'No eres el capitán de este equipo');
  END IF;
  
  IF v_team.captain_confirmed THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ya confirmaste tu rol de capitán');
  END IF;
  
  -- Update team
  UPDATE teams
  SET 
    captain_confirmed = true,
    captain_confirmed_at = now()
  WHERE id = p_team_id;
  
  -- Mark message action as taken
  UPDATE messages
  SET 
    action_taken = true,
    action_taken_at = now(),
    is_read = true
  WHERE 
    to_user_id = auth.uid()
    AND team_id = p_team_id
    AND message_type = 'captain_invitation'
    AND action_required = true
    AND action_taken = false;
  
  RETURN jsonb_build_object('success', true, 'message', 'Rol de capitán confirmado exitosamente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject captain role
CREATE OR REPLACE FUNCTION reject_captain_role(p_team_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_team teams;
BEGIN
  -- Get team and verify user is the captain
  SELECT * INTO v_team FROM teams WHERE id = p_team_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Equipo no encontrado');
  END IF;
  
  IF v_team.captain_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'message', 'No eres el capitán de este equipo');
  END IF;
  
  -- Remove captain assignment
  UPDATE teams
  SET 
    captain_id = NULL,
    captain_confirmed = false,
    captain_confirmed_at = NULL
  WHERE id = p_team_id;
  
  -- Mark message action as taken
  UPDATE messages
  SET 
    action_taken = true,
    action_taken_at = now(),
    is_read = true
  WHERE 
    to_user_id = auth.uid()
    AND team_id = p_team_id
    AND message_type = 'captain_invitation'
    AND action_required = true
    AND action_taken = false;
  
  -- Send notification to admin
  INSERT INTO messages (
    from_user_id,
    to_user_id,
    team_id,
    subject,
    content,
    message_type
  )
  SELECT
    auth.uid(),
    c.admin_id,
    p_team_id,
    'Capitán Rechazó Invitación',
    'El usuario ha rechazado la invitación para ser capitán del equipo "' || v_team.name || '".' ||
    CASE WHEN p_reason IS NOT NULL THEN ' Motivo: ' || p_reason ELSE '' END,
    'team_notification'
  FROM championships c
  WHERE c.id = v_team.championship_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Invitación rechazada');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION confirm_captain_role TO authenticated;
GRANT EXECUTE ON FUNCTION reject_captain_role TO authenticated;
