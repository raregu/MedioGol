import { useMemo, useState } from 'react';
import { Calendar, Camera, ClipboardEdit, FileSpreadsheet, MapPin, Plus, Printer, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Match } from '../../types/database';
import { MatchResultModal } from './MatchResultModal';

/**
 * Partidos de una serie en el Panel de Administración: todo lo de cada partido en una tarjeta.
 * Filtros por fecha y estado; la fecha con partidos pendientes queda elegida al entrar.
 */

type Filter = 'all' | 'pending' | 'missing' | 'played';
const TZ = 'America/Santiago';

const isPlayed = (m: Match) => m.status === 'finished' || (m.status as string) === 'completed';
const isMissing = (m: Match, now: number) => (m.status === 'scheduled' || m.status === 'playing') && new Date(m.match_date).getTime() + 2 * 3600_000 < now;

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-CL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '').replace(',', '');
  const time = d.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`;
};

const CHIP = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap';
const statusChip = (m: Match, now: number) => {
  if (isPlayed(m)) return <span className={`${CHIP} bg-mg-pitch-tint text-mg-pitch-deep`}>Jugado</span>;
  if ((m.status as string) === 'cancelled') return <span className={`${CHIP} bg-mg-surface-2 text-mg-muted`}>Suspendido</span>;
  if (isMissing(m, now)) return <span className={`${CHIP} bg-[#fff4d6] text-mg-gold-ink`}>Falta resultado</span>;
  if (m.status === 'playing') return <span className={`${CHIP} bg-mg-danger-tint text-mg-danger`}>En juego</span>;
  return <span className={`${CHIP} bg-mg-surface-2 text-mg-ink`}>Programado</span>;
};

interface Props {
  championshipId: string;
  matches: Match[];
  onChanged: () => void;
  onCreate: () => void;
  onUploadExcel: () => void;
}

