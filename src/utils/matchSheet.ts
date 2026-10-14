/**
 * Papeletas de partido: tipos compartidos y conversión entre
 * lo que leyó la IA (read-match-sheet), lo que revisa el administrador
 * y lo que se guarda (apply_match_sheet).
 */

export const PRINTED_ROWS = 24;

export interface SheetRosterRow {
  row: number;
  player_id: string;
  name: string;
}

export interface SheetTeam {
  team_id: string;
  name: string;
  roster: SheetRosterRow[];
}

/** Fila de match_sheet_contexts(): lo que se imprime en la papeleta. */
export interface MatchSheetContext {
  match_id: string;
  code: string;
  championship_id: string;
  championship: string;
  series: string | null;
  league: string | null;
  round: number | null;
  match_date: string;
  venue: string | null;
  status: string;
  home: SheetTeam;
  away: SheetTeam;
}

interface AiRow {
  fila: number;
  nombre_escrito: string | null;
  numero: string | null;
  firmo: boolean;
  goles: number;
  amarilla: boolean;
  roja: boolean;
  dudoso: boolean;
  motivo: string | null;
}

interface AiTeam {
  filas: AiRow[];
  autogoles_a_favor: number;
}

/** Lo que devuelve la herramienta registrar_papeleta. */
export interface AiSheetResult {
  es_papeleta_mediogol: boolean;
  codigo_leido: string | null;
  marcador: { local: number | null; visita: number | null; dudoso: boolean; motivo: string | null };
  wo: 'local' | 'visita' | null;
  local: AiTeam;
  visita: AiTeam;
  observaciones: string | null;
  firmas: { turno: boolean; arbitro: boolean; capitan_local: boolean; capitan_visita: boolean };
  advertencias: string[];
}

export type Side = 'home' | 'away';

/** Fila editable en la pantalla de revisión. */
export interface ReviewRow {
  key: string;
  side: Side;
  row: number;
  player_id: string | null;
  name: string;
  jersey: string;
  played: boolean;
  goals: number;
  yellow: boolean;
  red: boolean;
  flagged: boolean;
  reason: string | null;
}

export interface ReviewState {
  homeScore: string;
  awayScore: string;
  scoreFlagged: boolean;
  scoreReason: string | null;
  ownGoals: Record<Side, number>;
  rows: ReviewRow[];
  notes: string;
  warnings: string[];
}

const clampInt = (n: unknown, min: number, max: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
};

/** Combina el contexto impreso con lo leído y marca lo que necesita revisión. */
export const buildReview = (ctx: MatchSheetContext, ai: AiSheetResult): ReviewState => {
  const warnings = [...(ai.advertencias || [])];
  if (!ai.es_papeleta_mediogol) warnings.unshift('La foto no parece una papeleta de MedioGol o no se lee bien.');
  if (ai.codigo_leido && ai.codigo_leido.replace(/\s/g, '').toUpperCase() !== ctx.code) {
    warnings.unshift(`El código leído (${ai.codigo_leido}) no coincide con este partido (${ctx.code}). Revisa que sea la papeleta correcta.`);
  }

  const rows: ReviewRow[] = [];
  (['home', 'away'] as Side[]).forEach((side) => {
    const team = side === 'home' ? ctx.home : ctx.away;
    const aiTeam = side === 'home' ? ai.local : ai.visita;
    const seen = new Set<number>();
    (aiTeam?.filas || []).forEach((f) => {
      const rowNum = clampInt(f.fila, 1, PRINTED_ROWS);
      if (seen.has(rowNum)) return;
      seen.add(rowNum);
      const printed = team.roster.find((r) => r.row === rowNum);
      const written = (f.nombre_escrito || '').trim();
      const unregistered = !printed;
      const reasons = [f.dudoso ? f.motivo || 'Revisar' : null];
      if (unregistered && written) reasons.push('No está en la nómina del equipo');
      if (unregistered && !written) reasons.push('Fila en blanco sin nombre legible');
      if ((f.goles > 0 || f.amarilla || f.roja) && !f.firmo) reasons.push('Tiene goles o tarjetas pero no firmó');
      const reason = reasons.filter(Boolean).join(' · ') || null;
      rows.push({
        key: `${side}-${rowNum}`,
        side,
        row: rowNum,
        player_id: printed?.player_id ?? null,
        name: printed?.name ?? written,
        jersey: (f.numero || '').trim(),
        played: !!f.firmo,
        goals: clampInt(f.goles, 0, 4),
        yellow: !!f.amarilla,
        red: !!f.roja,
        flagged: !!reason,
        reason,
      });
    });
  });
  rows.sort((a, b) => (a.side === b.side ? a.row - b.row : a.side === 'home' ? -1 : 1));

  const ownGoals = {
    home: clampInt(ai.local?.autogoles_a_favor ?? 0, 0, 20),
    away: clampInt(ai.visita?.autogoles_a_favor ?? 0, 0, 20),
  };
  const homeScore = ai.marcador?.local;
  const awayScore = ai.marcador?.visita;
  const goalsBy = (side: Side) => rows.filter((r) => r.side === side).reduce((s, r) => s + r.goals, 0) + ownGoals[side];
  let scoreReason = ai.marcador?.dudoso ? ai.marcador.motivo || 'Revisar el marcador' : null;
  if (homeScore != null && awayScore != null && (goalsBy('home') !== homeScore || goalsBy('away') !== awayScore)) {
    scoreReason = [scoreReason, `Los goles marcados suman ${goalsBy('home')}–${goalsBy('away')}`].filter(Boolean).join(' · ');
  }
  if (ai.wo) warnings.unshift(`Marcado como W.O.: no se presentó el equipo ${ai.wo === 'local' ? 'local' : 'visita'}.`);

  return {
    homeScore: homeScore == null ? '' : String(homeScore),
    awayScore: awayScore == null ? '' : String(awayScore),
    scoreFlagged: !!scoreReason || homeScore == null || awayScore == null,
    scoreReason: scoreReason || (homeScore == null || awayScore == null ? 'No se leyó el marcador' : null),
    ownGoals,
    rows,
    notes: ai.observaciones || '',
    warnings,
  };
};

