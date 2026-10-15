// Tipos de las RPC de tesorería (supabase/migrations/20261016120000_team_treasury.sql)
import { ChargeState, PaymentMethod } from './payments';

export type TreasuryRole = 'owner' | 'captain' | 'treasurer' | 'player';
export type ExpenseCategory = 'equipment' | 'field' | 'referee' | 'social' | 'other';

export interface TreasuryPlayer {
  player_id: string;
  name: string;
  active: boolean;
  role: string | null;
  treasurer: boolean;
  charged: number;
  paid: number;
  balance: number;
  overdue: number;
  last_paid: string | null;
}

export interface TreasuryBatch {
  batch_id: string;
  title: string;
  installments: number;
  players: number;
  per_player: number;
  total: number;
  first_due: string;
  any_charge_id: string;
  active: boolean;
  championship: string | null;
  created_at: string;
}

export interface TreasuryExpense {
  id: string;
  amount: number;
  spent_on: string;
  category: ExpenseCategory;
  description: string;
  status: 'active' | 'void';
  void_reason: string | null;
}

export interface TreasuryOverview {
  team: { id: string; name: string };
  role: TreasuryRole;
  today: string;
  players: TreasuryPlayer[];
  totals: { charged: number; collected: number; to_collect: number; overdue: number; debtors: number };
  batches: TreasuryBatch[];
  cash: { collected: number; expenses: number; championships: number };
  expenses: TreasuryExpense[];
  championship_payments: { id: string; amount: number; paid_on: string; championship: string; team_id: string }[];
  championships: { id: string; name: string }[];
}

export interface TreasuryStatement {
  team: { id: string; name: string };
  player: { id: string; name: string };
  manage: boolean;
  is_self: boolean;
  today: string;
  totals: { charged: number; paid: number; balance: number; overdue: number };
  charges: {
    id: string;
    title: string;
    installment: number;
    installments: number;
    amount: number;
    due_date: string;
    championship: string | null;
    status: 'active' | 'void';
    void_reason: string | null;
    covered: number;
    state: ChargeState;
  }[];
  payments: {
    id: string;
    amount: number;
    paid_on: string;
    method: PaymentMethod;
    reference: string | null;
    note: string | null;
    status: 'approved' | 'void';
    void_reason: string | null;
  }[];
}
