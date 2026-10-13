import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { readCache, writeCache } from '../utils/sessionCache';
import { HomeChampionship, HomeMatch, HomeScorer, LeagueSummary, PlayerCareer } from '../types/home';

export interface HomeData {
  leagues: LeagueSummary[];
  results: HomeMatch[];
  upcoming: HomeMatch[];
  championships: HomeChampionship[];
  scorers: HomeScorer[];
}

type Status = 'loading' | 'ready' | 'error';

const CACHE_KEY = 'home:v1';
const CACHE_TTL_MS = 60_000;
const MATCH_LIMIT = 6;

const MATCH_SELECT =
  'id, championship_id, match_date, home_score, away_score, status, venue, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name), championship:championships(name, series_name, league:leagues(name))';

/** PostgREST puede devolver un embed como objeto o como arreglo de uno. */
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

type RawMatch = {
  id: string;
  championship_id: string;
  match_date: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  venue: string | null;
  home_team: { name: string } | { name: string }[] | null;
  away_team: { name: string } | { name: string }[] | null;
  championship:
    | { name: string; series_name: string | null; league: { name: string } | { name: string }[] | null }
    | { name: string; series_name: string | null; league: { name: string } | { name: string }[] | null }[]
    | null;
};

const toHomeMatch = (m: RawMatch): HomeMatch => {
  const champ = one(m.championship);
  const league = one(champ?.league ?? null);
  return {
    id: m.id,
    championship_id: m.championship_id,
    match_date: m.match_date,
    home_score: m.home_score,
    away_score: m.away_score,
    status: m.status,
    venue: m.venue,
    home_team_name: one(m.home_team)?.name ?? 'Por definir',
    away_team_name: one(m.away_team)?.name ?? 'Por definir',
    competition: champ ? (league ? `${league.name} · ${champ.series_name || champ.name}` : champ.name) : '',
  };
};

const fetchHome = async (signal: AbortSignal): Promise<HomeData> => {
  const now = new Date().toISOString();
  const [leagues, results, upcoming, championships, scorers] = await Promise.all([
    supabase.rpc('league_summaries', { p_league_ids: null, p_limit: 4 }).abortSignal(signal),
    supabase
      .from('matches')
      .select(MATCH_SELECT)
      .eq('status', 'finished')
      .lte('match_date', now)
      .order('match_date', { ascending: false })
      .limit(MATCH_LIMIT)
      .abortSignal(signal),
    supabase
      .from('matches')
      .select(MATCH_SELECT)
      .eq('status', 'scheduled')
      .gte('match_date', now)
      .order('match_date', { ascending: true })
      .limit(MATCH_LIMIT)
      .abortSignal(signal),
    supabase
      .from('championships')
      .select('id, name, sport, venue, start_date, image_url, admin_id')
      .eq('status', 'active')
      .is('league_id', null)
      .order('created_at', { ascending: false })
      .limit(6)
      .abortSignal(signal),
    supabase.rpc('home_top_scorers', { p_limit: 5 }).abortSignal(signal),
  ]);

  const failed = [leagues, results, upcoming, championships, scorers].find((r) => r.error);
  if (failed?.error) throw failed.error;

  return {
    leagues: (leagues.data ?? []) as LeagueSummary[],
    results: ((results.data ?? []) as RawMatch[]).map(toHomeMatch),
    upcoming: ((upcoming.data ?? []) as RawMatch[]).map(toHomeMatch),
    championships: (championships.data ?? []) as HomeChampionship[],
    scorers: (scorers.data ?? []) as HomeScorer[],
  };
};

/**
 * Datos públicos del Inicio: 5 consultas en paralelo, todas acotadas (LIMIT) y servidas por índices.
 * Se cachean 60 s en la sesión; las peticiones en vuelo se cancelan al salir de la página.
 */
export const useHomeData = () => {
  const [data, setData] = useState<HomeData | null>(() => readCache<HomeData>(CACHE_KEY, CACHE_TTL_MS)?.value ?? null);
  const [status, setStatus] = useState<Status>(() => (data ? 'ready' : 'loading'));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const cached = readCache<HomeData>(CACHE_KEY, CACHE_TTL_MS);
    if (cached?.fresh && attempt === 0) return;

    const controller = new AbortController();
    if (!cached) setStatus('loading');
    fetchHome(controller.signal)
      .then((fresh) => {
        writeCache(CACHE_KEY, fresh);
        setData(fresh);
        setStatus('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Error cargando el Inicio:', err);
        // Si hay datos en caché se siguen mostrando; si no, se ofrece reintentar
        setStatus(cached ? 'ready' : 'error');
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { data, status, retry };
};

/** Ficha del usuario conectado (privada: no se cachea). */
export const usePlayerCareer = (userId: string | undefined) => {
  const [career, setCareer] = useState<PlayerCareer | null>(null);

  useEffect(() => {
    setCareer(null);
    if (!userId) return;
    const controller = new AbortController();
    supabase
      .from('player_career_stats')
      .select('id, full_name, position, photo_url, matches_played, total_goals, total_assists, avg_rating')
      .eq('id', userId)
      .abortSignal(controller.signal)
      .maybeSingle()
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) console.error('Error cargando la ficha del jugador:', error);
        else setCareer((data as PlayerCareer | null) ?? null);
      });
    return () => controller.abort();
  }, [userId]);

  return career;
};
