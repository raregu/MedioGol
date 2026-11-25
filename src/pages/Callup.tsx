import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, HelpCircle, Loader2, MessageCircle, RefreshCw, Trophy, UserPlus, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { isMissingFeature, playErrorText, waLink } from '../utils/playGroups';
import {
  CallupMember, CallupStatus, CallupView, STATUS_LABEL, callupLink, callupMessage, fmtCallupWhen, readCallupToken, rivalOf, roundLabel, saveCallupToken,
} from '../utils/callups';

const field = 'w-full min-h-[44px] px-3 border border-mg-line-strong rounded-mg-md bg-mg-surface text-mg-ink';
const btn = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-mg-md font-extrabold text-sm disabled:opacity-50';
const card = 'rounded-mg-lg border border-mg-line bg-mg-surface p-4 space-y-3';

const STATUS_STYLE: Record<CallupStatus, { on: string; icon: typeof Check }> = {
  yes: { on: 'bg-mg-pitch text-mg-on-pitch border-mg-pitch', icon: Check },
  maybe: { on: 'bg-mg-gold text-mg-on-gold border-mg-gold', icon: HelpCircle },
  no: { on: 'bg-mg-danger text-white border-mg-danger', icon: X },
};

/** /c/:code — la lista de un partido de liga: cada jugador dice si va; quien la armó la comparte y la ve completa. */
export const Callup = () => {
  const { user } = useAuth();
  const code = useMemo(() => window.location.pathname.split('/').filter(Boolean)[1] || '', []);
  const [view, setView] = useState<CallupView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'notfound' | 'error'>('loading');
  const [token, setToken] = useState<string | null>(null);
  const req = useRef(0);

  const load = useCallback(async (tk?: string | null) => {
    const n = ++req.current;
    const call = (t: string | null) => supabase.rpc('callup_view', { p_code: code, p_token: t });
    let { data, error } = await call(tk ?? null);
    // Primera carga: con la lista ya sabemos el equipo y buscamos el token de este teléfono
    if (!error && data && !(data as CallupView).me && tk === undefined) {
      const saved = readCallupToken((data as CallupView).callup.team_id);
      if (saved) {
        setToken(saved);
        ({ data, error } = await call(saved));
      }
    }
    if (n !== req.current) return;
    if (error) {
      setStatus(isMissingFeature(error) ? 'missing' : error.code === 'P0002' ? 'notfound' : 'error');
      if (!isMissingFeature(error) && error.code !== 'P0002') console.error('callup_view', error);
      return;
    }
    setView(data as CallupView);
    setStatus('ready');
  }, [code]);

  useEffect(() => {
    load();
    const onVis = () => document.visibilityState === 'visible' && load(token);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    if (view) document.title = `${view.callup.team} vs ${rivalOf(view)} · MedioGol`;
  }, [view]);

  // Respuesta de un toque desde WhatsApp: ?r=si | duda | no
  const [quick, setQuick] = useState<CallupStatus | null>(() => {
    const r = new URLSearchParams(window.location.search).get('r');
    return r === 'si' ? 'yes' : r === 'duda' ? 'maybe' : r === 'no' ? 'no' : null;
  });
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const quickDone = useRef(false);

  const reply = useCallback(async (st: CallupStatus, note: string | null, member?: string) => {
    const { error } = await supabase.rpc('callup_reply', { p_code: code, p_status: st, p_note: note, p_token: token, p_member: member ?? null });
    if (error) return playErrorText(error, 'No pudimos guardar la respuesta. Intenta de nuevo.');
    await load(token);
    return null;
  }, [code, token, load]);

  useEffect(() => {
    if (!quick || quickDone.current || !view?.me) return;
    quickDone.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete('r');
    window.history.replaceState({}, '', url.toString());
    const mine = view.members.find((m) => m.id === view.me);
    reply(quick, mine?.note ?? null).then((err) => {
      setQuick(null);
      setFlash(err ? { ok: false, text: err } : { ok: true, text: quick === 'yes' ? '¡Listo! Quedaste en la lista: vas.' : quick === 'maybe' ? 'Listo, quedaste en duda. Avisa cuando sepas.' : 'Listo, avisaste que no vas. ¡Gracias por avisar!' });
    });
  }, [quick, view, reply]);

  if (status === 'loading') {
    return <Layout><div className="flex justify-center py-20" role="status"><Loader2 className="h-8 w-8 animate-spin text-mg-pitch" aria-hidden="true" /><span className="sr-only">Cargando</span></div></Layout>;
  }
  if (status !== 'ready' || !view) {
    const text = { missing: 'Las listas de partido se están activando. Vuelve a intentar en un rato.', notfound: 'Esta lista no existe o el link cambió.', error: 'No pudimos cargar la lista. Revisa tu conexión.' }[status as 'missing' | 'notfound' | 'error'];
    return (
      <Layout>
        <div role="alert" className="max-w-xl mx-auto mt-10 rounded-mg-lg border border-mg-line bg-mg-surface p-6 text-center space-y-4 font-sans text-mg-ink">
          <p className="font-bold">{text}</p>
          {status === 'error' && <button type="button" className={`${btn} bg-mg-pitch text-mg-on-pitch`} onClick={() => load(token)}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar</button>}
        </div>
      </Layout>
    );
  }

  const m = view.match;
  const me = view.members.find((x) => x.id === view.me) || null;
  const going = view.members.filter((x) => x.status === 'yes');
  const played = m ? m.status === 'finished' || m.status === 'completed' : false;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto font-sans text-mg-ink space-y-4 -mt-2">
        <header className="bg-mg-navy text-mg-on-navy rounded-mg-lg px-4 pt-4 pb-5 space-y-1">
          <p className="mg-label text-mg-gold">Lista del partido · {view.callup.team}</p>
          <h1 className="font-display text-3xl sm:text-4xl leading-9 font-extrabold uppercase">{m?.home || '—'} vs {m?.away || '—'}</h1>
          <p className="text-sm font-semibold text-mg-on-navy-muted">{fmtCallupWhen(m?.date)}{m?.venue ? ` · ${m.venue}` : ''}</p>
          {m && (
            <p className="text-sm font-semibold text-mg-on-navy-muted flex items-center gap-1.5">
              <Trophy className="h-4 w-4" aria-hidden="true" /> {m.championship}{roundLabel(m) ? ` · ${roundLabel(m)}` : ''}
              {played && m.home_score != null && <span className="ml-1 text-mg-gold">· Terminó {m.home_score}–{m.away_score}</span>}
            </p>
          )}
        </header>

        {flash && (
          <p role={flash.ok ? 'status' : 'alert'} className={`rounded-mg-lg border-2 p-4 font-extrabold ${flash.ok ? 'border-mg-pitch bg-mg-pitch-tint text-mg-pitch-deep' : 'border-mg-danger bg-mg-danger-tint text-mg-danger'}`}>{flash.text}</p>
        )}

        {me ? (
          <MyReply key={`${me.status}|${me.note}`} me={me} onReply={reply} code={code} token={token} reload={() => load(token)} />
        ) : (
          <JoinBox view={view} code={code} quick={quick} loggedIn={!!user} onJoined={(tk) => {
            if (tk) {
              saveCallupToken(view.callup.team_id, tk);
              setToken(tk);
            }
            load(tk ?? token);
          }} />
        )}

        {view.can_manage && <ManagerBox view={view} code={code} reload={() => load(token)} onReplyFor={reply} />}

        <section className={card} aria-labelledby="cu-going">
          <div className="flex items-baseline justify-between">
            <h2 id="cu-going" className="text-lg font-extrabold">Quiénes van</h2>
            <p className="mg-num text-2xl font-extrabold text-mg-pitch-deep">{going.length}</p>
          </div>
          <Lists members={view.members} me={view.me} />
        </section>

        {!user && me && (
          <p className="text-xs text-mg-muted text-center">
            Tu apodo quedó guardado en este teléfono. <a href="/register" className="font-bold text-mg-pitch-deep underline">Crea tu cuenta</a> para ver tus partidos en el Inicio.
          </p>
        )}
      </div>
    </Layout>
  );
};

