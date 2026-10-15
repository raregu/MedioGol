import { useState } from 'react';
import { AlertTriangle, ArrowLeft, MessageCircle, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TreasuryStatement } from '../../types/treasury';
import { formatCLP, formatDay } from '../../utils/money';
import { ChargeStateChip, METHOD_LABEL, Tile, dangerLink, errorText, primaryBtn, secondaryBtn } from '../payments/PaymentsUi';
import { ReasonPrompt } from '../payments/TeamStatementView';
import { TreasuryPaymentForm } from './TreasuryForms';
import { whatsappReminder } from './whatsapp';

/** Estado de cuenta de un jugador con su equipo (lo ve el propio jugador o la tesorería). */
export const PlayerStatementView = ({ data, onChanged }: { data: TreasuryStatement; onChanged: () => void }) => {
  const { team, player, totals, manage } = data;
  const [paying, setPaying] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showVoid, setShowVoid] = useState(false);

  const charges = data.charges.filter((c) => showVoid || c.status === 'active');
  const payments = data.payments.filter((p) => showVoid || p.status === 'approved');
  const hasVoid = data.charges.some((c) => c.status === 'void') || data.payments.some((p) => p.status === 'void');

  const run = async (call: () => PromiseLike<{ error: unknown }>, fallback: string) => {
    setError(null);
    const { error: rpcError } = await call();
    if (rpcError) { console.error(rpcError); setError(errorText(rpcError, fallback)); return; }
    setPrompt(null);
    onChanged();
  };

  return (
    <div className="space-y-6">
      <header className="bg-mg-navy text-mg-on-navy rounded-mg-lg p-5 sm:p-6">
        <a href={manage ? `/tesoreria?team=${team.id}` : '/my-teams'}
          className="inline-flex items-center gap-1 text-sm font-bold text-mg-on-navy-muted hover:text-mg-on-navy min-h-[44px]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {manage ? 'Tesorería del equipo' : 'Mis equipos'}
        </a>
        <p className="mg-label text-mg-on-navy-muted">{team.name} · {data.is_self ? 'Mis cuotas' : 'Cuotas del jugador'}</p>
        <h1 className="font-display text-[34px] leading-9 font-extrabold uppercase">{player.name}</h1>
      </header>

      <section aria-label="Resumen" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile label="Saldo por pagar" value={formatCLP(Math.max(0, totals.balance))} hint={totals.balance < 0 ? `A favor: ${formatCLP(-totals.balance)}` : undefined} />
        <Tile label="Vencido" value={formatCLP(totals.overdue)} tone={totals.overdue > 0 ? 'danger' : 'good'} />
        <Tile label="Pagado" value={formatCLP(totals.paid)} />
      </section>

      {totals.overdue > 0 && (
        <div role="status" className="flex gap-3 items-start bg-mg-danger-tint border border-[#f3c4bf] rounded-mg-md px-4 py-3 text-sm">
          <AlertTriangle className="h-5 w-5 flex-none text-mg-danger" aria-hidden="true" />
          <p><strong>{formatCLP(totals.overdue)} vencidos.</strong> {data.is_self ? 'Paga al tesorero o al capitán del equipo.' : ''}</p>
        </div>
      )}

      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}

      {manage && !paying && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setPaying(true)} className={primaryBtn}><Receipt className="h-4 w-4" aria-hidden="true" /> Registrar pago</button>
          {totals.balance > 0 && !data.is_self && (
            <a href={whatsappReminder(team.name, player.name, totals.balance, totals.overdue)} target="_blank" rel="noreferrer" className={secondaryBtn}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Recordar por WhatsApp
            </a>
          )}
        </div>
      )}
      {paying && (
        <TreasuryPaymentForm baseTeamId={team.id} fixedPlayerId={player.id} suggested={totals.overdue || undefined}
          onCancel={() => setPaying(false)} onDone={() => { setPaying(false); onChanged(); }} />
      )}

      <section aria-labelledby="t-charges" className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-mg-line">
          <h2 id="t-charges" className="flex-1 font-extrabold">Cuotas y cobros</h2>
          {hasVoid && (
            <label className="inline-flex items-center gap-2 text-sm text-mg-muted min-h-[44px]">
              <input type="checkbox" checked={showVoid} onChange={(e) => setShowVoid(e.target.checked)} /> Ver anulados
            </label>
          )}
        </div>
        {charges.length === 0 ? (
          <p className="px-4 py-8 text-center text-mg-muted">No hay cobros.</p>
        ) : (
          <ul>
            {charges.map((c) => (
              <li key={c.id} className="px-4 py-3 border-b border-mg-line last:border-0">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold ${c.status === 'void' ? 'line-through text-mg-muted' : ''}`}>
                      {c.title}{c.installments > 1 ? ` · cuota ${c.installment}/${c.installments}` : ''}
                    </p>
                    <p className="text-xs text-mg-muted">
                      Vence <time dateTime={c.due_date}>{formatDay(c.due_date)}</time>{c.championship ? ` · ${c.championship}` : ''}{c.void_reason ? ` · anulado: ${c.void_reason}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-none">
                    <p className="mg-num text-xl font-extrabold">{formatCLP(c.amount)}</p>
                    <ChargeStateChip state={c.state} covered={c.covered} amount={c.amount} />
                  </div>
                </div>
                {manage && c.status === 'active' && (prompt === `c:${c.id}` ? (
                  <ReasonPrompt label="Motivo de la anulación" action="Anular cuota" onCancel={() => setPrompt(null)}
                    onSubmit={(reason) => run(() => supabase.rpc('void_treasury_charge', { p_charge_id: c.id, p_reason: reason, p_whole_batch: false }), 'No se pudo anular.')} />
                ) : (
                  <button type="button" onClick={() => setPrompt(`c:${c.id}`)} className={dangerLink}>Anular</button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="t-payments" className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
        <h2 id="t-payments" className="px-4 py-3 border-b border-mg-line font-extrabold">Pagos</h2>
        {payments.length === 0 ? (
          <p className="px-4 py-8 text-center text-mg-muted">Aún no hay pagos registrados.</p>
        ) : (
          <ul>
            {payments.map((p) => (
              <li key={p.id} className="px-4 py-3 border-b border-mg-line last:border-0">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold">{METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ''}</p>
                    <p className="text-xs text-mg-muted">{formatDay(p.paid_on)}{p.note ? ` · ${p.note}` : ''}{p.void_reason ? ` · anulado: ${p.void_reason}` : ''}</p>
                  </div>
                  <p className={`mg-num text-xl font-extrabold ${p.status === 'void' ? 'line-through text-mg-muted' : ''}`}>{formatCLP(p.amount)}</p>
                </div>
                {manage && p.status === 'approved' && (prompt === `p:${p.id}` ? (
                  <ReasonPrompt label="Motivo de la anulación" action="Anular pago" onCancel={() => setPrompt(null)}
                    onSubmit={(reason) => run(() => supabase.rpc('void_treasury_payment', { p_payment_id: p.id, p_reason: reason }), 'No se pudo anular.')} />
                ) : (
                  <button type="button" onClick={() => setPrompt(`p:${p.id}`)} className={dangerLink}>Anular</button>
                ))}
              </li>
            ))}
          </ul>
        )}
        <p className="px-4 py-3 text-xs text-mg-muted border-t border-mg-line">Los pagos cubren primero lo que vence antes. Registro interno del equipo; no es una boleta.</p>
      </section>
    </div>
  );
};
