import { FormEvent, useEffect, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AuthCard, authButton, authInput } from '../components/auth/AuthCard';

/** /recuperar: pide el correo y envía el enlace para crear una contraseña nueva. */
export const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Recuperar contraseña · MedioGol';
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setError('Escribe un correo válido.');
      return;
    }
    setSending(true);
    setError('');
    const { error: authError } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/restablecer`,
    });
    setSending(false);
    if (authError) {
      console.error('resetPasswordForEmail', authError);
      // Supabase no avisa si el correo existe (evita revelar cuentas); los errores aquí son de envío o de límite.
      setError(
        authError.status === 429
          ? 'Pediste varios correos seguidos. Espera unos minutos e intenta de nuevo.'
          : 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.'
      );
      return;
    }
    setSentTo(clean);
  };

  if (sentTo) {
    return (
      <AuthCard title="Revisa tu correo">
        <div className="flex gap-3 items-start rounded-mg-md bg-mg-pitch-tint p-4" role="status">
          <MailCheck className="h-6 w-6 text-mg-pitch-deep flex-shrink-0" aria-hidden="true" />
          <p className="text-sm">
            Si <strong>{sentTo}</strong> tiene una cuenta en MedioGol, te llegará un enlace para crear una contraseña nueva. El enlace dura 1 hora.
          </p>
        </div>
        <p className="text-sm text-mg-muted">¿No llega? Revisa la carpeta de spam o promociones, o escríbenos a contacto@mediogol.cl.</p>
        <div className="flex flex-wrap gap-4 text-sm font-bold">
          <button type="button" onClick={() => setSentTo('')} className="min-h-[44px] text-mg-pitch-deep underline">
            Usar otro correo
          </button>
          <a href="/login" className="min-h-[44px] inline-flex items-center text-mg-pitch-deep underline">
            Volver a iniciar sesión
          </a>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="¿Olvidaste tu contraseña?" subtitle="Escribe el correo con que te registraste y te enviaremos un enlace para crear una nueva.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="reset-email" className="block text-sm font-bold">
            Correo electrónico
          </label>
          <input
            id="reset-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            aria-invalid={!!error}
            aria-describedby={error ? 'reset-error' : undefined}
            placeholder="tu@correo.com"
            className={authInput}
          />
        </div>
        {error && (
          <p id="reset-error" role="alert" className="text-sm font-bold text-mg-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={sending} className={authButton}>
          {sending ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>
      <a href="/login" className="inline-flex min-h-[44px] items-center text-sm font-bold text-mg-pitch-deep underline">
        Volver a iniciar sesión
      </a>
    </AuthCard>
  );
};
