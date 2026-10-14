-- =====================================================================
-- Papeletas de partido: impresión, lectura con IA y confirmación
--
--  * can_manage_match(): quién puede imprimir, subir y confirmar papeletas
--    (admin del sistema, admin del campeonato, admin de la liga, encargado de
--    turno activo del campeonato).
--  * match_sheet_contexts(): datos que se imprimen en cada papeleta (y que la
--    IA recibe para interpretar la foto). Una sola fuente para el orden de filas.
--  * match_sheets: cada papeleta subida, lo que leyó la IA y lo confirmado.
--  * Bucket privado "match-sheets" (fotos), carpeta = id del partido.
--  * apply_match_sheet(): guarda lo confirmado en una transacción
--    (resultado, goles, tarjetas y quiénes jugaron).
-- Idempotente.
-- =====================================================================

-- ---------- Permisos ----------
CREATE OR REPLACE FUNCTION public.can_manage_match(p_match_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM matches m
    JOIN championships c ON c.id = m.championship_id
    JOIN profiles p ON p.id = auth.uid()
    WHERE m.id = p_match_id
      AND (
        p.role::text = 'admin_sistema'
        OR c.admin_id = auth.uid()
        OR (c.league_id IS NOT NULL AND public.can_manage_league(c.league_id))
        OR EXISTS (
          SELECT 1 FROM shift_manager_assignments s
          WHERE s.championship_id = c.id AND s.user_id = auth.uid() AND s.is_active
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_match(uuid) TO authenticated;

-- ---------- Datos impresos en la papeleta ----------
-- Por partido: competencia, fecha, cancha, equipos y nómina (máx. 24 filas por equipo,
-- ordenada por nombre). Las filas numeradas 1..N son las que se imprimen; la IA responde
-- con ese mismo número de fila.
CREATE OR REPLACE FUNCTION public.match_sheet_contexts(p_match_ids uuid[])
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'match_id', m.id,
    'code', 'MG-' || upper(substr(replace(m.id::text, '-', ''), 1, 4)) || '-' || upper(substr(replace(m.id::text, '-', ''), 5, 4)),
    'championship_id', c.id,
    'championship', c.name,
    'series', c.series_name,
    'league', CASE WHEN l.id IS NULL THEN NULL ELSE concat_ws(' ', l.name, l.season) END,
    'round', m.round,
    'match_date', m.match_date,
    'venue', COALESCE(sc.name, m.venue),
    'status', m.status,
    'home', jsonb_build_object('team_id', th.id, 'name', th.name, 'roster', COALESCE(rh.roster, '[]'::jsonb)),
    'away', jsonb_build_object('team_id', ta.id, 'name', ta.name, 'roster', COALESCE(ra.roster, '[]'::jsonb))
  )
  FROM unnest(p_match_ids[1:120]) WITH ORDINALITY AS ids(id, ord)
  JOIN matches m ON m.id = ids.id
  JOIN championships c ON c.id = m.championship_id
  LEFT JOIN leagues l ON l.id = c.league_id
  LEFT JOIN sports_complexes sc ON sc.id = m.sports_complex_id
  JOIN teams th ON th.id = m.home_team_id
  JOIN teams ta ON ta.id = m.away_team_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('row', x.rn, 'player_id', x.id, 'name', x.full_name) ORDER BY x.rn) AS roster
    FROM (
      SELECT pp.id, pp.full_name, row_number() OVER (ORDER BY pp.full_name, pp.id) AS rn
      FROM team_players tp JOIN player_profiles pp ON pp.id = tp.player_id
      WHERE tp.team_id = th.id AND tp.is_active
    ) x WHERE x.rn <= 24
  ) rh ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('row', x.rn, 'player_id', x.id, 'name', x.full_name) ORDER BY x.rn) AS roster
    FROM (
      SELECT pp.id, pp.full_name, row_number() OVER (ORDER BY pp.full_name, pp.id) AS rn
      FROM team_players tp JOIN player_profiles pp ON pp.id = tp.player_id
      WHERE tp.team_id = ta.id AND tp.is_active
    ) x WHERE x.rn <= 24
  ) ra ON true
  WHERE public.can_manage_match(m.id)
  ORDER BY ids.ord;
$$;

REVOKE ALL ON FUNCTION public.match_sheet_contexts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_sheet_contexts(uuid[]) TO authenticated;

-- ---------- Papeletas subidas ----------
CREATE TABLE IF NOT EXISTS public.match_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  image_paths text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'read', 'failed', 'applied', 'discarded')),
  ai_model text,
  ai_result jsonb,
  ai_usage jsonb,
  error text,
  confirmed jsonb,
  applied_by uuid REFERENCES public.profiles(id),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_sheets_match ON public.match_sheets (match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_sheets_uploader ON public.match_sheets (uploaded_by, created_at DESC);

ALTER TABLE public.match_sheets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_sheets FROM anon, authenticated;
GRANT SELECT ON public.match_sheets TO authenticated;

DROP POLICY IF EXISTS "Personal del partido ve sus papeletas" ON public.match_sheets;
CREATE POLICY "Personal del partido ve sus papeletas" ON public.match_sheets
  FOR SELECT TO authenticated USING (public.can_manage_match(match_id));
-- Las escrituras las hacen la Edge Function (service role) y apply_match_sheet().

-- ---------- Fotos: bucket privado ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('match-sheets', 'match-sheets', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Ruta: <match_id>/<archivo>. Solo quien administra ese partido sube o ve sus fotos.
DROP POLICY IF EXISTS "Personal sube fotos de papeletas" ON storage.objects;
CREATE POLICY "Personal sube fotos de papeletas" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'match-sheets'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_manage_match(((storage.foldername(name))[1])::uuid)
  );
DROP POLICY IF EXISTS "Personal ve fotos de papeletas" ON storage.objects;
CREATE POLICY "Personal ve fotos de papeletas" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'match-sheets'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_manage_match(((storage.foldername(name))[1])::uuid)
  );

