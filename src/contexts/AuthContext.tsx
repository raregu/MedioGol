import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile } from '../types/database';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, options?: { organizer?: boolean }) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Vuelve a leer el perfil y renueva la sesión (por ejemplo, después de un cambio de rol). */
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isChampionshipAdmin: boolean;
  isShiftManager: boolean;
  isCaptain: (teamId?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      return null;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).then(setProfile).catch(console.error);
      }
      setLoading(false);
    }).catch(err => {
      console.error('Error getting session:', err);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          const profileData = await fetchProfile(session.user.id);
          setProfile(profileData);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  /** Convierte la cuenta en organizador con plan Gratis (RPC) y renueva la sesión para el nuevo rol. */
  const activateOrganizer = async () => {
    const { error } = await supabase.rpc('become_organizer');
    if (error) throw error;
    const { data } = await supabase.auth.refreshSession();
    const uid = data.session?.user?.id;
    if (uid) setProfile(await fetchProfile(uid));
  };

  // Quien se registró como organizador pero no tenía sesión al registrarse (confirmación por correo)
  // se activa la primera vez que entra. Una sola vez por carga.
  const organizerActivation = useRef(false);
  useEffect(() => {
    if (!user || !profile || organizerActivation.current) return;
    if (user.user_metadata?.organizer_signup && profile.role === 'usuario') {
      organizerActivation.current = true;
      activateOrganizer().catch((e) => console.error('become_organizer', e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile?.role]);

  const signUp = async (email: string, password: string, fullName: string, options?: { organizer?: boolean }) => {
    const organizer = !!options?.organizer;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, organizer_signup: organizer } },
    });

    if (error) throw error;

    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          full_name: fullName,
          role: 'usuario',
        });

      if (profileError) throw profileError;

      if (organizer && data.session) {
        organizerActivation.current = true;
        await activateOrganizer();
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Force token refresh to ensure JWT has latest role
    await supabase.auth.refreshSession();
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setProfile(null);
  };

  const refreshProfile = async () => {
    const { data } = await supabase.auth.refreshSession();
    const uid = data.session?.user?.id ?? user?.id;
    if (uid) setProfile(await fetchProfile(uid));
  };

  const isAdmin = profile?.role === 'admin_sistema';
  const isChampionshipAdmin = profile?.role === 'admin_campeonato' || profile?.role === 'admin_sistema';
  const isShiftManager = profile?.role === 'encargado_turno';

  const isCaptain = (teamId?: string): boolean => {
    if (!profile || !teamId) return false;
    return true;
  };

  const value = {
    user,
    profile,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile,
    isAdmin,
    isChampionshipAdmin,
    isShiftManager,
    isCaptain,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
