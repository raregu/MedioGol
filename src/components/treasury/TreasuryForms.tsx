import { FormEvent, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PaymentMethod } from '../../types/payments';
import { ExpenseCategory, TreasuryPlayer } from '../../types/treasury';
import { formatCLP, todayCL } from '../../utils/money';
import { Field, METHOD_LABEL, MoneyInput, errorText, fieldClass, primaryBtn, secondaryBtn } from '../payments/PaymentsUi';

const FormShell = ({ title, children, error, saving, submitLabel, onCancel, onSubmit }: {
  title: string; children: React.ReactNode; error: string | null; saving: boolean; submitLabel: string;
  onCancel: () => void; onSubmit: (e: FormEvent) => void;
}) => (
  <form onSubmit={onSubmit} className="bg-mg-surface border border-mg-line rounded-mg-lg p-5 space-y-4">
    <h3 className="text-lg font-extrabold">{title}</h3>
    {children}
    {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
    <div className="flex flex-wrap gap-3 justify-end">
      <button type="button" onClick={onCancel} className={secondaryBtn}>Cancelar</button>
      <button type="submit" disabled={saving} className={primaryBtn}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </button>
    </div>
  </form>
);

/** Nuevo cobro para el plantel (o algunos jugadores), en una o varias cuotas. */
export const NewChargeForm = ({ baseTeamId, players, championships, onDone, onCancel }: {
  baseTeamId: string; players: TreasuryPlayer[]; championships: { id: string; name: string }[];
  onDone: () => void; onCancel: () => void;
}) => {
  const active = players.filter((p) => p.active);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [installments, setInstallments] = useState(1);
  const [firstDue, setFirstDue] = useState(todayCL());
  const [intervalDays, setIntervalDays] = useState(30);
  const [championshipId, setChampionshipId] = useState('');
  const [everyone, setEveryone] = useState(true);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = everyone ? active.length : chosen.size;
  const toggle = (id: string) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2) return setError('Escribe un nombre, por ejemplo "Cuota Clausura 2026".');
    if (!amount || amount < installments) return setError('Ingresa el monto por jugador.');
    if (!count) return setError('Elige al menos un jugador.');
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('create_treasury_charge', {
      p_base_team_id: baseTeamId, p_title: title.trim(), p_amount: amount, p_installments: installments,
      p_first_due: firstDue || null, p_interval_days: intervalDays,
      p_player_ids: everyone ? null : [...chosen], p_championship_id: championshipId || null,
    });
    setSaving(false);
    if (rpcError) { console.error(rpcError); return setError(errorText(rpcError, 'No se pudo crear el cobro.')); }
    onDone();
  };

  return (
    <FormShell title="Nuevo cobro a jugadores" error={error} saving={saving} submitLabel={`Cobrar a ${count} ${count === 1 ? 'jugador' : 'jugadores'}`} onCancel={onCancel} onSubmit={submit}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nombre del cobro" hint="Ej.: Cuota Clausura 2026 (incluye arbitraje).">{(id) => <input id={id} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />}</Field>
        <Field label="Monto por jugador" hint={amount && installments > 1 ? `${installments} cuotas de ~${formatCLP(Math.floor(amount / installments))}` : undefined}>{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} required />}</Field>
        <Field label="Cuotas">
          {(id) => (
            <select id={id} value={installments} onChange={(e) => setInstallments(Number(e.target.value))} className={fieldClass}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'Pago único' : `${n} cuotas`}</option>)}
            </select>
          )}
        </Field>
        <Field label={installments > 1 ? 'Vence la primera cuota' : 'Vence'}>{(id) => <input id={id} type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} className={fieldClass} />}</Field>
        {installments > 1 && (
          <Field label="Días entre cuotas">{(id) => <input id={id} type="number" min={1} max={120} value={intervalDays} onChange={(e) => setIntervalDays(Math.min(120, Math.max(1, Number(e.target.value) || 30)))} className={fieldClass} />}</Field>
        )}
        {championships.length > 0 && (
          <Field label="Campeonato (opcional)">
            {(id) => (
              <select id={id} value={championshipId} onChange={(e) => setChampionshipId(e.target.value)} className={fieldClass}>
                <option value="">Ninguno</option>
                {championships.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
        )}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">¿A quién?</legend>
        <label className="flex items-center gap-2 min-h-[44px]"><input type="radio" checked={everyone} onChange={() => setEveryone(true)} /> Todo el plantel activo ({active.length})</label>
        <label className="flex items-center gap-2 min-h-[44px]"><input type="radio" checked={!everyone} onChange={() => setEveryone(false)} /> Elegir jugadores</label>
        {!everyone && (
          <div className="grid sm:grid-cols-2 gap-1 max-h-64 overflow-y-auto border border-mg-line rounded-mg-md p-2">
            {active.map((p) => (
              <label key={p.player_id} className="flex items-center gap-2 min-h-[40px] px-2 rounded hover:bg-mg-surface-2">
                <input type="checkbox" checked={chosen.has(p.player_id)} onChange={() => toggle(p.player_id)} /> {p.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </FormShell>
  );
};

/** Pago de un jugador al tesorero. */
export const TreasuryPaymentForm = ({ baseTeamId, players, fixedPlayerId, suggested, onDone, onCancel }: {
  baseTeamId: string; players?: TreasuryPlayer[]; fixedPlayerId?: string; suggested?: number;
  onDone: () => void; onCancel: () => void;
}) => {
  const [playerId, setPlayerId] = useState(fixedPlayerId || '');
  const [amount, setAmount] = useState<number | null>(suggested && suggested > 0 ? suggested : null);
  const [paidOn, setPaidOn] = useState(todayCL());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!playerId) return setError('Elige el jugador.');
    if (!amount || amount <= 0) return setError('Ingresa el monto.');
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('record_treasury_payment', {
      p_base_team_id: baseTeamId, p_player_id: playerId, p_amount: amount, p_paid_on: paidOn,
      p_method: method, p_reference: reference.trim() || null, p_note: note.trim() || null,
    });
    setSaving(false);
    if (rpcError) { console.error(rpcError); return setError(errorText(rpcError, 'No se pudo registrar el pago.')); }
    onDone();
  };

  return (
    <FormShell title="Registrar pago de un jugador" error={error} saving={saving} submitLabel="Registrar pago" onCancel={onCancel} onSubmit={submit}>
      <div className="grid sm:grid-cols-2 gap-4">
        {!fixedPlayerId && players && (
          <Field label="Jugador">
            {(id) => (
              <select id={id} value={playerId} onChange={(e) => {
                setPlayerId(e.target.value);
                const p = players.find((x) => x.player_id === e.target.value);
                if (p && !amount && p.balance > 0) setAmount(p.overdue || p.balance);
              }} className={fieldClass}>
                <option value="">Elige un jugador</option>
                {players.map((p) => <option key={p.player_id} value={p.player_id}>{p.name}{p.balance > 0 ? ` · debe ${formatCLP(p.balance)}` : ''}</option>)}
              </select>
            )}
          </Field>
        )}
        <Field label="Monto">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} required />}</Field>
        <Field label="Fecha">{(id) => <input id={id} type="date" max={todayCL()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={fieldClass} />}</Field>
        <Field label="Medio">
          {(id) => (
            <select id={id} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={fieldClass}>
              {(['cash', 'transfer', 'other'] as const).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
          )}
        </Field>
        <Field label="N° de operación (opcional)">{(id) => <input id={id} maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} className={fieldClass} />}</Field>
        <Field label="Nota (opcional)">{(id) => <input id={id} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} />}</Field>
      </div>
      <p className="text-xs text-mg-muted">El pago se descuenta primero de lo que vence antes.</p>
    </FormShell>
  );
};

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  equipment: 'Implementos (balones, camisetas)',
  field: 'Cancha',
  referee: 'Arbitraje (pagado aparte)',
  social: 'Tercer tiempo / social',
  other: 'Otro',
};

/** Gasto del equipo (lo pagado a campeonatos se toma solo de Pagos). */
export const ExpenseForm = ({ baseTeamId, onDone, onCancel }: { baseTeamId: string; onDone: () => void; onCancel: () => void }) => {
  const [amount, setAmount] = useState<number | null>(null);
  const [spentOn, setSpentOn] = useState(todayCL());
  const [category, setCategory] = useState<ExpenseCategory>('equipment');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) return setError('Ingresa el monto.');
    if (description.trim().length < 2) return setError('Describe el gasto.');
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('add_treasury_expense', {
      p_base_team_id: baseTeamId, p_amount: amount, p_spent_on: spentOn, p_category: category, p_description: description.trim(),
    });
    setSaving(false);
    if (rpcError) { console.error(rpcError); return setError(errorText(rpcError, 'No se pudo guardar el gasto.')); }
    onDone();
  };

  return (
    <FormShell title="Agregar gasto" error={error} saving={saving} submitLabel="Guardar gasto" onCancel={onCancel} onSubmit={submit}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Monto">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} required />}</Field>
        <Field label="Fecha">{(id) => <input id={id} type="date" max={todayCL()} value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className={fieldClass} />}</Field>
        <Field label="Tipo">
          {(id) => (
            <select id={id} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={fieldClass}>
              {(Object.keys(EXPENSE_LABEL) as ExpenseCategory[]).map((k) => <option key={k} value={k}>{EXPENSE_LABEL[k]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Descripción">{(id) => <input id={id} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />}</Field>
      </div>
      <p className="text-xs text-mg-muted">Lo pagado a los campeonatos no se anota aquí: se suma solo desde Pagos.</p>
    </FormShell>
  );
};
