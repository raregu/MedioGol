import { HomeSearch } from '../HomeSearch';
import { LeagueSummary } from '../../types/home';

/** Portada del Inicio: el buscador primero y accesos directos a las ligas activas. */
export const HomeHero = ({ leagues }: { leagues: LeagueSummary[] }) => (
  <section aria-labelledby="home-hero-title" className="relative overflow-hidden rounded-mg-lg bg-mg-navy text-mg-on-navy">
    <div className="mg-grass absolute inset-y-0 right-0 w-[38%] hidden md:block" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-mg-navy to-transparent" />
    </div>
    <div className="relative px-5 sm:px-8 md:px-10 py-10 md:py-12 md:max-w-[66%]">
      <p className="mg-label text-mg-on-navy-muted mb-2">Ligas · Series · Campeonatos</p>
      <h1
        id="home-hero-title"
        className="font-display font-extrabold uppercase text-[44px] leading-[42px] sm:text-[56px] sm:leading-[54px] tracking-[0.01em] mb-3"
      >
        Encuentra tu liga
      </h1>
      <p className="text-mg-on-navy-muted text-[15px] leading-[22px] mb-6 max-w-lg">
        Tablas de posiciones, resultados y fechas de tu liga, tu serie o tu club.
      </p>
      <HomeSearch />
      {leagues.length > 0 && (
        <nav aria-label="Ligas activas" className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-mg-on-navy-muted mr-1">Ligas activas:</span>
          {leagues.map((l) => (
            <a
              key={l.id}
              href={`/league/${l.id}`}
              className="px-3.5 py-2 rounded-full border border-mg-on-navy-muted text-[13px] font-bold text-mg-on-navy hover:bg-mg-gold hover:text-mg-on-gold hover:border-mg-gold"
            >
              {l.name}
            </a>
          ))}
        </nav>
      )}
    </div>
  </section>
);
