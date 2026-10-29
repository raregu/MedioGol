/** Tipos de las respuestas de las RPC del Inicio (supabase/migrations/20261009220000_home_server_side.sql). */

export interface LeagueSummarySeries {
  id: string;
  name: string;
  series_name: string | null;
}

export interface LeagueSummaryTop {
  club_key: string;
  name: string;
  points: number;
}

/** Fila de `league_summaries`: todo lo que necesita una LeagueCard en una sola consulta. */
export interface LeagueSummary {
  id: string;
  name: string;
  season: string | null;
  location: string | null;
  logo_url: string | null;
  status: string;
  phase_name: string | null;
  series: LeagueSummarySeries[];
  club_count: number;
  top: LeagueSummaryTop[];
  /** Aviso vigente del muro de la liga (null si no hay). Ausente si la migración no está aplicada. */
  notice?: LeagueNotice | null;
}

export type LeagueNoticeKind = 'aviso' | 'suspension' | 'horario';

/** Aviso del muro de una liga (supabase/migrations/20261029120000_league_posts.sql). */
export interface LeagueNotice {
  id: string;
  league_id: string;
  kind: LeagueNoticeKind;
  title: string;
  body: string | null;
  pinned: boolean;
  created_at: string;
  /** Solo en my_league_notices */
  league_name?: string | null;
}

/** Fila de `home_top_scorers`. */
export interface HomeScorer {
  player_id: string;
  player_name: string;
  team_name: string | null;
  goals: number;
}

export interface HomeMatch {
  id: string;
  championship_id: string;
  match_date: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  venue: string | null;
  home_team_name: string;
  away_team_name: string;
  /** "Liga Rural Casablanca · Súper Sénior" o el nombre del campeonato */
  competition: string;
}

export interface HomeChampionship {
  id: string;
  name: string;
  sport: string | null;
  venue: string | null;
  start_date: string | null;
  image_url: string | null;
  admin_id: string | null;
}

export interface PlayerCareer {
  id: string;
  full_name: string;
  position: string | null;
  photo_url: string | null;
  matches_played: number;
  total_goals: number;
  total_assists: number;
  avg_rating: string | null;
}
