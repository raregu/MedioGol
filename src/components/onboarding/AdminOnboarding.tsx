import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, Compass, MessageCircleQuestion, PartyPopper, X } from 'lucide-react';
import { ONBOARDING_STEPS, OnboardingStatus, OnboardingStepKey, onboardingProgress, openAssistant } from '../../hooks/useAdminOnboarding';

interface StepCopy {
  title: string;
  description: string;
  action: string;
  optional?: boolean;
}

export const STEP_COPY: Record<OnboardingStepKey, StepCopy> = {
  championship: {
    title: 'Crea tu campeonato',
    description:
      'Si tu liga tiene varias series (por edad o categoría), crea la liga y después una serie por categoría. Si es un torneo único, basta con un campeonato.',
    action: 'Crear Campeonato',
  },
  teams: {
    title: 'Agrega los equipos',
    description: 'En la pestaña Equipos usa «Crear Equipo». Puedes elegir clubes que ya están en MedioGol.',
    action: 'Ir a Equipos',
  },
  captain: {
    title: 'Asigna un capitán a cada equipo',
    description:
      'El capitán carga y mantiene la lista de sus jugadores, así no tienes que hacerlo tú. En Equipos, usa «Asignar Capitán» en cada equipo.',
    action: 'Ir a Equipos',
  },
  matches: {
    title: 'Programa los partidos',
    description: 'Crea los partidos uno a uno o sube todo el fixture con «Cargar Excel» (descarga antes la «Plantilla»).',
    action: 'Ir a Partidos',
  },
  result: {
    title: 'Registra tu primer resultado',
    description:
      'Lo más simple: imprime las papeletas con «Descargar papeletas» y, después del partido, usa «Subir papeleta». La IA lee goles y tarjetas, y la tabla y los goleadores se actualizan solos.',
    action: 'Ir a Partidos',
  },
  fees: {
    title: 'Configura los cobros',
    description: 'Inscripción en cuotas, árbitro y multas por tarjetas. MedioGol lleva la cuenta de lo que debe cada equipo.',
    action: 'Ir a Pagos',
    optional: true,
  },
};

const MIN_KEY = 'mg-onboarding-min';
const readMin = () => {
  try {
    return localStorage.getItem(MIN_KEY) === '1';
  } catch {
    return false;
  }
};
const writeMin = (v: boolean) => {
  try {
    if (v) localStorage.setItem(MIN_KEY, '1');
    else localStorage.removeItem(MIN_KEY);
  } catch {
    /* sin almacenamiento: solo dura en esta visita */
  }
};

interface Props {
  status: OnboardingStatus;
  onAction: (step: OnboardingStepKey) => void;
  onHide: () => void;
  saving: boolean;
  error: string | null;
}

