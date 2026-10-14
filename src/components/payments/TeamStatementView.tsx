import { FormEvent, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, FileText, Loader2, Plus, Receipt, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { StatementCharge, StatementPayment, TeamStatement } from '../../types/payments';
import { formatCLP, formatDay } from '../../utils/money';
import { ChargeForm } from './ChargeForm';
import { PaymentForm } from './PaymentForm';
import {
  CONCEPT_LABEL,
  ChargeStateChip,
  METHOD_LABEL,
  PaymentStatusChip,
  Tile,
  dangerLink,
  errorText,
  fieldClass,
  primaryBtn,
  secondaryBtn,
} from './PaymentsUi';

/** Pide un motivo antes de anular o rechazar (queda registrado). */
const ReasonPrompt = ({ label, action, onSubmit, onCancel }: { label: string; action: string; onSubmit: (reason: string) => Promise<void>; onCancel: () => void }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return;
    setBusy(true);
    await onSubmit(reason.trim());
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 mt-2 w-full">
      <label className="flex-1 min-w-[12rem] text-sm font-bold">
        {label}
        <input autoFocus maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className={`${fieldClass} mt-1 font-normal`} />
      </label>
      <button type="button" onClick={onCancel} className={secondaryBtn}>Cancelar</button>
      <button type="submit" disabled={busy || reason.trim().length < 3} className={`${secondaryBtn} !text-mg-danger`}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {action}
      </button>
    </form>
  );
};

interface Props {
  statement: TeamStatement;
  backHref: string;
  onChanged: () => void;
}

type Panel = null | 'payment' | 'charge';

