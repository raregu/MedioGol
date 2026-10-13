import { useEffect, useId, useRef, useState } from 'react';
import { Search, User, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useDebounce } from '../utils/useDebounce';

export interface PlayerOption {
  id: string;
  full_name: string;
  position: string | null;
  photo_url: string | null;
  profile_photo: string | null;
}

interface Props {
  /** Equipo base al que se agregará el jugador: el servidor excluye a quienes ya están activos en él. */
  baseTeamId: string;
  value: PlayerOption | null;
  onChange: (player: PlayerOption | null) => void;
  /** Ids a ocultar además de los que filtra el servidor (p. ej. recién agregados). */
  excludeIds?: Set<string>;
  label?: string;
}

const MIN_CHARS = 2;

const photoOf = (p: PlayerOption) =>
  p.profile_photo
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/player-photos/${p.profile_photo}`
    : p.photo_url;

/**
 * Buscador de jugadores con autocompletado (patrón combobox de WAI-ARIA).
 * Busca en el servidor (RPC search_players_for_base_team) desde 2 letras, con espera de 250 ms,
 * máximo 8 resultados y cancelación de búsquedas viejas. Nunca descarga la lista completa.
 */
export const PlayerSearchCombobox = ({ baseTeamId, value, onChange, excludeIds, label = 'Buscar jugador' }: Props) => {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState('');
  const q = useDebounce(text.trim(), 250);
  const [results, setResults] = useState<PlayerOption[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.length < MIN_CHARS) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    supabase
      .rpc('search_players_for_base_team', { p_base_team_id: baseTeamId, p_query: q, p_limit: 8 })
      .abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) {
          console.error('Error buscando jugadores:', error);
          setStatus('error');
          return;
        }
        setResults(((data || []) as PlayerOption[]).filter((p) => !excludeIds?.has(p.id)));
        setActive(-1);
        setStatus('ready');
      });
    return () => controller.abort();
  }, [q, baseTeamId, excludeIds]);

  const choose = (p: PlayerOption) => {
    onChange(p);
    setOpen(false);
    setText('');
  };

  if (value) {
    const photo = photoOf(value);
    return (
      <div>
        <span className="block text-sm font-medium text-gray-700 mb-1">Jugador seleccionado</span>
        <div className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2">
          {photo ? (
            <img src={photo} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="h-9 w-9 rounded-full bg-white flex items-center justify-center text-gray-500" aria-hidden="true">
              <User className="h-4 w-4" />
            </span>
          )}
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-gray-900 truncate">{value.full_name}</span>
            {value.position && <span className="block text-xs text-gray-600">{value.position}</span>}
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="p-1.5 rounded-md text-gray-600 hover:bg-white"
            aria-label="Cambiar jugador"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const showList = open && q.length >= MIN_CHARS;

  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          value={text}
          placeholder="Escribe al menos 2 letras del nombre"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!showList || !results.length) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && active >= 0) {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>
      {text.trim().length > 0 && text.trim().length < MIN_CHARS && (
        <p className="mt-1 text-xs text-gray-500">Sigue escribiendo…</p>
      )}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Jugadores encontrados"
          className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {status === 'loading' && results.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">Buscando…</li>}
          {status === 'error' && <li className="px-3 py-2 text-sm text-red-600">No pudimos buscar. Intenta de nuevo.</li>}
          {status === 'ready' && results.length === 0 && (
            <li className="px-3 py-3 text-sm text-gray-600">
              No encontramos jugadores con “{q}” que no estén ya en el equipo. Si aún no tiene cuenta, invítalo por correo.
            </li>
          )}
          {results.map((p, i) => {
            const photo = photoOf(p);
            return (
              <li
                key={p.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${i === active ? 'bg-emerald-50' : ''}`}
              >
                {photo ? (
                  <img src={photo} alt="" loading="lazy" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500" aria-hidden="true">
                    <User className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 truncate">{p.full_name}</span>
                  {p.position && <span className="block text-xs text-gray-500">{p.position}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