/** Guía de primeros pasos del administrador de campeonato (Administrar). */
export const AdminOnboarding = ({ status, onAction, onHide, saving, error }: Props) => {
  const [minimized, setMinimized] = useState(readMin);
  const { done, total, next } = onboardingProgress(status);
  const allDone = next === null;
  const pct = Math.round((done / total) * 100);

  const toggle = () => {
    setMinimized((m) => {
      writeMin(!m);
      return !m;
    });
  };

  return (
    <section aria-labelledby="onboarding-title" className="bg-mg-surface border border-mg-line rounded-mg-lg shadow-mg-card font-sans text-mg-ink overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-mg-line">
        <span className="h-10 w-10 flex-shrink-0 rounded-full bg-mg-pitch-tint text-mg-pitch-deep inline-flex items-center justify-center" aria-hidden="true">
          {allDone ? <PartyPopper className="h-5 w-5" /> : <Compass className="h-5 w-5" />}
        </span>
        <div className="flex-1 min-w-[12rem]">
          <h2 id="onboarding-title" className="font-extrabold text-lg leading-6">
            {allDone ? '¡Tu campeonato está en marcha!' : 'Primeros pasos en MedioGol'}
          </h2>
          <p className="text-sm text-mg-muted">
            {allDone ? 'Completaste todos los pasos de la guía.' : `${done} de ${total} pasos listos`}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!minimized}
          aria-controls="onboarding-steps"
          className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-mg-md text-sm font-bold text-mg-muted hover:bg-mg-surface-2 hover:text-mg-ink"
        >
          {minimized ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
          {minimized ? 'Ver pasos' : 'Minimizar'}
        </button>
        <button
          type="button"
          onClick={onHide}
          disabled={saving}
          className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-mg-md text-sm font-bold text-mg-muted hover:bg-mg-surface-2 hover:text-mg-ink disabled:opacity-60"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          {allDone ? 'Cerrar guía' : 'No volver a mostrar'}
        </button>
      </div>

      <div className="h-1.5 bg-mg-surface-2" role="progressbar" aria-label="Avance de la guía" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div className="h-full bg-mg-pitch transition-all" style={{ width: `${pct}%` }} />
      </div>

      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-mg-md bg-mg-danger-tint px-4 py-2 text-sm font-semibold">
          {error}
        </p>
      )}

      {!minimized && (
        <div id="onboarding-steps">
          <ol className="divide-y divide-mg-line">
            {ONBOARDING_STEPS.map((step, i) => {
              const copy = STEP_COPY[step.key];
              const isDone = step.done(status);
              const isNext = step.key === next;
              return (
                <li key={step.key} className={`flex gap-4 px-5 py-4 ${isNext ? 'bg-mg-pitch-tint' : ''}`}>
                  <span
                    className={`mt-0.5 h-8 w-8 flex-shrink-0 rounded-full inline-flex items-center justify-center text-sm font-extrabold ${
                      isDone
                        ? 'bg-mg-pitch text-mg-on-pitch'
                        : isNext
                          ? 'border-2 border-mg-pitch text-mg-pitch-deep bg-mg-surface'
                          : 'border border-mg-line-strong text-mg-muted'
                    }`}
                    aria-hidden="true"
                  >
                    {isDone ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold ${isDone ? 'text-mg-muted line-through decoration-mg-line-strong' : ''}`}>
                      {copy.title}
                      {copy.optional && <span className="ml-2 mg-label text-mg-muted no-underline">Opcional</span>}
                      <span className="sr-only">{isDone ? ' (listo)' : ' (pendiente)'}</span>
                    </p>
                    {isNext && <p className="mt-1 text-sm text-mg-muted">{copy.description}</p>}
                    {isNext && step.key === 'championship' && (
                      <p className="mt-1 text-sm">
                        <a href="/leagues" className="font-bold text-mg-pitch-deep underline underline-offset-2">
                          O crea una liga con varias series
                        </a>
                      </p>
                    )}
                  </div>
                  {!isDone && (
                    <button
                      type="button"
                      onClick={() => onAction(step.key)}
                      className={`self-center inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-mg-md text-sm font-extrabold whitespace-nowrap ${
                        isNext
                          ? 'bg-mg-pitch text-mg-on-pitch hover:brightness-95'
                          : 'border border-mg-line-strong text-mg-ink hover:border-mg-pitch hover:text-mg-pitch-deep'
                      }`}
                    >
                      {isNext ? copy.action : 'Ir'}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      {!isNext && <span className="sr-only">: {copy.title}</span>}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-t border-mg-line bg-mg-surface-2">
            <button
              type="button"
              onClick={openAssistant}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-mg-md bg-mg-navy text-mg-on-navy text-sm font-bold hover:opacity-90"
            >
              <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
              ¿Dudas? Pregúntale al asistente
            </button>
            <p className="text-xs text-mg-muted">Si la ocultas, puedes volver a abrirla con «Guía de inicio» en Administrar.</p>
          </div>
        </div>
      )}
    </section>
  );
};

interface CardProps {
  status: OnboardingStatus;
  onHide: () => void;
  saving: boolean;
}

/** Recordatorio corto en Inicio: lleva a la guía completa en Administrar. */
export const AdminOnboardingCard = ({ status, onHide, saving }: CardProps) => {
  const { done, total, next } = onboardingProgress(status);
  if (status.hidden || !next) return null;
  return (
    <div className="flex items-center gap-2 rounded-mg-lg border border-mg-line bg-mg-surface shadow-mg-card font-sans text-mg-ink">
      <a href="/admin" className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3 min-h-[64px]">
        <span className="h-10 w-10 flex-shrink-0 rounded-full bg-mg-pitch-tint text-mg-pitch-deep inline-flex items-center justify-center" aria-hidden="true">
          <Compass className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold leading-5">Tu guía de inicio · {done} de {total}</span>
          <span className="block text-sm text-mg-muted truncate">Siguiente: {STEP_COPY[next].title}</span>
        </span>
        <span className="hidden sm:inline-flex items-center gap-1 text-sm font-extrabold text-mg-pitch-deep whitespace-nowrap">
          Continuar <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </a>
      <button
        type="button"
        onClick={onHide}
        disabled={saving}
        className="mr-2 h-11 w-11 flex-shrink-0 inline-flex items-center justify-center rounded-mg-md text-mg-muted hover:bg-mg-surface-2 hover:text-mg-ink disabled:opacity-60"
        aria-label="No volver a mostrar la guía de inicio"
        title="No volver a mostrar"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
};
