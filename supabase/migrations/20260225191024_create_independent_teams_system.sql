/*
  # Sistema de equipos independientes con historial

  ## Descripción
  Reestructura el sistema para que los equipos existan independientemente de los campeonatos,
  permitiendo que un equipo participe en múltiples campeonatos y mantenga su historial completo.

  ## Cambios principales

  1. Nueva tabla: base_teams
     - Equipos independientes que existen fuera de campeonatos específicos
     - `id` (uuid, PK)
     - `name` (text) - Nombre del equipo
     - `logo_url` (text) - Logo del equipo
     - `owner_id` (uuid, FK profiles) - Creador/dueño del equipo
     - `description` (text) - Descripción del equipo
     - `founded_date` (date) - Fecha de fundación
     - `created_at` (timestamptz)

  2. Nueva tabla: team_registrations
     - Relación entre equipos base y campeonatos
     - `id` (uuid, PK)
     - `base_team_id` (uuid, FK base_teams)
     - `championship_id` (uuid, FK championships)
     - `captain_id` (uuid, FK profiles) - Capitán para este campeonato específico
     - `status` (text) - 'pending', 'confirmed', 'rejected'
     - `stamina` (integer) - Estado del equipo en este campeonato
     - `comments` (text) - Comentarios específicos del campeonato
     - `registered_at` (timestamptz)

  3. Modificación: tabla teams
     - Agregar columna `base_team_id` (nullable por compatibilidad)
     - Mantener todas las columnas existentes para retrocompatibilidad

  4. Seguridad
     - RLS habilitado en todas las tablas
     - Políticas para que los dueños gestionen sus equipos
     - Políticas para que admins gestionen inscripciones

  ## Notas
  - Los datos existentes en `teams` se mantienen intactos
  - Se puede migrar gradualmente desde el sistema antiguo al nuevo
  - La columna `base_team_id` permite vincular equipos existentes con equipos base
*/

-- 1. Crear tabla de equipos base (independientes)
CREATE TABLE IF NOT EXISTS base_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  owner_id uuid REFERENCES profiles(id) NOT NULL,
  description text DEFAULT '',
  founded_date date,
  created_at timestamptz DEFAULT now()
);

-- Índices para base_teams
CREATE INDEX IF NOT EXISTS idx_base_teams_owner ON base_teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_base_teams_name ON base_teams(name);

-- 2. Crear tabla de inscripciones de equipos a campeonatos
CREATE TABLE IF NOT EXISTS team_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_team_id uuid REFERENCES base_teams(id) ON DELETE CASCADE NOT NULL,
  championship_id uuid REFERENCES championships(id) ON DELETE CASCADE NOT NULL,
  captain_id uuid REFERENCES profiles(id),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  stamina integer DEFAULT 100,
  comments text DEFAULT '',
  registered_at timestamptz DEFAULT now(),
  UNIQUE(base_team_id, championship_id)
);

-- Índices para team_registrations
CREATE INDEX IF NOT EXISTS idx_team_registrations_base_team ON team_registrations(base_team_id);
CREATE INDEX IF NOT EXISTS idx_team_registrations_championship ON team_registrations(championship_id);
CREATE INDEX IF NOT EXISTS idx_team_registrations_captain ON team_registrations(captain_id);

-- 3. Modificar tabla teams existente para agregar referencia a base_team
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'base_team_id'
  ) THEN
    ALTER TABLE teams ADD COLUMN base_team_id uuid REFERENCES base_teams(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_teams_base_team ON teams(base_team_id);

-- 4. Habilitar RLS
ALTER TABLE base_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_registrations ENABLE ROW LEVEL SECURITY;

-- 5. Políticas para base_teams

-- Todos pueden ver equipos base
CREATE POLICY "Anyone can view base teams"
  ON base_teams
  FOR SELECT
  TO authenticated
  USING (true);

-- Solo el dueño o admins pueden crear equipos base
CREATE POLICY "Users can create their own base teams"
  ON base_teams
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    OR (auth.jwt() ->> 'role' = 'admin_sistema')
  );

-- Solo el dueño o admins pueden actualizar equipos base
CREATE POLICY "Owners and admins can update base teams"
  ON base_teams
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR (auth.jwt() ->> 'role' = 'admin_sistema')
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (auth.jwt() ->> 'role' = 'admin_sistema')
  );

-- Solo el dueño o admins pueden eliminar equipos base
CREATE POLICY "Owners and admins can delete base teams"
  ON base_teams
  FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR (auth.jwt() ->> 'role' = 'admin_sistema')
  );

-- 6. Políticas para team_registrations

-- Todos pueden ver inscripciones confirmadas
CREATE POLICY "Anyone can view confirmed team registrations"
  ON team_registrations
  FOR SELECT
  TO authenticated
  USING (
    status = 'confirmed'
    OR EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = team_registrations.base_team_id
        AND bt.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM championships c
      WHERE c.id = team_registrations.championship_id
        AND (
          (auth.jwt() ->> 'role' = 'admin_sistema')
          OR (auth.jwt() ->> 'role' = 'admin_campeonato' AND c.admin_id = auth.uid())
        )
    )
  );

-- Dueños de equipos pueden inscribir sus equipos
CREATE POLICY "Team owners can register their teams"
  ON team_registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = team_registrations.base_team_id
        AND bt.owner_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role' = 'admin_sistema')
  );

-- Admins de campeonato pueden actualizar inscripciones (aprobar/rechazar)
CREATE POLICY "Championship admins can update registrations"
  ON team_registrations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      WHERE c.id = team_registrations.championship_id
        AND (
          (auth.jwt() ->> 'role' = 'admin_sistema')
          OR (auth.jwt() ->> 'role' = 'admin_campeonato' AND c.admin_id = auth.uid())
        )
    )
    OR EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = team_registrations.base_team_id
        AND bt.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships c
      WHERE c.id = team_registrations.championship_id
        AND (
          (auth.jwt() ->> 'role' = 'admin_sistema')
          OR (auth.jwt() ->> 'role' = 'admin_campeonato' AND c.admin_id = auth.uid())
        )
    )
    OR EXISTS (
      SELECT 1 FROM base_teams bt
      WHERE bt.id = team_registrations.base_team_id
        AND bt.owner_id = auth.uid()
    )
  );

-- Solo admins pueden eliminar inscripciones
CREATE POLICY "Admins can delete team registrations"
  ON team_registrations
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'role' = 'admin_sistema')
    OR EXISTS (
      SELECT 1 FROM championships c
      WHERE c.id = team_registrations.championship_id
        AND (auth.jwt() ->> 'role' = 'admin_campeonato' AND c.admin_id = auth.uid())
    )
  );
