import { PlayPosition, TeamSide } from '../types/playGroups';

/**
 * Arma dos equipos parejos.
 *  1. Arqueros primero: uno para cada lado.
 *  2. Draft "serpiente" por nivel: el mejor que queda va al equipo que suma menos.
 *  3. Intercambios de a pares mientras mejoren el puntaje:
 *     diferencia de nivel + desbalance de posiciones + repetir los mismos equipos de la semana pasada.
 * `seed` cambia levemente los niveles para ofrecer otra combinación pareja ("Rearmar").
 */
export interface BalancePlayer {
  key: string; // id del miembro o "g:<id>" para su invitado
  rating: number;
  position: PlayPosition | null;
}

export interface BalanceResult {
  teams: Record<string, TeamSide>;
  sumA: number;
  sumB: number;
  avgA: number;
  avgB: number;
}

const POSITION_WEIGHT = 35;
const KEEPER_WEIGHT = 1000; // los arqueros se reparten siempre
const REPEAT_WEIGHT = 6;

const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
};

export const balanceTeams = (players: BalancePlayer[], opts: { seed?: number; previous?: Record<string, TeamSide> | null } = {}): BalanceResult => {
  const rand = rng(opts.seed ?? 0);
  const noise = opts.seed ? 70 : 0;
  const level = new Map(players.map((p) => [p.key, p.rating + (noise ? (rand() - 0.5) * 2 * noise : 0)]));
  const cap = Math.ceil(players.length / 2);
  const teams: Record<string, TeamSide> = {};
  const sum = { A: 0, B: 0 };
  const size = { A: 0, B: 0 };
  const put = (p: BalancePlayer, side: TeamSide) => {
    teams[p.key] = side;
    sum[side] += level.get(p.key) || 0;
    size[side] += 1;
  };
  const lighter = (): TeamSide => {
    if (size.A >= cap) return 'B';
    if (size.B >= cap) return 'A';
    if (sum.A !== sum.B) return sum.A < sum.B ? 'A' : 'B';
    return size.A <= size.B ? 'A' : 'B';
  };
  const desc = (a: BalancePlayer, b: BalancePlayer) => (level.get(b.key) || 0) - (level.get(a.key) || 0);

  const keepers = players.filter((p) => p.position === 'arquero').sort(desc);
  const field = players.filter((p) => p.position !== 'arquero').sort(desc);
  keepers.forEach((p, i) => put(p, i < 2 ? (i === 0 ? 'A' : 'B') : lighter()));
  field.forEach((p) => put(p, lighter()));

  // Puntaje: menor es mejor
  const prev = opts.previous || null;
  const score = () => {
    let s = 0;
    let a = 0;
    let b = 0;
    const pos: Record<string, number> = {};
    let same = 0;
    let flipped = 0;
    for (const p of players) {
      const side = teams[p.key];
      const l = level.get(p.key) || 0;
      if (side === 'A') a += l;
      else b += l;
      if (p.position) pos[p.position] = (pos[p.position] || 0) + (side === 'A' ? 1 : -1);
      if (prev && prev[p.key]) {
        if (prev[p.key] === side) same++;
        else flipped++;
      }
    }
    s += Math.abs(a - b);
    for (const k of Object.keys(pos)) s += Math.max(Math.abs(pos[k]) - 1, 0) * (k === 'arquero' ? KEEPER_WEIGHT : POSITION_WEIGHT);
    if (prev) s += Math.max(same, flipped) * REPEAT_WEIGHT; // el nombre del equipo da lo mismo
    return s;
  };

  let best = score();
  for (let round = 0; round < 40; round++) {
    let improved = false;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const x = players[i].key;
        const y = players[j].key;
        if (teams[x] === teams[y]) continue;
        const sx = teams[x];
        teams[x] = teams[y];
        teams[y] = sx;
        const s = score();
        if (s + 0.01 < best) {
          best = s;
          improved = true;
        } else {
          teams[y] = teams[x];
          teams[x] = sx;
        }
      }
    }
    if (!improved) break;
  }
  return summarize(players, teams);
};

/** Suma y promedio de nivel real (sin ruido) de una distribución. */
export const summarize = (players: BalancePlayer[], teams: Record<string, TeamSide>): BalanceResult => {
  let sumA = 0;
  let sumB = 0;
  let nA = 0;
  let nB = 0;
  for (const p of players) {
    if (teams[p.key] === 'A') {
      sumA += p.rating;
      nA++;
    } else if (teams[p.key] === 'B') {
      sumB += p.rating;
      nB++;
    }
  }
  return { teams, sumA, sumB, avgA: nA ? sumA / nA : 0, avgB: nB ? sumB / nB : 0 };
};

/** Probabilidad de que gane A según la diferencia de nivel promedio (misma fórmula que el ajuste de nivel). */
export const winChanceA = (avgA: number, avgB: number) => 1 / (1 + Math.pow(10, (avgB - avgA) / 400));
