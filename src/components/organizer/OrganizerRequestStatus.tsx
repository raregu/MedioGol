import { useState } from 'react';
import { CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { OrganizerRequest } from '../../types/organizer';
import { dangerLink, errorText, primaryBtn, secondaryBtn } from '../payments/PaymentsUi';
import { ORG_TYPE_LABEL, formatDate } from './labels';

interface Props {
  request: OrganizerRequest;
  onChanged: () => void;
  onNewRequest: () => void;
}

/** Estado de la solicitud del usuario: en revisión, rechazada o cancelada. */
export const OrganizerRequestStatus = ({ request, onChanged, onNewRequest }: Props) => {
  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const cancel = async () => {
    setCancelling(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('cancel_organizer_request', { p_request_id: request.id });
    setCancelling(false);
    if (rpcError) {
      console.error('cancel_organizer_request', rpcError);
      setError(errorText(rpcError, 'No pudimos cancelar la solicitud. Intenta de nuevo.'));
      return;
    }
    onChanged();
  };

  const pending = request.status === 'pending';
  const rejected = request.status === 'rejected';

  const steps = [
    { label: 'Enviada', done: true, when: formatDate(request.created_at) },
    { label: 'En revisión', done: !pending, current: pending },
    { label: rejected ? 'Rechazada' : request.status === 'cancelled' ? 'Cancelada' : 'Aprobada', done: !pending, bad: !pending },
  ];

  return (
    <section aria-labelledby="req-status" className="bg-mg-surface border border-mg-line rounded-mg-lg shadow-mg-card p-5 sm:p-6 font-sans text-mg-ink space-y-5">
      <div className="flex items-start gap-3">
        {pending ? (
          <Clock className="h-8 w-8 text-mg-gold-ink flex-shrink-0" aria-hidden="true" />
        ) : (
          <XCircle className="h-8 w-8 text-mg-danger flex-shrink-0" aria-hidden="true" />
        )}
        <div>
          <h2 id="req-status" className="font-display text-2xl font-extrabold uppercase">
            {pending && 'Tu solicitud está en revisión'}
            {rejected && 'Tu solicitud no fue aprobada'}
            {request.status === 'cancelled' && 'Cancelaste tu solicitud'}
          </h2>
          <p className="text-sm text-mg-muted mt-1">
            <strong className="text-mg-ink">{request.org_name}</strong> · {ORG_TYPE_LABEL[request.org_type]} en {request.city}
          </p>
        </div>
      </div>

      {/* Línea de tiempo */}
      <ol className="flex items-start gap-2" aria-label="Avance de la solicitud">
        {steps.map((s, i) => (
          <li key={s.label} className="flex-1 min-w-0">
            <div className={`h-1.5 rounded-full ${s.done ? (s.bad && i === 2 ? 'bg-mg-danger' : 'bg-mg-pitch') : s.current ? 'bg-mg-gold' : 'bg-mg-surface-2'}`} />
            <p className={`mt-1.5 text-xs font-extrabold uppercase tracking-wide ${s.current ? 'text-mg-gold-ink' : s.done ? 'text-mg-ink' : 'text-mg-muted'}`}>
              {s.label}
              {s.current && <span className="sr-only"> (paso actual)</span>}
            </p>
            {s.when && <p className="text-xs text-mg-muted">{s.when}</p>}
          </li>
        ))}
      </ol>

      {pending && (
        <p className="text-sm">
          Te vamos a escribir al WhatsApp que dejaste, normalmente en <strong>uno o dos días hábiles</strong>. Cuando se apruebe, verás el
          botón <strong>Administrar</strong> en el menú para crear tu liga, cargar equipos y programar fechas.
        </p>
      )}

      {rejected && request.review_note && (
        <div className="rounded-mg-md bg-mg-danger-tint px-4 py-3 text-sm">
          <p className="mg-label text-mg-muted">Motivo</p>
          <p className="mt-0.5 whitespace-pre-line">{request.review_note}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-mg-md bg-mg-danger-tint px-4 py-3 text-sm font-semibold">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {pending ? (
          confirming ? (
            <>
              <span className="text-sm font-bold">¿Cancelar la solicitud?</span>
              <button type="button" onClick={cancel} disabled={cancelling} className={secondaryBtn}>
                {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={dangerLink.replace('text-mg-danger', 'text-mg-ink')}>
                No
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={dangerLink}>
              Cancelar solicitud
            </button>
          )
        ) : (
          <button type="button" onClick={onNewRequest} className={primaryBtn}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Enviar una nueva solicitud
          </button>
        )}
      </div>
    </section>
  );
};

/** Solicitud aprobada (o cuenta que ya es organizadora). */
export const OrganizerApproved = ({ orgName }: { orgName?: string }) => (
  <section aria-labelledby="req-ok" className="bg-mg-pitch-tint border border-[#bfe3cb] rounded-mg-lg p-5 sm:p-6 font-sans text-mg-ink space-y-4">
    <div className="flex items-start gap-3">
      <CheckCircle2 className="h-8 w-8 text-mg-pitch-deep flex-shrink-0" aria-hidden="true" />
      <div>
        <h2 id="req-ok" className="font-display text-2xl font-extrabold uppercase">
          {orgName ? '¡Solicitud aprobada!' : 'Ya eres organizador'}
        </h2>
        <p className="text-sm mt-1">
          {orgName ? (
            <>
              Ya puedes administrar <strong>{orgName}</strong> en MedioGol.
            </>
          ) : (
            'Tu cuenta ya tiene acceso para crear y administrar campeonatos.'
          )}
        </p>
      </div>
    </div>
    <ol className="list-decimal pl-5 text-sm space-y-1">
      <li>
        Entra a <strong>Administrar</strong>.
      </li>
      <li>Crea tu liga y agrega cada categoría como serie.</li>
      <li>Agrega los equipos, programa las fechas y comparte el enlace con los capitanes.</li>
    </ol>
    <a href="/admin" className={primaryBtn}>
      Ir a Administrar
    </a>
  </section>
);
