import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Field, errorText, fieldClass, primaryBtn, secondaryBtn } from '../payments/PaymentsUi';
import { ContactRole, OrganizerRequestDraft, OrgSport } from '../../types/organizer';
import { CONTACT_ROLE_LABEL, ORG_TYPE_LABEL, ORG_TYPE_OPTIONS, SPORT_LABEL, formatDay } from './labels';

const STEPS = ['Tu liga', 'Tamaño', 'Contacto'] as const;

const emptyDraft = (name: string): OrganizerRequestDraft => ({
  org_type: 'league',
  org_name: '',
  city: '',
  venue: '',
  sport: 'futbol',
  teams_estimate: null,
  series_estimate: null,
  start_estimate: '',
  already_running: true,
  website: '',
  contact_name: name,
  contact_phone: '',
  contact_role: 'organizer',
  message: '',
});

const phoneDigits = (s: string) => s.replace(/\D/g, '');
const intOrNull = (s: string) => {
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

type Errors = Partial<Record<keyof OrganizerRequestDraft | 'confirm', string>>;

const validate = (step: number, d: OrganizerRequestDraft, confirmed: boolean): Errors => {
  const e: Errors = {};
  if (step === 0) {
    if (d.org_name.trim().length < 3) e.org_name = 'Escribe el nombre (mínimo 3 letras).';
    if (d.city.trim().length < 2) e.city = 'Indica la comuna o ciudad.';
  }
  if (step === 1) {
    if (d.teams_estimate != null && (d.teams_estimate < 2 || d.teams_estimate > 500)) e.teams_estimate = 'Entre 2 y 500 equipos.';
    if (d.series_estimate != null && (d.series_estimate < 1 || d.series_estimate > 30)) e.series_estimate = 'Entre 1 y 30 series.';
  }
  if (step === 2) {
    if (d.contact_name.trim().length < 2) e.contact_name = 'Escribe tu nombre.';
    const p = phoneDigits(d.contact_phone);
    if (p.length < 8 || p.length > 15) e.contact_phone = 'Escribe un teléfono válido, por ejemplo +56 9 1234 5678.';
    if (!confirmed) e.confirm = 'Confirma que organizas o representas esta liga.';
  }
  return e;
};

const ErrorText = ({ id, text }: { id: string; text?: string }) =>
  text ? (
    <p id={id} className="text-xs font-bold text-mg-danger">
      {text}
    </p>
  ) : null;

interface Props {
  defaultName: string;
  onSubmitted: () => void;
}

/** Formulario guiado en 3 pasos para pedir acceso de organizador. */
export const OrganizerWizard = ({ defaultName, onSubmitted }: Props) => {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OrganizerRequestDraft>(() => emptyDraft(defaultName));
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const set = <K extends keyof OrganizerRequestDraft>(key: K, value: OrganizerRequestDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const next = () => {
    const e = validate(step, draft, confirmed);
    setErrors(e);
    if (Object.keys(e).length) {
      const first = Object.keys(e)[0];
      document.getElementById(`org-${first}`)?.focus();
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (step < STEPS.length - 1) return next();
    const e = validate(step, draft, confirmed);
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(`org-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setSending(true);
    setSendError('');
    const { error } = await supabase.rpc('submit_organizer_request', {
      p_org_type: draft.org_type,
      p_org_name: draft.org_name.trim(),
      p_city: draft.city.trim(),
      p_venue: draft.venue.trim() || null,
      p_sport: draft.sport,
      p_teams_estimate: draft.teams_estimate,
      p_series_estimate: draft.org_type === 'league' ? draft.series_estimate : null,
      p_start_estimate: draft.start_estimate || null,
      p_already_running: draft.already_running,
      p_website: draft.website.trim() || null,
      p_contact_name: draft.contact_name.trim(),
      p_contact_phone: phoneDigits(draft.contact_phone),
      p_contact_role: draft.contact_role,
      p_message: draft.message.trim() || null,
    });
    setSending(false);
    if (error) {
      console.error('submit_organizer_request', error);
      setSendError(errorText(error, 'No pudimos enviar la solicitud. Revisa tu conexión e intenta de nuevo.'));
      return;
    }
    onSubmitted();
  };

  const isLeague = draft.org_type === 'league';

  return (
    <form onSubmit={submit} noValidate className="bg-mg-surface border border-mg-line rounded-mg-lg shadow-mg-card font-sans text-mg-ink">
      {/* Pasos */}
      <ol className="flex border-b border-mg-line" aria-label="Pasos de la solicitud">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-3 text-sm font-extrabold ${
              i === step ? 'text-mg-pitch-deep border-b-[3px] border-mg-pitch -mb-px' : i < step ? 'text-mg-ink' : 'text-mg-muted'
            }`}
          >
            <span
              className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs ${
                i < step ? 'bg-mg-pitch text-mg-on-pitch' : i === step ? 'bg-mg-navy text-mg-on-navy' : 'bg-mg-surface-2 text-mg-muted'
              }`}
              aria-hidden="true"
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only">
              {` paso ${i + 1} de ${STEPS.length}`}
              {i < step ? ', listo' : ''}
            </span>
          </li>
        ))}
      </ol>

      <div className="p-5 sm:p-6 space-y-5">
        <h2 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-extrabold uppercase outline-none">
          {step === 0 && '¿Qué organizas?'}
          {step === 1 && '¿De qué tamaño es?'}
          {step === 2 && '¿Cómo te contactamos?'}
        </h2>

        {step === 0 && (
          <>
            <fieldset>
              <legend className="block text-sm font-bold mb-2">Tipo</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ORG_TYPE_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={`flex gap-3 items-start p-3 min-h-[44px] rounded-mg-md border cursor-pointer ${
                      draft.org_type === o.value ? 'border-mg-pitch bg-mg-pitch-tint' : 'border-mg-line-strong bg-mg-surface hover:bg-mg-surface-2'
                    }`}
                  >
                    <input
                      type="radio"
                      name="org_type"
                      value={o.value}
                      checked={draft.org_type === o.value}
                      onChange={() => set('org_type', o.value)}
                      className="mt-1 accent-[var(--mg-pitch)]"
                    />
                    <span>
                      <span className="block font-extrabold text-sm">{o.label}</span>
                      <span className="block text-xs text-mg-muted">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label={`Nombre de ${isLeague ? 'la liga' : draft.org_type === 'venue' ? 'el recinto' : 'el campeonato'}`} id="org-org_name">
              {(id) => (
                <>
                  <input
                    id={id}
                    value={draft.org_name}
                    onChange={(e) => set('org_name', e.target.value)}
                    maxLength={120}
                    autoComplete="organization"
                    aria-invalid={!!errors.org_name}
                    aria-describedby={errors.org_name ? 'err-org_name' : undefined}
                    placeholder={isLeague ? 'Ej: Liga Rural de Casablanca' : 'Ej: Copa Primavera 2026'}
                    className={fieldClass}
                  />
                  <ErrorText id="err-org_name" text={errors.org_name} />
                </>
              )}
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Comuna o ciudad" id="org-city">
                {(id) => (
                  <>
                    <input
                      id={id}
                      value={draft.city}
                      onChange={(e) => set('city', e.target.value)}
                      maxLength={80}
                      autoComplete="address-level2"
                      aria-invalid={!!errors.city}
                      aria-describedby={errors.city ? 'err-city' : undefined}
                      placeholder="Ej: Vitacura"
                      className={fieldClass}
                    />
                    <ErrorText id="err-city" text={errors.city} />
                  </>
                )}
              </Field>
              <Field label="Deporte" id="org-sport">
                {(id) => (
                  <select id={id} value={draft.sport} onChange={(e) => set('sport', e.target.value as OrgSport)} className={fieldClass}>
                    {(Object.keys(SPORT_LABEL) as OrgSport[]).map((s) => (
                      <option key={s} value={s}>
                        {SPORT_LABEL[s]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            <Field label="Cancha o recinto (opcional)" hint="Dónde se juega, si es siempre en el mismo lugar." id="org-venue">
              {(id) => (
                <input id={id} value={draft.venue} onChange={(e) => set('venue', e.target.value)} maxLength={120} placeholder="Ej: Complejo Deportivo Lo Orozco" className={fieldClass} />
              )}
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Equipos aproximados" hint="Si no sabes, déjalo en blanco." id="org-teams_estimate">
                {(id) => (
                  <>
                    <input
                      id={id}
                      inputMode="numeric"
                      value={draft.teams_estimate ?? ''}
                      onChange={(e) => set('teams_estimate', intOrNull(e.target.value))}
                      aria-invalid={!!errors.teams_estimate}
                      aria-describedby={errors.teams_estimate ? 'err-teams_estimate' : undefined}
                      className={`${fieldClass} mg-num`}
                    />
                    <ErrorText id="err-teams_estimate" text={errors.teams_estimate} />
                  </>
                )}
              </Field>
              {isLeague && (
                <Field label="Series o categorías" hint="Ej: Sénior, Dorados, Súper Sénior = 3." id="org-series_estimate">
                  {(id) => (
                    <>
                      <input
                        id={id}
                        inputMode="numeric"
                        value={draft.series_estimate ?? ''}
                        onChange={(e) => set('series_estimate', intOrNull(e.target.value))}
                        aria-invalid={!!errors.series_estimate}
                        aria-describedby={errors.series_estimate ? 'err-series_estimate' : undefined}
                        className={`${fieldClass} mg-num`}
                      />
                      <ErrorText id="err-series_estimate" text={errors.series_estimate} />
                    </>
                  )}
                </Field>
              )}
            </div>

            <fieldset>
              <legend className="block text-sm font-bold mb-2">¿Ya está funcionando?</legend>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: true, l: 'Sí, ya se juega' },
                  { v: false, l: 'No, es nuevo' },
                ].map((o) => (
                  <label
                    key={String(o.v)}
                    className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-mg-md border cursor-pointer text-sm font-bold ${
                      draft.already_running === o.v ? 'border-mg-pitch bg-mg-pitch-tint' : 'border-mg-line-strong bg-mg-surface'
                    }`}
                  >
                    <input type="radio" name="already_running" checked={draft.already_running === o.v} onChange={() => set('already_running', o.v)} className="accent-[var(--mg-pitch)]" />
                    {o.l}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label={draft.already_running ? 'Próximo campeonato (opcional)' : 'Fecha estimada de inicio (opcional)'} id="org-start_estimate">
              {(id) => <input id={id} type="date" value={draft.start_estimate} onChange={(e) => set('start_estimate', e.target.value)} className={`${fieldClass} sm:max-w-xs`} />}
            </Field>

            <Field label="Página web o redes sociales (opcional)" hint="Nos ayuda a conocer tu liga: Instagram, Facebook o sitio web." id="org-website">
              {(id) => (
                <input id={id} value={draft.website} onChange={(e) => set('website', e.target.value)} maxLength={200} inputMode="url" placeholder="Ej: instagram.com/miliga" className={fieldClass} />
              )}
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tu nombre" id="org-contact_name">
                {(id) => (
                  <>
                    <input
                      id={id}
                      value={draft.contact_name}
                      onChange={(e) => set('contact_name', e.target.value)}
                      maxLength={120}
                      autoComplete="name"
                      aria-invalid={!!errors.contact_name}
                      aria-describedby={errors.contact_name ? 'err-contact_name' : undefined}
                      className={fieldClass}
                    />
                    <ErrorText id="err-contact_name" text={errors.contact_name} />
                  </>
                )}
              </Field>
              <Field label="Tu cargo" id="org-contact_role">
                {(id) => (
                  <select id={id} value={draft.contact_role} onChange={(e) => set('contact_role', e.target.value as ContactRole)} className={fieldClass}>
                    {(Object.keys(CONTACT_ROLE_LABEL) as ContactRole[]).map((r) => (
                      <option key={r} value={r}>
                        {CONTACT_ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            <Field label="WhatsApp o teléfono" hint="Solo lo ve el equipo de MedioGol para coordinar contigo." id="org-contact_phone">
              {(id) => (
                <>
                  <input
                    id={id}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={draft.contact_phone}
                    onChange={(e) => set('contact_phone', e.target.value)}
                    maxLength={20}
                    aria-invalid={!!errors.contact_phone}
                    aria-describedby={errors.contact_phone ? 'err-contact_phone' : undefined}
                    placeholder="+56 9 1234 5678"
                    className={`${fieldClass} sm:max-w-xs mg-num`}
                  />
                  <ErrorText id="err-contact_phone" text={errors.contact_phone} />
                </>
              )}
            </Field>

            <Field label="¿Algo más que debamos saber? (opcional)" id="org-message">
              {(id) => (
                <textarea
                  id={id}
                  rows={3}
                  value={draft.message}
                  onChange={(e) => set('message', e.target.value)}
                  maxLength={1000}
                  placeholder="Ej: hoy llevamos la tabla en Excel y queremos publicar resultados cada fecha."
                  className={`${fieldClass} py-2`}
                />
              )}
            </Field>

            {/* Resumen antes de enviar */}
            <div className="rounded-mg-md bg-mg-surface-2 p-4 text-sm space-y-1">
              <p className="mg-label text-mg-muted">Resumen</p>
              <p>
                <strong>{ORG_TYPE_LABEL[draft.org_type]}:</strong> {draft.org_name || '—'} · {draft.city || '—'}
                {draft.venue ? ` · ${draft.venue}` : ''}
              </p>
              <p>
                {SPORT_LABEL[draft.sport]}
                {draft.teams_estimate ? ` · ${draft.teams_estimate} equipos` : ''}
                {isLeague && draft.series_estimate ? ` · ${draft.series_estimate} series` : ''}
                {draft.start_estimate ? ` · desde el ${formatDay(draft.start_estimate)}` : ''}
              </p>
            </div>

            <div className="space-y-1">
              <label className="flex items-start gap-3 min-h-[44px] cursor-pointer text-sm">
                <input
                  id="org-confirm"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => {
                    setConfirmed(e.target.checked);
                    setErrors((er) => ({ ...er, confirm: undefined }));
                  }}
                  aria-invalid={!!errors.confirm}
                  aria-describedby={errors.confirm ? 'err-confirm' : undefined}
                  className="mt-0.5 h-5 w-5 accent-[var(--mg-pitch)]"
                />
                <span>Confirmo que organizo o represento a esta liga o campeonato, y que los datos son reales.</span>
              </label>
              <ErrorText id="err-confirm" text={errors.confirm} />
            </div>
          </>
        )}

        {sendError && (
          <p role="alert" className="rounded-mg-md bg-mg-danger-tint text-mg-ink px-4 py-3 text-sm font-semibold">
            {sendError}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {step > 0 ? (
            <button type="button" onClick={() => setStep((s) => s - 1)} className={secondaryBtn}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Atrás
            </button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <button type="submit" className={primaryBtn}>
              Siguiente
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" disabled={sending} className={primaryBtn}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {sending ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          )}
        </div>
      </div>
    </form>
  );
};
