/**
 * Formatea una fecha "solo día" (YYYY-MM-DD) sin desfase de zona horaria.
 * `new Date('2026-09-06')` se interpreta como UTC y en Chile se muestra como el día anterior;
 * aquí se construye la fecha en hora local.
 */
export const formatDateOnly = (value?: string | null, options?: Intl.DateTimeFormatOptions, locale = 'es-CL') => {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  const date = m && value.length <= 10 ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return date.toLocaleDateString(locale, options);
};

/** Normaliza texto para búsquedas: minúsculas y sin tildes. */
export const normalizeText = (s?: string | null) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
