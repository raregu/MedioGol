import { FormEvent, useState } from 'react';
import { PlayGroupSettings } from '../../types/playGroups';
import { WEEKDAYS, WEEKDAYS_PLURAL, playErrorText } from '../../utils/playGroups';
import { formatCLP } from '../../utils/money';
import { Field, MoneyInput, fieldClass, primaryBtn } from '../payments/PaymentsUi';
import { PanelProps, card } from './shared';

/** Reglas del grupo: se configuran una vez y cada semana funciona sola. */
export const RulesPanel = ({ view, call }: PanelProps) => {
  const [s, setS] = useState<PlayGroupSettings>(view.group);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof PlayGroupSettings>(k: K, v: PlayGroupSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  // "N días antes" se muestra como el día de la semana correspondiente
  const dayBefore = (n: number) => WEEKDAYS[(s.weekday - n + 7) % 7];
  const daySelect = (id: string, k: 'open_days_before' | 'subs_days_before' | 'close_days_before') => (
    <select id={id} className={fieldClass} value={s[k]} onChange={(e) => set(k, Number(e.target.value))}>
      {[6, 5, 4, 3, 2, 1, 0].map((n) => (
        <option key={n} value={n}>{n === 0 ? `El mismo ${WEEKDAYS[s.weekday]}` : `${dayBefore(n).charAt(0).toUpperCase() + dayBefore(n).slice(1)} (${n} ${n === 1 ? 'día' : 'días'} antes)`}</option>
      ))}
    </select>
  );

  const order = (days: number, time: string) => -days * 1440 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const start = order(0, s.start_time);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const o = order(s.open_days_before, s.open_time);
    const sub = order(s.subs_days_before, s.subs_time);
    const c = order(s.close_days_before, s.close_time);
    if (!(o <= sub && sub <= c && c <= start)) {
      setMsg({ ok: false, text: 'El orden debe ser: abre → suplentes → cierra → partido.' });
      return;
    }
    if (s.name.trim().length < 3) {
      setMsg({ ok: false, text: 'El nombre debe tener al menos 3 letras.' });
      return;
    }
    setBusy(true);
    // Cuotas primero (función aparte: si la migración de la caja no está, el resto igual se guarda)
    if ((s.fee ?? null) !== (view.group.fee ?? null) || (s.guest_fee ?? null) !== (view.group.guest_fee ?? null)) {
      const { error: feeError } = await call('play_group_set_fees', { p_group: s.id, p_fee: s.fee ?? null, p_guest_fee: s.guest_fee ?? null });
      if (feeError) {
        setBusy(false);
        setMsg({ ok: false, text: playErrorText(feeError, 'No pudimos guardar la cuota.') });
        return;
      }
    }
    const { error } = await call('play_group_update', {
      p_group: s.id,
      p_settings: {
        name: s.name.trim(), weekday: s.weekday, start_time: s.start_time, venue: s.venue ?? '', slots: s.slots, price: s.price,
        open_days_before: s.open_days_before, open_time: s.open_time, subs_days_before: s.subs_days_before, subs_time: s.subs_time,
        close_days_before: s.close_days_before, close_time: s.close_time, fixed_mode: s.fixed_mode, allow_guests: s.allow_guests,
        promote_threshold: s.promote_threshold,
      },
    });
    setBusy(false);
    setMsg(error ? { ok: false, text: playErrorText(error, 'No pudimos guardar las reglas.') } : { ok: true, text: 'Reglas guardadas. Los cambios de día y horarios se aplican desde la próxima semana.' });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className={card} aria-labelledby="when">
        <h2 id="when" className="font-extrabold">Cuándo y dónde</h2>
        <Field label="Nombre">{(id) => <input id={id} className={fieldClass} value={s.name} maxLength={60} onChange={(e) => set('name', e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día">
            {(id) => (
              <select id={id} className={fieldClass} value={s.weekday} onChange={(e) => set('weekday', Number(e.target.value))}>
                {WEEKDAYS_PLURAL.map((d, i) => <option key={d} value={i}>Todos los {d}</option>)}
              </select>
            )}
          </Field>
          <Field label="Hora">{(id) => <input id={id} type="time" className={fieldClass} value={s.start_time} onChange={(e) => set('start_time', e.target.value)} />}</Field>
        </div>
        <Field label="Cancha">{(id) => <input id={id} className={fieldClass} value={s.venue ?? ''} maxLength={120} onChange={(e) => set('venue', e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cupos" hint={`${Math.floor(s.slots / 2)} vs ${Math.ceil(s.slots / 2)}`}>
            {(id) => <input id={id} type="number" min={4} max={40} className={fieldClass} value={s.slots} onChange={(e) => set('slots', Math.min(40, Math.max(4, Number(e.target.value) || 4)))} />}
          </Field>
        </div>
      </section>

      <section className={card} aria-labelledby="money">
        <h2 id="money" className="font-extrabold">Cuota y caja del grupo</h2>
        <p className="text-sm text-mg-muted">Cada jugador paga la cuota; el grupo paga la cancha. Lo que sobra queda en la caja para pelotas, asados, petos…</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cuota por jugador">{(id) => <MoneyInput id={id} value={s.fee ?? null} onChange={(v) => set('fee', v)} />}</Field>
          <Field label="Costo de la cancha" hint="Lo que paga el grupo cada semana.">{(id) => <MoneyInput id={id} value={s.price} onChange={(v) => set('price', v)} />}</Field>
        </div>
        {s.allow_guests && (
          <Field label="Cuota del invitado (opcional)" hint="Si lo dejas vacío, paga lo mismo que un jugador.">
            {(id) => <MoneyInput id={id} value={s.guest_fee ?? null} onChange={(v) => set('guest_fee', v)} />}
          </Field>
        )}
        {s.fee != null && s.fee > 0 && (
          <p className="text-sm font-bold">
            {(() => {
              const diff = s.fee * s.slots - (s.price || 0);
              return diff >= 0
                ? `Con los ${s.slots} cupos pagados quedan ${formatCLP(diff)} por semana para la caja.`
                : `Ojo: con los ${s.slots} cupos pagados faltan ${formatCLP(-diff)} para la cancha.`;
            })()}
          </p>
        )}
      </section>

      <section className={card} aria-labelledby="prio">
        <h2 id="prio" className="font-extrabold">Prioridad para los de siempre</h2>
        {([
          ['open', 'Se abre la lista', 'Los fijos ya están adentro: solo avisan si no van.'],
          ['subs', 'Entran los suplentes', 'Los cupos libres se reparten por orden de llegada.'],
          ['close', 'Cierra la lista', s.fixed_mode === 'confirm' ? 'El fijo que no confirmó pierde su cupo esa semana.' : 'Después del cierre igual pueden bajarse y sube la espera.'],
        ] as const).map(([k, title, hint], i) => (
          <div key={k} className="flex gap-3">
            <span className="h-7 w-7 rounded-full bg-mg-pitch text-mg-on-pitch font-extrabold text-sm flex items-center justify-center flex-shrink-0 mt-6">{i + 1}</span>
            <div className="flex-1 grid grid-cols-[1fr_7rem] gap-2">
              <Field label={title} hint={hint}>{(id) => daySelect(id, `${k}_days_before`)}</Field>
              <Field label="Hora">{(id) => <input id={id} type="time" className={fieldClass} value={s[`${k}_time`]} onChange={(e) => set(`${k}_time`, e.target.value)} />}</Field>
            </div>
          </div>
        ))}
        <Toggle label="Los fijos quedan adentro sin confirmar" hint="Si lo apagas, deben confirmar antes del cierre." checked={s.fixed_mode === 'auto'} onChange={(v) => set('fixed_mode', v ? 'auto' : 'confirm')} />
        <Toggle label="Cada jugador puede llevar 1 invitado" checked={s.allow_guests} onChange={(v) => set('allow_guests', v)} />
        <Field label="Sugerir nuevos fijos con asistencia sobre" hint="Se calcula con las últimas 12 semanas (mínimo 4).">
          {(id) => (
            <select id={id} className={fieldClass} value={s.promote_threshold} onChange={(e) => set('promote_threshold', Number(e.target.value))}>
              {[60, 70, 75, 80, 90].map((n) => <option key={n} value={n}>{n}%</option>)}
            </select>
          )}
        </Field>
      </section>

      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm font-bold ${msg.ok ? 'text-mg-pitch-deep' : 'text-mg-danger'}`}>{msg.text}</p>}
      <button type="submit" className={`${primaryBtn} w-full`} disabled={busy}>{busy ? 'Guardando…' : 'Guardar reglas'}</button>
    </form>
  );
};

const Toggle = ({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center justify-between gap-3 min-h-[44px] border-t border-mg-line pt-3">
    <span>
      <span className="block text-sm font-bold">{label}</span>
      {hint && <span className="block text-xs text-mg-muted">{hint}</span>}
    </span>
    <input type="checkbox" className="h-6 w-6 accent-[var(--mg-pitch)] flex-shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  </label>
);
