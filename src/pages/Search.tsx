import { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { LeagueOption, LeaguePicker } from '../components/LeaguePicker';
import { formatDateOnly } from '../utils/dates';
import { useDebounce } from '../utils/useDebounce';
import { Search as SearchIcon, Trophy, MapPin, Calendar, Filter, User, Award, Layers, Users, X } from 'lucide-react';

const PAGE_SIZE = 24;

interface ChampionshipResult {
  id: string;
  name: string;
  sport: string;
  venue: string;
  description: string | null;
  status: string;
  start_date: string | null;
  image_url: string | null;
  league_id: string | null;
  series_name: string | null;
  league_name: string | null;
  league_season: string | null;
  team_count: number;
  matched_team: string | null;
  total_count: number;
}

interface LeagueResult {
  id: string;
  name: string;
  season: string | null;
  location: string | null;
  logo_url: string | null;
  status: string;
  series_count: number;
  series_names: string[] | null;
  total_count: number;
}

interface PlayerResult {
  id: string;
  full_name: string;
  position: string | null;
  photo_url: string | null;
  matches_played: number;
  total_goals: number;
  total_assists: number;
  avg_rating: number | string | null;
}

const STATUS_LABEL: Record<string, string> = { active: 'Activo', draft: 'Borrador', finished: 'Finalizado' };
const STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  draft: 'bg-yellow-100 text-yellow-800',
  finished: 'bg-gray-100 text-gray-700',
};
const POSITIONS = [
  'Portero', 'Defensa Central', 'Lateral Derecho', 'Lateral Izquierdo', 'Mediocampista Defensivo',
  'Mediocampista Central', 'Mediocampista Ofensivo', 'Extremo Derecho', 'Extremo Izquierdo', 'Delantero Centro',
];

