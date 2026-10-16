import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { OrganizerRequest, OrganizerRequestStatus } from '../types/organizer';

type Status = 'idle' | 'loading' | 'ready' | 'error';

const COLUMNS =
  'id, user_id, org_type, org_name, city, venue, sport, teams_estimate, series_estimate, start_estimate, already_running, website, contact_name, contact_phone, contact_role, message, status, review_note, reviewed_at, created_at';

/** Última solicitud del usuario (datos privados: sin caché). */
export const useMyOrganizerRequest = (userId: string | undefined) => {
  const [status, setStatus] = useState<Status>('idle');
  const [request, setRequest] = useState<OrganizerRequest | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    if (!userId) {
      setStatus('idle');
      setRequest(null);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    const { data, error } = await supabase
      .from('organizer_requests')
      .select(COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .abortSignal(controller.signal)
      .maybeSingle();
    if (controller.signal.aborted) return;
    if (error) {
      console.error('organizer_requests (mine)', error);
      setStatus('error');
      return;
    }
    setRequest((data as OrganizerRequest | null) ?? null);
    setStatus('ready');
  }, [userId]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return { status, request, reload: load };
};

export const PAGE_SIZE = 20;

/** Solicitudes para el admin del sistema, paginadas y filtradas por estado. */
export const useOrganizerRequestsAdmin = (filter: OrganizerRequestStatus | 'all', page: number) => {
  const [status, setStatus] = useState<Status>('loading');
  const [rows, setRows] = useState<OrganizerRequest[]>([]);
  const [total, setTotal] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    let query = supabase
      .from('organizer_requests')
      .select(COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: filter !== 'pending' ? false : true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (filter !== 'all') query = query.eq('status', filter);
    const { data, error, count } = await query.abortSignal(controller.signal);
    if (controller.signal.aborted) return;
    if (error) {
      console.error('organizer_requests (admin)', error);
      setStatus('error');
      return;
    }
    setRows((data as OrganizerRequest[]) || []);
    setTotal(count ?? 0);
    setStatus('ready');
  }, [filter, page]);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  return { status, rows, total, reload: load };
};

/** Cantidad de solicitudes pendientes (solo para el admin del sistema). */
export const usePendingOrganizerRequests = (enabled: boolean) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    supabase
      .from('organizer_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .abortSignal(controller.signal)
      .then(({ count: c, error }) => {
        if (controller.signal.aborted) return;
        if (error) console.error('organizer_requests (pending count)', error);
        else setCount(c ?? 0);
      });
    return () => controller.abort();
  }, [enabled]);
  return count;
};
