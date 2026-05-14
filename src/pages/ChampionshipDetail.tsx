import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { supabase } from '../lib/supabase';
import { Championship, Match, Team, TeamStanding, PlayoffConfig, PlayoffMatch, Advertisement, Sponsor } from '../types/database';
import { Trophy, Calendar, MapPin, Users, Target, AlertCircle, Phone, FileText, CreditCard as Edit, Shield, Award, AlertTriangle, Eye, Trash2, Zap, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MatchDetailsModal } from '../components/admin/MatchDetailsModal';
import { CreateMatchModal } from '../components/admin/CreateMatchModal';
import { SanctionsManagementModal } from '../components/admin/SanctionsManagementModal';
import { MatchEventsModal } from '../components/MatchEventsModal';
import { TeamPlayersModal } from '../components/TeamPlayersModal';
import PlayoffBracket from '../components/PlayoffBracket';
import PlayoffConfigModal from '../components/admin/PlayoffConfigModal';
import PlayoffMatchModal from '../components/admin/PlayoffMatchModal';
import { createPlayoffMatches } from '../utils/playoffBracketGenerator';
import { AdsAndSponsorsCarousel } from '../components/AdsAndSponsorsCarousel';
import { SponsorsManagementModal } from '../components/admin/SponsorsManagementModal';

interface TopScorer {
  player_id: string;
  player_name: string;
  team_name: string;
  total_goals: number;
}

interface Sanction {
  id: string;
  type: string;
  reason: string;
  rounds_suspended: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  player_profiles: {
    id: string;
    full_name: string;
  } | null;
  matches: {
    id: string;
    home_team: { name: string };
    away_team: { name: string };
    match_date: string;
  } | null;
}

