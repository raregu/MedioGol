import { useState } from 'react';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import { useFollows } from '../../hooks/useFollows';

interface Props {
  championshipId: string;
  /** 'onDark': sobre la cabecera de color del campeonato */
  tone?: 'onDark' | 'default';
}

const base = 'inline-flex items-center gap-2 min-h-[44px] px-4 rounded-mg-md text-sm font-extrabold transition-colors disabled:opacity-60';

/** Botón Seguir / Siguiendo de un campeonato. Sin sesión lleva a entrar y vuelve a la misma página. */
export const FollowButton = ({ championshipId, tone = 'default' }: Props) => {
  const { loggedIn, enabled, isFollowing, toggle } = useFollows();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idle =
    tone === 'onDark'
      ? 'bg-white text-mg-pitch-deep hover:bg-mg-pitch-tint'
      : 'bg-mg-pitch text-mg-on-pitch hover:brightness-95';
  const active =
    tone === 'onDark'
      ? 'bg-white/15 text-white border border-white/50 hover:bg-white/25'
      : 'bg-mg-pitch-tint text-mg-pitch-deep border border-mg-pitch hover:bg-mg-surface-2';

  if (!loggedIn) {
    const next = encodeURIComponent(window.location.pathname);
    return (
      <a href={`/login?next=${next}`} className={`${base} ${idle}`} title="Entra para seguir este campeonato">
        <Bell className="h-4 w-4" aria-hidden="true" /> Seguir
      </a>
    );
  }
  if (!enabled) return null;

  const following = isFollowing(championshipId);
  const onClick = async () => {
    setBusy(true);
    setError(null);
    const err = await toggle(championshipId);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={onClick} disabled={busy} aria-pressed={following} className={`${base} ${following ? active : idle}`}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : following ? (
          <BellRing className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Bell className="h-4 w-4" aria-hidden="true" />
        )}
        {following ? 'Siguiendo' : 'Seguir'}
      </button>
      {error && (
        <span role="alert" className={`text-xs font-semibold ${tone === 'onDark' ? 'text-white' : 'text-mg-danger'}`}>
          {error}
        </span>
      )}
    </span>
  );
};
