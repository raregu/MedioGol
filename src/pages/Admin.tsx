import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Championship, Team, Match, Sanction, Profile } from '../types/database';
import { Trophy, Users, Calendar, AlertCircle, Plus, UserCog, CreditCard as Edit, MapPin, Trash2, Phone, Image, FileSpreadsheet } from 'lucide-react';
import { CreateChampionshipModal } from '../components/admin/CreateChampionshipModal';
import { EditChampionshipModal } from '../components/admin/EditChampionshipModal';
import { CreateTeamModal } from '../components/CreateTeamModal';
import { EditTeamModal } from '../components/admin/EditTeamModal';
import { EditMatchModal } from '../components/admin/EditMatchModal';
import { EditSanctionModal } from '../components/admin/EditSanctionModal';
import { CreateMatchModal } from '../components/admin/CreateMatchModal';
import { SportsComplexModal } from '../components/admin/SportsComplexModal';
import ShiftManagerModal from '../components/admin/ShiftManagerModal';
import { AssignCaptainModal } from '../components/admin/AssignCaptainModal';
import { AdvertisementsManagementModal } from '../components/admin/AdvertisementsManagementModal';
import UploadScheduleModal from '../components/UploadScheduleModal';

interface SportsComplex {
  id: string;
  name: string;
  address: string;
  location_url: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  description: string | null;
  facilities: string | null;
  created_at: string;
}

