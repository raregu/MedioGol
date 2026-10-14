import { FormEvent, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DEFAULT_FEE_SETTINGS, FeeSettings } from '../../types/payments';
import { formatCLP } from '../../utils/money';
import { Field, MoneyInput, errorText, fieldClass, primaryBtn } from './PaymentsUi';

interface Props {
  championshipId: string;
  initial: FeeSettings | null;
  onSaved: () => void;
}

/** Cobros del campeonato. Al guardar se generan los cargos que falten (en el servidor). */
export const FeeSettingsForm = ({ championshipId, initial, onSaved }: Props) => {
  const [f, setF] = useState<FeeSettings>(initial ?? DEFAULT_FEE_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof FeeSettings>(k: K, v: FeeSettings[K]) => {
    setSaved(false);
    setF((prev) => ({ ...prev, [k]: v }));
  };

  const installment = f.registration_installments > 0 ? Math.floor(f.registration_amount / f.registration_installments) : 0;
  const invalidInstallments = f.registration_amount > 0 && f.registration_amount < f.registration_installments;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (invalidInstallments) return;
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('save_fee_settings', {
      p_championship_id: championshipId,
      p_settings: { ...f, payment_instructions: f.payment_instructions?.trim() || null },
    });
    setSaving(false);
    if (rpcError) {
      console.error('save_fee_settings', rpcError);
      setError(errorText(rpcError, 'No se pudo guardar la configuración. Intenta de nuevo.'));
      return;
    }
    setSaved(true);
    onSaved();
  };

  return (
    <form onSubmit={submit} className="space-y-6" aria-labelledby="fees-title">
      <h2 id="fees-title" className="sr-only">Configuración de cobros</h2>

      <fieldset className="bg-mg-surface border border-mg-line rounded-mg-lg p-5 space-y-4">
        <legend className="mg-label text-mg-muted px-1">Inscripción por equipo</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Monto total">{(id) => <MoneyInput id={id} value={f.registration_amount} onChange={(n) => set('registration_amount', n ?? 0)} />}</Field>
          <Field label="Número de cuotas" hint={f.registration_amount > 0 && f.registration_installments > 1 ? `${f.registration_installments} cuotas de ~${formatCLP(installment)}` : undefined}>
            {(id) => (
              <select id={id} value={f.registration_installments} onChange={(e) => set('registration_installments', Number(e.target.value))} className={fieldClass}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n === 1 ? 'Pago único' : `${n} cuotas`}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Primer vencimiento" hint="Si lo dejas vacío, se usa la fecha de inicio del campeonato.">
            {(id) => <input id={id} type="date" value={f.registration_first_due ?? ''} onChange={(e) => set('registration_first_due', e.target.value || null)} className={fieldClass} />}
          </Field>
          {f.registration_installments > 1 && (
            <Field label="Días entre cuotas">
              {(id) => <input id={id} type="number" min={1} max={120} value={f.registration_interval_days} onChange={(e) => set('registration_interval_days', Math.min(120, Math.max(1, Number(e.target.value) || 30)))} className={fieldClass} />}
            </Field>
          )}
        </div>
        {invalidInstallments && <p role="alert" className="text-sm font-bold text-mg-danger">El monto debe ser mayor que el número de cuotas.</p>}
      </fieldset>

      <fieldset className="bg-mg-surface border border-mg-line rounded-mg-lg p-5 space-y-4">
        <legend className="mg-label text-mg-muted px-1">Arbitraje</legend>
        <div className="grid sm:grid-cols-2 gap-3">
          {([
            ['per_match', 'Por partido', 'Se cobra a cada equipo cuando el partido queda finalizado.'],
            ['included', 'Incluido en la inscripción', 'No se generan cobros por partido.'],
          ] as const).map(([value, label, hint]) => (
            <label key={value} className={`flex gap-3 p-4 rounded-mg-md border cursor-pointer ${f.referee_mode === value ? 'border-mg-pitch bg-mg-pitch-tint' : 'border-mg-line'}`}>
              <input type="radio" name="referee_mode" value={value} checked={f.referee_mode === value} onChange={() => set('referee_mode', value)} className="mt-1 accent-[var(--mg-pitch)]" />
              <span>
                <span className="block font-bold">{label}</span>
                <span className="block text-xs text-mg-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {f.referee_mode === 'per_match' && (
          <div className="sm:w-1/2">
            <Field label="Monto por partido, a cada equipo" hint="Un cambio de monto aplica a los partidos que se finalicen desde ahora.">
              {(id) => <MoneyInput id={id} value={f.referee_fee} onChange={(n) => set('referee_fee', n ?? 0)} />}
            </Field>
          </div>
        )}
      </fieldset>

      <fieldset className="bg-mg-surface border border-mg-line rounded-mg-lg p-5 space-y-4">
        <legend className="mg-label text-mg-muted px-1">Multas</legend>
        <p className="text-sm text-mg-muted">Las de tarjetas se cargan solas al equipo cuando se registran (también desde la papeleta). En 0 no se cobran.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Tarjeta amarilla">{(id) => <MoneyInput id={id} value={f.yellow_card_fine} onChange={(n) => set('yellow_card_fine', n ?? 0)} />}</Field>
          <Field label="Tarjeta roja">{(id) => <MoneyInput id={id} value={f.red_card_fine} onChange={(n) => set('red_card_fine', n ?? 0)} />}</Field>
          <Field label="W.O." hint="Se sugiere al cargar un W.O.">{(id) => <MoneyInput id={id} value={f.walkover_fine} onChange={(n) => set('walkover_fine', n ?? 0)} />}</Field>
          <Field label="Días para pagar multas">
            {(id) => <input id={id} type="number" min={0} max={60} value={f.fine_due_days} onChange={(e) => set('fine_due_days', Math.min(60, Math.max(0, Number(e.target.value) || 0)))} className={fieldClass} />}
          </Field>
        </div>
      </fieldset>

      <fieldset className="bg-mg-surface border border-mg-line rounded-mg-lg p-5 space-y-2">
        <legend className="mg-label text-mg-muted px-1">Cómo pagar</legend>
        <Field label="Datos para transferir" hint="Los ven los capitanes de los equipos del campeonato. Ej.: banco, tipo y número de cuenta, RUT y correo del titular.">
          {(id) => (
            <textarea id={id} rows={4} maxLength={1000} value={f.payment_instructions ?? ''} onChange={(e) => set('payment_instructions', e.target.value)} className={`${fieldClass} py-2`} />
          )}
        </Field>
      </fieldset>

      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 min-w-[16rem] text-sm text-mg-muted">
          Al guardar se crean los cargos que falten: cuotas de inscripción de todos los equipos, arbitraje de partidos finalizados y multas de tarjetas ya registradas.
        </p>
        <button type="submit" disabled={saving || invalidInstallments} className={primaryBtn}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Guardar cobros
        </button>
      </div>
      {saved && <p role="status" className="text-sm font-bold text-mg-pitch-deep">Cobros guardados y cargos actualizados.</p>}
    </form>
  );
};