export const MatchAdminList = ({ championshipId, matches, onChanged, onCreate, onUploadExcel }: Props) => {
  const now = Date.now();
  const rounds = useMemo(() => Array.from(new Set(matches.map((m) => m.round).filter((r): r is number => r != null))).sort((a, b) => a - b), [matches]);
  // Por defecto: la primera fecha con partidos sin resultado
  const firstOpen = useMemo(() => matches.filter((m) => !isPlayed(m) && (m.status as string) !== 'cancelled').map((m) => m.round).filter((r) => r != null).sort((a, b) => a - b)[0], [matches]);
  const [round, setRound] = useState<string>(() => (firstOpen != null ? String(firstOpen) : rounds.length ? String(rounds[rounds.length - 1]) : 'all'));
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const missingCount = matches.filter((m) => isMissing(m, now)).length;

  const list = useMemo(() => {
    const out = matches.filter((m) => {
      if (round !== 'all' && String(m.round) !== round) return false;
      if (filter === 'pending') return !isPlayed(m) && (m.status as string) !== 'cancelled';
      if (filter === 'missing') return isMissing(m, now);
      if (filter === 'played') return isPlayed(m);
      return true;
    });
    // Dentro de una fecha, en el orden en que se juegan; "todas", lo más reciente primero
    return out.sort((a, b) => (round === 'all' ? b.match_date.localeCompare(a.match_date) : a.match_date.localeCompare(b.match_date)));
  }, [matches, round, filter, now]);

  const remove = async (m: Match) => {
    if (!window.confirm(`¿Eliminar ${m.home_team?.name} vs ${m.away_team?.name}? Se borran también sus goles y tarjetas. No se puede deshacer.`)) return;
    setDeleting(m.id);
    setError(null);
    const { error: err } = await supabase.from('matches').delete().eq('id', m.id);
    setDeleting(null);
    if (err) setError('No pudimos eliminar el partido. Inténtalo de nuevo.');
    else onChanged();
  };

  const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-mg-md text-[13px] font-extrabold';

  return (
    <div className="space-y-4 font-sans text-mg-ink">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">Partidos <span className="text-mg-muted font-bold">({matches.length})</span></h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onUploadExcel} className={`${btn} border border-mg-line-strong bg-mg-surface`}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Cargar Excel
          </button>
          <button type="button" onClick={onCreate} className={`${btn} bg-mg-pitch text-mg-on-pitch`}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Crear partido
          </button>
        </div>
      </div>

      {matches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="ma-round" className="sr-only">Fecha</label>
          <select id="ma-round" value={round} onChange={(e) => setRound(e.target.value)} className="min-h-[40px] px-2 border border-mg-line-strong rounded-mg-md bg-mg-surface text-sm font-bold">
            <option value="all">Todas las fechas</option>
            {rounds.map((r) => <option key={r} value={r}>Fecha {r}</option>)}
          </select>
          <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
            {([['all', 'Todos'], ['pending', 'Por jugar'], ['missing', `Falta resultado${missingCount ? ` (${missingCount})` : ''}`], ['played', 'Jugados']] as const).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}
                className={`min-h-[40px] px-3 rounded-full text-[13px] font-extrabold ${filter === v ? 'bg-mg-ink text-mg-surface' : v === 'missing' && missingCount ? 'bg-[#fff4d6] text-mg-gold-ink' : 'bg-mg-surface-2'}`}>
                {l}
              </button>
            ))}
          </div>
          {round !== 'all' && (
            <a href={`/papeletas?championship=${championshipId}&round=${round}`} target="_blank" rel="noopener" className={`${btn} bg-mg-ink text-mg-surface ml-auto`}>
              <Printer className="h-4 w-4" aria-hidden="true" /> Papeletas de la fecha {round}
            </a>
          )}
        </div>
      )}

      {error && <p role="alert" className="rounded-mg-md bg-mg-danger-tint text-mg-danger font-bold p-3 text-sm">{error}</p>}

      {matches.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <Calendar className="h-14 w-14 text-mg-line-strong mx-auto" aria-hidden="true" />
          <p className="text-mg-muted">No hay partidos programados aún.</p>
          <button type="button" onClick={onCreate} className={`${btn} bg-mg-pitch text-mg-on-pitch`}><Plus className="h-4 w-4" aria-hidden="true" /> Crear el primer partido</button>
        </div>
      ) : list.length === 0 ? (
        <p className="text-center text-mg-muted py-8">No hay partidos con este filtro.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((m) => {
            const played = isPlayed(m);
            const missing = isMissing(m, now);
            return (
              <li key={m.id} className={`rounded-mg-lg border bg-mg-surface p-4 space-y-3 ${missing ? 'border-mg-gold border-2' : 'border-mg-line'}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mg-muted font-semibold">
                  {m.round != null && <span className="font-extrabold text-mg-ink">Fecha {m.round}</span>}
                  <span>{fmtWhen(m.match_date)}</span>
                  {m.venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{m.venue}</span>}
                  <span className="ml-auto">{statusChip(m, now)}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <p className="font-bold text-right truncate">{m.home_team?.name}</p>
                  <p className="mg-num text-2xl font-extrabold min-w-[4.5rem] text-center">
                    {played ? `${m.home_score ?? 0} – ${m.away_score ?? 0}` : <span className="text-mg-muted text-base">vs</span>}
                  </p>
                  <p className="font-bold truncate">{m.away_team?.name}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setEditing(m.id)} className={`${btn} ${missing ? 'bg-mg-gold text-mg-on-gold' : played ? 'border border-mg-line-strong bg-mg-surface' : 'bg-mg-pitch text-mg-on-pitch'}`}>
                    <ClipboardEdit className="h-4 w-4" aria-hidden="true" /> {played ? 'Resultado y detalles' : missing || new Date(m.match_date).getTime() <= now ? 'Cargar resultado' : 'Editar partido'}
                  </button>
                  <a href={`/papeleta/${m.id}`} className={`${btn} border border-mg-line-strong bg-mg-surface`}>
                    <Camera className="h-4 w-4" aria-hidden="true" /> Subir papeleta (IA)
                  </a>
                  <a href={`/papeletas?match=${m.id}`} target="_blank" rel="noopener" className={`${btn} border border-mg-line-strong bg-mg-surface`}>
                    <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir papeleta
                  </a>
                  <button type="button" onClick={() => remove(m)} disabled={deleting === m.id} aria-label={`Eliminar ${m.home_team?.name} vs ${m.away_team?.name}`}
                    className="ml-auto h-10 w-10 inline-flex items-center justify-center rounded-mg-md text-mg-danger hover:bg-mg-danger-tint disabled:opacity-50">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <MatchResultModal matchId={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </div>
  );
};
