import { useEffect, useState } from 'react';

/** Devuelve `value` después de `delay` ms sin cambios (para no consultar en cada tecla). */
export const useDebounce = <T,>(value: T, delay = 300): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};
