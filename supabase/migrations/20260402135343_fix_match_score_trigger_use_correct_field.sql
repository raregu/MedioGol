/*
  # Fix match score trigger to use correct field name

  1. Changes
    - Update `update_match_score()` function to check `additional_info->>'type'` instead of `additional_info->>'goal_type'`
    - This matches the actual field name used when creating match events
  
  2. Notes
    - The trigger was looking for 'goal_type' but the app stores it as 'type'
    - This fixes the bug where match scores weren't counting all goals correctly
*/

-- Function to recalculate and update match scores
CREATE OR REPLACE FUNCTION update_match_score()
RETURNS TRIGGER AS $$
DECLARE
  v_match_id uuid;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_home_score int;
  v_away_score int;
BEGIN
  -- Get the match_id from the event (works for INSERT, UPDATE, DELETE)
  IF TG_OP = 'DELETE' THEN
    v_match_id := OLD.match_id;
  ELSE
    v_match_id := NEW.match_id;
  END IF;

  -- Get team IDs from the match
  SELECT home_team_id, away_team_id 
  INTO v_home_team_id, v_away_team_id
  FROM matches 
  WHERE id = v_match_id;

  -- Count goals for home team (excluding own goals by away team)
  SELECT COUNT(*) INTO v_home_score
  FROM match_events
  WHERE match_id = v_match_id
    AND event_type = 'goal'
    AND team_id = v_home_team_id
    AND (additional_info->>'type' != 'own_goal' OR additional_info->>'type' IS NULL);

  -- Add own goals by away team to home score
  SELECT v_home_score + COUNT(*) INTO v_home_score
  FROM match_events
  WHERE match_id = v_match_id
    AND event_type = 'goal'
    AND team_id = v_away_team_id
    AND additional_info->>'type' = 'own_goal';

  -- Count goals for away team (excluding own goals by home team)
  SELECT COUNT(*) INTO v_away_score
  FROM match_events
  WHERE match_id = v_match_id
    AND event_type = 'goal'
    AND team_id = v_away_team_id
    AND (additional_info->>'type' != 'own_goal' OR additional_info->>'type' IS NULL);

  -- Add own goals by home team to away score
  SELECT v_away_score + COUNT(*) INTO v_away_score
  FROM match_events
  WHERE match_id = v_match_id
    AND event_type = 'goal'
    AND team_id = v_home_team_id
    AND additional_info->>'type' = 'own_goal';

  -- Update the match scores
  UPDATE matches
  SET 
    home_score = v_home_score,
    away_score = v_away_score
  WHERE id = v_match_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;