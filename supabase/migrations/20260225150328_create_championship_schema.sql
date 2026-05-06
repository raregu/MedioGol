/*
  # Schema para Gestión de Campeonatos Deportivos

  ## Descripción General
  Sistema completo para gestionar campeonatos deportivos multi-deporte con roles,
  equipos, partidos, estadísticas, desafíos y mensajería.

  ## Nuevas Tablas

  ### 1. profiles
  - Extensión de auth.users con datos de perfil
  - `id` (uuid, FK a auth.users)
  - `role` (text) - 'admin_sistema' | 'admin_campeonato' | 'usuario'
  - `full_name` (text)
  - `avatar_url` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. championships
  - Campeonatos deportivos
  - `id` (uuid, PK)
  - `name` (text)
  - `sport` (text) - 'futbol', 'basketball', etc.
  - `venue` (text) - Recinto/lugar
  - `description` (text)
  - `status` (text) - 'draft', 'active', 'finished'
  - `admin_id` (uuid, FK a profiles) - Administrador del campeonato
  - `start_date` (date)
  - `end_date` (date)
  - `created_at` (timestamptz)

  ### 3. teams
  - Equipos de un campeonato
  - `id` (uuid, PK)
  - `championship_id` (uuid, FK a championships)
  - `name` (text)
  - `logo_url` (text)
  - `captain_id` (uuid, FK a profiles)
  - `stamina` (integer) - Nivel de energía/forma
  - `comments` (text)
  - `created_at` (timestamptz)

  ### 4. players
  - Jugadores en equipos
  - `id` (uuid, PK)
  - `team_id` (uuid, FK a teams)
  - `user_id` (uuid, FK a profiles, nullable)
  - `name` (text)
  - `number` (integer)
  - `position` (text)
  - `is_active` (boolean)
  - `created_at` (timestamptz)

  ### 5. matches
  - Partidos del campeonato
  - `id` (uuid, PK)
  - `championship_id` (uuid, FK a championships)
  - `home_team_id` (uuid, FK a teams)
  - `away_team_id` (uuid, FK a teams)
  - `match_date` (timestamptz)
  - `round` (integer) - Número de fecha
  - `home_score` (integer)
  - `away_score` (integer)
  - `status` (text) - 'scheduled', 'playing', 'finished', 'cancelled'
  - `venue` (text)
  - `created_at` (timestamptz)

  ### 6. match_stats
  - Estadísticas por partido y jugador
  - `id` (uuid, PK)
  - `match_id` (uuid, FK a matches)
  - `player_id` (uuid, FK a players)
  - `team_id` (uuid, FK a teams)
  - `goals` (integer)
  - `yellow_cards` (integer)
  - `red_cards` (integer)
  - `assists` (integer)
  - `created_at` (timestamptz)

  ### 7. sanctions
  - Sanciones y castigos
  - `id` (uuid, PK)
  - `championship_id` (uuid, FK a championships)
  - `player_id` (uuid, FK a players)
  - `match_id` (uuid, FK a matches, nullable)
  - `type` (text) - 'suspension', 'warning', 'fine'
  - `reason` (text)
  - `rounds_suspended` (integer)
  - `start_date` (date)
  - `end_date` (date)
  - `created_at` (timestamptz)

  ### 8. challenges
  - Desafíos entre equipos
  - `id` (uuid, PK)
  - `championship_id` (uuid, FK a championships)
  - `challenger_team_id` (uuid, FK a teams)
  - `challenged_team_id` (uuid, FK a teams)
  - `message` (text)
  - `status` (text) - 'pending', 'accepted', 'rejected'
  - `proposed_date` (timestamptz)
  - `created_at` (timestamptz)
  - `responded_at` (timestamptz)

  ### 9. messages
  - Mensajería entre capitanes
  - `id` (uuid, PK)
  - `from_user_id` (uuid, FK a profiles)
  - `to_user_id` (uuid, FK a profiles)
  - `team_id` (uuid, FK a teams, nullable)
  - `subject` (text)
  - `content` (text)
  - `is_read` (boolean)
  - `created_at` (timestamptz)

  ### 10. invitations
  - Invitaciones a jugadores
  - `id` (uuid, PK)
  - `team_id` (uuid, FK a teams)
  - `invited_user_id` (uuid, FK a profiles)
  - `invited_by_user_id` (uuid, FK a profiles)
  - `message` (text)
  - `status` (text) - 'pending', 'accepted', 'rejected'
  - `created_at` (timestamptz)
  - `responded_at` (timestamptz)

  ## Seguridad (RLS)
  - Todas las tablas tienen RLS habilitado
  - Políticas específicas según rol de usuario
  - Admin sistema: acceso total
  - Admin campeonato: solo su campeonato
  - Usuario: lectura pública, escritura solo su contenido
  - Capitanes: gestión de su equipo

  ## Notas Importantes
  1. Un usuario puede ser capitán de máximo un equipo por campeonato
  2. Los desafíos solo entre equipos del mismo campeonato
  3. Las estadísticas dependen del deporte
  4. Las sanciones afectan disponibilidad de jugadores
*/

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================
-- TABLA: profiles
-- ====================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'usuario' CHECK (role IN ('admin_sistema', 'admin_campeonato', 'usuario')),
  full_name text NOT NULL,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ====================
-- TABLA: championships
-- ====================
CREATE TABLE IF NOT EXISTS championships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  sport text NOT NULL DEFAULT 'futbol',
  venue text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'finished')),
  admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE championships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Championships are viewable by everyone"
  ON championships FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System admins can insert championships"
  ON championships FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

