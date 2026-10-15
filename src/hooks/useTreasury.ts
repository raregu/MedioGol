import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { TreasuryOverview, TreasuryRole, TreasuryStatement } from '../types/treasury';

type Status = 'loading' | 'ready' | 'denied' | 'error';

/** Rol del usuario en la tesorería del equipo (decide qué pantalla ver). Datos privados: sin caché. */
export const useTreasuryRole = (baseTeamId: string) => {
  const [role, setRole] = useState<TreasuryRole | null | undefined>(undefined);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setRole(undefined);
    supabase
      .rpc('treasury_role', { p_base_team_id: baseTeamId })
      .abortSignal(controller.signal)
      .then(({ data, error: rpcError }) => {
        if (controller.signal.aborted) return;
        if (rpcError) {
          console.error('treasury_role', rpcError);
          setError(true);
          return;
        }
        setRole((data as TreasuryRole | null) ?? null);
      });
    return () => controller.abort();
  }, [baseTeamId]);
  return { role, error };
};

const useRpc = <T,>(fn: string, args: Record<string, unknown>, key: string) => {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<T | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const argsRef = useRef(args);
  argsRef.current = args;

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    const { data: result, error } = await supabase.rpc(fn, argsRef.current).abortSignal(controller.signal);
    if (controller.signal.aborted) return;
    if (error?.code === '42501') return setStatus('denied');
    if (error || !result) {
      console.error(fn, error);
      return setStatus('error');
    }
    setData(result as T);
    setStatus('ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, key]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return { status, data, reload: load };
};

export const useTreasuryOverview = (baseTeamId: string) =>
  useRpc<TreasuryOverview>('treasury_overview', { p_base_team_id: baseTeamId }, baseTeamId);

export const useTreasuryStatement = (baseTeamId: string, playerId: string | null) =>
  useRpc<TreasuryStatement>('treasury_player_statement', { p_base_team_id: baseTeamId, p_player_id: playerId }, `${baseTeamId}:${playerId}`);
