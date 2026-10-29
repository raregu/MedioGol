import { CalendarX, Clock, Megaphone, LucideIcon } from 'lucide-react';
import { LeagueNoticeKind } from '../../types/home';

/** Etiqueta, icono y colores de cada tipo de aviso del muro de una liga. */
export const NOTICE_KINDS: Record<LeagueNoticeKind, { label: string; Icon: LucideIcon; chip: string; bar: string }> = {
  suspension: {
    label: 'Fecha suspendida',
    Icon: CalendarX,
    chip: 'bg-mg-danger text-white',
    bar: 'bg-mg-danger-tint border-mg-danger',
  },
  horario: {
    label: 'Cambio de horario',
    Icon: Clock,
    chip: 'bg-mg-gold text-mg-on-gold',
    bar: 'bg-mg-surface-2 border-mg-gold',
  },
  aviso: {
    label: 'Aviso',
    Icon: Megaphone,
    chip: 'bg-mg-navy text-mg-on-navy',
    bar: 'bg-mg-pitch-tint border-mg-pitch',
  },
};

export const noticeKind = (k: string) => NOTICE_KINDS[k as LeagueNoticeKind] ?? NOTICE_KINDS.aviso;

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/** "hace 2 horas", "ayer", "hace 3 días"; después de una semana, la fecha. */
export const timeAgo = (iso: string) => {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'recién';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
};
