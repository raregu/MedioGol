import { ArrowRight, ChevronRight, Flag } from 'lucide-react';

/** Invitación a pedir acceso de organizador (visitantes y usuarios sin rol de administración). */
export const OrganizerCta = () => (
  <section aria-labelledby="home-organize" className="bg-mg-navy text-mg-on-navy rounded-mg-lg px-5 py-6 sm:px-8 sm:py-7 flex flex-wrap items-center justify-between gap-5">
    <div className="flex items-start gap-4 max-w-2xl">
      <Flag className="h-8 w-8 text-mg-lime flex-shrink-0 mt-1" aria-hidden="true" />
      <div>
        <h2 id="home-organize" className="font-display text-[28px] leading-8 font-extrabold uppercase">
          ¿Organizas una liga o un campeonato?
        </h2>
        <p className="text-mg-on-navy-muted mt-1">
          Súmalo a MedioGol: tabla, goleadores, fixture, papeletas y pagos de los equipos en un solo lugar. Crea tu cuenta gratis en 2 minutos.
        </p>
      </div>
    </div>
    <a
      href="/organizar"
      className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm whitespace-nowrap"
    >
      Empieza gratis
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  </section>
);

/** Versión corta para celular: va arriba en el Inicio, justo después de la portada. */
export const OrganizerCtaCompact = () => (
  <a
    href="/organizar"
    className="md:hidden flex items-center gap-3 rounded-mg-lg border border-mg-line bg-mg-surface px-4 py-3 min-h-[56px] shadow-mg-card"
  >
    <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-mg-pitch-tint">
      <Flag className="h-5 w-5 text-mg-pitch-deep" aria-hidden="true" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-extrabold text-[15px] leading-5">¿Organizas una liga?</span>
      <span className="block text-[13px] text-mg-muted">Crea tu cuenta de organizador gratis</span>
    </span>
    <ChevronRight className="h-5 w-5 flex-shrink-0 text-mg-muted" aria-hidden="true" />
  </a>
);