CREATE POLICY "System admins and championship admins can update their championships"
  ON championships FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'admin_sistema' OR (profiles.role = 'admin_campeonato' AND championships.admin_id = auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'admin_sistema' OR (profiles.role = 'admin_campeonato' AND championships.admin_id = auth.uid()))
    )
  );

CREATE POLICY "System admins can delete championships"
  ON championships FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin_sistema'
    )
  );

-- ====================
-- TABLA: teams
-- ====================
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  name text NOT NULL,
  logo_url text,
  captain_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  stamina integer DEFAULT 100 CHECK (stamina >= 0 AND stamina <= 100),
  comments text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(championship_id, name)
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teams are viewable by everyone"
  ON teams FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Championship admins can insert teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = teams.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

CREATE POLICY "Championship admins and captains can update their teams"
  ON teams FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = teams.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()) OR teams.captain_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = teams.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()) OR teams.captain_id = auth.uid())
    )
  );

CREATE POLICY "Championship admins can delete teams"
  ON teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = teams.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

-- ====================
-- TABLA: players
-- ====================
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  number integer,
  position text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players are viewable by everyone"
  ON players FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Championship admins and captains can insert players"
  ON players FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      JOIN championships c ON c.id = t.championship_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = players.team_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()) OR t.captain_id = auth.uid())
    )
  );

CREATE POLICY "Championship admins and captains can update players"
  ON players FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      JOIN championships c ON c.id = t.championship_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = players.team_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()) OR t.captain_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      JOIN championships c ON c.id = t.championship_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = players.team_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()) OR t.captain_id = auth.uid())
    )
  );

CREATE POLICY "Championship admins and captains can delete players"
  ON players FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      JOIN championships c ON c.id = t.championship_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE t.id = players.team_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()) OR t.captain_id = auth.uid())
    )
  );

-- ====================
-- TABLA: matches
-- ====================
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  home_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  match_date timestamptz NOT NULL,
  round integer NOT NULL DEFAULT 1,
  home_score integer DEFAULT 0,
  away_score integer DEFAULT 0,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'playing', 'finished', 'cancelled')),
  venue text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Matches are viewable by everyone"
  ON matches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Championship admins can insert matches"
  ON matches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = matches.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

CREATE POLICY "Championship admins can update matches"
  ON matches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = matches.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = matches.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

CREATE POLICY "Championship admins can delete matches"
  ON matches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = matches.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

-- ====================
-- TABLA: match_stats
-- ====================
CREATE TABLE IF NOT EXISTS match_stats (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  goals integer DEFAULT 0,
  yellow_cards integer DEFAULT 0,
  red_cards integer DEFAULT 0,
  assists integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(match_id, player_id)
);

ALTER TABLE match_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Match stats are viewable by everyone"
  ON match_stats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Championship admins can insert match stats"
  ON match_stats FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN championships c ON c.id = m.championship_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE m.id = match_stats.match_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

CREATE POLICY "Championship admins can update match stats"
  ON match_stats FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN championships c ON c.id = m.championship_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE m.id = match_stats.match_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN championships c ON c.id = m.championship_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE m.id = match_stats.match_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

CREATE POLICY "Championship admins can delete match stats"
  ON match_stats FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN championships c ON c.id = m.championship_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE m.id = match_stats.match_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

-- ====================
-- TABLA: sanctions
-- ====================
CREATE TABLE IF NOT EXISTS sanctions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('suspension', 'warning', 'fine')),
  reason text NOT NULL,
  rounds_suspended integer DEFAULT 0,
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sanctions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sanctions are viewable by everyone"
  ON sanctions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Championship admins can insert sanctions"
  ON sanctions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = sanctions.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

CREATE POLICY "Championship admins can update sanctions"
  ON sanctions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = sanctions.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = sanctions.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

CREATE POLICY "Championship admins can delete sanctions"
  ON sanctions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = sanctions.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

-- ====================
-- TABLA: challenges
-- ====================
CREATE TABLE IF NOT EXISTS challenges (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  challenger_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  challenged_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  proposed_date timestamptz,
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Challenges are viewable by involved teams"
  ON challenges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE (t.id = challenges.challenger_team_id OR t.id = challenges.challenged_team_id)
      AND t.captain_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM championships c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = challenges.championship_id
      AND (p.role = 'admin_sistema' OR (p.role = 'admin_campeonato' AND c.admin_id = auth.uid()))
    )
  );

CREATE POLICY "Captains can insert challenges"
  ON challenges FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = challenges.challenger_team_id
      AND t.captain_id = auth.uid()
    )
  );

CREATE POLICY "Captains can update challenges"
  ON challenges FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = challenges.challenged_team_id
      AND t.captain_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = challenges.challenged_team_id
      AND t.captain_id = auth.uid()
    )
  );

-- ====================
-- TABLA: messages
-- ====================
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  subject text NOT NULL,
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own messages"
  ON messages FOR SELECT
  TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can update their received messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = to_user_id);

-- ====================
-- TABLA: invitations
-- ====================
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invitations they sent or received"
  ON invitations FOR SELECT
  TO authenticated
  USING (
    auth.uid() = invited_user_id OR auth.uid() = invited_by_user_id
    OR EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = invitations.team_id
      AND t.captain_id = auth.uid()
    )
  );

CREATE POLICY "Captains can send invitations"
  ON invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams t
      WHERE t.id = invitations.team_id
      AND t.captain_id = auth.uid()
    )
  );

CREATE POLICY "Invited users can update invitations"
  ON invitations FOR UPDATE
  TO authenticated
  USING (auth.uid() = invited_user_id)
  WITH CHECK (auth.uid() = invited_user_id);

-- ====================
-- FUNCIONES Y TRIGGERS
-- ====================

-- Función para actualizar updated_at en profiles
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();