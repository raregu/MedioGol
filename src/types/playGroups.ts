// Grupos fijos (pichanga semanal). Ver migración 20261119150000_play_groups.sql

export type PlayStatus = 'in' | 'auto' | 'out' | 'wait';
export type PlayRole = 'fixed' | 'sub';
export type PlayPosition = 'arquero' | 'defensa' | 'medio' | 'delantero';
export type TeamSide = 'A' | 'B';

export interface PlayGroupSettings {
  id: string;
  name: string;
  weekday: number; // 0 = domingo
  start_time: string; // HH:MM
  venue: string | null;
  slots: number;
  /** Costo de la cancha (lo paga el grupo) */
  price: number | null;
  /** Cuota por partido de cada jugador (migración 20261127150000) */
  fee?: number | null;
  /** Cuota del invitado; null = igual a la cuota */
  guest_fee?: number | null;
  fixed_mode: 'auto' | 'confirm';
  allow_guests: boolean;
  invite_code: string;
  open_days_before: number;
  open_time: string;
  subs_days_before: number;
  subs_time: string;
  close_days_before: number;
  close_time: string;
  promote_threshold: number;
}

export interface PlaySession {
  id: string;
  starts_at: string;
  opens_at: string;
  subs_at: string;
  closes_at: string;
  venue: string | null;
  slots: number;
  price: number | null;
  fee?: number | null;
  guest_fee?: number | null;
  status: 'open' | 'played' | 'cancelled';
  score_a: number | null;
  score_b: number | null;
  used: number;
  lineup: Record<string, TeamSide> | null;
  mvp: string | null;
}

export interface PlayMember {
  id: string;
  name: string;
  role: PlayRole;
  is_admin: boolean;
  claimed: boolean;
  status: PlayStatus | null;
  guests: number;
  paid: boolean;
  team: TeamSide | null;
  queued_at: string | null;
}

/** Solo lo ve el organizador. */
export interface PlayMemberPrivate {
  real_name?: string | null;
  position: PlayPosition | null;
  stars: number | null;
  rating: number;
  games: number;
  attended: number;
  sessions: number;
}

export interface PlayGroupView {
  group: PlayGroupSettings;
  session: PlaySession;
  members: PlayMember[];
  me: string | null;
  is_admin: boolean;
  private?: Record<string, PlayMemberPrivate>;
  /** Caja del grupo (solo miembros y organizador) */
  cash?: PlayCashSummary;
  recent?: { starts_at: string; score_a: number | null; score_b: number | null; status: string; lineup: Record<string, TeamSide> | null }[];
}

export interface PlayDebt {
  member_id: string;
  name: string;
  amount: number;
  count: number;
  since: string;
}

export interface PlayCashSummary {
  collected: number;
  field: number;
  manual_in: number;
  manual_out: number;
  balance: number;
  debts: PlayDebt[];
}

export type PlayCashCategory = 'opening' | 'contribution' | 'fine' | 'other_in' | 'balls' | 'bbq' | 'bibs' | 'referee' | 'field' | 'other_out';

export interface PlayCashView extends PlayCashSummary {
  can_edit: boolean;
  weeks: { session_id: string; starts_at: string; fee: number; cost: number; players: number; paid: number; collected: number }[];
  movements: {
    id: string;
    kind: 'in' | 'out';
    category: PlayCashCategory;
    amount: number;
    occurred_on: string;
    description: string;
    has_receipt: boolean;
    status: 'active' | 'void';
    void_reason: string | null;
  }[];
}

/** Resumen de cada grupo para Inicio y Mis equipos (RPC my_play_groups). */
export interface MyPlayGroup {
  group_id: string;
  name: string;
  is_admin: boolean;
  starts_at: string;
  opens_at: string;
  subs_at: string;
  closes_at: string;
  fixed_mode: 'auto' | 'confirm';
  status: 'open' | 'played' | 'cancelled';
  venue: string | null;
  slots: number;
  used: number;
  my_status: PlayStatus | null;
  my_paid: boolean | null;
  pending: number;
  waiting: number;
  paid: number;
  price: number | null;
}
