import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { HomeMatch } from '../../types/home';
import { SectionHeader } from './SectionHeader';

const dayFmt = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' });
const shortDay = (iso: string) => dayFmt.format(new Date(iso)).replace(/\./g, '');
const shortTime = (iso: string) => timeFmt.format(new Date(iso));

const rowClass = 'block px-5 py-3.5 border-t border-mg-line first:border-t-0 hover:bg-mg-surface-2';
const grid = 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3';

const ResultRow = ({ m }: { m: HomeMatch }) => {
  const h = m.home_score ?? 0;
  const a = m.away_score ?? 0;
  return (
    <li>
      <a href={`/championship/${m.championship_id}`} className={rowClass}>
        <div className="flex justify-between gap-3 text-[13px] text-mg-muted mb-1.5">
          <span className="truncate font-semibold text-mg-ink">{m.competition}</span>
          <time dateTime={m.match_date} className="flex-shrink-0 capitalize">
            {shortDay(m.match_date)}
          </time>
        </div>
        <div className={grid}>
          <span className={`text-[15px] leading-5 text-mg-ink ${h > a ? 'font-extrabold' : 'font-semibold'}`}>{m.home_team_name}</span>
          <span className="mg-num flex items-center gap-1 text-2xl font-extrabold text-mg-ink" aria-label={`${h} a ${a}`}>
            <span className={`min-w-[32px] text-center rounded-mg-sm py-0.5 ${h > a ? 'bg-mg-pitch-tint' : ''}`}>{h}</span>
            <span className="text-mg-muted text-lg" aria-hidden="true">–</span>
            <span className={`min-w-[32px] text-center rounded-mg-sm py-0.5 ${a > h ? 'bg-mg-pitch-tint' : ''}`}>{a}</span>
          </span>
          <span className={`text-[15px] leading-5 text-right text-mg-ink ${a > h ? 'font-extrabold' : 'font-semibold'}`}>{m.away_team_name}</span>
        </div>
      </a>
    </li>
  );
};

const UpcomingRow = ({ m }: { m: HomeMatch }) => (
  <li>
    <a href={`/championship/${m.championship_id}`} className={rowClass}>
      <div className="flex justify-between gap-3 text-[13px] text-mg-muted mb-1.5">
        <span className="truncate font-semibold text-mg-ink">{m.competition}</span>
        {m.venue && (
          <span className="flex items-center gap-1 min-w-0">
            <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{m.venue}</span>
          </span>
        )}
      </div>
      <div className={grid}>
        <span className="text-[15px] leading-5 font-bold text-mg-ink">{m.home_team_name}</span>
        <time dateTime={m.match_date} className="text-center">
          <span className="block mg-num text-lg leading-5 font-bold uppercase text-mg-gold-ink">{shortDay(m.match_date)}</span>
          <span className="block text-[13px] font-semibold text-mg-muted">{shortTime(m.match_date)}</span>
        </time>
        <span className="text-[15px] leading-5 text-right font-bold text-mg-ink">{m.away_team_name}</span>
      </div>
    </a>
  </li>
);

const Panel = ({ id, title, empty, children, count }: { id: string; title: string; empty: string; count: number; children: ReactNode }) => (
  <section aria-labelledby={id} className="min-w-0">
    <SectionHeader id={id} title={title} />
    <div className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
      {count === 0 ? <p className="px-5 py-8 text-center text-sm text-mg-muted">{empty}</p> : <ul>{children}</ul>}
    </div>
  </section>
);

interface MatchPanelsProps {
  results: HomeMatch[];
  upcoming: HomeMatch[];
  /** Prefijo de los id de los títulos (para usar el bloque más de una vez en la página) */
  idPrefix?: string;
  resultsTitle?: string;
  upcomingTitle?: string;
  resultsEmpty?: string;
  upcomingEmpty?: string;
}

/** Últimos resultados y próximos partidos, lado a lado en escritorio. */
export const MatchPanels = ({
  results,
  upcoming,
  idPrefix = 'home',
  resultsTitle = 'Últimos resultados',
  upcomingTitle = 'Próximos partidos',
  resultsEmpty = 'Todavía no hay partidos jugados.',
  upcomingEmpty = 'No hay partidos programados por ahora.',
}: MatchPanelsProps) => (
  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <Panel id={`${idPrefix}-results`} title={resultsTitle} empty={resultsEmpty} count={results.length}>
      {results.map((m) => (
        <ResultRow key={m.id} m={m} />
      ))}
    </Panel>
    <Panel id={`${idPrefix}-upcoming`} title={upcomingTitle} empty={upcomingEmpty} count={upcoming.length}>
      {upcoming.map((m) => (
        <UpcomingRow key={m.id} m={m} />
      ))}
    </Panel>
  </div>
);
