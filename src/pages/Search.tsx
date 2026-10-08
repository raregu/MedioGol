import { useState, useEffect, useMemo } from 'react';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Championship, League } from '../types/database';
import { formatDateOnly, normalizeText } from '../utils/dates';
import { Search as SearchIcon, Trophy, MapPin, Calendar, Filter, User, Award, Layers, Users, X } from 'lucide-react';

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

export const Search = () => {
  const { profile } = useAuth();
  const initialQuery = new URLSearchParams(window.location.search).get('q') || '';
  const [activeTab, setActiveTab] = useState<'championships' | 'players'>('championships');
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [teamsByChampionship, setTeamsByChampionship] = useState<Map<string, string[]>>(new Map());
  const [players, setPlayers] = useState<PlayerResult[]>([]);
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [sportFilter, setSportFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [loadingChamps, setLoadingChamps] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playersLoaded, setPlayersLoaded] = useState(false);

  const isSystemAdmin = profile?.role === 'admin_sistema';

  useEffect(() => {
    const load = async () => {
      setLoadingChamps(true);
      try {
        const [{ data: champs }, { data: leagueData }, { data: teams }] = await Promise.all([
          supabase
            .from('championships')
            .select('*, admin:profiles!championships_admin_id_fkey(full_name)')
            .order('created_at', { ascending: false }),
          supabase.from('leagues').select('*').order('name'),
          supabase.from('teams').select('championship_id, name'),
        ]);
        setChampionships((champs || []) as Championship[]);
        setLeagues((leagueData || []) as League[]);
        const map = new Map<string, string[]>();
        ((teams || []) as { championship_id: string; name: string }[]).forEach((t) => {
          const list = map.get(t.championship_id) || [];
          list.push(t.name.trim());
          map.set(t.championship_id, list);
        });
        setTeamsByChampionship(map);
      } catch (error) {
        console.error('Error fetching championships:', error);
      } finally {
        setLoadingChamps(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (activeTab !== 'players' || playersLoaded) return;
    const load = async () => {
      setLoadingPlayers(true);
      try {
        const { data } = await supabase.from('player_career_stats').select('*').order('total_goals', { ascending: false });
        setPlayers((data || []) as PlayerResult[]);
        setPlayersLoaded(true);
      } catch (error) {
        console.error('Error fetching players:', error);
      } finally {
        setLoadingPlayers(false);
      }
    };
    load();
  }, [activeTab, playersLoaded]);

  // Mantener ?q= en la URL para poder compartir la búsqueda
  useEffect(() => {
    const url = new URL(window.location.href);
    if (searchTerm) url.searchParams.set('q', searchTerm);
    else url.searchParams.delete('q');
    window.history.replaceState({}, '', url.toString());
  }, [searchTerm]);

  const leagueById = useMemo(() => new Map(leagues.map((l) => [l.id, l])), [leagues]);

  // Los borradores solo los ve su administrador o un admin del sistema
  const visibleChampionships = useMemo(
    () => championships.filter((c) => c.status !== 'draft' || isSystemAdmin || (profile && c.admin_id === profile.id)),
    [championships, isSystemAdmin, profile]
  );
  const visibleLeagues = useMemo(
    () => leagues.filter((l) => l.status !== 'draft' || isSystemAdmin || (profile && l.admin_id === profile.id)),
    [leagues, isSystemAdmin, profile]
  );

  const sports = useMemo(() => {
    const map = new Map<string, string>();
    visibleChampionships.forEach((c) => {
      const key = normalizeText(c.sport);
      if (key && !map.has(key)) map.set(key, c.sport);
    });
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleChampionships]);

  const q = normalizeText(searchTerm);
  const words = q.split(/\s+/).filter(Boolean);

  const filteredChampionships = useMemo(() => {
    const statusOrder: Record<string, number> = { active: 0, draft: 1, finished: 2 };
    return visibleChampionships
      .filter((c) => {
        const league = c.league_id ? leagueById.get(c.league_id) : undefined;
        if (sportFilter !== 'all' && normalizeText(c.sport) !== sportFilter) return false;
        if (statusFilter !== 'all' && c.status !== statusFilter) return false;
        if (leagueFilter === 'none' && c.league_id) return false;
        if (leagueFilter !== 'all' && leagueFilter !== 'none' && c.league_id !== leagueFilter) return false;
        if (!words.length) return true;
        const haystack = normalizeText(
          [c.name, c.venue, c.location, c.description, c.series_name, league?.name, ...(teamsByChampionship.get(c.id) || [])].join(' ')
        );
        return words.every((w) => haystack.includes(w));
      })
      .sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || b.created_at.localeCompare(a.created_at));
  }, [visibleChampionships, leagueById, sportFilter, statusFilter, leagueFilter, words, teamsByChampionship]);

  const matchingLeagues = useMemo(() => {
    if (leagueFilter === 'none') return [];
    return visibleLeagues.filter((l) => {
      if (leagueFilter !== 'all' && l.id !== leagueFilter) return false;
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (!words.length) return true;
      const series = visibleChampionships.filter((c) => c.league_id === l.id);
      const haystack = normalizeText(
        [l.name, l.season, l.location, ...series.map((s) => s.series_name || s.name), ...series.flatMap((s) => teamsByChampionship.get(s.id) || [])].join(' ')
      );
      return words.every((w) => haystack.includes(w));
    });
  }, [visibleLeagues, visibleChampionships, leagueFilter, statusFilter, words, teamsByChampionship]);

  const filteredPlayers = players.filter((player) => {
    const matchesSearch = !words.length || words.every((w) => normalizeText(player.full_name).includes(w));
    const matchesPosition = positionFilter === 'all' || player.position === positionFilter;
    return matchesSearch && matchesPosition;
  });

  const matchedTeam = (c: Championship) => {
    if (!words.length) return null;
    const own = normalizeText([c.name, c.venue, c.location, c.description, c.series_name].join(' '));
    if (words.every((w) => own.includes(w))) return null;
    return (teamsByChampionship.get(c.id) || []).find((t) => words.some((w) => normalizeText(t).includes(w))) || null;
  };

  const hasFilters = !!searchTerm || sportFilter !== 'all' || statusFilter !== 'all' || leagueFilter !== 'all' || positionFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setSportFilter('all');
    setStatusFilter('all');
    setLeagueFilter('all');
    setPositionFilter('all');
  };

  const loading = activeTab === 'championships' ? loadingChamps : loadingPlayers;
  const selectClass = 'flex-1 min-w-0 px-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent';

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
                placeholder={
                  activeTab === 'championships'
                    ? 'Nombre, liga, serie, recinto o equipo…'
                    : 'Buscar jugadores por nombre…'
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {activeTab === 'championships' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <select aria-label="Deporte" value={sportFilter} onChange={(e) => setSportFilter(e.target.value)} className={selectClass}>
                    <option value="all">Todos los deportes</option>
                    {sports.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <select aria-label="Estado" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
                    <option value="all">Todos los estados</option>
                    <option value="active">Activo</option>
                    {(isSystemAdmin || visibleChampionships.some((c) => c.status === 'draft')) && <option value="draft">Borrador</option>}
                    <option value="finished">Finalizado</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <select aria-label="Liga" value={leagueFilter} onChange={(e) => setLeagueFilter(e.target.value)} className={selectClass}>
                    <option value="all">Todas las ligas</option>
                    {visibleLeagues.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}{l.season ? ` ${l.season}` : ''}</option>
                    ))}
                    <option value="none">Campeonatos sin liga</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-gray-400" />
                <select aria-label="Posición" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} className={selectClass}>
                  <option value="all">Todas las posiciones</option>
                  <option value="Portero">Portero</option>
                  <option value="Defensa Central">Defensa Central</option>
                  <option value="Lateral Derecho">Lateral Derecho</option>
                  <option value="Lateral Izquierdo">Lateral Izquierdo</option>
                  <option value="Mediocampista Defensivo">Mediocampista Defensivo</option>
                  <option value="Mediocampista Central">Mediocampista Central</option>
                  <option value="Mediocampista Ofensivo">Mediocampista Ofensivo</option>
                  <option value="Extremo Derecho">Extremo Derecho</option>
                  <option value="Extremo Izquierdo">Extremo Izquierdo</option>
                  <option value="Delantero Centro">Delantero Centro</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[30vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-gray-700" aria-live="polite">
                {activeTab === 'championships'
                  ? `${matchingLeagues.length ? `${matchingLeagues.length} ${matchingLeagues.length === 1 ? 'liga' : 'ligas'} · ` : ''}${filteredChampionships.length} ${
                      filteredChampionships.length === 1 ? 'campeonato encontrado' : 'campeonatos encontrados'
                    }`
                  : `${filteredPlayers.length} ${filteredPlayers.length === 1 ? 'jugador encontrado' : 'jugadores encontrados'}`}
              </p>
              {hasFilters && (
                <button onClick={clearFilters} className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
                  <X className="h-4 w-4" /> Limpiar filtros
                </button>
              )}
            </div>

            {activeTab === 'championships' ? (
              <>
                {matchingLeagues.length > 0 && (
                  <section aria-label="Ligas" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {matchingLeagues.map((l) => {
                      const series = visibleChampionships.filter((c) => c.league_id === l.id).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
                      return (
                        <a key={l.id} href={`/league/${l.id}`} className="bg-emerald-950 text-white rounded-xl shadow-md hover:shadow-xl transition-all p-5 flex gap-4 items-start">
                          {l.logo_url ? (
                            <img src={l.logo_url} alt="" className="h-14 w-14 rounded-full object-cover border-[3px] border-amber-400 bg-white flex-shrink-0" />
                          ) : (
                            <span className="h-14 w-14 rounded-full bg-white text-emerald-900 flex items-center justify-center border-[3px] border-amber-400 flex-shrink-0">
                              <Layers className="h-6 w-6" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-300">Liga · {series.length} series</p>
                            <h3 className="text-lg font-black leading-tight">{l.name}{l.season ? ` ${l.season}` : ''}</h3>
                            {l.location && <p className="text-sm text-emerald-100 flex items-center gap-1 mt-1"><MapPin className="h-3.5 w-3.5" />{l.location}</p>}
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {series.map((s) => (
                                <span key={s.id} className="px-2.5 py-1 rounded-full bg-white/10 text-xs font-semibold">{s.series_name || s.name}</span>
                              ))}
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </section>
                )}

                {filteredChampionships.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-md p-12 text-center">
                    <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 text-lg">No se encontraron campeonatos con estos criterios.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredChampionships.map((championship) => {
                      const league = championship.league_id ? leagueById.get(championship.league_id) : undefined;
                      const team = matchedTeam(championship);
                      return (
                        <a
                          key={championship.id}
                          href={`/championship/${championship.id}`}
                          className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border border-gray-100 hover:border-emerald-200 flex flex-col"
                        >
                          {league && (
                            <span className="self-start mb-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950 text-white text-xs font-bold">
                              <Layers className="h-3.5 w-3.5" />
                              {league.name}{championship.series_name ? ` · ${championship.series_name}` : ''}
                            </span>
                          )}
                          <div className="flex items-start gap-3 mb-4">
                            {championship.image_url && (
                              <img src={championship.image_url} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-gray-200 shadow-sm" />
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="text-xl font-bold text-gray-900 mb-2">{championship.name}</h3>
                              <div className="flex flex-wrap gap-2">
                                <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium">{championship.sport}</span>
                                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${STATUS_CLASS[championship.status] || STATUS_CLASS.finished}`}>
                                  {STATUS_LABEL[championship.status] || championship.status}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-gray-400" />
                              <span>{championship.venue}</span>
                            </div>
                            {championship.start_date && (
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                <span>{formatDateOnly(championship.start_date)}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-gray-400" />
                              <span>{(teamsByChampionship.get(championship.id) || []).length} equipos</span>
                            </div>
                            {team && (
                              <p className="text-emerald-800 bg-emerald-50 rounded-lg px-3 py-1.5 font-medium">Equipo: {team}</p>
                            )}
                          </div>

                          {championship.description && <p className="mt-4 text-sm text-gray-600 line-clamp-2">{championship.description}</p>}

                          <div className="mt-auto pt-4">
                            <div className="pt-4 border-t">
                              <span className="text-emerald-700 font-medium text-sm">Ver detalles →</span>
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}
              </>
            ) : filteredPlayers.length === 0 ? (
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <User className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">No se encontraron jugadores con estos criterios.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPlayers.map((player) => {
                  const rating = Number(player.avg_rating) || 0;
                  return (
                    <a
                      key={player.id}
                      href={`/player/${player.id}`}
                      className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border border-gray-100 hover:border-emerald-200"
                    >
                      <div className="flex items-start gap-4 mb-4">
                        {player.photo_url ? (
                          <img src={player.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                            <User className="h-8 w-8 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-gray-900 mb-1">{player.full_name}</h3>
                          {player.position && (
                            <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-medium">{player.position}</span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{player.matches_played}</p>
                          <p className="text-xs text-gray-600">Partidos</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{player.total_goals}</p>
                          <p className="text-xs text-gray-600">Goles</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{player.total_assists}</p>
                          <p className="text-xs text-gray-600">Asistencias</p>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t flex items-center justify-between">
                        {rating > 0 ? (
                          <div className="flex items-center gap-1">
                            <Award className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm font-medium text-gray-900">{rating.toFixed(1)} / 5</span>
                          </div>
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
          </>
        )}
      </div>
    </Layout>
  );
};
