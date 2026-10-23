import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface OnboardingStatus {
  hidden: boolean;
  championship_id: string | null;
  league_id: string | null;
  has_championship: boolean;
  has_teams: boolean;
  has_captain: boolean;
  has_matches: boolean;
  has_result: boolean;
  has_fees: boolean;
}

export type OnboardingStepKey = 'championship' | 'teams' | 'captain' | 'matches' | 'result' | 'fees';

export const ONBOARDING_STEPS: { key: OnboardingStepKey; done: (s: OnboardingStatus) => boolean }[] = [
  { key: 'championship', done: (s) => s.has_championship },
  { key: 'teams', done: (s) => s.has_teams },
  { key: 'captain', done: (s) => s.has_captain },
  { key: 'matches', done: (s) => s.has_matches },
  { key: 'result', done: (s) => s.has_result },
  { key: 'fees', done: (s) => s.has_fees },
];

export const onboardingProgress = (s: OnboardingStatus) => {
  const done = ONBOARDING_STEPS.filter((step) => step.done(s)).length;
  const next = ONBOARDING_STEPS.find((step) => !step.done(s))?.key ?? null;
  return { done, total: ONBOARDING_STEPS.length, next };
};

// Caché corta compartida entre Inicio y Administrar: una sola llamada al navegar entre ambas.
const TTL_MS = 30_000;
let cache: { userId: string; at: number; data: OnboardingStatus } | null = null;

/**
 * Guía de inicio del administrador de campeonato. Solo consulta si el rol es admin_campeonato.
 * El avance se calcula en el servidor (RPC admin_onboarding_status).
 */
export const useAdminOnboarding = () => {
  const { profile } = useAuth();
  const enabled = profile?.role === 'admin_campeonato';
  const userId = profile?.id ?? null;
  const [data, setData] = useState<OnboardingStatus | null>(() =>
    cache && cache.userId === userId && Date.now() - cache.at < TTL_MS ? cache.data : null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const reload = useCallback(
    async (force = false) => {
      if (!enabled || !userId) return;
      if (!force && cache && cache.userId === userId && Date.now() - cache.at < TTL_MS) {
        setData(cache.data);
        return;
      }
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const { data: res, error: rpcError } = await supabase.rpc('admin_onboarding_status').abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (rpcError || !res) {
        // La guía es una ayuda: si falla (p. ej. migración sin aplicar) simplemente no se muestra.
        console.error('admin_onboarding_status', rpcError);
        return;
      }
      cache = { userId, at: Date.now(), data: res as OnboardingStatus };
      setData(res as OnboardingStatus);
    },
    [enabled, userId]
  );

  useEffect(() => {
    reload();
    return () => controllerRef.current?.abort();
  }, [reload]);

  // Al volver a la pestaña (p. ej. después de cargar equipos en otra) se actualiza el avance.
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => reload(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [enabled, reload]);

  const setHidden = useCallback(
    async (hidden: boolean) => {
      if (!data || !userId) return;
      setSaving(true);
      setError(null);
      const previous = data;
      const next = { ...data, hidden };
      setData(next); // optimista
      const { error: rpcError } = await supabase.rpc('set_admin_onboarding_hidden', { p_hidden: hidden });
      setSaving(false);
      if (rpcError) {
        console.error('set_admin_onboarding_hidden', rpcError);
        setData(previous);
        setError('No pudimos guardar tu preferencia. Intenta de nuevo.');
        return;
      }
      cache = { userId, at: Date.now(), data: next };
    },
    [data, userId]
  );

  return { enabled: enabled && !!data, data, reload, setHidden, saving, error };
};

/** Abre el panel del asistente (lo escucha Layout). */
export const openAssistant = () => window.dispatchEvent(new Event('mg:open-assistant'));
