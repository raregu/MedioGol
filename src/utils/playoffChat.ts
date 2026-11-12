/**
 * Playoffs para los asistentes (campeonato y liga): carga liviana y respuestas por palabras clave.
 * Las llaves están en `playoff_matches` con equipos de `base_teams`.
 */
import { supabase } from '../lib/supabase';

export interface PlayoffRow {
  championship_id: string;
  round: string;
  match_number: number;
  leg: string | null;
  team1_name: string | null;
  team2_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_name: string | null;
  match_date: string | null;
  status: string;
}

type Raw = Omit<PlayoffRow, 'team1_name' | 'team2_name' | 'winner_name'> & {
  team1: { name: string } | { name: string }[] | null;
  team2: { name: string } | { name: string }[] | null;
  winner: { name: string } | { name: string }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Llaves de playoffs de uno o varios campeonatos (una consulta). Vacío si no hay o si falla. */
export const fetchPlayoffs = async (championshipIds: string[]): Promise<PlayoffRow[]> => {
  if (championshipIds.length === 0) return [];
  const { data, error } = await supabase
    .from('playoff_matches')
    .select(
      'championship_id, round, match_number, leg, team1_score, team2_score, match_date, status, team1:team1_id(name), team2:team2_id(name), winner:winner_id(name)'
    )
    .in('championship_id', championshipIds.slice(0, 50))
    .order('match_number')
    .limit(500);
  if (error) {
    console.error('playoff_matches', error);
    return [];
  }
  return ((data || []) as unknown as Raw[]).map((r) => ({
    championship_id: r.championship_id,
    round: r.round,
    match_number: r.match_number,
    leg: r.leg,
    team1_score: r.team1_score,
    team2_score: r.team2_score,
    match_date: r.match_date,
    status: r.status,
    team1_name: one(r.team1)?.name?.trim() ?? null,
    team2_name: one(r.team2)?.name?.trim() ?? null,
    winner_name: one(r.winner)?.name?.trim() ?? null,
  }));
};

const normq = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** ¿La pregunta es sobre playoffs? ("final" como palabra, para no confundir con "finalizado"). */
export const isPlayoffQuestion = (q: string) => {
  const t = ` ${normq(q)} `;
  return (
    /play ?offs?|llaves?|cuartos|semi ?finale?s?|eliminatori|liguilla|cruces?|clasificad|quien paso|quienes pasaron|campeon|definicion/.test(t) ||
    / (la |el )?finale?s? /.test(t)
  );
};

const ROUNDS: { id: string; label: string }[] = [
  { id: 'round_of_32', label: 'Dieciseisavos' },
  { id: 'round_of_16', label: 'Octavos' },
  { id: 'quarterfinals', label: 'Cuartos de final' },
  { id: 'semifinals', label: 'Semifinales' },
  { id: 'final', label: 'Final' },
  { id: 'third_place', label: 'Tercer lugar' },
];
const PREV: Record<string, string> = { semifinals: 'cuartos', final: 'semifinal', quarterfinals: 'octavos', round_of_16: 'dieciseisavos' };

const fmtDate = (d: string) =>
  new Date(d).toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const formatRow = (m: PlayoffRow, roundId: string) => {
  const prev = PREV[roundId];
  const t1 = m.team1_name ?? (prev ? `Ganador ${prev} ${m.match_number * 2 - 1}` : 'Por definir');
  const t2 = m.team2_name ?? (prev ? `Ganador ${prev} ${m.match_number * 2}` : 'Por definir');
  const leg = m.leg === 'first_leg' ? ' (ida)' : m.leg === 'second_leg' ? ' (vuelta)' : '';
  if (m.status === 'finished') {
    const w = m.winner_name ? ` → pasa **${m.winner_name}**` : '';
    return `• **${t1} ${m.team1_score ?? 0} - ${m.team2_score ?? 0} ${t2}**${leg}${w}`;
  }
  const when = m.match_date ? ` · ${fmtDate(m.match_date)}` : ' · fecha por confirmar';
  return `• ${t1} vs ${t2}${leg}${when}`;
};

/** Texto del cuadro de un campeonato (o solo las llaves de un equipo si se indica). */
export const describePlayoffs = (rows: PlayoffRow[], opts: { title?: string; teamWords?: string[] } = {}) => {
  if (rows.length === 0) return null;
  const words = (opts.teamWords || []).filter((w) => w.length >= 3);
  const involves = (m: PlayoffRow) =>
    words.length === 0 || words.some((w) => normq(`${m.team1_name ?? ''} ${m.team2_name ?? ''}`).includes(w));
  const parts: string[] = [];
  for (const r of ROUNDS) {
    const list = rows.filter((m) => m.round === r.id && involves(m)).sort((a, b) => a.match_number - b.match_number);
    if (list.length) parts.push(`**${r.label}**\n${list.map((m) => formatRow(m, r.id)).join('\n')}`);
  }
  if (parts.length === 0) return null;
  const champion = rows.find((m) => m.round === 'final' && m.status === 'finished' && m.winner_name)?.winner_name;
  return `${opts.title ? `🏆 **${opts.title}**\n\n` : ''}${champion ? `🥇 Campeón: **${champion}**\n\n` : ''}${parts.join('\n\n')}`;
};

/** Palabras de la pregunta que pueden identificar a un equipo (para filtrar sus llaves). */
export const teamWordsIn = (question: string, teamNames: string[]) => {
  const q = ` ${normq(question)} `;
  const stop = new Set(['club', 'deportivo', 'csd', 'cdi', 'los', 'las', 'del', 'independiente', 'maritimo', 'social']);
  const hits = new Set<string>();
  teamNames.forEach((n) =>
    normq(n)
      .split(' ')
      .filter((w) => w.length >= 3 && !stop.has(w))
      .forEach((w) => {
        if (q.includes(` ${w} `)) hits.add(w);
      })
  );
  return [...hits];
};
