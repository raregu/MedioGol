// Tipos de la caja de la liga (supabase/migrations/20261127120000_league_cash.sql)
import { PaymentMethod } from './payments';

export type CashKind = 'in' | 'out';
export type CashRole = 'admin' | 'treasurer';
export type CashInCategory = 'opening' | 'sponsor' | 'tickets' | 'kiosk' | 'contribution' | 'other_in';
export type CashOutCategory = 'referees' | 'field' | 'prizes' | 'equipment' | 'association' | 'insurance' | 'admin' | 'other_out';
export type CashCategory = CashInCategory | CashOutCategory;

export interface CashOverview {
  role: CashRole;
  from: string | null;
  to: string;
  income_auto: number;
  income_manual: number;
  expense: number;
  /** Saldo de caja histórico hasta "to" */
  balance: number;
  /** Lo que los equipos deben hoy (cargos activos − pagos aprobados) */
  receivable: number;
  months: { month: string; income: number; expense: number }[];
  categories: { kind: CashKind; category: CashCategory; total: number; count: number }[];
  auto: { month: string; championship_id: string; series: string; total: number; count: number }[];
  series: { id: string; label: string }[];
  treasurers: { user_id: string; name: string }[] | null;
}

export interface CashMovement {
  id: string;
  kind: CashKind;
  category: CashCategory;
  amount: number;
  occurred_on: string;
  championship_id: string | null;
  series: string | null;
  description: string;
  method: PaymentMethod;
  has_receipt: boolean;
  status: 'active' | 'void';
  void_reason: string | null;
  created_by_name: string | null;
  created_at: string;
}
