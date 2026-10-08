import { Championship, League } from '../types/database';
import { seriesLabel } from '../utils/leagueStandings';
import { ArrowRight, Trophy } from 'lucide-react';

/** Franja que muestra, dentro de un campeonato, a qué liga pertenece y permite saltar entre series. */
export const LeagueBanner = ({ league, series, currentId }: { league: League; series: Championship[]; currentId: string }) => (
  <div className="space-y-3">
    <div className="bg-emerald-950 text-white rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {league.logo_url ? (
          <img src={league.logo_url} alt="" className="h-9 w-9 rounded-full object-cover border-2 border-amber-400 bg-white flex-shrink-0" />
        ) : (
          <span className="h-9 w-9 rounded-full bg-white text-emerald-900 flex items-center justify-center border-2 border-amber-400 flex-shrink-0">
            <Trophy className="h-4 w-4" />
          </span>
        )}
        <span className="text-sm text-emerald-200">Serie de la</span>
        <a href={`/league/${league.id}`} className="font-black hover:underline truncate">
          {league.name}{league.season ? ` ${league.season}` : ''}
        </a>
      </div>
      <a href={`/league/${league.id}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-400 text-amber-950 text-sm font-black hover:bg-amber-300">
        Ver tabla general <ArrowRight className="h-4 w-4" />
      </a>
    </div>
    {series.length > 1 && (
      <nav aria-label="Series de la liga" className="flex flex-wrap gap-2">
        {series.map((s) =>
          s.id === currentId ? (
            <span key={s.id} aria-current="page" className="px-4 py-2 rounded-full text-sm font-black bg-emerald-950 text-white border border-emerald-950">
              {seriesLabel(s)}
            </span>
          ) : (
            <a key={s.id} href={`/championship/${s.id}`} className="px-4 py-2 rounded-full text-sm font-bold bg-white text-gray-700 border border-gray-300 hover:border-emerald-500 hover:text-emerald-700">
              {seriesLabel(s)}
            </a>
          )
        )}
      </nav>
    )}
  </div>
);
