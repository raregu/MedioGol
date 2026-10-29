import { Bell, ChevronRight, Search, Trophy } from 'lucide-react';
import { useFollowFeed, useFollows } from '../../hooks/useFollows';
import { MatchPanels } from './MatchPanels';
import { useMyLeagueNotices } from '../../hooks/useLeaguePosts';
import { LeagueNoticeBar } from '../league/LeagueNoticeBar';

/**
 * Inicio de un usuario con sesión: primero lo que sigue (campeonatos, resultados y próximos
 * partidos). Si todavía no sigue nada, una invitación corta a seguir sus campeonatos.
 */
export const FollowingSection = () => {
  const { enabled, count } = useFollows();
  const { feed, status } = useFollowFeed();
  // Avisos vigentes de las ligas que sigo (se recalcula al seguir o dejar de seguir)
  const notices = useMyLeagueNotices(enabled && count > 0, count);

  if (!enabled) return null;

  if (count === 0) {
    return (
      <section aria-labelledby="follow-tip" className="flex flex-wrap items-center gap-4 rounded-mg-lg border border-mg-line bg-mg-surface px-5 py-4 shadow-mg-card font-sans text-mg-ink">
        <span className="h-10 w-10 flex-shrink-0 rounded-full bg-mg-pitch-tint text-mg-pitch-deep inline-flex items-center justify-center" aria-hidden="true">
          <Bell className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-[14rem]">
          <h2 id="follow-tip" className="font-extrabold">
            Sigue tus campeonatos
          </h2>
          <p className="text-sm text-mg-muted">Pulsa «Seguir» en un campeonato o liga y aquí verás primero sus resultados y próximos partidos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/leagues" className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-mg-md bg-mg-pitch text-mg-on-pitch text-sm font-extrabold">
            <Trophy className="h-4 w-4" aria-hidden="true" /> Ver ligas
          </a>
          <a href="/search" className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-mg-md border border-mg-line-strong text-sm font-extrabold">
            <Search className="h-4 w-4" aria-hidden="true" /> Buscar
          </a>
        </div>
      </section>
    );
  }

  if (!feed) {
    return status === 'error' ? null : (
      <div className="h-24 rounded-mg-lg bg-mg-surface-2 animate-pulse" role="status" aria-label="Cargando lo que sigues" />
    );
  }

  return (
    <section aria-labelledby="following-title" className="space-y-4 font-sans text-mg-ink">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="following-title" className="font-display text-[28px] leading-8 font-extrabold uppercase flex items-center gap-2">
          <Bell className="h-6 w-6 text-mg-pitch-deep" aria-hidden="true" /> Siguiendo
        </h2>
        <span className="text-sm text-mg-muted">
          {feed.championships.length} {feed.championships.length === 1 ? 'campeonato' : 'campeonatos'}
        </span>
      </div>
      {notices.length > 0 && (
        <ul aria-label="Avisos de las ligas que sigues" className="space-y-2">
          {notices.map((n) => (
            <li key={n.id}>
              <LeagueNoticeBar notice={n} showLeague className="rounded-r-mg-md" />
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Campeonatos que sigues" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {feed.championships.map((c) => (
          <a
            key={c.id}
            href={`/championship/${c.id}`}
            className="flex-shrink-0 inline-flex items-center gap-2 min-h-[44px] pl-2 pr-3 rounded-full border border-mg-line-strong bg-mg-surface text-sm font-bold hover:border-mg-pitch hover:text-mg-pitch-deep"
          >
            {c.image_url ? (
              <img src={c.image_url} alt="" className="h-7 w-7 rounded-full object-cover bg-white" />
            ) : (
              <span className="h-7 w-7 rounded-full bg-mg-pitch-tint text-mg-pitch-deep inline-flex items-center justify-center" aria-hidden="true">
                <Trophy className="h-4 w-4" />
              </span>
            )}
            <span className="whitespace-nowrap">{c.league_name ? `${c.league_name} · ${c.series_name || c.name}` : c.name}</span>
            <ChevronRight className="h-4 w-4 text-mg-muted" aria-hidden="true" />
          </a>
        ))}
      </nav>
      <MatchPanels
        idPrefix="following"
        results={feed.results}
        upcoming={feed.upcoming}
        resultsTitle="Resultados de lo que sigues"
        upcomingTitle="Próximos de lo que sigues"
        resultsEmpty="Aún no hay partidos jugados en lo que sigues."
        upcomingEmpty="No hay partidos programados en lo que sigues."
      />
    </section>
  );
};
