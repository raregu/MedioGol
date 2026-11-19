import { FormEvent, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { invalidateMyPlayGroups } from '../../hooks/usePlayGroups';
import { supabase } from '../../lib/supabase';
import { PlayGroupView } from '../../types/playGroups';
import { playErrorText, savePlayToken } from '../../utils/playGroups';
import { fieldClass, primaryBtn } from '../payments/PaymentsUi';
import { card, smallBtn } from './shared';

/**
 * Primera vez que alguien abre el link del grupo: "¿Quién eres?".
 * Elige su nombre (si el organizador ya lo agregó) o entra como suplente nuevo.
 * Sin cuenta, el teléfono guarda un token; con cuenta, queda ligado a su usuario.
 */
export const JoinPanel = ({ view, onJoined }: { view: PlayGroupView; onJoined: (token: string | null) => void }) => {
  const { profile } = useAuth();
  const code = view.group.invite_code;
  const unclaimed = view.members.filter((m) => !m.claimed).sort((a, b) => a.name.localeCompare(b.name));
  const [name, setName] = useState(profile?.full_name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = (data: unknown) => {
    const token = (data as { token?: string | null } | null)?.token || null;
    if (token) savePlayToken(code, token);
    invalidateMyPlayGroups();
    onJoined(token);
  };

  const claim = async (memberId: string, memberName: string) => {
    if (!window.confirm(`¿Eres ${memberName}?`)) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('play_claim', { p_code: code, p_member: memberId });
    setBusy(false);
    if (err) setError(playErrorText(err, 'No pudimos guardar tu nombre.'));
    else done(data);
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('play_join', { p_code: code, p_name: name.trim() });
    setBusy(false);
    if (err) setError(playErrorText(err, 'No pudimos sumarte al grupo.'));
    else done(data);
  };

  return (
    <div className="space-y-4">
      {unclaimed.length > 0 && (
        <section className={card} aria-labelledby="who-are-you">
          <h2 id="who-are-you" className="text-lg font-extrabold">¿Quién eres?</h2>
          <p className="text-sm text-mg-muted">Toca tu nombre. Queda guardado en este teléfono y no tienes que volver a elegirlo.</p>
          <ul className="flex flex-wrap gap-2">
            {unclaimed.map((m) => (
              <li key={m.id}>
                <button type="button" className={smallBtn} disabled={busy} onClick={() => claim(m.id, m.name)}>{m.name}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form onSubmit={join} className={card} aria-labelledby="new-player">
        <h2 id="new-player" className="text-lg font-extrabold">{unclaimed.length > 0 ? '¿No estás en la lista?' : 'Súmate al grupo'}</h2>
        <p className="text-sm text-mg-muted">Entras como suplente. El organizador decide quiénes son fijos.</p>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Tu nombre" className={`${fieldClass} flex-1 min-w-[10rem]`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" required />
          <button type="submit" className={primaryBtn} disabled={busy || !name.trim()}>Entrar</button>
        </div>
        {!profile && <p className="text-xs text-mg-muted">No necesitas cuenta. Si la creas, ves tus partidos en el Inicio de MedioGol.</p>}
      </form>
      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
    </div>
  );
};
