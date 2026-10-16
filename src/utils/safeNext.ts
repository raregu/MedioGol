/**
 * Destino después de iniciar sesión o registrarse (?next=/organizar).
 * Solo rutas internas: evita redirecciones abiertas a otros sitios.
 */
export const safeNext = (fallback = '/') => {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
};

/** Agrega ?next= a un enlace de login/registro si la página actual lo trae. */
export const withNext = (path: string) => {
  const next = new URLSearchParams(window.location.search).get('next');
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
};