export const ChampionshipDetail = () => {
  const { profile } = useAuth();
  const [championship, setChampionship] = useState<Championship | null>(null);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [topScorers, setTopScorers] = useState<TopScorer[]>([]);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'standings' | 'matches' | 'teams' | 'scorers' | 'sanctions' | 'playoffs'>('standings');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showMatchDetailsModal, setShowMatchDetailsModal] = useState(false);
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [showSanctionsModal, setShowSanctionsModal] = useState(false);
  const [showMatchEventsModal, setShowMatchEventsModal] = useState(false);
  const [showTeamPlayersModal, setShowTeamPlayersModal] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [playoffConfig, setPlayoffConfig] = useState<PlayoffConfig | null>(null);
  const [showPlayoffConfigModal, setShowPlayoffConfigModal] = useState(false);
  const [selectedPlayoffMatch, setSelectedPlayoffMatch] = useState<PlayoffMatch | null>(null);
  const [showPlayoffMatchModal, setShowPlayoffMatchModal] = useState(false);
  const [generatingPlayoffs, setGeneratingPlayoffs] = useState(false);
  const [advertisements, setAdvertisements] = useState<Advertisement[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [showSponsorsModal, setShowSponsorsModal] = useState(false);

  const championshipId = window.location.pathname.split('/').pop();
  const isAdmin = profile && (profile.role === 'system_admin' || championship?.admin_id === profile.id);

  useEffect(() => {
    if (championshipId) {
      fetchChampionshipData();
      fetchTopScorers();
      fetchSanctions();
      fetchPlayoffConfig();
      fetchAdvertisements();
      fetchSponsors();
    }
  }, [championshipId]);

  const fetchChampionshipData = async () => {
    try {
      const { data: champData } = await supabase
        .from('championships')
        .select(`
          *,
          admin:profiles!championships_admin_id_fkey(full_name),
          champion:base_teams!championships_champion_team_id_fkey(id, name, logo_url),
          runner_up:base_teams!championships_runner_up_team_id_fkey(id, name, logo_url),
          third_place:base_teams!championships_third_place_team_id_fkey(id, name, logo_url)
        `)
        .eq('id', championshipId)
        .maybeSingle();

      if (champData) setChampionship(champData);

      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*, captain:profiles(id, full_name), base_team:base_teams(logo_url)')
        .eq('championship_id', championshipId);

      if (teamsError) {
        console.error('Error fetching teams:', teamsError);
      }

      // Obtener los capitanes de las inscripciones
      if (teamsData) {
        const { data: registrations } = await supabase
          .from('team_registrations')
          .select('base_team_id, captain_id, captain:profiles!team_registrations_captain_id_fkey(id, full_name)')
          .eq('championship_id', championshipId);

        // Agregar la información del capitán a cada equipo
        const teamsWithCaptains = teamsData.map(team => ({
          ...team,
          registration_captain: registrations?.find(r => r.base_team_id === team.base_team_id)
        }));

        setTeams(teamsWithCaptains);
      }

      const { data: matchesData } = await supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(name, logo_url, base_team:base_teams(logo_url)), away_team:teams!matches_away_team_id_fkey(name, logo_url, base_team:base_teams(logo_url)), sports_complex:sports_complexes(id, name, address, location_url)')
        .eq('championship_id', championshipId)
        .order('match_date', { ascending: false });

      if (matchesData) setMatches(matchesData);

      if (teamsData && matchesData) {
        calculateStandings(teamsData, matchesData);
      }
    } catch (error) {
      console.error('Error fetching championship data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStandings = (teamsData: Team[], matchesData: Match[]) => {
    const standingsMap = new Map<string, TeamStanding>();

    teamsData.forEach((team) => {
      standingsMap.set(team.id, {
        team_id: team.id,
        team_name: team.name,
        team_logo_url: (team as any).base_team?.logo_url || null,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0,
        points: 0,
      });
    });

    matchesData.forEach((match) => {
      if (match.status === 'finished' || match.status === 'completed') {
        const homeStanding = standingsMap.get(match.home_team_id);
        const awayStanding = standingsMap.get(match.away_team_id);

        if (homeStanding && awayStanding) {
          homeStanding.played++;
          awayStanding.played++;

          homeStanding.goals_for += match.home_score || 0;
          homeStanding.goals_against += match.away_score || 0;
          awayStanding.goals_for += match.away_score || 0;
          awayStanding.goals_against += match.home_score || 0;

          if ((match.home_score || 0) > (match.away_score || 0)) {
            homeStanding.won++;
            homeStanding.points += 3;
            awayStanding.lost++;
          } else if ((match.home_score || 0) < (match.away_score || 0)) {
            awayStanding.won++;
            awayStanding.points += 3;
            homeStanding.lost++;
          } else {
            homeStanding.drawn++;
            awayStanding.drawn++;
            homeStanding.points += 1;
            awayStanding.points += 1;
          }

          homeStanding.goal_difference = homeStanding.goals_for - homeStanding.goals_against;
          awayStanding.goal_difference = awayStanding.goals_for - awayStanding.goals_against;
        }
      }
    });

    const standingsList = Array.from(standingsMap.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_for - a.goals_for;
    });

    setStandings(standingsList);
  };

  const fetchTopScorers = async () => {
    try {
      console.log('Fetching top scorers for championship:', championshipId);

      const { data: matchIds } = await supabase
        .from('matches')
        .select('id')
        .eq('championship_id', championshipId);

      console.log('Match IDs found:', matchIds);

      if (!matchIds || matchIds.length === 0) {
        console.log('No matches found for this championship');
        return;
      }

      const { data: goalsData, error } = await supabase
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
        .in('match_id', matchIds.map(m => m.id))
        .eq('event_type', 'goal')
        .not('player_id', 'is', null);

      console.log('Goals data retrieved:', goalsData);
      console.log('Goals query error:', error);

      if (error) {
        console.error('Error fetching goals:', error);
        return;
      }

      if (goalsData) {
        const scorersMap = new Map<string, TopScorer>();

        goalsData.forEach((goal: any) => {
          console.log('Processing goal:', goal);
          if (goal.player_profiles && goal.player_id) {
            const isOwnGoal = goal.additional_info?.type === 'own_goal';
            console.log('Is own goal?', isOwnGoal);
            if (!isOwnGoal) {
              const existing = scorersMap.get(goal.player_id) || {
                player_id: goal.player_id,
                player_name: goal.player_profiles.full_name,
                team_name: goal.teams?.name || 'Sin equipo',
                total_goals: 0,
              };
              existing.total_goals += 1;
              scorersMap.set(goal.player_id, existing);
            }
          }
        });

        const sorted = Array.from(scorersMap.values())
          .sort((a, b) => b.total_goals - a.total_goals)
          .slice(0, 10);

        console.log('Final top scorers:', sorted);
        setTopScorers(sorted);
      }
    } catch (error) {
      console.error('Error fetching top scorers:', error);
    }
  };

  const fetchSanctions = async () => {
    try {
      const { data, error } = await supabase
        .from('sanctions')
        .select(`
          id,
          type,
          reason,
          rounds_suspended,
          start_date,
          end_date,
          created_at,
          player_profiles:player_id (
            id,
            full_name
          ),
          matches:match_id (
            id,
            match_date,
            home_team:teams!matches_home_team_id_fkey(name),
            away_team:teams!matches_away_team_id_fkey(name)
          )
        `)
        .eq('championship_id', championshipId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching sanctions:', error);
        return;
      }

      if (data) {
        setSanctions(data as any);
      }
    } catch (error) {
      console.error('Error fetching sanctions:', error);
    }
  };

  const fetchPlayoffConfig = async () => {
    try {
      const { data } = await supabase
        .from('playoff_config')
        .select('*')
        .eq('championship_id', championshipId)
        .maybeSingle();

      if (data) {
        setPlayoffConfig(data);
      }
    } catch (error) {
      console.error('Error fetching playoff config:', error);
    }
  };

  const fetchAdvertisements = async () => {
    try {
      const { data, error } = await supabase
        .from('advertisements')
        .select('*')
        .eq('is_active', true)
        .or(`championship_id.is.null,championship_id.eq.${championshipId}`)
        .order('display_order', { ascending: true });

      if (error) throw error;
      if (data) {
        setAdvertisements(data);
      }
    } catch (error) {
      console.error('Error fetching advertisements:', error);
    }
  };

  const fetchSponsors = async () => {
    try {
      const { data, error } = await supabase
        .from('sponsors')
        .select('*')
        .eq('championship_id', championshipId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      if (data) {
        setSponsors(data);
      }
    } catch (error) {
      console.error('Error fetching sponsors:', error);
    }
  };

  const handleGeneratePlayoffs = async () => {
    if (!playoffConfig) {
      alert('Primero debes configurar los playoffs');
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas generar el bracket de playoffs? Se crearán las llaves con los mejores ${playoffConfig.teams_qualify} equipos de la tabla.`)) {
      return;
    }

    setGeneratingPlayoffs(true);
    try {
      await createPlayoffMatches(championshipId!, playoffConfig);
      alert('Bracket de playoffs generado exitosamente');
      await fetchChampionshipData();
      setActiveTab('playoffs');
    } catch (error: any) {
      console.error('Error generating playoffs:', error);
      alert('Error al generar los playoffs: ' + error.message);
    } finally {
      setGeneratingPlayoffs(false);
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este partido? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('matches')
        .delete()
        .eq('id', matchId);

      if (error) {
        console.error('Error deleting match:', error);
        alert('Error al eliminar el partido: ' + error.message);
        return;
      }

      alert('Partido eliminado exitosamente');
      await fetchChampionshipData();
    } catch (error) {
      console.error('Error deleting match:', error);
      alert('Error al eliminar el partido');
    }
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar el equipo "${teamName}" del campeonato? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId);

      if (error) {
        console.error('Error deleting team:', error);
        alert('Error al eliminar el equipo. Por favor intenta de nuevo.');
        return;
      }

      alert('Equipo eliminado exitosamente');
      fetchChampionshipData();
    } catch (error) {
      console.error('Error deleting team:', error);
      alert('Error al eliminar el equipo. Por favor intenta de nuevo.');
    }
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

  if (!championship) {
    return (
      <Layout>
        <div className="bg-white rounded-xl shadow-md p-12 text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Campeonato no encontrado</h2>
          <p className="text-gray-600">El campeonato que buscas no existe o ha sido eliminado.</p>
          <a href="/search" className="mt-4 inline-block px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
            Buscar Campeonatos
          </a>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {(advertisements.length > 0 || sponsors.length > 0) && (
          <div>
            <AdsAndSponsorsCarousel advertisements={advertisements} sponsors={sponsors} />
          </div>
        )}

        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl shadow-lg overflow-hidden">
          <div className="p-4 text-white">
            <div className="flex items-center gap-3 mb-3">
              <Trophy className="h-8 w-8 flex-shrink-0" />
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{championship.name}</h1>
                <span className="inline-block px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium capitalize mt-1">
                  {championship.sport}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-emerald-50">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                <span className="truncate">{championship.venue}</span>
              </div>
              {championship.start_date && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  <span>{new Date(championship.start_date).toLocaleDateString()}</span>
                </div>
              )}
              {championship.contact_phone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="h-4 w-4" />
                  <a href={`tel:${championship.contact_phone}`} className="hover:text-white transition-colors truncate">
                    {championship.contact_phone}
                  </a>
                </div>
              )}
              {championship.rules_pdf_url && (
                <div className="flex items-center gap-1.5 col-span-2 md:col-span-1">
                  <FileText className="h-4 w-4" />
                  <a
                    href={championship.rules_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors underline truncate"
                  >
                    Ver Bases
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowSanctionsModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
              >
                <Shield className="h-4 w-4" />
                Gestionar Sanciones
              </button>
              <button
                onClick={() => setShowPlayoffConfigModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium text-sm"
              >
                <Zap className="h-4 w-4" />
                Configurar Playoffs
              </button>
              {playoffConfig && championship?.phase === 'regular' && (
                <button
                  onClick={handleGeneratePlayoffs}
                  disabled={generatingPlayoffs}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm disabled:opacity-50"
                >
                  <Trophy className="h-4 w-4" />
                  {generatingPlayoffs ? 'Generando...' : 'Generar Playoffs'}
                </button>
              )}
              <button
                onClick={() => setShowSponsorsModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                <Award className="h-4 w-4" />
                Gestionar Sponsors
              </button>
              <a
                href="/admin"
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium text-sm"
              >
                <Edit className="h-4 w-4" />
                Panel Admin
              </a>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md">
          <div className="border-b overflow-x-auto">
            <div className="flex min-w-max">
              <button
                onClick={() => setActiveTab('standings')}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'standings'
                    ? 'text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Posiciones
              </button>
              <button
                onClick={() => setActiveTab('matches')}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'matches'
                    ? 'text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Partidos
              </button>
              <button
                onClick={() => setActiveTab('teams')}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'teams'
                    ? 'text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Equipos
              </button>
              <button
                onClick={() => setActiveTab('scorers')}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'scorers'
                    ? 'text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Goleadores
              </button>
              <button
                onClick={() => setActiveTab('sanctions')}
                className={`px-4 sm:px-6 py-3 sm:py-4 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                  activeTab === 'sanctions'
                    ? 'text-emerald-600 border-b-2 border-emerald-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Sanciones
              </button>
              {(championship?.phase === 'playoffs' || championship?.phase === 'finished') && (
                <button
                  onClick={() => setActiveTab('playoffs')}
                  className={`px-4 sm:px-6 py-3 sm:py-4 font-medium transition-colors whitespace-nowrap text-sm sm:text-base ${
                    activeTab === 'playoffs'
                      ? 'text-emerald-600 border-b-2 border-emerald-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Playoffs
                </button>
              )}
            </div>
          </div>

          <div className="p-3 sm:p-6">
            {activeTab === 'standings' && (
              <div>
                {standings.length === 0 ? (
                  <p className="text-center text-gray-600 py-8">No hay datos disponibles aún.</p>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Pos</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Equipo</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">PJ</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">G</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">E</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">P</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">GF</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">GC</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">DG</th>
                            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {standings.map((standing, index) => (
                            <tr key={standing.team_id} className="border-t hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{index + 1}</td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                <div className="flex items-center gap-3">
                                  {standing.team_logo_url ? (
                                    <img
                                      src={standing.team_logo_url}
                                      alt={standing.team_name}
                                      className="w-8 h-8 object-contain rounded"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center">
                                      <Users className="h-4 w-4 text-gray-500" />
                                    </div>
                                  )}
                                  <span>{standing.team_name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-center text-gray-600">{standing.played}</td>
                              <td className="px-4 py-3 text-sm text-center text-gray-600">{standing.won}</td>
                              <td className="px-4 py-3 text-sm text-center text-gray-600">{standing.drawn}</td>
                              <td className="px-4 py-3 text-sm text-center text-gray-600">{standing.lost}</td>
                              <td className="px-4 py-3 text-sm text-center text-gray-600">{standing.goals_for}</td>
                              <td className="px-4 py-3 text-sm text-center text-gray-600">{standing.goals_against}</td>
                              <td className="px-4 py-3 text-sm text-center text-gray-600">{standing.goal_difference}</td>
                              <td className="px-4 py-3 text-sm text-center font-bold text-emerald-600">{standing.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                      {standings.map((standing, index) => (
                        <div key={standing.team_id} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex items-center justify-center w-8 h-8 bg-emerald-600 text-white rounded-full font-bold text-sm">
                              {index + 1}
                            </div>
                            {standing.team_logo_url ? (
                              <img
                                src={standing.team_logo_url}
                                alt={standing.team_name}
                                className="w-10 h-10 object-contain rounded"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                                <Users className="h-5 w-5 text-gray-500" />
                              </div>
                            )}
                            <span className="font-semibold text-gray-900 flex-1">{standing.team_name}</span>
                            <span className="text-2xl font-bold text-emerald-600">{standing.points}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center text-sm">
                            <div>
                              <div className="text-gray-500 text-xs">PJ</div>
                              <div className="font-semibold text-gray-900">{standing.played}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 text-xs">G-E-P</div>
                              <div className="font-semibold text-gray-900">{standing.won}-{standing.drawn}-{standing.lost}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 text-xs">GF-GC</div>
                              <div className="font-semibold text-gray-900">{standing.goals_for}-{standing.goals_against}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 text-xs">DG</div>
                              <div className="font-semibold text-gray-900">{standing.goal_difference > 0 ? '+' : ''}{standing.goal_difference}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'matches' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-6">
                  <div className="flex items-center gap-2 sm:gap-4">
                    <label className="text-sm font-medium text-gray-700">Filtrar:</label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  >
                    <option value="all">Todos</option>
                    <option value="upcoming">Próximos</option>
                    <option value="finished">Finalizados</option>
                    <option value="today">Hoy</option>
                    <option value="week">Esta semana</option>
                    <option value="month">Este mes</option>
                  </select>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => setShowCreateMatch(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                    >
                      <Plus className="h-4 w-4" />
                      Crear Partido
                    </button>
                  )}
                </div>
                {(() => {
                  const now = new Date();
                  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
                  const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay()), 23, 59, 59);
                  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

                  const filteredMatches = matches.filter((match) => {
                    const matchDate = new Date(match.match_date);

                    switch (dateFilter) {
                      case 'upcoming':
                        return match.status === 'scheduled' || match.status === 'playing';
                      case 'finished':
                        return match.status === 'finished' || match.status === 'completed';
                      case 'today':
                        return matchDate >= startOfDay && matchDate <= endOfDay;
                      case 'week':
                        return matchDate >= startOfWeek && matchDate <= endOfWeek;
                      case 'month':
                        return matchDate >= startOfMonth && matchDate <= endOfMonth;
                      default:
                        return true;
                    }
                  });

                  return filteredMatches.length === 0 ? (
                    <p className="text-center text-gray-600 py-8">No hay partidos en este filtro.</p>
                  ) : (
                    filteredMatches.map((match) => {
                    const homeTeamLogo = (match as any).home_team?.base_team?.logo_url || (match as any).home_team?.logo_url;
                    const awayTeamLogo = (match as any).away_team?.base_team?.logo_url || (match as any).away_team?.logo_url;

                    return (
                    <div key={match.id} className="bg-gray-50 rounded-lg p-3 sm:p-4 hover:bg-gray-100 transition-colors">
                      {/* Desktop Layout */}
                      <div className="hidden md:flex items-center justify-between gap-4">
                        <div className="flex-1 flex items-center justify-end gap-3">
                          <p className="font-semibold text-gray-900">{match.home_team?.name}</p>
                          {homeTeamLogo ? (
                            <img
                              src={homeTeamLogo}
                              alt={match.home_team?.name}
                              className="w-10 h-10 object-contain rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                              <Users className="h-5 w-5 text-gray-500" />
                            </div>
                          )}
                        </div>
                        <div className="px-6 text-center">
                          {match.status === 'finished' || match.status === 'completed' ? (
                            <div className="flex items-center gap-3">
                              <span className="text-2xl font-bold text-gray-900">{match.home_score}</span>
                              <span className="text-gray-500">-</span>
                              <span className="text-2xl font-bold text-gray-900">{match.away_score}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500 px-4 py-1 bg-white rounded-full capitalize">
                              {match.status}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 flex items-center gap-3">
                          {awayTeamLogo ? (
                            <img
                              src={awayTeamLogo}
                              alt={match.away_team?.name}
                              className="w-10 h-10 object-contain rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                              <Users className="h-5 w-5 text-gray-500" />
                            </div>
                          )}
                          <p className="font-semibold text-gray-900">{match.away_team?.name}</p>
                        </div>
                        <div className="flex gap-2">
                          {isAdmin && (
                            <button
                              onClick={() => {
                                setSelectedMatch(match);
                                setShowMatchDetailsModal(true);
                              }}
                              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                            >
                              <Edit className="h-4 w-4" />
                              {match.status === 'finished' || match.status === 'completed' ? 'Editar Detalles' : 'Registrar Detalles'}
                            </button>
                          )}
                          {(match.status === 'finished' || match.status === 'completed' || match.status === 'playing') && (
                            <button
                              onClick={() => {
                                setSelectedMatch(match);
                                setShowMatchEventsModal(true);
                              }}
                              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                            >
                              <Target className="h-4 w-4" />
                              Ver Detalles
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteMatch(match.id)}
                              className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                            >
                              <Trash2 className="h-4 w-4" />
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Mobile Layout */}
                      <div className="md:hidden space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1">
                            {homeTeamLogo ? (
                              <img
                                src={homeTeamLogo}
                                alt={match.home_team?.name}
                                className="w-8 h-8 object-contain rounded"
                              />
                            ) : (
                              <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                                <Users className="h-4 w-4 text-gray-500" />
                              </div>
                            )}
                            <p className="font-semibold text-gray-900 text-sm">{match.home_team?.name}</p>
                          </div>
                          <div className="text-center px-3">
                            {match.status === 'finished' || match.status === 'completed' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xl font-bold text-gray-900">{match.home_score}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500 px-2 py-1 bg-white rounded-full">
                                {new Date(match.match_date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1">
                            {awayTeamLogo ? (
                              <img
                                src={awayTeamLogo}
                                alt={match.away_team?.name}
                                className="w-8 h-8 object-contain rounded"
                              />
                            ) : (
                              <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                                <Users className="h-4 w-4 text-gray-500" />
                              </div>
                            )}
                            <p className="font-semibold text-gray-900 text-sm">{match.away_team?.name}</p>
                          </div>
                          <div className="text-center px-3">
                            {match.status === 'finished' || match.status === 'completed' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xl font-bold text-gray-900">{match.away_score}</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600 pt-2 border-t">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(match.match_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                          <span>·</span>
                          <span>Fecha {match.round}</span>
                        </div>
                        {(match as any).sports_complex && (
                          <div className="flex items-center gap-2 text-xs text-emerald-700">
                            <MapPin className="h-3 w-3" />
                            <span>{(match as any).sports_complex.name}</span>
                            {(match as any).sports_complex.location_url && (
                              <a
                                href={(match as any).sports_complex.location_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-600 hover:text-emerald-800 underline"
                              >
                                Mapa
                              </a>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 pt-2">
                          {isAdmin && (
                            <button
                              onClick={() => {
                                setSelectedMatch(match);
                                setShowMatchDetailsModal(true);
                              }}
                              className="flex items-center gap-1 px-2 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-xs font-medium"
                            >
                              <Edit className="h-3 w-3" />
                              {match.status === 'finished' || match.status === 'completed' ? 'Editar' : 'Registrar'}
                            </button>
                          )}
                          {(match.status === 'finished' || match.status === 'completed' || match.status === 'playing') && (
                            <button
                              onClick={() => {
                                setSelectedMatch(match);
                                setShowMatchEventsModal(true);
                              }}
                              className="flex items-center gap-1 px-2 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium"
                            >
                              <Target className="h-3 w-3" />
                              Detalles
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteMatch(match.id)}
                              className="flex items-center gap-1 px-2 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-medium"
                            >
                              <Trash2 className="h-3 w-3" />
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="hidden md:block mt-2 flex flex-col items-center gap-2 text-sm text-gray-600">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(match.match_date).toLocaleDateString('es-ES', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <span>Fecha {match.round}</span>
                        </div>
                        {(match as any).sports_complex && (
                          <div className="flex items-center gap-2 text-emerald-700">
                            <MapPin className="h-4 w-4" />
                            <span className="font-medium">{(match as any).sports_complex.name}</span>
                            {(match as any).sports_complex.location_url && (
                              <a
                                href={(match as any).sports_complex.location_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-600 hover:text-emerald-800 underline ml-1"
                              >
                                Ver mapa
                              </a>
                            )}
                          </div>
                        )}
                        {match.venue && (
                          <span className="text-xs text-gray-500">{match.venue}</span>
                        )}
                      </div>
                    </div>
                    );
                  })
                  );
                })()}
              </div>
            )}

            {activeTab === 'teams' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teams.length === 0 ? (
                  <p className="col-span-2 text-center text-gray-600 py-8">No hay equipos registrados aún.</p>
                ) : (
                  teams.map((team) => {
                    const teamLogo = (team as any).base_team?.logo_url || team.logo_url;

                    return (
                    <div key={team.id} className="bg-gray-50 rounded-lg p-6 hover:bg-gray-100 transition-colors">
                      <div className="flex items-start gap-4 mb-4">
                        {teamLogo ? (
                          <img
                            src={teamLogo}
                            alt={team.name}
                            className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white p-2 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Users className="h-8 w-8 text-gray-500" />
                          </div>
                        )}
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-gray-900">{team.name}</h3>
                          {team.captain && (
                            <p className="text-sm text-gray-600">Capitán: {team.captain.full_name}</p>
                          )}
                        </div>
                      </div>
                      {team.comments && (
                        <p className="text-sm text-gray-600 mt-2">{team.comments}</p>
                      )}
                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => {
                            console.log('Selected team:', team);
                            console.log('Captain ID:', team.captain_id);
                            console.log('Captain data:', team.captain);
                            setSelectedTeam(team);
                            setShowTeamPlayersModal(true);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                        >
                          <Eye className="h-4 w-4" />
                          Ver Jugadores
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteTeam(team.id, team.name)}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                            title="Eliminar equipo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'scorers' && (
              <div className="overflow-x-auto">
                {topScorers.length === 0 ? (
                  <p className="text-center text-gray-600 py-8">No hay goleadores registrados aún.</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Pos</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Jugador</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Equipo</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">Goles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topScorers.map((scorer, index) => (
                        <tr key={scorer.player_id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {index === 0 && <Award className="inline h-5 w-5 text-yellow-500 mr-2" />}
                            {index + 1}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{scorer.player_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{scorer.team_name}</td>
                          <td className="px-4 py-3 text-sm text-center font-bold text-emerald-600">{scorer.total_goals}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'sanctions' && (
              <div className="space-y-4">
                {sanctions.length === 0 ? (
                  <p className="text-center text-gray-600 py-8">No hay sanciones registradas en este campeonato.</p>
                ) : (
                  <div className="grid gap-4">
                    {sanctions.map((sanction) => (
                      <div
                        key={sanction.id}
                        className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                              <AlertTriangle className="h-6 w-6 text-red-600" />
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h4 className="text-lg font-bold text-gray-900">
                                  {sanction.player_profiles?.full_name || 'Jugador no especificado'}
                                </h4>
                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-1 ${
                                  sanction.type === 'suspension'
                                    ? 'bg-red-600 text-white'
                                    : sanction.type === 'warning'
                                    ? 'bg-yellow-500 text-white'
                                    : 'bg-orange-600 text-white'
                                }`}>
                                  {sanction.type === 'suspension' && 'Suspensión'}
                                  {sanction.type === 'warning' && 'Advertencia'}
                                  {sanction.type === 'fine' && 'Multa'}
                                </span>
                              </div>
                              {sanction.rounds_suspended && sanction.rounds_suspended > 0 && (
                                <div className="text-right">
                                  <span className="text-2xl font-bold text-red-600">
                                    {sanction.rounds_suspended}
                                  </span>
                                  <p className="text-xs text-gray-600">
                                    {sanction.rounds_suspended === 1 ? 'fecha' : 'fechas'}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div className="bg-white/70 rounded-lg p-3">
                                <p className="text-sm font-semibold text-gray-700 mb-1">Motivo:</p>
                                <p className="text-sm text-gray-900">{sanction.reason}</p>
                              </div>

                              {sanction.matches && (
                                <div className="bg-white/70 rounded-lg p-3">
                                  <p className="text-sm font-semibold text-gray-700 mb-1">Partido:</p>
                                  <p className="text-sm text-gray-900">
                                    {(sanction.matches as any).home_team?.name} vs {(sanction.matches as any).away_team?.name}
                                  </p>
                                  <p className="text-xs text-gray-600 mt-1">
                                    {new Date((sanction.matches as any).match_date).toLocaleDateString('es-ES', {
                                      day: 'numeric',
                                      month: 'long',
                                      year: 'numeric'
                                    })}
                                  </p>
                                </div>
                              )}

                              {(sanction.start_date || sanction.end_date) && (
                                <div className="bg-white/70 rounded-lg p-3 flex items-center gap-4 text-sm">
                                  {sanction.start_date && (
                                    <div>
                                      <span className="text-gray-700 font-semibold">Desde: </span>
                                      <span className="text-gray-900">
                                        {new Date(sanction.start_date).toLocaleDateString('es-ES')}
                                      </span>
                                    </div>
                                  )}
                                  {sanction.end_date && (
                                    <div>
                                      <span className="text-gray-700 font-semibold">Hasta: </span>
                                      <span className="text-gray-900">
                                        {new Date(sanction.end_date).toLocaleDateString('es-ES')}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="text-xs text-gray-500 mt-2">
                                Registrada el {new Date(sanction.created_at).toLocaleDateString('es-ES', {
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'playoffs' && (
              <div className="space-y-4">
                {championship && (
                  <PlayoffBracket
                    championship={championship}
                    onMatchClick={isAdmin ? (match) => {
                      setSelectedPlayoffMatch(match);
                      setShowPlayoffMatchModal(true);
                    } : undefined}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showMatchDetailsModal && selectedMatch && (
        <MatchDetailsModal
          matchId={selectedMatch.id}
          homeTeamId={selectedMatch.home_team_id}
          awayTeamId={selectedMatch.away_team_id}
          homeTeamName={selectedMatch.home_team?.name || ''}
          awayTeamName={selectedMatch.away_team?.name || ''}
          onClose={() => {
            setShowMatchDetailsModal(false);
            setSelectedMatch(null);
          }}
          onSuccess={() => {
            setShowMatchDetailsModal(false);
            setSelectedMatch(null);
            fetchChampionshipData();
            fetchTopScorers();
          }}
        />
      )}

      {showSanctionsModal && championshipId && (
        <SanctionsManagementModal
          championshipId={championshipId}
          onClose={() => setShowSanctionsModal(false)}
          onSuccess={() => {
            setShowSanctionsModal(false);
            fetchChampionshipData();
            fetchSanctions();
          }}
          onSanctionDeleted={() => {
            fetchSanctions();
          }}
        />
      )}

      {showMatchEventsModal && selectedMatch && (
        <MatchEventsModal
          matchId={selectedMatch.id}
          homeTeamName={selectedMatch.home_team?.name || ''}
          awayTeamName={selectedMatch.away_team?.name || ''}
          homeScore={selectedMatch.home_score || 0}
          awayScore={selectedMatch.away_score || 0}
          matchDate={selectedMatch.match_date}
          onClose={() => {
            setShowMatchEventsModal(false);
            setSelectedMatch(null);
            fetchChampionshipData();
            fetchTopScorers();
          }}
        />
      )}

      {showTeamPlayersModal && selectedTeam && (
        <TeamPlayersModal
          teamId={(selectedTeam as any).base_team_id || selectedTeam.id}
          teamName={selectedTeam.name}
          captainId={(selectedTeam as any).registration_captain?.captain_id || selectedTeam.captain_id || undefined}
          captainName={(selectedTeam as any).registration_captain?.captain?.full_name || selectedTeam.captain?.full_name || undefined}
          isBaseTeam={true}
          onClose={() => {
            setShowTeamPlayersModal(false);
            setSelectedTeam(null);
          }}
        />
      )}

      {showPlayoffConfigModal && championship && (
        <PlayoffConfigModal
          championship={championship}
          onClose={() => setShowPlayoffConfigModal(false)}
          onSuccess={() => {
            setShowPlayoffConfigModal(false);
            fetchPlayoffConfig();
          }}
        />
      )}

      {showPlayoffMatchModal && selectedPlayoffMatch && (
        <PlayoffMatchModal
          match={selectedPlayoffMatch}
          onClose={() => {
            setShowPlayoffMatchModal(false);
            setSelectedPlayoffMatch(null);
          }}
          onSuccess={() => {
            setShowPlayoffMatchModal(false);
            setSelectedPlayoffMatch(null);
            fetchChampionshipData();
          }}
        />
      )}

      {showSponsorsModal && championshipId && (
        <SponsorsManagementModal
          isOpen={showSponsorsModal}
          onClose={() => {
            setShowSponsorsModal(false);
            fetchSponsors();
          }}
          championshipId={championshipId}
        />
      )}

      {showCreateMatch && championshipId && (
        <CreateMatchModal
          championshipId={championshipId}
          onClose={() => setShowCreateMatch(false)}
          onSuccess={() => {
            setShowCreateMatch(false);
            fetchChampionshipData();
          }}
        />
      )}
    </Layout>
  );
};
