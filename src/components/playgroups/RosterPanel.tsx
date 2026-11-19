import { FormEvent, useState } from 'react';
import { ArrowUpCircle, Star, UserPlus } from 'lucide-react';
import { PlayMember, PlayPosition } from '../../types/playGroups';
import { playErrorText } from '../../utils/playGroups';
import { fieldClass, primaryBtn } from '../payments/PaymentsUi';
import { CHIP, PanelProps, card, smallBtn } from './shared';

const POSITIONS: { v: PlayPosition | ''; l: string }[] = [
  { v: '', l: 'Posición' },
  { v: 'arquero', l: 'Arquero' },
  { v: 'defensa', l: 'Defensa' },
  { v: 'medio', l: 'Medio' },
  { v: 'delantero', l: 'Delantero' },
];

/** Plantel (solo organizador): fijos y suplentes, nivel privado, sugerencias de ascenso y altas. */
export const RosterPanel = ({ view, call }: PanelProps) => {
  const { members, group } = view;
  const priv = view.private || {};
  const [name, setName] = useState('');
  const [role, setRole] = useState<'fixed' | 'sub'>('fixed');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = async (m: PlayMember, changes: Record<string, unknown>) => {
    setBusy(m.id);
    setError(null);
    const { error: err } = await call('play_member_update', { p_member: m.id, p_changes: changes });
    setBusy(null);
    if (err) setError(playErrorText(err, 'No pudimos guardar el cambio.'));
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy('add');
    setError(null);
    const { error: err } = await call('play_member_add', { p_group: group.id, p_name: name.trim(), p_role: role });
    setBusy(null);
    if (err) setError(playErrorText(err, 'No pudimos agregar al jugador.'));
    else setName('');
  };

  const pct = (id: string) => {
    const p = priv[id];
    return p && p.sessions > 0 ? Math.round((p.attended / p.sessions) * 100) : null;
  };
  const suggestions = members.filter((m) => {
    const p = priv[m.id];
    return m.role === 'sub' && p && p.sessions >= 4 && (pct(m.id) ?? 0) >= group.promote_threshold;
  });
  const fixed = members.filter((m) => m.role === 'fixed');
  const subs = members.filter((m) => m.role === 'sub');

  const remove = (m: PlayMember) => {
    if (window.confirm(`¿Quitar a ${m.name} del grupo? Su historial se conserva.`)) update(m, { active: false });
  };

  const renderRow = (m: PlayMember) => {
    const p = priv[m.id];
    const a = pct(m.id);
    return (
      <li key={m.id} className="py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold flex-1 min-w-[8rem]">{m.name}</span>
          {m.is_admin && <span className={`${CHIP} bg-mg-navy text-mg-on-navy`}>Admin</span>}
          {!m.claimed && <span className={`${CHIP} bg-mg-surface-2 text-mg-muted`} title="Aún no abre el link">Sin link</span>}
          {a != null && <span className="text-xs font-bold text-mg-muted">{a}% asistencia</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={smallBtn} disabled={busy === m.id} onClick={() => update(m, { role: m.role === 'fixed' ? 'sub' : 'fixed' })}>
            {m.role === 'fixed' ? 'Pasar a suplente' : 'Pasar a fijo'}
          </button>
          <select aria-label={`Posición de ${m.name}`} className={`${fieldClass} !w-auto !min-h-[40px] text-sm`} value={p?.position ?? ''} disabled={busy === m.id}
            onChange={(e) => update(m, { position: e.target.value })}>
            {POSITIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <div role="radiogroup" aria-label={`Nivel de ${m.name}`} className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={p?.stars === n} aria-label={`${n} estrellas`} disabled={busy === m.id}
                onClick={() => update(m, { stars: n })} className="h-10 w-8 flex items-center justify-center">
                <Star className={`h-5 w-5 ${p?.stars && n <= p.stars ? 'fill-mg-gold text-mg-gold-ink' : 'text-mg-line-strong'}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-mg-muted font-bold min-h-[32px]">Más opciones</summary>
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" className={smallBtn} disabled={busy === m.id} onClick={() => update(m, { is_admin: !m.is_admin })}>{m.is_admin ? 'Quitar admin' : 'Hacer admin'}</button>
            {m.claimed && <button type="button" className={smallBtn} disabled={busy === m.id} onClick={() => update(m, { reset_claim: true })} title="Si cambió de teléfono">Liberar teléfono</button>}
            {m.id !== view.me && <button type="button" className={`${smallBtn} !text-mg-danger`} disabled={busy === m.id} onClick={() => remove(m)}>Quitar del grupo</button>}
            {p && p.games > 0 && <span className="text-xs text-mg-muted self-center">{p.games} partidos con resultado · nivel {Math.round(p.rating)}</span>}
          </div>
        </details>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {suggestions.length > 0 && (
        <section className={`${card} !border-mg-gold bg-[#fff4d6]`} aria-labelledby="promote">
          <h2 id="promote" className="font-extrabold flex items-center gap-2"><ArrowUpCircle className="h-5 w-5 text-mg-gold-ink" aria-hidden="true" /> Sugeridos para fijo</h2>
          <p className="text-sm">Vinieron más del {group.promote_threshold}% de las últimas semanas.</p>
          <ul className="space-y-2">
            {suggestions.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="flex-1 font-bold">{m.name} · {pct(m.id)}%</span>
                <button type="button" className={smallBtn} disabled={busy === m.id} onClick={() => update(m, { role: 'fixed' })}>Pasar a fijo</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={add} className={card} aria-labelledby="add-title">
        <h2 id="add-title" className="font-extrabold">Agregar jugador</h2>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Nombre" className={`${fieldClass} flex-1 min-w-[10rem]`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Nombre como lo conocen" />
          <select aria-label="Tipo" className={`${fieldClass} !w-auto`} value={role} onChange={(e) => setRole(e.target.value as 'fixed' | 'sub')}>
            <option value="fixed">Fijo</option>
            <option value="sub">Suplente</option>
          </select>
          <button type="submit" className={primaryBtn} disabled={busy === 'add' || !name.trim()}><UserPlus className="h-4 w-4" aria-hidden="true" /> Agregar</button>
        </div>
        <p className="text-xs text-mg-muted">Cuando abran el link del grupo eligen su nombre y queda en su teléfono. También pueden entrar solos como suplentes.</p>
      </form>

      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}

      <section className={card} aria-labelledby="fixed-title">
        <h2 id="fixed-title" className="font-extrabold">Fijos · {fixed.length}</h2>
        {fixed.length ? <ul className="divide-y divide-mg-line">{fixed.map(renderRow)}</ul> : <p className="text-sm text-mg-muted">Aún no hay fijos.</p>}
      </section>
      <section className={card} aria-labelledby="subs-title">
        <h2 id="subs-title" className="font-extrabold">Suplentes · {subs.length}</h2>
        {subs.length ? <ul className="divide-y divide-mg-line">{subs.map(renderRow)}</ul> : <p className="text-sm text-mg-muted">Aún no hay suplentes.</p>}
      </section>
      <p className="text-xs text-mg-muted">Las estrellas, la posición y el nivel solo los ves tú (y los admin del grupo). Sirven para armar equipos parejos.</p>
    </div>
  );
};
