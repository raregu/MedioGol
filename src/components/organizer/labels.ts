import { ContactRole, OrganizerRequestStatus, OrgSport, OrgType } from '../../types/organizer';

export const ORG_TYPE_OPTIONS: { value: OrgType; label: string; hint: string }[] = [
  { value: 'league', label: 'Liga con varias series', hint: 'Clubes que juegan en distintas categorías (Sénior, Dorados…)' },
  { value: 'championship', label: 'Campeonato', hint: 'Un torneo con sus equipos, fechas y tabla' },
  { value: 'tournament', label: 'Torneo corto o relámpago', hint: 'Un fin de semana, una copa o un cuadrangular' },
  { value: 'venue', label: 'Recinto o complejo deportivo', hint: 'Administras canchas y organizas campeonatos ahí' },
];

export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  league: 'Liga',
  championship: 'Campeonato',
  tournament: 'Torneo corto',
  venue: 'Recinto deportivo',
};

export const SPORT_LABEL: Record<OrgSport, string> = {
  futbol: 'Fútbol (11)',
  futbolito: 'Futbolito (7)',
  baby_futbol: 'Baby fútbol',
  futsal: 'Futsal',
  otro: 'Otro',
};

export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  organizer: 'Organizador',
  president: 'Presidente',
  delegate: 'Delegado',
  venue_manager: 'Encargado del recinto',
  other: 'Otro',
};

export const STATUS_LABEL: Record<OrganizerRequestStatus, string> = {
  pending: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
};

/** 56912345678 → +56 9 1234 5678 (solo para mostrar). */
export const formatPhone = (digits: string) => {
  const m = digits.match(/^56(9)(\d{4})(\d{4})$/);
  return m ? `+56 ${m[1]} ${m[2]} ${m[3]}` : `+${digits}`;
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });

/** Fecha sin hora (yyyy-mm-dd) mostrada sin corrimiento de zona horaria. */
export const formatDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
};
