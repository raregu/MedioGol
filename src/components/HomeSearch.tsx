import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useDebounce } from '../utils/useDebounce';
import { ArrowRight, Layers, Search as SearchIcon, Trophy } from 'lucide-react';

interface Suggestion {
  kind: 'league' | 'championship';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Buscador directo del Inicio: sugiere ligas y campeonatos mientras se escribe
 * (búsqueda en el servidor, máx. 5 de cada tipo). Enter sin selección abre /search.
 */
export const HomeSearch = () => {
  const [text, setText] = useState('');
  const q = useDebounce(text.trim(), 250);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.length < 2) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [leagues, champs] = await Promise.all([
        supabase.rpc('search_leagues', { p_query: q, p_limit: 5, p_offset: 0 }),
        supabase.rpc('search_championships', { p_query: q, p_limit: 5, p_offset: 0 }),
      ]);
      if (cancelled) return;
      type L = { id: string; name: string; season: string | null; location: string | null; series_count: number };
      type C = { id: string; name: string; venue: string; league_name: string | null; series_name: string | null; matched_team: string | null };
      setItems([
        ...((leagues.data || []) as L[]).map((l) => ({
          kind: 'league' as const,
          id: l.id,
          title: `${l.name}${l.season ? ` ${l.season}` : ''}`,
          subtitle: [`${l.series_count} series`, l.location].filter(Boolean).join(' · '),
          href: `/league/${l.id}`,
        })),
        ...((champs.data || []) as C[]).map((c) => ({
          kind: 'championship' as const,
          id: c.id,
          title: c.name,
          subtitle: c.matched_team
            ? `Equipo: ${c.matched_team}`
            : c.league_name
            ? `${c.league_name}${c.series_name ? ` · ${c.series_name}` : ''}`
            : c.venue,
          href: `/championship/${c.id}`,
        })),
      ]);
      setActive(-1);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (href: string) => {
    window.location.href = href;
  };
  const searchAll = () => go(`/search${text.trim() ? `?q=${encodeURIComponent(text.trim())}` : ''}`);

  const leagues = items.filter((i) => i.kind === 'league');
  const champs = items.filter((i) => i.kind === 'championship');
  const showList = open && text.trim().length >= 2;

  const renderItem = (s: Suggestion) => {
    const idx = items.indexOf(s);
    return (
      <li
        key={`${s.kind}-${s.id}`}
        id={`home-search-${idx}`}
        role="option"
        aria-selected={idx === active}
        onMouseDown={(e) => {
          e.preventDefault();
          go(s.href);
        }}
        onMouseEnter={() => setActive(idx)}
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${idx === active ? 'bg-emerald-50' : ''}`}
      >
        <span className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.kind === 'league' ? 'bg-emerald-950 text-amber-300' : 'bg-emerald-100 text-emerald-700'}`}>
          {s.kind === 'league' ? <Layers className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-gray-900 truncate">{s.title}</span>
          <span className="block text-xs text-gray-500 truncate">{s.subtitle}</span>
        </span>
      </li>
    );
  };

  return (
    <section aria-labelledby="home-search-title" className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 md:p-8">
      <h2 id="home-search-title" className="text-2xl md:text-3xl font-black text-gray-900 mb-1">Encuentra tu liga o campeonato</h2>
      <p className="text-gray-600 mb-5">Escribe el nombre de la liga, la serie, la ciudad o tu club.</p>
      <div ref={boxRef} className="relative">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (active >= 0 && items[active]) go(items[active].href);
            else searchAll();
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <label htmlFor="home-search-input" className="sr-only">Buscar liga o campeonato</label>
            <input
              id="home-search-input"
              type="search"
              role="combobox"
              aria-expanded={showList}
              aria-controls="home-search-list"
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `home-search-${active}` : undefined}
              autoComplete="off"
              value={text}
              placeholder="Ej: Liga Rural Casablanca, Vitacura, Súper Sénior, Mezcaleros…"
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setText(e.target.value);
                setOpen(true);
              }}
              onKeyDown={(e) => {
                if (!showList || !items.length) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, items.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, -1));
                } else if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
              className="w-full pl-12 pr-4 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
            />
          </div>
          <button type="submit" className="px-5 md:px-7 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 flex items-center gap-2">
            <span className="hidden sm:inline">Buscar</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </form>

        {showList && (
          <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
            <ul id="home-search-list" role="listbox" aria-label="Sugerencias" className="max-h-[60vh] overflow-auto">
              {loading && items.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">Buscando…</li>}
              {!loading && items.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">No encontramos ligas ni campeonatos con ese nombre.</li>}
              {leagues.length > 0 && (
                <li role="presentation" className="px-4 pt-3 pb-1 text-[11px] font-black uppercase tracking-wider text-gray-500">Ligas</li>
              )}
              {leagues.map(renderItem)}
              {champs.length > 0 && (
                <li role="presentation" className="px-4 pt-3 pb-1 text-[11px] font-black uppercase tracking-wider text-gray-500">Campeonatos</li>
              )}
              {champs.map(renderItem)}
            </ul>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                searchAll();
              }}
              className="w-full text-left px-4 py-3 border-t border-gray-100 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
            >
              Ver todos los resultados para “{text.trim()}” →
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
