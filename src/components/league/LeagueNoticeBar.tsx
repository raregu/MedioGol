import { ChevronRight, Pin } from 'lucide-react';
import { LeagueNotice } from '../../types/home';
import { noticeKind, timeAgo } from './noticeMeta';

interface Props {
  notice: LeagueNotice;
  /** Muestra el nombre de la liga antes del título (lista de "Siguiendo") */
  showLeague?: boolean;
  /** Muestra el detalle del aviso (página de la serie) */
  showBody?: boolean;
  className?: string;
}

/**
 * Aviso vigente de una liga en una franja compacta. Enlaza al muro de la liga, donde están
 * todos los avisos. Pensado para la tarjeta de la liga, la página de la serie y "Siguiendo".
 */
export const LeagueNoticeBar = ({ notice, showLeague, showBody, className = '' }: Props) => {
  const meta = noticeKind(notice.kind);
  return (
    <a
      href={`/league/${notice.league_id}#muro`}
      className={`group flex items-start gap-3 border-l-4 px-4 py-3 text-mg-ink hover:brightness-[0.98] ${meta.bar} ${className}`}
    >
      <span className={`mt-0.5 h-7 w-7 flex-shrink-0 rounded-full inline-flex items-center justify-center ${meta.chip}`} aria-hidden="true">
        <meta.Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 text-[11px] font-extrabold uppercase tracking-wide text-mg-muted">
          <span>{meta.label}</span>
          {notice.pinned && (
            <span className="inline-flex items-center gap-0.5">
              <Pin className="h-3 w-3" aria-hidden="true" /> Fijado
            </span>
          )}
          <span className="font-semibold normal-case tracking-normal">· {timeAgo(notice.created_at)}</span>
        </span>
        <span className="block font-extrabold leading-snug break-words">
          {showLeague && notice.league_name ? <span className="text-mg-muted">{notice.league_name}: </span> : null}
          {notice.title}
        </span>
        {showBody && notice.body && <span className="block text-sm text-mg-ink/80 whitespace-pre-line break-words mt-0.5 line-clamp-3">{notice.body}</span>}
      </span>
      <ChevronRight className="h-4 w-4 mt-1.5 text-mg-muted group-hover:translate-x-0.5 transition-transform flex-shrink-0" aria-hidden="true" />
      <span className="sr-only">Ver el muro de la liga</span>
    </a>
  );
};
