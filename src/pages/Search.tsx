import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { Championship } from '../types/database';
import { Search as SearchIcon, Trophy, MapPin, Calendar, Filter, User, Award } from 'lucide-react';

interface PlayerResult {
  id: string;
  full_name: string;
  position: string | null;
  photo_url: string | null;
  matches_played: number;
  total_goals: number;
  total_assists: number;
  avg_rating: number;
}

export const Search = () => {
  const [activeTab, setActiveTab] = useState<'championships' | 'players'>('championships');
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [players, setPlayers] = useState<PlayerResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sportFilter, setSportFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'championships') {
        const { data } = await supabase
          .from('championships')
          .select('*, admin:profiles!championships_admin_id_fkey(full_name)')
          .order('created_at', { ascending: false });

        if (data) setChampionships(data);
      } else {
        const { data } = await supabase
          .from('player_career_stats')
          .select('*')
          .order('total_goals', { ascending: false });

        if (data) setPlayers(data as any);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredChampionships = championships.filter((championship) => {
    const matchesSearch =
      championship.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      championship.venue.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSport = sportFilter === 'all' || championship.sport === sportFilter;
    const matchesStatus = statusFilter === 'all' || championship.status === statusFilter;

    return matchesSearch && matchesSport && matchesStatus;
  });

  const filteredPlayers = players.filter((player) => {
    const matchesSearch = player.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPosition = positionFilter === 'all' || player.position === positionFilter;

    return matchesSearch && matchesPosition;
  });

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Buscar</h1>
          <p className="text-gray-600 text-lg">Encuentra campeonatos y jugadores</p>
        </div>

        <div className="bg-white rounded-xl shadow-md">
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('championships')}
                className={`flex-1 px-6 py-4 font-medium transition-colors ${
                  activeTab === 'championships'
                    ? 'text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Trophy className="h-5 w-5 inline mr-2" />
                Campeonatos
              </button>
              <button
                onClick={() => setActiveTab('players')}
                className={`flex-1 px-6 py-4 font-medium transition-colors ${
                  activeTab === 'players'
                    ? 'text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <User className="h-5 w-5 inline mr-2" />
                Jugadores
              </button>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder={
                  activeTab === 'championships'
                    ? 'Buscar por nombre o recinto...'
                    : 'Buscar jugadores por nombre...'
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            {activeTab === 'championships' ? (
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Filter className="h-5 w-5 text-gray-400" />
                  <select
                    value={sportFilter}
                    onChange={(e) => setSportFilter(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="all">Todos los deportes</option>
                    <option value="futbol">Fútbol</option>
                    <option value="basketball">Basketball</option>
                    <option value="volleyball">Volleyball</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Filter className="h-5 w-5 text-gray-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="all">Todos los estados</option>
                    <option value="draft">Borrador</option>
                    <option value="active">Activo</option>
                    <option value="finished">Finalizado</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-gray-400" />
                <select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
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

        <div className="flex items-center justify-between">
          <p className="text-gray-600">
            {activeTab === 'championships'
              ? `${filteredChampionships.length} ${
                  filteredChampionships.length === 1 ? 'campeonato encontrado' : 'campeonatos encontrados'
                }`
              : `${filteredPlayers.length} ${filteredPlayers.length === 1 ? 'jugador encontrado' : 'jugadores encontrados'}`}
          </p>
        </div>

        {activeTab === 'championships' ? (
          filteredChampionships.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">No se encontraron campeonatos con estos criterios.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredChampionships.map((championship) => (
                <a
                  key={championship.id}
                  href={`/championship/${championship.id}`}
                  className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border border-gray-100 hover:border-emerald-200"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{championship.name}</h3>
                      <div className="flex gap-2">
                        <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium capitalize">
                          {championship.sport}
                        </span>
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-sm font-medium capitalize ${
                            championship.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : championship.status === 'draft'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {championship.status}
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
                        <span>{new Date(championship.start_date).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  {championship.description && (
                    <p className="mt-4 text-sm text-gray-600 line-clamp-2">{championship.description}</p>
                  )}

                  <div className="mt-4 pt-4 border-t">
                    <span className="text-emerald-600 font-medium text-sm">Ver detalles →</span>
                  </div>
                </a>
              ))}
            </div>
          )
        ) : filteredPlayers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <User className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No se encontraron jugadores con estos criterios.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlayers.map((player) => (
              <a
                key={player.id}
                href={`/player/${player.id}`}
                className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border border-gray-100 hover:border-emerald-200"
              >
                <div className="flex items-start gap-4 mb-4">
                  {player.photo_url ? (
                    <img
                      src={player.photo_url}
                      alt={player.full_name}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">{player.full_name}</h3>
                    {player.position && (
                      <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
                        {player.position}
                      </span>
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

                {player.avg_rating > 0 && (
                  <div className="mt-4 pt-4 border-t flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Award className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium text-gray-900">{player.avg_rating.toFixed(1)} / 5</span>
                    </div>
                    <span className="text-emerald-600 font-medium text-sm">Ver perfil →</span>
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};
