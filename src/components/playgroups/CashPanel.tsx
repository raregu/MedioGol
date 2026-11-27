import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Loader2, Minus, Paperclip, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PlayCashCategory, PlayCashView } from '../../types/playGroups';
import { prepareImage } from '../../utils/matchSheet';
import { formatCLP, formatDay, todayCL } from '../../utils/money';
import { fmtSession, isMissingFeature, playErrorText } from '../../utils/playGroups';
import { Field, MoneyInput, fieldClass, primaryBtn, secondaryBtn } from '../payments/PaymentsUi';
import { CHIP, PanelProps, card, smallBtn } from './shared';

const LABEL: Record<PlayCashCategory, string> = {
  opening: 'Saldo inicial',
  contribution: 'Aporte',
  fine: 'Multa',
  other_in: 'Otro ingreso',
  balls: 'Pelotas',
  bbq: 'Asado',
  bibs: 'Petos',
  referee: 'Árbitro',
  field: 'Cancha extra',
  other_out: 'Otro gasto',
};
const IN: PlayCashCategory[] = ['contribution', 'fine', 'other_in', 'opening'];
const OUT: PlayCashCategory[] = ['balls', 'bbq', 'bibs', 'referee', 'field', 'other_out'];
const MAX_PDF = 5 * 1024 * 1024;

/** Gasto o ingreso manual (solo organizador). La boleta es opcional. */
const MovementForm = ({ groupId, kind, onDone, onCancel }: { groupId: string; kind: 'in' | 'out'; onDone: () => void; onCancel: () => void }) => {
  const { user } = useAuth();
  const [category, setCategory] = useState<PlayCashCategory>(kind === 'in' ? IN[0] : OUT[0]);
  const [amount, setAmount] = useState<number | null>(null);
  const [day, setDay] = useState(todayCL());
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount) return setError('Ingresa el monto.');
    if (!description.trim()) return setError('Escribe una descripción.');
    setBusy(true);
    setError(null);
    try {
      let path: string | null = null;
      if (file && user) {
        const isPdf = file.type === 'application/pdf';
        if (isPdf && file.size > MAX_PDF) throw new Error('El PDF supera 5 MB.');
        path = `${groupId}/${crypto.randomUUID()}.${isPdf ? 'pdf' : 'jpg'}`;
        const body = isPdf ? file : await prepareImage(file);
        const { error: up } = await supabase.storage.from('play-receipts').upload(path, body, { contentType: isPdf ? 'application/pdf' : 'image/jpeg' });
        if (up) throw new Error('No se pudo subir la boleta.');
      }
      const { error: err } = await supabase.rpc('play_cash_add', {
        p_group: groupId, p_kind: kind, p_category: category, p_amount: amount, p_day: day, p_description: description.trim(), p_receipt_path: path,
      });
      if (err) throw err;
      onDone();
    } catch (err) {
      setError(err instanceof Error && !(err as { code?: string }).code ? err.message : playErrorText(err, 'No pudimos guardar el movimiento.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={card} aria-labelledby="cash-form">
      <h3 id="cash-form" className="font-extrabold">{kind === 'in' ? 'Registrar ingreso' : 'Registrar gasto'}</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría">
          {(id) => (
            <select id={id} className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value as PlayCashCategory)}>
              {(kind === 'in' ? IN : OUT).map((c) => <option key={c} value={c}>{LABEL[c]}</option>)}
            </select>
          )}
        </Field>
        <Field label="Monto">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} required />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha">{(id) => <input id={id} type="date" max={todayCL()} required className={fieldClass} value={day} onChange={(e) => setDay(e.target.value)} />}</Field>
        <Field label="Descripción">{(id) => <input id={id} required maxLength={120} className={fieldClass} placeholder={kind === 'in' ? 'Ej: Aporte de Pin' : 'Ej: 2 pelotas Nike'} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      </div>
      {user && (
        <div className="space-y-1">
          <label className={`${secondaryBtn} cursor-pointer`}>
            <Paperclip className="h-4 w-4" aria-hidden="true" /> {file ? 'Cambiar boleta' : 'Adjuntar boleta (opcional)'}
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {file && <p className="text-sm text-mg-muted truncate">{file.name}</p>}
        </div>
      )}
      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" className={secondaryBtn} onClick={onCancel}>Cancelar</button>
        <button type="submit" className={primaryBtn} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Guardar
        </button>
      </div>
    </form>
  );
};

