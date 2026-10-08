import { Championship, League, LeagueAdjustment, LeaguePhase } from '../types/database';

export interface LeagueTeamRow {
  id: string;
  championship_id: string;
  name: string;
  base_team_id?: string | null;
  logo_url?: string | null;
  base_logo_url?: string | null;
}

export interface LeagueMatchRow {
  id: string;
  championship_id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  round: number;
  home_score: number | null;
  away_score: number | null;
  status: string;
  venue?: string | null;
}

/** Fila de `teams` tal como la devuelve Supabase con el join a base_teams. */
export interface RawTeamRow {
  id: string;
  championship_id: string;
  name: string;
  base_team_id?: string | null;
  logo_url?: string | null;
  base_team?: { logo_url?: string | null } | { logo_url?: string | null }[] | null;
}

export const toLeagueTeam = (t: RawTeamRow): LeagueTeamRow => {
  const bt = Array.isArray(t.base_team) ? t.base_team[0] : t.base_team;
  return {
    id: t.id,
    championship_id: t.championship_id,
    name: t.name,
    base_team_id: t.base_team_id,
    logo_url: t.logo_url,
    base_logo_url: bt?.logo_url ?? null,
  };
};

export interface Club {
  key: string; // base_team_id, o "name:<nombre>" si el equipo no tiene club base
  name: string;
  logo_url?: string | null;
}

export interface SeriesStanding {
  team_id: string;
  club_key: string;
  name: string;
  logo_url?: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
}

export interface GeneralRow {
  club: Club;
  bySeries: Record<string, number | null>; // championship_id -> puntos (null = sin equipo en esa serie)
  played: number;
  goal_difference: number;
  adjustment_points: number;
  adjustment_gd: number;
  points: number;
  hasPending: boolean;
}

export const isFinished = (m: LeagueMatchRow) =>
  m.status === 'finished' || m.status === 'completed';

const normalize = (s: string) => s.trim().toLowerCase();

export const clubKeyOf = (t: LeagueTeamRow) =>
  t.base_team_id ? t.base_team_id : `name:${normalize(t.name)}`;

export const buildClubs = (teams: LeagueTeamRow[]): Map<string, Club> => {
  const clubs = new Map<string, Club>();
  teams.forEach((t) => {
    const key = clubKeyOf(t);
    const existing = clubs.get(key);
    const logo = t.base_logo_url || t.logo_url || null;
    if (!existing) clubs.set(key, { key, name: t.name.trim(), logo_url: logo });
    else if (!existing.logo_url && logo) existing.logo_url = logo;
  });
  return clubs;
};

const pointsFor = (gf: number, ga: number, league: Pick<League, 'points_win' | 'points_draw' | 'points_loss'>) =>
  gf > ga ? league.points_win : gf === ga ? league.points_draw : league.points_loss;

const inRange = (round: number, phase?: LeaguePhase | null) =>
  !phase || (round >= phase.round_from && round <= phase.round_to);

/** Tabla de una serie (campeonato), opcionalmente limitada a una fase. */
export const seriesStandings = (
  championshipId: string,
  teams: LeagueTeamRow[],
  matches: LeagueMatchRow[],
  league: Pick<League, 'points_win' | 'points_draw' | 'points_loss'>,
  phase?: LeaguePhase | null
): SeriesStanding[] => {
  const map = new Map<string, SeriesStanding>();
  teams
    .filter((t) => t.championship_id === championshipId)
    .forEach((t) =>
      map.set(t.id, {
        team_id: t.id,
        club_key: clubKeyOf(t),
        name: t.name.trim(),
        logo_url: t.base_logo_url || t.logo_url || null,
        played: 0, won: 0, drawn: 0, lost: 0,
        goals_for: 0, goals_against: 0, goal_difference: 0, points: 0,
      })
    );

  matches
    .filter((m) => m.championship_id === championshipId && isFinished(m) && inRange(m.round, phase))
    .forEach((m) => {
      const h = map.get(m.home_team_id);
      const a = map.get(m.away_team_id);
      if (!h || !a) return;
      const hs = m.home_score ?? 0;
      const as = m.away_score ?? 0;
      for (const [row, gf, ga] of [[h, hs, as], [a, as, hs]] as const) {
        row.played++;
        row.goals_for += gf;
        row.goals_against += ga;
        row.goal_difference = row.goals_for - row.goals_against;
        row.points += pointsFor(gf, ga, league);
        if (gf > ga) row.won++;
        else if (gf === ga) row.drawn++;
        else row.lost++;
      }
    });

  return Array.from(map.values()).sort(
    (x, y) =>
      y.points - x.points ||
      y.goal_difference - x.goal_difference ||
      y.goals_for - x.goals_for ||
      x.name.localeCompare(y.name)
  );
};

