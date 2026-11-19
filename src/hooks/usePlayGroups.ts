import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { MyPlayGroup, PlayGroupView } from '../types/playGroups';
import { isMissingFeature, readPlayToken } from '../utils/playGroups';

/**
 * Mis grupos fijos (Inicio, Mis equipos y el aviso del menú).
 * Una sola consulta compartida por todas las partes de la página y guardada 60 s,
 * así navegar no repite la llamada. Si la migración aún no está aplicada, devuelve [] en silencio.
 */
type Cache = { uid: string; at: number; data: MyPlayGroup[] };
let cache: Cache | null = null;
let inflight: { uid: string; p: Promise<MyPlayGroup[]> } | null = null;
const listeners = new Set<() => void>();
const TTL = 60_000;

const fetchMine = (uid: string, force = false): Promise<MyPlayGroup[]> => {
  if (!force && cache && cache.uid === uid && Date.now() - cache.at < TTL) return Promise.resolve(cache.data);
  if (!force && inflight && inflight.uid === uid) return inflight.p;
  const p = (async () => {
    const { data, error } = await supabase.rpc('my_play_groups');
    if (error) {
      if (!isMissingFeature(error)) console.error('my_play_groups', error);
      return cache?.uid === uid ? cache.data : [];
    }
    const list = (Array.isArray(data) ? data : []) as MyPlayGroup[];
    cache = { uid, at: Date.now(), data: list };
    listeners.forEach((l) => l());
    return list;
  })().finally(() => {
    if (inflight?.p === p) inflight = null;
  });
  inflight = { uid, p };
  return p;
};

export const invalidateMyPlayGroups = () => {
  cache = null;
};

export const useMyPlayGroups = () => {
  const { profile } = useAuth();
  const uid = profile?.id ?? null;
  const [groups, setGroups] = useState<MyPlayGroup[]>(() => (uid && cache?.uid === uid ? cache.data : []));
  const [loaded, setLoaded] = useState(() => !!uid && cache?.uid === uid);

  useEffect(() => {
    if (!uid) {
      setGroups([]);
      setLoaded(true);
      return;
    }
    let alive = true;
    const sync = () => alive && cache?.uid === uid && setGroups(cache.data);
    listeners.add(sync);
    fetchMine(uid).then((list) => {
      if (!alive) return;
      setGroups(list);
      setLoaded(true);
    });
    return () => {
      alive = false;
      listeners.delete(sync);
    };
  }, [uid]);

  const reload = useCallback(() => (uid ? fetchMine(uid, true).then(setGroups) : Promise.resolve()), [uid]);

  // Pendiente: soy fijo y el grupo pide confirmar, o soy suplente y la lista de suplentes ya se abrió
  const needsMe = (g: MyPlayGroup) => {
    const now = Date.now();
    if (g.status !== 'open' || new Date(g.starts_at).getTime() <= now || new Date(g.opens_at).getTime() > now) return false;
    if (g.my_status === 'auto') return g.fixed_mode === 'confirm';
    return g.my_status == null && new Date(g.subs_at).getTime() <= now && g.used < g.slots;
  };
  const pendingCount = groups.filter(needsMe).length;

  return { groups, loaded, reload, needsMe, pendingCount };
};

/**
 * Vista de un grupo: por id (/grupos/:id) o por código del link (/g/:code).
 * Las mutaciones devuelven el error para mostrarlo y recargan la vista.
 */
export const usePlayGroup = (ref: { id?: string | null; code?: string | null }) => {
  const [view, setView] = useState<PlayGroupView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'missing' | 'forbidden' | 'notfound'>('loading');
  const [token, setToken] = useState<string | null>(() => readPlayToken(ref.code));
  const req = useRef(0);

  const load = useCallback(async () => {
    const n = ++req.current;
    const { data, error } = await supabase.rpc('play_group_view', {
      p_code: ref.code || null,
      p_group: ref.code ? null : ref.id || null,
      p_token: ref.code ? readPlayToken(ref.code) : null,
    });
    if (n !== req.current) return;
    if (error) {
      if (isMissingFeature(error)) setStatus('missing');
      else if (error.code === '42501') setStatus('forbidden');
      else if (error.code === 'P0002') setStatus('notfound');
      else {
        console.error('play_group_view', error);
        setStatus('error');
      }
      return;
    }
    const v = data as PlayGroupView;
    setView(v);
    setStatus('ready');
    // Al abrir por id ya sabemos el código: el token del teléfono (si lo hay) sirve igual
    if (!ref.code && v?.group?.invite_code) setToken(readPlayToken(v.group.invite_code));
  }, [ref.code, ref.id]);

  useEffect(() => {
    setStatus('loading');
    load();
    // Al volver a la pestaña se actualiza la lista (otros pudieron anotarse)
    const onFocus = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      req.current++;
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) return { error, data: null };
      invalidateMyPlayGroups();
      await load();
      return { error: null, data };
    },
    [load]
  );

  return { view, status, reload: load, call, token, setToken };
};
