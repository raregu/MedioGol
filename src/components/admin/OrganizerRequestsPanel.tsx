import { useState } from 'react';
import { Check, ExternalLink, MessageCircle, Phone, RefreshCw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PAGE_SIZE, useOrganizerRequestsAdmin } from '../../hooks/useOrganizerRequests';
import { OrganizerRequest, OrganizerRequestStatus } from '../../types/organizer';
import { errorText, fieldClass, primaryBtn, secondaryBtn } from '../payments/PaymentsUi';
import { CONTACT_ROLE_LABEL, ORG_TYPE_LABEL, SPORT_LABEL, STATUS_LABEL, formatDate, formatDay, formatPhone } from '../organizer/labels';

type Filter = OrganizerRequestStatus | 'all';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pending', label: 'Por revisar' },
  { value: 'approved', label: 'Aprobadas' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'all', label: 'Todas' },
];

const CHIP = 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap';
const STATUS_CHIP: Record<OrganizerRequestStatus, string> = {
  pending: 'bg-[#fff4d6] text-mg-gold-ink',
  approved: 'bg-mg-pitch-tint text-mg-pitch-deep',
  rejected: 'bg-mg-danger-tint text-mg-danger',
  cancelled: 'bg-mg-surface-2 text-mg-muted',
};

/** Solo enlaces http(s); cualquier otra cosa se muestra como texto. */
const safeUrl = (raw: string | null) => {
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
};

const whatsappHref = (r: OrganizerRequest) => {
  const text = `Hola ${r.contact_name.split(' ')[0]}, te escribo de MedioGol por tu solicitud para organizar "${r.org_name}" en la plataforma.`;
  return `https://wa.me/${r.contact_phone}?text=${encodeURIComponent(text)}`;
};

