/*
  # Fix Shift Manager Assignment Insert Policy

  1. Changes
    - Simplify INSERT policy for shift_manager_assignments
    - Remove redundant role checks that cause issues
    - Focus on verifying championship ownership or system admin status
    
  2. Security
    - System admins can assign anyone
    - Championship admins can assign to their own championships
*/

-- Drop existing insert policy
DROP POLICY IF EXISTS "Admins can assign shift managers" ON shift_manager_assignments;

-- Create simpler, more permissive insert policy
CREATE POLICY "Admins can assign shift managers"
  ON shift_manager_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- System admin can assign to any championship
    (auth.jwt() ->> 'role') = 'admin_sistema'
    OR
    -- Championship admin can assign to their own championship
    (
      (auth.jwt() ->> 'role') = 'admin_campeonato'
      AND
      EXISTS (
        SELECT 1 FROM championships
        WHERE championships.id = championship_id
        AND championships.admin_id = auth.uid()
      )
    )
  );
