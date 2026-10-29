import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { LeagueNotice, LeagueNoticeKind } from '../types/home';

export interface LeaguePost extends LeagueNotice {
  expires_at: string | null;
  updated_at: string;
}

export interface LeaguePostInput {
  kind: LeagueNoticeKind;
  title: string;
  body: string;
  pinned: boolean;
  expires_at: string | null;
}

const PAGE = 10;
const COLS = 'id, league_id, kind, title, body, pinned, expires_at, created_at, updated_at';

/** Error de "la tabla no existe" (migración sin aplicar): el muro simplemente no se muestra. */
const isMissing = (code?: string) => code === '42P01' || code === 'PGRST205';

/** Muro de una liga: avisos paginados (fijados primero) y, para el organizador, publicar/editar/borrar. */
export const useLeaguePosts = (leagueId: string | undefined) => {
  const [posts, setPosts] = useState<LeaguePost[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(
    async (offset: number) => {
      if (!leagueId) return;
      const { data, error } = await supabase
        .from('league_posts')
        .select(COLS)
        .eq('league_id', leagueId)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE);
      if (error) {
        if (isMissing(error.code)) setStatus('unavailable');
        else console.error('league_posts', error);
        if (offset === 0) setPosts([]);
        return;
      }
      const rows = (data || []) as LeaguePost[];
      setHasMore(rows.length > PAGE);
      const page = rows.slice(0, PAGE);
      setPosts((prev) => (offset === 0 ? page : [...prev, ...page.filter((p) => !prev.some((x) => x.id === p.id))]));
      setStatus('ready');
    },
    [leagueId]
  );

  useEffect(() => {
    setStatus('loading');
    fetchPage(0);
  }, [fetchPage]);

  const loadMore = useCallback(() => fetchPage(posts.length), [fetchPage, posts.length]);

  const create = useCallback(
    async (input: LeaguePostInput): Promise<string | null> => {
      if (!leagueId) return 'Liga no encontrada.';
      const { error } = await supabase.from('league_posts').insert({ league_id: leagueId, ...input, body: input.body || null });
      if (error) return error.message || 'No se pudo publicar.';
      await fetchPage(0);
      return null;
    },
    [leagueId, fetchPage]
  );

  const update = useCallback(
    async (id: string, input: Partial<LeaguePostInput>): Promise<string | null> => {
      const patch = 'body' in input ? { ...input, body: input.body || null } : input;
      const { error } = await supabase.from('league_posts').update(patch).eq('id', id);
      if (error) return error.message || 'No se pudo guardar.';
      await fetchPage(0);
      return null;
    },
    [fetchPage]
  );

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from('league_posts').delete().eq('id', id);
    if (error) return error.message || 'No se pudo borrar.';
    setPosts((prev) => prev.filter((p) => p.id !== id));
    return null;
  }, []);

  return { posts, status, hasMore, loadMore, create, update, remove };
};

/** Aviso vigente de una liga (página de una serie). Una consulta liviana; null si no hay. */
export const useLeagueNotice = (leagueId: string | null | undefined) => {
  const [notice, setNotice] = useState<LeagueNotice | null>(null);
  useEffect(() => {
    setNotice(null);
    if (!leagueId) return;
    const c = new AbortController();
    supabase
      .rpc('league_active_notice', { p_league_id: leagueId })
      .abortSignal(c.signal)
      .then(({ data, error }) => {
        if (c.signal.aborted) return;
        if (!error && data) setNotice(data as LeagueNotice);
      });
    return () => c.abort();
  }, [leagueId]);
  return notice;
};

/** Avisos vigentes de las ligas que sigue el usuario conectado (Inicio). */
export const useMyLeagueNotices = (enabled: boolean, version: number) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [notices, setNotices] = useState<LeagueNotice[]>([]);
  useEffect(() => {
    if (!enabled || !userId) {
      setNotices([]);
      return;
    }
    const c = new AbortController();
    supabase
      .rpc('my_league_notices')
      .abortSignal(c.signal)
      .then(({ data, error }) => {
        if (c.signal.aborted) return;
        setNotices(!error && Array.isArray(data) ? (data as LeagueNotice[]) : []);
      });
    return () => c.abort();
  }, [enabled, userId, version]);
  return notices;
};
