import { useMemo } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { LeagueSeriesPayment } from '../../types/payments';
import { formatCLP } from '../../utils/money';
import { Tile } from './PaymentsUi';

interface Props {
  league: { id: string; name: string };
  series: LeagueSeriesPayment[];
}

/** Resumen de cobros de la liga: una tarjeta por serie, cada una lleva a su panel. */
export const LeaguePaymentsView = ({ league, series }: Props) => {
  const totals = useMemo(
    () =>
      series.reduce(
        (a, s) => ({
          toCollect: a.toCollect + s.to_collect,
          overdue: a.overdue + s.overdue,
          paid: a.paid + s.paid,
          review: a.review + s.pending_review,
          debtors: a.debtors + s.debtors,
        }),
        { toCollect: 0, overdue: 0, paid: 0, review: 0, debtors: 0 }
      ),
    [series]
  );
  const unconfigured = series.filter((s) => !s.configured).length;

  return (
    <div className="space-y-6">
      <header className="bg-mg-navy text-mg-on-navy rounded-mg-lg p-5 sm:p-6">
        <a href={`/league/${league.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-mg-on-navy-muted hover:text-mg-on-navy min-h-[44px]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a la liga
        </a>
        <p className="mg-label text-mg-on-navy-muted">{league.name}</p>
        <h1 className="font-display text-[34px] leading-9 font-extrabold uppercase">Pagos de la liga</h1>
      </header>

      {unconfigured > 0 && (
        <p role="status" className="bg-[#fff4d6] border border-[#e0b84a] rounded-mg-md px-4 py-3 text-sm">
          {unconfigured === series.length
            ? 'Aún no hay cobros configurados. Entra a una serie, configura sus cobros y marca "Usar estos mismos cobros en todas las series de la liga".'
            : `${unconfigured} ${unconfigured === 1 ? 'serie no tiene' : 'series no tienen'} cobros configurados.`}
        </p>
      )}

      <section aria-label="Resumen de la liga" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Por cobrar" value={formatCLP(totals.toCollect)} />
        <Tile label="Vencido" value={formatCLP(totals.overdue)} tone={totals.overdue > 0 ? 'danger' : 'good'} hint={`${totals.debtors} ${totals.debtors === 1 ? 'equipo moroso' : 'equipos morosos'}`} />
        <Tile label="Cobrado" value={formatCLP(totals.paid)} />
        <Tile label="Por revisar" value={String(totals.review)} tone={totals.review > 0 ? 'warn' : 'default'} hint="Comprobantes de capitanes" />
      </section>

      <section aria-labelledby="series-title" className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
        <h2 id="series-title" className="px-4 py-3 border-b border-mg-line font-extrabold">Series ({series.length})</h2>
        {series.length === 0 ? (
          <p className="px-4 py-8 text-center text-mg-muted">Esta liga aún no tiene series.</p>
        ) : (
          <ul>
            {series.map((s) => (
              <li key={s.championship_id} className="border-b border-mg-line last:border-0">
                <a href={`/pagos?championship=${s.championship_id}`} className="flex items-center gap-3 px-4 py-3 min-h-[64px] hover:bg-mg-surface-2">
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold truncate">{s.series_name || s.championship_name}</span>
                    <span className="block text-xs text-mg-muted">
                      {s.teams} {s.teams === 1 ? 'equipo' : 'equipos'}
                      {s.configured ? ` · cobrado ${formatCLP(s.paid)}` : ''}
                      {s.pending_review > 0 ? ` · ${s.pending_review} por revisar` : ''}
                    </span>
                  </span>
                  <span className="text-right flex-none">
                    {s.configured ? (
                      <>
                        <span className="block mg-num text-xl font-extrabold">{formatCLP(s.to_collect)}</span>
                        {s.overdue > 0 ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-mg-danger-tint text-mg-danger">
                            Vencido {formatCLP(s.overdue)}
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-mg-pitch-tint text-mg-pitch-deep">Al día</span>
                        )}
                      </>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-[#fff4d6] text-mg-gold-ink">Configurar</span>
                    )}
                  </span>
                  <ChevronRight className="h-5 w-5 text-mg-muted flex-none" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
