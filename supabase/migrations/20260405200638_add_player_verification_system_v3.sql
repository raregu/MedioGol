-- Habilitar extensión necesaria para gen_random_bytes

/*
  # Sistema de Verificación de Identidad de Jugadores

  ## Descripción
  Implementa un sistema completo de verificación de identidad para evitar suplantación
  de jugadores y reemplazar el uso de carnet físico. Incluye credencial digital con
  foto bloqueada, validación en cancha y QR único.

  ## Cambios

  1. Campos nuevos en player_profiles
    - `rut` - RUT/DNI del jugador (identificación oficial)
    - `estado_verificacion` - Estado de verificación: pendiente, verificado, rechazado
    - `foto_bloqueada` - Boolean que indica si la foto está bloqueada
    - `fecha_ultimo_cambio_foto` - Timestamp del último cambio de foto
    - `qr_token` - Token único para generar QR de identificación
    - `fecha_primer_partido` - Timestamp del primer partido jugado (para bloqueo automático)

  2. Nueva tabla: player_validation_logs
    - Registro de todas las validaciones en cancha
    - Incluye quién validó, cuándo y resultado

  ## Seguridad
  - RLS habilitado en todas las tablas
  - Solo jugadores pueden ver su propio QR token
  - Admins y encargados de turno pueden validar jugadores
*/

-- Agregar nuevos campos a player_profiles
ALTER TABLE player_profiles
ADD COLUMN IF NOT EXISTS rut VARCHAR(20),
ADD COLUMN IF NOT EXISTS estado_verificacion VARCHAR(20) DEFAULT 'pendiente' CHECK (estado_verificacion IN ('pendiente', 'verificado', 'rechazado')),
ADD COLUMN IF NOT EXISTS foto_bloqueada BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS fecha_ultimo_cambio_foto TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS qr_token VARCHAR(100),
ADD COLUMN IF NOT EXISTS fecha_primer_partido TIMESTAMPTZ;

-- Crear índice único para qr_token (solo si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_profiles_qr_token_key'
  ) THEN
    ALTER TABLE player_profiles ADD CONSTRAINT player_profiles_qr_token_key UNIQUE (qr_token);
  END IF;
END $$;

-- Crear índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_player_qr_token ON player_profiles(qr_token);
CREATE INDEX IF NOT EXISTS idx_player_verification_status ON player_profiles(estado_verificacion);

-- Función para generar token QR único
CREATE OR REPLACE FUNCTION generate_player_qr_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.qr_token IS NULL THEN
    NEW.qr_token := 'MG-' || replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para generar QR token automáticamente
DROP TRIGGER IF EXISTS set_player_qr_token ON player_profiles;
CREATE TRIGGER set_player_qr_token
  BEFORE INSERT ON player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION generate_player_qr_token();

-- Actualizar QR tokens para jugadores existentes que no tienen
UPDATE player_profiles
SET qr_token = 'MG-' || replace(gen_random_uuid()::text, '-', '')
WHERE qr_token IS NULL;

-- Tabla para registrar validaciones en cancha
CREATE TABLE IF NOT EXISTS player_validation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  validated_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  validation_result VARCHAR(20) NOT NULL CHECK (validation_result IN ('aprobado', 'rechazado', 'sospechoso')),
  notas TEXT,
  ubicacion_lat DECIMAL(10, 8),
  ubicacion_lng DECIMAL(11, 8),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para tabla de validaciones
CREATE INDEX IF NOT EXISTS idx_validation_player ON player_validation_logs(player_id);
CREATE INDEX IF NOT EXISTS idx_validation_match ON player_validation_logs(match_id);
CREATE INDEX IF NOT EXISTS idx_validation_date ON player_validation_logs(created_at DESC);

-- RLS para player_validation_logs
ALTER TABLE player_validation_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para player_validation_logs
CREATE POLICY "Players can view own validation logs"
  ON player_validation_logs
  FOR SELECT
  TO authenticated
  USING (player_id = auth.uid());

CREATE POLICY "Admins can view all validation logs"
  ON player_validation_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('system_admin', 'admin_de_campeonato', 'encargado_turno')
    )
  );

CREATE POLICY "Staff can create validation logs"
  ON player_validation_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('system_admin', 'admin_de_campeonato', 'encargado_turno')
    )
  );

-- Función para bloquear foto después del primer partido
CREATE OR REPLACE FUNCTION block_photo_after_first_match()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.player_id IS NOT NULL THEN
    UPDATE player_profiles
    SET 
      fecha_primer_partido = COALESCE(fecha_primer_partido, now()),
      foto_bloqueada = true
    WHERE id = NEW.player_id
    AND fecha_primer_partido IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para bloquear foto automáticamente
DROP TRIGGER IF EXISTS trigger_block_photo_first_match ON match_events;
CREATE TRIGGER trigger_block_photo_first_match
  AFTER INSERT ON match_events
  FOR EACH ROW
  WHEN (NEW.player_id IS NOT NULL)
  EXECUTE FUNCTION block_photo_after_first_match();

-- Comentarios
COMMENT ON COLUMN player_profiles.rut IS 'RUT/DNI del jugador para identificación oficial';
COMMENT ON COLUMN player_profiles.estado_verificacion IS 'Estado de verificación: pendiente, verificado, rechazado';
COMMENT ON COLUMN player_profiles.foto_bloqueada IS 'Indica si la foto está bloqueada tras jugar el primer partido';
COMMENT ON COLUMN player_profiles.fecha_ultimo_cambio_foto IS 'Fecha del último cambio de foto';
COMMENT ON COLUMN player_profiles.qr_token IS 'Token único para generar QR de identificación';
COMMENT ON COLUMN player_profiles.fecha_primer_partido IS 'Fecha del primer partido jugado';
