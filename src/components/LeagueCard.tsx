import { ArrowRight, Trophy } from 'lucide-react';
import { LeagueSummary } from '../types/home';
import { LeagueNoticeBar } from './league/LeagueNoticeBar';

/**
 * Tarjeta de una liga. Es solo presentación: los datos (series, nº de clubes y top 3 de la
 * tabla general en la fase por defecto) llegan ya calculados desde la RPC `league_summaries`.
 */
export const LeagueCard = ({ league }: { league: LeagueSummary }) => (
  <article className="bg-mg-surface rounded-mg-lg border border-mg-line hover:shadow-mg-card transition-shadow overflow-hidden flex flex-col">
    <div className="bg-mg-navy text-mg-on-navy px-5 sm:px-6 py-5 flex flex-wrap items-center gap-4">
      {league.logo_url ? (
        <img src={league.logo_url} alt="" loading="lazy" className="h-14 w-14 rounded-full object-cover bg-white flex-shrink-0" />
      ) : (
        <div className="h-14 w-14 rounded-full bg-mg-surface text-mg-ink flex items-center justify-center flex-shrink-0">
          <Trophy className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
      <div className="flex-1 min-w-[12rem]">
        <p className="mg-label text-mg-on-navy-muted">
          Liga · {league.series.length} series{league.club_count ? ` · ${league.club_count} clubes` : ''}
        </p>
        <h3>
          <a href={`/league/${league.id}`} className="block font-display text-[28px] leading-[30px] font-extrabold uppercase tracking-[0.01em] hover:underline">
            {league.name}
            {league.season ? ` ${league.season}` : ''}
          </a>
        </h3>
      </div>
      <a
        href={`/league/${league.id}`}
        aria-label={`Ver liga ${league.name}`}
        className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-mg-md bg-mg-gold text-mg-on-gold font-extrabold text-sm hover:brightness-105"
      >
        Ver liga
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
    {league.notice && <LeagueNoticeBar notice={league.notice} />}
    <div className="px-5 sm:px-6 py-5 grid gap-6 sm:grid-cols-2 flex-1">
      <div>
        <p className="mg-label text-mg-muted mb-3">Tabla general{league.phase_name ? ` · ${league.phase_name}` : ''}</p>
        {league.top.length === 0 ? (
          <p className="text-sm text-mg-muted">Sin partidos jugados aún.</p>
        ) : (
          <ol className="space-y-2">
            {league.top.map((r, i) => (
              <li key={r.club_key} className="flex items-center gap-3">
                <span className={`mg-num w-7 h-7 rounded-mg-sm flex items-center justify-center text-lg font-extrabold ${i === 0 ? 'bg-mg-gold text-mg-on-gold' : 'text-mg-ink'}`}>
                  {i + 1}
                </span>
                <span className="flex-1 font-bold text-mg-ink truncate">{r.name}</span>
                <span className="mg-num text-lg font-extrabold text-mg-ink">
                  {r.points}
                  <span className="sr-only"> puntos</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div>
        <p className="mg-label text-mg-muted mb-3">Series</p>
        <ul className="flex flex-wrap gap-2">
          {league.series.map((s) => (
            <li key={s.id}>
              <a
                href={`/championship/${s.id}`}
                className="block px-3.5 py-2 rounded-full border border-mg-line-strong text-[13px] font-bold text-mg-ink hover:bg-mg-navy hover:border-mg-navy hover:text-mg-on-navy"
              >
                {s.series_name?.trim() || s.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </article>
);
