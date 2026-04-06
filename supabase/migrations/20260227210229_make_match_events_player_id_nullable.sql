/*
  # Make player_id nullable in match_events

  1. Changes
    - Make player_id column nullable in match_events table
    - Some events may not be associated with a specific player
  
  2. Reasoning
    - Not all events require a player (e.g., team-level events)
    - Shift managers recording events may not always know the specific player
*/

-- Make player_id nullable
ALTER TABLE match_events
ALTER COLUMN player_id DROP NOT NULL;
