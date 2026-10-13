import { User } from 'lucide-react';
import { PlayerCareer } from '../../types/home';

/** Ficha compacta del jugador conectado. */
export const PlayerStrip = ({ career }: { career: PlayerCareer }) => {
  const rating = Number.parseFloat(career.avg_rating ?? '');
  const stats: [string, string | number][] = [
    ['Partidos', career.matches_played],
    ['Goles', career.total_goals],
    ['Asist.', career.total_assists],
    ['Nota', Number.isFinite(rating) ? rating.toFixed(1) : '–'],
  ];
  return (
    <section aria-label="Tu ficha" className="bg-mg-surface border border-mg-line rounded-mg-lg px-5 sm:px-6 py-5 flex flex-wrap items-center gap-5">
      {career.photo_url ? (
        <img src={career.photo_url} alt="" className="w-16 h-16 rounded-mg-md object-cover flex-shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-mg-md bg-mg-surface-2 flex items-center justify-center flex-shrink-0">
          <User className="h-8 w-8 text-mg-muted" aria-hidden="true" />
        </div>
      )}
      <div className="flex-1 min-w-[10rem]">
        <p className="mg-label text-mg-muted">Tu ficha{career.position ? ` · ${career.position}` : ''}</p>
        <p className="text-[17px] font-extrabold text-mg-ink">{career.full_name}</p>
      </div>
      <dl className="flex gap-6 sm:gap-8">
        {stats.map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse items-center">
            <dt className="text-[12px] font-bold uppercase tracking-wide text-mg-muted">{label}</dt>
            <dd className="mg-num text-[28px] leading-8 font-extrabold text-mg-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <a href={`/player/${career.id}`} className="inline-flex items-center min-h-[44px] px-4 rounded-mg-md border border-mg-line-strong font-extrabold text-sm text-mg-ink hover:bg-mg-surface-2">
        Ver mi perfil
      </a>
    </section>
  );
};
