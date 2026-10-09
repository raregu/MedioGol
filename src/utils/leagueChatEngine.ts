/**
 * Motor de respuestas del asistente de una liga (por palabras clave, sin IA externa).
 * Trabaja solo con los datos que la página de la liga ya cargó.
 */
import { Championship, League, LeagueAdjustment, LeaguePhase } from '../types/database';
import {
  buildClubs,
  Club,
  Encounter,
  generalStandings,
  isFinished,
  LeagueMatchRow,
  LeagueTeamRow,
  seriesLabel,
  seriesStandings,
} from './leagueStandings';

export interface LeagueChatData {
  league: League;
  series: Championship[];
  teams: LeagueTeamRow[];
  matches: LeagueMatchRow[];
  phases: LeaguePhase[];
  adjustments: LeagueAdjustment[];
  encounters: Encounter[];
  now?: number;
}

export const LEAGUE_SUGGESTIONS = [
  '¿Cuál es la tabla general?',
  '¿Cómo va cada serie?',
  '¿Cuáles fueron los resultados de la última fecha?',
  '¿Qué partidos están pendientes?',
];

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Palabras que no distinguen a un club
const STOP = new Set([
  'cd', 'csd', 'cdi', 'cds', 'club', 'deportivo', 'deportiva', 'social', 'de', 'del', 'la', 'el', 'los', 'las', 'lo',
  'fc', 'y', 'independiente', 'union', 'sport', 'atletico', 'maritimo',
]);

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const shortDate = (d: string) =>
  new Date(d).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });

/** Clubes mencionados en la pregunta, ordenados por posición en el texto. */
const findClubs = (q: string, clubs: Club[]): Club[] => {
  const found: { club: Club; pos: number; score: number }[] = [];
  const qWords = ` ${q} `;
  clubs.forEach((club) => {
    const full = norm(club.name);
    if (full && qWords.includes(` ${full} `)) {
      found.push({ club, pos: q.indexOf(full), score: 100 + full.length });
      return;
    }
    const words = full.split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
    let best = -1;
    let score = 0;
    words.forEach((w) => {
      const idx = qWords.indexOf(` ${w} `);
      if (idx >= 0) {
        score += w.length;
        if (best < 0 || idx < best) best = idx;
      }
    });
    if (score > 0) found.push({ club, pos: best, score });
  });
  // Si dos clubes comparten palabra (ej. "Lo Orozco" y "Lo Vásquez" no; "Las Dichas"/"Las Águilas" sí por "las"), gana el de mayor puntaje
  found.sort((a, b) => b.score - a.score);
  const picked: typeof found = [];
  found.forEach((f) => {
    if (!picked.some((p) => p.club.key === f.club.key)) picked.push(f);
  });
  const top = picked.filter((f) => f.score >= (picked[0]?.score ?? 0) / 2);
  return top.sort((a, b) => a.pos - b.pos).map((f) => f.club);
};

/** Serie mencionada (prueba primero los nombres más largos: "súper sénior" antes que "sénior"). */
const findSeries = (q: string, series: Championship[]): Championship | null => {
  const sorted = [...series].sort((a, b) => norm(seriesLabel(b)).length - norm(seriesLabel(a)).length);
  for (const s of sorted) {
    const label = norm(seriesLabel(s));
    if (label && ` ${q} `.includes(` ${label} `)) return s;
  }
  // tolerar "super senior" escrito junto o "supersenior"
  for (const s of sorted) {
    const label = norm(seriesLabel(s)).replace(/\s/g, '');
    if (label.length > 4 && q.replace(/\s/g, '').includes(label)) return s;
  }
  return null;
};

const findPhase = (q: string, phases: LeaguePhase[]): LeaguePhase | 'all' | null => {
  if (has(q, 'acumulad', 'total', 'toda la temporada', 'todo el ano', 'anual')) return 'all';
  const ordinal: Record<string, number> = { primera: 1, '1': 1, '1a': 1, segunda: 2, '2': 2, '2a': 2, tercera: 3, '3': 3 };
  const m = q.match(/(primera|segunda|tercera|1a|2a|1|2|3)\s*(rueda|fase|vuelta)/);
  if (m && phases.length) {
    const idx = ordinal[m[1]];
    const sorted = [...phases].sort((a, b) => a.round_from - b.round_from);
    if (idx && sorted[idx - 1]) return sorted[idx - 1];
  }
  for (const p of phases) if (q.includes(norm(p.name))) return p;
  return null;
};

