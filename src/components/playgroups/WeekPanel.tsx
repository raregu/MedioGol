import { useState } from 'react';
import { Check, Copy, CreditCard, MessageCircle, UserPlus } from 'lucide-react';
import { PlayMember } from '../../types/playGroups';
import { byQueue, fmtMoment, formatPerPerson, groupLink, isIn, listMessage, playErrorText, waLink } from '../../utils/playGroups';
import { primaryBtn, secondaryBtn } from '../payments/PaymentsUi';
import { CHIP, PanelProps, card, smallBtn } from './shared';

/** La semana: mi estado (voy / no voy / invitado / pagué) y quiénes van, en espera y no van. */
export const WeekPanel = ({ view, call, token }: PanelProps) => {
  const { group, session, members, is_admin: admin } = view;
  const me = members.find((m) => m.id === view.me) || null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const now = Date.now();
  const played = session.status !== 'open' || new Date(session.starts_at).getTime() <= now;
  const listOpen = new Date(session.opens_at).getTime() <= now;
  const subsOpen = new Date(session.subs_at).getTime() <= now;
  const perPerson = formatPerPerson(session.price, session.slots);

  const inside = members.filter((m) => isIn(m.status)).sort((a, b) => Number(a.status === 'auto') - Number(b.status === 'auto') || a.name.localeCompare(b.name));
  const waiting = members.filter((m) => m.status === 'wait').sort(byQueue);
  const out = members.filter((m) => m.status === 'out');
  const silent = members.filter((m) => m.status == null);
  const free = Math.max(session.slots - session.used, 0);

  const run = async (key: string, fn: string, args: Record<string, unknown>, fallback: string) => {
    setBusy(key);
    setError(null);
    const { error: err } = await call(fn, { ...args, p_token: token });
    setBusy(null);
    if (err) setError(playErrorText(err, fallback));
  };
  const respond = (status: 'in' | 'out', guests = 0, member?: string) =>
    run(`r:${member || 'me'}:${status}:${guests}`, 'play_respond', { p_session: session.id, p_status: status, p_guests: guests, p_member: member || null }, 'No pudimos guardar tu respuesta. Intenta de nuevo.');
  const setPaid = (paid: boolean, member?: string) =>
    run(`p:${member || 'me'}`, 'play_set_paid', { p_session: session.id, p_paid: paid, p_member: member || null }, 'No pudimos marcar el pago.');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(groupLink(group.invite_code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copia el link del grupo', groupLink(group.invite_code));
    }
  };

  // --- Mi estado ---
  let box: { tone: string; title: string; text: string } | null = null;
  if (me) {
    const waitPos = waiting.findIndex((m) => m.id === me.id) + 1;
    if (played) box = { tone: 'bg-mg-surface-2 text-mg-ink border-mg-line', title: 'Semana jugada', text: 'La próxima lista se abre sola.' };
    else if (me.status === 'auto' && group.fixed_mode === 'confirm')
      box = { tone: 'bg-[#fff4d6] text-mg-gold-ink border-mg-gold', title: 'Te falta confirmar', text: `Confirma antes del ${fmtMoment(session.closes_at)} o tu cupo pasa a la espera.` };
    else if (isIn(me.status))
      box = {
        tone: 'bg-mg-pitch-tint text-mg-pitch-deep border-mg-pitch',
        title: 'Estás adentro',
        text: me.status === 'auto' ? `Como fijo no tienes que confirmar. Si no puedes, avisa antes del ${fmtMoment(session.closes_at)} para que entre alguien de la espera.` : 'Si al final no puedes, avisa para que suba el primero de la espera.',
      };
    else if (me.status === 'wait')
      box = { tone: 'bg-[#fff4d6] text-mg-gold-ink border-mg-gold', title: `En espera · ${waitPos}°`, text: subsOpen ? 'Si alguien se baja, entras solo. Revisa antes de ir.' : `Los cupos libres se reparten el ${fmtMoment(session.subs_at)} por orden de llegada.` };
    else if (me.status === 'out')
      box = { tone: 'bg-mg-danger-tint text-mg-danger border-mg-danger', title: 'No vas esta semana', text: me.role === 'fixed' ? 'La próxima semana vuelves a estar adentro como siempre.' : '¿Cambiaste de idea? Anótate de nuevo.' };
    else if (!listOpen) box = { tone: 'bg-mg-surface-2 text-mg-ink border-mg-line', title: 'Lista cerrada', text: `Se abre el ${fmtMoment(session.opens_at)}.` };
    else box = { tone: 'bg-mg-surface text-mg-ink border-mg-line-strong', title: free > 0 ? `Quedan ${free} cupos` : 'Lista llena', text: free > 0 ? (subsOpen ? 'Anótate: entran por orden de llegada.' : `Te anotas ahora y se reparten el ${fmtMoment(session.subs_at)} por orden de llegada.`) : 'Anótate en la espera: si alguien se baja, entras.' };
  }
  const canGoing = me && !played && (listOpen || me.role === 'fixed');

  return (
    <div className="space-y-4">
      {box && (
        <section role="status" className={`rounded-mg-lg border p-4 space-y-3 ${box.tone}`}>
          <p className="font-display text-3xl leading-8 font-extrabold uppercase">{box.title}</p>
          <p className="text-sm font-semibold">{box.text}</p>
          {canGoing && (
            <div className="flex flex-wrap gap-2">
              {isIn(me!.status) || me!.status === 'wait' ? (
                <>
                  {me!.status === 'auto' && group.fixed_mode === 'confirm' && (
                    <button type="button" className={primaryBtn} disabled={!!busy} onClick={() => respond('in', me!.guests)}>
                      <Check className="h-4 w-4" aria-hidden="true" /> Confirmo que voy
                    </button>
                  )}
                  <button type="button" className={`${secondaryBtn} !border-mg-danger !text-mg-danger`} disabled={!!busy} onClick={() => respond('out')}>
                    {me!.status === 'wait' ? 'Salir de la espera' : 'Esta semana no voy'}
                  </button>
                </>
              ) : (
                <button type="button" className={primaryBtn} disabled={!!busy} onClick={() => respond('in')}>
                  <Check className="h-4 w-4" aria-hidden="true" /> {me!.role === 'fixed' && me!.status === 'out' ? 'Me equivoqué, sí voy' : free > 0 ? 'Voy' : 'Anotarme en la espera'}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {me && !played && (isIn(me.status) || me.status === 'wait') && (group.allow_guests || (session.price && isIn(me.status))) && (
        <section className={card} aria-label="Esta semana">
          <div className="flex flex-wrap gap-2">
            {group.allow_guests && (
              <button type="button" className={`${secondaryBtn} ${me.guests ? '!bg-mg-pitch-tint !border-mg-pitch' : ''}`} disabled={!!busy} aria-pressed={me.guests > 0} onClick={() => respond('in', me.guests ? 0 : 1)}>
                <UserPlus className="h-4 w-4" aria-hidden="true" /> {me.guests ? 'Llevas 1 invitado (quitar)' : 'Llevar un invitado'}
              </button>
            )}
            {session.price != null && session.price > 0 && isIn(me.status) && (
              <button type="button" className={`${secondaryBtn} ${me.paid ? '!bg-mg-pitch-tint !border-mg-pitch' : ''}`} disabled={!!busy} aria-pressed={me.paid} onClick={() => setPaid(!me.paid)}>
                <CreditCard className="h-4 w-4" aria-hidden="true" /> {me.paid ? `Pagaste ${perPerson} (quitar)` : `Marcar que pagué ${perPerson}`}
              </button>
            )}
          </div>
        </section>
      )}

      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}

      {admin && !played && (
        <div className="flex flex-wrap gap-2">
          <a href={waLink(listMessage(view))} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> {inside.some((m) => m.status === 'auto') ? 'Recordar por WhatsApp' : 'Compartir lista por WhatsApp'}
          </a>
          <button type="button" className={secondaryBtn} onClick={copy}>
            <Copy className="h-4 w-4" aria-hidden="true" /> {copied ? 'Link copiado' : 'Copiar link del grupo'}
          </button>
        </div>
      )}

      {admin && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Van" value={`${session.used}/${session.slots}`} />
          <Stat label="Sin responder" value={String(inside.filter((m) => m.status === 'auto').length)} warn={group.fixed_mode === 'confirm'} />
          <Stat label="En espera" value={String(waiting.length)} />
          {session.price ? <Stat label="Pagaron" value={`${inside.filter((m) => m.paid).length}/${inside.length}`} /> : <Stat label="No van" value={String(out.length)} />}
        </div>
      )}

      <section className={card} aria-labelledby="who">
        <div className="flex items-baseline justify-between">
          <h2 id="who" className="text-lg font-extrabold">Quiénes van</h2>
          <p className="mg-num text-2xl font-extrabold text-mg-pitch-deep">{session.used}/{session.slots}</p>
        </div>
        {inside.length === 0 ? (
          <p className="text-sm text-mg-muted">Todavía no hay nadie anotado.</p>
        ) : (
          <ul className="divide-y divide-mg-line">
            {inside.map((m) => (
              <Row key={m.id} m={m} me={view.me} admin={admin} played={played} priced={!!session.price} busy={busy}
                onOut={() => respond('out', 0, m.id)} onPaid={() => setPaid(!m.paid, m.id)} pendingLabel={group.fixed_mode === 'confirm' ? 'por confirmar' : 'sin responder'} />
            ))}
          </ul>
        )}
        {waiting.length > 0 && (
          <div className="pt-2 border-t border-mg-line">
            <h3 className="mg-label text-mg-muted mb-1">Espera</h3>
            <ol className="divide-y divide-mg-line">
              {waiting.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2 min-h-[44px]">
                  <span className="mg-num w-6 text-mg-muted font-bold">{i + 1}°</span>
                  <span className="flex-1 font-semibold truncate">{m.name}{m.id === view.me ? ' (tú)' : ''}{m.guests ? ' +1' : ''}</span>
                  {admin && !played && <button type="button" className={smallBtn} disabled={!!busy} onClick={() => respond('out', 0, m.id)}>Quitar</button>}
                </li>
              ))}
            </ol>
          </div>
        )}
        {out.length > 0 && (
          <p className="text-sm text-mg-muted pt-2 border-t border-mg-line"><span className="font-bold">No van:</span> {out.map((m) => m.name).join(' · ')}</p>
        )}
      </section>

      {admin && !played && silent.length > 0 && (
        <details className={card}>
          <summary className="cursor-pointer font-extrabold min-h-[32px]">Suplentes que no han respondido ({silent.length})</summary>
          <ul className="divide-y divide-mg-line">
            {silent.map((m) => (
              <li key={m.id} className="flex items-center gap-2 min-h-[44px]">
                <span className="flex-1 font-semibold truncate">{m.name}</span>
                <button type="button" className={smallBtn} disabled={!!busy || (!listOpen && m.role !== 'fixed')} onClick={() => respond('in', 0, m.id)}>Anotar</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!played && (
        <p className="text-xs text-mg-muted">
          Lista: se abre el {fmtMoment(session.opens_at)} · suplentes desde el {fmtMoment(session.subs_at)} · cierra el {fmtMoment(session.closes_at)}.
          {perPerson ? ` Valor por persona ${perPerson}.` : ''}
        </p>
      )}
    </div>
  );
};

const Stat = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <div className={`rounded-mg-md border p-3 ${warn && value !== '0' ? 'border-mg-gold bg-[#fff4d6]' : 'border-mg-line bg-mg-surface'}`}>
    <p className="mg-label text-mg-muted">{label}</p>
    <p className="mg-num text-2xl font-extrabold">{value}</p>
  </div>
);

const Row = ({ m, me, admin, played, priced, busy, onOut, onPaid, pendingLabel }: {
  m: PlayMember; me: string | null; admin: boolean; played: boolean; priced: boolean; busy: string | null; onOut: () => void; onPaid: () => void; pendingLabel: string;
}) => (
  <li className="flex items-center gap-2 min-h-[44px] py-1">
    <span className="flex-1 min-w-0">
      <span className="font-semibold">{m.name}{m.id === me ? ' (tú)' : ''}</span>
      {m.guests > 0 && <span className="text-mg-muted font-semibold"> +1 invitado</span>}
      <span className="ml-2 inline-flex gap-1 align-middle">
        {m.role === 'fixed' && <span className={`${CHIP} bg-mg-pitch-tint text-mg-pitch-deep`}>Fijo</span>}
        {m.status === 'auto' && <span className={`${CHIP} bg-[#fff4d6] text-mg-gold-ink`}>{pendingLabel}</span>}
      </span>
    </span>
    {priced && (admin ? (
      <button type="button" onClick={onPaid} disabled={!!busy} aria-pressed={m.paid} aria-label={`${m.name}: ${m.paid ? 'pagó, quitar' : 'marcar pago'}`}
        className={`${smallBtn} ${m.paid ? '!bg-mg-pitch-tint !border-mg-pitch !text-mg-pitch-deep' : ''}`}>
        {m.paid ? <><Check className="h-4 w-4" aria-hidden="true" /> Pagó</> : '$'}
      </button>
    ) : m.paid ? <span className={`${CHIP} bg-mg-pitch-tint text-mg-pitch-deep`}>Pagó</span> : null)}
    {admin && !played && <button type="button" className={smallBtn} disabled={!!busy} onClick={onOut}>No va</button>}
  </li>
);
