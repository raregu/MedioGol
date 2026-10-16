import { ArrowRight, Flag } from 'lucide-react';

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
          Súmalo a MedioGol: tabla, goleadores, fixture, papeletas y pagos de los equipos en un solo lugar. Pide tu acceso en 2 minutos.
        </p>
      </div>
    </div>
    <a
      href="/organizar"
      className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm whitespace-nowrap"
    >
      Solicitar acceso
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  </section>
);
