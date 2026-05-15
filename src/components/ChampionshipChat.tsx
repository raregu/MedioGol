import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface MatchData {
  id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  match_date: string | null;
  round: number | null;
  series: string | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
  sports_complex: { name: string; address: string | null } | null;
}

interface TeamData {
  id: string;
  name: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
}

interface ScorerData {
  player_name: string;
  team_name: string;
  total_goals: number;
}

interface ChampionshipInfo {
  name: string;
  sport: string;
  venue: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

interface ChatData {
  championship: ChampionshipInfo | null;
  matches: MatchData[];
  scorers: ScorerData[];
  standings: TeamData[];
}

// ─── Normalización de texto ──────────────────────────────────────────────────
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

const includes = (hay: string, needle: string) =>
  norm(hay).includes(norm(needle));

// ─── Sugerencias iniciales ────────────────────────────────────────────────────
const SUGGESTIONS = [
  '¿Cuál es la tabla de posiciones?',
  '¿Quién es el goleador?',
  '¿Cuándo es el próximo partido?',
  '¿Cuáles son los últimos resultados?',
];

// ─── Motor de respuestas ─────────────────────────────────────────────────────

function buildAnswer(question: string, data: ChatData): string {
  const q = norm(question);
  const { championship, matches, scorers, standings } = data;

  // ── Tabla de posiciones ──
  if (
    q.includes('tabla') ||
    q.includes('posicion') ||
    q.includes('clasificacion') ||
    q.includes('ranking') ||
    q.includes('puntaje') ||
    q.includes('lider') ||
    (q.includes('primer') && q.includes('lugar'))
  ) {
    if (standings.length === 0) return 'Aún no hay posiciones registradas en este campeonato.';
    const rows = standings
      .slice(0, 8)
      .map(
        (t, i) =>
          `${i + 1}. **${t.name}** — ${t.points} pts | PJ:${t.played} G:${t.won} E:${t.drawn} P:${t.lost} | GF:${t.goals_for} GC:${t.goals_against}`
      )
      .join('\n');
    return `📊 **Tabla de Posiciones**\n\n${rows}`;
  }

  // ── Goleadores ──
  if (
    q.includes('goleador') ||
    q.includes('gol') && (q.includes('quien') || q.includes('mas') || q.includes('maximo')) ||
    q.includes('artiller') ||
    q.includes('scorer')
  ) {
    if (scorers.length === 0) return 'Aún no hay estadísticas de goleadores registradas.';
    const rows = scorers
      .slice(0, 8)
      .map(
        (s, i) =>
          `${i + 1}. **${s.player_name}** (${s.team_name}) — ${s.total_goals} gol${s.total_goals !== 1 ? 'es' : ''}`
      )
      .join('\n');
    return `⚽ **Tabla de Goleadores**\n\n${rows}`;
  }

  // ── Último/s resultado/s ──
  if (
    q.includes('ultimo') ||
    q.includes('resultado') ||
    q.includes('marcador') ||
    q.includes('finalizad') ||
    q.includes('termino') ||
    q.includes('reciente')
  ) {
    // Buscar por equipo específico
    const teamMatch = findTeamInQuestion(q, matches);
    const finished = matches
      .filter((m) => m.status === 'finished' && m.home_score !== null)
      .filter((m) => !teamMatch || matchInvolvesTeam(m, teamMatch));

    if (finished.length === 0) {
      return teamMatch
        ? `No encontré partidos finalizados de **${teamMatch}**.`
        : 'No hay partidos finalizados aún.';
    }

    const rows = finished.slice(0, 5).map((m) => formatMatch(m)).join('\n');
    const header = teamMatch
      ? `⚽ **Resultados de ${teamMatch}**`
      : '⚽ **Últimos Resultados**';
    return `${header}\n\n${rows}`;
  }

  // ── Próximos partidos ──
  if (
    q.includes('proximo') ||
    q.includes('siguiente') ||
    (q.includes('cuando') && q.includes('jueg')) ||
    q.includes('pendiente') ||
    q.includes('programado') ||
    q.includes('calendario') ||
    (q.includes('partido') && !q.includes('resultado') && !q.includes('gano') && !q.includes('gano'))
  ) {
    const teamMatch = findTeamInQuestion(q, matches);
    const allUpcoming = matches.filter((m) => m.status !== 'finished');
    const upcoming = teamMatch
      ? allUpcoming.filter((m) => matchInvolvesTeam(m, teamMatch))
      : allUpcoming;

    // Si filtramos por equipo pero no encontramos partidos, mostrar todos los pendientes como fallback
    if (upcoming.length === 0 && teamMatch) {
      if (allUpcoming.length > 0) {
        const rows = allUpcoming.slice(0, 5).map((m) => formatMatch(m)).join('\n');
        return `No encontré partidos específicos de "${teamMatch}" pendientes.\n\nEstos son los próximos partidos del campeonato:\n\n${rows}`;
      }
      return `No hay partidos pendientes de **${teamMatch}**.`;
    }

    if (upcoming.length === 0) {
      return 'No hay partidos programados próximamente.';
    }

    const rows = upcoming.slice(0, 8).map((m) => formatMatch(m)).join('\n');
    const header = teamMatch
      ? `📅 **Próximos partidos de ${teamMatch}**`
      : '📅 **Próximos Partidos**';
    return `${header}\n\n${rows}`;
  }

  // ── Resultado de un partido específico por equipos ──
  const teamPair = findTeamPairInQuestion(q, matches);
  if (teamPair) {
    const { home, away, match: m } = teamPair;
    if (m.status === 'finished' && m.home_score !== null) {
      return `⚽ **${m.home_team?.name} ${m.home_score} - ${m.away_score} ${m.away_team?.name}**\n\n${formatMatchDate(m.match_date)}${m.sports_complex ? `\n📍 ${m.sports_complex.name}` : ''}`;
    } else {
      return `El partido **${home} vs ${away}** está ${translateStatus(m.status)}.${m.match_date ? `\n📅 ${formatMatchDate(m.match_date)}` : ''}${m.sports_complex ? `\n📍 ${m.sports_complex.name}` : ''}`;
    }
  }

  // ── Cancha / recinto / ubicación ──
  if (
    q.includes('cancha') ||
    q.includes('recinto') ||
    q.includes('donde') ||
    q.includes('ubicacion') ||
    q.includes('direccion') ||
    q.includes('sede')
  ) {
    if (championship?.venue) {
      const teamMatch = findTeamInQuestion(q, matches);
      if (teamMatch) {
        const teamMatches = matches.filter((m) => matchInvolvesTeam(m, teamMatch));
        const venues = [
          ...new Set(
            teamMatches
              .filter((m) => m.sports_complex)
              .map((m) => m.sports_complex!.name + (m.sports_complex!.address ? ` — ${m.sports_complex!.address}` : ''))
          ),
        ];
        if (venues.length > 0) {
          return `📍 **Recintos de ${teamMatch}:**\n\n${venues.map((v) => `• ${v}`).join('\n')}`;
        }
      }
      return `📍 **Recinto principal:** ${championship.venue}`;
    }
    return 'No hay información de recintos disponible.';
  }

  // ── Info del campeonato ──
  if (
    q.includes('campeonato') ||
    q.includes('torneo') ||
    q.includes('informacion') ||
    q.includes('inicio') ||
    q.includes('cuando empiez') ||
    q.includes('deporte')
  ) {
    if (!championship) return 'No se pudo cargar la información del campeonato.';
    const lines = [
      `🏆 **${championship.name}**`,
      `⚽ Deporte: ${championship.sport}`,
      `📍 Recinto: ${championship.venue}`,
      `📌 Estado: ${translateStatus(championship.status)}`,
    ];
    if (championship.start_date)
      lines.push(`📅 Inicio: ${formatDate(championship.start_date)}`);
    if (championship.end_date)
      lines.push(`📅 Fin: ${formatDate(championship.end_date)}`);
    if (championship.description) lines.push(`\n${championship.description}`);
    return lines.join('\n');
  }

  // ── Equipos participantes ──
  if (q.includes('equipo') || q.includes('participante') || q.includes('quien particip') || q.includes('cuantos equipo')) {
    const teamNames = [...new Set(matches.flatMap((m) => [m.home_team?.name, m.away_team?.name].filter(Boolean)))];
    if (teamNames.length === 0) return 'No hay equipos registrados aún.';
    return `🏅 **Equipos participantes (${teamNames.length}):**\n\n${teamNames.map((n) => `• ${n}`).join('\n')}`;
  }

  // ── Partidos de una fecha/ronda ──
  const roundMatch = q.match(/fecha\s*(\d+)|jornada\s*(\d+)|ronda\s*(\d+)/);
  if (roundMatch) {
    const roundNum = parseInt(roundMatch[1] || roundMatch[2] || roundMatch[3]);
    const roundMatches = matches.filter((m) => m.round === roundNum);
    if (roundMatches.length === 0) return `No hay partidos registrados para la fecha ${roundNum}.`;
    const rows = roundMatches.map((m) => formatMatch(m)).join('\n');
    return `📅 **Fecha ${roundNum}**\n\n${rows}`;
  }

  // ── Respuesta genérica ──
  const allFinished = matches.filter((m) => m.status === 'finished').length;
  const allPending = matches.filter((m) => m.status !== 'finished').length;

  return (
    `Hola 👋 Puedo ayudarte con información de este campeonato. Por ejemplo:\n\n` +
    `• 📊 Tabla de posiciones\n` +
    `• ⚽ Goleadores\n` +
    `• 📅 Próximos partidos o resultados\n` +
    `• 📍 Recintos y canchas\n` +
    `• 🏆 Info del campeonato\n\n` +
    (allFinished > 0 || allPending > 0
      ? `Hay **${allFinished}** partido${allFinished !== 1 ? 's' : ''} finalizado${allFinished !== 1 ? 's' : ''} y **${allPending}** pendiente${allPending !== 1 ? 's' : ''}.`
      : '') +
    '\n\n¿Qué querés saber?'
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findTeamInQuestion(q: string, matches: MatchData[]): string | null {
  const allTeams = [
    ...new Set(
      matches.flatMap((m) =>
        [m.home_team?.name, m.away_team?.name].filter(Boolean) as string[]
      )
    ),
  ];

  // Primero buscar match exacto de algún fragmento del nombre
  for (const team of allTeams) {
    const teamNorm = norm(team);
    // Verificar si alguna parte del nombre del equipo aparece en la pregunta
    if (q.includes(teamNorm)) return team;
    const teamWords = teamNorm.split(' ').filter((w) => w.length > 2);
    if (teamWords.some((w) => q.includes(w))) return team;
  }

  // Segunda pasada: buscar con palabras de 2+ caracteres (más permisivo)
  for (const team of allTeams) {
    const teamWords = norm(team).split(' ').filter((w) => w.length >= 2);
    if (teamWords.some((w) => q.includes(w) && w !== 'de' && w !== 'la' && w !== 'el' && w !== 'lo' && w !== 'cd' && w !== 'los')) return team;
  }

  return null;
}

function findTeamPairInQuestion(
  q: string,
  matches: MatchData[]
): { home: string; away: string; match: MatchData } | null {
  for (const m of matches) {
    const hn = m.home_team?.name;
    const an = m.away_team?.name;
    if (!hn || !an) continue;
    const hnWords = norm(hn).split(' ').filter((w) => w.length > 2);
    const anWords = norm(an).split(' ').filter((w) => w.length > 2);
    const homeFound = hnWords.some((w) => q.includes(w));
    const awayFound = anWords.some((w) => q.includes(w));
    if (homeFound && awayFound) return { home: hn, away: an, match: m };
  }
  return null;
}

function matchInvolvesTeam(m: MatchData, teamName: string): boolean {
  // Usar coincidencia por palabras en lugar de substring completo
  // Esto maneja casos donde el join retorna null o el nombre difiere levemente
  const teamWords = norm(teamName).split(' ').filter((w) => w.length > 2);
  const hn = norm(m.home_team?.name || '');
  const an = norm(m.away_team?.name || '');
  if (hn === '' && an === '') return true; // si no tenemos info del equipo, incluir el partido
  return teamWords.some((w) => hn.includes(w) || an.includes(w));
}

function formatMatch(m: MatchData): string {
  const home = m.home_team?.name || '?';
  const away = m.away_team?.name || '?';
  const dateStr = m.match_date ? formatMatchDate(m.match_date) : '';
  const roundStr = m.round ? `F${m.round}` : '';

  if (m.status === 'finished' && m.home_score !== null) {
    return `${roundStr ? `[${roundStr}] ` : ''}**${home} ${m.home_score} - ${m.away_score} ${away}**${dateStr ? ` · ${dateStr}` : ''}`;
  }
  return `${roundStr ? `[${roundStr}] ` : ''}${home} vs ${away}${dateStr ? ` · ${dateStr}` : ''} (${translateStatus(m.status)})`;
}

function formatMatchDate(d: string | null): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('es-CL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function formatDate(d: string | null): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d;
  }
}

function translateStatus(s: string): string {
  const map: Record<string, string> = {
    active: 'Activo',
    finished: 'Finalizado',
    draft: 'Borrador',
    scheduled: 'Programado',
    in_progress: 'En curso',
    cancelled: 'Cancelado',
  };
  return map[s] || s;
}

// ─── Renderizado de texto con markdown básico ───────────────────────────────
function renderText(text: string) {
  return text.split('\n').map((line, i) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;
    while (remaining.includes('**')) {
      const start = remaining.indexOf('**');
      const end = remaining.indexOf('**', start + 2);
      if (end === -1) break;
      if (start > 0) parts.push(<span key={key++}>{remaining.slice(0, start)}</span>);
      parts.push(<strong key={key++}>{remaining.slice(start + 2, end)}</strong>);
      remaining = remaining.slice(end + 2);
    }
    if (remaining) parts.push(<span key={key++}>{remaining}</span>);
    return (
      <span key={i}>
        {parts.length > 0 ? parts : line}
        {i < text.split('\n').length - 1 && <br />}
      </span>
    );
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  championshipId: string;
}

export const ChampionshipChat = ({ championshipId }: Props) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [chatData, setChatData] = useState<ChatData | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargar datos cuando abre el chat
  useEffect(() => {
    if (open && !chatData) {
      loadData();
    }
  }, [open]);

  // Scroll al fondo cuando llegan mensajes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Foco al input cuando abre
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const loadData = async () => {
    setDataLoading(true);
    try {
      const [champRes, matchesRes] = await Promise.all([
        supabase
          .from('championships')
          .select('name, sport, venue, status, start_date, end_date, description')
          .eq('id', championshipId)
          .maybeSingle(),
        supabase
          .from('matches')
          .select(
            'id, home_score, away_score, status, match_date, round, series, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name), sports_complex:sports_complexes(name, address)'
          )
          .eq('championship_id', championshipId)
          .order('match_date', { ascending: false }),
      ]);

      const matchData = (matchesRes.data || []) as MatchData[];
      const matchIds = matchData.map((m) => m.id);

      // Goleadores desde match_events
      let scorersData: ScorerData[] = [];
      if (matchIds.length > 0) {
        const { data: goalsData } = await supabase
          .from('match_events')
          .select(
            'player_id, additional_info, player_profiles:player_id(id, full_name), teams:team_id(id, name)'
          )
          .in('match_id', matchIds)
          .eq('event_type', 'goal')
          .not('player_id', 'is', null);

        if (goalsData) {
          const scorersMap = new Map<string, ScorerData>();
          goalsData.forEach((goal: any) => {
            if (goal.player_profiles && goal.player_id) {
              const isOwnGoal = goal.additional_info?.type === 'own_goal';
              if (!isOwnGoal) {
                const existing = scorersMap.get(goal.player_id) || {
                  player_name: goal.player_profiles.full_name,
                  team_name: goal.teams?.name || 'Sin equipo',
                  total_goals: 0,
                };
                existing.total_goals += 1;
                scorersMap.set(goal.player_id, existing);
              }
            }
          });
          scorersData = [...scorersMap.values()].sort((a, b) => b.total_goals - a.total_goals);
        }
      }

      // Tabla de posiciones calculada desde partidos
      const standingsMap = new Map<string, TeamData>();
      matchData.forEach((m: any) => {
        if (m.status !== 'finished' || m.home_score === null) return;
        const hn = m.home_team?.name;
        const an = m.away_team?.name;
        if (!hn || !an) return;
        if (!standingsMap.has(hn))
          standingsMap.set(hn, { id: hn, name: hn, points: 0, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0 });
        if (!standingsMap.has(an))
          standingsMap.set(an, { id: an, name: an, points: 0, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0 });
        const h = standingsMap.get(hn)!;
        const a = standingsMap.get(an)!;
        h.played++; a.played++;
        h.goals_for += m.home_score; h.goals_against += m.away_score;
        a.goals_for += m.away_score; a.goals_against += m.home_score;
        if (m.home_score > m.away_score) { h.won++; h.points += 3; a.lost++; }
        else if (m.home_score === m.away_score) { h.drawn++; h.points++; a.drawn++; a.points++; }
        else { a.won++; a.points += 3; h.lost++; }
      });
      const standingsData = [...standingsMap.values()].sort(
        (a, b) => b.points - a.points || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against)
      );

      const data: ChatData = {
        championship: champRes.data || null,
        matches: matchData,
        scorers: scorersData,
        standings: standingsData,
      };
      setChatData(data);

      // Mensaje de bienvenida
      const name = data.championship?.name || 'este campeonato';
      setMessages([{
        id: '0',
        role: 'assistant',
        text: `¡Hola! 👋 Soy el asistente del **${name}**.\n\nPuedo responderte sobre resultados, goleadores, tabla de posiciones, próximos partidos y más. ¿Qué querés saber?`,
        timestamp: new Date(),
      }]);
    } catch (e) {
      console.error('Error loading chat data:', e);
    } finally {
      setDataLoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !chatData) return;
    setShowSuggestions(false);

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Simular pequeño delay para que se sienta más natural
    await new Promise((r) => setTimeout(r, 400));

    const answer = buildAnswer(text, chatData);
    const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', text: answer, timestamp: new Date() };
    setMessages((prev) => [...prev, assistantMsg]);
    setLoading(false);
  };

  const handleSuggestion = (s: string) => {
    sendMessage(s);
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
        title="Chat del campeonato"
      >
        {open ? <ChevronDown className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Panel de chat */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col"
          style={{ height: '520px', maxHeight: 'calc(100vh - 120px)' }}
        >
          {/* Header */}
          <div className="bg-emerald-600 rounded-t-2xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Asistente del Campeonato</p>
                <p className="text-emerald-200 text-xs">Pregunta lo que quieras</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {dataLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">Cargando información...</p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div
                      className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
                        msg.role === 'assistant' ? 'bg-emerald-100' : 'bg-gray-200'
                      }`}
                    >
                      {msg.role === 'assistant' ? (
                        <Bot className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <User className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'assistant'
                          ? 'bg-gray-100 text-gray-800 rounded-tl-sm'
                          : 'bg-emerald-600 text-white rounded-tr-sm'
                      }`}
                    >
                      {renderText(msg.text)}
                    </div>
                  </div>
                ))}

                {/* Sugerencias */}
                {showSuggestions && messages.length === 1 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs text-gray-400 font-medium px-1">Preguntas frecuentes:</p>
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSuggestion(s)}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {/* Indicador de escritura */}
                {loading && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-emerald-100">
                      <Bot className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 flex items-center gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 px-3 py-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder="Escribe tu pregunta..."
                className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                disabled={loading || dataLoading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading || dataLoading}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl w-9 h-9 flex items-center justify-center transition-colors flex-shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