/** Mi respuesta: Voy / En duda / No voy + comentario opcional + cambiar apodo. */
const MyReply = ({ me, onReply, code, token, reload }: {
  me: CallupMember; onReply: (st: CallupStatus, note: string | null) => Promise<string | null>; code: string; token: string | null; reload: () => void;
}) => {
  const [note, setNote] = useState(me.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nickEdit, setNickEdit] = useState(false);
  const [nick, setNick] = useState(me.name);

  const send = async (st: CallupStatus) => {
    setBusy(true);
    setError(null);
    const err = await onReply(st, note.trim() || null);
    setBusy(false);
    if (err) setError(err);
  };
  const saveNick = async (e: FormEvent) => {
    e.preventDefault();
    if (!nick.trim() || nick.trim() === me.name) return setNickEdit(false);
    setBusy(true);
    const { error: err } = await supabase.rpc('callup_set_nickname', { p_code: code, p_name: nick.trim(), p_token: token });
    setBusy(false);
    if (err) setError(playErrorText(err, 'No pudimos cambiar tu apodo.'));
    else {
      setNickEdit(false);
      reload();
    }
  };

  return (
    <section className={card} aria-labelledby="cu-me">
      <h2 id="cu-me" className="text-lg font-extrabold">{me.status ? 'Tu respuesta' : '¿Vas al partido?'}</h2>
      <div className="grid grid-cols-3 gap-2">
        {(['yes', 'maybe', 'no'] as CallupStatus[]).map((st) => {
          const Icon = STATUS_STYLE[st].icon;
          const on = me.status === st;
          return (
            <button key={st} type="button" disabled={busy} aria-pressed={on} onClick={() => send(st)}
              className={`flex flex-col items-center justify-center gap-1 min-h-[76px] rounded-mg-md border-2 font-extrabold text-sm ${on ? STATUS_STYLE[st].on : 'bg-mg-surface border-mg-line-strong'}`}>
              <Icon className="h-6 w-6" aria-hidden="true" /> {STATUS_LABEL[st]}
            </button>
          );
        })}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (me.status) send(me.status); }}>
        <input aria-label="Comentario (opcional)" className={`${field} flex-1`} maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comentario (opcional): «llego tarde»" />
        {me.status && note.trim() !== (me.note || '') && <button type="submit" disabled={busy} className={`${btn} border border-mg-line-strong`}>Guardar</button>}
      </form>
      {nickEdit ? (
        <form onSubmit={saveNick} className="flex flex-wrap gap-2">
          <input aria-label="Tu apodo" autoFocus maxLength={20} value={nick} onChange={(e) => setNick(e.target.value)} className={`${field} flex-1 min-w-[10rem] !min-h-[40px] text-sm`} />
          <button type="submit" disabled={busy} className={`${btn} !min-h-[40px] border border-mg-line-strong`}>Guardar</button>
          <button type="button" onClick={() => setNickEdit(false)} className={`${btn} !min-h-[40px] border border-mg-line-strong`}>Cancelar</button>
        </form>
      ) : (
        <p className="text-sm text-mg-muted flex flex-wrap items-center gap-2">
          Te ven como <span className="font-extrabold text-mg-ink">{me.name}</span>
          <button type="button" className="font-bold text-mg-pitch-deep underline min-h-[32px]" onClick={() => { setNick(me.name); setNickEdit(true); }}>Cambiar mi apodo</button>
        </p>
      )}
      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
    </section>
  );
};

