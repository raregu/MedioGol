import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Download, Search } from 'lucide-react';
import { FeeSettings, TeamBalance } from '../../types/payments';
import { downloadCsv, formatCLP, formatDay } from '../../utils/money';
import { FeeSettingsForm } from './FeeSettingsForm';
import { Tile, fieldClass, secondaryBtn } from './PaymentsUi';

interface Props {
  championship: { id: string; name: string; league_id?: string | null };
  canManage: boolean;
  balances: TeamBalance[];
  settings: FeeSettings | null;
  onChanged: () => void;
}

type Tab = 'teams' | 'settings';

export const ChampionshipPaymentsView = ({ championship, canManage, balances, settings, onChanged }: Props) => {
  const [tab, setTab] = useState<Tab>(!settings && canManage ? 'settings' : 'teams');
  const [query, setQuery] = useState('');

  const totals = useMemo(
    () =>
      balances.reduce(
        (acc, b) => ({
          toCollect: acc.toCollect + Math.max(0, b.balance),
          overdue: acc.overdue + b.overdue,
          paid: acc.paid + b.paid,
          review: acc.review + b.pending_review,
          debtors: acc.debtors + (b.overdue > 0 ? 1 : 0),
        }),
        { toCollect: 0, overdue: 0, paid: 0, review: 0, debtors: 0 }
      ),
    [balances]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? balances.filter((b) => b.team_name.toLowerCase().includes(q)) : balances;
  }, [balances, query]);

  const teamHref = (id: string) => `/pagos?team=${id}`;

  const exportCsv = () =>
    downloadCsv(`pagos-${championship.name}.csv`, [
      ['Equipo', 'Cargado', 'Pagado', 'Saldo', 'Vencido', 'Comprobantes por revisar', 'Último pago'],
      ...balances.map((b) => [b.team_name, b.charged, b.paid, b.balance, b.overdue, b.pending_review, b.last_payment_on ?? '']),
    ]);

  return (
    <div className="space-y-6">
      <header className="bg-mg-navy text-mg-on-navy rounded-mg-lg p-5 sm:p-6">
        <div className="flex flex-wrap gap-x-5">
          <a href={`/championship/${championship.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-mg-on-navy-muted hover:text-mg-on-navy min-h-[44px]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver al campeonato
          </a>
          {championship.league_id && canManage && (
            <a href={`/pagos?league=${championship.league_id}`} className="inline-flex items-center gap-1 text-sm font-bold text-mg-on-navy-muted hover:text-mg-on-navy min-h-[44px]">
              Pagos de toda la liga
            </a>
          )}
        </div>
        <p className="mg-label text-mg-on-navy-muted">{championship.name}</p>
        <h1 className="font-display text-[34px] leading-9 font-extrabold uppercase">Pagos</h1>
      </header>

      {canManage && (
        <div role="tablist" aria-label="Secciones de pagos" className="flex gap-2">
          {([
            ['teams', 'Equipos'],
            ['settings', 'Configurar cobros'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`min-h-[44px] px-4 rounded-mg-md font-extrabold text-sm ${tab === key ? 'bg-mg-pitch text-mg-on-pitch' : 'bg-mg-surface border border-mg-line text-mg-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'settings' && canManage ? (
        <FeeSettingsForm championshipId={championship.id} initial={settings} leagueId={championship.league_id} onSaved={onChanged} />
      ) : (
        <>
          {!settings && (
            <p role="status" className="bg-[#fff4d6] border border-[#e0b84a] rounded-mg-md px-4 py-3 text-sm">
              Este campeonato aún no tiene cobros configurados.{canManage ? ' Configúralos en "Configurar cobros" y se generarán los cargos.' : ''}
            </p>
          )}

          <section aria-label="Resumen" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Por cobrar" value={formatCLP(totals.toCollect)} />
            <Tile label="Vencido" value={formatCLP(totals.overdue)} tone={totals.overdue > 0 ? 'danger' : 'good'} hint={`${totals.debtors} ${totals.debtors === 1 ? 'equipo moroso' : 'equipos morosos'}`} />
            <Tile label="Cobrado" value={formatCLP(totals.paid)} />
            <Tile label="Por revisar" value={String(totals.review)} tone={totals.review > 0 ? 'warn' : 'default'} hint="Comprobantes de capitanes" />
          </section>

          <section aria-labelledby="balances-title" className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-mg-line">
              <h2 id="balances-title" className="flex-1 font-extrabold">Equipos ({balances.length})</h2>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-mg-muted" aria-hidden="true" />
                <input type="search" aria-label="Buscar equipo" placeholder="Buscar equipo" value={query} onChange={(e) => setQuery(e.target.value)} className={`${fieldClass} pl-9`} />
              </div>
              <button type="button" onClick={exportCsv} disabled={!balances.length} className={secondaryBtn}>
                <Download className="h-4 w-4" aria-hidden="true" /> Excel
              </button>
            </div>
            {shown.length === 0 ? (
              <p className="px-4 py-8 text-center text-mg-muted">{balances.length ? 'Ningún equipo coincide con la búsqueda.' : 'Este campeonato no tiene equipos.'}</p>
            ) : (
              <ul>
                {shown.map((b) => (
                  <li key={b.team_id} className="border-b border-mg-line last:border-0">
                    <a href={teamHref(b.team_id)} className="flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-mg-surface-2">
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold truncate">{b.team_name}</span>
                        <span className="block text-xs text-mg-muted">
                          Pagado {formatCLP(b.paid)}
                          {b.last_payment_on ? ` · último pago ${formatDay(b.last_payment_on)}` : ''}
                          {b.pending_review > 0 ? ` · ${b.pending_review} por revisar` : ''}
                        </span>
                      </span>
                      <span className="text-right flex-none">
                        <span className="block mg-num text-xl font-extrabold">{formatCLP(Math.max(0, b.balance))}</span>
                        {b.overdue > 0 ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-mg-danger-tint text-mg-danger">Vencido {formatCLP(b.overdue)}</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-mg-pitch-tint text-mg-pitch-deep">Al día</span>
                        )}
                      </span>
                      <ChevronRight className="h-5 w-5 text-mg-muted flex-none" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};
