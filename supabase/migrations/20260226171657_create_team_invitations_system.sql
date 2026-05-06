/*
  # Create team invitations system

  1. New Tables
    - `team_invitations`
      - `id` (uuid, primary key)
      - `championship_id` (uuid, foreign key to championships)
      - `invited_by` (uuid, foreign key to profiles - admin who sent invitation)
      - `email` (text, email address of invitee)
      - `team_name` (text, suggested team name)
      - `message` (text, optional message from admin)
      - `status` (text, values: pending, accepted, expired)
      - `token` (text, unique invitation token)
      - `expires_at` (timestamptz, expiration date)
      - `created_at` (timestamptz, default now())
      - `accepted_at` (timestamptz, nullable)

  2. Security
    - Enable RLS on `team_invitations` table
    - Championship admins can create invitations for their championships
    - System admins can manage all invitations
    - Anyone with the token can view their invitation (for acceptance)

  3. Indexes
    - Index on `token` for fast lookup
    - Index on `email` for duplicate checking
    - Index on `championship_id` for filtering
*/

-- Create team_invitations table
CREATE TABLE IF NOT EXISTS team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  team_name text NOT NULL,
  message text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  token text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_championship_id ON team_invitations(championship_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);

-- Enable RLS
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Allow championship admins to view invitations for their championships
CREATE POLICY "Championship admins can view their invitations"
  ON team_invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = team_invitations.championship_id
      AND championships.admin_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Allow championship admins to create invitations
CREATE POLICY "Championship admins can create invitations"
  ON team_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM championships
        WHERE championships.id = team_invitations.championship_id
        AND championships.admin_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin_sistema'
      )
    )
  );

-- Allow championship admins to update their invitations
CREATE POLICY "Championship admins can update their invitations"
  ON team_invitations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = team_invitations.championship_id
      AND championships.admin_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = team_invitations.championship_id
      AND championships.admin_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- Allow championship admins to delete their invitations
CREATE POLICY "Championship admins can delete their invitations"
  ON team_invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = team_invitations.championship_id
      AND championships.admin_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );
