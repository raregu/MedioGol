/*
  # Sistema de Playoffs para Campeonatos

  1. Nuevas Tablas
    - `playoff_config`
      - `id` (uuid, primary key)
      - `championship_id` (uuid, foreign key)
      - `teams_qualify` (integer) - Número de equipos que clasifican (4, 6, 8, etc.)
      - `format` (text) - Formato: 'single_elimination' (eliminación directa) o 'home_away' (ida y vuelta)
      - `include_third_place_match` (boolean) - Si incluye partido por el tercer lugar
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `playoff_matches`
      - `id` (uuid, primary key)
      - `championship_id` (uuid, foreign key)
      - `round` (text) - Ronda: 'round_of_16', 'quarterfinals', 'semifinals', 'final', 'third_place'
      - `match_number` (integer) - Número del partido en esa ronda
      - `leg` (text) - Para ida y vuelta: 'first_leg' o 'second_leg', null para eliminación directa
      - `team1_id` (uuid, foreign key) - Equipo 1 (local en ida)
      - `team2_id` (uuid, foreign key) - Equipo 2 (visita en ida)
      - `team1_score` (integer) - Goles equipo 1
      - `team2_score` (integer) - Goles equipo 2
      - `team1_aggregate_score` (integer) - Marcador agregado equipo 1
      - `team2_aggregate_score` (integer) - Marcador agregado equipo 2
      - `winner_id` (uuid, foreign key) - Ganador de la llave
      - `match_date` (timestamp)
      - `status` (text) - 'scheduled', 'in_progress', 'finished'
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Cambios en Tablas Existentes
    - `championships`
      - Agregar `phase` (text) - 'regular', 'playoffs', 'finished'
      - Agregar `champion_team_id` (uuid) - ID del equipo campeón
      - Agregar `runner_up_team_id` (uuid) - ID del subcampeón
      - Agregar `third_place_team_id` (uuid) - ID del tercer lugar

  3. Seguridad
    - RLS habilitado en todas las tablas nuevas
    - Políticas para lectura pública
    - Políticas para admins del campeonato crear/editar playoffs
*/

-- Agregar nuevas columnas a championships
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'championships' AND column_name = 'phase'
  ) THEN
    ALTER TABLE championships ADD COLUMN phase text DEFAULT 'regular' CHECK (phase IN ('regular', 'playoffs', 'finished'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'championships' AND column_name = 'champion_team_id'
  ) THEN
    ALTER TABLE championships ADD COLUMN champion_team_id uuid REFERENCES base_teams(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'championships' AND column_name = 'runner_up_team_id'
  ) THEN
    ALTER TABLE championships ADD COLUMN runner_up_team_id uuid REFERENCES base_teams(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'championships' AND column_name = 'third_place_team_id'
  ) THEN
    ALTER TABLE championships ADD COLUMN third_place_team_id uuid REFERENCES base_teams(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Crear tabla playoff_config
CREATE TABLE IF NOT EXISTS playoff_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  teams_qualify integer NOT NULL CHECK (teams_qualify >= 2 AND teams_qualify <= 32),
  format text NOT NULL CHECK (format IN ('single_elimination', 'home_away')),
  include_third_place_match boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(championship_id)
);

-- Crear tabla playoff_matches
CREATE TABLE IF NOT EXISTS playoff_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  round text NOT NULL CHECK (round IN ('round_of_32', 'round_of_16', 'quarterfinals', 'semifinals', 'final', 'third_place')),
  match_number integer NOT NULL,
  leg text CHECK (leg IN ('first_leg', 'second_leg') OR leg IS NULL),
  team1_id uuid REFERENCES base_teams(id) ON DELETE SET NULL,
  team2_id uuid REFERENCES base_teams(id) ON DELETE SET NULL,
  team1_score integer DEFAULT 0,
  team2_score integer DEFAULT 0,
  team1_aggregate_score integer DEFAULT 0,
  team2_aggregate_score integer DEFAULT 0,
  winner_id uuid REFERENCES base_teams(id) ON DELETE SET NULL,
  match_date timestamptz,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'finished')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE playoff_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE playoff_matches ENABLE ROW LEVEL SECURITY;

-- Políticas para playoff_config

-- Lectura pública
CREATE POLICY "Anyone can view playoff config"
  ON playoff_config FOR SELECT
  TO public
  USING (true);

-- Solo admins del campeonato o system_admin pueden insertar
CREATE POLICY "Championship admins can create playoff config"
  ON playoff_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('administrador_sistema', 'administrador_campeonato')
      )
    )
  );

-- Solo admins del campeonato pueden actualizar
CREATE POLICY "Championship admins can update playoff config"
  ON playoff_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('administrador_sistema', 'administrador_campeonato')
      )
    )
  );

-- Solo admins del campeonato pueden eliminar
CREATE POLICY "Championship admins can delete playoff config"
  ON playoff_config FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('administrador_sistema', 'administrador_campeonato')
      )
    )
  );

-- Políticas para playoff_matches

-- Lectura pública
CREATE POLICY "Anyone can view playoff matches"
  ON playoff_matches FOR SELECT
  TO public
  USING (true);

-- Solo admins del campeonato pueden insertar
CREATE POLICY "Championship admins can create playoff matches"
  ON playoff_matches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('administrador_sistema', 'administrador_campeonato', 'encargado_turno')
      )
    )
  );

-- Admins y encargados de turno pueden actualizar
CREATE POLICY "Championship admins can update playoff matches"
  ON playoff_matches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('administrador_sistema', 'administrador_campeonato', 'encargado_turno')
      )
    )
  );

-- Solo admins del campeonato pueden eliminar
CREATE POLICY "Championship admins can delete playoff matches"
  ON playoff_matches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM championships c
      INNER JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = championship_id
      AND (
        c.admin_id = auth.uid()
        OR p.role IN ('administrador_sistema', 'administrador_campeonato')
      )
    )
  );

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_playoff_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_playoff_config_updated_at'
  ) THEN
    CREATE TRIGGER update_playoff_config_updated_at
      BEFORE UPDATE ON playoff_config
      FOR EACH ROW
      EXECUTE FUNCTION update_playoff_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_playoff_matches_updated_at'
  ) THEN
    CREATE TRIGGER update_playoff_matches_updated_at
      BEFORE UPDATE ON playoff_matches
      FOR EACH ROW
      EXECUTE FUNCTION update_playoff_updated_at();
  END IF;
END $$;