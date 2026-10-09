import { Plus } from 'lucide-react';
import { HomeChampionship } from '../../types/home';
import { formatDateOnly } from '../../utils/dates';
import { SectionHeader } from './SectionHeader';

interface Props {
  championships: HomeChampionship[];
  canCreateTeam: (c: HomeChampionship) => boolean;
  onCreateTeam: (c: HomeChampionship) => void;
}

/** Campeonatos en curso que no pertenecen a una liga. */
export const ChampionshipGrid = ({ championships, canCreateTeam, onCreateTeam }: Props) => (
  <section aria-labelledby="home-championships">
    <SectionHeader id="home-championships" title="Campeonatos" href="/search" linkText="Ver todos" />
    {championships.length === 0 ? (
      <p className="bg-mg-surface border border-mg-line rounded-mg-lg px-5 py-8 text-center text-sm text-mg-muted">
        No hay campeonatos activos fuera de una liga.
      </p>
    ) : (
      <ul className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
        {championships.map((c) => (
          <li key={c.id} className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden flex flex-col hover:shadow-mg-card transition-shadow">
            <a href={`/championship/${c.id}`} className="relative h-24 mg-grass flex items-end p-3" tabIndex={-1} aria-hidden="true">
              {c.image_url && <img src={c.image_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
              <span className="relative inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-mg-surface text-mg-ink text-[11px] font-extrabold uppercase tracking-wide">
                <span className="w-2 h-2 rounded-full bg-mg-flame" />
                En curso
              </span>
            </a>
            <div className="p-5 flex flex-col gap-1 flex-1">
              <p className="mg-label text-mg-muted">{[c.sport, c.venue].filter(Boolean).join(' · ')}</p>
              <a href={`/championship/${c.id}`} className="text-[17px] leading-6 font-extrabold text-mg-ink hover:underline">
                {c.name}
              </a>
              {c.start_date && (
                <p className="text-[13px] text-mg-muted">Desde {formatDateOnly(c.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              )}
              {canCreateTeam(c) && (
                <button
                  type="button"
                  onClick={() => onCreateTeam(c)}
                  className="mt-3 self-start inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-mg-md border border-mg-line-strong text-sm font-extrabold text-mg-ink hover:bg-mg-surface-2"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Crear equipo
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);
