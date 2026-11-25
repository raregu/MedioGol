import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, MapPin, Trophy } from 'lucide-react';
import { Championship } from '../../types/database';
import { seriesLabel } from '../../utils/leagueStandings';
import { CallupButton } from '../callup/CallupButton';
import { fetchPlayoffs, PlayoffRow } from '../../utils/playoffChat';

const ROUNDS: { id: string; label: string; prev?: string }[] = [
  { id: 'round_of_16', label: 'Octavos' },
  { id: 'quarterfinals', label: 'Cuartos', prev: 'octavos' },
  { id: 'semifinals', label: 'Semifinal', prev: 'cuartos' },
  { id: 'final', label: 'Final', prev: 'semifinal' },
];

const TZ = 'America/Santiago';
/** "Dom 22 nov" */
const fmtDay = (d: string) => {
  const s = new Date(d).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).replace(',', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const fmtTime = (d: string) => new Date(d).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
/** Día calendario en Chile (para agrupar la jornada) */
const dayKey = (d: string) => new Date(d).toLocaleDateString('sv-SE', { timeZone: TZ });

/** Partidos de la próxima jornada: el primer día (desde hoy) con llaves programadas y sin jugar. */
const nextRoundOf = (rows: PlayoffRow[]) => {
  const today = dayKey(new Date().toISOString());
  const upcoming = rows
    .filter((m) => m.status !== 'finished' && m.match_date && dayKey(m.match_date) >= today)
    .sort((a, b) => (a.match_date! < b.match_date! ? -1 : 1));
  if (!upcoming.length) return { day: null as string | null, list: [] as PlayoffRow[] };
  const day = dayKey(upcoming[0].match_date!);
  return { day, list: upcoming.filter((m) => dayKey(m.match_date!) === day) };
};
const ROUND_NAME: Record<string, string> = { round_of_16: 'Octavos', quarterfinals: 'Cuartos', semifinals: 'Semifinal', final: 'Final' };

/** Escudo del club (o sus iniciales si no tiene). "Por definir" lleva un escudo vacío. */
const TeamLogo = ({ name, url, size = 20, known = true }: { name: string; url?: string | null; size?: number; known?: boolean }) => {
  const style = { width: size, height: size };
  if (url) return <img src={url} alt="" loading="lazy" style={style} className="rounded-full object-cover bg-white border border-mg-line flex-shrink-0" />;
  const ini = known
    ? name
        .split(/\s+/)
        .filter((w) => w.length > 2 && !/^(club|deportivo|csd|cdi|cd|los|las|del|independiente)$/i.test(w))
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('')
    : '';
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.max(8, Math.round(size * 0.4)) }}
      className={`rounded-full flex-shrink-0 inline-flex items-center justify-center font-extrabold ${
        known ? 'bg-mg-pitch-tint text-mg-pitch-deep' : 'border border-dashed border-mg-line-strong'
      }`}
    >
      {ini}
    </span>
  );
};

