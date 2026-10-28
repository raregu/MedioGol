import { useState } from 'react';
import { Bell, BellRing, Loader2 } from 'lucide-react';
import { useFollows } from '../../hooks/useFollows';

/** Seguir todas las series de una liga de una vez (o dejar de seguirlas). */
export const FollowLeagueButton = ({ leagueId, seriesIds }: { leagueId: string; seriesIds: string[] }) => {
  const { loggedIn, enabled, isFollowing, setLeague } = useFollows();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = 'inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-colors disabled:opacity-60';

  if (seriesIds.length === 0) return null;
  if (!loggedIn) {
    return (
      <a href={`/login?next=${encodeURIComponent(window.location.pathname)}`} className={`${base} bg-white text-emerald-950 hover:bg-emerald-50`}>
        <Bell className="h-4 w-4" aria-hidden="true" /> Seguir liga
      </a>
    );
  }
  if (!enabled) return null;

  const followed = seriesIds.filter((id) => isFollowing(id)).length;
  const all = followed === seriesIds.length;
  const onClick = async () => {
    setBusy(true);
    setError(null);
    const err = await setLeague(leagueId, seriesIds, !all);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={all}
        title={all ? 'Dejar de seguir todas las series' : 'Seguir todas las series de la liga'}
        className={`${base} ${all ? 'bg-white/15 text-white border border-white/50 hover:bg-white/25' : 'bg-white text-emerald-950 hover:bg-emerald-50'}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : all ? <BellRing className="h-4 w-4" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
        {all ? 'Siguiendo la liga' : followed > 0 ? `Seguir toda la liga (${followed}/${seriesIds.length})` : 'Seguir liga'}
      </button>
      {error && (
        <span role="alert" className="text-xs font-semibold text-white">
          {error}
        </span>
      )}
    </span>
  );
};