export const Admin = () => {
  const { profile, isAdmin, isChampionshipAdmin } = useAuth();

  // Debug: verificar el rol del usuario
  useEffect(() => {
    console.log('Profile:', profile);
    console.log('Role:', profile?.role);
    console.log('isAdmin:', isAdmin);
    console.log('isChampionshipAdmin:', isChampionshipAdmin);
  }, [profile, isAdmin, isChampionshipAdmin]);

  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedChampionship, setSelectedChampionship] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [baseTeams, setBaseTeams] = useState<any[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [sportsComplexes, setSportsComplexes] = useState<SportsComplex[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'championships' | 'teams' | 'matches' | 'sanctions' | 'users' | 'complexes' | 'base_teams' | 'advertisements'>(
    isAdmin ? 'users' : 'championships'
  );
  const [showCreateChampionship, setShowCreateChampionship] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [showUploadSchedule, setShowUploadSchedule] = useState(false);
  const [showComplexModal, setShowComplexModal] = useState(false);
  const [showShiftManagerModal, setShowShiftManagerModal] = useState(false);
  const [showAdvertisementsModal, setShowAdvertisementsModal] = useState(false);
  const [editingChampionship, setEditingChampionship] = useState<Championship | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editingSanction, setEditingSanction] = useState<Sanction | null>(null);
  const [editingComplex, setEditingComplex] = useState<SportsComplex | null>(null);
  const [editingBaseTeam, setEditingBaseTeam] = useState<any | null>(null);
  const [assigningCaptainTeam, setAssigningCaptainTeam] = useState<Team | null>(null);

  useEffect(() => {
    if (profile) {
      fetchChampionships();
      if (isAdmin) {
        fetchUsers();
        fetchSportsComplexes();
        fetchBaseTeams();
      }
    }
  }, [profile, isAdmin]);

  useEffect(() => {
    if (selectedChampionship) {
      fetchChampionshipData(selectedChampionship);
    }
  }, [selectedChampionship]);

  const fetchChampionships = async () => {
    try {
      let query = supabase
        .from('championships')
        .select('*, admin:profiles!championships_admin_id_fkey(full_name)');

      if (!isAdmin && profile?.role === 'admin_campeonato') {
        query = query.eq('admin_id', profile.id);
      }

      const { data } = await query.order('created_at', { ascending: false });

      if (data) {
        setChampionships(data);
        if (data.length > 0 && !selectedChampionship) {
          setSelectedChampionship(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching championships:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChampionshipData = async (championshipId: string) => {
    try {
      const { data: teamsData } = await supabase
        .from('teams')
        .select('*, captain:profiles!teams_captain_id_fkey(full_name), captain_confirmed, captain_confirmed_at, is_enabled')
        .eq('championship_id', championshipId)
        .order('created_at', { ascending: false });

      if (teamsData) setTeams(teamsData);

      const { data: matchesData } = await supabase
        .from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)')
        .eq('championship_id', championshipId)
        .order('match_date', { ascending: false });

      if (matchesData) setMatches(matchesData);

      const { data: sanctionsData } = await supabase
        .from('sanctions')
        .select('*, player:players!sanctions_player_id_fkey(name)')
        .eq('championship_id', championshipId)
        .order('created_at', { ascending: false });

      if (sanctionsData) setSanctions(sanctionsData);
    } catch (error) {
      console.error('Error fetching championship data:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      // First get all profiles
      const { data: profilesData, error: profilesError } = await supabase.rpc('get_all_profiles');

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw profilesError;
      }

      // Then get emails separately
      const { data: emailsData, error: emailsError } = await supabase.rpc('get_user_emails');

      if (emailsError) {
        console.error('Error fetching emails:', emailsError);
        throw emailsError;
      }

      // Merge the data
      if (profilesData && emailsData) {
        const usersWithEmails = profilesData.map((profile: any) => {
          const emailInfo = emailsData.find((e: any) => e.id === profile.id);
          return {
            ...profile,
            email: emailInfo?.email || 'No disponible'
          };
        });
        setUsers(usersWithEmails);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchSportsComplexes = async () => {
    try {
      const { data } = await supabase
        .from('sports_complexes')
        .select('*')
        .order('name');

      if (data) setSportsComplexes(data);
    } catch (error) {
      console.error('Error fetching sports complexes:', error);
    }
  };

  const fetchBaseTeams = async () => {
    try {
      const { data } = await supabase
        .from('base_teams')
        .select('*, owner:profiles!base_teams_owner_id_fkey(full_name)')
        .order('created_at', { ascending: false });

      if (data) setBaseTeams(data);
    } catch (error) {
      console.error('Error fetching base teams:', error);
    }
  };

  const deleteComplex = async (complexId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este complejo? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('sports_complexes')
        .delete()
        .eq('id', complexId);

      if (error) throw error;

      alert('Complejo eliminado exitosamente');
      fetchSportsComplexes();
    } catch (error: any) {
      console.error('Error deleting complex:', error);
      alert(error.message || 'Error al eliminar el complejo. Puede estar siendo usado en partidos programados.');
    }
  };

  const deleteBaseTeam = async (teamId: string, teamName: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar el equipo base "${teamName}"? Esta acción no se puede deshacer y eliminará todas sus inscripciones a campeonatos.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('base_teams')
        .delete()
        .eq('id', teamId);

      if (error) throw error;

      alert('Equipo base eliminado exitosamente');
      fetchBaseTeams();
    } catch (error: any) {
      console.error('Error deleting base team:', error);
      alert(error.message || 'Error al eliminar el equipo base.');
    }
  };

  const updateMatchScore = async (matchId: string, homeScore: number, awayScore: number) => {
    try {
      await supabase
        .from('matches')
        .update({
          home_score: homeScore,
          away_score: awayScore,
          status: 'finished',
        })
        .eq('id', matchId);

      fetchChampionshipData(selectedChampionship!);
    } catch (error) {
      console.error('Error updating match:', error);
    }
  };

  const changeUserRole = async (userId: string, newRole: string) => {
    try {
      const { data, error } = await supabase.rpc('change_user_role', {
        target_user_id: userId,
        new_role: newRole,
      });

      if (error) throw error;

      fetchUsers();
      alert('Rol actualizado exitosamente');
    } catch (error: unknown) {
      console.error('Error changing user role:', error);
      if (error instanceof Error) {
        alert(`Error al cambiar el rol: ${error.message}`);
      } else {
        alert('Error al cambiar el rol');
      }
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

  return (
    <ProtectedRoute requiredRole={['admin_sistema', 'admin_campeonato']}>
      <Layout>
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Panel de Administración</h1>
              <p className="text-gray-600 text-lg">
                {isAdmin ? 'Gestiona usuarios y complejos del sistema' : 'Gestiona campeonatos, equipos y partidos'}
              </p>
            </div>
            {isChampionshipAdmin && !isAdmin && (
              <button
                onClick={() => setShowCreateChampionship(true)}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
              >
                <Plus className="h-5 w-5" />
                Crear Campeonato
              </button>
            )}
          </div>

          {/* Vista para Admin Sistema - Solo Usuarios y Complejos */}
          {isAdmin ? (
            <div className="bg-white rounded-xl shadow-md">
              <div className="border-b">
                <div className="flex overflow-x-auto">
                  <button
                    onClick={() => setActiveTab('users')}
                    className={`px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                      activeTab === 'users'
                        ? 'text-emerald-600 border-b-2 border-emerald-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <UserCog className="h-5 w-5" />
                      Usuarios
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('complexes')}
                    className={`px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                      activeTab === 'complexes'
                        ? 'text-emerald-600 border-b-2 border-emerald-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Complejos Deportivos
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('base_teams')}
                    className={`px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                      activeTab === 'base_teams'
                        ? 'text-emerald-600 border-b-2 border-emerald-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Equipos Base
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('advertisements')}
                    className={`px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                      activeTab === 'advertisements'
                        ? 'text-emerald-600 border-b-2 border-emerald-600'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Image className="h-5 w-5" />
                      Publicidades
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-6">
                {activeTab === 'users' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-gray-900">Gestión de Usuarios ({users.length})</h2>
                    </div>

                    {users.length === 0 ? (
                      <p className="text-center text-gray-600 py-8">No hay usuarios registrados.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Usuario</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Rol Actual</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Cambiar Rol</th>
                              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Registrado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {users.map((user) => (
                              <tr key={user.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold">
                                      {user.full_name.charAt(0)}
                                    </div>
                                    <p className="font-medium text-gray-900">{user.full_name}</p>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-sm text-gray-600">{user.email || 'No disponible'}</p>
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-block px-3 py-1 rounded-full text-sm font-medium capitalize ${
                                      user.role === 'admin_sistema'
                                        ? 'bg-red-100 text-red-700'
                                        : user.role === 'admin_campeonato'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}
                                  >
                                    {user.role.replace('_', ' ')}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <select
                                    value={user.role}
                                    onChange={(e) => {
                                      if (window.confirm(`¿Estás seguro de cambiar el rol de ${user.full_name} a ${e.target.value}?`)) {
                                        changeUserRole(user.id, e.target.value);
                                      } else {
                                        e.target.value = user.role;
                                      }
                                    }}
                                    disabled={user.id === profile?.id && user.role === 'admin_sistema'}
                                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <option value="usuario">Usuario</option>
                                    <option value="encargado_turno">Encargado Turno</option>
                                    <option value="admin_campeonato">Admin Campeonato</option>
                                    <option value="admin_sistema">Admin Sistema</option>
                                  </select>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {new Date(user.created_at).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                      <h3 className="font-semibold text-blue-900 mb-2">Descripción de Roles</h3>
                      <ul className="space-y-2 text-sm text-blue-800">
                        <li><strong>Usuario:</strong> Puede ver campeonatos, aceptar invitaciones a equipos y participar como jugador.</li>
                        <li><strong>Admin Campeonato:</strong> Puede gestionar un campeonato específico (equipos, partidos, estadísticas).</li>
                        <li><strong>Admin Sistema:</strong> Acceso total, puede crear campeonatos, gestionar usuarios y asignar roles.</li>
                      </ul>
                    </div>
                  </div>
                )}

                {activeTab === 'complexes' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-gray-900">
                        Complejos Deportivos ({sportsComplexes.length})
                      </h2>
                      <button
                        onClick={() => {
                          setEditingComplex(null);
                          setShowComplexModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                      >
                        <Plus className="h-5 w-5" />
                        Nuevo Complejo
                      </button>
                    </div>

                    {sportsComplexes.length === 0 ? (
                      <div className="bg-gray-50 rounded-lg p-8 text-center">
                        <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600 mb-2">No hay complejos deportivos registrados</p>
                        <p className="text-sm text-gray-500">Agrega un complejo para poder asignarlo a los partidos</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {sportsComplexes.map((complex) => (
                          <div
                            key={complex.id}
                            className="bg-gray-50 rounded-lg p-6 hover:bg-gray-100 transition-colors border border-gray-200"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h3 className="text-lg font-bold text-gray-900 mb-1">
                                  {complex.name}
                                </h3>
                                <p className="text-sm text-gray-600 flex items-center gap-1">
                                  <MapPin className="h-4 w-4" />
                                  {complex.address}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setEditingComplex(complex);
                                    setShowComplexModal(true);
                                  }}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Editar"
                                >
                                  <Edit className="h-5 w-5" />
                                </button>
                                <button
                                  onClick={() => deleteComplex(complex.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </button>
                              </div>
                            </div>

                            {complex.description && (
                              <p className="text-sm text-gray-700 mb-3">{complex.description}</p>
                            )}

                            {complex.facilities && (
                              <div className="mb-3">
                                <p className="text-xs font-medium text-gray-600 mb-1">Instalaciones:</p>
                                <p className="text-sm text-gray-700">{complex.facilities}</p>
                              </div>
                            )}

                            <div className="flex flex-wrap gap-3 text-sm">
                              {complex.phone && (
                                <span className="text-gray-600">
                                  📞 {complex.phone}
                                </span>
                              )}
                              {complex.location_url && (
                                <a
                                  href={complex.location_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                  <MapPin className="h-4 w-4" />
                                  Ver en el mapa
                                </a>
                              )}
                            </div>

                            {(complex.latitude || complex.longitude) && (
                              <div className="mt-2 text-xs text-gray-500">
                                Coords: {complex.latitude}, {complex.longitude}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'base_teams' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-gray-900">
                        Equipos Base del Sistema ({baseTeams.length})
                      </h2>
                    </div>

                    {baseTeams.length === 0 ? (
                      <div className="bg-gray-50 rounded-lg p-8 text-center">
                        <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600 mb-2">No hay equipos base registrados</p>
                        <p className="text-sm text-gray-500">Los usuarios pueden crear equipos desde su panel</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {baseTeams.map((team) => (
                          <div
                            key={team.id}
                            className="bg-gray-50 rounded-lg p-6 hover:bg-gray-100 transition-colors border border-gray-200"
                          >
                            <div className="flex items-start gap-4 mb-4">
                              {team.logo_url ? (
                                <img
                                  src={team.logo_url}
                                  alt={team.name}
                                  className="w-16 h-16 object-contain rounded-lg border border-gray-200 bg-white p-2 flex-shrink-0"
                                />
                              ) : (
                                <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <Users className="h-8 w-8 text-gray-500" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-bold text-gray-900 truncate mb-1">
                                  {team.name}
                                </h3>
                                <p className="text-sm text-gray-600">
                                  Dueño: {team.owner?.full_name || 'Desconocido'}
                                </p>
                              </div>
                            </div>

                            {team.description && (
                              <p className="text-sm text-gray-700 mb-3 line-clamp-2">{team.description}</p>
                            )}

                            {team.founded_date && (
                              <p className="text-xs text-gray-500 mb-3">
                                Fundado: {new Date(team.founded_date).toLocaleDateString()}
                              </p>
                            )}

                            <div className="flex gap-2 mt-4">
                              <button
                                onClick={() => setEditingBaseTeam(team)}
                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-sm font-medium"
                                title="Editar equipo"
                              >
                                <Edit className="h-4 w-4" />
                                Editar
                              </button>
                              <button
                                onClick={() => deleteBaseTeam(team.id, team.name)}
                                className="flex items-center justify-center gap-2 px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors text-sm font-medium"
                                title="Eliminar equipo"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                      <h3 className="font-semibold text-blue-900 mb-2">Sobre los Equipos Base</h3>
                      <p className="text-sm text-blue-800">
                        Los equipos base son equipos independientes creados por usuarios que pueden inscribirse en múltiples campeonatos.
                        Como administrador del sistema, puedes editar o eliminar cualquier equipo.
                        Ten cuidado al eliminar, ya que se eliminarán también todas las inscripciones del equipo a campeonatos.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'advertisements' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-gray-900">Publicidades del Sistema</h2>
                      <button
                        onClick={() => setShowAdvertisementsModal(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                      >
                        <Image className="h-5 w-5" />
                        Gestionar Publicidades
                      </button>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-8 text-center">
                      <Image className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-700 mb-2 font-medium">
                        Gestión de Publicidades
                      </p>
                      <p className="text-sm text-gray-600 mb-4">
                        Crea y administra anuncios publicitarios que se mostrarán en los detalles de los campeonatos.
                      </p>
                      <button
                        onClick={() => setShowAdvertisementsModal(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                      >
                        <Plus className="h-5 w-5" />
                        Abrir Panel de Publicidades
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : championships.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No tienes campeonatos asignados</h2>
              <p className="text-gray-600 mb-4">
                {isChampionshipAdmin
                  ? 'Comienza creando tu primer campeonato.'
                  : 'Contacta al administrador del sistema para obtener acceso.'
                }
              </p>
              {isChampionshipAdmin && (
                <button
                  onClick={() => setShowCreateChampionship(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                >
                  <Plus className="h-5 w-5" />
                  Crear Campeonato
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-md p-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seleccionar Campeonato
                </label>
                <select
                  value={selectedChampionship || ''}
                  onChange={(e) => setSelectedChampionship(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  {championships.map((championship) => (
                    <option key={championship.id} value={championship.id}>
                      {championship.name} - {championship.sport}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-white rounded-xl shadow-md">
                <div className="border-b">
                  <div className="flex overflow-x-auto">
                    <button
                      onClick={() => setActiveTab('championships')}
                      className={`px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                        activeTab === 'championships'
                          ? 'text-emerald-600 border-b-2 border-emerald-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Campeonatos
                    </button>
                    <button
                      onClick={() => setActiveTab('teams')}
                      className={`px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                        activeTab === 'teams'
                          ? 'text-emerald-600 border-b-2 border-emerald-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Equipos
                    </button>
                    <button
                      onClick={() => setActiveTab('matches')}
                      className={`px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                        activeTab === 'matches'
                          ? 'text-emerald-600 border-b-2 border-emerald-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Partidos
                    </button>
                    <button
                      onClick={() => setActiveTab('sanctions')}
                      className={`px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                        activeTab === 'sanctions'
                          ? 'text-emerald-600 border-b-2 border-emerald-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Sanciones
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => setActiveTab('complexes')}
                          className={`px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                            activeTab === 'complexes'
                              ? 'text-emerald-600 border-b-2 border-emerald-600'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          Complejos
                        </button>
                        <button
                          onClick={() => setActiveTab('users')}
                          className={`px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                            activeTab === 'users'
                              ? 'text-emerald-600 border-b-2 border-emerald-600'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          Usuarios
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-6">
                  {activeTab === 'championships' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">Información del Campeonato</h2>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowShiftManagerModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <UserCog className="h-4 w-4" />
                            Encargados
                          </button>
                          <button
                            onClick={() => {
                              const champ = championships.find((c) => c.id === selectedChampionship);
                              if (champ) setEditingChampionship(champ);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                            Editar
                          </button>
                        </div>
                      </div>

                      {championships.find((c) => c.id === selectedChampionship) && (() => {
                        const champ = championships.find((c) => c.id === selectedChampionship)!;
                        return (
                          <div className="bg-gray-50 rounded-lg p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-gray-600">Nombre</p>
                                <p className="font-semibold text-gray-900">{champ.name}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Deporte</p>
                                <p className="font-semibold text-gray-900 capitalize">{champ.sport}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Recinto</p>
                                <p className="font-semibold text-gray-900">{champ.venue}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Estado</p>
                                <p className="font-semibold text-gray-900 capitalize">{champ.status}</p>
                              </div>
                              {champ.admin && (
                                <div>
                                  <p className="text-sm text-gray-600">Administrador</p>
                                  <p className="font-semibold text-gray-900">{champ.admin.full_name}</p>
                                </div>
                              )}
                              {champ.location && (
                                <div>
                                  <p className="text-sm text-gray-600">Ubicación</p>
                                  <p className="font-semibold text-gray-900">{champ.location}</p>
                                </div>
                              )}
                              {champ.contact_phone && (
                                <div>
                                  <p className="text-sm text-gray-600">Teléfono</p>
                                  <p className="font-semibold text-gray-900">{champ.contact_phone}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {activeTab === 'teams' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">Equipos ({teams.length})</h2>
                        <button
                          onClick={() => setShowCreateTeam(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                        >
                          <Plus className="h-5 w-5" />
                          Crear Equipo
                        </button>
                      </div>

                      {teams.length === 0 ? (
                        <div className="text-center py-12">
                          <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-600 mb-4">No hay equipos registrados en este campeonato.</p>
                          <button
                            onClick={() => setShowCreateTeam(true)}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                          >
                            <Plus className="h-5 w-5" />
                            Crear Primer Equipo
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {teams.map((team) => (
                            <div key={team.id} className="bg-gray-50 rounded-lg p-6 relative">
                              <button
                                onClick={() => setEditingTeam(team)}
                                className="absolute top-4 right-4 p-2 text-gray-600 hover:text-emerald-600 hover:bg-white rounded-lg transition-colors"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              {team.logo_url && (
                                <img
                                  src={team.logo_url}
                                  alt={team.name}
                                  className="w-16 h-16 object-contain mb-3 rounded-lg border border-gray-200 bg-white p-2"
                                />
                              )}
                              <h3 className="font-bold text-lg text-gray-900 mb-2">{team.name}</h3>

                              <div className="space-y-2 mb-3">
                                {team.captain ? (
                                  <div>
                                    <p className="text-sm text-gray-600">
                                      Capitán: <span className="font-medium">{team.captain.full_name}</span>
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {team.captain_confirmed ? (
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1">
                                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                          Confirmado
                                        </span>
                                      ) : (
                                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded flex items-center gap-1">
                                          <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                                          Pendiente de confirmación
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <p className="text-sm text-gray-500 italic">Sin capitán asignado</p>
                                    <button
                                      onClick={() => setAssigningCaptainTeam(team)}
                                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                    >
                                      <UserCog className="h-4 w-4" />
                                      Asignar Capitán
                                    </button>
                                  </div>
                                )}

                                {!team.is_enabled && (
                                  <span className="inline-block text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                                    Equipo deshabilitado
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">Stamina:</span>
                                <span className="font-semibold text-emerald-600">{team.stamina}/100</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'matches' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">Partidos ({matches.length})</h2>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowUploadSchedule(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <FileSpreadsheet className="h-5 w-5" />
                            Cargar Excel
                          </button>
                          <button
                            onClick={() => setShowCreateMatch(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                          >
                            <Plus className="h-5 w-5" />
                            Crear Partido
                          </button>
                        </div>
                      </div>

                      {matches.length === 0 ? (
                        <div className="text-center py-12">
                          <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-600 mb-4">No hay partidos programados aún.</p>
                          <button
                            onClick={() => setShowCreateMatch(true)}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                          >
                            <Plus className="h-5 w-5" />
                            Crear Primer Partido
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {matches.map((match) => (
                            <div key={match.id} className="bg-gray-50 rounded-lg p-4 relative">
                              <button
                                onClick={() => setEditingMatch(match)}
                                className="absolute top-4 right-4 p-2 text-gray-600 hover:text-emerald-600 hover:bg-white rounded-lg transition-colors"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <div className="flex items-center justify-between mb-3 pr-10">
                                <div className="flex-1 text-right">
                                  <p className="font-semibold text-gray-900">{match.home_team?.name}</p>
                                </div>
                                <div className="px-6 text-center">
                                  {match.status === 'finished' ? (
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
                                <div className="flex-1">
                                  <p className="font-semibold text-gray-900">{match.away_team?.name}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-sm text-gray-600">
                                <span>{new Date(match.match_date).toLocaleString()}</span>
                                <span>Fecha {match.round}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'sanctions' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">Sanciones ({sanctions.length})</h2>
                      </div>

                      {sanctions.length === 0 ? (
                        <p className="text-center text-gray-600 py-8">No hay sanciones registradas.</p>
                      ) : (
                        <div className="space-y-3">
                          {sanctions.map((sanction) => (
                            <div key={sanction.id} className="bg-gray-50 rounded-lg p-4 relative">
                              <button
                                onClick={() => setEditingSanction(sanction)}
                                className="absolute top-4 right-4 p-2 text-gray-600 hover:text-emerald-600 hover:bg-white rounded-lg transition-colors"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <div className="flex items-start justify-between pr-10">
                                <div className="flex-1">
                                  <p className="font-semibold text-gray-900">{sanction.player?.name}</p>
                                  <p className="text-sm text-gray-600 mt-1">{sanction.reason}</p>
                                  <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                                    <span className="capitalize">{sanction.type}</span>
                                    {sanction.rounds_suspended > 0 && (
                                      <span>{sanction.rounds_suspended} fechas</span>
                                    )}
                                  </div>
                                </div>
                                <span
                                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                                    sanction.type === 'suspension'
                                      ? 'bg-red-100 text-red-700'
                                      : sanction.type === 'warning'
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {sanction.type}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'users' && isAdmin && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">Gestión de Usuarios ({users.length})</h2>
                      </div>

                      {users.length === 0 ? (
                        <p className="text-center text-gray-600 py-8">No hay usuarios registrados.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Usuario</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Rol Actual</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Cambiar Rol</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Registrado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {users.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold">
                                        {user.full_name.charAt(0)}
                                      </div>
                                      <p className="font-medium text-gray-900">{user.full_name}</p>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="text-sm text-gray-600">{user.email || 'No disponible'}</p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={`inline-block px-3 py-1 rounded-full text-sm font-medium capitalize ${
                                        user.role === 'admin_sistema'
                                          ? 'bg-red-100 text-red-700'
                                          : user.role === 'admin_campeonato'
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-gray-100 text-gray-700'
                                      }`}
                                    >
                                      {user.role.replace('_', ' ')}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <select
                                      value={user.role}
                                      onChange={(e) => {
                                        if (window.confirm(`¿Estás seguro de cambiar el rol de ${user.full_name} a ${e.target.value}?`)) {
                                          changeUserRole(user.id, e.target.value);
                                        } else {
                                          e.target.value = user.role;
                                        }
                                      }}
                                      disabled={user.id === profile?.id && user.role === 'admin_sistema'}
                                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <option value="usuario">Usuario</option>
                                      <option value="admin_campeonato">Admin Campeonato</option>
                                      <option value="admin_sistema">Admin Sistema</option>
                                    </select>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-600">
                                    {new Date(user.created_at).toLocaleDateString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                        <h3 className="font-semibold text-blue-900 mb-2">Descripción de Roles</h3>
                        <ul className="space-y-2 text-sm text-blue-800">
                          <li><strong>Usuario:</strong> Puede ver campeonatos, aceptar invitaciones a equipos y participar como jugador.</li>
                          <li><strong>Admin Campeonato:</strong> Puede gestionar un campeonato específico (equipos, partidos, estadísticas).</li>
                          <li><strong>Admin Sistema:</strong> Acceso total, puede crear campeonatos, gestionar usuarios y asignar roles.</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {activeTab === 'complexes' && isAdmin && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">
                          Complejos Deportivos ({sportsComplexes.length})
                        </h2>
                        <button
                          onClick={() => {
                            setEditingComplex(null);
                            setShowComplexModal(true);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                        >
                          <Plus className="h-5 w-5" />
                          Nuevo Complejo
                        </button>
                      </div>

                      {sportsComplexes.length === 0 ? (
                        <div className="bg-gray-50 rounded-lg p-8 text-center">
                          <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600 mb-2">No hay complejos deportivos registrados</p>
                          <p className="text-sm text-gray-500">Agrega un complejo para poder asignarlo a los partidos</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {sportsComplexes.map((complex) => (
                            <div
                              key={complex.id}
                              className="bg-gray-50 rounded-lg p-6 hover:bg-gray-100 transition-colors border border-gray-200"
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                                    {complex.name}
                                  </h3>
                                  <p className="text-sm text-gray-600 flex items-center gap-1">
                                    <MapPin className="h-4 w-4" />
                                    {complex.address}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      setEditingComplex(complex);
                                      setShowComplexModal(true);
                                    }}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Editar"
                                  >
                                    <Edit className="h-5 w-5" />
                                  </button>
                                  <button
                                    onClick={() => deleteComplex(complex.id)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </button>
                                </div>
                              </div>

                              {complex.description && (
                                <p className="text-sm text-gray-700 mb-3">{complex.description}</p>
                              )}

                              {complex.facilities && (
                                <div className="mb-3">
                                  <p className="text-xs font-medium text-gray-600 mb-1">Instalaciones:</p>
                                  <p className="text-sm text-gray-700">{complex.facilities}</p>
                                </div>
                              )}

                              <div className="flex flex-wrap gap-3 text-sm">
                                {complex.phone && (
                                  <a
                                    href={`tel:${complex.phone}`}
                                    className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                                  >
                                    <Phone className="h-4 w-4" />
                                    {complex.phone}
                                  </a>
                                )}
                                {complex.location_url && (
                                  <a
                                    href={complex.location_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                  >
                                    <MapPin className="h-4 w-4" />
                                    Ver en el mapa
                                  </a>
                                )}
                              </div>

                              {(complex.latitude || complex.longitude) && (
                                <div className="mt-2 text-xs text-gray-500">
                                  Coords: {complex.latitude}, {complex.longitude}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {editingChampionship && (
          <EditChampionshipModal
            championship={editingChampionship}
            onClose={() => setEditingChampionship(null)}
            onSuccess={() => {
              fetchChampionships();
              if (selectedChampionship) {
                fetchChampionshipData(selectedChampionship);
              }
            }}
          />
        )}

        {editingTeam && (
          <EditTeamModal
            team={editingTeam}
            onClose={() => setEditingTeam(null)}
            onSuccess={() => {
              if (selectedChampionship) {
                fetchChampionshipData(selectedChampionship);
              }
            }}
          />
        )}

        {editingMatch && (
          <EditMatchModal
            match={editingMatch}
            onClose={() => setEditingMatch(null)}
            onSuccess={() => {
              if (selectedChampionship) {
                fetchChampionshipData(selectedChampionship);
              }
            }}
          />
        )}

        {editingSanction && (
          <EditSanctionModal
            sanction={editingSanction}
            onClose={() => setEditingSanction(null)}
            onSuccess={() => {
              if (selectedChampionship) {
                fetchChampionshipData(selectedChampionship);
              }
            }}
          />
        )}

        {showCreateTeam && selectedChampionship && (
          <CreateTeamModal
            championship={championships.find(c => c.id === selectedChampionship)!}
            onClose={() => setShowCreateTeam(false)}
            onSuccess={() => {
              setShowCreateTeam(false);
              if (selectedChampionship) {
                fetchChampionshipData(selectedChampionship);
              }
            }}
          />
        )}

        {showCreateMatch && selectedChampionship && (
          <CreateMatchModal
            championshipId={selectedChampionship}
            onClose={() => setShowCreateMatch(false)}
            onSuccess={() => {
              setShowCreateMatch(false);
              if (selectedChampionship) {
                fetchChampionshipData(selectedChampionship);
              }
            }}
          />
        )}

        {showComplexModal && (
          <SportsComplexModal
            complex={editingComplex}
            onClose={() => {
              setShowComplexModal(false);
              setEditingComplex(null);
            }}
            onSuccess={() => {
              fetchSportsComplexes();
              setShowComplexModal(false);
              setEditingComplex(null);
            }}
          />
        )}

        {showCreateChampionship && (
          <CreateChampionshipModal
            onClose={() => setShowCreateChampionship(false)}
            onSuccess={() => {
              fetchChampionships();
              setShowCreateChampionship(false);
            }}
          />
        )}

        {showShiftManagerModal && selectedChampionship && (
          <ShiftManagerModal
            isOpen={showShiftManagerModal}
            onClose={() => setShowShiftManagerModal(false)}
            championshipId={selectedChampionship}
            championshipName={championships.find(c => c.id === selectedChampionship)?.name || ''}
          />
        )}

        {assigningCaptainTeam && (
          <AssignCaptainModal
            team={assigningCaptainTeam}
            onClose={() => setAssigningCaptainTeam(null)}
            onSuccess={() => {
              if (selectedChampionship) {
                fetchChampionshipData(selectedChampionship);
              }
              setAssigningCaptainTeam(null);
            }}
          />
        )}

        {editingBaseTeam && (
          <EditBaseTeamModal
            team={editingBaseTeam}
            onClose={() => setEditingBaseTeam(null)}
            onSuccess={() => {
              fetchBaseTeams();
              setEditingBaseTeam(null);
            }}
          />
        )}

        {showAdvertisementsModal && (
          <AdvertisementsManagementModal
            isOpen={showAdvertisementsModal}
            onClose={() => setShowAdvertisementsModal(false)}
          />
        )}

        {showUploadSchedule && selectedChampionship && (
          <UploadScheduleModal
            championshipId={selectedChampionship}
            teams={teams}
            onClose={() => setShowUploadSchedule(false)}
            onSuccess={() => {
              setShowUploadSchedule(false);
              if (selectedChampionship) {
                fetchChampionshipData(selectedChampionship);
              }
            }}
          />
        )}
      </Layout>
    </ProtectedRoute>
  );
};
