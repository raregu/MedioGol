/*
  # Fix matches delete policy to use Spanish role names

  1. Changes
    - Drop the existing English-based delete policy
    - Create new delete policy using Spanish role names:
      - `admin_sistema` instead of `system_admin`
      - `admin_campeonato` instead of `championship_admin`
    
  2. Security
    - Maintains same security level
    - Championship admins can only delete matches from their own championships
    - System admins can delete any match
*/

DROP POLICY IF EXISTS "Championship admins can delete matches from their championships" ON matches;

CREATE POLICY "Championship admins can delete matches from their championships"
  ON matches
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = matches.championship_id
        AND (
          p.role = 'admin_sistema'
          OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid())
        )
    )
  );