export const TeamStatementView = ({ statement, backHref, onChanged }: Props) => {
  const { team, championship, permissions, settings, totals } = statement;
  const [panel, setPanel] = useState<Panel>(null);
  const [showVoid, setShowVoid] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null); // `${tipo}:${id}`
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const charges = statement.charges.filter((c) => showVoid || c.status === 'active');
  const voidCount = statement.charges.length - statement.charges.filter((c) => c.status === 'active').length
    + statement.payments.filter((p) => p.status === 'void' || p.status === 'rejected').length;
  const pending = statement.payments.filter((p) => p.status === 'pending');
  const payments = statement.payments.filter((p) => p.status !== 'pending' && (showVoid || p.status === 'approved'));

  const run = async (id: string, fn: () => PromiseLike<{ error: unknown }>, fallback: string) => {
    setBusyId(id);
    setError(null);
    const { error: rpcError } = await fn();
    setBusyId(null);
    if (rpcError) {
      console.error(rpcError);
      setError(errorText(rpcError, fallback));
      return;
    }
    setPrompt(null);
    onChanged();
  };

  const openReceipt = async (p: StatementPayment) => {
    if (!p.receipt_path) return;
    // Abrimos la pestaña al hacer clic (si no, el navegador la bloquea) y luego le damos la URL firmada.
    const win = window.open('', '_blank');
    const { data, error: signError } = await supabase.storage.from('payment-receipts').createSignedUrl(p.receipt_path, 300);
    if (signError || !data?.signedUrl) {
      win?.close();
      setError('No se pudo abrir el comprobante.');
      return;
    }
    if (win) win.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  };

  const chargeRow = (c: StatementCharge) => (
    <li key={c.id} className="px-4 py-3 border-b border-mg-line last:border-0">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className={`font-bold ${c.status === 'void' ? 'line-through text-mg-muted' : ''}`}>{c.description}</p>
          <p className="text-xs text-mg-muted">
            {CONCEPT_LABEL[c.concept]} · vence <time dateTime={c.due_date}>{formatDay(c.due_date)}</time>
            {c.automatic ? ' · automático' : ''}
            {c.void_reason ? ` · anulado: ${c.void_reason}` : ''}
          </p>
        </div>
        <div className="text-right flex-none">
          <p className="mg-num text-xl font-extrabold">{formatCLP(c.amount)}</p>
          <ChargeStateChip state={c.state} covered={c.covered} amount={c.amount} />
        </div>
      </div>
      {permissions.manage && c.status === 'active' && (
        prompt === `charge:${c.id}` ? (
          <ReasonPrompt
            label="Motivo de la anulación"
            action="Anular cargo"
            onCancel={() => setPrompt(null)}
            onSubmit={(reason) => run(c.id, () => supabase.rpc('void_team_charge', { p_charge_id: c.id, p_reason: reason }), 'No se pudo anular el cargo.')}
          />
        ) : (
          <button type="button" onClick={() => setPrompt(`charge:${c.id}`)} className={dangerLink}>Anular</button>
        )
      )}
    </li>
  );

  const paymentRow = (p: StatementPayment, review = false) => (
    <li key={p.id} className="px-4 py-3 border-b border-mg-line last:border-0">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold">
            {METHOD_LABEL[p.method]}
            {p.reference ? ` · ${p.reference}` : ''}
          </p>
          <p className="text-xs text-mg-muted">
            Pagado el <time dateTime={p.paid_on}>{formatDay(p.paid_on)}</time>
            {p.note ? ` · ${p.note}` : ''}
            {p.review_note ? ` · ${p.status === 'rejected' ? 'motivo' : 'nota'}: ${p.review_note}` : ''}
          </p>
        </div>
        <div className="text-right flex-none">
          <p className={`mg-num text-xl font-extrabold ${p.status === 'void' || p.status === 'rejected' ? 'line-through text-mg-muted' : ''}`}>{formatCLP(p.amount)}</p>
          <PaymentStatusChip status={p.status} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {p.receipt_path && (
          <button type="button" onClick={() => openReceipt(p)} className="inline-flex items-center gap-1 min-h-[44px] px-2 text-sm font-bold text-mg-pitch">
            <FileText className="h-4 w-4" aria-hidden="true" /> Ver comprobante
          </button>
        )}
        {review && permissions.collect && prompt !== `reject:${p.id}` && (
          <>
            <button
              type="button"
              disabled={busyId === p.id}
              onClick={() => run(p.id, () => supabase.rpc('review_team_payment', { p_payment_id: p.id, p_approve: true, p_note: null }), 'No se pudo aprobar.')}
              className={`${primaryBtn} !min-h-[40px]`}
            >
              <Check className="h-4 w-4" aria-hidden="true" /> Aprobar
            </button>
            <button type="button" onClick={() => setPrompt(`reject:${p.id}`)} className={dangerLink}>
              <X className="h-4 w-4" aria-hidden="true" /> Rechazar
            </button>
          </>
        )}
        {permissions.manage && p.status === 'approved' && prompt !== `pay:${p.id}` && (
          <button type="button" onClick={() => setPrompt(`pay:${p.id}`)} className={dangerLink}>Anular</button>
        )}
      </div>
      {prompt === `reject:${p.id}` && (
        <ReasonPrompt
          label="¿Por qué se rechaza? (lo verá el capitán)"
          action="Rechazar"
          onCancel={() => setPrompt(null)}
          onSubmit={(reason) => run(p.id, () => supabase.rpc('review_team_payment', { p_payment_id: p.id, p_approve: false, p_note: reason }), 'No se pudo rechazar.')}
        />
      )}
      {prompt === `pay:${p.id}` && (
        <ReasonPrompt
          label="Motivo de la anulación"
          action="Anular pago"
          onCancel={() => setPrompt(null)}
          onSubmit={(reason) => run(p.id, () => supabase.rpc('void_team_payment', { p_payment_id: p.id, p_reason: reason }), 'No se pudo anular el pago.')}
        />
      )}
    </li>
  );

  return (
    <div className="space-y-6">
      <header className="bg-mg-navy text-mg-on-navy rounded-mg-lg p-5 sm:p-6">
        <a href={backHref} className="inline-flex items-center gap-1 text-sm font-bold text-mg-on-navy-muted hover:text-mg-on-navy min-h-[44px]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {permissions.collect ? 'Pagos del campeonato' : 'Mis equipos'}
        </a>
        <p className="mg-label text-mg-on-navy-muted">{championship.name} · Estado de cuenta</p>
        <h1 className="font-display text-[34px] leading-9 font-extrabold uppercase">{team.name}</h1>
      </header>

      <section aria-label="Resumen" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Saldo por pagar" value={formatCLP(Math.max(0, totals.balance))} hint={totals.balance < 0 ? `A favor: ${formatCLP(-totals.balance)}` : undefined} />
        <Tile label="Vencido" value={formatCLP(totals.overdue)} tone={totals.overdue > 0 ? 'danger' : 'good'} />
        <Tile label="Pagado" value={formatCLP(totals.paid)} />
      </section>

      {totals.overdue > 0 && (
        <div role="status" className="flex gap-3 items-start bg-mg-danger-tint border border-[#f3c4bf] rounded-mg-md px-4 py-3 text-sm">
          <AlertTriangle className="h-5 w-5 flex-none text-mg-danger" aria-hidden="true" />
          <p><strong>{formatCLP(totals.overdue)} vencidos.</strong> {permissions.captain && !permissions.collect ? 'Regulariza con el campeonato para evitar problemas.' : 'El equipo aparece como moroso (solo aviso, no bloquea nada).'}</p>
        </div>
      )}

      {settings?.payment_instructions && (
        <section aria-labelledby="howto-title" className="bg-mg-surface border border-mg-line rounded-mg-lg p-5">
          <h2 id="howto-title" className="mg-label text-mg-muted">Cómo pagar</h2>
          <p className="mt-2 whitespace-pre-line break-words">{settings.payment_instructions}</p>
        </section>
      )}

      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}

      {panel === null && (
        <div className="flex flex-wrap gap-3">
          {permissions.collect && (
            <button type="button" onClick={() => setPanel('payment')} className={primaryBtn}>
              <Receipt className="h-4 w-4" aria-hidden="true" /> Registrar pago
            </button>
          )}
          {!permissions.collect && permissions.captain && (
            <button type="button" onClick={() => setPanel('payment')} className={primaryBtn}>
              <Receipt className="h-4 w-4" aria-hidden="true" /> Informar un pago
            </button>
          )}
          {permissions.manage && (
            <button type="button" onClick={() => setPanel('charge')} className={secondaryBtn}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Agregar cargo (W.O., garantía…)
            </button>
          )}
        </div>
      )}
      {panel === 'payment' && (
        <PaymentForm
          championshipId={championship.id}
          teamId={team.id}
          asStaff={permissions.collect}
          suggestedAmount={totals.overdue || undefined}
          onCancel={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            onChanged();
          }}
        />
      )}
      {panel === 'charge' && (
        <ChargeForm
          teamId={team.id}
          walkoverFine={settings?.walkover_fine ?? 0}
          onCancel={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            onChanged();
          }}
        />
      )}

      {pending.length > 0 && (
        <section aria-labelledby="pending-title" className="bg-[#fff4d6] border border-[#e0b84a] rounded-mg-lg overflow-hidden">
          <h2 id="pending-title" className="px-4 py-3 font-extrabold border-b border-[#e0b84a]">
            {permissions.collect ? `Comprobantes por revisar (${pending.length})` : `Pagos informados por revisar (${pending.length})`}
          </h2>
          <ul className="bg-mg-surface">{pending.map((p) => paymentRow(p, true))}</ul>
        </section>
      )}

      <section aria-labelledby="charges-title" className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-mg-line">
          <h2 id="charges-title" className="flex-1 font-extrabold">Cargos</h2>
          {voidCount > 0 && (
            <label className="inline-flex items-center gap-2 text-sm text-mg-muted min-h-[44px]">
              <input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} /> Ver anulados y rechazados
            </label>
          )}
        </div>
        {charges.length === 0 ? (
          <p className="px-4 py-8 text-center text-mg-muted">Aún no hay cargos para este equipo.</p>
        ) : (
          <ul>{charges.map(chargeRow)}</ul>
        )}
      </section>

      <section aria-labelledby="payments-title" className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
        <h2 id="payments-title" className="px-4 py-3 border-b border-mg-line font-extrabold">Pagos</h2>
        {payments.length === 0 ? (
          <p className="px-4 py-8 text-center text-mg-muted">Aún no hay pagos registrados.</p>
        ) : (
          <ul>{payments.map((p) => paymentRow(p))}</ul>
        )}
        <p className="px-4 py-3 text-xs text-mg-muted border-t border-mg-line">
          Los pagos cubren primero lo que vence antes. Este estado de cuenta es interno del campeonato; no es una boleta.
        </p>
      </section>
    </div>
  );
};