const roundLabel = (round: number, phases: LeaguePhase[]) => {
  const p = phases.find((x) => round >= x.round_from && round <= x.round_to);
  return p ? `${p.name} · Fecha ${round - p.round_from + 1}` : `Fecha ${round}`;
};

const formatEncounter = (e: Encounter) => {
  const lines = e.lines
    .map(({ championship, match }) => {
      if (!isFinished(match)) return `  ${seriesLabel(championship)}: pendiente`;
      return `  ${seriesLabel(championship)}: ${match.home_score ?? 0} - ${match.away_score ?? 0}`;
    })
    .join('\n');
  const head =
    e.finishedCount > 0
      ? `**${e.home.name} ${e.homeSeriesWon} - ${e.awaySeriesWon} ${e.away.name}** (series ganadas)`
      : `**${e.home.name} vs ${e.away.name}**`;
  return `${head}\n${lines}`;
};

export function buildLeagueAnswer(question: string, d: LeagueChatData): string {
  const q = norm(question);
  const now = d.now ?? Date.now();
  const clubs = Array.from(buildClubs(d.teams).values());
  const phaseHit = findPhase(q, d.phases);
  // Quitar "primera/segunda rueda" antes de buscar series: no confundir con las series "Primera" o "Segunda"
  const qNoPhase = q.replace(/(primera|segunda|tercera|1a|2a|1|2|3)\s*(rueda|fase|vuelta)/g, ' ').replace(/\s+/g, ' ');
  const mentioned = findClubs(qNoPhase, clubs);
  const serie = findSeries(qNoPhase, d.series);
  const defaultPhase = d.phases.find((p) => p.is_default) || null;
  const phase = phaseHit === 'all' ? null : phaseHit || defaultPhase;
  const phaseName = phase ? phase.name : 'acumulada';
  const general = () => generalStandings(d.league, d.series, d.teams, d.matches, d.adjustments, phase);

  const played = d.encounters.filter((e) => e.finishedCount > 0);
  const lastRound = played.length ? Math.max(...played.map((e) => e.round)) : null;

  // ── Encuentro entre dos clubes ──
  if (mentioned.length >= 2) {
    const [a, b] = mentioned;
    const list = d.encounters.filter(
      (e) => (e.home.key === a.key && e.away.key === b.key) || (e.home.key === b.key && e.away.key === a.key)
    );
    if (!list.length) return `No encontré partidos entre **${a.name}** y **${b.name}** en esta liga.`;
    return `🤝 **${a.name} vs ${b.name}**\n\n${list
      .map((e) => `[${roundLabel(e.round, d.phases)} · ${shortDate(e.date)}]\n${formatEncounter(e)}`)
      .join('\n\n')}`;
  }

  // ── Pendientes ──
  if (has(q, 'pendiente', 'suspendid', 'reprogram', 'atrasad')) {
    const pending = d.encounters.filter((e) =>
      e.lines.some((l) => !isFinished(l.match) && l.match.status !== 'cancelled' && new Date(l.match.match_date).getTime() < now)
    );
    const filtered = mentioned[0] ? pending.filter((e) => e.home.key === mentioned[0].key || e.away.key === mentioned[0].key) : pending;
    if (!filtered.length) return mentioned[0] ? `**${mentioned[0].name}** no tiene partidos pendientes. ✅` : 'No hay partidos pendientes. ✅';
    return `⏳ **Partidos pendientes**\n\n${filtered
      .map((e) => `• ${e.home.name} vs ${e.away.name} — ${roundLabel(e.round, d.phases)}`)
      .join('\n')}`;
  }

  // ── Próximos partidos ──
  if (has(q, 'proxim', 'siguiente', 'calendario', 'programad', 'cuando juega', 'cuando jugamos', 'cuando le toca')) {
    const upcoming = d.encounters
      .filter((e) => e.lines.some((l) => !isFinished(l.match) && new Date(l.match.match_date).getTime() >= now))
      .filter((e) => !mentioned[0] || e.home.key === mentioned[0].key || e.away.key === mentioned[0].key)
      .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
    if (!upcoming.length) return mentioned[0] ? `No hay partidos programados para **${mentioned[0].name}**.` : 'No hay partidos programados por ahora.';
    const nextRound = upcoming[0].round;
    const list = mentioned[0] ? upcoming.slice(0, 3) : upcoming.filter((e) => e.round === nextRound);
    return `📅 **Próximos partidos**${mentioned[0] ? ` de ${mentioned[0].name}` : ` · ${roundLabel(nextRound, d.phases)}`}\n\n${list
      .map((e) => `• ${e.home.name} vs ${e.away.name} — ${shortDate(e.date)}${e.venue ? ` · ${e.venue}` : ''}`)
      .join('\n')}`;
  }

  // ── Resultados (última fecha, fecha N, o de un club) ──
  const fechaNum = q.match(/fecha\s*(\d{1,2})/);
  if (has(q, 'resultado', 'ultima fecha', 'ultimo', 'marcador', 'como salio', 'como quedo', 'gano', 'perdio', 'empato') || fechaNum) {
    let round = lastRound;
    if (fechaNum) {
      const n = Number(fechaNum[1]);
      // "fecha 3" se interpreta dentro de la rueda pedida o la por defecto
      const base = phaseHit && phaseHit !== 'all' ? phaseHit : defaultPhase;
      round = base ? base.round_from + n - 1 : n;
    }
    if (mentioned[0] && !fechaNum) {
      const mine = played
        .filter((e) => e.home.key === mentioned[0].key || e.away.key === mentioned[0].key)
        .sort((x, y) => y.round - x.round)
        .slice(0, 3);
      if (!mine.length) return `**${mentioned[0].name}** aún no tiene resultados.`;
      return `⚽ **Últimos resultados de ${mentioned[0].name}**\n\n${mine
        .map((e) => `[${roundLabel(e.round, d.phases)}]\n${formatEncounter(e)}`)
        .join('\n\n')}`;
    }
    if (round === null) return 'Aún no hay resultados registrados en esta liga.';
    const list = d.encounters.filter((e) => e.round === round);
    if (!list.length) return `No hay partidos registrados para la ${roundLabel(round, d.phases).toLowerCase()}.`;
    const playing = new Set(list.flatMap((e) => [e.home.key, e.away.key]));
    const free = clubs.filter((c) => !playing.has(c.key)).map((c) => c.name);
    return `⚽ **Resultados · ${roundLabel(round, d.phases)}**\n\n${list.map(formatEncounter).join('\n\n')}${
      free.length ? `\n\nLibre: ${free.join(', ')}` : ''
    }`;
  }

  // ── Un club: cómo va ──
  if (mentioned.length === 1 && !serie) {
    const club = mentioned[0];
    const rows = general();
    const idx = rows.findIndex((r) => r.club.key === club.key);
    const row = rows[idx];
    const perSeries = d.series
      .map((s) => {
        const table = seriesStandings(s.id, d.teams, d.matches, d.league);
        const pos = table.findIndex((t) => t.club_key === club.key);
        return pos < 0 ? null : `• ${seriesLabel(s)}: ${pos + 1}° de ${table.length} (${table[pos].points} pts)`;
      })
      .filter(Boolean)
      .join('\n');
    const last = played
      .filter((e) => e.home.key === club.key || e.away.key === club.key)
      .sort((x, y) => y.round - x.round)[0];
    return `🏟️ **${club.name}**\n\nTabla general (${phaseName}): **${idx + 1}°** con **${row?.points ?? 0} pts** (DG ${signed(row?.goal_difference ?? 0)})\n\n**Por serie:**\n${perSeries}${
      last ? `\n\n**Último encuentro** (${roundLabel(last.round, d.phases)}):\n${formatEncounter(last)}` : ''
    }`;
  }

  // ── Tabla de una serie ──
  if (serie) {
    const table = seriesStandings(serie.id, d.teams, d.matches, d.league, phaseHit && phaseHit !== 'all' ? phaseHit : null);
    if (mentioned[0]) {
      const pos = table.findIndex((t) => t.club_key === mentioned[0].key);
      if (pos < 0) return `**${mentioned[0].name}** no tiene equipo en ${seriesLabel(serie)}.`;
      const t = table[pos];
      return `**${t.name}** en ${seriesLabel(serie)}: **${pos + 1}°** con ${t.points} pts — PJ ${t.played} · G ${t.won} · E ${t.drawn} · P ${t.lost} · DG ${signed(t.goal_difference)}`;
    }
    if (!table.some((t) => t.played > 0)) return `Aún no hay partidos jugados en ${seriesLabel(serie)}.`;
    return `📊 **Tabla ${seriesLabel(serie)}**\n\n${table
      .map((t, i) => `${i + 1}. **${t.name}** — ${t.points} pts | PJ ${t.played} · DG ${signed(t.goal_difference)}`)
      .join('\n')}`;
  }

  // ── Resumen de todas las series / líderes ──
  if (has(q, 'serie', 'categoria', 'cada serie', 'lideres')) {
    const lines = d.series.map((s) => {
      const t = seriesStandings(s.id, d.teams, d.matches, d.league)[0];
      return t && t.played ? `• **${seriesLabel(s)}**: ${t.name} (${t.points} pts)` : `• **${seriesLabel(s)}**: sin partidos aún`;
    });
    return `🏆 **Líderes por serie**\n\n${lines.join('\n')}\n\nPregunta por una serie para ver su tabla, por ejemplo "tabla ${seriesLabel(d.series[0])}".`;
  }

  // ── Tabla general / líder ──
  if (has(q, 'tabla', 'general', 'posicion', 'clasificacion', 'ranking', 'puntaje', 'puntos', 'lider', 'primero', 'punter', 'ganando', 'quien va')) {
    const rows = general().filter((r) => r.played > 0 || r.points !== 0);
    if (!rows.length) return 'Aún no hay partidos jugados para armar la tabla general.';
    if (has(q, 'lider', 'primero', 'punter', 'ganando', 'quien va') && !has(q, 'tabla')) {
      const [first, second] = rows;
      return `🥇 **${first.club.name}** lidera la tabla general (${phaseName}) con **${first.points} pts**${
        second ? `, ${first.points - second.points} más que ${second.club.name}` : ''
      }.`;
    }
    return `📊 **Tabla General · ${phaseName}**\n\n${rows
      .map((r, i) => `${i + 1}. **${r.club.name}** — ${r.points} pts (DG ${signed(r.goal_difference)})`)
      .join('\n')}\n\n_Suma de puntos de todas las series._`;
  }

  // ── Ajustes / castigos ──
  if (has(q, 'castigo', 'sancion', 'ajuste', 'descuento', 'multa')) {
    if (!d.adjustments.length) return 'La liga no tiene ajustes ni castigos registrados en la tabla general.';
    const byKey = new Map(clubs.map((c) => [c.key, c.name]));
    return `⚖️ **Ajustes de la tabla general**\n\n${d.adjustments
      .map((a) => `• ${byKey.get(a.base_team_id) || 'Club'}: ${a.points ? `${signed(a.points)} pts ` : ''}${a.goal_difference ? `${signed(a.goal_difference)} DG ` : ''}— ${a.reason}`)
      .join('\n')}`;
  }

  // ── Clubes participantes ──
  if (has(q, 'club', 'equipo', 'participa', 'cuantos')) {
    return `🏅 **Clubes de la liga (${clubs.length})**\n\n${clubs
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `• ${c.name}`)
      .join('\n')}`;
  }

  // ── Goleadores ──
  if (has(q, 'goleador', 'goles', 'artiller')) {
    return `⚽ Los goleadores se llevan por serie. Entra a la serie que te interese (${d.series
      .map(seriesLabel)
      .join(', ')}) y usa su asistente o la pestaña **Goleadores**.`;
  }

  // ── Información de la liga ──
  if (has(q, 'liga', 'informacion', 'temporada', 'donde', 'facebook', 'web', 'ruedas', 'fase')) {
    const ph = d.phases.length
      ? `\n**Ruedas:** ${[...d.phases].sort((a, b) => a.round_from - b.round_from).map((p) => `${p.name} (fechas ${p.round_from}-${p.round_to})`).join(', ')}`
      : '';
    return `ℹ️ **${d.league.name}${d.league.season ? ` ${d.league.season}` : ''}**\n\n${d.league.location ? `📍 ${d.league.location}\n` : ''}**Series:** ${d.series
      .map(seriesLabel)
      .join(', ')}\n**Clubes:** ${clubs.length}${ph}${d.league.facebook_page_url ? `\n**Facebook:** ${d.league.facebook_page_url}` : ''}${
      d.league.website_url ? `\n**Sitio web:** ${d.league.website_url}` : ''
    }`;
  }

  const greeting = has(q, 'hola', 'buenas', 'buen dia', 'saludos', 'ayuda', 'que puedes');
  return `${greeting ? '¡Hola! 👋' : 'No estoy seguro de qué buscas 🤔.'} Puedo responder sobre:\n\n• **Tabla general** (por rueda o acumulada)\n• **Tabla de una serie**, ej. "tabla ${seriesLabel(
    d.series[0] || ({ name: 'Dorados' } as Championship)
  )}"\n• **Cómo va un club**, ej. "¿cómo va ${clubs[0]?.name || 'mi club'}?"\n• **Resultados** de la última fecha o de la "fecha 5"\n• **Próximos partidos** y **pendientes**\n• **Un encuentro**, ej. "${clubs[0]?.name || 'A'} vs ${clubs[1]?.name || 'B'}"`;
}
