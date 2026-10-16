import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AuthCard, authButton } from '../components/auth/AuthCard';

type State = 'checking' | 'done' | 'invalid';

const ALLOWED: EmailOtpType[] = ['email', 'signup', 'invite', 'email_change'];

/**
 * /confirmar: destino de los enlaces de confirmación (cuenta nueva, cambio de correo).
 * La plantilla apunta a mediogol.cl con token_hash, así el enlace del correo es del mismo
 * dominio que el remitente (mejor entrega, menos spam).
 */
export const ConfirmEmail = () => {
  const [state, setState] = useState<State>('checking');
  const [type, setType] = useState<EmailOtpType>('email');
  // Parámetros del enlace leídos una sola vez (en desarrollo StrictMode repite los efectos)
  const params = useRef(new URLSearchParams(window.location.search));
  const started = useRef(false);

  useEffect(() => {
    document.title = 'Confirmar correo · MedioGol';
    if (started.current) return;
    started.current = true;
    const q = params.current;
    const tokenHash = q.get('token_hash');
    const t = (q.get('type') ?? 'email') as EmailOtpType;
    window.history.replaceState(null, '', '/confirmar');
    if (!tokenHash || !ALLOWED.includes(t)) {
      setState('invalid');
      return;
    }
    setType(t);
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: t }).then(({ error }) => {
      if (error) {
        console.error('verifyOtp', error);
        setState('invalid');
        return;
      }
      setState('done');
    });
  }, []);

  if (state === 'checking') {
    return (
      <AuthCard title="Un momento…">
        <div className="flex justify-center py-6" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-mg-pitch" aria-hidden="true" />
          <span className="sr-only">Confirmando tu correo…</span>
        </div>
      </AuthCard>
    );
  }

  if (state === 'invalid') {
    return (
      <AuthCard title="Enlace no válido" subtitle="El enlace venció o ya se usó. Si ya confirmaste tu correo, simplemente inicia sesión.">
        <a href="/login" className={authButton}>
          Iniciar sesión
        </a>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={type === 'email_change' ? 'Correo actualizado' : '¡Cuenta confirmada!'}>
      <div className="flex gap-3 items-start rounded-mg-md bg-mg-pitch-tint p-4" role="status">
        <CheckCircle2 className="h-6 w-6 text-mg-pitch-deep flex-shrink-0" aria-hidden="true" />
        <p className="text-sm">
          {type === 'email_change' ? 'Tu nuevo correo ya quedó guardado.' : 'Tu correo quedó confirmado y ya entraste a MedioGol.'}
        </p>
      </div>
      <a href="/" className={authButton}>
        Ir al inicio
      </a>
    </AuthCard>
  );
};