export const goalsFromRows = (state: ReviewState, side: Side) =>
  state.rows.filter((r) => r.side === side).reduce((s, r) => s + r.goals, 0) + state.ownGoals[side];

/** Payload de apply_match_sheet(). */
export const toPayload = (state: ReviewState) => {
  const events: { side: Side; type: string; player_id: string | null; name: string | null; jersey: string | null }[] = [];
  state.rows.forEach((r) => {
    const base = { side: r.side, player_id: r.player_id, name: r.player_id ? null : r.name || null, jersey: r.jersey || null };
    for (let i = 0; i < r.goals; i++) events.push({ ...base, type: 'goal' });
    if (r.yellow) events.push({ ...base, type: 'yellow_card' });
    if (r.red) events.push({ ...base, type: 'red_card' });
  });
  (['home', 'away'] as Side[]).forEach((side) => {
    for (let i = 0; i < state.ownGoals[side]; i++) events.push({ side, type: 'own_goal', player_id: null, name: null, jersey: null });
  });
  return {
    home_score: Number(state.homeScore),
    away_score: Number(state.awayScore),
    events,
    participants: state.rows
      .filter((r) => r.played)
      .map((r) => ({ side: r.side, player_id: r.player_id, name: r.player_id ? null : r.name || null, jersey: r.jersey || null })),
    notes: state.notes.trim().slice(0, NOTES_MAX) || null,
  };
};

/** Largo máximo de las observaciones (igual que el CHECK de matches.notes). */
export const NOTES_MAX = 1000;

/**
 * Aviso si la observación habla de una expulsión pero no hay ninguna roja marcada
 * (el árbitro suele anotarla solo en observaciones).
 */
export const notesWarning = (state: ReviewState): string | null => {
  const t = state.notes.toLowerCase();
  if (!t.trim()) return null;
  const mentionsRed = /expuls|tarjeta roja|\broja\b|\btr\b|doble amarilla/.test(t);
  if (mentionsRed && !state.rows.some((r) => r.red)) {
    return 'La observación menciona una expulsión, pero no hay ninguna roja marcada. Márcala en el jugador si corresponde.';
  }
  return null;
};

/** Reduce la foto a 1600 px de lado mayor en JPEG (menos tokens, subida más rápida). */
export const prepareImage = async (file: File): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto'))), 'image/jpeg', 0.85)
  );
};

export const sheetUrl = (matchId: string) => `${window.location.origin}/papeleta/${matchId}`;
