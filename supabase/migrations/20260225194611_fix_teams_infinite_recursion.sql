/*
  # Fix Infinite Recursion in Teams Policies

  1. Changes
    - Drop all existing SELECT policies on teams table
    - Create a single, simple SELECT policy that allows everyone to view teams
    - This eliminates the recursion caused by the complex policy that checked players table
  
  2. Security
    - Teams remain publicly viewable (which is appropriate for a sports platform)
    - Other operations (INSERT, UPDATE, DELETE) maintain proper restrictions
*/

-- Drop all existing SELECT policies on teams
DROP POLICY IF EXISTS "Teams are viewable by everyone" ON teams;
DROP POLICY IF EXISTS "Users can view teams where they are players" ON teams;

-- Create a simple, non-recursive SELECT policy
CREATE POLICY "Everyone can view teams"
  ON teams
  FOR SELECT
  TO authenticated
  USING (true);
