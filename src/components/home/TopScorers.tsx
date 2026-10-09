import { HomeScorer } from '../../types/home';
import { SectionHeader } from './SectionHeader';

/** Top de goleadores de los campeonatos en curso (calculado en el servidor). */
export const TopScorers = ({ scorers }: { scorers: HomeScorer[] }) => {
  if (scorers.length === 0) return null;
  return (
    <section aria-labelledby="home-scorers" className="max-w-2xl">
      <SectionHeader id="home-scorers" title="Goleadores de campeonatos en curso" />
      <ol className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
        {scorers.map((s, i) => (
          <li key={s.player_id} className={`flex items-center gap-4 px-5 py-3 border-t border-mg-line first:border-t-0 ${i === 0 ? 'bg-mg-pitch-tint' : ''}`}>
            <span className={`mg-num w-8 h-8 rounded-mg-sm flex items-center justify-center text-lg font-extrabold ${i === 0 ? 'bg-mg-gold text-mg-on-gold' : 'text-mg-ink'}`}>
              {i + 1}
            </span>
            <span className="flex-1 min-w-0">
              <a href={`/player/${s.player_id}`} className="block font-extrabold text-mg-ink truncate hover:underline">
                {s.player_name}
              </a>
              {s.team_name && <span className="block text-[13px] text-mg-muted truncate">{s.team_name}</span>}
            </span>
            <span className="mg-num text-[28px] leading-8 font-extrabold text-mg-ink">
              {s.goals}
              <span className="sr-only"> goles</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
};
