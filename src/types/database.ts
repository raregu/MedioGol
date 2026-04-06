export type UserRole = 'admin_sistema' | 'admin_campeonato' | 'usuario';

export type ChampionshipStatus = 'draft' | 'active' | 'finished';

export type ChampionshipPhase = 'regular' | 'playoffs' | 'finished';

export type PlayoffFormat = 'single_elimination' | 'home_away';

export type PlayoffRound = 'round_of_32' | 'round_of_16' | 'quarterfinals' | 'semifinals' | 'final' | 'third_place';

export type PlayoffLeg = 'first_leg' | 'second_leg';

export type MatchStatus = 'scheduled' | 'playing' | 'finished' | 'cancelled';

export type SanctionType = 'suspension' | 'warning' | 'fine';

export type ChallengeStatus = 'pending' | 'accepted' | 'rejected';

export type InvitationStatus = 'pending' | 'accepted' | 'rejected';

export type TeamInvitationStatus = 'pending' | 'accepted' | 'expired';

export type TeamRegistrationStatus = 'pending' | 'confirmed' | 'rejected';

export type NotificationStatus = 'pending' | 'accepted' | 'rejected';

export type NotificationType = 'captain_confirmation';

export type VerificationStatus = 'pendiente' | 'verificado' | 'rechazado';

export type ValidationResult = 'aprobado' | 'rechazado' | 'sospechoso';

export interface Advertisement {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  link_url?: string;
  is_active: boolean;
  created_by?: string;
  championship_id?: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Sponsor {
  id: string;
  name: string;
  logo_url?: string;
  website_url?: string;
  description?: string;
  championship_id: string;
  display_order: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  avatar_url?: string;
  email?: string;
  created_at: string;
  updated_at: string;
  rut?: string;
  estado_verificacion?: VerificationStatus;
  foto_bloqueada?: boolean;
  fecha_ultimo_cambio_foto?: string;
  qr_token?: string;
  fecha_primer_partido?: string;
}

export interface PlayerCredential {
  id: string;
  full_name: string;
  rut?: string;
  date_of_birth?: string;
  photo_url?: string;
  position?: string;
  estado_verificacion: VerificationStatus;
  foto_bloqueada: boolean;
  qr_token: string;
  fecha_primer_partido?: string;
  team_name: string;
  team_logo?: string;
}

export interface ValidationLog {
  id: string;
  player_id: string;
  validated_by: string;
  match_id?: string;
  validation_result: ValidationResult;
  notas?: string;
  ubicacion_lat?: number;
  ubicacion_lng?: number;
  created_at: string;
  validator?: Profile;
  player?: Profile;
}

export interface Championship {
  id: string;
  name: string;
  sport: string;
  venue: string;
  description?: string;
  status: ChampionshipStatus;
  phase?: ChampionshipPhase;
  admin_id?: string;
  start_date?: string;
  end_date?: string;
  image_url?: string;
  rules_pdf_url?: string;
  location?: string;
  contact_phone?: string;
  champion_team_id?: string;
  runner_up_team_id?: string;
  third_place_team_id?: string;
  created_at: string;
  admin?: Profile;
  champion?: BaseTeam;
  runner_up?: BaseTeam;
  third_place?: BaseTeam;
}

export interface BaseTeam {
  id: string;
  name: string;
  logo_url?: string;
  owner_id: string;
  description?: string;
  founded_date?: string;
  created_at: string;
  owner?: Profile;
}

export interface TeamRegistration {
  id: string;
  base_team_id: string;
  championship_id: string;
  captain_id?: string;
  status: TeamRegistrationStatus;
  stamina: number;
  comments?: string;
  registered_at: string;
  base_team?: BaseTeam;
  championship?: Championship;
  captain?: Profile;
}

export interface Team {
  id: string;
  championship_id: string;
  name: string;
  logo_url?: string;
  captain_id?: string;
  stamina: number;
  comments?: string;
  is_enabled: boolean;
  captain_confirmed: boolean;
  captain_confirmed_at?: string;
  base_team_id?: string;
  created_at: string;
  championship?: Championship;
  captain?: Profile;
  base_team?: BaseTeam;
}

export interface Player {
  id: string;
  team_id: string;
  user_id?: string;
  name: string;
  number?: number;
  position?: string;
  is_active: boolean;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  matches_played: number;
  created_at: string;
  team?: Team;
  user?: Profile;
}

export interface Match {
  id: string;
  championship_id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  round: number;
  home_score: number;
  away_score: number;
  status: MatchStatus;
  venue?: string;
  created_at: string;
  championship?: Championship;
  home_team?: Team;
  away_team?: Team;
}

export interface MatchStat {
  id: string;
  match_id: string;
  player_id: string;
  team_id: string;
  goals: number;
  yellow_cards: number;
  red_cards: number;
  assists: number;
  created_at: string;
  match?: Match;
  player?: Player;
  team?: Team;
}

export interface TeamInvitation {
  id: string;
  championship_id: string;
  invited_by: string;
  email: string;
  team_name: string;
  message?: string;
  status: TeamInvitationStatus;
  token: string;
  expires_at: string;
  created_at: string;
  accepted_at?: string;
  championship?: Championship;
  inviter?: Profile;
}

export interface Sanction {
  id: string;
  championship_id: string;
  player_id: string;
  match_id?: string;
  type: SanctionType;
  reason: string;
  rounds_suspended: number;
  start_date?: string;
  end_date?: string;
  created_at: string;
  championship?: Championship;
  player?: Player;
  match?: Match;
}

export interface Challenge {
  id: string;
  championship_id: string;
  challenger_team_id: string;
  challenged_team_id: string;
  message?: string;
  status: ChallengeStatus;
  proposed_date?: string;
  created_at: string;
  responded_at?: string;
  championship?: Championship;
  challenger_team?: Team;
  challenged_team?: Team;
}

export interface Message {
  id: string;
  from_user_id: string;
  to_user_id: string;
  team_id?: string;
  subject: string;
  content: string;
  is_read: boolean;
  created_at: string;
  from_user?: Profile;
  to_user?: Profile;
  team?: Team;
}

export interface Invitation {
  id: string;
  team_id: string;
  invited_user_id: string;
  invited_by_user_id: string;
  message?: string;
  status: InvitationStatus;
  created_at: string;
  responded_at?: string;
  team?: Team;
  invited_user?: Profile;
  invited_by_user?: Profile;
}

export interface TeamStanding {
  team_id: string;
  team_name: string;
  team_logo_url?: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
}

export interface TopScorer {
  player_id: string;
  player_name: string;
  team_name: string;
  goals: number;
  assists: number;
}

export interface ChampionshipNotification {
  id: string;
  user_id: string;
  championship_id: string;
  team_registration_id?: string;
  type: NotificationType;
  message: string;
  status: NotificationStatus;
  created_at: string;
  responded_at?: string;
  championship?: Championship;
  team_registration?: TeamRegistration;
}

export interface PlayoffConfig {
  id: string;
  championship_id: string;
  teams_qualify: number;
  format: PlayoffFormat;
  include_third_place_match: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlayoffMatch {
  id: string;
  championship_id: string;
  round: PlayoffRound;
  match_number: number;
  leg?: PlayoffLeg;
  team1_id?: string;
  team2_id?: string;
  team1_score: number;
  team2_score: number;
  team1_aggregate_score: number;
  team2_aggregate_score: number;
  winner_id?: string;
  match_date?: string;
  status: MatchStatus;
  created_at: string;
  updated_at: string;
  team1?: BaseTeam;
  team2?: BaseTeam;
  winner?: BaseTeam;
  championship?: Championship;
}
