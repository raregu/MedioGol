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
        className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer ${idx === active ? 'bg-mg-surface-2' : ''}`}
      >
        <span className={`h-9 w-9 rounded-mg-md flex items-center justify-center flex-shrink-0 ${s.kind === 'league' ? 'bg-mg-navy text-mg-gold' : 'bg-mg-pitch-tint text-mg-pitch'}`}>
          {s.kind === 'league' ? <Layers className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-mg-ink truncate">{s.title}</span>
          <span className="block text-[13px] text-mg-muted truncate">{s.subtitle}</span>
        </span>
      </li>
    );
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-2xl">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && items[active]) go(items[active].href);
          else searchAll();
        }}
        className="flex items-center gap-2 h-14 pl-5 pr-1.5 bg-mg-surface border border-mg-line-strong rounded-full shadow-mg-card focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-mg-gold"
      >
        <SearchIcon className="h-5 w-5 text-mg-muted flex-shrink-0" aria-hidden="true" />
        <label htmlFor="home-search-input" className="sr-only">Busca tu liga, campeonato o equipo</label>
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
          placeholder="Busca tu liga, campeonato o equipo"
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
          className="flex-1 min-w-0 bg-transparent text-base font-semibold text-mg-ink placeholder:text-mg-muted placeholder:font-medium outline-none"
        />
        <button type="submit" className="h-11 px-4 sm:px-5 rounded-full bg-mg-pitch text-mg-on-pitch font-extrabold text-sm flex items-center gap-2 hover:brightness-110">
          <span className="hidden sm:inline">Buscar</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      {showList && (
        <div className="absolute z-30 left-0 right-0 mt-2 bg-mg-surface border border-mg-line rounded-mg-lg shadow-mg-card overflow-hidden text-left">
          <ul id="home-search-list" role="listbox" aria-label="Sugerencias" className="max-h-[60vh] overflow-auto py-1">
            {loading && items.length === 0 && <li className="px-5 py-3 text-sm text-mg-muted">Buscando…</li>}
            {!loading && items.length === 0 && <li className="px-5 py-3 text-sm text-mg-muted">No encontramos ligas ni campeonatos con ese nombre.</li>}
            {leagues.length > 0 && (
              <li role="presentation" className="mg-label px-5 pt-3 pb-1 text-mg-muted">Ligas</li>
            )}
            {leagues.map(renderItem)}
            {champs.length > 0 && (
              <li role="presentation" className="mg-label px-5 pt-3 pb-1 text-mg-muted">Campeonatos</li>
            )}
            {champs.map(renderItem)}
          </ul>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              searchAll();
            }}
            className="w-full text-left px-5 py-3 border-t border-mg-line text-sm font-bold text-mg-pitch hover:bg-mg-surface-2"
          >
            Ver todos los resultados para “{text.trim()}”
          </button>
        </div>
      )}
    </div>
  );
};