/**
 * Tabla general: suma por club de los puntos de todas las series,
 * dentro de la fase indicada (o acumulada si no hay fase), más ajustes.
 */
export const generalStandings = (
  league: League,
  series: Championship[],
  teams: LeagueTeamRow[],
  matches: LeagueMatchRow[],
  adjustments: LeagueAdjustment[],
  phase?: LeaguePhase | null
): GeneralRow[] => {
  const clubs = buildClubs(teams);
  const rows = new Map<string, GeneralRow>();
  clubs.forEach((club) =>
    rows.set(club.key, {
      club,
      bySeries: Object.fromEntries(series.map((s) => [s.id, null])),
      played: 0,
      goal_difference: 0,
      adjustment_points: 0,
      adjustment_gd: 0,
      points: 0,
      hasPending: false,
    })
  );

  series.forEach((s) => {
    seriesStandings(s.id, teams, matches, league, phase).forEach((st) => {
      const row = rows.get(st.club_key);
      if (!row) return;
      row.bySeries[s.id] = (row.bySeries[s.id] ?? 0) + st.points;
      row.played += st.played;
      row.goal_difference += st.goal_difference;
      row.points += st.points;
    });
  });

  // Partidos pendientes: programados en una fecha que ya pasó, dentro de la fase
  const now = Date.now();
  const teamClub = new Map(teams.map((t) => [t.id, clubKeyOf(t)]));
  matches
    .filter((m) => !isFinished(m) && m.status !== 'cancelled' && inRange(m.round, phase) && new Date(m.match_date).getTime() < now)
    .forEach((m) => {
      [m.home_team_id, m.away_team_id].forEach((tid) => {
        const row = rows.get(teamClub.get(tid) || '');
        if (row) row.hasPending = true;
      });
    });

  adjustments
    .filter((adj) => !adj.phase_id || (phase && adj.phase_id === phase.id))
    .forEach((adj) => {
      const row = rows.get(adj.base_team_id);
      if (!row) return;
      row.adjustment_points += adj.points;
      row.adjustment_gd += adj.goal_difference;
      row.points += adj.points;
      row.goal_difference += adj.goal_difference;
    });

  return Array.from(rows.values()).sort(
    (x, y) =>
      y.points - x.points ||
      y.goal_difference - x.goal_difference ||
      x.club.name.localeCompare(y.club.name)
  );
};

export interface Encounter {
  key: string;
  round: number;
  date: string;
  venue?: string | null;
  home: Club;
  away: Club;
  lines: { championship: Championship; match: LeagueMatchRow }[];
  homeSeriesWon: number;
  awaySeriesWon: number;
  finishedCount: number;
}

/** Agrupa los partidos de todas las series en encuentros club vs club por fecha. */
export const buildEncounters = (
  series: Championship[],
  teams: LeagueTeamRow[],
  matches: LeagueMatchRow[]
): Encounter[] => {
  const clubs = buildClubs(teams);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const seriesById = new Map(series.map((s) => [s.id, s]));
  const order = new Map(series.map((s, i) => [s.id, i]));
  const enc = new Map<string, Encounter>();

  matches.forEach((m) => {
    const ht = teamById.get(m.home_team_id);
    const at = teamById.get(m.away_team_id);
    const champ = seriesById.get(m.championship_id);
    if (!ht || !at || !champ) return;
    const hk = clubKeyOf(ht);
    const ak = clubKeyOf(at);
    const pair = [hk, ak].sort().join('|');
    const key = `${m.round}|${pair}`;
    let e = enc.get(key);
    if (!e) {
      e = {
        key,
        round: m.round,
        date: m.match_date,
        venue: m.venue,
        home: clubs.get(hk)!,
        away: clubs.get(ak)!,
        lines: [],
        homeSeriesWon: 0,
        awaySeriesWon: 0,
        finishedCount: 0,
      };
      enc.set(key, e);
    }
    if (!e.venue && m.venue) e.venue = m.venue;
    // Si el orden local/visita difiere en esta serie, invertimos el marcador para mostrarlo según el encuentro
    const flipped = hk !== e.home.key;
    const line = flipped
      ? { ...m, home_score: m.away_score, away_score: m.home_score }
      : m;
    e.lines.push({ championship: champ, match: line });
    if (isFinished(m)) {
      e.finishedCount++;
      const hs = line.home_score ?? 0;
      const as = line.away_score ?? 0;
      if (hs > as) e.homeSeriesWon++;
      else if (as > hs) e.awaySeriesWon++;
    }
  });

  return Array.from(enc.values())
    .map((e) => ({
      ...e,
      lines: e.lines.sort((a, b) => (order.get(a.championship.id) ?? 0) - (order.get(b.championship.id) ?? 0)),
    }))
    .sort((a, b) => a.round - b.round || a.home.name.localeCompare(b.home.name));
};

export const seriesLabel = (c: Championship) => c.series_name?.trim() || c.name;
