import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { CashKind, CashCategory, CashMovement, CashOverview } from '../types/leagueCash';

type Status = 'loading' | 'ready' | 'denied' | 'missing' | 'error';
const PAGE = 100;

export interface CashFilters {
  from: string | null;
  to: string;
  kind: CashKind | null;
  category: CashCategory | null;
  includeVoid: boolean;
}

/** Caja de la liga: resumen del período + movimientos paginados (cursor). Datos privados: sin caché. */
export const useLeagueCash = (leagueId: string, filters: CashFilters) => {
  const [status, setStatus] = useState<Status>('loading');
  const [overview, setOverview] = useState<CashOverview | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const { from, to, kind, category, includeVoid } = filters;

  const listArgs = useCallback(
    (cursor?: CashMovement) => ({
      p_league: leagueId,
      p_from: from,
      p_to: to,
      p_kind: kind,
      p_category: category,
      p_include_void: includeVoid,
      p_before_day: cursor?.occurred_on ?? null,
      p_before_created: cursor?.created_at ?? null,
      p_limit: PAGE,
    }),
    [leagueId, from, to, kind, category, includeVoid]
  );

  const load = useCallback(async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    const [ov, list] = await Promise.all([
      supabase.rpc('league_cash_overview', { p_league: leagueId, p_from: from, p_to: to }).abortSignal(c.signal),
      supabase.rpc('league_cash_list', listArgs()).abortSignal(c.signal),
    ]);
    if (c.signal.aborted) return;
    const err = ov.error || list.error;
    if (err?.code === '42501') return setStatus('denied');
    if (err?.code === 'PGRST202' || err?.code === '42883') return setStatus('missing');
    if (err) {
      console.error('league cash', err);
      return setStatus('error');
    }
    const rows = (list.data || []) as CashMovement[];
    setOverview(ov.data as CashOverview);
    setMovements(rows);
    setHasMore(rows.length === PAGE);
    setStatus('ready');
  }, [leagueId, from, to, listArgs]);

  const loadMore = useCallback(async () => {
    const last = movements[movements.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    const { data, error } = await supabase.rpc('league_cash_list', listArgs(last));
    setLoadingMore(false);
    if (error) return console.error('league cash more', error);
    const rows = (data || []) as CashMovement[];
    setMovements((m) => [...m, ...rows]);
    setHasMore(rows.length === PAGE);
  }, [movements, loadingMore, listArgs]);

  /** Todos los movimientos del período (para exportar), hasta 10.000. */
  const fetchAll = useCallback(async () => {
    const all: CashMovement[] = [];
    let cursor: CashMovement | undefined;
    for (let i = 0; i < 10; i++) {
      const { data, error } = await supabase.rpc('league_cash_list', { ...listArgs(cursor), p_limit: 1000 });
      if (error) throw error;
      const rows = (data || []) as CashMovement[];
      all.push(...rows);
      if (rows.length < 1000) break;
      cursor = rows[rows.length - 1];
    }
    return all;
  }, [listArgs]);

  useEffect(() => {
    load();
    return () => ctrl.current?.abort();
  }, [load]);

  return { status, overview, movements, hasMore, loadingMore, loadMore, fetchAll, reload: load };
};
