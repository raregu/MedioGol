/*
  # Ligas: agrupar campeonatos (series) y tabla general

  1. Tablas nuevas
    - `leagues`: una liga que agrupa varias series (cada serie es un campeonato).
    - `league_phases`: ruedas/fases de la liga por rango de fechas (round_from..round_to).
      La tabla general se puede ver por rueda o acumulada.
    - `league_adjustments`: ajustes manuales a la tabla general (castigos, correcciones).

  2. Cambios en `championships`
    - `league_id` (nullable): liga a la que pertenece la serie.
    - `series_name`: nombre corto de la serie dentro de la liga (ej. "Súper Sénior").
    - `display_order`: orden de la serie en la liga.

  3. Seguridad (RLS)
    - Lectura pública (anon y authenticated), igual que championships.
    - Escritura: admin_sistema, o admin_campeonato que sea admin de la liga.
    - Un campeonato solo puede asociarse a una liga que administra el mismo usuario
      (o cualquier liga si es admin_sistema): validado por trigger.
*/

CREATE TABLE IF NOT EXISTS leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  season text,
  description text,
  location text,
  logo_url text,
  facebook_page_url text,
  website_url text,
  admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'finished')),
  points_win integer NOT NULL DEFAULT 3,
  points_draw integer NOT NULL DEFAULT 1,
  points_loss integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS league_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name text NOT NULL,
  round_from integer NOT NULL,
  round_to integer NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (round_from <= round_to)
);

CREATE TABLE IF NOT EXISTS league_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES league_phases(id) ON DELETE CASCADE,
  base_team_id uuid NOT NULL REFERENCES base_teams(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  goal_difference integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  applied_on date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE championships ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES leagues(id) ON DELETE SET NULL;
ALTER TABLE championships ADD COLUMN IF NOT EXISTS series_name text;
ALTER TABLE championships ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_championships_league_id ON championships(league_id);
CREATE INDEX IF NOT EXISTS idx_league_phases_league_id ON league_phases(league_id);
CREATE INDEX IF NOT EXISTS idx_league_adjustments_league_id ON league_adjustments(league_id);

-- ¿Puede el usuario actual administrar la liga?
CREATE OR REPLACE FUNCTION can_manage_league(p_league_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'admin_sistema'
        OR (
          p.role = 'admin_campeonato'
          AND EXISTS (SELECT 1 FROM leagues l WHERE l.id = p_league_id AND l.admin_id = auth.uid())
        )
      )
  );
$$;

ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_adjustments ENABLE ROW LEVEL SECURITY;

-- leagues
CREATE POLICY "Anyone can view leagues"
  ON leagues FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins can create leagues"
  ON leagues FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin_sistema')
    OR (
      admin_id = auth.uid()
      AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin_campeonato')
    )
  );

CREATE POLICY "League admins can update leagues"
  ON leagues FOR UPDATE TO authenticated
  USING (can_manage_league(id))
  WITH CHECK (can_manage_league(id));

CREATE POLICY "League admins can delete leagues"
  ON leagues FOR DELETE TO authenticated
  USING (can_manage_league(id));

-- league_phases
CREATE POLICY "Anyone can view league phases"
  ON league_phases FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "League admins can insert phases"
  ON league_phases FOR INSERT TO authenticated WITH CHECK (can_manage_league(league_id));

CREATE POLICY "League admins can update phases"
  ON league_phases FOR UPDATE TO authenticated
  USING (can_manage_league(league_id)) WITH CHECK (can_manage_league(league_id));

CREATE POLICY "League admins can delete phases"
  ON league_phases FOR DELETE TO authenticated USING (can_manage_league(league_id));

-- league_adjustments
CREATE POLICY "Anyone can view league adjustments"
  ON league_adjustments FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "League admins can insert adjustments"
  ON league_adjustments FOR INSERT TO authenticated WITH CHECK (can_manage_league(league_id));

CREATE POLICY "League admins can update adjustments"
  ON league_adjustments FOR UPDATE TO authenticated
  USING (can_manage_league(league_id)) WITH CHECK (can_manage_league(league_id));

CREATE POLICY "League admins can delete adjustments"
  ON league_adjustments FOR DELETE TO authenticated USING (can_manage_league(league_id));

-- Un campeonato solo puede asociarse a una liga que el usuario administra
CREATE OR REPLACE FUNCTION check_championship_league()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.league_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.league_id IS DISTINCT FROM OLD.league_id)
     AND auth.uid() IS NOT NULL
     AND NOT can_manage_league(NEW.league_id) THEN
    RAISE EXCEPTION 'No tienes permiso para agregar campeonatos a esta liga';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_championship_league ON championships;
CREATE TRIGGER trg_check_championship_league
  BEFORE INSERT OR UPDATE OF league_id ON championships
  FOR EACH ROW EXECUTE FUNCTION check_championship_league();
