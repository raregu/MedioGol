import { CashCategory, CashInCategory, CashOutCategory } from '../types/leagueCash';
import { todayCL } from './money';

export const IN_CATEGORIES: CashInCategory[] = ['sponsor', 'tickets', 'kiosk', 'contribution', 'other_in', 'opening'];
export const OUT_CATEGORIES: CashOutCategory[] = ['referees', 'field', 'prizes', 'equipment', 'association', 'insurance', 'admin', 'other_out'];

export const CATEGORY_LABEL: Record<CashCategory, string> = {
  opening: 'Saldo inicial',
  sponsor: 'Auspicio',
  tickets: 'Entradas',
  kiosk: 'Kiosco',
  contribution: 'Aporte',
  other_in: 'Otro ingreso',
  referees: 'Árbitros',
  field: 'Cancha',
  prizes: 'Premios y trofeos',
  equipment: 'Balones e implementos',
  association: 'Asociación / ANFA',
  insurance: 'Seguros y primeros auxilios',
  admin: 'Administración',
  other_out: 'Otro egreso',
};

export type PeriodKey = 'month' | 'year' | '12m' | 'all';
export const PERIOD_LABEL: Record<PeriodKey, string> = {
  month: 'Este mes',
  year: 'Este año',
  '12m': 'Últimos 12 meses',
  all: 'Todo',
};

/** Rango [from, to] en fechas de Chile; from null = desde el inicio. */
export const periodRange = (key: PeriodKey): { from: string | null; to: string } => {
  const to = todayCL();
  const [y, m] = to.split('-').map(Number);
  if (key === 'month') return { from: `${to.slice(0, 7)}-01`, to };
  if (key === 'year') return { from: `${y}-01-01`, to };
  if (key === '12m') {
    const d = new Date(Date.UTC(y, m - 12, 1));
    return { from: d.toISOString().slice(0, 10), to };
  }
  return { from: null, to };
};

/** "2026-11" → "nov 2026" */
export const monthLabel = (ym: string, withYear = true) => {
  const [y, m] = ym.split('-').map(Number);
  const s = new Date(y, m - 1, 15).toLocaleDateString('es-CL', { month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  return s.replace('.', '');
};
