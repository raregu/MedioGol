/*
  Solicitudes para ser organizador (admin_campeonato).

  Flujo:
  - Un usuario con sesión (rol usuario o capitan) envía una solicitud desde /organizar con los
    datos de su liga o campeonato y un teléfono de contacto.
  - El admin del sistema la revisa en Administrar → Solicitudes: aprueba (el usuario pasa a
    admin_campeonato y desde ahí crea su liga/campeonato) o rechaza con un motivo que el
    solicitante ve.
  - El solicitante puede cancelar mientras está pendiente. Nada se borra.

  Privacidad: el teléfono solo lo ven el solicitante y el admin del sistema (RLS).
  Escrituras solo por RPC (SECURITY DEFINER con validaciones). Idempotente.
  Requiere 20261013200000_private_personal_data.sql (current_user_role).
*/

-- =====================================================================
-- Tabla
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.organizer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_type text NOT NULL CHECK (org_type IN ('league', 'championship', 'tournament', 'venue')),
  org_name text NOT NULL CHECK (char_length(org_name) BETWEEN 3 AND 120),
  city text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 80),
  venue text CHECK (venue IS NULL OR char_length(venue) <= 120),
  sport text NOT NULL DEFAULT 'futbol' CHECK (sport IN ('futbol', 'futbolito', 'baby_futbol', 'futsal', 'otro')),
  teams_estimate integer CHECK (teams_estimate IS NULL OR teams_estimate BETWEEN 2 AND 500),
  series_estimate integer CHECK (series_estimate IS NULL OR series_estimate BETWEEN 1 AND 30),
  start_estimate date,
  already_running boolean NOT NULL DEFAULT false,
  website text CHECK (website IS NULL OR char_length(website) <= 200),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 2 AND 120),
  contact_phone text NOT NULL CHECK (contact_phone ~ '^[0-9]{8,15}$'),
  contact_role text NOT NULL CHECK (contact_role IN ('organizer', 'president', 'delegate', 'venue_manager', 'other')),
  message text CHECK (message IS NULL OR char_length(message) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 500),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Una sola solicitud pendiente por usuario
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizer_requests_pending
  ON public.organizer_requests (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_organizer_requests_user ON public.organizer_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_organizer_requests_status ON public.organizer_requests (status, created_at DESC);

-- =====================================================================
-- RLS: el solicitante ve las suyas; el admin del sistema ve todas. Sin escrituras directas.
-- =====================================================================
ALTER TABLE public.organizer_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organizer_requests FROM anon, authenticated;
GRANT SELECT ON public.organizer_requests TO authenticated;

DROP POLICY IF EXISTS "Solicitante o admin del sistema ven solicitudes" ON public.organizer_requests;
CREATE POLICY "Solicitante o admin del sistema ven solicitudes" ON public.organizer_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin_sistema');

-- =====================================================================
-- Enviar solicitud
-- =====================================================================
CREATE OR REPLACE FUNCTION public.submit_organizer_request(
  p_org_type text,
  p_org_name text,
  p_city text,
  p_venue text,
  p_sport text,
  p_teams_estimate integer,
  p_series_estimate integer,
  p_start_estimate date,
  p_already_running boolean,
  p_website text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_role text,
  p_message text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_phone text := regexp_replace(COALESCE(p_contact_phone, ''), '[^0-9]', '', 'g');
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para enviar la solicitud' USING ERRCODE = '42501';
  END IF;

  SELECT role::text INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role IN ('admin_campeonato', 'admin_sistema') THEN
    RAISE EXCEPTION 'Tu cuenta ya tiene acceso de organizador' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM organizer_requests WHERE user_id = v_uid AND status = 'pending') THEN
    RAISE EXCEPTION 'Ya tienes una solicitud en revisión' USING ERRCODE = '22023';
  END IF;

  -- Freno contra envíos repetidos: máximo 3 solicitudes por día
  IF (SELECT count(*) FROM organizer_requests
      WHERE user_id = v_uid AND created_at > now() - interval '24 hours') >= 3 THEN
    RAISE EXCEPTION 'Enviaste varias solicitudes hoy. Intenta de nuevo mañana' USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(COALESCE(p_org_name, ''))) < 3 THEN
    RAISE EXCEPTION 'Escribe el nombre de tu liga o campeonato' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_city, ''))) < 2 THEN
    RAISE EXCEPTION 'Indica la comuna o ciudad' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_contact_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Escribe tu nombre' USING ERRCODE = '22023';
  END IF;
  IF v_phone !~ '^[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'Revisa el teléfono de contacto' USING ERRCODE = '22023';
  END IF;
  -- Celular chileno de 9 dígitos sin código de país → se agrega 56
  IF v_phone ~ '^9[0-9]{8}$' THEN
    v_phone := '56' || v_phone;
  END IF;

  INSERT INTO organizer_requests (
    user_id, org_type, org_name, city, venue, sport, teams_estimate, series_estimate,
    start_estimate, already_running, website, contact_name, contact_phone, contact_role, message
  ) VALUES (
    v_uid, p_org_type, btrim(p_org_name), btrim(p_city), NULLIF(btrim(COALESCE(p_venue, '')), ''),
    COALESCE(p_sport, 'futbol'), p_teams_estimate, p_series_estimate, p_start_estimate,
    COALESCE(p_already_running, false), NULLIF(btrim(COALESCE(p_website, '')), ''),
    btrim(p_contact_name), v_phone, p_contact_role, NULLIF(btrim(COALESCE(p_message, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN check_violation THEN
    RAISE EXCEPTION 'Revisa los datos del formulario' USING ERRCODE = '22023';
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Ya tienes una solicitud en revisión' USING ERRCODE = '22023';
END;
$$;

-- =====================================================================
-- Cancelar (solo el solicitante, solo si está pendiente)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cancel_organizer_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE organizer_requests
     SET status = 'cancelled', updated_at = now()
   WHERE id = p_request_id AND user_id = auth.uid() AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La solicitud ya no está pendiente' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- =====================================================================
-- Revisar (solo admin del sistema). Aprobar → rol admin_campeonato.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.review_organizer_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req organizer_requests%ROWTYPE;
  v_role text;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin_sistema' THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM organizer_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'La solicitud ya no está pendiente' USING ERRCODE = 'P0002';
  END IF;

  IF NOT COALESCE(p_approve, false) AND char_length(COALESCE(v_note, '')) < 5 THEN
    RAISE EXCEPTION 'Escribe el motivo del rechazo (lo verá el solicitante)' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(v_note, '')) > 500 THEN
    RAISE EXCEPTION 'El comentario es muy largo' USING ERRCODE = '22023';
  END IF;

  IF p_approve THEN
    SELECT role::text INTO v_role FROM profiles WHERE id = v_req.user_id FOR UPDATE;
    IF v_role = 'encargado_turno' THEN
      RAISE EXCEPTION 'Este usuario es encargado de turno. Cambia su rol a mano en Usuarios' USING ERRCODE = '22023';
    END IF;
    IF v_role IN ('usuario', 'capitan') THEN
      UPDATE profiles SET role = 'admin_campeonato', updated_at = now() WHERE id = v_req.user_id;
    END IF;
  END IF;

  UPDATE organizer_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         review_note = v_note,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_request_id;

  RETURN CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_organizer_request(text, text, text, text, text, integer, integer, date, boolean, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_organizer_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_organizer_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_organizer_request(text, text, text, text, text, integer, integer, date, boolean, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_organizer_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_organizer_request(uuid, boolean, text) TO authenticated;
