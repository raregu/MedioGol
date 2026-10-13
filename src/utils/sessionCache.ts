/**
 * Caché corta en sessionStorage (stale-while-revalidate): la página se pinta al instante
 * con lo último que vio el usuario y se actualiza en segundo plano. Reduce la carga al
 * servidor cuando miles de personas vuelven al Inicio varias veces en la misma sesión.
 * Nunca guarda datos privados: solo datos públicos.
 */
interface Entry<T> {
  at: number;
  value: T;
}

const PREFIX = 'mg-cache:';

export const readCache = <T>(key: string, maxAgeMs: number): { value: T; fresh: boolean } | null => {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    return { value: entry.value, fresh: Date.now() - entry.at < maxAgeMs };
  } catch {
    return null;
  }
};

export const writeCache = <T>(key: string, value: T) => {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value } satisfies Entry<T>));
  } catch {
    // almacenamiento lleno o bloqueado: se ignora, la caché es opcional
  }
};