/**
 * Caja del grupo: saldo, quiénes deben y movimientos (cuotas y cancha de cada semana + gastos e ingresos).
 * La ven todos los del grupo; solo el organizador registra, anula y salda deudas.
 */
export const CashPanel = ({ view, call, token }: PanelProps) => {
  const groupId = view.group.id;
  const [data, setData] = useState<PlayCashView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [form, setForm] = useState<'in' | 'out' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const { user } = useAuth();

  const load = useCallback(async () => {
    const { data: d, error } = await supabase.rpc('play_cash_view', { p_group: groupId, p_token: token });
    if (error) return setState(isMissingFeature(error) ? 'missing' : 'error');
    setData(d as PlayCashView);
    setState('ready');
  }, [groupId, token]);

  // Se recarga cuando cambia la semana (pagos marcados, respuestas)
  useEffect(() => {
    load();
  }, [load, view]);

  if (state === 'loading') return <div className="h-32 rounded-mg-lg bg-mg-surface-2 animate-pulse" role="status" aria-label="Cargando la caja" />;
  if (state === 'missing') return null;
  if (state === 'error' || !data) return <p role="alert" className="text-sm font-bold text-mg-danger">No pudimos cargar la caja del grupo.</p>;

  const admin = data.can_edit;
  const settle = async (memberId: string, name: string, amount: number) => {
    if (!window.confirm(`¿${name} pagó los ${formatCLP(amount)} que debía?`)) return;
    setBusy(memberId);
    const { error } = await call('play_settle_debts', { p_group: groupId, p_member: memberId });
    setBusy(null);
    setNotice(error ? { ok: false, text: playErrorText(error, 'No pudimos marcar el pago.') } : { ok: true, text: `${name} quedó al día.` });
  };
  const voidIt = async (id: string, desc: string) => {
    const reason = window.prompt(`Anular "${desc}". Escribe el motivo:`);
    if (reason == null) return;
    setBusy(id);
    const { error } = await call('play_cash_void', { p_id: id, p_reason: reason });
    setBusy(null);
    setNotice(error ? { ok: false, text: playErrorText(error, 'No pudimos anular el movimiento.') } : { ok: true, text: 'Movimiento anulado.' });
  };
  const openReceipt = async (id: string) => {
    const { data: path, error } = await supabase.rpc('play_cash_receipt', { p_id: id });
    if (error || !path) return setNotice({ ok: false, text: 'No pudimos abrir la boleta.' });
    const { data: signed } = await supabase.storage.from('play-receipts').createSignedUrl(path as string, 120);
    if (signed?.signedUrl) window.open(signed.signedUrl, '_blank', 'noopener');
  };

  // Una sola lista por fecha: semanas (cuotas − cancha) y movimientos manuales
  type Line = { key: string; day: string; title: string; detail: string; amount: number; chip?: { text: string; tone: string }; void?: boolean; id?: string; receipt?: boolean };
  const lines: Line[] = [
    ...data.weeks.map((w) => ({
      key: w.session_id,
      day: w.starts_at,
      title: fmtSession(w.starts_at),
      detail: `${w.paid} de ${w.players} pagaron ${formatCLP(w.collected)} · cancha ${formatCLP(w.cost)}`,
      amount: w.collected - w.cost,
      chip: { text: 'Semana', tone: 'bg-[#e3eefc] text-[#0c447c]' },
    })),
    ...data.movements.map((m) => ({
      key: m.id,
      id: m.id,
      day: `${m.occurred_on}T12:00:00`,
      title: m.description,
      detail: m.status === 'void' ? `Anulado${m.void_reason ? `: ${m.void_reason}` : ''}` : formatDay(m.occurred_on),
      amount: m.kind === 'in' ? m.amount : -m.amount,
      chip: { text: LABEL[m.category], tone: m.kind === 'in' ? 'bg-mg-pitch-tint text-mg-pitch-deep' : 'bg-mg-danger-tint text-mg-danger' },
      void: m.status === 'void',
      receipt: m.has_receipt,
    })),
  ].sort((a, b) => (a.day < b.day ? 1 : -1));

  return (
    <div className="space-y-4">
      <section className={card} aria-labelledby="cash-title">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="cash-title" className="text-lg font-extrabold">Caja del grupo</h2>
          <p className={`mg-num text-3xl font-extrabold ${data.balance < 0 ? 'text-mg-danger' : 'text-mg-ink'}`}>{formatCLP(data.balance)}</p>
        </div>
        <p className="text-xs text-mg-muted">
          Cuotas {formatCLP(data.collected)} − cancha {formatCLP(data.field)}
          {data.manual_in ? ` + ingresos ${formatCLP(data.manual_in)}` : ''}
          {data.manual_out ? ` − gastos ${formatCLP(data.manual_out)}` : ''}
        </p>
        {admin && (
          <div className="flex gap-2">
            <button type="button" className={`${secondaryBtn} flex-1`} onClick={() => setForm('out')}>
              <Minus className="h-4 w-4" aria-hidden="true" /> Gasto
            </button>
            <button type="button" className={`${secondaryBtn} flex-1`} onClick={() => setForm('in')}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Ingreso
            </button>
          </div>
        )}
      </section>

      {form && (
        <MovementForm
          key={form}
          groupId={groupId}
          kind={form}
          onCancel={() => setForm(null)}
          onDone={() => {
            setForm(null);
            setNotice({ ok: true, text: form === 'in' ? 'Ingreso registrado.' : 'Gasto registrado.' });
            load();
          }}
        />
      )}
      {notice && <p role={notice.ok ? 'status' : 'alert'} className={`text-sm font-bold ${notice.ok ? 'text-mg-pitch-deep' : 'text-mg-danger'}`}>{notice.text}</p>}

      {data.debts.length > 0 && (
        <section className={card} aria-labelledby="debts-title">
          <h3 id="debts-title" className="font-extrabold">Deben</h3>
          <ul className="divide-y divide-mg-line">
            {data.debts.map((d) => (
              <li key={d.member_id} className="flex items-center gap-2 min-h-[44px] py-1">
                <span className="flex-1 min-w-0">
                  <span className="font-semibold">{d.name}{d.member_id === view.me ? ' (tú)' : ''}</span>
                  <span className="block text-xs text-mg-muted">{d.count} {d.count === 1 ? 'partido' : 'partidos'} sin pagar</span>
                </span>
                <span className="mg-num font-extrabold text-mg-gold-ink">{formatCLP(d.amount)}</span>
                {admin && (
                  <button type="button" className={smallBtn} disabled={busy === d.member_id} onClick={() => settle(d.member_id, d.name, d.amount)}>
                    Pagó todo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={card} aria-labelledby="moves-title">
        <h3 id="moves-title" className="font-extrabold">Movimientos</h3>
        {lines.length === 0 ? (
          <p className="text-sm text-mg-muted">Todavía no hay movimientos. Las cuotas y la cancha de cada semana aparecen solas cuando empieza el partido.</p>
        ) : (
          <ul className="divide-y divide-mg-line">
            {lines.map((l) => (
              <li key={l.key} className={`flex items-start gap-2 py-2 ${l.void ? 'opacity-60' : ''}`}>
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className={l.void ? 'line-through' : ''}>{l.title}</span>
                    {l.chip && <span className={`${CHIP} ${l.chip.tone}`}>{l.chip.text}</span>}
                  </span>
                  <span className="block text-xs text-mg-muted">{l.detail}</span>
                  {(l.receipt && user) || (admin && l.id && !l.void) ? (
                    <span className="flex gap-3">
                      {l.receipt && user && l.id && (
                        <button type="button" className="min-h-[32px] text-xs font-bold text-mg-pitch-deep inline-flex items-center gap-1" onClick={() => openReceipt(l.id!)}>
                          <Paperclip className="h-3 w-3" aria-hidden="true" /> Boleta
                        </button>
                      )}
                      {admin && l.id && !l.void && (
                        <button type="button" className="min-h-[32px] text-xs font-bold text-mg-danger" disabled={busy === l.id} onClick={() => voidIt(l.id!, l.title)}>
                          Anular
                        </button>
                      )}
                    </span>
                  ) : null}
                </span>
                <span className={`mg-num font-extrabold whitespace-nowrap ${l.amount >= 0 ? 'text-mg-pitch-deep' : 'text-mg-danger'}`}>
                  {l.amount >= 0 ? '+' : '−'}
                  {formatCLP(Math.abs(l.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