const Side = ({ name, logo, known, score, won, decided }: { name: string; logo?: string | null; known: boolean; score: number | null; won: boolean; decided: boolean }) => (
  <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${won ? 'bg-mg-pitch-tint font-extrabold text-mg-ink' : decided ? 'text-mg-muted' : 'text-mg-ink font-semibold'}`}>
    <span className="flex items-center gap-2 min-w-0">
      <TeamLogo name={name} url={logo} known={known} />
      <span className="truncate text-[13px]">{name}</span>
    </span>
    {score !== null && <span className="mg-num text-sm font-extrabold">{score}</span>}
  </div>
);

const MatchBox = ({ m, prev, next }: { m: PlayoffRow; prev?: string; next?: boolean }) => {
  const decided = m.status === 'finished';
  const dated = !decided && !!m.match_date;
  const t1 = m.team1_name ?? (prev ? `Ganador ${prev} ${m.match_number * 2 - 1}` : 'Por definir');
  const t2 = m.team2_name ?? (prev ? `Ganador ${prev} ${m.match_number * 2}` : 'Por definir');
  return (
    <div
      className={`rounded-mg-md bg-mg-surface overflow-hidden divide-y divide-mg-line ${
        dated && next ? 'border-2 border-mg-gold shadow-mg-card' : 'border border-mg-line'
      }`}
    >
      <Side name={t1} logo={m.team1_logo} known={!!m.team1_name} score={decided ? m.team1_score : null} won={decided && !!m.winner_name && m.winner_name === m.team1_name} decided={decided} />
      <Side name={t2} logo={m.team2_logo} known={!!m.team2_name} score={decided ? m.team2_score : null} won={decided && !!m.winner_name && m.winner_name === m.team2_name} decided={decided} />
      {!decided &&
        (dated ? (
          <p className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-extrabold ${next ? 'bg-mg-gold text-mg-on-gold' : 'bg-mg-surface-2 text-mg-ink'}`}>
            <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">
              {fmtDay(m.match_date!)} · {fmtTime(m.match_date!)}
            </span>
          </p>
        ) : (
          <p className="px-2.5 py-1 text-[11px] text-mg-muted bg-mg-surface-2">Fecha por confirmar</p>
        ))}
      {!decided && m.venue && (
        <p className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold bg-mg-surface-2 text-mg-ink">
          <MapPin className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{m.venue}</span>
        </p>
      )}
      {!decided && m.id && m.team1_id && m.team2_id && (
        <CallupButton compact playoffId={m.id} home={{ id: m.team1_id, name: m.team1_name }} away={{ id: m.team2_id, name: m.team2_name }} />
      )}
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
  const nextRound = nextRoundOf(rows);
  // Si toda la jornada es en la misma cancha, va una vez en la cabecera; si no, en cada partido
  const venues = Array.from(new Set(nextRound.list.map((m) => m.venue).filter((v): v is string => !!v)));
  const sharedVenue = venues.length === 1 && nextRound.list.every((m) => m.venue === venues[0]) ? venues[0] : null;
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
      {nextRound.list.length > 0 && (
        <section aria-labelledby="next-round-title" className="rounded-xl border-2 border-mg-gold bg-mg-surface overflow-hidden shadow-mg-card">
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-mg-gold text-mg-on-gold px-4 py-3">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
            <h3 id="next-round-title" className="font-display text-xl font-extrabold uppercase leading-6">
              Próxima jornada · {fmtDay(nextRound.list[0].match_date!)}
            </h3>
            <span className="ml-auto text-sm font-extrabold">
              {nextRound.list.length} {nextRound.list.length === 1 ? 'partido' : 'partidos'}
            </span>
            {sharedVenue && (
              <p className="basis-full flex items-center gap-1.5 text-sm font-extrabold">
                <MapPin className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {sharedVenue}
              </p>
            )}
          </header>
          <ol className="divide-y divide-mg-line">
            {nextRound.list.map((m) => {
              const s = series.find((x) => x.id === m.championship_id);
              return (
                <li key={`${m.championship_id}-${m.round}-${m.match_number}`} className="flex items-center gap-3 sm:gap-4 px-4 py-3">
                  <span className="font-display text-2xl font-extrabold leading-none text-mg-ink w-16 flex-shrink-0 tabular-nums">{fmtTime(m.match_date!)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] font-extrabold uppercase tracking-wide text-mg-muted">
                      {s ? seriesLabel(s) : ''} · {ROUND_NAME[m.round] ?? ''}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-extrabold text-mg-ink leading-snug">
                      <span className="inline-flex items-center gap-2">
                        <TeamLogo name={m.team1_name ?? ''} url={m.team1_logo} known={!!m.team1_name} size={28} />
                        {m.team1_name ?? 'Por definir'}
                      </span>
                      <span className="font-semibold text-mg-muted">vs</span>
                      <span className="inline-flex items-center gap-2">
                        <TeamLogo name={m.team2_name ?? ''} url={m.team2_logo} known={!!m.team2_name} size={28} />
                        {m.team2_name ?? 'Por definir'}
                      </span>
                    </span>
                    {!sharedVenue && m.venue && (
                      <span className="mt-1 flex items-center gap-1 text-xs font-bold text-mg-muted">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                        {m.venue}
                      </span>
                    )}
                    {m.id && m.team1_id && m.team2_id && (
                      <CallupButton className="mt-2" playoffId={m.id} home={{ id: m.team1_id, name: m.team1_name }} away={{ id: m.team2_id, name: m.team2_name }} />
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

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
                            <MatchBox
                              key={`${m.round}-${m.match_number}-${m.leg ?? ''}`}
                              m={m}
                              prev={r.prev}
                              next={nextRound.list.includes(m)}
                            />
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
