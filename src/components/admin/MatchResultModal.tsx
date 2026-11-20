import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, Loader2, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * "Resultado y detalles": una sola ventana para todo lo de un partido.
 * Reemplaza a "Editar partido" (fecha, hora, cancha, estado) y a "Registrar detalles" (goles y tarjetas).
 *
 * Orden al guardar (importa): primero los goles/tarjetas y después el partido, porque un trigger
 * recalcula el marcador desde los goles en cada cambio; el marcador escrito queda como el final.
 * Si falla la carga de goles/tarjetas, se restauran los que había.
 */

type GoalType = 'normal' | 'penalty' | 'own_goal';
type CardType = 'yellow' | 'red';
type Status = 'scheduled' | 'playing' | 'finished' | 'cancelled';

interface Player { id: string; name: string; team_id: string }
interface GoalRow { key: string; player_id: string; team_id: string; minute: string; type: GoalType }
interface CardRow { key: string; player_id: string; minute: string; type: CardType; reason: string }
interface Complex { id: string; name: string }
interface EventRow { match_id: string; player_id: string; team_id: string | null; event_type: string; minute: number | null; additional_info: Record<string, unknown> | null }

interface Props {
  matchId: string;
  onClose: () => void;
  onSaved: () => void;
}

const field = 'w-full min-h-[44px] px-3 border border-mg-line-strong rounded-mg-md bg-mg-surface text-mg-ink';
const smallField = 'min-h-[40px] px-2 border border-mg-line-strong rounded-mg-md bg-mg-surface text-mg-ink text-sm';
const label = 'block text-sm font-bold mb-1';
let seq = 0;
const k = () => `r${++seq}`;

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO (UTC) → fecha y hora locales para los campos del formulario. */
const toLocalInputs = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

const scoreFromGoals = (goals: GoalRow[], homeId: string, awayId: string) => {
  let h = 0;
  let a = 0;
  for (const g of goals) {
    if (!g.player_id) continue;
    const forHome = g.type === 'own_goal' ? g.team_id === awayId : g.team_id === homeId;
    if (forHome) h++;
    else if (g.team_id === homeId || g.team_id === awayId) a++;
  }
  return { h, a };
};