/** Primera vez: tocar su nombre (si ya está en la lista del equipo) o escribir su apodo. */
const JoinBox = ({ view, code, quick, loggedIn, onJoined }: { view: CallupView; code: string; quick: CallupStatus | null; loggedIn: boolean; onJoined: (token: string | null) => void }) => {
  const unclaimed = view.members.filter((m) => !m.claimed);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = (data: unknown) => onJoined((data as { token?: string | null } | null)?.token || null);
  const claim = async (m: CallupMember) => {
    if (!window.confirm(`¿Eres ${m.name}?`)) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('callup_claim', { p_code: code, p_member: m.id });
    setBusy(false);
    if (err) setError(playErrorText(err, 'No pudimos guardar tu nombre.'));
    else done(data);
  };
  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('callup_join', { p_code: code, p_name: name.trim() });
    setBusy(false);
    if (err) setError(playErrorText(err, 'No pudimos sumarte a la lista.'));
    else done(data);
  };

  return (
    <section className={`${card} border-2 !border-mg-pitch`} aria-labelledby="cu-join">
      <h2 id="cu-join" className="text-lg font-extrabold">¿Vas al partido? Primero, ¿quién eres?</h2>
      {quick && <p className="rounded-mg-md bg-[#fff4d6] text-mg-gold-ink font-bold p-2 text-sm">Elige tu nombre y guardamos que {quick === 'yes' ? 'vas' : quick === 'maybe' ? 'estás en duda' : 'no vas'}. Solo se pide la primera vez.</p>}
      {unclaimed.length > 0 && (
        <>
          <p className="text-sm text-mg-muted">Toca tu nombre. Queda guardado en este teléfono para los próximos partidos.</p>
          <ul className="flex flex-wrap gap-2">
            {unclaimed.map((m) => (
              <li key={m.id}><button type="button" disabled={busy} onClick={() => claim(m)} className={`${btn} !min-h-[40px] border border-mg-line-strong bg-mg-surface`}>{m.name}</button></li>
            ))}
          </ul>
        </>
      )}
      <form onSubmit={join} className="space-y-2">
        <label htmlFor="cu-nick" className="block text-sm font-bold">{unclaimed.length ? '¿No estás? ' : ''}¿Cómo te dicen en la cancha?</label>
        <div className="flex flex-wrap gap-2">
          <input id="cu-nick" className={`${field} flex-1 min-w-[10rem]`} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Pin, El Mago, Chino" required />
          <button type="submit" disabled={busy || !name.trim()} className={`${btn} bg-mg-pitch text-mg-on-pitch`}>Entrar</button>
        </div>
      </form>
      {!loggedIn && <p className="text-xs text-mg-muted">No necesitas cuenta. <a className="font-bold underline" href={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}>¿Tienes cuenta? Entra</a></p>}
      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
    </section>
  );
};

