import { ArrowRight, ChevronRight, Shirt } from 'lucide-react';

/**
 * Invitación para jugadores: crear cuenta y unirse a su equipo.
 * Visitantes → registro y luego Mis equipos; con sesión → Mis equipos (buscar y unirse).
 */
const target = (loggedIn: boolean) => (loggedIn ? '/my-teams' : `/register?next=${encodeURIComponent('/my-teams')}`);

export const PlayerCta = ({ loggedIn }: { loggedIn: boolean }) => (
  <section
    aria-labelledby="home-player"
    className="bg-mg-surface border border-mg-line rounded-mg-lg shadow-mg-card px-5 py-6 sm:px-8 sm:py-7 flex flex-wrap items-center justify-between gap-5"
  >
    <div className="flex items-start gap-4 max-w-2xl">
      <Shirt className="h-8 w-8 text-mg-pitch flex-shrink-0 mt-1" aria-hidden="true" />
      <div>
        <h2 id="home-player" className="font-display text-[28px] leading-8 font-extrabold uppercase">
          ¿Eres jugador?
        </h2>
        <p className="text-mg-muted mt-1">
          {loggedIn
            ? 'Busca tu equipo y únete: tus partidos, goles y credencial con QR quedan en tu celular.'
            : 'Crea tu cuenta gratis, únete a tu equipo y lleva tus partidos, goles y credencial con QR en el celular.'}
        </p>
      </div>
    </div>
    <a
      href={target(loggedIn)}
      className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm whitespace-nowrap"
    >
      {loggedIn ? 'Unirme a mi equipo' : 'Crear cuenta de jugador'}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  </section>
);

/** Versión corta para celular, bajo la de organizadores. */
export const PlayerCtaCompact = ({ loggedIn }: { loggedIn: boolean }) => (
  <a
    href={target(loggedIn)}
    className="md:hidden flex items-center gap-3 rounded-mg-lg border border-mg-line bg-mg-surface px-4 py-3 min-h-[56px] shadow-mg-card"
  >
    <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-mg-pitch-tint">
      <Shirt className="h-5 w-5 text-mg-pitch-deep" aria-hidden="true" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block font-extrabold text-[15px] leading-5">¿Eres jugador?</span>
      <span className="block text-[13px] text-mg-muted">
        {loggedIn ? 'Busca tu equipo y únete' : 'Crea tu cuenta y únete a tu equipo'}
      </span>
    </span>
    <ChevronRight className="h-5 w-5 flex-shrink-0 text-mg-muted" aria-hidden="true" />
  </a>
);
