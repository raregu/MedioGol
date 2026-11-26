import { useEffect, useState } from 'react';
import { Trophy, Award, MapPin, CalendarDays, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { PlayoffMatch, PlayoffRound, Championship } from '../types/database';
import { TeamLogo } from './league/LeaguePlayoffs';

interface PlayoffBracketProps {
  championship: Championship;
  onMatchClick?: (match: PlayoffMatch) => void;
}

const ROUND_NAME: Record<PlayoffRound, string> = {
  round_of_32: 'Dieciseisavos',
  round_of_16: 'Octavos',
  quarterfinals: 'Cuartos',
  semifinals: 'Semifinales',
  final: 'Final',
  third_place: 'Tercer lugar',
};
const ROUND_ORDER: PlayoffRound[] = ['round_of_32', 'round_of_16', 'quarterfinals', 'semifinals', 'final'];
const PREV: Partial<Record<PlayoffRound, string>> = { quarterfinals: 'octavos', semifinals: 'cuartos', final: 'semifinal' };

const TZ = 'America/Santiago';
const fmtWhen = (iso: string) => {
  const s = new Date(iso)
    .toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
    .replace(',', ' ·');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Un partido (o una pierna de la llave): dos filas con escudo, nombre, goles y penales. */
const Leg = ({
  m,
  label,
  showWinner,
  placeholder,
  onClick,
}: {
  m: PlayoffMatch;
  label?: string;
  showWinner: boolean;
  placeholder: [string, string];
  onClick?: () => void;
}) => {
  const done = m.status === 'finished';
  const side = (n: 1 | 2) => {
    const team = n === 1 ? m.team1 : m.team2;
    const id = n === 1 ? m.team1_id : m.team2_id;
    const score = n === 1 ? m.team1_score : m.team2_score;
    const pens = n === 1 ? m.team1_penalties : m.team2_penalties;
    const won = showWinner && done && !!m.winner_id && m.winner_id === id;
    const name = team?.name?.trim() || placeholder[n - 1];
    return (
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 ${
          won ? 'bg-mg-pitch-tint font-extrabold text-mg-ink' : done ? 'text-mg-muted' : 'text-mg-ink font-semibold'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <TeamLogo name={name} url={team?.logo_url} known={!!team} size={24} />
          <span className="truncate text-sm">{name}</span>
        </span>
        {done && (
          <span className="mg-num text-base font-extrabold whitespace-nowrap text-mg-ink">
            {score}
            {pens != null && <span className="ml-1 text-xs font-bold text-mg-muted">({pens})</span>}
          </span>
        )}
      </div>
    );
  };
  const meta = (
    <p className="flex items-center justify-between gap-2 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-mg-muted bg-mg-surface-2">
      <span>{label}</span>
      {m.match_date && <span className="normal-case tracking-normal font-bold">{fmtWhen(m.match_date)}</span>}
    </p>
  );
  const body = (
    <>
      {(label || m.match_date) && meta}
      {side(1)}
      {side(2)}
      {!done && m.venue && (
        <p className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-mg-ink bg-mg-surface-2">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span className="truncate">{m.venue}</span>
        </p>
      )}
      {!done && !m.match_date && <p className="px-3 py-1.5 text-xs text-mg-muted bg-mg-surface-2">Fecha por confirmar</p>}
    </>
  );
  if (!onClick) return <div className="divide-y divide-mg-line">{body}</div>;
  return (
    <button type="button" onClick={onClick} className="group relative block w-full text-left divide-y divide-mg-line hover:bg-mg-surface-2/50" aria-label={`Editar ${label ?? 'partido'}`}>
      {body}
      <Pencil className="absolute top-1 right-1 h-3 w-3 text-mg-muted opacity-0 group-hover:opacity-100" aria-hidden="true" />
    </button>
  );
};

/** Cuadro de playoffs de una serie, con el mismo estilo que el cuadro de la liga. */
export default function PlayoffBracket({ championship, onMatchClick }: PlayoffBracketProps) {
  const [matches, setMatches] = useState<PlayoffMatch[] | null>(null);

  useEffect(() => {
    let alive = true;
    setMatches(null);
    supabase
      .from('playoff_matches')
      .select('*, team1:team1_id(id, name, logo_url), team2:team2_id(id, name, logo_url), winner:winner_id(id, name, logo_url)')
      .eq('championship_id', championship.id)
      .order('match_number')
      .then(({ data, error }) => {
        if (error) console.error('playoff_matches', error);
        if (alive) setMatches((data as PlayoffMatch[]) || []);
      });
    return () => {
      alive = false;
    };
  }, [championship.id]);

  if (matches === null) {
    return <div className="h-48 rounded-xl bg-mg-surface-2 animate-pulse" role="status" aria-label="Cargando playoffs" />;
  }
  if (matches.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-12 h-12 text-mg-line-strong mx-auto mb-3" aria-hidden="true" />
        <p className="text-mg-muted font-semibold">Los playoffs todavía no están armados.</p>
      </div>
    );
  }

  const ties = (round: PlayoffRound) => {
    const byNum = new Map<number, PlayoffMatch[]>();
    matches
      .filter((m) => m.round === round)
      .forEach((m) => byNum.set(m.match_number, [...(byNum.get(m.match_number) || []), m]));
    return Array.from(byNum.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([num, legs]) => ({ num, legs: legs.sort((a, b) => Number(a.leg === 'second_leg') - Number(b.leg === 'second_leg')) }));
  };
  const rounds = ROUND_ORDER.filter((r) => matches.some((m) => m.round === r));
  const final = matches.find((m) => m.round === 'final' && m.status === 'finished' && m.winner_id);
  const champion = final ? (final.winner_id === final.team1_id ? final.team1 : final.team2) : null;
  const runnerUp = final ? (final.winner_id === final.team1_id ? final.team2 : final.team1) : null;
  const third = matches.find((m) => m.round === 'third_place');

  const renderTie = (round: PlayoffRound, num: number, legs: PlayoffMatch[]) => {
    const prev = PREV[round];
    const ph: [string, string] = prev ? [`Ganador ${prev} ${num * 2 - 1}`, `Ganador ${prev} ${num * 2}`] : ['Por definir', 'Por definir'];
    const twoLegs = legs.length > 1 || !!legs[0]?.leg;
    const decider = legs[legs.length - 1];
    const advanced = twoLegs && decider.status === 'finished' && decider.winner_id ? (decider.winner_id === decider.team1_id ? decider.team1 : decider.team2) : null;
    return (
      <div key={`${round}-${num}`} className="rounded-mg-md border border-mg-line bg-mg-surface overflow-hidden shadow-sm divide-y divide-mg-line">
        {legs.map((m) => (
          <Leg
            key={m.id}
            m={m}
            label={m.leg ? (m.leg === 'first_leg' ? 'Ida' : 'Vuelta') : undefined}
            showWinner={!twoLegs || m === decider}
            placeholder={ph}
            onClick={onMatchClick ? () => onMatchClick(m) : undefined}
          />
        ))}
        {advanced?.name && (
          <p className="px-3 py-1.5 text-xs font-extrabold text-mg-pitch-deep bg-mg-pitch-tint">Avanza {advanced.name.trim()}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 font-sans">
      {champion?.name && (
        <div className="rounded-xl bg-emerald-950 text-white px-5 py-4 flex flex-wrap items-center gap-4">
          <span className="h-12 w-12 rounded-full bg-amber-400 text-amber-950 inline-flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <Trophy className="h-6 w-6" />
          </span>
          <div className="flex-1 min-w-[10rem]">
            <p className="text-xs font-black uppercase tracking-widest text-amber-300">Campeón</p>
            <p className="flex items-center gap-2 text-2xl font-black leading-tight">
              <TeamLogo name={champion.name} url={champion.logo_url} size={32} />
              {champion.name.trim()}
            </p>
          </div>
          {runnerUp?.name && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-100">
              <Award className="h-4 w-4" aria-hidden="true" /> Subcampeón: <span className="font-bold text-white">{runnerUp.name.trim()}</span>
            </p>
          )}
        </div>
      )}

      <div className="overflow-x-auto -mx-1 px-1 pb-2">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(240px, 1fr))` }}>
          {rounds.map((r) => (
            <div key={r} className="flex flex-col">
              <p className="text-[11px] font-black uppercase tracking-wider text-mg-muted mb-2">{ROUND_NAME[r]}</p>
              <div className="flex-1 flex flex-col justify-around gap-3">{ties(r).map(({ num, legs }) => renderTie(r, num, legs))}</div>
            </div>
          ))}
        </div>
      </div>

      {third && (
        <div className="max-w-sm">
          <p className="text-[11px] font-black uppercase tracking-wider text-mg-muted mb-2">{ROUND_NAME.third_place}</p>
          {renderTie('third_place', third.match_number, [third])}
        </div>
      )}

      {!champion && matches.some((m) => m.status !== 'finished' && m.match_date) && (
        <p className="flex items-center gap-1.5 text-xs text-mg-muted">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Horarios de Chile continental.
        </p>
      )}
    </div>
  );
}