/** Quien armó la lista: resumen, compartir por WhatsApp, agregar jugadores y responder por otros. */
const ManagerBox = ({ view, code, reload, onReplyFor }: { view: CallupView; code: string; reload: () => void; onReplyFor: (st: CallupStatus, note: string | null, member?: string) => Promise<string | null> }) => {
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = (st: CallupStatus | null) => view.members.filter((m) => m.status === st).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(callupLink(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copia el link de la lista', callupLink(code));
    }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('callup_member_manage', { p_code: code, p_action: 'add', p_member: null, p_name: name.trim() });
    setBusy(false);
    if (err) setError(playErrorText(err, 'No pudimos agregar al jugador.'));
    else {
      setName('');
      reload();
    }
  };
  const setFor = async (m: CallupMember, v: string) => {
    if (!v) return;
    setError(null);
    const err = await onReplyFor(v as CallupStatus, m.note, m.id);
    if (err) setError(err);
  };

  return (
    <section className={card} aria-labelledby="cu-admin">
      <h2 id="cu-admin" className="text-lg font-extrabold">Tu lista</h2>
      <div className="grid grid-cols-4 gap-2 text-center">
        {([['Van', count('yes'), 'text-mg-pitch-deep'], ['En duda', count('maybe'), 'text-mg-gold-ink'], ['No van', count('no'), 'text-mg-danger'], ['Sin responder', count(null), 'text-mg-muted']] as const).map(([l, n, c]) => (
          <div key={l} className="rounded-mg-md border border-mg-line p-2">
            <p className={`mg-num text-2xl font-extrabold ${c}`}>{n}</p>
            <p className="text-[11px] font-extrabold uppercase text-mg-muted leading-tight">{l}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={waLink(callupMessage(view))} target="_blank" rel="noopener noreferrer" className={`${btn} bg-mg-pitch text-mg-on-pitch flex-1`}>
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> Compartir por WhatsApp
        </a>
        <button type="button" onClick={copy} className={`${btn} border border-mg-line-strong bg-mg-surface`}>
          <Copy className="h-4 w-4" aria-hidden="true" /> {copied ? 'Link copiado' : 'Copiar link'}
        </button>
      </div>
      <p className="text-xs text-mg-muted">El mensaje lleva quiénes van y tres links: Voy, En duda y No voy. Cada uno se anota con un toque. Compártelo de nuevo cuando quieras recordar a los que faltan.</p>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input aria-label="Apodo del jugador" className={`${field} flex-1 min-w-[10rem] !min-h-[40px] text-sm`} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="Agregar jugador (apodo)" />
        <button type="submit" disabled={busy || !name.trim()} className={`${btn} !min-h-[40px] border border-mg-line-strong`}><UserPlus className="h-4 w-4" aria-hidden="true" /> Agregar</button>
      </form>
      <details>
        <summary className="cursor-pointer text-sm font-bold text-mg-muted min-h-[32px]">Responder por un jugador</summary>
        <ul className="divide-y divide-mg-line mt-1">
          {view.members.map((m) => (
            <li key={m.id} className="flex items-center gap-2 min-h-[44px]">
              <span className="flex-1 font-semibold truncate">{m.name}</span>
              <select aria-label={`Respuesta de ${m.name}`} value={m.status || ''} onChange={(e) => setFor(m, e.target.value)} className="min-h-[40px] px-2 border border-mg-line-strong rounded-mg-md bg-mg-surface text-sm">
                <option value="">Sin responder</option>
                <option value="yes">Va</option>
                <option value="maybe">En duda</option>
                <option value="no">No va</option>
              </select>
            </li>
          ))}
        </ul>
      </details>
      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
    </section>
  );
};

const Lists = ({ members, me }: { members: CallupMember[]; me: string | null }) => {
  const by = (st: CallupStatus | null) => members.filter((m) => m.status === st);
  const label = (m: CallupMember) => `${m.name}${m.id === me ? ' (tú)' : ''}`;
  const going = by('yes');
  const maybe = by('maybe');
  const no = by('no');
  const silent = by(null);
  return (
    <div className="space-y-3">
      {going.length === 0 ? <p className="text-sm text-mg-muted">Todavía nadie confirma.</p> : (
        <ul className="divide-y divide-mg-line">
          {going.map((m) => (
            <li key={m.id} className="py-2 flex items-baseline gap-2">
              <Check className="h-4 w-4 text-mg-pitch-deep flex-shrink-0 self-center" aria-hidden="true" />
              <span className="font-semibold">{label(m)}</span>
              {m.note && <span className="text-sm text-mg-muted truncate">«{m.note}»</span>}
            </li>
          ))}
        </ul>
      )}
      {maybe.length > 0 && (
        <div className="pt-2 border-t border-mg-line">
          <h3 className="mg-label text-mg-gold-ink mb-1">En duda · {maybe.length}</h3>
          <ul className="space-y-1">{maybe.map((m) => <li key={m.id} className="text-sm"><span className="font-semibold">{label(m)}</span>{m.note && <span className="text-mg-muted"> «{m.note}»</span>}</li>)}</ul>
        </div>
      )}
      {no.length > 0 && <p className="text-sm text-mg-muted pt-2 border-t border-mg-line"><span className="font-bold">No van:</span> {no.map(label).join(' · ')}</p>}
      {silent.length > 0 && <p className="text-sm text-mg-muted"><span className="font-bold">Sin responder ({silent.length}):</span> {silent.map(label).join(' · ')}</p>}
      <p className="text-xs text-mg-muted flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> La lista se actualiza sola cuando vuelves a esta pantalla.</p>
    </div>
  );
};
