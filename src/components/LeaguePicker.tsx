import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useDebounce } from '../utils/useDebounce';
import { Layers, X } from 'lucide-react';

export interface LeagueOption {
  id: string;
  name: string;
  season?: string | null;
}

interface Props {
  value: LeagueOption | null;
  onChange: (league: LeagueOption | null) => void;
  placeholder?: string;
}

/** Selector de liga con búsqueda en el servidor (sirve aunque existan miles de ligas). */
export const LeaguePicker = ({ value, onChange, placeholder = 'Filtrar por liga…' }: Props) => {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LeagueOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounce(text, 250);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.rpc('search_leagues', { p_query: debounced || null, p_limit: 8, p_offset: 0 });
      if (!cancelled) {
        setOptions(((data || []) as LeagueOption[]).map((l) => ({ id: l.id, name: l.name, season: l.season })));
        setActive(0);
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (l: LeagueOption) => {
    onChange(l);
    setText('');
    setOpen(false);
  };

  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-emerald-300 bg-emerald-50 rounded-lg min-w-0">
        <Layers className="h-4 w-4 text-emerald-700 flex-shrink-0" />
        <span className="flex-1 text-sm font-semibold text-emerald-900 truncate">
          {value.name}{value.season ? ` ${value.season}` : ''}
        </span>
        <button type="button" onClick={() => onChange(null)} aria-label="Quitar filtro de liga" className="p-1 rounded hover:bg-emerald-100">
          <X className="h-4 w-4 text-emerald-800" />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative min-w-0">
      <Layers className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="league-picker-list"
        aria-autocomplete="list"
        aria-label="Filtrar por liga"
        value={text}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && options[active]) {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
      />
      {open && (
        <ul id="league-picker-list" role="listbox" className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto">
          {loading && options.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">Buscando…</li>}
          {!loading && options.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">Sin ligas que coincidan</li>}
          {options.map((l, i) => (
            <li
              key={l.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(l);
              }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 text-sm cursor-pointer ${i === active ? 'bg-emerald-50 text-emerald-900' : 'text-gray-800'}`}
            >
              {l.name}{l.season ? ` ${l.season}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
