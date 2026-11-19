import { PlayGroupView, PlayMember, PlayStatus } from '../types/playGroups';
import { formatCLP } from './money';

const TZ = 'America/Santiago';
export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const WEEKDAYS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Martes 24 nov · 21:00" */
export const fmtSession = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-CL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' }).replace(',', '').replace('.', '');
  return `${cap(day)} · ${fmtTime(iso)}`;
};

/** "lunes 22:00" */
export const fmtMoment = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-CL', { timeZone: TZ, weekday: 'long' })} ${fmtTime(iso)}`;
};

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

export const isIn = (s: PlayStatus | null | undefined) => s === 'in' || s === 'auto';

/** Valor por persona: la cancha dividida en los cupos. */
export const pricePerPerson = (price: number | null | undefined, slots: number) =>
  price && slots > 0 ? Math.ceil(price / slots / 100) * 100 : null;

export const formatPerPerson = (price: number | null | undefined, slots: number) => {
  const v = pricePerPerson(price, slots);
  return v ? formatCLP(v) : null;
};

/** Token del teléfono para jugadores sin cuenta (uno por grupo). */
const tokenKey = (code: string) => `mg:play:${code}`;
export const readPlayToken = (code: string | null | undefined): string | null => {
  if (!code) return null;
  try {
    return localStorage.getItem(tokenKey(code));
  } catch {
    return null;
  }
};
export const savePlayToken = (code: string, token: string) => {
  try {
    localStorage.setItem(tokenKey(code), token);
  } catch {
    /* modo privado: tendrá que elegir su nombre otra vez */
  }
};
export const clearPlayToken = (code: string) => {
  try {
    localStorage.removeItem(tokenKey(code));
  } catch {
    /* nada */
  }
};

export const groupLink = (code: string) => `${window.location.origin}/g/${code}`;
// api.whatsapp.com conserva los emojis; wa.me los rompe en WhatsApp de escritorio
export const waLink = (text: string) => `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

/** La función no existe todavía en la base (migración sin aplicar). */
export const isMissingFeature = (err: unknown) => {
  const e = err as { code?: string } | null;
  return e?.code === 'PGRST202' || e?.code === '42883' || e?.code === '42P01';
};

export const playErrorText = (err: unknown, fallback: string) => {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return fallback;
  if (e.code === '42501') return e.message && e.message !== 'No autorizado' ? e.message : 'No tienes permiso para esta acción.';
  if (e.code === '22023' || e.code === 'P0002' || e.code === '23514') return e.message || fallback;
  if (isMissingFeature(e)) return 'Los grupos fijos aún no están activados. Intenta más tarde.';
  return fallback;
};

export const byQueue = (a: PlayMember, b: PlayMember) => (a.queued_at || '').localeCompare(b.queued_at || '');

/** Mensaje para el grupo de WhatsApp: abre la lista o recuerda a los que faltan. */
export const listMessage = (v: PlayGroupView) => {
  const { group, session, members } = v;
  const inside = members.filter((m) => isIn(m.status));
  // Fijos que aún no confirman (sin contar a quien manda el mensaje)
  const pending = members.filter((m) => m.status === 'auto' && m.id !== v.me);
  const free = Math.max(session.slots - session.used, 0);
  const lines = [
    `⚽ *${group.name}* · ${fmtSession(session.starts_at)}`,
    session.venue ? `📍 ${session.venue}` : '',
    `Van ${session.used}/${session.slots}${free > 0 ? ` · quedan ${free} cupos` : ' · lista llena'}`,
  ];
  if (pending.length > 0) {
    if (group.fixed_mode === 'confirm') {
      lines.push('', `Falta que confirmen: ${pending.map((m) => m.name).join(', ')}`);
      lines.push(`Si no confirman antes del ${fmtMoment(session.closes_at)} se libera su cupo.`);
    } else {
      lines.push('', `Aún no confirman (igual están adentro): ${pending.map((m) => m.name).join(', ')}`);
      lines.push('Confirmen en el link o avisen si no van, para que entre alguien de la espera.');
    }
  } else if (inside.length > 0) {
    lines.push('', 'Avisen en el link si alguien no puede.');
  }
  lines.push('', `Anótate o avisa aquí 👉 ${groupLink(group.invite_code)}`);
  return lines.filter((l, i) => l !== '' || i > 0).join('\n');
};