export const Search = () => {
  const params = new URLSearchParams(window.location.search);
  const [activeTab, setActiveTab] = useState<'championships' | 'players'>(params.get('tab') === 'players' ? 'players' : 'championships');
  const [searchTerm, setSearchTerm] = useState(params.get('q') || '');
  const query = useDebounce(searchTerm.trim(), 300);
  const [sportFilter, setSportFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [league, setLeague] = useState<LeagueOption | null>(null);
  const [withoutLeague, setWithoutLeague] = useState(false);
  const [positionFilter, setPositionFilter] = useState('all');
  const [sports, setSports] = useState<string[]>([]);

  const [champs, setChamps] = useState<ChampionshipResult[]>([]);
  const [champTotal, setChampTotal] = useState(0);
  const [leagues, setLeagues] = useState<LeagueResult[]>([]);
  const [leagueTotal, setLeagueTotal] = useState(0);
  const [players, setPlayers] = useState<PlayerResult[]>([]);
  const [playerTotal, setPlayerTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    supabase.rpc('championship_sports').then(({ data }) => setSports(((data || []) as { sport: string }[]).map((s) => s.sport)));
  }, []);

  // URL compartible
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    if (activeTab === 'players') url.searchParams.set('tab', 'players');
    else url.searchParams.delete('tab');
    window.history.replaceState({}, '', url.toString());
  }, [query, activeTab]);

  const fetchChampionships = async (offset: number) =>
    supabase.rpc('search_championships', {
      p_query: query || null,
      p_sport: sportFilter === 'all' ? null : sportFilter,
      p_status: statusFilter === 'all' ? null : statusFilter,
      p_league_id: league?.id ?? null,
      p_without_league: withoutLeague,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });

  const fetchPlayers = async (offset: number): Promise<{ rows: PlayerResult[]; total: number; error?: string }> => {
    const { data, error: e } = await supabase.rpc('search_players', {
      p_query: query || null,
      p_position: positionFilter === 'all' ? null : positionFilter,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (e) return { rows: [], total: 0, error: e.message };
    const page = (data || []) as { id: string; full_name: string; total_count: number }[];
    if (!page.length) return { rows: [], total: 0 };
    // Estadísticas solo de los jugadores de esta página
    const { data: stats } = await supabase.from('player_career_stats').select('*').in('id', page.map((p) => p.id));
    const byId = new Map(((stats || []) as PlayerResult[]).map((s) => [s.id, s]));
    return {
      rows: page.map((p) => byId.get(p.id) || { id: p.id, full_name: p.full_name, position: null, photo_url: null, matches_played: 0, total_goals: 0, total_assists: 0, avg_rating: 0 }),
      total: Number(page[0].total_count) || 0,
    };
  };

  // Primera página cada vez que cambian la búsqueda o los filtros
  useEffect(() => {
    const id = ++requestId.current;
    const run = async () => {
      setLoading(true);
      setError('');
      if (activeTab === 'championships') {
        const showLeagues = !league && !withoutLeague;
        const [champRes, leagueRes] = await Promise.all([
          fetchChampionships(0),
          showLeagues
            ? supabase.rpc('search_leagues', { p_query: query || null, p_status: statusFilter === 'all' ? null : statusFilter, p_limit: 4, p_offset: 0 })
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (id !== requestId.current) return;
        if (champRes.error) setError(champRes.error.message);
        const rows = (champRes.data || []) as ChampionshipResult[];
        setChamps(rows);
        setChampTotal(rows.length ? Number(rows[0].total_count) : 0);
        const lrows = (leagueRes.data || []) as LeagueResult[];
        setLeagues(lrows);
        setLeagueTotal(lrows.length ? Number(lrows[0].total_count) : 0);
      } else {
        const res = await fetchPlayers(0);
        if (id !== requestId.current) return;
        if (res.error) setError(res.error);
        setPlayers(res.rows);
        setPlayerTotal(res.total);
      }
      setLoading(false);
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, query, sportFilter, statusFilter, league, withoutLeague, positionFilter]);

  const loadMore = async () => {
    const id = requestId.current;
    setLoadingMore(true);
    if (activeTab === 'championships') {
      const { data } = await fetchChampionships(champs.length);
      if (id === requestId.current) setChamps((prev) => [...prev, ...((data || []) as ChampionshipResult[])]);
    } else {
      const res = await fetchPlayers(players.length);
      if (id === requestId.current) setPlayers((prev) => [...prev, ...res.rows]);
    }
    setLoadingMore(false);
  };

  const hasFilters = !!searchTerm || sportFilter !== 'all' || statusFilter !== 'all' || !!league || withoutLeague || positionFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setSportFilter('all');
    setStatusFilter('all');
    setLeague(null);
    setWithoutLeague(false);
    setPositionFilter('all');
  };

  const selectClass = 'w-full min-w-0 px-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent';
  const shown = activeTab === 'championships' ? champs.length : players.length;
  const total = activeTab === 'championships' ? champTotal : playerTotal;

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Buscar</h1>
          <p className="text-gray-600 text-lg">Encuentra ligas, campeonatos, equipos y jugadores</p>
        </div>

        <div className="bg-white rounded-xl shadow-md">
          <div className="border-b border-gray-200">
            <div className="flex" role="tablist">
              {(['championships', 'players'] as const).map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-6 py-4 font-medium transition-colors ${
                    activeTab === tab ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab === 'championships' ? <Trophy className="h-5 w-5 inline mr-2" /> : <User className="h-5 w-5 inline mr-2" />}
                  {tab === 'championships' ? 'Ligas y campeonatos' : 'Jugadores'}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <label htmlFor="search-input" className="sr-only">Buscar</label>
              <input
                id="search-input"
                type="search"
                placeholder={activeTab === 'championships' ? 'Nombre, liga, serie, recinto o equipo…' : 'Buscar jugadores por nombre…'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {activeTab === 'championships' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto] gap-3 items-center">
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <select aria-label="Deporte" value={sportFilter} onChange={(e) => setSportFilter(e.target.value)} className={selectClass}>
                    <option value="all">Todos los deportes</option>
                    {sports.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <select aria-label="Estado" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
                    <option value="all">Todos los estados</option>
                    <option value="active">Activo</option>
                    <option value="draft">Borrador</option>
                    <option value="finished">Finalizado</option>
                  </select>
                </div>
                <div className={withoutLeague ? 'opacity-50 pointer-events-none' : ''}>
                  <LeaguePicker value={league} onChange={setLeague} />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-600"
                    checked={withoutLeague}
                    onChange={(e) => {
                      setWithoutLeague(e.target.checked);
                      if (e.target.checked) setLeague(null);
                    }}
                  />
                  Solo sin liga
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-gray-400" />
                <select aria-label="Posición" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} className={selectClass}>
                  <option value="all">Todas las posiciones</option>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 text-sm">No se pudo completar la búsqueda: {error}</div>}

        {loading ? (
          <div className="flex items-center justify-center min-h-[30vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-gray-700" aria-live="polite">
                {activeTab === 'championships'
                  ? `${leagueTotal ? `${leagueTotal} ${leagueTotal === 1 ? 'liga' : 'ligas'} · ` : ''}${champTotal} ${champTotal === 1 ? 'campeonato' : 'campeonatos'}`
                  : `${playerTotal} ${playerTotal === 1 ? 'jugador' : 'jugadores'}`}
              </p>
              {hasFilters && (
                <button onClick={clearFilters} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
                  <X className="h-4 w-4" /> Limpiar filtros
                </button>
              )}
            </div>

            {activeTab === 'championships' ? (
              <>
                {leagues.length > 0 && (
                  <section aria-label="Ligas" className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {leagues.map((l) => (
                        <a key={l.id} href={`/league/${l.id}`} className="bg-emerald-950 text-white rounded-xl shadow-md hover:shadow-xl transition-all p-5 flex gap-4 items-start">
                          {l.logo_url ? (
                            <img src={l.logo_url} alt="" className="h-14 w-14 rounded-full object-cover border-[3px] border-amber-400 bg-white flex-shrink-0" />
                          ) : (
                            <span className="h-14 w-14 rounded-full bg-white text-emerald-900 flex items-center justify-center border-[3px] border-amber-400 flex-shrink-0">
                              <Layers className="h-6 w-6" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">Liga · {l.series_count} series</p>
                            <h3 className="text-lg font-black leading-tight">{l.name}{l.season ? ` ${l.season}` : ''}</h3>
                            {l.location && <p className="text-sm text-emerald-100 flex items-center gap-1 mt-1"><MapPin className="h-3.5 w-3.5" />{l.location}</p>}
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {(l.series_names || []).slice(0, 8).map((s) => (
                                <span key={s} className="px-2.5 py-1 rounded-full bg-white/10 text-xs font-semibold">{s}</span>
                              ))}
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                    {leagueTotal > leagues.length && (
                      <a href={`/leagues${query ? `?q=${encodeURIComponent(query)}` : ''}`} className="inline-block text-sm font-bold text-emerald-700 hover:underline">
                        Ver las {leagueTotal} ligas →
                      </a>
                    )}
                  </section>
                )}

                {champs.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-md p-12 text-center">
                    <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 text-lg">No se encontraron campeonatos con estos criterios.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {champs.map((c) => (
                      <a
                        key={c.id}
                        href={`/championship/${c.id}`}
                        className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border border-gray-100 hover:border-emerald-200 flex flex-col"
                      >
                        {c.league_name && (
                          <span className="self-start mb-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950 text-white text-xs font-bold max-w-full">
                            <Layers className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{c.league_name}{c.series_name ? ` · ${c.series_name}` : ''}</span>
                          </span>
                        )}
                        <div className="flex items-start gap-3 mb-4">
                          {c.image_url && <img src={c.image_url} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-gray-200 shadow-sm" />}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">{c.name}</h3>
                            <div className="flex flex-wrap gap-2">
                              <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium">{c.sport}</span>
                              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${STATUS_CLASS[c.status] || STATUS_CLASS.finished}`}>
                                {STATUS_LABEL[c.status] || c.status}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600">
                          <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" /><span>{c.venue}</span></div>
                          {c.start_date && (
                            <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" /><span>{formatDateOnly(c.start_date)}</span></div>
                          )}
                          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-gray-400" /><span>{c.team_count} equipos</span></div>
                          {c.matched_team && <p className="text-emerald-800 bg-emerald-50 rounded-lg px-3 py-1.5 font-medium">Equipo: {c.matched_team}</p>}
                        </div>
                        {c.description && <p className="mt-4 text-sm text-gray-600 line-clamp-2">{c.description}</p>}
                        <div className="mt-auto pt-4">
                          <div className="pt-4 border-t"><span className="text-emerald-700 font-medium text-sm">Ver detalles →</span></div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </>
            ) : players.length === 0 ? (
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <User className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">No se encontraron jugadores con estos criterios.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {players.map((player) => {
                  const rating = Number(player.avg_rating) || 0;
                  return (
                    <a key={player.id} href={`/player/${player.id}`} className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border border-gray-100 hover:border-emerald-200">
                      <div className="flex items-start gap-4 mb-4">
                        {player.photo_url ? (
                          <img src={player.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center"><User className="h-8 w-8 text-gray-400" /></div>
                        )}
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-gray-900 mb-1">{player.full_name}</h3>
                          {player.position && <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium">{player.position}</span>}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div><p className="text-2xl font-bold text-gray-900">{player.matches_played}</p><p className="text-xs text-gray-600">Partidos</p></div>
                        <div><p className="text-2xl font-bold text-gray-900">{player.total_goals}</p><p className="text-xs text-gray-600">Goles</p></div>
                        <div><p className="text-2xl font-bold text-gray-900">{player.total_assists}</p><p className="text-xs text-gray-600">Asistencias</p></div>
                      </div>
                      <div className="mt-4 pt-4 border-t flex items-center justify-between">
                        {rating > 0 ? (
                          <div className="flex items-center gap-1"><Award className="h-4 w-4 text-yellow-500" /><span className="text-sm font-medium text-gray-900">{rating.toFixed(1)} / 5</span></div>
                        ) : (
                          <span />
                        )}
                        <span className="text-emerald-700 font-medium text-sm">Ver perfil →</span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}

            {shown < total && (
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-3 rounded-xl border-2 border-emerald-600 text-emerald-700 font-bold hover:bg-emerald-50 disabled:opacity-50"
                >
                  {loadingMore ? 'Cargando…' : 'Cargar más'}
                </button>
                <span className="text-xs text-gray-500">Mostrando {shown} de {total}</span>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};
