/*
  # Create trigger to auto-update match scores

  1. New Functions
    - `update_match_score()` - Function that recalculates match scores based on goal events
  
  2. New Triggers
    - Trigger on `match_events` table that calls `update_match_score()` after INSERT, UPDATE, or DELETE
  
  3. Changes
    - Match scores will now be automatically updated when goal events are added, modified, or deleted
    - This ensures real-time score updates in the UI
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
    AND (additional_info->>'goal_type' != 'own_goal' OR additional_info->>'goal_type' IS NULL);

  -- Add own goals by away team to home score
  SELECT v_home_score + COUNT(*) INTO v_home_score
  FROM match_events
  WHERE match_id = v_match_id
    AND event_type = 'goal'
    AND team_id = v_away_team_id
    AND additional_info->>'goal_type' = 'own_goal';

  -- Count goals for away team (excluding own goals by home team)
  SELECT COUNT(*) INTO v_away_score
  FROM match_events
  WHERE match_id = v_match_id
    AND event_type = 'goal'
    AND team_id = v_away_team_id
    AND (additional_info->>'goal_type' != 'own_goal' OR additional_info->>'goal_type' IS NULL);

  -- Add own goals by home team to away score
  SELECT v_away_score + COUNT(*) INTO v_away_score
  FROM match_events
  WHERE match_id = v_match_id
    AND event_type = 'goal'
    AND team_id = v_home_team_id
    AND additional_info->>'goal_type' = 'own_goal';

  -- Update the match scores
  UPDATE matches
  SET 
    home_score = v_home_score,
    away_score = v_away_score
  WHERE id = v_match_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires after any change to match_events
DROP TRIGGER IF EXISTS match_events_score_update ON match_events;

CREATE TRIGGER match_events_score_update
  AFTER INSERT OR UPDATE OR DELETE ON match_events
  FOR EACH ROW
  EXECUTE FUNCTION update_match_score();
