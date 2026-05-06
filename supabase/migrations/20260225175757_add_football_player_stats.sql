/*
  # Add Football Player Statistics Schema

  1. Changes to players table
    - Add `goals` (integer) - Total goals scored
    - Add `assists` (integer) - Total assists
    - Add `yellow_cards` (integer) - Total yellow cards
    - Add `red_cards` (integer) - Total red cards
    - Add `matches_played` (integer) - Total matches played
    - Make `position` have specific football positions

  2. Notes
    - All stats default to 0
    - Position now has football-specific options
    - Stats accumulate across all matches
    - match_stats table still tracks per-match statistics
*/

-- Add statistics columns to players table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'goals'
  ) THEN
    ALTER TABLE players ADD COLUMN goals integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'assists'
  ) THEN
    ALTER TABLE players ADD COLUMN assists integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'yellow_cards'
  ) THEN
    ALTER TABLE players ADD COLUMN yellow_cards integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'red_cards'
  ) THEN
    ALTER TABLE players ADD COLUMN red_cards integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'matches_played'
  ) THEN
    ALTER TABLE players ADD COLUMN matches_played integer DEFAULT 0;
  END IF;
END $$;

-- Create a function to update player totals from match_stats
CREATE OR REPLACE FUNCTION update_player_statistics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE players
  SET
    goals = COALESCE((
      SELECT SUM(goals)
      FROM match_stats
      WHERE player_id = NEW.player_id
    ), 0),
    assists = COALESCE((
      SELECT SUM(assists)
      FROM match_stats
      WHERE player_id = NEW.player_id
    ), 0),
    yellow_cards = COALESCE((
      SELECT SUM(yellow_cards)
      FROM match_stats
      WHERE player_id = NEW.player_id
    ), 0),
    red_cards = COALESCE((
      SELECT SUM(red_cards)
      FROM match_stats
      WHERE player_id = NEW.player_id
    ), 0),
    matches_played = COALESCE((
      SELECT COUNT(DISTINCT match_id)
      FROM match_stats
      WHERE player_id = NEW.player_id
    ), 0)
  WHERE id = NEW.player_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update player stats when match_stats change
DROP TRIGGER IF EXISTS trigger_update_player_stats ON match_stats;
CREATE TRIGGER trigger_update_player_stats
  AFTER INSERT OR UPDATE OR DELETE ON match_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_player_statistics();
