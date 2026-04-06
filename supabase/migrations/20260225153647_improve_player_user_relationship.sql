/*
  # Mejorar Relación Jugador-Usuario

  ## Descripción
  Fortalece la relación entre jugadores y usuarios para permitir:
  1. Usuarios puedan ver sus invitaciones a equipos
  2. Usuarios puedan aceptar/rechazar ser jugadores de un equipo
  3. Un usuario puede ser jugador en múltiples equipos
  4. Sistema de notificaciones de invitaciones

  ## Cambios
  1. Asegurar que user_id en players sea nullable (ya lo es)
  2. Crear vista para invitaciones recibidas por usuario
  3. Agregar políticas RLS para que usuarios vean sus invitaciones
  4. Función para aceptar invitación y crear jugador automáticamente

  ## Notas
  - Cuando un usuario acepta una invitación, se crea automáticamente el jugador
  - Los jugadores sin user_id son jugadores "genéricos" agregados por el capitán
  - Los jugadores con user_id están vinculados a cuentas reales
*/

-- Función para aceptar invitación y crear jugador
CREATE OR REPLACE FUNCTION accept_invitation_and_create_player(
  invitation_id_param uuid,
  player_name_param text,
  player_number_param integer DEFAULT NULL,
  player_position_param text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  invitation_record invitations%ROWTYPE;
  new_player_id uuid;
BEGIN
  -- Obtener la invitación
  SELECT * INTO invitation_record
  FROM invitations
  WHERE id = invitation_id_param
    AND invited_user_id = auth.uid()
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or already processed';
  END IF;

  -- Verificar si el usuario ya es jugador de ese equipo
  IF EXISTS (
    SELECT 1 FROM players
    WHERE team_id = invitation_record.team_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'User is already a player in this team';
  END IF;

  -- Actualizar invitación
  UPDATE invitations
  SET status = 'accepted',
      responded_at = now()
  WHERE id = invitation_id_param;

  -- Crear jugador
  INSERT INTO players (team_id, user_id, name, number, position, is_active)
  VALUES (
    invitation_record.team_id,
    auth.uid(),
    player_name_param,
    player_number_param,
    player_position_param,
    true
  )
  RETURNING id INTO new_player_id;

  RETURN json_build_object(
    'success', true,
    'player_id', new_player_id
  );
END;
$$;

-- Función para obtener invitaciones pendientes del usuario
CREATE OR REPLACE FUNCTION get_my_pending_invitations()
RETURNS TABLE (
  invitation_id uuid,
  team_id uuid,
  team_name text,
  championship_name text,
  invited_by_name text,
  message text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    i.id as invitation_id,
    t.id as team_id,
    t.name as team_name,
    c.name as championship_name,
    p.full_name as invited_by_name,
    i.message,
    i.created_at
  FROM invitations i
  JOIN teams t ON t.id = i.team_id
  JOIN championships c ON c.id = t.championship_id
  JOIN profiles p ON p.id = i.invited_by_user_id
  WHERE i.invited_user_id = auth.uid()
    AND i.status = 'pending'
  ORDER BY i.created_at DESC;
$$;

-- Vista para ver equipos donde soy jugador
CREATE OR REPLACE VIEW my_player_teams AS
SELECT 
  p.id as player_id,
  p.team_id,
  t.name as team_name,
  t.championship_id,
  c.name as championship_name,
  c.sport,
  c.status as championship_status,
  p.number,
  p.position,
  p.is_active,
  t.captain_id,
  cap.full_name as captain_name
FROM players p
JOIN teams t ON t.id = p.team_id
JOIN championships c ON c.id = t.championship_id
LEFT JOIN profiles cap ON cap.id = t.captain_id
WHERE p.user_id = auth.uid();

-- Política para que usuarios vean equipos donde son jugadores
CREATE POLICY "Users can view teams where they are players"
  ON teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.team_id = teams.id
        AND players.user_id = auth.uid()
    )
    OR teams.captain_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM championships
      JOIN profiles ON profiles.id = auth.uid()
      WHERE championships.id = teams.championship_id
        AND (profiles.role = 'admin_sistema' 
             OR (profiles.role = 'admin_campeonato' AND championships.admin_id = auth.uid()))
    )
  );

-- Política para que usuarios vean jugadores de equipos donde participan
CREATE POLICY "Users can view players from their teams"
  ON players FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = players.team_id
        AND (
          t.captain_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM players p2
            WHERE p2.team_id = t.id AND p2.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM championships c
            JOIN profiles prof ON prof.id = auth.uid()
            WHERE c.id = t.championship_id
              AND (prof.role = 'admin_sistema' 
                   OR (prof.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
          )
        )
    )
  );

-- Actualizar política de invitaciones para que usuarios vean las que recibieron
DROP POLICY IF EXISTS "Users can view invitations they sent or received" ON invitations;

CREATE POLICY "Users can view their invitations"
  ON invitations FOR SELECT
  TO authenticated
  USING (
    auth.uid() = invited_user_id 
    OR auth.uid() = invited_by_user_id
    OR EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = invitations.team_id
      AND t.captain_id = auth.uid()
    )
  );
