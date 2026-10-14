import { ReactNode, useId } from 'react';
import { ChargeConcept, ChargeState, PaymentMethod, PaymentStatus } from '../../types/payments';
import { formatCLP, parseCLP } from '../../utils/money';

export const CONCEPT_LABEL: Record<ChargeConcept, string> = {
  registration: 'Inscripción',
  referee: 'Arbitraje',
  yellow_card: 'Multa amarilla',
  red_card: 'Multa roja',
  walkover: 'Multa W.O.',
  deposit: 'Garantía',
  other: 'Otro',
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  other: 'Otro',
};

const CHIP = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap';

export const ChargeStateChip = ({ state, covered, amount }: { state: ChargeState; covered: number; amount: number }) => {
  switch (state) {
    case 'paid':
      return <span className={`${CHIP} bg-mg-pitch-tint text-mg-pitch-deep`}>Pagado</span>;
    case 'overdue':
      return (
        <span className={`${CHIP} bg-mg-danger-tint text-mg-danger`}>
          Vencido{covered > 0 ? ` · falta ${formatCLP(amount - covered)}` : ''}
        </span>
      );
    case 'partial':
      return <span className={`${CHIP} bg-[#fff4d6] text-mg-gold-ink`}>Falta {formatCLP(amount - covered)}</span>;
    case 'void':
      return <span className={`${CHIP} bg-mg-surface-2 text-mg-muted`}>Anulado</span>;
    default:
      return <span className={`${CHIP} bg-mg-surface-2 text-mg-ink`}>Por vencer</span>;
  }
};

export const PaymentStatusChip = ({ status }: { status: PaymentStatus }) => {
  const map: Record<PaymentStatus, [string, string]> = {
    approved: ['Aprobado', 'bg-mg-pitch-tint text-mg-pitch-deep'],
    pending: ['Por revisar', 'bg-[#fff4d6] text-mg-gold-ink'],
    rejected: ['Rechazado', 'bg-mg-danger-tint text-mg-danger'],
    void: ['Anulado', 'bg-mg-surface-2 text-mg-muted'],
  };
  const [label, cls] = map[status];
  return <span className={`${CHIP} ${cls}`}>{label}</span>;
};

/** Cifra destacada (saldo, vencido…). */
export const Tile = ({ label, value, tone = 'default', hint }: { label: string; value: string; tone?: 'default' | 'danger' | 'good' | 'warn'; hint?: string }) => {
  const tones = {
    default: 'bg-mg-surface border-mg-line',
    danger: 'bg-mg-danger-tint border-[#f3c4bf]',
    good: 'bg-mg-pitch-tint border-[#bfe3cb]',
    warn: 'bg-[#fff4d6] border-[#e0b84a]',
  };
  return (
    <div className={`rounded-mg-lg border p-4 ${tones[tone]}`}>
      <p className="mg-label text-mg-muted">{label}</p>
      <p className="mg-num text-[30px] leading-9 font-extrabold mt-1">{value}</p>
      {hint && <p className="text-xs text-mg-muted mt-0.5">{hint}</p>}
    </div>
  );
};

export const fieldClass = 'w-full min-h-[44px] px-3 border border-mg-line-strong rounded-mg-md bg-mg-surface text-mg-ink';

export const Field = ({ label, hint, children, id }: { label: string; hint?: string; children: (id: string) => ReactNode; id?: string }) => {
  const auto = useId();
  const fid = id || auto;
  return (
    <div className="space-y-1">
      <label htmlFor={fid} className="block text-sm font-bold">{label}</label>
      {children(fid)}
      {hint && <p className="text-xs text-mg-muted">{hint}</p>}
    </div>
  );
};

/** Monto en pesos con separador de miles mientras se escribe. */
export const MoneyInput = ({ id, value, onChange, required, ariaDescribedBy }: { id: string; value: number | null; onChange: (n: number | null) => void; required?: boolean; ariaDescribedBy?: string }) => (
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mg-muted font-bold" aria-hidden="true">$</span>
    <input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      required={required}
      aria-describedby={ariaDescribedBy}
      value={value == null ? '' : value.toLocaleString('es-CL')}
      onChange={(e) => onChange(parseCLP(e.target.value))}
      className={`${fieldClass} pl-7 mg-num text-lg`}
    />
  </div>
);

export const primaryBtn = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm disabled:opacity-50';
export const secondaryBtn = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-mg-md border border-mg-line-strong bg-mg-surface text-mg-ink font-extrabold text-sm disabled:opacity-50';
export const dangerLink = 'inline-flex items-center min-h-[44px] px-2 text-sm font-bold text-mg-danger disabled:opacity-50';

/** Mensaje de error legible desde un error de Supabase/PostgREST. */
export const errorText = (err: unknown, fallback: string) => {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return fallback;
  if (e.code === '42501') return 'No tienes permiso para esta acción.';
  if (e.code === '22023' || e.code === 'P0002') return e.message || fallback;
  if (e.code === '23514') return 'Revisa los montos y fechas ingresados.';
  return fallback;
};