const RequestCard = ({ r, onDone }: { r: OrganizerRequest; onDone: (msg: string) => void }) => {
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const site = safeUrl(r.website);
  const noteId = `note-${r.id}`;

  const review = async (approve: boolean) => {
    if (!approve && note.trim().length < 5) {
      setError('Escribe el motivo (mínimo 5 letras). Lo verá el solicitante.');
      document.getElementById(noteId)?.focus();
      return;
    }
    setBusy(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('review_organizer_request', {
      p_request_id: r.id,
      p_approve: approve,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (rpcError) {
      console.error('review_organizer_request', rpcError);
      setError(errorText(rpcError, 'No pudimos guardar la revisión. Intenta de nuevo.'));
      return;
    }
    onDone(approve ? `${r.contact_name} ahora es organizador de ${r.org_name}.` : `Solicitud de ${r.org_name} rechazada.`);
  };

  return (
    <li className="bg-mg-surface border border-mg-line rounded-mg-lg p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-xl font-extrabold uppercase leading-6 break-words">{r.org_name}</p>
          <p className="text-sm text-mg-muted">
            {ORG_TYPE_LABEL[r.org_type]} · {SPORT_LABEL[r.sport]} · {r.city}
            {r.venue ? ` · ${r.venue}` : ''}
          </p>
        </div>
        <div className="text-right">
          <span className={`${CHIP} ${STATUS_CHIP[r.status]}`}>{STATUS_LABEL[r.status]}</span>
          <p className="text-xs text-mg-muted mt-1">
            <time dateTime={r.created_at}>{formatDate(r.created_at)}</time>
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="mg-label text-mg-muted">Equipos</dt>
          <dd className="mg-num font-bold">{r.teams_estimate ?? '—'}</dd>
        </div>
        <div>
          <dt className="mg-label text-mg-muted">Series</dt>
          <dd className="mg-num font-bold">{r.series_estimate ?? '—'}</dd>
        </div>
        <div>
          <dt className="mg-label text-mg-muted">Estado</dt>
          <dd className="font-bold">{r.already_running ? 'Ya funciona' : 'Nueva'}</dd>
        </div>
        <div>
          <dt className="mg-label text-mg-muted">Inicio</dt>
          <dd className="font-bold">{r.start_estimate ? formatDay(r.start_estimate) : '—'}</dd>
        </div>
      </dl>

      <div className="rounded-mg-md bg-mg-surface-2 px-3 py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>
          <strong>{r.contact_name}</strong> · {CONTACT_ROLE_LABEL[r.contact_role]}
        </span>
        <span className="mg-num">{formatPhone(r.contact_phone)}</span>
        <span className="flex gap-2 ml-auto">
          <a href={whatsappHref(r)} target="_blank" rel="noopener noreferrer" className={secondaryBtn}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            WhatsApp
          </a>
          <a href={`tel:+${r.contact_phone}`} className={secondaryBtn} aria-label={`Llamar a ${r.contact_name}`}>
            <Phone className="h-4 w-4" aria-hidden="true" />
          </a>
        </span>
      </div>

      {(r.message || r.website) && (
        <div className="text-sm space-y-1">
          {r.message && <p className="whitespace-pre-line break-words">“{r.message}”</p>}
          {r.website &&
            (site ? (
              <a href={site} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-bold text-mg-pitch-deep underline break-all">
                {r.website}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : (
              <p className="break-all text-mg-muted">{r.website}</p>
            ))}
        </div>
      )}

      {r.review_note && r.status !== 'pending' && (
        <p className="text-sm text-mg-muted">
          <strong>Nota de revisión:</strong> {r.review_note}
        </p>
      )}

      {r.status === 'pending' && (
        <div className="border-t border-mg-line pt-3 space-y-3">
          {mode === 'reject' && (
            <div className="space-y-1">
              <label htmlFor={noteId} className="block text-sm font-bold">
                Motivo del rechazo (lo verá el solicitante)
              </label>
              <textarea id={noteId} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={`${fieldClass} py-2`} />
            </div>
          )}
          {mode === 'approve' && (
            <p className="text-sm">
              Al aprobar, <strong>{r.contact_name}</strong> pasa a <strong>admin de campeonato</strong> y podrá crear su liga y campeonatos.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-bold text-mg-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {mode === 'idle' && (
              <>
                <button type="button" onClick={() => setMode('approve')} className={primaryBtn}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Aprobar
                </button>
                <button type="button" onClick={() => setMode('reject')} className={secondaryBtn}>
                  <X className="h-4 w-4" aria-hidden="true" />
                  Rechazar
                </button>
              </>
            )}
            {mode !== 'idle' && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => review(mode === 'approve')}
                  className={mode === 'approve' ? primaryBtn : `${secondaryBtn} !border-mg-danger !text-mg-danger`}
                >
                  {busy ? 'Guardando…' : mode === 'approve' ? 'Sí, aprobar' : 'Rechazar solicitud'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMode('idle');
                    setError('');
                  }}
                  className={secondaryBtn}
                >
                  Volver
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
};

/** Administrar → Solicitudes (solo admin del sistema). */
export const OrganizerRequestsPanel = () => {
  const [filter, setFilter] = useState<Filter>('pending');
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState('');
  const { status, rows, total, reload } = useOrganizerRequestsAdmin(filter, page);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section aria-labelledby="org-req-title" className="space-y-4 font-sans text-mg-ink">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="org-req-title" className="text-xl font-bold">
            Solicitudes de organizador
          </h2>
          <p className="text-sm text-mg-muted">Personas que pidieron acceso desde /organizar. Contáctalas y aprueba o rechaza.</p>
        </div>
        <button type="button" onClick={reload} className={secondaryBtn}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Actualizar
        </button>
      </div>

      <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => {
              setFilter(f.value);
              setPage(0);
              setNotice('');
            }}
            className={`min-h-[44px] px-4 rounded-full text-sm font-bold border ${
              filter === f.value ? 'bg-mg-navy text-mg-on-navy border-mg-navy' : 'bg-mg-surface border-mg-line-strong'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {notice && <p className="rounded-mg-md bg-mg-pitch-tint px-4 py-3 text-sm font-bold">{notice}</p>}
      </div>

      {status === 'loading' && (
        <div className="flex justify-center py-10" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-mg-pitch" aria-hidden="true" />
          <span className="sr-only">Cargando solicitudes…</span>
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="bg-mg-danger-tint rounded-mg-lg px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold">No pudimos cargar las solicitudes.</p>
          <button type="button" onClick={reload} className={primaryBtn}>
            Reintentar
          </button>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <p className="bg-mg-surface border border-dashed border-mg-line-strong rounded-mg-lg px-5 py-8 text-center text-mg-muted">
          {filter === 'pending' ? 'No hay solicitudes por revisar.' : 'No hay solicitudes en este estado.'}
        </p>
      )}

      {status === 'ready' && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r) => (
            <RequestCard
              key={r.id}
              r={r}
              onDone={(msg) => {
                setNotice(msg);
                reload();
              }}
            />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Páginas" className="flex items-center justify-between gap-3">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={secondaryBtn}>
            Anterior
          </button>
          <span className="text-sm text-mg-muted">
            Página {page + 1} de {pages}
          </span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className={secondaryBtn}>
            Siguiente
          </button>
        </nav>
      )}
    </section>
  );
};
