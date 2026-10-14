/*
  Observaciones del árbitro en el partido.

  - matches.notes: texto libre (máx. 1000), lo escribe el árbitro en la papeleta y el
    administrador lo revisa antes de confirmar. Se muestra en el detalle del partido.
  - apply_match_sheet() ahora guarda p_payload.notes en matches.notes.

  Idempotente: se puede ejecutar más de una vez.
*/

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'matches_notes_length' AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_notes_length CHECK (notes IS NULL OR char_length(notes) <= 1000);
  END IF;
END $$;

COMMENT ON COLUMN public.matches.notes IS 'Observaciones del árbitro (papeleta). Público: no guardar datos personales.';

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

  UPDATE matches
  SET home_score = v_home, away_score = v_away, status = 'finished',
      notes = left(NULLIF(btrim(p_payload ->> 'notes'), ''), 1000)
  WHERE id = v_match.id;

  UPDATE match_sheets
  SET status = 'applied', confirmed = p_payload, applied_by = auth.uid(), applied_at = now()
  WHERE id = p_sheet_id;

  RETURN jsonb_build_object('ok', true, 'events', v_events);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_match_sheet(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_match_sheet(uuid, jsonb) TO authenticated;