export const MatchResultModal = ({ matchId, onClose, onSaved }: Props) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [home, setHome] = useState({ id: '', name: '' });
  const [away, setAway] = useState({ id: '', name: '' });
  const [players, setPlayers] = useState<Player[]>([]);
  const [complexes, setComplexes] = useState<Complex[]>([]);
  const [original, setOriginal] = useState<EventRow[]>([]);
  const [championshipId, setChampionshipId] = useState<string | null>(null);

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [round, setRound] = useState('');
  const [venue, setVenue] = useState('');
  const [complexId, setComplexId] = useState('');
  const [status, setStatus] = useState<Status>('scheduled');
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [eventsDirty, setEventsDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: m, error: mErr } = await supabase
        .from('matches')
        .select('id, championship_id, home_team_id, away_team_id, match_date, round, status, home_score, away_score, venue, sports_complex_id, home_team:teams!matches_home_team_id_fkey(id, name, captain_id), away_team:teams!matches_away_team_id_fkey(id, name, captain_id)')
        .eq('id', matchId)
        .single();
      if (!alive) return;
      if (mErr || !m) {
        setLoadError('No pudimos cargar el partido.');
        setLoading(false);
        return;
      }
      const ht = m.home_team as unknown as { id: string; name: string; captain_id: string | null };
      const at = m.away_team as unknown as { id: string; name: string; captain_id: string | null };
      const [hp, ap, ev, cx] = await Promise.all([
        supabase.from('team_players').select('player_profiles(id, full_name)').eq('team_id', m.home_team_id),
        supabase.from('team_players').select('player_profiles(id, full_name)').eq('team_id', m.away_team_id),
        supabase.from('match_events').select('match_id, player_id, team_id, event_type, minute, additional_info').eq('match_id', matchId),
        supabase.from('sports_complexes').select('id, name').order('name'),
      ]);
      if (!alive) return;

      const toPlayers = (rows: unknown[] | null, teamId: string) =>
        (rows || [])
          .map((r) => (r as { player_profiles: { id: string; full_name: string } | null }).player_profiles)
          .filter((p): p is { id: string; full_name: string } => !!p)
          .map((p) => ({ id: p.id, name: p.full_name, team_id: teamId }));
      const list = [...toPlayers(hp.data, m.home_team_id), ...toPlayers(ap.data, m.away_team_id)];
      // El capitán puede no estar en la nómina: se agrega para poder anotarle goles o tarjetas
      const capIds = [ht?.captain_id, at?.captain_id].filter((x): x is string => !!x && !list.some((p) => p.id === x));
      if (capIds.length) {
        const { data: caps } = await supabase.from('player_profiles').select('id, full_name').in('id', capIds);
        for (const c of caps || []) list.push({ id: c.id, name: `${c.full_name} (capitán)`, team_id: c.id === ht?.captain_id ? m.home_team_id : m.away_team_id });
      }
      if (!alive) return;
      list.sort((a, b) => a.name.localeCompare(b.name));

      const events = (ev.data || []) as EventRow[];
      setOriginal(events);
      setGoals(
        events
          .filter((e) => e.event_type === 'goal')
          .map((e) => ({ key: k(), player_id: e.player_id, team_id: e.team_id || '', minute: e.minute ? String(e.minute) : '', type: ((e.additional_info?.type as GoalType) || 'normal') }))
      );
      setCards(
        events
          .filter((e) => e.event_type === 'yellow_card' || e.event_type === 'red_card')
          .map((e) => ({ key: k(), player_id: e.player_id, minute: e.minute ? String(e.minute) : '', type: e.event_type === 'red_card' ? 'red' : 'yellow', reason: String(e.additional_info?.reason || '') }))
      );

      const local = toLocalInputs(m.match_date);
      setDate(local.date);
      setTime(local.time);
      setRound(m.round != null ? String(m.round) : '');
      setVenue(m.venue || '');
      setComplexId(m.sports_complex_id || '');
      const st = (m.status === 'completed' ? 'finished' : m.status) as Status;
      setStatus(['scheduled', 'playing', 'finished', 'cancelled'].includes(st) ? st : 'scheduled');
      const played = st === 'finished' || st === 'playing';
      setHomeScore(played && m.home_score != null ? String(m.home_score) : '');
      setAwayScore(played && m.away_score != null ? String(m.away_score) : '');
      setHome({ id: m.home_team_id, name: ht?.name || 'Local' });
      setAway({ id: m.away_team_id, name: at?.name || 'Visita' });
      setChampionshipId(m.championship_id);
      setPlayers(list);
      setComplexes((cx.data || []) as Complex[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [matchId]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const byTeam = useMemo(() => ({ home: players.filter((p) => p.team_id === home.id), away: players.filter((p) => p.team_id === away.id) }), [players, home.id, away.id]);
  const fromGoals = scoreFromGoals(goals, home.id, away.id);
  const hasGoals = goals.some((g) => g.player_id);
  const typed = homeScore !== '' && awayScore !== '';
  const mismatch = hasGoals && typed && (Number(homeScore) !== fromGoals.h || Number(awayScore) !== fromGoals.a);

  const addGoal = (teamId: string) => {
    setGoals((g) => [...g, { key: k(), player_id: '', team_id: teamId, minute: '', type: 'normal' }]);
    setEventsDirty(true);
  };
  const setGoal = (key: string, patch: Partial<GoalRow>) => {
    setGoals((g) => g.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setEventsDirty(true);
  };
  const setCard = (key: string, patch: Partial<CardRow>) => {
    setCards((c) => c.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setEventsDirty(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!date || !time) return setError('Indica la fecha y la hora del partido.');
    const when = new Date(`${date}T${time}`);
    if (Number.isNaN(when.getTime())) return setError('La fecha u hora no es válida.');
    const roundN = round === '' ? null : Number(round);
    if (roundN != null && (!Number.isInteger(roundN) || roundN < 0 || roundN > 200)) return setError('El número de fecha no es válido.');
    let hs: number | null = null;
    let as: number | null = null;
    if (status === 'finished' || status === 'playing') {
      if (typed) {
        hs = Number(homeScore);
        as = Number(awayScore);
      } else if (hasGoals) {
        hs = fromGoals.h;
        as = fromGoals.a;
      } else if (status === 'finished') {
        return setError('Ingresa el marcador o los goles para marcar el partido como jugado.');
      }
      if (hs != null && (!Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || (as as number) < 0 || hs > 99 || (as as number) > 99)) {
        return setError('El marcador no es válido.');
      }
    }
    if (goals.some((g) => !g.player_id) || cards.some((c) => !c.player_id)) {
      return setError('Elige el jugador en cada gol y tarjeta, o quita las filas vacías.');
    }

    setSaving(true);
    try {
      // 1) Goles y tarjetas (solo si cambiaron)
      if (eventsDirty) {
        const teamOf = (pid: string) => players.find((p) => p.id === pid)?.team_id || null;
        const rows: EventRow[] = [
          ...goals.map((g) => ({ match_id: matchId, player_id: g.player_id, team_id: g.team_id || teamOf(g.player_id), event_type: 'goal', minute: g.minute ? Number(g.minute) : 0, additional_info: { type: g.type } })),
          ...cards.map((c) => ({ match_id: matchId, player_id: c.player_id, team_id: teamOf(c.player_id), event_type: c.type === 'red' ? 'red_card' : 'yellow_card', minute: c.minute ? Number(c.minute) : 0, additional_info: { reason: c.reason.trim() } })),
        ];
        const { error: delErr } = await supabase.from('match_events').delete().eq('match_id', matchId);
        if (delErr) throw new Error('No pudimos actualizar los goles y tarjetas.');
        if (rows.length) {
          const { error: insErr } = await supabase.from('match_events').insert(rows);
          if (insErr) {
            if (original.length) await supabase.from('match_events').insert(original); // se restauran los que había
            throw new Error('No pudimos guardar los goles y tarjetas. Quedaron como estaban.');
          }
        }
      }

      // 2) El partido (al final: deja el marcador escrito como el definitivo)
      const update: Record<string, unknown> = {
        match_date: when.toISOString(),
        round: roundN,
        venue: venue.trim() || null,
        sports_complex_id: complexId || null,
        status,
      };
      if (hs != null && as != null) {
        update.home_score = hs;
        update.away_score = as;
      }
      const { error: upErr } = await supabase.from('matches').update(update).eq('id', matchId);
      if (upErr) throw new Error('No pudimos guardar el partido. Revisa tu conexión e inténtalo de nuevo.');

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const teamPlayersSelect = (value: string, onChange: (playerId: string, teamId: string) => void, ariaLabel: string) => (
    <select aria-label={ariaLabel} className={`${smallField} flex-1 min-w-[10rem]`} value={value} onChange={(e) => {
      const p = players.find((x) => x.id === e.target.value);
      onChange(e.target.value, p?.team_id || '');
    }}>
      <option value="">Jugador…</option>
      <optgroup label={home.name}>{byTeam.home.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
      <optgroup label={away.name}>{byTeam.away.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto font-sans text-mg-ink" role="dialog" aria-modal="true" aria-labelledby="mr-title">
      <div className="bg-mg-surface w-full sm:max-w-2xl sm:rounded-mg-lg shadow-2xl min-h-screen sm:min-h-0">
        <div className="sticky top-0 z-10 bg-mg-navy text-mg-on-navy px-5 py-4 flex items-start justify-between gap-3 sm:rounded-t-mg-lg">
          <div className="min-w-0">
            <p className="mg-label text-mg-gold">Resultado y detalles{round ? ` · Fecha ${round}` : ''}</p>
            <h2 id="mr-title" className="font-display text-2xl font-extrabold uppercase leading-7 truncate">
              {loading ? 'Cargando…' : `${home.name} vs ${away.name}`}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar" className="h-11 w-11 flex items-center justify-center rounded-mg-md hover:bg-white/10 flex-shrink-0">
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center" role="status"><Loader2 className="h-8 w-8 animate-spin text-mg-pitch" aria-hidden="true" /><span className="sr-only">Cargando</span></div>
        ) : loadError ? (
          <p role="alert" className="p-6 font-bold text-mg-danger">{loadError}</p>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-6">
            {/* Resultado */}
            <section aria-labelledby="mr-res" className="space-y-3">
              <h3 id="mr-res" className="text-lg font-extrabold">Resultado</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([['scheduled', 'Programado'], ['playing', 'En juego'], ['finished', 'Jugado'], ['cancelled', 'Suspendido']] as const).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)}
                    className={`min-h-[44px] rounded-mg-md border text-sm font-extrabold ${status === v ? 'bg-mg-ink text-mg-surface border-mg-ink' : 'bg-mg-surface border-mg-line-strong'}`}>
                    {l}
                  </button>
                ))}
              </div>
              {(status === 'finished' || status === 'playing') && (
                <div className="flex items-end justify-center gap-3">
                  <label className="text-center flex-1 max-w-[10rem]">
                    <span className="block text-sm font-bold truncate mb-1">{home.name}</span>
                    <input inputMode="numeric" aria-label={`Goles de ${home.name}`} className={`${field} text-center mg-num text-3xl font-extrabold`} value={homeScore}
                      placeholder={hasGoals ? String(fromGoals.h) : '0'} onChange={(e) => setHomeScore(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  </label>
                  <span className="pb-3 text-2xl font-extrabold text-mg-muted" aria-hidden="true">–</span>
                  <label className="text-center flex-1 max-w-[10rem]">
                    <span className="block text-sm font-bold truncate mb-1">{away.name}</span>
                    <input inputMode="numeric" aria-label={`Goles de ${away.name}`} className={`${field} text-center mg-num text-3xl font-extrabold`} value={awayScore}
                      placeholder={hasGoals ? String(fromGoals.a) : '0'} onChange={(e) => setAwayScore(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                  </label>
                </div>
              )}
              {mismatch && (
                <div className="rounded-mg-md border border-mg-gold bg-[#fff4d6] text-mg-gold-ink p-3 text-sm font-bold flex flex-wrap items-center gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span className="flex-1">Los goles cargados suman {fromGoals.h}–{fromGoals.a}. Se guardará el marcador escrito.</span>
                  <button type="button" className="underline min-h-[32px]" onClick={() => { setHomeScore(String(fromGoals.h)); setAwayScore(String(fromGoals.a)); }}>Usar {fromGoals.h}–{fromGoals.a}</button>
                </div>
              )}
              {(status === 'finished' || status === 'playing') && !typed && hasGoals && (
                <p className="text-xs text-mg-muted text-center">Sin marcador escrito se usa el de los goles: {fromGoals.h}–{fromGoals.a}.</p>
              )}
            </section>

            {/* Goles */}
            <section aria-labelledby="mr-goals" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="mr-goals" className="text-lg font-extrabold">Goles <span className="text-sm font-semibold text-mg-muted">(para la tabla de goleadores)</span></h3>
              </div>
              {goals.length === 0 && <p className="text-sm text-mg-muted">Sin goles cargados.</p>}
              <ul className="space-y-2">
                {goals.map((g, i) => (
                  <li key={g.key} className="flex flex-wrap items-center gap-2 rounded-mg-md bg-mg-surface-2 p-2">
                    {teamPlayersSelect(g.player_id, (pid, tid) => setGoal(g.key, { player_id: pid, team_id: tid }), `Gol ${i + 1}: jugador`)}
                    <select aria-label={`Gol ${i + 1}: tipo`} className={smallField} value={g.type} onChange={(e) => setGoal(g.key, { type: e.target.value as GoalType })}>
                      <option value="normal">Gol</option>
                      <option value="penalty">Penal</option>
                      <option value="own_goal">Autogol</option>
                    </select>
                    <input aria-label={`Gol ${i + 1}: minuto`} inputMode="numeric" placeholder="Min" className={`${smallField} w-16`} value={g.minute} onChange={(e) => setGoal(g.key, { minute: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                    <button type="button" aria-label={`Quitar gol ${i + 1}`} className="h-10 w-10 flex items-center justify-center rounded-mg-md text-mg-danger hover:bg-mg-danger-tint" onClick={() => { setGoals((x) => x.filter((r) => r.key !== g.key)); setEventsDirty(true); }}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => addGoal(home.id)} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-mg-md border border-mg-line-strong text-sm font-bold"><Plus className="h-4 w-4" aria-hidden="true" /> Gol {home.name}</button>
                <button type="button" onClick={() => addGoal(away.id)} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-mg-md border border-mg-line-strong text-sm font-bold"><Plus className="h-4 w-4" aria-hidden="true" /> Gol {away.name}</button>
              </div>
              {players.length === 0 && <p className="text-xs text-mg-muted">Los equipos no tienen jugadores inscritos; puedes guardar solo el marcador.</p>}
            </section>

            {/* Tarjetas */}
            <section aria-labelledby="mr-cards" className="space-y-2">
              <h3 id="mr-cards" className="text-lg font-extrabold">Tarjetas</h3>
              {cards.length === 0 && <p className="text-sm text-mg-muted">Sin tarjetas.</p>}
              <ul className="space-y-2">
                {cards.map((c, i) => (
                  <li key={c.key} className="flex flex-wrap items-center gap-2 rounded-mg-md bg-mg-surface-2 p-2">
                    {teamPlayersSelect(c.player_id, (pid) => setCard(c.key, { player_id: pid }), `Tarjeta ${i + 1}: jugador`)}
                    <select aria-label={`Tarjeta ${i + 1}: color`} className={smallField} value={c.type} onChange={(e) => setCard(c.key, { type: e.target.value as CardType })}>
                      <option value="yellow">🟨 Amarilla</option>
                      <option value="red">🟥 Roja</option>
                    </select>
                    <input aria-label={`Tarjeta ${i + 1}: minuto`} inputMode="numeric" placeholder="Min" className={`${smallField} w-16`} value={c.minute} onChange={(e) => setCard(c.key, { minute: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                    <input aria-label={`Tarjeta ${i + 1}: motivo`} placeholder="Motivo (opcional)" maxLength={120} className={`${smallField} flex-1 min-w-[8rem]`} value={c.reason} onChange={(e) => setCard(c.key, { reason: e.target.value })} />
                    <button type="button" aria-label={`Quitar tarjeta ${i + 1}`} className="h-10 w-10 flex items-center justify-center rounded-mg-md text-mg-danger hover:bg-mg-danger-tint" onClick={() => { setCards((x) => x.filter((r) => r.key !== c.key)); setEventsDirty(true); }}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => { setCards((c) => [...c, { key: k(), player_id: '', minute: '', type: 'yellow', reason: '' }]); setEventsDirty(true); }}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-mg-md border border-mg-line-strong text-sm font-bold"><Plus className="h-4 w-4" aria-hidden="true" /> Tarjeta</button>
            </section>

            {/* Programación */}
            <section aria-labelledby="mr-when" className="space-y-3 border-t border-mg-line pt-5">
              <h3 id="mr-when" className="text-lg font-extrabold">Día, hora y cancha</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><label htmlFor="mr-date" className={label}>Día</label><input id="mr-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} required /></div>
                <div><label htmlFor="mr-time" className={label}>Hora</label><input id="mr-time" type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} required /></div>
                <div><label htmlFor="mr-round" className={label}>N° de fecha</label><input id="mr-round" inputMode="numeric" className={field} value={round} onChange={(e) => setRound(e.target.value.replace(/\D/g, '').slice(0, 3))} /></div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label htmlFor="mr-venue" className={label}>Cancha</label><input id="mr-venue" className={field} maxLength={120} value={venue} placeholder="Cancha 2" onChange={(e) => setVenue(e.target.value)} /></div>
                <div>
                  <label htmlFor="mr-complex" className={label}>Recinto</label>
                  <select id="mr-complex" className={field} value={complexId} onChange={(e) => setComplexId(e.target.value)}>
                    <option value="">Sin recinto</option>
                    {complexes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {error && <p role="alert" className="rounded-mg-md bg-mg-danger-tint text-mg-danger font-bold p-3 text-sm">{error}</p>}

            <div className="sticky bottom-0 -mx-5 px-5 py-3 bg-mg-surface border-t border-mg-line flex flex-wrap items-center gap-2">
              {championshipId && (
                <a href={`/papeleta/${matchId}`} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-mg-md border border-mg-line-strong text-sm font-bold mr-auto">
                  <Camera className="h-4 w-4" aria-hidden="true" /> Cargar con foto de la papeleta (IA)
                </a>
              )}
              <button type="button" onClick={onClose} disabled={saving} className="min-h-[44px] px-4 rounded-mg-md border border-mg-line-strong font-extrabold text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Guardar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
