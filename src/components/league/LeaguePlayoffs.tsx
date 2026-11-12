import { useEffect, useState } from 'react';
import { ArrowRight, Trophy } from 'lucide-react';
import { Championship } from '../../types/database';
import { seriesLabel } from '../../utils/leagueStandings';
import { fetchPlayoffs, PlayoffRow } from '../../utils/playoffChat';

const ROUNDS: { id: string; label: string; prev?: string }[] = [
  { id: 'round_of_16', label: 'Octavos' },
  { id: 'quarterfinals', label: 'Cuartos', prev: 'octavos' },
  { id: 'semifinals', label: 'Semifinal', prev: 'cuartos' },
  { id: 'final', label: 'Final', prev: 'semifinal' },
];

const fmt = (d: string) => new Date(d).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });

const Side = ({ name, score, won, decided }: { name: string; score: number | null; won: boolean; decided: boolean }) => (
  <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${won ? 'bg-mg-pitch-tint font-extrabold text-mg-ink' : decided ? 'text-mg-muted' : 'text-mg-ink font-semibold'}`}>
    <span className="truncate text-[13px]">{name}</span>
    {score !== null && <span className="mg-num text-sm font-extrabold">{score}</span>}
  </div>
);

const MatchBox = ({ m, prev }: { m: PlayoffRow; prev?: string }) => {
  const decided = m.status === 'finished';
  const t1 = m.team1_name ?? (prev ? `Ganador ${prev} ${m.match_number * 2 - 1}` : 'Por definir');
  const t2 = m.team2_name ?? (prev ? `Ganador ${prev} ${m.match_number * 2}` : 'Por definir');
  return (
    <div className="rounded-mg-md border border-mg-line bg-mg-surface overflow-hidden divide-y divide-mg-line">
      <Side name={t1} score={decided ? m.team1_score : null} won={decided && !!m.winner_name && m.winner_name === m.team1_name} decided={decided} />
      <Side name={t2} score={decided ? m.team2_score : null} won={decided && !!m.winner_name && m.winner_name === m.team2_name} decided={decided} />
      {!decided && <p className="px-2.5 py-1 text-[11px] text-mg-muted bg-mg-surface-2">{m.match_date ? fmt(m.match_date) : 'Fecha por confirmar'}</p>}
    </div>
  );
};

/**
 * Playoffs de toda la liga en una sola vista: por serie, sus cuartos, semis y final.
 * Una sola consulta para todas las series.
 */
export const LeaguePlayoffs = ({ series }: { series: Championship[] }) => {
  const [rows, setRows] = useState<PlayoffRow[] | null>(null);
  const key = series.map((s) => s.id).join(',');

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchPlayoffs(key ? key.split(',') : []).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [key]);

  if (rows === null) {
    return <div className="h-40 rounded-xl bg-mg-surface-2 animate-pulse" role="status" aria-label="Cargando playoffs" />;
  }
  return <LeaguePlayoffsView series={series} rows={rows} />;
};

/** Vista del cuadro de playoffs de la liga (sin carga de datos). */
export const LeaguePlayoffsView = ({ series, rows }: { series: Championship[]; rows: PlayoffRow[] }) => {
  const withPlayoffs = series.filter((s) => rows.some((r) => r.championship_id === s.id));
  if (withPlayoffs.length === 0) {
    return <p className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">Los playoffs todavía no están armados.</p>;
  }

  return (
    <section id="playoffs" aria-labelledby="league-playoffs-title" className="scroll-mt-20 space-y-4 font-sans">
      <div className="rounded-xl bg-mg-navy text-mg-on-navy px-5 py-4 flex flex-wrap items-center gap-3">
        <span className="h-10 w-10 rounded-full bg-mg-gold text-mg-on-gold inline-flex items-center justify-center" aria-hidden="true">
          <Trophy className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-[12rem]">
          <h2 id="league-playoffs-title" className="font-display text-2xl font-extrabold uppercase leading-7">
            Playoffs
          </h2>
          <p className="text-sm text-mg-on-navy-muted">Los 8 mejores de cada serie, a un partido. Toca una serie para ver su cuadro completo.</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {withPlayoffs.map((s) => {
          const list = rows.filter((r) => r.championship_id === s.id);
          const champion = list.find((m) => m.round === 'final' && m.status === 'finished')?.winner_name;
          const rounds = ROUNDS.filter((r) => list.some((m) => m.round === r.id));
          return (
            <article key={s.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
                <h3 className="font-black text-gray-900">{seriesLabel(s)}</h3>
                {champion ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-mg-gold text-mg-on-gold px-3 py-1 text-xs font-extrabold">
                    <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> {champion}
                  </span>
                ) : (
                  <a href={`/championship/${s.id}?tab=playoffs`} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:underline">
                    Ver cuadro <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}
              </header>
              <div className="overflow-x-auto">
                <div className="grid gap-3 p-3 min-w-[540px]" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))` }}>
                  {rounds.map((r) => {
                    const ms = list.filter((m) => m.round === r.id).sort((a, b) => a.match_number - b.match_number);
                    return (
                      <div key={r.id} className="flex flex-col">
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 mb-2">{r.label}</p>
                        <div className="flex-1 flex flex-col justify-around gap-2">
                          {ms.map((m) => (
                            <MatchBox key={`${m.round}-${m.match_number}-${m.leg ?? ''}`} m={m} prev={r.prev} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
