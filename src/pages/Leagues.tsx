import { useEffect, useRef, useState } from 'react';
import { Layout } from '../components/Layout';
import { LeagueCard } from '../components/LeagueCard';
import { LeagueManageModal } from '../components/admin/LeagueManageModal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { League } from '../types/database';
import { useDebounce } from '../utils/useDebounce';
import { Layers, Plus, Search as SearchIcon } from 'lucide-react';

const PAGE_SIZE = 12;

/** Trae las ligas completas de una página de resultados de search_leagues, respetando el orden. */
const loadPage = async (q: string, offset: number) => {
  const { data, error } = await supabase.rpc('search_leagues', { p_query: q || null, p_limit: PAGE_SIZE, p_offset: offset });
  if (error) throw error;
  const page = (data || []) as { id: string; total_count: number }[];
  if (!page.length) return { leagues: [] as League[], total: 0 };
  const { data: full } = await supabase.from('leagues').select('*').in('id', page.map((p) => p.id));
  const byId = new Map(((full || []) as League[]).map((l) => [l.id, l]));
  return { leagues: page.map((p) => byId.get(p.id)).filter(Boolean) as League[], total: Number(page[0].total_count) || 0 };
};

export const Leagues = () => {
  const { profile } = useAuth();
  const [search, setSearch] = useState(new URLSearchParams(window.location.search).get('q') || '');
  const q = useDebounce(search.trim(), 300);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const req = useRef(0);
  const canCreate = !!profile && ['admin_sistema', 'admin_campeonato'].includes(profile.role);

  useEffect(() => {
    const id = ++req.current;
    setLoading(true);
    loadPage(q, 0)
      .then((r) => {
        if (id !== req.current) return;
        setLeagues(r.leagues);
        setTotal(r.total);
      })
      .catch((e) => console.error('Error loading leagues:', e))
      .finally(() => id === req.current && setLoading(false));
    const url = new URL(window.location.href);
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');
    window.history.replaceState({}, '', url.toString());
  }, [q, profile]);

  const loadMore = async () => {
    const id = req.current;
    setLoadingMore(true);
    try {
      const r = await loadPage(q, leagues.length);
      if (id === req.current) setLeagues((prev) => [...prev, ...r.leagues]);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-xl">
              <Layers className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-gray-900">Ligas</h1>
              <p className="text-gray-600">Competencias con varias series y tabla general por club</p>
            </div>
          </div>
          {canCreate && (
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow">
              <Plus className="h-5 w-5" /> Crear liga
            </button>
          )}
        </div>

        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <label htmlFor="league-search" className="sr-only">Buscar ligas</label>
          <input
            id="league-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar liga por nombre, ciudad, serie o club…"
            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          </div>
        ) : leagues.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-12 text-center text-gray-600">{q ? 'No hay ligas que coincidan.' : 'Aún no hay ligas.'}</div>
        ) : (
          <>
            <p className="text-gray-700" aria-live="polite">{total} {total === 1 ? 'liga' : 'ligas'}</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {leagues.map((l) => (
                <LeagueCard key={l.id} league={l} />
              ))}
            </div>
            {leagues.length < total && (
              <div className="flex flex-col items-center gap-2">
                <button onClick={loadMore} disabled={loadingMore} className="px-6 py-3 rounded-xl border-2 border-emerald-600 text-emerald-700 font-bold hover:bg-emerald-50 disabled:opacity-50">
                  {loadingMore ? 'Cargando…' : 'Cargar más'}
                </button>
                <span className="text-xs text-gray-500">Mostrando {leagues.length} de {total}</span>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <LeagueManageModal
          onClose={() => setShowCreate(false)}
          onSaved={(id) => {
            setShowCreate(false);
            window.history.pushState({}, '', `/league/${id}`);
          }}
        />
      )}
    </Layout>
  );
};
