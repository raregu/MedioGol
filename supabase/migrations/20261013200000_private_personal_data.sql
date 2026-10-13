-- =====================================================================
-- Protección de datos personales (Ley 21.719)
--
-- Problema: player_profiles y profiles se pueden leer sin iniciar sesión, y
-- guardaban RUT, fecha de nacimiento, token del QR de la credencial y teléfono.
--
-- Solución:
--  * Los datos sensibles pasan a tablas privadas (player_private, profiles_private)
--    con RLS: solo el titular (y admin_sistema) puede leerlos.
--  * Triggers: si algo escribe esos campos en las tablas públicas, el valor se
--    traslada a la tabla privada y en la pública queda NULL (compatibilidad).
--  * El personal de cancha consulta a un jugador solo vía staff_find_player()
--    (verifica el rol y deja registro de cada consulta).
--  * Un jugador ya no puede auto-verificarse: estado_verificacion, foto_bloqueada y
--    fecha_primer_partido solo los cambia el personal autorizado.
--  * Se corrigen roles mal escritos en las políticas de player_validation_logs.
--
-- Idempotente. Ejecutar completo en el SQL Editor de Supabase.
-- =====================================================================

-- ---------- Funciones de rol ----------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role::text FROM profiles WHERE id = auth.uid() $$;

-- Personal que puede validar jugadores en cancha
CREATE OR REPLACE FUNCTION public.is_match_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(public.current_user_role() IN ('admin_sistema', 'admin_campeonato', 'encargado_turno'), false) $$;

