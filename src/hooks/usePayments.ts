import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_FEE_SETTINGS, FeeSettings, LeagueSeriesPayment, TeamBalance, TeamStatement } from '../types/payments';

type Status = 'loading' | 'ready' | 'denied' | 'error';

const isDenied = (err: { code?: string } | null) => err?.code === '42501';

/** Panel del campeonato: datos, permisos, saldos por equipo y configuración. Datos privados: sin caché. */
export const useChampionshipPayments = (championshipId: string) => {
  const [status, setStatus] = useState<Status>('loading');
  const [championship, setChampionship] = useState<{ id: string; name: string; league_id: string | null } | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [balances, setBalances] = useState<TeamBalance[]>([]);
  const [settings, setSettings] = useState<FeeSettings | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const signal = controller.signal;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    const [champRes, manageRes, balancesRes, settingsRes] = await Promise.all([
      supabase.from('championships').select('id, name, league_id').eq('id', championshipId).abortSignal(signal).maybeSingle(),
      supabase.rpc('can_manage_championship_payments', { p_championship_id: championshipId }).abortSignal(signal),
      supabase.rpc('championship_balances', { p_championship_id: championshipId }).abortSignal(signal),
      supabase.from('championship_fee_settings').select('*').eq('championship_id', championshipId).abortSignal(signal).maybeSingle(),
    ]);
    if (signal.aborted) return;
    if (isDenied(balancesRes.error)) return setStatus('denied');
    if (champRes.error || balancesRes.error || settingsRes.error || !champRes.data) {
      console.error('payments', champRes.error || balancesRes.error || settingsRes.error);
      return setStatus('error');
    }
    setChampionship(champRes.data);
    setCanManage(!!manageRes.data);
    setBalances((balancesRes.data || []) as TeamBalance[]);
    setSettings(settingsRes.data ? ({ ...DEFAULT_FEE_SETTINGS, ...settingsRes.data } as FeeSettings) : null);
    setStatus('ready');
  }, [championshipId]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return { status, championship, canManage, balances, settings, reload: load };
};

/** Estado de cuenta de un equipo (personal del campeonato o capitán). */
export const useTeamStatement = (teamId: string) => {
  const [status, setStatus] = useState<Status>('loading');
  const [statement, setStatement] = useState<TeamStatement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    const { data, error } = await supabase.rpc('team_statement', { p_team_id: teamId }).abortSignal(controller.signal);
    if (controller.signal.aborted) return;
    if (isDenied(error)) return setStatus('denied');
    if (error || !data) {
      console.error('team_statement', error);
      return setStatus('error');
    }
    setStatement(data as TeamStatement);
    setStatus('ready');
  }, [teamId]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return { status, statement, reload: load };
};

/** Resumen de cobros de todas las series de una liga (administradores de la liga). */
export const useLeaguePayments = (leagueId: string) => {
  const [status, setStatus] = useState<Status>('loading');
  const [league, setLeague] = useState<{ id: string; name: string } | null>(null);
  const [series, setSeries] = useState<LeagueSeriesPayment[]>([]);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const signal = controller.signal;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    const [leagueRes, summaryRes] = await Promise.all([
      supabase.from('leagues').select('id, name').eq('id', leagueId).abortSignal(signal).maybeSingle(),
      supabase.rpc('league_payment_summary', { p_league_id: leagueId }).abortSignal(signal),
    ]);
    if (signal.aborted) return;
    if (isDenied(summaryRes.error)) return setStatus('denied');
    if (leagueRes.error || summaryRes.error || !leagueRes.data) {
      console.error('league payments', leagueRes.error || summaryRes.error);
      return setStatus('error');
    }
    setLeague(leagueRes.data);
    setSeries((summaryRes.data || []) as LeagueSeriesPayment[]);
    setStatus('ready');
  }, [leagueId]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return { status, league, series, reload: load };
};
