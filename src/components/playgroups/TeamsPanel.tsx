import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, ArrowRight, Hand, MessageCircle, Shuffle, Sparkles, Trophy } from 'lucide-react';
import { TeamSide } from '../../types/playGroups';
import { balanceTeams, BalancePlayer, summarize, winChanceA } from '../../utils/teamBalancer';
import { fmtSession, isIn, playErrorText, waLink } from '../../utils/playGroups';
import { fieldClass, primaryBtn, secondaryBtn } from '../payments/PaymentsUi';
import { PanelProps, card } from './shared';

const POS_SHORT: Record<string, string> = { arquero: 'ARQ', defensa: 'DEF', medio: 'MED', delantero: 'DEL' };

/**
 * Equipos parejos. El organizador arma (parejos o a mano), intercambia o pasa jugadores de un equipo
 * a otro, ubica a los que se anotaron después, guarda y comparte;
 * después del partido carga el resultado (y la figura) y el nivel de cada uno se ajusta solo.
 * Los jugadores solo ven los equipos ya guardados (nunca el nivel).
 */
export const TeamsPanel = ({ view, call }: PanelProps) => {
  const { session, members, is_admin: admin } = view;
  const priv = view.private || {};
  const inside = members.filter((m) => isIn(m.status));
  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      map[m.id] = m.name;
      map[`g:${m.id}`] = `Invitado de ${m.name}`;
    }
    return map;
  }, [members]);

  const players: BalancePlayer[] = useMemo(() => {
    const list: BalancePlayer[] = [];
    for (const m of inside) {
      const p = priv[m.id];
      list.push({ key: m.id, rating: p?.rating ?? 1000, position: p?.position ?? null });
      if (m.guests > 0) list.push({ key: `g:${m.id}`, rating: (p?.rating ?? 1000) - 50, position: null });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, view.private]);

  const [teams, setTeams] = useState<Record<string, TeamSide> | null>(session.lineup);
  const [seed, setSeed] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [scoreA, setScoreA] = useState<string>(session.score_a?.toString() ?? '');
  const [scoreB, setScoreB] = useState<string>(session.score_b?.toString() ?? '');
  const [mvp, setMvp] = useState<string>(session.mvp ?? '');

  const previous = view.recent?.find((r) => r.lineup)?.lineup ?? null;
  const build = (s: number) => {
    setTeams(balanceTeams(players, { seed: s, previous }).teams);
    setSeed(s);
    setDirty(true);
    setMsg(null);
  };
  // Mover: la flecha pasa a uno solo; tocar uno y luego otro del otro equipo los intercambia
  const [sel, setSel] = useState<string | null>(null);
  const assign = (key: string, side: TeamSide) => {
    if (!admin) return;
    setTeams((t) => ({ ...(t || {}), [key]: side }));
    setSel(null);
    setDirty(true);
    setMsg(null);
  };
  const move = (key: string) => teams && assign(key, teams[key] === 'A' ? 'B' : 'A');
  const pick = (key: string) => {
    if (!admin || !teams) return;
    if (!sel || sel === key) return setSel(sel === key ? null : key);
    if (teams[sel] && teams[key] && teams[sel] !== teams[key]) {
      setTeams({ ...teams, [sel]: teams[key], [key]: teams[sel] });
      setSel(null);
      setDirty(true);
      setMsg(null);
    } else setSel(key);
  };
  const manual = () => {
    setTeams({});
    setDirty(true);
    setMsg(null);
  };

  const save = async () => {
    if (!teams) return;
    setBusy(true);
    const { error } = await call('play_set_teams', { p_session: session.id, p_teams: teams });
    setBusy(false);
    if (error) setMsg({ ok: false, text: playErrorText(error, 'No pudimos guardar los equipos.') });
    else {
      setDirty(false);
      setMsg({ ok: true, text: 'Equipos guardados: los jugadores ya los ven en el link.' });
    }
  };

  const saveResult = async () => {
    const a = Number(scoreA);
    const b = Number(scoreB);
    if (scoreA === '' || scoreB === '' || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99) {
      setMsg({ ok: false, text: 'Ingresa los goles de cada equipo.' });
      return;
    }
    setBusy(true);
    const { error } = await call('play_set_result', { p_session: session.id, p_score_a: a, p_score_b: b, p_mvp: mvp || null });
    setBusy(false);
    setMsg(error ? { ok: false, text: playErrorText(error, 'No pudimos guardar el resultado.') } : { ok: true, text: 'Resultado guardado. El nivel de cada jugador se ajustó para armar mejor la próxima.' });
  };

  const sideKeys = (side: TeamSide) => Object.keys(teams || {}).filter((k) => teams![k] === side && names[k]);
  const shareText = () =>
    [`⚽ Equipos · ${fmtSession(session.starts_at)}`, '', `🟢 *Verde*: ${sideKeys('A').map((k) => names[k]).join(', ')}`, `⚪ *Blanco*: ${sideKeys('B').map((k) => names[k]).join(', ')}`].join('\n');

  // Jugadores: solo ven los equipos guardados
  if (!admin) {
    if (!session.lineup) return null;
    return (
      <section className={card} aria-labelledby="teams-title">
        <h2 id="teams-title" className="text-lg font-extrabold">Equipos</h2>
        <TeamColumns teams={session.lineup} names={names} me={view.me} />
        {session.score_a != null && session.score_b != null && (
          <p className="font-display text-2xl font-extrabold uppercase text-center">Verde {session.score_a} – {session.score_b} Blanco</p>
        )}
      </section>
    );
  }

  const summary = teams ? summarize(players, teams) : null;
  const chance = summary ? winChanceA(summary.avgA, summary.avgB) : 0.5;
  const missing = teams ? players.filter((p) => !teams[p.key]).length : 0;
  const assignedMvp = Object.keys(session.lineup || {}).filter((k) => !k.startsWith('g:'));

  return (
    <div className="space-y-4">
      <section className={card} aria-labelledby="teams-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="teams-title" className="text-lg font-extrabold">Equipos parejos</h2>
          <p className="text-sm text-mg-muted">{players.length} jugadores</p>
        </div>
        {players.length < 4 ? (
          <p className="text-sm text-mg-muted">Se arman cuando haya al menos 4 en la lista.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primaryBtn} onClick={() => build(0)}>
                <Sparkles className="h-4 w-4" aria-hidden="true" /> {teams ? 'Armar de nuevo' : 'Armar equipos parejos'}
              </button>
              {!teams && (
                <button type="button" className={secondaryBtn} onClick={manual}>
                  <Hand className="h-4 w-4" aria-hidden="true" /> Armar a mano
                </button>
              )}
              {teams && (
                <button type="button" className={secondaryBtn} onClick={() => build(seed + 1)}>
                  <Shuffle className="h-4 w-4" aria-hidden="true" /> Otra combinación
                </button>
              )}
            </div>
            {teams && summary && (
              <>
                <p className="text-sm font-bold" aria-live="polite">
                  {Number.isFinite(chance) && Object.values(teams).includes('A') && Object.values(teams).includes('B')
                    ? `${Math.abs(chance - 0.5) < 0.06 ? 'Muy parejo' : Math.abs(chance - 0.5) < 0.12 ? 'Parejo' : 'Algo disparejo'} · Verde ${Math.round(chance * 100)}% – ${Math.round((1 - chance) * 100)}% Blanco`
                    : 'Ubica a cada jugador en Verde o Blanco'}
                  {missing > 0 ? ` · ${missing} sin equipo` : ''}
                </p>
                {missing > 0 && (
                  <div className="rounded-mg-md border border-dashed border-mg-gold bg-[#fff4d6] p-2 space-y-1" aria-label="Jugadores sin equipo">
                    <p className="text-sm font-extrabold text-mg-gold-ink px-1">Sin equipo · {missing}</p>
                    <ul className="space-y-1">
                      {players.filter((p) => !teams[p.key]).map((p) => (
                        <li key={p.key} className="flex items-center gap-2 min-h-[40px] px-2 rounded-mg-sm bg-mg-surface border border-mg-line">
                          <span className="flex-1 truncate text-sm font-semibold">{names[p.key]}</span>
                          <button type="button" className="min-h-[36px] px-3 rounded-mg-sm bg-mg-pitch text-mg-on-pitch text-xs font-extrabold" onClick={() => assign(p.key, 'A')}>Verde</button>
                          <button type="button" className="min-h-[36px] px-3 rounded-mg-sm border border-mg-line-strong text-xs font-extrabold" onClick={() => assign(p.key, 'B')}>Blanco</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <TeamColumns teams={teams} names={names} me={null} onMove={move} onPick={pick} selected={sel} detail={(k) => {
                  const p = priv[k.replace(/^g:/, '')];
                  return k.startsWith('g:') ? null : p?.position ? POS_SHORT[p.position] : null;
                }} />
                <p className="text-xs text-mg-muted flex items-start gap-1" aria-live="polite">
                  <ArrowLeftRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  {sel ? `Ahora toca a alguien del otro equipo para intercambiarlo con ${names[sel]}.` : 'Toca un jugador y luego uno del otro equipo para intercambiarlos, o usa la flecha para pasarlo solo.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={primaryBtn} disabled={busy || !dirty} onClick={save}>{dirty ? 'Guardar equipos' : 'Guardados'}</button>
                  <a href={waLink(shareText())} target="_blank" rel="noopener noreferrer" className={secondaryBtn}>
                    <MessageCircle className="h-4 w-4" aria-hidden="true" /> Compartir por WhatsApp
                  </a>
                </div>
              </>
            )}
            <p className="text-xs text-mg-muted">
              Se reparten primero los arqueros, después por nivel y se buscan intercambios para emparejar posiciones y no repetir los mismos equipos.
              El nivel parte de las estrellas que pones en Plantel y se ajusta con cada resultado. Solo tú lo ves.
            </p>
          </>
        )}
      </section>

      {session.lineup && (
        <section className={card} aria-labelledby="result-title">
          <h2 id="result-title" className="text-lg font-extrabold flex items-center gap-2"><Trophy className="h-5 w-5 text-mg-gold-ink" aria-hidden="true" /> Resultado</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="block text-sm font-bold">Verde</span>
              <input inputMode="numeric" className={`${fieldClass} mg-num text-xl`} value={scoreA} onChange={(e) => setScoreA(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </label>
            <label className="space-y-1">
              <span className="block text-sm font-bold">Blanco</span>
              <input inputMode="numeric" className={`${fieldClass} mg-num text-xl`} value={scoreB} onChange={(e) => setScoreB(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="block text-sm font-bold">Figura del partido (opcional)</span>
            <select className={fieldClass} value={mvp} onChange={(e) => setMvp(e.target.value)}>
              <option value="">Sin figura</option>
              {assignedMvp.map((k) => <option key={k} value={k}>{names[k]}</option>)}
            </select>
          </label>
          <button type="button" className={primaryBtn} disabled={busy} onClick={saveResult}>{session.status === 'played' ? 'Corregir resultado' : 'Guardar resultado'}</button>
        </section>
      )}

      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm font-bold ${msg.ok ? 'text-mg-pitch-deep' : 'text-mg-danger'}`}>{msg.text}</p>}
    </div>
  );
};

const TeamColumns = ({ teams, names, me, onMove, onPick, selected, detail }: {
  teams: Record<string, TeamSide>;
  names: Record<string, string>;
  me: string | null;
  onMove?: (k: string) => void;
  onPick?: (k: string) => void;
  selected?: string | null;
  detail?: (k: string) => string | null;
}) => (
  <div className="grid grid-cols-2 gap-3">
    {(['A', 'B'] as TeamSide[]).map((side) => {
      const keys = Object.keys(teams).filter((k) => teams[k] === side && names[k]).sort((a, b) => names[a].localeCompare(names[b]));
      return (
        <div key={side} className={`rounded-mg-md border p-2 ${side === 'A' ? 'border-mg-pitch bg-mg-pitch-tint' : 'border-mg-line-strong bg-mg-surface'}`}>
          <p className="font-display text-xl font-extrabold uppercase px-1">{side === 'A' ? 'Verde' : 'Blanco'} · {keys.length}</p>
          <ul className="space-y-1 mt-1">
            {keys.map((k) => (
              <li key={k}>
                {onMove ? (
                  <div className={`flex items-stretch rounded-mg-sm border bg-mg-surface ${selected === k ? 'border-mg-gold ring-2 ring-mg-gold' : 'border-mg-line'}`}>
                    {side === 'B' && (
                      <button type="button" onClick={() => onMove(k)} className="px-2 min-h-[40px] text-mg-muted hover:text-mg-ink border-r border-mg-line" aria-label={`Pasar a ${names[k]} a Verde`}>
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <button type="button" onClick={() => onPick?.(k)} aria-pressed={selected === k} className="flex-1 min-w-0 min-h-[40px] text-left px-2 text-sm font-semibold flex items-center justify-between gap-2">
                      <span className="truncate">{names[k]}</span>
                      {detail?.(k) && <span className="text-[11px] font-extrabold text-mg-muted">{detail(k)}</span>}
                    </button>
                    {side === 'A' && (
                      <button type="button" onClick={() => onMove(k)} className="px-2 min-h-[40px] text-mg-muted hover:text-mg-ink border-l border-mg-line" aria-label={`Pasar a ${names[k]} a Blanco`}>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="block px-2 py-1.5 text-sm font-semibold">{names[k]}{k === me ? ' (tú)' : ''}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      );
    })}
  </div>
);