CREATE OR REPLACE FUNCTION public.normalize_rut(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$ SELECT NULLIF(upper(regexp_replace(COALESCE(p, ''), '[^0-9kK]', '', 'g')), '') $$;

-- 12345678K -> 12.345.***-*  (para mostrar sin exponer el RUT completo)
CREATE OR REPLACE FUNCTION public.mask_rut(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN p IS NULL OR length(p) < 5 THEN NULL
              ELSE regexp_replace(left(p, length(p) - 4), '(\d)(?=(\d{3})+$)', '\1.', 'g') || '.***-*' END
$$;

-- ---------- Tablas privadas ----------
CREATE TABLE IF NOT EXISTS public.player_private (
  player_id uuid PRIMARY KEY REFERENCES public.player_profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  rut text,
  date_of_birth date,
  qr_token text NOT NULL UNIQUE DEFAULT ('MG-' || replace(gen_random_uuid()::text, '-', '')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_player_private_rut ON public.player_private (rut) WHERE rut IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.profiles_private (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  phone text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Registro de consultas del personal a datos de jugadores (responsabilidad proactiva)
CREATE TABLE IF NOT EXISTS public.personal_data_access_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id uuid NOT NULL,
  player_id uuid,
  via text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pdal_player ON public.personal_data_access_log (player_id, created_at DESC);

ALTER TABLE public.player_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_data_access_log ENABLE ROW LEVEL SECURITY;

-- Privilegios: nada para anon; el titular solo puede tocar sus campos editables
REVOKE ALL ON public.player_private, public.profiles_private, public.personal_data_access_log FROM anon, authenticated;
GRANT SELECT ON public.player_private, public.profiles_private TO authenticated;
GRANT INSERT (player_id, rut, date_of_birth), UPDATE (player_id, rut, date_of_birth) ON public.player_private TO authenticated;
GRANT INSERT (user_id, phone), UPDATE (user_id, phone) ON public.profiles_private TO authenticated;
GRANT SELECT ON public.personal_data_access_log TO authenticated;

DROP POLICY IF EXISTS "Titular o admin ve sus datos privados" ON public.player_private;
CREATE POLICY "Titular o admin ve sus datos privados" ON public.player_private
  FOR SELECT TO authenticated
  USING (player_id = auth.uid() OR public.current_user_role() = 'admin_sistema');
DROP POLICY IF EXISTS "Titular crea sus datos privados" ON public.player_private;
CREATE POLICY "Titular crea sus datos privados" ON public.player_private
  FOR INSERT TO authenticated WITH CHECK (player_id = auth.uid());
DROP POLICY IF EXISTS "Titular o admin edita sus datos privados" ON public.player_private;
CREATE POLICY "Titular o admin edita sus datos privados" ON public.player_private
  FOR UPDATE TO authenticated
  USING (player_id = auth.uid() OR public.current_user_role() = 'admin_sistema')
  WITH CHECK (player_id = auth.uid() OR public.current_user_role() = 'admin_sistema');

DROP POLICY IF EXISTS "Titular o admin ve su teléfono" ON public.profiles_private;
CREATE POLICY "Titular o admin ve su teléfono" ON public.profiles_private
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin_sistema');
DROP POLICY IF EXISTS "Titular crea su teléfono" ON public.profiles_private;
CREATE POLICY "Titular crea su teléfono" ON public.profiles_private
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Titular edita su teléfono" ON public.profiles_private;
CREATE POLICY "Titular edita su teléfono" ON public.profiles_private
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Jugador o admin ve quién consultó sus datos" ON public.personal_data_access_log;
CREATE POLICY "Jugador o admin ve quién consultó sus datos" ON public.personal_data_access_log
  FOR SELECT TO authenticated
  USING (player_id = auth.uid() OR public.current_user_role() = 'admin_sistema');

-- ---------- Copiar los datos existentes ----------
INSERT INTO public.player_private (player_id, rut, date_of_birth, qr_token)
SELECT pp.id, public.normalize_rut(pp.rut), pp.date_of_birth,
       COALESCE(pp.qr_token, 'MG-' || replace(gen_random_uuid()::text, '-', ''))
FROM public.player_profiles pp
ON CONFLICT (player_id) DO UPDATE
  SET rut = COALESCE(EXCLUDED.rut, player_private.rut),
      date_of_birth = COALESCE(EXCLUDED.date_of_birth, player_private.date_of_birth),
      updated_at = now();

INSERT INTO public.profiles_private (user_id, phone)
SELECT p.id, p.phone FROM public.profiles p WHERE p.phone IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET phone = EXCLUDED.phone, updated_at = now();

-- ---------- Triggers: los campos sensibles nunca quedan en las tablas públicas ----------
CREATE OR REPLACE FUNCTION public.player_profiles_move_private()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.rut IS NOT NULL OR NEW.date_of_birth IS NOT NULL THEN
    INSERT INTO player_private (player_id, rut, date_of_birth)
    VALUES (NEW.id, public.normalize_rut(NEW.rut), NEW.date_of_birth)
    ON CONFLICT (player_id) DO UPDATE
      SET rut = COALESCE(EXCLUDED.rut, player_private.rut),
          date_of_birth = COALESCE(EXCLUDED.date_of_birth, player_private.date_of_birth),
          updated_at = now();
  END IF;
  NEW.rut := NULL;
  NEW.date_of_birth := NULL;
  NEW.qr_token := NULL;
  RETURN NEW;
END;
$$;

-- "zz_" para que corra después de set_player_qr_token (los BEFORE corren por orden alfabético)
DROP TRIGGER IF EXISTS zz_player_profiles_move_private ON public.player_profiles;
CREATE TRIGGER zz_player_profiles_move_private
  BEFORE INSERT OR UPDATE ON public.player_profiles
  FOR EACH ROW EXECUTE FUNCTION public.player_profiles_move_private();

CREATE OR REPLACE FUNCTION public.profiles_move_private()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    INSERT INTO profiles_private (user_id, phone) VALUES (NEW.id, NEW.phone)
    ON CONFLICT (user_id) DO UPDATE SET phone = EXCLUDED.phone, updated_at = now();
  END IF;
  NEW.phone := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_profiles_move_private ON public.profiles;
CREATE TRIGGER zz_profiles_move_private
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_move_private();

-- ---------- Nadie se auto-verifica ----------
-- "aa_" para revisar lo que envió el usuario ANTES de que otros triggers modifiquen la fila.
-- auth.uid() NULL = service role / SQL Editor (permitido).
CREATE OR REPLACE FUNCTION public.player_profiles_protect_verification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_match_staff() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.estado_verificacion := 'pendiente';
    NEW.foto_bloqueada := false;
    NEW.fecha_primer_partido := NULL;
  ELSIF NEW.estado_verificacion IS DISTINCT FROM OLD.estado_verificacion
     OR NEW.foto_bloqueada IS DISTINCT FROM OLD.foto_bloqueada
     OR NEW.fecha_primer_partido IS DISTINCT FROM OLD.fecha_primer_partido THEN
    RAISE EXCEPTION 'Solo el personal autorizado puede cambiar la verificación del jugador'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_player_profiles_protect_verification ON public.player_profiles;
CREATE TRIGGER aa_player_profiles_protect_verification
  BEFORE INSERT OR UPDATE ON public.player_profiles
  FOR EACH ROW EXECUTE FUNCTION public.player_profiles_protect_verification();

-- El bloqueo automático de foto lo dispara quien registra un gol; debe saltarse la regla anterior
ALTER FUNCTION public.block_photo_after_first_match() SECURITY DEFINER;
ALTER FUNCTION public.block_photo_after_first_match() SET search_path = public;

-- ---------- Limpiar las columnas públicas ----------
UPDATE public.player_profiles
SET rut = NULL, date_of_birth = NULL, qr_token = NULL
WHERE rut IS NOT NULL OR date_of_birth IS NOT NULL OR qr_token IS NOT NULL;

UPDATE public.profiles SET phone = NULL WHERE phone IS NOT NULL;

-- ---------- Consulta del personal de cancha ----------
-- Por QR (token de la credencial) o por RUT exacto. Por QR el RUT se devuelve enmascarado.
CREATE OR REPLACE FUNCTION public.staff_find_player(p_qr_token text DEFAULT NULL, p_rut text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  full_name text,
  rut text,
  date_of_birth date,
  photo_url text,
  profile_photo text,
  "position" text,
  estado_verificacion text,
  foto_bloqueada boolean,
  qr_token text,
  fecha_primer_partido timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_token text := NULLIF(btrim(COALESCE(p_qr_token, '')), '');
  v_rut text := public.normalize_rut(p_rut);
  v_id uuid;
BEGIN
  IF NOT public.is_match_staff() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF v_token IS NULL AND v_rut IS NULL THEN
    RETURN;
  END IF;

  SELECT pv.player_id INTO v_id
  FROM player_private pv
  WHERE (v_token IS NOT NULL AND pv.qr_token = v_token)
     OR (v_token IS NULL AND pv.rut = v_rut)
  LIMIT 1;

  INSERT INTO personal_data_access_log (staff_id, player_id, via)
  VALUES (auth.uid(), v_id, CASE WHEN v_token IS NOT NULL THEN 'qr' ELSE 'rut' END);

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT pp.id, pp.full_name::text,
         CASE WHEN v_token IS NULL THEN pv.rut ELSE public.mask_rut(pv.rut) END,
         pv.date_of_birth, pp.photo_url::text, pp.profile_photo::text, pp.position::text,
         pp.estado_verificacion::text, pp.foto_bloqueada, v_token, pp.fecha_primer_partido
  FROM player_profiles pp
  JOIN player_private pv ON pv.player_id = pp.id
  WHERE pp.id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_find_player(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_find_player(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_match_staff() TO authenticated;

-- ---------- Cambiar el estado de verificación (solo personal) ----------
CREATE OR REPLACE FUNCTION public.staff_set_verification(p_player_id uuid, p_estado text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_match_staff() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF p_estado NOT IN ('pendiente', 'verificado', 'rechazado') THEN
    RAISE EXCEPTION 'Estado inválido: %', p_estado USING ERRCODE = '22023';
  END IF;
  UPDATE player_profiles SET estado_verificacion = p_estado WHERE id = p_player_id;
  INSERT INTO personal_data_access_log (staff_id, player_id, via)
  VALUES (auth.uid(), p_player_id, 'verificacion:' || p_estado);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_set_verification(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_verification(uuid, text) TO authenticated;

-- ---------- Corregir roles en las políticas de validación ----------
DROP POLICY IF EXISTS "Admins can view all validation logs" ON public.player_validation_logs;
CREATE POLICY "Admins can view all validation logs" ON public.player_validation_logs
  FOR SELECT TO authenticated USING (public.is_match_staff());
DROP POLICY IF EXISTS "Staff can create validation logs" ON public.player_validation_logs;
CREATE POLICY "Staff can create validation logs" ON public.player_validation_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_match_staff() AND validated_by = auth.uid());

COMMENT ON TABLE public.player_private IS 'Datos personales del jugador (RUT, nacimiento, token QR). Solo titular, admin_sistema y staff_find_player().';
COMMENT ON TABLE public.profiles_private IS 'Teléfono del usuario. Solo titular y admin_sistema.';
COMMENT ON COLUMN public.player_profiles.rut IS 'OBSOLETA: siempre NULL. Usar player_private.rut';
COMMENT ON COLUMN public.player_profiles.date_of_birth IS 'OBSOLETA: siempre NULL. Usar player_private.date_of_birth';
COMMENT ON COLUMN public.player_profiles.qr_token IS 'OBSOLETA: siempre NULL. Usar player_private.qr_token';
COMMENT ON COLUMN public.profiles.phone IS 'OBSOLETA: siempre NULL. Usar profiles_private.phone';
