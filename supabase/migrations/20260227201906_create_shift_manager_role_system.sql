/*
  # Create Shift Manager Role System

  1. Changes
    - Add 'encargado_turno' role to profiles table check constraint
    - Create shift_manager_assignments table to assign shift managers to championships
    - Add RLS policies for shift managers to manage match events
    - Update match_events policies to allow shift managers to create/update events

  2. New Tables
    - `shift_manager_assignments`
      - `id` (uuid, primary key)
      - `championship_id` (uuid, references championships)
      - `user_id` (uuid, references auth.users)
      - `assigned_by` (uuid, references auth.users)
      - `assigned_at` (timestamptz)
      - `is_active` (boolean)

  3. Security
    - Enable RLS on shift_manager_assignments
    - Only admins can assign shift managers
    - Shift managers can view their assignments
    - Shift managers can create/update match events for their assigned championships
*/

-- Add encargado_turno role to profiles table
DO $$
BEGIN
  -- Drop the existing constraint
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  
  -- Add new constraint with encargado_turno role
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('usuario', 'capitan', 'admin_campeonato', 'admin_sistema', 'encargado_turno'));
END $$;

-- Create shift_manager_assignments table
CREATE TABLE IF NOT EXISTS shift_manager_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(championship_id, user_id)
);

-- Enable RLS
ALTER TABLE shift_manager_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shift_manager_assignments

-- Admins can view all assignments
CREATE POLICY "Admins can view shift manager assignments"
  ON shift_manager_assignments
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'admin_sistema'
    OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = shift_manager_assignments.championship_id
      AND championships.admin_id = auth.uid()
      AND (auth.jwt() ->> 'role') = 'admin_campeonato'
    )
  );

-- Shift managers can view their own assignments
CREATE POLICY "Shift managers can view their assignments"
  ON shift_manager_assignments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can insert shift manager assignments
CREATE POLICY "Admins can assign shift managers"
  ON shift_manager_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin_sistema'
    OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = shift_manager_assignments.championship_id
      AND championships.admin_id = auth.uid()
      AND (auth.jwt() ->> 'role') = 'admin_campeonato'
    )
  );

-- Admins can update shift manager assignments
CREATE POLICY "Admins can update shift manager assignments"
  ON shift_manager_assignments
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'admin_sistema'
    OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = shift_manager_assignments.championship_id
      AND championships.admin_id = auth.uid()
      AND (auth.jwt() ->> 'role') = 'admin_campeonato'
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin_sistema'
    OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = shift_manager_assignments.championship_id
      AND championships.admin_id = auth.uid()
      AND (auth.jwt() ->> 'role') = 'admin_campeonato'
    )
  );

-- Admins can delete shift manager assignments
CREATE POLICY "Admins can delete shift manager assignments"
  ON shift_manager_assignments
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'admin_sistema'
    OR
    EXISTS (
      SELECT 1 FROM championships
      WHERE championships.id = shift_manager_assignments.championship_id
      AND championships.admin_id = auth.uid()
      AND (auth.jwt() ->> 'role') = 'admin_campeonato'
    )
  );

-- Update match_events policies to allow shift managers

-- Drop existing policies
DROP POLICY IF EXISTS "Championship admins can insert match events" ON match_events;
DROP POLICY IF EXISTS "Championship admins can update match events" ON match_events;
DROP POLICY IF EXISTS "Championship admins can delete match events" ON match_events;

-- Create new policies that include shift managers

-- Insert policy
CREATE POLICY "Admins and shift managers can insert match events"
  ON match_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin_sistema'
    OR
    EXISTS (
      SELECT 1 
      FROM matches m
      JOIN championships c ON c.id = m.championship_id
      WHERE m.id = match_events.match_id
      AND c.admin_id = auth.uid()
      AND (auth.jwt() ->> 'role') = 'admin_campeonato'
    )
    OR
    EXISTS (
      SELECT 1
      FROM matches m
      JOIN shift_manager_assignments sma ON sma.championship_id = m.championship_id
      WHERE m.id = match_events.match_id
      AND sma.user_id = auth.uid()
      AND sma.is_active = true
      AND (auth.jwt() ->> 'role') = 'encargado_turno'
    )
  );

-- Update policy
CREATE POLICY "Admins and shift managers can update match events"
  ON match_events
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'admin_sistema'
    OR
    EXISTS (
      SELECT 1 
      FROM matches m
      JOIN championships c ON c.id = m.championship_id
      WHERE m.id = match_events.match_id
      AND c.admin_id = auth.uid()
      AND (auth.jwt() ->> 'role') = 'admin_campeonato'
    )
    OR
    EXISTS (
      SELECT 1
      FROM matches m
      JOIN shift_manager_assignments sma ON sma.championship_id = m.championship_id
      WHERE m.id = match_events.match_id
      AND sma.user_id = auth.uid()
      AND sma.is_active = true
      AND (auth.jwt() ->> 'role') = 'encargado_turno'
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin_sistema'
    OR
    EXISTS (
      SELECT 1 
      FROM matches m
      JOIN championships c ON c.id = m.championship_id
      WHERE m.id = match_events.match_id
      AND c.admin_id = auth.uid()
      AND (auth.jwt() ->> 'role') = 'admin_campeonato'
    )
    OR
    EXISTS (
      SELECT 1
      FROM matches m
      JOIN shift_manager_assignments sma ON sma.championship_id = m.championship_id
      WHERE m.id = match_events.match_id
      AND sma.user_id = auth.uid()
      AND sma.is_active = true
      AND (auth.jwt() ->> 'role') = 'encargado_turno'
    )
  );

-- Delete policy
CREATE POLICY "Admins and shift managers can delete match events"
  ON match_events
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'admin_sistema'
    OR
    EXISTS (
      SELECT 1 
      FROM matches m
      JOIN championships c ON c.id = m.championship_id
      WHERE m.id = match_events.match_id
      AND c.admin_id = auth.uid()
      AND (auth.jwt() ->> 'role') = 'admin_campeonato'
    )
    OR
    EXISTS (
      SELECT 1
      FROM matches m
      JOIN shift_manager_assignments sma ON sma.championship_id = m.championship_id
      WHERE m.id = match_events.match_id
      AND sma.user_id = auth.uid()
      AND sma.is_active = true
      AND (auth.jwt() ->> 'role') = 'encargado_turno'
    )
  );

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_shift_manager_assignments_championship 
  ON shift_manager_assignments(championship_id, is_active);

CREATE INDEX IF NOT EXISTS idx_shift_manager_assignments_user 
  ON shift_manager_assignments(user_id, is_active);
