import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface OrganizerPlan {
  plan: 'free' | 'premium';
  premium_until: string | null;
  trial_ends_at: string | null;
  locked: boolean;
  leagues: number;
  league_limit: number | null;
  sheets_used: number;
  sheet_limit: number | null;
}

/** Límites del plan Gratis (los aplica el servidor; aquí solo se muestran). */
export const FREE_PLAN = { leagues: 1, months: 6, sheets: 5 } as const;

// Caché corta compartida entre pantallas (Administrar, Ligas, modal de campeonato)
const TTL_MS = 30_000;
let cache: { userId: string; at: number; data: OrganizerPlan } | null = null;
export const invalidateOrganizerPlan = () => {
  cache = null;
};

/**
 * Plan del organizador conectado (my_organizer_plan). Solo consulta para admin_campeonato:
 * el admin del sistema no tiene límites. Si falla (p. ej. migración sin aplicar) devuelve null
 * y la app sigue funcionando como antes.
 */
export const useOrganizerPlan = () => {
  const { profile } = useAuth();
  const enabled = profile?.role === 'admin_campeonato';
  const userId = profile?.id ?? null;
  const [plan, setPlan] = useState<OrganizerPlan | null>(() =>
    cache && cache.userId === userId && Date.now() - cache.at < TTL_MS ? cache.data : null
  );
  const controllerRef = useRef<AbortController | null>(null);

  const reload = useCallback(
    async (force = false) => {
      if (!enabled || !userId) return;
      if (!force && cache && cache.userId === userId && Date.now() - cache.at < TTL_MS) {
        setPlan(cache.data);
        return;
      }
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const { data, error } = await supabase.rpc('my_organizer_plan').abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (error || !data) {
        console.error('my_organizer_plan', error);
        return;
      }
      cache = { userId, at: Date.now(), data: data as OrganizerPlan };
      setPlan(data as OrganizerPlan);
    },
    [enabled, userId]
  );

  useEffect(() => {
    reload();
    return () => controllerRef.current?.abort();
  }, [reload]);

  const isFree = plan?.plan === 'free';
  return {
    plan,
    isFree,
    /** Plan Gratis que ya ocupó su liga */
    leagueLimitReached: !!plan && plan.plan === 'free' && plan.league_limit !== null && plan.leagues >= plan.league_limit,
    reload,
  };
};

export const formatPlanDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export const daysUntil = (iso: string | null) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;
