// Convocatoria de partidos de liga ("¿Vas al partido?"). Ver migración 20261125150000_match_callups.sql

export type CallupStatus = 'yes' | 'maybe' | 'no';

export interface CallupMember {
  id: string;
  name: string;
  claimed: boolean;
  status: CallupStatus | null;
  note: string | null;
  updated_at: string | null;
}

export interface CallupView {
  callup: { id: string; code: string; team: string; team_id: string };
  match: {
    kind: 'match' | 'playoff';
    date: string | null;
    venue: string | null;
    status: string;
    round?: number | null;
    round_name?: string | null;
    home: string | null;
    away: string | null;
    is_home: boolean;
    home_score: number | null;
    away_score: number | null;
    championship: string;
    championship_id: string;
  } | null;
  members: CallupMember[];
  me: string | null;
  can_manage: boolean;
}

const TZ = 'America/Santiago';
const ROUND_NAME: Record<string, string> = { quarterfinals: 'Cuartos de final', semifinals: 'Semifinal', final: 'Final', round_of_16: 'Octavos de final' };

export const roundLabel = (m: CallupView['match']) => {
  if (!m) return '';
  if (m.kind === 'playoff') return ROUND_NAME[m.round_name || ''] || 'Playoffs';
  return m.round != null ? `Fecha ${m.round}` : '';
};

/** "Dom 22 nov · 10:00" */
export const fmtCallupWhen = (iso: string | null | undefined) => {
  if (!iso) return 'Fecha por confirmar';
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-CL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(',', '');
  const time = d.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`;
};

/** Rival desde el punto de vista del equipo convocado. */
export const rivalOf = (v: CallupView) => (v.match ? (v.match.is_home ? v.match.away : v.match.home) : null) || 'Por definir';

/** Token del teléfono para jugadores sin cuenta: uno por equipo (sirve para todos sus partidos). */
const key = (teamId: string) => `mg:callup:${teamId}`;
export const readCallupToken = (teamId: string | null | undefined): string | null => {
  if (!teamId) return null;
  try {
    return localStorage.getItem(key(teamId));
  } catch {
    return null;
  }
};
export const saveCallupToken = (teamId: string, token: string) => {
  try {
    localStorage.setItem(key(teamId), token);
  } catch {
    /* modo privado: tendrá que elegir su nombre otra vez */
  }
};

export const callupLink = (code: string) => `${window.location.origin}/c/${code}`;

export const STATUS_LABEL: Record<CallupStatus, string> = { yes: 'Voy', maybe: 'En duda', no: 'No voy' };

const names = (list: CallupMember[]) => list.map((m) => m.name).join(', ');

/** Mensaje para el grupo del equipo: resumen y links de un toque (Voy / En duda / No voy). */
export const callupMessage = (v: CallupView) => {
  const going = v.members.filter((m) => m.status === 'yes');
  const maybe = v.members.filter((m) => m.status === 'maybe');
  const no = v.members.filter((m) => m.status === 'no');
  const silent = v.members.filter((m) => !m.status);
  const link = callupLink(v.callup.code);
  const m = v.match;
  const lines: (string | null)[] = [
    `⚽ *${v.callup.team}* vs ${rivalOf(v)} · ${fmtCallupWhen(m?.date)}`,
    m?.venue ? `📍 ${m.venue}` : null,
    m ? `🏆 ${m.championship}${roundLabel(m) ? ` · ${roundLabel(m)}` : ''}` : null,
    '',
    going.length ? `✅ *Van (${going.length}):* ${names(going)}` : '✅ *Van:* nadie todavía',
    maybe.length ? `🤔 *En duda:* ${names(maybe)}` : null,
    no.length ? `❌ *No van:* ${names(no)}` : null,
    silent.length ? `⏳ *Falta que respondan (${silent.length})${silent.length <= 12 ? `:* ${names(silent)}` : '*'}` : null,
    '',
    '*¿Vas?* Toca una opción:',
    `✅ Voy 👉 ${link}?r=si`,
    `🤔 En duda 👉 ${link}?r=duda`,
    `❌ No voy 👉 ${link}?r=no`,
  ];
  return lines.filter((l) => l !== null).join('\n');
};
