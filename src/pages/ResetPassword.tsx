import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AuthCard, authButton, authInput } from '../components/auth/AuthCard';

type State = 'checking' | 'ready' | 'invalid' | 'done';

const MIN = 8;

/**
 * /restablecer: destino del enlace del correo. Supabase lee el token de la URL y abre una
 * sesión de recuperación; aquí se elige la contraseña nueva.
 */
export const ResetPassword = () => {
  const [state, setState] = useState<State>('checking');
  const [linkError, setLinkError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Nueva contraseña · MedioGol';
    // Enlace vencido o ya usado: Supabase lo informa en el hash (#error_code=otp_expired…)
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get('error')) {
      setLinkError(
        hash.get('error_code') === 'otp_expired'
          ? 'El enlace venció o ya se usó.'
          : 'El enlace no es válido.'
      );
      setState('invalid');
      return;
    }

    let settled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && !settled)) {
        settled = true;
        setState('ready');
      }
    });
    // getSession espera a que el cliente termine de leer el token de la URL
    supabase.auth.getSession().then(({ data }) => {
      if (settled) return;
      settled = true;
      setState(data.session ? 'ready' : 'invalid');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN) return setError(`La contraseña debe tener al menos ${MIN} caracteres.`);
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    setSaving(true);
    setError('');
    const { error: authError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (authError) {
      console.error('updateUser(password)', authError);
      const msg = authError.message?.toLowerCase() ?? '';
      setError(
        msg.includes('different from the old')
          ? 'La contraseña nueva debe ser distinta a la anterior.'
          : msg.includes('weak') || msg.includes('at least')
            ? 'Esa contraseña es muy débil. Usa más caracteres y mezcla letras y números.'
            : 'No pudimos guardar la contraseña. Pide un enlace nuevo e intenta otra vez.'
      );
      return;
    }
    // Se limpia el token de la URL para que no quede en el historial
    window.history.replaceState(null, '', '/restablecer');
    setState('done');
  };

  if (state === 'checking') {
    return (
      <AuthCard title="Un momento…">
        <div className="flex justify-center py-6" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-mg-pitch" aria-hidden="true" />
          <span className="sr-only">Revisando el enlace…</span>
        </div>
      </AuthCard>
    );
  }

  if (state === 'invalid') {
    return (
      <AuthCard title="Enlace no válido" subtitle={`${linkError || 'El enlace venció o ya se usó.'} Pide uno nuevo: llega en un minuto.`}>
        <a href="/recuperar" className={authButton}>
          Pedir un enlace nuevo
        </a>
      </AuthCard>
    );
  }

  if (state === 'done') {
    return (
      <AuthCard title="Contraseña actualizada">
        <div className="flex gap-3 items-start rounded-mg-md bg-mg-pitch-tint p-4" role="status">
          <CheckCircle2 className="h-6 w-6 text-mg-pitch-deep flex-shrink-0" aria-hidden="true" />
          <p className="text-sm">Listo. Ya entraste con tu nueva contraseña.</p>
        </div>
        <a href="/" className={authButton}>
          Ir al inicio
        </a>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Crea tu nueva contraseña" subtitle={`Usa al menos ${MIN} caracteres.`}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="new-password" className="block text-sm font-bold">
            Contraseña nueva
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              aria-invalid={!!error}
              aria-describedby={error ? 'pw-error' : undefined}
              className={`${authInput} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={show}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center text-mg-muted"
            >
              {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="confirm-password" className="block text-sm font-bold">
            Repite la contraseña
          </label>
          <input
            id="confirm-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError('');
            }}
            aria-invalid={!!error}
            aria-describedby={error ? 'pw-error' : undefined}
            className={authInput}
          />
        </div>
        {error && (
          <p id="pw-error" role="alert" className="text-sm font-bold text-mg-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={saving} className={authButton}>
          {saving ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </AuthCard>
  );
};
