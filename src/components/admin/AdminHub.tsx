import { ArrowRight, Eye, Trophy, Wallet } from 'lucide-react';
import { Championship } from '../../types/database';

export interface HubLeague {
  id: string;
  name: string;
  logo_url: string | null;
  /** Administra la liga completa (puede ver Pagos de la liga). */
  canManage: boolean;
}

interface Props {
  leagues: HubLeague[];
  championships: Championship[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const seriesName = (c: Championship) => c.series_name?.trim() || c.name;

const chipClass = (active: boolean) =>
  `inline-flex items-center gap-1 min-h-[44px] px-4 rounded-full border text-sm font-bold transition-colors ${
    active
      ? 'bg-mg-pitch border-mg-pitch text-mg-on-pitch'
      : 'bg-mg-surface border-mg-line-strong text-mg-ink hover:border-mg-pitch hover:text-mg-pitch-deep'
  }`;

/**
 * Navegación de Administrar con la misma estructura que Ligas:
 * liga → series. Los campeonatos que no pertenecen a una liga van aparte.
 */
export const AdminHub = ({ leagues, championships, selectedId, onSelect }: Props) => {
  const byLeague = new Map<string, Championship[]>();
  const loose: Championship[] = [];
  championships.forEach((c) => {
    if (c.league_id && leagues.some((l) => l.id === c.league_id)) {
      byLeague.set(c.league_id, [...(byLeague.get(c.league_id) || []), c]);
    } else {
      loose.push(c);
    }
  });
  byLeague.forEach((list) => list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || seriesName(a).localeCompare(seriesName(b))));

  return (
    <div className="space-y-4 font-sans text-mg-ink">
      {leagues.length > 0 && (
        <section aria-labelledby="hub-leagues" className="space-y-3">
          <h2 id="hub-leagues" className="mg-label text-mg-muted">Mis ligas</h2>
          {leagues.map((l) => {
            const series = byLeague.get(l.id) || [];
            return (
              <article key={l.id} className="bg-mg-surface border border-mg-line rounded-mg-lg overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 px-5 py-4 bg-mg-navy text-mg-on-navy">
                  {l.logo_url ? (
                    <img src={l.logo_url} alt="" className="h-10 w-10 rounded-full object-cover bg-white" />
                  ) : (
                    <span className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center" aria-hidden="true">
                      <Trophy className="h-5 w-5" />
                    </span>
                  )}
                  <div className="flex-1 min-w-[10rem]">
                    <h3 className="font-display text-2xl leading-7 font-extrabold uppercase">{l.name}</h3>
                    <p className="text-sm text-mg-on-navy-muted">{series.length} {series.length === 1 ? 'serie' : 'series'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`/league/${l.id}`} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-mg-md bg-white/10 border border-white/20 text-sm font-bold hover:bg-white/20">
                      <Eye className="h-4 w-4" aria-hidden="true" /> Ver liga
                    </a>
                    {l.canManage && (
                      <a href={`/pagos?league=${l.id}`} className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-mg-md bg-white text-mg-navy text-sm font-bold hover:bg-mg-pitch-tint">
                        <Wallet className="h-4 w-4" aria-hidden="true" /> Pagos de la liga
                      </a>
                    )}
                  </div>
                </div>
                <div className="px-5 py-4">
                  {series.length === 0 ? (
                    <p className="text-sm text-mg-muted">Esta liga aún no tiene series. Agrégalas desde "Ver liga" → Administrar liga.</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Series de ${l.name}`}>
                      <span className="text-sm font-bold text-mg-muted mr-1">Administrar serie:</span>
                      {series.map((c) => (
                        <button key={c.id} type="button" aria-pressed={selectedId === c.id} onClick={() => onSelect(c.id)} className={chipClass(selectedId === c.id)}>
                          {seriesName(c)}
                          {selectedId !== c.id && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {loose.length > 0 && (
        <section aria-labelledby="hub-loose" className="bg-mg-surface border border-mg-line rounded-mg-lg px-5 py-4 space-y-3">
          <h2 id="hub-loose" className="mg-label text-mg-muted">{leagues.length ? 'Campeonatos sin liga' : 'Mis campeonatos'}</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Campeonatos">
            {loose.map((c) => (
              <button key={c.id} type="button" aria-pressed={selectedId === c.id} onClick={() => onSelect(c.id)} className={chipClass(selectedId === c.id)}>
                {c.name}
                {selectedId !== c.id && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
