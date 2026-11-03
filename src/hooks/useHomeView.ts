import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type HomeView = 'following' | 'all';

const LOCAL_KEY = 'mg:home-view';
const readLocal = (): HomeView | null => {
  try {
    const v = localStorage.getItem(LOCAL_KEY);
    return v === 'following' || v === 'all' ? v : null;
  } catch {
    return null;
  }
};
const writeLocal = (v: HomeView) => {
  try {
    localStorage.setItem(LOCAL_KEY, v);
  } catch {
    /* modo privado: basta con la cuenta */
  }
};

/**
 * Vista del Inicio: "Siguiendo" (solo lo que sigue el usuario) o "Todo".
 * - Sin sesión o sin nada seguido: siempre "Todo".
 * - Con algo seguido: lo que eligió (guardado en su cuenta, profiles.home_view); por defecto "Siguiendo".
 * - 'pending' mientras no se sabe qué sigue, para no cargar ni mostrar el Inicio general de más.
 */
export const useHomeView = (follows: { loggedIn: boolean; settled: boolean; count: number }) => {
  const { profile } = useAuth();
  const [chosen, setChosen] = useState<HomeView | null>(null);
  const saved: HomeView | null = chosen ?? profile?.home_view ?? readLocal();

  let view: HomeView | 'pending';
  if (!follows.loggedIn || saved === 'all') view = 'all';
  else if (!follows.settled) view = 'pending';
  else view = follows.count > 0 ? saved ?? 'following' : 'all';

  const setView = useCallback(async (v: HomeView) => {
    setChosen(v);
    writeLocal(v);
    const { error } = await supabase.rpc('set_home_view', { p_view: v });
    // Sin la migración se recuerda en este dispositivo; no es un error para el usuario
    if (error) console.warn('set_home_view', error.message);
  }, []);

  return { view, setView, available: follows.loggedIn && follows.settled && follows.count > 0 };
};
