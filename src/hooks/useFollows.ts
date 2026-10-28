import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { HomeMatch } from '../types/home';

/**
 * Campeonatos que sigue el usuario conectado. Un solo almacén por pestaña: el botón "Seguir"
 * de cualquier pantalla y la sección del Inicio comparten el mismo estado sin volver a consultar.
 */
type Store = { userId: string | null; ids: Set<string>; loaded: boolean; version: number };
let store: Store = { userId: null, ids: new Set(), loaded: false, version: 0 };
const listeners = new Set<() => void>();
const emit = () => {
  store = { ...store, version: store.version + 1 };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
let inflight: Promise<void> | null = null;

const loadIds = (userId: string) => {
  if (store.userId === userId && (store.loaded || inflight)) return inflight ?? Promise.resolve();
  store = { userId, ids: new Set(), loaded: false, version: store.version };
  inflight = (async () => {
    const { data, error } = await supabase.from('championship_follows').select('championship_id').eq('user_id', userId).limit(200);
    inflight = null;
    if (store.userId !== userId) return;
    if (error) {
      // Sin la migración la tabla no existe: los botones simplemente no se muestran
      console.error('championship_follows', error);
      return;
    }
    store.ids = new Set((data || []).map((r) => r.championship_id as string));
    store.loaded = true;
    emit();
  })();
  return inflight;
};

export const useFollows = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const snap = useSyncExternalStore(subscribe, () => store);

  useEffect(() => {
    if (userId) loadIds(userId);
  }, [userId]);

  const isFollowing = useCallback((championshipId: string) => snap.userId === userId && snap.ids.has(championshipId), [snap, userId]);

  /** Seguir o dejar de seguir (optimista; si falla, vuelve atrás y devuelve el error). */
  const toggle = useCallback(
    async (championshipId: string): Promise<string | null> => {
      if (!userId) return 'Debes iniciar sesión.';
      const following = store.ids.has(championshipId);
      const next = new Set(store.ids);
      if (following) next.delete(championshipId);
      else next.add(championshipId);
      store.ids = next;
      emit();
      const { error } = following
        ? await supabase.from('championship_follows').delete().eq('user_id', userId).eq('championship_id', championshipId)
        : await supabase.from('championship_follows').insert({ user_id: userId, championship_id: championshipId });
      if (error && error.code !== '23505') {
        const back = new Set(store.ids);
        if (following) back.add(championshipId);
        else back.delete(championshipId);
        store.ids = back;
        emit();
        return error.message || 'No se pudo guardar.';
      }
      invalidateFollowFeed();
      return null;
    },
    [userId]
  );

  /** Seguir o dejar de seguir todas las series de una liga. */
  const setLeague = useCallback(
    async (leagueId: string, seriesIds: string[], follow: boolean): Promise<string | null> => {
      if (!userId) return 'Debes iniciar sesión.';
      const prev = store.ids;
      const next = new Set(prev);
      seriesIds.forEach((id) => (follow ? next.add(id) : next.delete(id)));
      store.ids = next;
      emit();
      const { error } = await supabase.rpc('follow_league', { p_league_id: leagueId, p_follow: follow });
      if (error) {
        store.ids = prev;
        emit();
        return error.message || 'No se pudo guardar.';
      }
      invalidateFollowFeed();
      return null;
    },
    [userId]
  );

  return { enabled: !!userId && snap.loaded, loggedIn: !!userId, isFollowing, toggle, setLeague, count: snap.ids.size };
};

export interface FollowedChampionship {
  id: string;
  name: string;
  series_name: string | null;
  league_name: string | null;
  image_url: string | null;
  status: string;
}
export interface FollowFeed {
  championships: FollowedChampionship[];
  results: HomeMatch[];
  upcoming: HomeMatch[];
}

let feedCache: { userId: string; at: number; data: FollowFeed } | null = null;
const FEED_TTL = 60_000;
export const invalidateFollowFeed = () => {
  feedCache = null;
};

/** Inicio: lo que sigo (resultados y próximos partidos) en una sola llamada al servidor. */
export const useFollowFeed = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { version } = useSyncExternalStore(subscribe, () => store);
  const [feed, setFeed] = useState<FollowFeed | null>(() =>
    feedCache && feedCache.userId === userId && Date.now() - feedCache.at < FEED_TTL ? feedCache.data : null
  );
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(feed ? 'ready' : 'idle');
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!userId) {
      setFeed(null);
      setStatus('idle');
      return;
    }
    if (feedCache && feedCache.userId === userId && Date.now() - feedCache.at < FEED_TTL) {
      setFeed(feedCache.data);
      setStatus('ready');
      return;
    }
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    supabase
      .rpc('my_follow_feed', { p_limit: 6 })
      .abortSignal(c.signal)
      .then(({ data, error }) => {
        if (c.signal.aborted) return;
        if (error || !data) {
          console.error('my_follow_feed', error);
          setStatus('error');
          return;
        }
        feedCache = { userId, at: Date.now(), data: data as FollowFeed };
        setFeed(data as FollowFeed);
        setStatus('ready');
      });
    return () => c.abort();
    // version: al seguir o dejar de seguir se recalcula
  }, [userId, version]);

  return { feed, status };
};
