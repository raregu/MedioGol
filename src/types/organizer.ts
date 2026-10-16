export type OrgType = 'league' | 'championship' | 'tournament' | 'venue';
export type OrgSport = 'futbol' | 'futbolito' | 'baby_futbol' | 'futsal' | 'otro';
export type ContactRole = 'organizer' | 'president' | 'delegate' | 'venue_manager' | 'other';
export type OrganizerRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** Fila de public.organizer_requests (la ven el solicitante y el admin del sistema). */
export interface OrganizerRequest {
  id: string;
  user_id: string;
  org_type: OrgType;
  org_name: string;
  city: string;
  venue: string | null;
  sport: OrgSport;
  teams_estimate: number | null;
  series_estimate: number | null;
  start_estimate: string | null;
  already_running: boolean;
  website: string | null;
  contact_name: string;
  contact_phone: string;
  contact_role: ContactRole;
  message: string | null;
  status: OrganizerRequestStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** Datos del formulario guiado (lo que se envía a submit_organizer_request). */
export interface OrganizerRequestDraft {
  org_type: OrgType;
  org_name: string;
  city: string;
  venue: string;
  sport: OrgSport;
  teams_estimate: number | null;
  series_estimate: number | null;
  start_estimate: string;
  already_running: boolean;
  website: string;
  contact_name: string;
  contact_phone: string;
  contact_role: ContactRole;
  message: string;
}
