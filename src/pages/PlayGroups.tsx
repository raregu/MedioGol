import { FormEvent, useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Layout } from '../components/Layout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { NextPlayCard } from '../components/playgroups/NextPlayCard';
import { Field, MoneyInput, fieldClass, primaryBtn, secondaryBtn } from '../components/payments/PaymentsUi';
import { invalidateMyPlayGroups, useMyPlayGroups } from '../hooks/usePlayGroups';
import { supabase } from '../lib/supabase';
import { WEEKDAYS_PLURAL, playErrorText } from '../utils/playGroups';

/** Formulario corto para crear un grupo; el resto de las reglas viene con valores por defecto. */
export const CreatePlayGroupForm = ({ onCancel }: { onCancel?: () => void }) => {
  const [name, setName] = useState('');
  const [weekday, setWeekday] = useState(2);
  const [time, setTime] = useState('21:00');
  const [venue, setVenue] = useState('');
  const [slots, setSlots] = useState(14);
  const [price, setPrice] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 3) {
      setError('El nombre debe tener al menos 3 letras.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('play_group_create', {
      p_name: name.trim(),
      p_weekday: weekday,
      p_start: time,
      p_venue: venue.trim() || null,
      p_slots: slots,
      p_price: price,
    });
    if (err || !data) {
      setSaving(false);
      setError(playErrorText(err, 'No pudimos crear el grupo. Intenta de nuevo.'));
      return;
    }
    invalidateMyPlayGroups();
    window.history.pushState({}, '', `/grupos/${data}?nuevo=1`);
  };

  return (
    <form onSubmit={submit} className="rounded-mg-lg border border-mg-line bg-mg-surface p-5 space-y-4 shadow-mg-card" aria-labelledby="new-group">
      <h2 id="new-group" className="font-display text-2xl font-extrabold uppercase">Crear grupo fijo</h2>
      <p className="text-sm text-mg-muted">Para la pichanga de todas las semanas. Después ajustas las reglas e invitas por WhatsApp.</p>
      <Field label="Nombre del grupo">
        {(id) => <input id={id} className={fieldClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Los Martes del Barrio" required />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Día">
          {(id) => (
            <select id={id} className={fieldClass} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {WEEKDAYS_PLURAL.map((d, i) => (
                <option key={d} value={i}>Todos los {d}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Hora">{(id) => <input id={id} type="time" className={fieldClass} value={time} onChange={(e) => setTime(e.target.value)} required />}</Field>
      </div>
      <Field label="Cancha" hint="Opcional">
        {(id) => <input id={id} className={fieldClass} value={venue} maxLength={120} onChange={(e) => setVenue(e.target.value)} placeholder="Complejo La Cancha, cancha 3" />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cupos" hint={`${Math.floor(slots / 2)} vs ${Math.ceil(slots / 2)}`}>
          {(id) => <input id={id} type="number" min={4} max={40} className={fieldClass} value={slots} onChange={(e) => setSlots(Math.min(40, Math.max(4, Number(e.target.value) || 4)))} />}
        </Field>
        <Field label="Valor cancha" hint="Opcional, se divide entre los cupos">
          {(id) => <MoneyInput id={id} value={price} onChange={setPrice} />}
        </Field>
      </div>
      {error && <p role="alert" className="text-sm font-bold text-mg-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryBtn} disabled={saving}>{saving ? 'Creando…' : 'Crear grupo'}</button>
        {onCancel && <button type="button" className={secondaryBtn} onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
};

/** /grupos: mis grupos fijos y crear uno nuevo. */
export const PlayGroups = () => {
  const { groups, loaded } = useMyPlayGroups();
  const [creating, setCreating] = useState(() => new URLSearchParams(window.location.search).get('crear') === '1');

  useEffect(() => {
    document.title = 'Grupos fijos · MedioGol';
  }, []);

  return (
    <ProtectedRoute>
      <Layout>
        <div className="max-w-3xl mx-auto space-y-6 font-sans text-mg-ink">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-4xl font-extrabold uppercase">Grupos fijos</h1>
              <p className="text-mg-muted">La pichanga de cada semana sin listas en WhatsApp.</p>
            </div>
            {!creating && groups.length > 0 && (
              <button type="button" className={primaryBtn} onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Crear grupo fijo
              </button>
            )}
          </div>

          {creating && <CreatePlayGroupForm onCancel={groups.length > 0 ? () => setCreating(false) : undefined} />}

          {!loaded && <div className="h-24 rounded-mg-lg bg-mg-surface-2 animate-pulse" role="status" aria-label="Cargando tus grupos" />}

          {loaded && groups.length > 0 && <NextPlayCard />}

          {loaded && groups.length === 0 && !creating && (
            <div className="rounded-mg-lg border border-mg-line bg-mg-surface p-6 text-center space-y-3">
              <Users className="h-10 w-10 mx-auto text-mg-pitch-deep" aria-hidden="true" />
              <p className="font-bold text-lg">¿Juegas todas las semanas con los mismos?</p>
              <ul className="text-sm text-mg-muted space-y-1">
                <li>Los fijos quedan adentro sin tener que anotarse.</li>
                <li>Los suplentes entran por orden de llegada y la espera sube sola.</li>
                <li>Pagos de la cancha y equipos parejos en un toque.</li>
              </ul>
              <button type="button" className={primaryBtn} onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Crear grupo fijo
              </button>
              <p className="text-xs text-mg-muted">¿Te invitaron? Abre el link que te mandaron por WhatsApp.</p>
            </div>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
};