-- ---------- Guardar lo confirmado ----------
-- p_payload:
-- { "home_score": 3, "away_score": 1,
--   "events": [ {"side":"home"|"away", "type":"goal"|"own_goal"|"yellow_card"|"red_card",
--               "player_id": uuid|null, "name": text|null, "jersey": text|null} ],
--   "participants": [ {"side":"home"|"away", "player_id": uuid|null, "name": text|null, "jersey": text|null} ],
--   "notes": text|null }
-- "own_goal" se cuenta a favor de "side" (el equipo beneficiado), sin jugador.
CREATE OR REPLACE FUNCTION public.apply_match_sheet(p_sheet_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sheet match_sheets%ROWTYPE;
  v_match matches%ROWTYPE;
  v_home int := (p_payload ->> 'home_score')::int;
  v_away int := (p_payload ->> 'away_score')::int;
  e jsonb;
  v_team uuid;
  v_player uuid;
  v_type text;
  v_events int := 0;
BEGIN
  SELECT * INTO v_sheet FROM match_sheets WHERE id = p_sheet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Papeleta no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.can_manage_match(v_sheet.match_id) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF v_sheet.status = 'applied' THEN
    RAISE EXCEPTION 'Esta papeleta ya fue confirmada' USING ERRCODE = '22023';
  END IF;
  IF v_home IS NULL OR v_away IS NULL OR v_home < 0 OR v_away < 0 OR v_home > 99 OR v_away > 99 THEN
    RAISE EXCEPTION 'Marcador inválido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = v_sheet.match_id FOR UPDATE;

  -- La papeleta es el registro oficial del partido: reemplaza eventos y estadísticas
  DELETE FROM match_events WHERE match_id = v_match.id;
  DELETE FROM match_statistics WHERE match_id = v_match.id;

  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload -> 'events', '[]'::jsonb)) LOOP
    v_team := CASE e ->> 'side' WHEN 'home' THEN v_match.home_team_id WHEN 'away' THEN v_match.away_team_id END;
    v_type := e ->> 'type';
    IF v_team IS NULL OR v_type NOT IN ('goal', 'own_goal', 'yellow_card', 'red_card') THEN
      RAISE EXCEPTION 'Evento inválido: %', e USING ERRCODE = '22023';
    END IF;
    v_player := NULLIF(e ->> 'player_id', '')::uuid;
    -- Un jugador indicado debe pertenecer a ese equipo
    IF v_player IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM team_players tp WHERE tp.team_id = v_team AND tp.player_id = v_player
    ) THEN
      RAISE EXCEPTION 'El jugador % no pertenece al equipo', v_player USING ERRCODE = '22023';
    END IF;
    IF v_type = 'own_goal' THEN v_player := NULL; END IF;

    INSERT INTO match_events (match_id, player_id, team_id, event_type, minute, additional_info)
    VALUES (
      v_match.id, v_player, v_team,
      CASE WHEN v_type = 'own_goal' THEN 'goal' ELSE v_type END,
      0,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'papeleta',
        'sheet_id', p_sheet_id,
        'minute_unknown', true,
        'type', CASE WHEN v_type = 'own_goal' THEN 'own_goal' WHEN v_type = 'goal' THEN 'normal' END,
        'player_name', CASE WHEN v_player IS NULL THEN NULLIF(btrim(e ->> 'name'), '') END,
        'jersey', NULLIF(btrim(e ->> 'jersey'), '')
      ))
    );
    v_events := v_events + 1;
  END LOOP;

  -- Participación (jugó) de los jugadores registrados que firmaron. Goles y tarjetas
  -- NO se repiten aquí: player_career_stats ya los suma desde match_events.
  INSERT INTO match_statistics (match_id, player_id, team_id)
  SELECT DISTINCT v_match.id, x.player_id, x.team_id
  FROM (
    SELECT NULLIF(p ->> 'player_id', '')::uuid AS player_id,
           CASE p ->> 'side' WHEN 'home' THEN v_match.home_team_id ELSE v_match.away_team_id END AS team_id
    FROM jsonb_array_elements(COALESCE(p_payload -> 'participants', '[]'::jsonb)) p
    WHERE NULLIF(p ->> 'player_id', '') IS NOT NULL
  ) x
  JOIN team_players tp ON tp.team_id = x.team_id AND tp.player_id = x.player_id
  ON CONFLICT (match_id, player_id) DO NOTHING;

  UPDATE matches SET home_score = v_home, away_score = v_away, status = 'finished' WHERE id = v_match.id;

  UPDATE match_sheets
  SET status = 'applied', confirmed = p_payload, applied_by = auth.uid(), applied_at = now()
  WHERE id = p_sheet_id;

  RETURN jsonb_build_object('ok', true, 'events', v_events);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_match_sheet(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_match_sheet(uuid, jsonb) TO authenticated;

-- Descartar una lectura (no guarda nada en el partido)
CREATE OR REPLACE FUNCTION public.discard_match_sheet(p_sheet_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE match_sheets SET status = 'discarded'
  WHERE id = p_sheet_id AND status IN ('uploaded', 'read', 'failed') AND public.can_manage_match(match_id);
END;
$$;
REVOKE ALL ON FUNCTION public.discard_match_sheet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discard_match_sheet(uuid) TO authenticated;
