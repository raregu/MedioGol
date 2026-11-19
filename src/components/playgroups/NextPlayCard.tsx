import { CalendarClock, ChevronRight, MapPin } from 'lucide-react';
import { useMyPlayGroups } from '../../hooks/usePlayGroups';
import { MyPlayGroup } from '../../types/playGroups';
import { fmtMoment, fmtSession } from '../../utils/playGroups';

const statusLine = (g: MyPlayGroup, pending: boolean) => {
  if (g.is_admin) {
    const parts = [`${g.used}/${g.slots} van`];
    if (g.pending > 0) parts.push(`${g.pending} sin confirmar`);
    if (g.waiting > 0) parts.push(`${g.waiting} en espera`);
    if (g.price) parts.push(`${g.paid} pagaron`);
    return { text: parts.join(' · '), tone: 'text-mg-muted' };
  }
  if (pending && g.my_status === 'auto') return { text: `Te falta confirmar antes del ${fmtMoment(g.closes_at)}`, tone: 'text-mg-gold-ink' };
  if (pending) return { text: `Quedan ${Math.max(g.slots - g.used, 0)} cupos: anótate`, tone: 'text-mg-gold-ink' };
  switch (g.my_status) {
    case 'in':
    case 'auto':
      return { text: 'Estás adentro', tone: 'text-mg-pitch-deep' };
    case 'wait':
      return { text: 'Estás en la lista de espera', tone: 'text-mg-gold-ink' };
    case 'out':
      return { text: 'Avisaste que no vas', tone: 'text-mg-muted' };
    default:
      return { text: `${g.used}/${g.slots} van`, tone: 'text-mg-muted' };
  }
};

/** Inicio: "Tu próximo partido" de cada grupo fijo en que juego u organizo. No se muestra si no tengo grupos. */
export const NextPlayCard = () => {
  const { groups, needsMe } = useMyPlayGroups();
  if (groups.length === 0) return null;
  const sorted = [...groups].sort((a, b) => Number(needsMe(b)) - Number(needsMe(a)) || a.starts_at.localeCompare(b.starts_at)).slice(0, 3);

  return (
    <section aria-labelledby="next-play" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="next-play" className="font-display text-2xl font-extrabold uppercase text-mg-ink">Tu próximo partido</h2>
        <a href="/grupos" className="text-sm font-bold text-mg-pitch-deep hover:underline min-h-[44px] inline-flex items-center">Mis grupos</a>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {sorted.map((g) => {
          const pending = needsMe(g);
          const line = statusLine(g, pending);
          return (
            <li key={g.group_id}>
              <a
                href={`/grupos/${g.group_id}`}
                className={`flex items-center gap-3 rounded-mg-lg border bg-mg-surface p-4 shadow-mg-card hover:border-mg-line-strong ${pending ? 'border-mg-gold border-2' : 'border-mg-line'}`}
              >
                <span className={`flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center ${pending ? 'bg-mg-gold text-mg-on-gold' : 'bg-mg-pitch-tint text-mg-pitch-deep'}`}>
                  <CalendarClock className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block mg-label text-mg-muted truncate">{g.name}{g.is_admin ? ' · organizas' : ''}</span>
                  <span className="block font-display text-xl font-extrabold uppercase leading-6">{fmtSession(g.starts_at)}</span>
                  {g.venue && (
                    <span className="flex items-center gap-1 text-xs text-mg-muted truncate">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      {g.venue}
                    </span>
                  )}
                  <span className={`block text-sm font-bold mt-0.5 ${line.tone}`}>{line.text}</span>
                </span>
                <ChevronRight className="h-5 w-5 text-mg-muted flex-shrink-0" aria-hidden="true" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** Mis equipos: mis grupos fijos o la invitación a crear uno. */
export const PlayGroupsSection = () => {
  const { groups, loaded } = useMyPlayGroups();
  if (!loaded) return null;
  if (groups.length > 0) return <NextPlayCard />;
  return (
    <section aria-labelledby="pg-cta" className="rounded-mg-lg border border-mg-line bg-mg-surface p-4 flex flex-wrap items-center gap-3 font-sans text-mg-ink">
      <span className="h-11 w-11 rounded-full bg-mg-pitch-tint text-mg-pitch-deep flex items-center justify-center flex-shrink-0">
        <CalendarClock className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="flex-1 min-w-[12rem]">
        <h2 id="pg-cta" className="font-extrabold">¿Juegas todas las semanas con los mismos?</h2>
        <p className="text-sm text-mg-muted">Crea un grupo fijo: los de siempre quedan adentro y la lista se arma sola.</p>
      </div>
      <a href="/grupos?crear=1" className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-mg-md bg-mg-pitch text-mg-on-pitch font-extrabold text-sm">Crear grupo fijo</a>
    </section>
  );
};
