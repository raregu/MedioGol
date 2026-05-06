/*
  # Cleanup Duplicate Match Events Policies

  1. Changes
    - Remove old duplicate policies from previous migrations
    - Keep only the simplified policies that allow encargado_turno role
  
  2. Security
    - Maintains proper access control for all admin types and shift managers
*/

-- Drop the old more complex policies that came from a previous migration
DROP POLICY IF EXISTS "Admins and shift managers can insert match events" ON match_events;
DROP POLICY IF EXISTS "Admins and shift managers can update match events" ON match_events;
DROP POLICY IF EXISTS "Admins and shift managers can delete match events" ON match_events;
