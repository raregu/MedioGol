import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Download, MessageCircle, Plus, Receipt, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { TreasuryOverview } from '../../types/treasury';
import { downloadCsv, formatCLP, formatDay } from '../../utils/money';
import { Tile, dangerLink, errorText, fieldClass, primaryBtn, secondaryBtn } from '../payments/PaymentsUi';
import { ReasonPrompt } from '../payments/TeamStatementView';
import { EXPENSE_LABEL, ExpenseForm, NewChargeForm, TreasuryPaymentForm } from './TreasuryForms';
import { whatsappReminder } from './whatsapp';

type Tab = 'players' | 'charges' | 'cash' | 'treasurers';
type Panel = null | 'charge' | 'payment' | 'expense';

const ROLE_LABEL: Record<string, string> = { owner: 'Dueño del equipo', captain: 'Capitán', treasurer: 'Tesorero' };

export const TreasuryPanel = ({ data, onChanged }: { data: TreasuryOverview; onChanged: () => void }) => {
  const { team, totals, cash } = data;
  const [tab, setTab] = useState<Tab>('players');
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canAppoint = data.role === 'owner' || data.role === 'captain';
  const cashBalance = cash.collected - cash.championships - cash.expenses;

  const players = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? data.players.filter((p) => p.name.toLowerCase().includes(q)) : data.players;
  }, [data.players, query]);

  const run = async (id: string, call: () => PromiseLike<{ error: unknown }>, fallback: string) => {
    setBusy(id);
    setError(null);
    const { error: rpcError } = await call();
    setBusy(null);
    if (rpcError) { console.error(rpcError); setError(errorText(rpcError, fallback)); return; }
    setPrompt(null);
    onChanged();
  };

  const done = () => { setPanel(null); onChanged(); };
  const playerHref = (id: string) => `/tesoreria?team=${team.id}&player=${id}`;

  const exportCsv = () =>
    downloadCsv(`tesoreria-${team.name}.csv`, [
      ['Jugador', 'Cobrado', 'Pagado', 'Saldo', 'Vencido', 'Último pago'],
      ...data.players.map((p) => [p.name, p.charged, p.paid, p.balance, p.overdue, p.last_paid ?? '']),
    ]);

  return (
    <div className="space-y-6">
      <header className="bg-mg-navy text-mg-on-navy rounded-mg-lg p-5 sm:p-6">
        <a href="/my-teams" className="inline-flex items-center gap-1 text-sm font-bold text-mg-on-navy-muted hover:text-mg-on-navy min-h-[44px]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Mis equipos
        </a>
        <p className="mg-label text-mg-on-navy-muted">Tesorería interna · {ROLE_LABEL[data.role] ?? ''}</p>
        <h1 className="font-display text-[34px] leading-9 font-extrabold uppercase">{team.name}</h1>
        <p className="text-sm text-mg-on-navy-muted mt-1">Solo la ven el dueño, el capitán y los tesoreros. Cada jugador ve solo lo suyo.</p>
      </header>

      <section aria-label="Resumen" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Por cobrar" value={formatCLP(totals.to_collect)} />
        <Tile label="Vencido" value={formatCLP(totals.overdue)} tone={totals.overdue > 0 ? 'danger' : 'good'} hint={`${totals.debtors} ${totals.debtors === 1 ? 'jugador atrasado' : 'jugadores atrasados'}`} />
        <Tile label="Recaudado" value={formatCLP(totals.collected)} />
        <Tile label="Caja" value={formatCLP(cashBalance)} tone={cashBalance < 0 ? 'danger' : 'default'} hint="Recaudado − campeonatos − gastos" />
      </section>

      <div role="tablist" aria-label="Secciones de la tesorería" className="flex flex-wrap gap-2">
        {([['players', 'Jugadores'], ['charges', 'Cobros'], ['cash', 'Caja'], ['treasurers', 'Tesoreros']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setPanel(null); }}
            className={`min-h-[44px] px-4 rounded-mg-md font-extrabold text-sm ${tab === k ? 'bg-mg-pitch text-mg-on-pitch' : 'bg-mg-surface border border-mg-line text-mg-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}

      {(tab === 'players' || tab === 'charges') && panel === null && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setPanel('payment')} className={primaryBtn}><Receipt className="h-4 w-4" aria-hidden="true" /> Registrar pago</button>
          <button type="button" onClick={() => setPanel('charge')} className={secondaryBtn}><Plus className="h-4 w-4" aria-hidden="true" /> Nuevo cobro</button>
        </div>
      )}
      {panel === 'payment' && <TreasuryPaymentForm baseTeamId={team.id} players={data.players} onDone={done} onCancel={() => setPanel(null)} />}
      {panel === 'charge' && <NewChargeForm baseTeamId={team.id} players={data.players} championships={data.championships} onDone={done} onCancel={() => setPanel(null)} />}

      {tab === 'players' && (
        <section aria-labelledby="players-title" className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-mg-line">
            <h2 id="players-title" className="flex-1 font-extrabold">Jugadores ({data.players.length})</h2>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-mg-muted" aria-hidden="true" />
              <input type="search" aria-label="Buscar jugador" placeholder="Buscar jugador" value={query} onChange={(e) => setQuery(e.target.value)} className={`${fieldClass} pl-9`} />
            </div>
            <button type="button" onClick={exportCsv} disabled={!data.players.length} className={secondaryBtn}><Download className="h-4 w-4" aria-hidden="true" /> Excel</button>
          </div>
          {players.length === 0 ? (
            <p className="px-4 py-8 text-center text-mg-muted">{data.players.length ? 'Ningún jugador coincide.' : 'El plantel está vacío. Agrega jugadores en Mis equipos.'}</p>
          ) : (
            <ul>
              {players.map((p) => (
                <li key={p.player_id} className="flex items-center gap-2 border-b border-mg-line last:border-0 pr-2">
                  <a href={playerHref(p.player_id)} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-mg-surface-2">
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold truncate">{p.name}{!p.active && <span className="text-mg-muted font-normal"> · ya no está</span>}</span>
                      <span className="block text-xs text-mg-muted">
                        Pagó {formatCLP(p.paid)}{p.last_paid ? ` · último pago ${formatDay(p.last_paid)}` : ''}{p.treasurer ? ' · tesorero' : ''}
                      </span>
                    </span>
                    <span className="text-right flex-none">
                      <span className="block mg-num text-xl font-extrabold">{formatCLP(Math.max(0, p.balance))}</span>
                      {p.overdue > 0 ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-mg-danger-tint text-mg-danger">Vencido {formatCLP(p.overdue)}</span>
                      ) : p.charged > 0 ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-mg-pitch-tint text-mg-pitch-deep">Al día</span>
                      ) : null}
                    </span>
                    <ChevronRight className="h-5 w-5 text-mg-muted flex-none" aria-hidden="true" />
                  </a>
                  {p.balance > 0 && (
                    <a href={whatsappReminder(team.name, p.name, p.balance, p.overdue)} target="_blank" rel="noreferrer"
                      aria-label={`Recordar por WhatsApp a ${p.name}`} title="Recordar por WhatsApp"
                      className="inline-flex items-center justify-center h-11 w-11 rounded-mg-md border border-mg-line text-mg-pitch hover:bg-mg-pitch-tint flex-none">
                      <MessageCircle className="h-5 w-5" aria-hidden="true" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'charges' && (
        <section aria-labelledby="batches-title" className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
          <h2 id="batches-title" className="px-4 py-3 border-b border-mg-line font-extrabold">Cobros creados</h2>
          {data.batches.length === 0 ? (
            <p className="px-4 py-8 text-center text-mg-muted">Aún no hay cobros. Crea la cuota de la temporada con "Nuevo cobro".</p>
          ) : (
            <ul>
              {data.batches.map((b) => (
                <li key={b.batch_id} className="px-4 py-3 border-b border-mg-line last:border-0">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold ${b.active ? '' : 'line-through text-mg-muted'}`}>{b.title}</p>
                      <p className="text-xs text-mg-muted">
                        {formatCLP(b.per_player)} por jugador{b.installments > 1 ? ` en ${b.installments} cuotas` : ''} · desde {formatDay(b.first_due)}
                        {b.championship ? ` · ${b.championship}` : ''}{b.active ? ` · ${b.players} ${b.players === 1 ? 'jugador' : 'jugadores'}` : ' · anulado'}
                      </p>
                    </div>
                    <p className="mg-num text-xl font-extrabold flex-none">{formatCLP(b.total)}</p>
                  </div>
                  {b.active && (prompt === `batch:${b.batch_id}` ? (
                    <ReasonPrompt label="Motivo (se anula para todos los jugadores)" action="Anular cobro" onCancel={() => setPrompt(null)}
                      onSubmit={(reason) => run(b.batch_id, () => supabase.rpc('void_treasury_charge', { p_charge_id: b.any_charge_id, p_reason: reason, p_whole_batch: true }), 'No se pudo anular.')} />
                  ) : (
                    <button type="button" disabled={busy === b.batch_id} onClick={() => setPrompt(`batch:${b.batch_id}`)} className={dangerLink}>Anular para todos</button>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'cash' && (
        <>
          <section aria-label="Caja" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Recaudado" value={formatCLP(cash.collected)} hint="Pagos de jugadores" />
            <Tile label="Pagado a campeonatos" value={formatCLP(cash.championships)} hint="Desde Pagos del campeonato" />
            <Tile label="Otros gastos" value={formatCLP(cash.expenses)} />
            <Tile label="Saldo en caja" value={formatCLP(cashBalance)} tone={cashBalance < 0 ? 'danger' : 'good'} />
          </section>
          {panel === 'expense' ? (
            <ExpenseForm baseTeamId={team.id} onDone={done} onCancel={() => setPanel(null)} />
          ) : (
            <button type="button" onClick={() => setPanel('expense')} className={secondaryBtn}><Plus className="h-4 w-4" aria-hidden="true" /> Agregar gasto</button>
          )}
          <section aria-labelledby="moves-title" className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
            <h2 id="moves-title" className="px-4 py-3 border-b border-mg-line font-extrabold">Salidas de caja</h2>
            {data.expenses.length + data.championship_payments.length === 0 ? (
              <p className="px-4 py-8 text-center text-mg-muted">Sin gastos registrados.</p>
            ) : (
              <ul>
                {data.championship_payments.map((cp) => (
                  <li key={cp.id} className="px-4 py-3 border-b border-mg-line flex items-start gap-3">
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold">Pago al campeonato</span>
                      <span className="block text-xs text-mg-muted">{cp.championship} · {formatDay(cp.paid_on)} · <a className="underline" href={`/pagos?team=${cp.team_id}`}>ver estado de cuenta</a></span>
                    </span>
                    <span className="mg-num text-xl font-extrabold">{formatCLP(cp.amount)}</span>
                  </li>
                ))}
                {data.expenses.map((e) => (
                  <li key={e.id} className="px-4 py-3 border-b border-mg-line last:border-0">
                    <div className="flex items-start gap-3">
                      <span className="flex-1 min-w-0">
                        <span className={`block font-bold ${e.status === 'void' ? 'line-through text-mg-muted' : ''}`}>{e.description}</span>
                        <span className="block text-xs text-mg-muted">{EXPENSE_LABEL[e.category]} · {formatDay(e.spent_on)}{e.void_reason ? ` · anulado: ${e.void_reason}` : ''}</span>
                      </span>
                      <span className={`mg-num text-xl font-extrabold ${e.status === 'void' ? 'line-through text-mg-muted' : ''}`}>{formatCLP(e.amount)}</span>
                    </div>
                    {e.status === 'active' && (prompt === `exp:${e.id}` ? (
                      <ReasonPrompt label="Motivo de la anulación" action="Anular gasto" onCancel={() => setPrompt(null)}
                        onSubmit={(reason) => run(e.id, () => supabase.rpc('void_treasury_expense', { p_expense_id: e.id, p_reason: reason }), 'No se pudo anular.')} />
                    ) : (
                      <button type="button" onClick={() => setPrompt(`exp:${e.id}`)} className={dangerLink}>Anular</button>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {tab === 'treasurers' && (
        <section aria-labelledby="treasurers-title" className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-mg-line">
            <h2 id="treasurers-title" className="font-extrabold">Tesoreros</h2>
            <p className="text-sm text-mg-muted">
              {canAppoint
                ? 'Un tesorero puede ser cualquier jugador del plantel. Puede cobrar, registrar pagos y gastos, pero no nombrar a otros tesoreros.'
                : 'Solo el dueño o el capitán pueden nombrar tesoreros.'}
            </p>
          </div>
          <ul>
            {data.players.filter((p) => p.active).map((p) => (
              <li key={p.player_id} className="border-b border-mg-line last:border-0">
                <label className={`flex items-center gap-3 px-4 min-h-[52px] ${canAppoint ? 'cursor-pointer' : ''}`}>
                  <input type="checkbox" className="h-5 w-5 accent-[var(--mg-pitch)]" checked={p.treasurer} disabled={!canAppoint || busy === p.player_id}
                    onChange={(e) => run(p.player_id, () => supabase.rpc('set_team_treasurer', { p_base_team_id: team.id, p_player_id: p.player_id, p_enabled: e.target.checked }), 'No se pudo actualizar.')} />
                  <span className="flex-1 font-bold">{p.name}</span>
                  {p.role === 'captain' && <span className="text-xs text-mg-muted">Capitán</span>}
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
