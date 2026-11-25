import { useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { playErrorText } from '../../utils/playGroups';

/**
 * "Armar lista" de un partido: elige tu equipo y abre (o retoma) la convocatoria para compartir por WhatsApp.
 * Fecha regular: matchId + ids de teams. Playoff: playoffId + ids de base_teams (clubes).
 */
interface Props {
  matchId?: string;
  playoffId?: string;
  home: { id: string | null; name: string | null };
  away: { id: string | null; name: string | null };
  className?: string;
  /** Versión chica para el pie de los cuadros de playoffs */
  compact?: boolean;
}

export const CallupButton = ({ matchId, playoffId, home, away, className = '', compact = false }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!home.id || !away.id) return null;

  const start = async (teamId: string) => {
    if (!user) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return;
    }
    setBusy(teamId);
    setError(null);
    const { data, error: err } = await supabase.rpc('callup_start', matchId
      ? { p_match: matchId, p_team: teamId, p_playoff: null, p_base_team: null }
      : { p_match: null, p_team: null, p_playoff: playoffId, p_base_team: teamId });
    setBusy(null);
    if (err || !data) {
      setError(playErrorText(err, 'No pudimos abrir la lista. Intenta de nuevo.'));
      return;
    }
    window.history.pushState({}, '', `/c/${data}`);
  };

  const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-mg-md text-[13px] font-extrabold';

  if (!open && compact) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`w-full inline-flex items-center justify-center gap-1 min-h-[36px] px-2 text-[12px] font-extrabold text-mg-pitch-deep hover:bg-mg-pitch-tint ${className}`}>
        <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" /> Armar lista
      </button>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${btn} border border-mg-pitch text-mg-pitch-deep bg-mg-surface ${className}`}>
        <ClipboardList className="h-4 w-4" aria-hidden="true" /> Armar lista
      </button>
    );
  }
  return (
    <div className={`rounded-mg-md border border-mg-line bg-mg-surface-2 p-2 space-y-2 font-sans text-mg-ink ${className}`} role="group" aria-label="¿De qué equipo eres?">
      <p className="text-xs font-extrabold">¿De qué equipo eres?</p>
      <div className="flex flex-wrap gap-2">
        {[home, away].map((t) => (
          <button key={t.id} type="button" disabled={!!busy} onClick={() => start(t.id!)} className={`${btn} bg-mg-pitch text-mg-on-pitch disabled:opacity-50`}>
            {busy === t.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {t.name}
          </button>
        ))}
        <button type="button" onClick={() => { setOpen(false); setError(null); }} className={`${btn} border border-mg-line-strong bg-mg-surface`}>Cancelar</button>
      </div>
      {!user && <p className="text-xs text-mg-muted">Para armar la lista entras con tu cuenta. Tus compañeros se anotan sin cuenta.</p>}
      {error && <p role="alert" className="text-xs font-bold text-mg-danger">{error}</p>}
    </div>
  );
};
