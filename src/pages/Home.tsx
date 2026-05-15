import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Championship, TopScorer } from '../types/database';
import { CreateTeamModal } from '../components/CreateTeamModal';
import { Trophy, TrendingUp, Users, Calendar, MapPin, Target, Plus, User, Star } from 'lucide-react';

interface PlayerProfile {
  id: string;
  full_name: string;
  position: string | null;
  photo_url: string | null;
  matches_played: number;
  total_goals: number;
  total_assists: number;
  avg_rating: string;
}

export const Home = () => {
  const { profile } = useAuth();
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [topScorers, setTopScorers] = useState<TopScorer[]>([]);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [selectedChampionship, setSelectedChampionship] = useState<Championship | null>(null);

  useEffect(() => {
    fetchData();
  }, [profile]);

  const fetchData = async () => {
    try {
      const { data: champData } = await supabase
        .from('championships')
        .select('*, admin:profiles!championships_admin_id_fkey(full_name)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(6);

      if (champData) setChampionships(champData);

      const { data: goalsData } = await supabase
        .from('match_events')
        .select(`
          player_id,
          team_id,
          additional_info,
          player_profiles:player_id (
            id,
            full_name
          ),
          teams:team_id (
            id,
            name
          )
        `)
        .eq('event_type', 'goal')
        .not('player_id', 'is', null);

      if (goalsData) {
        const scorersMap = new Map<string, TopScorer>();

        goalsData.forEach((goal: any) => {
          if (goal.player_profiles && goal.player_id) {
            const isOwnGoal = goal.additional_info?.type === 'own_goal';
            if (!isOwnGoal) {
              const existing = scorersMap.get(goal.player_id);
              if (existing) {
                existing.goals += 1;
              } else {
                scorersMap.set(goal.player_id, {
                  player_id: goal.player_id,
                  player_name: goal.player_profiles.full_name,
                  team_name: goal.teams?.name || 'Sin equipo',
                  goals: 1,
                  assists: 0,
                });
              }
            }
          }
        });

        const topScorersList = Array.from(scorersMap.values())
          .sort((a, b) => b.goals - a.goals)
          .slice(0, 5);

        setTopScorers(topScorersList);
      }

      if (profile) {
        const { data: profileData } = await supabase
          .from('player_career_stats')
          .select('*')
          .eq('id', profile.id)
          .maybeSingle();

        if (profileData) {
          setPlayerProfile(profileData);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = (championship: Championship) => {
    setSelectedChampionship(championship);
    setShowCreateTeamModal(true);
  };

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
      <div className="space-y-12">
        {profile && playerProfile && (
          <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-700 rounded-3xl shadow-2xl p-8">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDEzNGg3djFoLTd2LTF6bTE0IDBoN3YxaC03di0xem0xNCAwaDd2MWgtN3YtMXptMTQgMGg3djFoLTd2LTF6bTE0IDBoN3YxaC03di0xem0xNCAwaDd2MWgtN3YtMXptMTQgMGg3djFoLTd2LTF6bTE0IDBoN3YxaC03di0xem0xNCAwaDd2MWgtN3YtMXoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30"></div>
            <div className="relative flex flex-col md:flex-row gap-8 items-start md:items-center">
              <div className="flex-shrink-0">
                {playerProfile.photo_url ? (
                  <img
                    src={playerProfile.photo_url}
                    alt={playerProfile.full_name}
                    className="w-32 h-32 rounded-2xl object-cover border-4 border-white shadow-2xl ring-4 ring-emerald-400/50"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-2xl bg-white/20 flex items-center justify-center border-4 border-white shadow-2xl ring-4 ring-emerald-400/50">
                    <User className="h-16 w-16 text-white" />
                  </div>
                )}
              </div>

              <div className="flex-1">
                <h2 className="text-4xl font-black mb-2 text-white tracking-tight">{playerProfile.full_name}</h2>
                <p className="text-emerald-100 mb-6 font-semibold text-lg">
                  {playerProfile.position ? `${playerProfile.position} • ` : ''}
                  {profile.role === 'system_admin' ? 'Administrador del Sistema' :
                   profile.role === 'admin_de_campeonato' ? 'Administrador de Campeonato' : 'Jugador'}
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30">
                    <p className="text-3xl font-black text-white mb-1">{playerProfile.matches_played}</p>
                    <p className="text-sm text-emerald-100 font-semibold uppercase tracking-wide">Partidos</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30">
                    <p className="text-3xl font-black text-white mb-1">{playerProfile.total_goals}</p>
                    <p className="text-sm text-emerald-100 font-semibold uppercase tracking-wide">Goles</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30">
                    <p className="text-3xl font-black text-white mb-1">{playerProfile.total_assists}</p>
                    <p className="text-sm text-emerald-100 font-semibold uppercase tracking-wide">Asistencias</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30">
                    <div className="flex items-center gap-2 mb-1">
                      <Star className="h-6 w-6 text-yellow-300 fill-yellow-300" />
                      <p className="text-3xl font-black text-white">{parseFloat(playerProfile.avg_rating).toFixed(1)}</p>
                    </div>
                    <p className="text-sm text-emerald-100 font-semibold uppercase tracking-wide">Valoración</p>
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0">
                <a
                  href={`/player/${profile.id}`}
                  className="px-8 py-4 bg-white text-emerald-700 rounded-xl font-bold hover:bg-emerald-50 transition-all shadow-xl hover:shadow-2xl hover:scale-105 inline-block"
                >
                  Ver Perfil Completo
                </a>
              </div>
            </div>
          </section>
        )}

        {!profile && (
          <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-700 rounded-3xl shadow-2xl p-12 md:p-16">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE0NGg3djFoLTd2LTF6bTE0IDBoN3YxaC03di0xem0xNCAwaDd2MWgtN3YtMXptMTQgMGg3djFoLTd2LTF6bTE0IDBoN3YxaC03di0xem0xNCAwaDd2MWgtN3YtMXptMTQgMGg3djFoLTd2LTF6bTE0IDBoN3YxaC03di0xem0xNCAwaDd2MWgtN3YtMXoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20"></div>
            <div className="relative max-w-3xl">
              <div className="inline-block p-3 bg-white/20 backdrop-blur-sm rounded-2xl mb-6">
                <Trophy className="h-12 w-12 text-white" />
              </div>
              <h1 className="text-5xl md:text-6xl font-black mb-6 text-white tracking-tight leading-tight">
                Bienvenido a Mediogol
              </h1>
              <p className="text-xl md:text-2xl text-emerald-50 mb-10 leading-relaxed font-medium">
                La plataforma completa para gestionar tus campeonatos deportivos. Crea equipos, programa partidos y lleva estadísticas detalladas.
              </p>
              <div className="flex flex-wrap gap-4">
                <a
                  href="/search"
                  className="px-8 py-4 bg-white text-emerald-700 rounded-xl font-bold hover:bg-emerald-50 transition-all shadow-xl hover:shadow-2xl hover:scale-105"
                >
                  Explorar Campeonatos
                </a>
                <a
                  href="/register"
                  className="px-8 py-4 bg-emerald-800/80 backdrop-blur-sm text-white rounded-xl font-bold hover:bg-emerald-900/80 transition-all border-2 border-white/30 shadow-xl hover:shadow-2xl hover:scale-105"
                >
                  Crear Cuenta
                </a>
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 bg-emerald-100 rounded-xl">
              <Trophy className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-4xl font-black text-gray-900">Campeonatos Activos</h2>
          </div>

          {championships.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-xl p-16 text-center border border-gray-100">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trophy className="h-12 w-12 text-gray-400" />
              </div>
              <p className="text-gray-600 text-xl font-medium">No hay campeonatos activos en este momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {championships.map((championship) => (
                <div
                  key={championship.id}
                  className="group bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all p-6 border-2 border-gray-100 hover:border-emerald-300 transform hover:-translate-y-1"
                >
                  <div className="flex items-start gap-4 mb-4">
                    {championship.image_url && (
                      <img
                        src={championship.image_url}
                        alt={championship.name}
                        className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-200 shadow"
                      />
                    )}
                    <div className="flex-1">
                      <a href={`/championship/${championship.id}`}>
                        <h3 className="text-2xl font-black text-gray-900 mb-3 group-hover:text-emerald-600 transition-colors">
                          {championship.name}
                        </h3>
                      </a>
                      <span className="inline-block px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-full text-sm font-bold capitalize shadow-md">
                        {championship.sport}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm text-gray-700 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <MapPin className="h-4 w-4 text-gray-600" />
                      </div>
                      <span className="font-medium">{championship.venue}</span>
                    </div>
                    {championship.start_date && (
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 rounded-lg">
                          <Calendar className="h-4 w-4 text-gray-600" />
                        </div>
                        <span className="font-medium">{new Date(championship.start_date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                      </div>
                    )}
                    {championship.admin && (
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 rounded-lg">
                          <Users className="h-4 w-4 text-gray-600" />
                        </div>
                        <span className="font-medium">{championship.admin.full_name}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <a
                      href={`/championship/${championship.id}`}
                      className="flex-1 text-center px-5 py-3 text-emerald-600 font-bold text-sm hover:bg-emerald-50 rounded-xl transition-all border-2 border-emerald-600"
                    >
                      Ver detalles
                    </a>
                    {profile && (profile.role === 'system_admin' || championship.admin_id === profile.id) && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleCreateTeam(championship);
                        }}
                        className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all text-sm font-bold shadow-lg hover:shadow-xl"
                      >
                        <Plus className="h-4 w-4" />
                        Crear Equipo
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl shadow-xl p-8 border-t-4 border-yellow-500">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-yellow-100 rounded-xl">
                <Target className="h-8 w-8 text-yellow-600" />
              </div>
              <h2 className="text-3xl font-black text-gray-900">Top Goleadores</h2>
            </div>

            {topScorers.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Target className="h-10 w-10 text-gray-400" />
                </div>
                <p className="text-gray-600 font-medium">No hay estadísticas disponibles aún.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {topScorers.map((scorer, index) => (
                  <div key={scorer.player_id} className="group flex items-center gap-4 p-5 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl hover:from-emerald-50 hover:to-emerald-100 transition-all border-2 border-gray-200 hover:border-emerald-300">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-lg ${
                      index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-yellow-900' :
                      index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800' :
                      index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-500 text-orange-900' :
                      'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-700'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-gray-900 truncate text-lg group-hover:text-emerald-700 transition-colors">{scorer.player_name}</p>
                      <p className="text-sm text-gray-600 truncate font-semibold">{scorer.team_name}</p>
                    </div>
                    <div className="flex flex-col items-end">
                      <p className="text-3xl font-black text-emerald-600">{scorer.goals}</p>
                      <p className="text-xs text-gray-500 font-bold uppercase">goles</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl shadow-xl p-8 text-white">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                <TrendingUp className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-3xl font-black">Estadísticas Generales</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 text-center border border-white/30 hover:bg-white/30 transition-all">
                <Trophy className="h-12 w-12 text-white mx-auto mb-3 opacity-90" />
                <p className="text-4xl font-black mb-2">{championships.length}</p>
                <p className="text-sm text-blue-100 font-bold uppercase tracking-wide">Campeonatos Activos</p>
              </div>

              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 text-center border border-white/30 hover:bg-white/30 transition-all">
                <Users className="h-12 w-12 text-white mx-auto mb-3 opacity-90" />
                <p className="text-4xl font-black mb-2">{topScorers.length}</p>
                <p className="text-sm text-blue-100 font-bold uppercase tracking-wide">Jugadores Destacados</p>
              </div>

              <div className="bg-white/20 backdrop-blur-md rounded-2xl p-6 text-center col-span-2 border border-white/30 hover:bg-white/30 transition-all">
                <Target className="h-12 w-12 text-white mx-auto mb-3 opacity-90" />
                <p className="text-5xl font-black mb-2">
                  {topScorers.reduce((sum, scorer) => sum + scorer.goals, 0)}
                </p>
                <p className="text-sm text-blue-100 font-bold uppercase tracking-wide">Goles Totales</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {showCreateTeamModal && selectedChampionship && (
        <CreateTeamModal
          championship={selectedChampionship}
          onClose={() => {
            setShowCreateTeamModal(false);
            setSelectedChampionship(null);
          }}
          onSuccess={() => {
            setShowCreateTeamModal(false);
            setSelectedChampionship(null);
            window.location.href = '/my-teams';
          }}
        />
      )}
    </Layout>
  );
};
