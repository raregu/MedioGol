/*
  # Fix Player Career Stats to Include Match Events

  1. Changes
    - Update the player_career_stats view to include data from match_events
    - Match events contain the actual goals, assists, and cards from live matches
    - Combine both match_statistics and match_events for complete player stats

  2. Notes
    - The system has two sources of stats:
      - match_statistics: Manual entry by admins
      - match_events: Live match events (goals, assists, cards)
    - Both should be aggregated for accurate career statistics
*/

-- Drop the existing view
DROP VIEW IF EXISTS player_career_stats;

-- Recreate the view with match_events data included
CREATE OR REPLACE VIEW player_career_stats AS
WITH combined_stats AS (
  -- Get stats from match_statistics
  SELECT 
    ms.player_id,
    ms.match_id,
    ms.goals,
    ms.assists,
    ms.yellow_cards,
    ms.red_cards,
    ms.minutes_played
  FROM match_statistics ms
  
  UNION ALL
  
  -- Get stats from match_events (goals and assists)
  SELECT 
    me.player_id,
    me.match_id,
    COUNT(*) FILTER (WHERE me.event_type = 'goal') as goals,
    COUNT(*) FILTER (WHERE me.event_type = 'assist') as assists,
    COUNT(*) FILTER (WHERE me.event_type = 'yellow_card') as yellow_cards,
    COUNT(*) FILTER (WHERE me.event_type = 'red_card') as red_cards,
    0 as minutes_played
  FROM match_events me
  WHERE me.player_id IS NOT NULL
  GROUP BY me.player_id, me.match_id
)
SELECT 
  p.id,
  p.full_name,
  p.position,
  p.photo_url,
  COUNT(DISTINCT cs.match_id) as matches_played,
  COALESCE(SUM(cs.goals), 0) as total_goals,
  COALESCE(SUM(cs.assists), 0) as total_assists,
  COALESCE(SUM(cs.yellow_cards), 0) as total_yellow_cards,
  COALESCE(SUM(cs.red_cards), 0) as total_red_cards,
  COALESCE(SUM(cs.minutes_played), 0) as total_minutes,
  COALESCE(AVG(pr.rating), 0) as avg_rating,
  COUNT(DISTINCT pr.id) as review_count
FROM player_profiles p
LEFT JOIN combined_stats cs ON p.id = cs.player_id
LEFT JOIN player_reviews pr ON p.id = pr.player_id
GROUP BY p.id, p.full_name, p.position, p.photo_url;
