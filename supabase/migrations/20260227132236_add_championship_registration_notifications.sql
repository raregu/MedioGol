/*
  # Add Championship Registration Notifications System

  1. New Tables
    - `championship_notifications`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles) - Usuario que recibe la notificación
      - `championship_id` (uuid, references championships) - Campeonato relacionado
      - `team_registration_id` (uuid, references team_registrations) - Registro del equipo
      - `type` (text) - Tipo de notificación ('captain_confirmation', etc.)
      - `message` (text) - Mensaje de la notificación
      - `status` (text) - Estado: 'pending', 'accepted', 'rejected'
      - `created_at` (timestamptz)
      - `responded_at` (timestamptz, nullable)

  2. Security
    - Enable RLS on `championship_notifications` table
    - Add policies for users to view their own notifications
    - Add policies for users to respond to their notifications
*/

CREATE TABLE IF NOT EXISTS championship_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) NOT NULL,
  championship_id uuid REFERENCES championships(id) NOT NULL,
  team_registration_id uuid REFERENCES team_registrations(id),
  type text NOT NULL DEFAULT 'captain_confirmation',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz
);

ALTER TABLE championship_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON championship_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON championship_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System and championship admins can insert notifications"
  ON championship_notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('system_admin', 'admin_campeonato')
  );

-- Crear función para notificar al capitán cuando se registra un equipo
CREATE OR REPLACE FUNCTION notify_captain_on_team_registration()
RETURNS TRIGGER AS $$
DECLARE
  v_championship_name text;
  v_team_name text;
BEGIN
  -- Obtener el nombre del campeonato
  SELECT name INTO v_championship_name
  FROM championships
  WHERE id = NEW.championship_id;

  -- Obtener el nombre del equipo
  SELECT name INTO v_team_name
  FROM base_teams
  WHERE id = NEW.base_team_id;

  -- Crear notificación si hay un capitán asignado
  IF NEW.captain_id IS NOT NULL THEN
    INSERT INTO championship_notifications (
      user_id,
      championship_id,
      team_registration_id,
      type,
      message,
      status
    ) VALUES (
      NEW.captain_id,
      NEW.championship_id,
      NEW.id,
      'captain_confirmation',
      'Tu equipo "' || v_team_name || '" ha sido registrado en el campeonato "' || v_championship_name || '". Por favor confirma tu participación como capitán.',
      'pending'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para notificar al capitán
DROP TRIGGER IF EXISTS trigger_notify_captain ON team_registrations;
CREATE TRIGGER trigger_notify_captain
  AFTER INSERT ON team_registrations
  FOR EACH ROW
  WHEN (NEW.status = 'pending' AND NEW.captain_id IS NOT NULL)
  EXECUTE FUNCTION notify_captain_on_team_registration();
