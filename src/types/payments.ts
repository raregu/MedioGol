// Tipos de las RPC de pagos (supabase/migrations/20261015120000_championship_payments.sql)

export type ChargeConcept = 'registration' | 'referee' | 'yellow_card' | 'red_card' | 'walkover' | 'deposit' | 'other';
export type ChargeState = 'paid' | 'partial' | 'pending' | 'overdue' | 'void';
export type PaymentMethod = 'cash' | 'transfer' | 'other';
export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'void';
export type RefereeMode = 'per_match' | 'included';

export interface TeamBalance {
  team_id: string;
  team_name: string;
  charged: number;
  paid: number;
  balance: number;
  overdue: number;
  pending_review: number;
  last_payment_on: string | null;
}

export interface FeeSettings {
  registration_amount: number;
  registration_installments: number;
  registration_first_due: string | null;
  registration_interval_days: number;
  referee_mode: RefereeMode;
  referee_fee: number;
  yellow_card_fine: number;
  red_card_fine: number;
  walkover_fine: number;
  fine_due_days: number;
  payment_instructions: string | null;
}

export const DEFAULT_FEE_SETTINGS: FeeSettings = {
  registration_amount: 0,
  registration_installments: 1,
  registration_first_due: null,
  registration_interval_days: 30,
  referee_mode: 'per_match',
  referee_fee: 0,
  yellow_card_fine: 0,
  red_card_fine: 0,
  walkover_fine: 0,
  fine_due_days: 7,
  payment_instructions: null,
};

export interface StatementCharge {
  id: string;
  concept: ChargeConcept;
  description: string;
  amount: number;
  due_date: string;
  match_id: string | null;
  automatic: boolean;
  status: 'active' | 'void';
  void_reason: string | null;
  covered: number;
  state: ChargeState;
}

export interface StatementPayment {
  id: string;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  receipt_path: string | null;
  status: PaymentStatus;
  review_note: string | null;
  created_at: string;
  mine: boolean;
}

export interface TeamStatement {
  team: { id: string; name: string };
  championship: { id: string; name: string };
  permissions: { manage: boolean; collect: boolean; captain: boolean };
  settings: { payment_instructions: string | null; walkover_fine: number; referee_mode: RefereeMode } | null;
  today: string;
  totals: { charged: number; paid: number; balance: number; overdue: number };
  charges: StatementCharge[];
  payments: StatementPayment[];
}

export interface LeagueSeriesPayment {
  championship_id: string;
  championship_name: string;
  series_name: string | null;
  display_order: number;
  configured: boolean;
  teams: number;
  to_collect: number;
  overdue: number;
  paid: number;
  debtors: number;
  pending_review: number;
}
