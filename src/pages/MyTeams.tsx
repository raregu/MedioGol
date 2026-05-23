import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Team, Player, Challenge, Invitation, BaseTeam } from '../types/database';
import { InvitePlayerModal } from '../components/InvitePlayerModal';
import { AddPlayerModal } from '../components/AddPlayerModal';
import CreateBaseTeamModal from '../components/CreateBaseTeamModal';
import EditBaseTeamModal from '../components/EditBaseTeamModal';
import { PlayerManagement } from '../components/PlayerManagement';
import { JoinTeamSection } from '../components/JoinTeamSection';
import { Users, Plus, Send, UserPlus, Trophy, AlertCircle, Bell, CheckCircle, XCircle, Shield, Eye, EyeOff, ChevronDown, ChevronUp, Edit, Search } from 'lucide-react';

interface CaptainInvitation {
  id: string;
  team_id: string;
  subject: string;
  content: string;
  created_at: string;
  action_required: boolean;
  action_taken: boolean;
  metadata: {
    team_id: string;
    action: string;
  };
  team?: {
    id: string;
    name: string;
    championship: {
      name: string;
    };
  };
}

export const MyTeams = () => {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [baseTeams, setBaseTeams] = useState<BaseTeam[]>([]);
  const [players, setPlayers] = useState<{ [teamId: string]: Player[] }>({});
  const [memberBaseTeams, setMemberBaseTeams] = useState<any[]>([]); // equipos base donde soy jugador
  const [memberChampTeams, setMemberChampTeams] = useState<any[]>([]); // equipos campeonato donde soy jugador
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [receivedInvitations, setReceivedInvitations] = useState<Invitation[]>([]);
  const [captainInvitations, setCaptainInvitations] = useState<CaptainInvitation[]>([]);
  const [expandedCaptainTeams, setExpandedCaptainTeams] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showCreateBaseTeamModal, setShowCreateBaseTeamModal] = useState(false);
  const [showEditBaseTeamModal, setShowEditBaseTeamModal] = useState(false);
  const [showJoinSearch, setShowJoinSearch] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedBaseTeam, setSelectedBaseTeam] = useState<BaseTeam | null>(null);
  const [expandedBaseTeams, setExpandedBaseTeams] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (profile) {
      fetchMyTeams();
    }
  }, [profile]);

  const fetchMyTeams = async () => {
    try {
      const { data: baseTeamsData } = await supabase
        .from('base_teams')
        .select('*')
        .eq('owner_id', profile?.id)
        .order('created_at', { ascending: false });

      if (baseTeamsData) setBaseTeams(baseTeamsData);

      const { data: teamsData } = await supabase
        .from('teams')
        .select('*, championship:championships!teams_championship_id_fkey(*)')
        .eq('captain_id', profile?.id);

      if (teamsData) {
        setTeams(teamsData);

        for (const team of teamsData) {
          const { data: teamPlayersData } = await supabase
            .from('team_players')
            .select('player_id, is_active, player_profiles(id, full_name, position, jersey_number, photo_url)')
            .eq('team_id', team.id);

          if (teamPlayersData) {
            const playersData = teamPlayersData
              .filter(tp => tp.player_profiles !== null)
              .map(tp => ({
                id: tp.player_profiles.id,
                name: tp.player_profiles.full_name,
                position: tp.player_profiles.position,
                jersey_number: tp.player_profiles.jersey_number,
                photo_url: tp.player_profiles.photo_url,
                is_active: tp.is_active,
                team_id: team.id,
              }));
            setPlayers((prev) => ({ ...prev, [team.id]: playersData as any }));
          }
        }
      }

      const { data: captainInvitationsData } = await supabase
        .from('messages')
        .select('*, team:teams!messages_team_id_fkey(id, name, championship:championships!teams_championship_id_fkey(name))')
        .eq('to_user_id', profile?.id)
        .eq('message_type', 'captain_invitation')
        .eq('action_required', true)
        .eq('action_taken', false)
        .order('created_at', { ascending: false });

      if (captainInvitationsData) setCaptainInvitations(captainInvitationsData as any);

      const { data: challengesData } = await supabase
        .from('challenges')
        .select('*, challenger_team:teams!challenges_challenger_team_id_fkey(name), challenged_team:teams!challenges_challenged_team_id_fkey(name)')
        .or(`challenger_team_id.in.(${teamsData?.map((t) => t.id).join(',')}),challenged_team_id.in.(${teamsData?.map((t) => t.id).join(',')})`)
        .order('created_at', { ascending: false });

      if (challengesData) setChallenges(challengesData);

      const { data: invitationsData } = await supabase
        .from('invitations')
        .select('*, team:teams!invitations_team_id_fkey(name), invited_user:profiles!invitations_invited_user_id_fkey(full_name)')
        .in('team_id', teamsData?.map((t) => t.id) || [])
        .order('created_at', { ascending: false });

      if (invitationsData) setInvitations(invitationsData);

      const { data: receivedInvitationsData } = await supabase
        .from('invitations')
        .select('*, team:teams!invitations_team_id_fkey(name, championship:championships!teams_championship_id_fkey(name)), invited_by_user:profiles!invitations_invited_by_user_id_fkey(full_name)')
        .eq('invited_user_id', profile?.id)
        .order('created_at', { ascending: false });

      if (receivedInvitationsData) setReceivedInvitations(receivedInvitationsData);

      // Equipos base donde soy jugador (no dueño)
      const { data: basePlayerData } = await supabase
        .from('base_team_players')
        .select('id, role, joined_at, base_team_id, base_teams(id, name, logo_url, owner_id, owner:profiles!base_teams_owner_id_fkey(full_name))')
        .eq('player_id', profile?.id)
        .eq('status', 'active');

      const ownedIds = new Set(baseTeamsData?.map((t) => t.id) || []);
      const filtered = (basePlayerData || []).filter(
        (m: any) => !ownedIds.has(m.base_team_id)
      );
      setMemberBaseTeams(filtered);

      // Equipos campeonato donde soy jugador (no capitán)
      const captainIds = new Set(teamsData?.map((t) => t.id) || []);
      const { data: playerTeamIds } = await supabase
        .from('team_players')
        .select('team_id')
        .eq('player_id', profile?.id)
        .eq('is_active', true);

      const nonCaptainIds = (playerTeamIds || [])
        .map((r: any) => r.team_id)
        .filter((id: string) => !captainIds.has(id));

      if (nonCaptainIds.length > 0) {
        const { data: memberTeamsData } = await supabase
          .from('teams')
          .select('id, name, logo_url, stamina, championship:championships!teams_championship_id_fkey(name, status), captain:profiles!teams_captain_id_fkey(full_name)')
          .in('id', nonCaptainIds);
        setMemberChampTeams(memberTeamsData || []);
      } else {
        setMemberChampTeams([]);
      }

    } catch (error) {
      console.error('Error fetching my teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const respondToChallenge = async (challengeId: string, accept: boolean) => {
    try {
      await supabase
        .from('challenges')
        .update({
          status: accept ? 'accepted' : 'rejected',
          responded_at: new Date().toISOString(),
        })
        .eq('id', challengeId);

      fetchMyTeams();
    } catch (error) {
      console.error('Error responding to challenge:', error);
    }
  };

  const toggleBaseTeamStatus = async (teamId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      const { data, error } = await supabase
        .from('base_teams')
        .update({ status: newStatus })
        .eq('id', teamId)
        .select();

      if (error) {
        console.error('Error updating team status:', error);
        alert(`Error al actualizar el estado del equipo: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        console.error('No se pudo actualizar el equipo');
        alert('No tienes permiso para modificar este equipo');
        return;
      }

      fetchMyTeams();
    } catch (error: any) {
      console.error('Error updating team status:', error);
      alert(`Error al actualizar el estado del equipo: ${error.message}`);
    }
  };

  const respondToInvitation = async (invitationId: string, accept: boolean) => {
    try {
      if (accept) {
        const playerName = profile?.full_name || 'Jugador';

        const { data, error } = await supabase.rpc('accept_invitation_and_create_player', {
          invitation_id_param: invitationId,
          player_name_param: playerName,
        });

        if (error) throw error;
      } else {
        await supabase
          .from('invitations')
          .update({
            status: 'rejected',
            responded_at: new Date().toISOString(),
          })
          .eq('id', invitationId);
      }

      fetchMyTeams();
    } catch (error) {
      console.error('Error responding to invitation:', error);
      alert('Error al procesar la invitación. Por favor intenta de nuevo.');
    }
  };

  const confirmCaptainRole = async (teamId: string) => {
    try {
      const { data, error } = await supabase.rpc('confirm_captain_role', {
        p_team_id: teamId,
      });

      if (error) throw error;

      const result = data as { success: boolean; message: string };
      if (result.success) {
        alert('¡Has confirmado tu rol como capitán! Ahora puedes gestionar el equipo.');
        fetchMyTeams();
      } else {
        alert(result.message);
      }
    } catch (error: any) {
      console.error('Error confirming captain role:', error);
      alert(error.message || 'Error al confirmar el rol de capitán.');
    }
  };

  const rejectCaptainRole = async (teamId: string) => {
    try {
      const reason = prompt('¿Por qué rechazas esta invitación? (opcional)');

      const { data, error } = await supabase.rpc('reject_captain_role', {
        p_team_id: teamId,
        p_reason: reason || null,
      });

      if (error) throw error;

      const result = data as { success: boolean; message: string };
      if (result.success) {
        alert('Has rechazado la invitación como capitán.');
        fetchMyTeams();
      } else {
        alert(result.message);
      }
    } catch (error: any) {
      console.error('Error rejecting captain role:', error);
      alert(error.message || 'Error al rechazar la invitación.');
    }
  };

  const handleInvitePlayer = (team: Team) => {
    setSelectedTeam(team);
    setShowInviteModal(true);
  };

  const handleAddPlayer = (team: Team) => {
    setSelectedTeam(team);
    setShowAddPlayerModal(true);
  };

  const toggleBaseTeamExpanded = (teamId: string) => {
    setExpandedBaseTeams((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
      }
      return newSet;
    });
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
    <ProtectedRoute>
      <Layout>
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Mis Equipos</h1>
              <p className="text-gray-600 text-lg">Gestiona tus equipos y jugadores</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowJoinSearch(!showJoinSearch)}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                <Search className="h-4 w-4" />
                Buscar equipo
              </button>
              <button
                onClick={() => setShowCreateBaseTeamModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
              >
                <Plus className="h-5 w-5" />
                Crear Equipo
              </button>
            </div>
          </div>

          {/* Sección de búsqueda / bienvenida */}
          {(baseTeams.length === 0 || showJoinSearch) && (
            <JoinTeamSection
              onCreateTeam={() => {
                setShowJoinSearch(false);
                setShowCreateBaseTeamModal(true);
              }}
              onJoinedTeam={() => {
                setShowJoinSearch(false);
                fetchMyTeams();
              }}
            />
          )}

          {/* Sección Mis Equipos Base — solo si tiene equipos */}
          {baseTeams.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-6">
            <div className="flex items-start gap-4 mb-4">
              <Users className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Mis Equipos Base ({baseTeams.length})</h2>
                <p className="text-gray-700 mb-4">
                  Estos son tus equipos. Los administradores de campeonatos pueden invitarte a registrarlos en sus competiciones.
                </p>
              </div>
            </div>

            {baseTeams.length === 0 ? (
              <div className="bg-white rounded-lg p-8 text-center">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 mb-4">No has creado ningún equipo aún.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {baseTeams.map((team) => (
                  <div
                    key={team.id}
                    className={`bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow ${team.status === 'inactive' ? 'opacity-60' : ''}`}
                  >
                    <div className="p-5">
                      <div className="flex items-start gap-3 mb-3">
                        {team.logo_url ? (
                          <img
                            src={team.logo_url}
                            alt={team.name}
                            className="w-14 h-14 rounded object-cover"
                          />
                        ) : (
                          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded flex items-center justify-center">
                            <Users size={28} className="text-white" />
                          </div>
                        )}
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-gray-900">{team.name}</h3>
                          {team.status === 'inactive' && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-800 text-xs font-medium rounded">
                              Inactivo
                            </span>
                          )}
                          {team.founded_date && (
                            <p className="text-xs text-gray-500">
                              Fundado: {new Date(team.founded_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedBaseTeam(team);
                              setShowEditBaseTeamModal(true);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Editar equipo"
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => toggleBaseTeamExpanded(team.id)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            {expandedBaseTeams.has(team.id) ? (
                              <ChevronUp className="h-5 w-5" />
                            ) : (
                              <ChevronDown className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>
                      {team.description && (
                        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{team.description}</p>
                      )}
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                        <span>Creado: {new Date(team.created_at).toLocaleDateString()}</span>
                      </div>
                      <button
                        onClick={() => toggleBaseTeamStatus(team.id, team.status || 'active')}
                        className={`w-full py-2 rounded-lg transition-colors font-medium text-sm ${
                          team.status === 'active'
                            ? 'bg-red-50 text-red-700 hover:bg-red-100'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        {team.status === 'active' ? (
                          <>
                            <EyeOff className="inline h-4 w-4 mr-1" />
                            Desactivar Equipo
                          </>
                        ) : (
                          <>
                            <Eye className="inline h-4 w-4 mr-1" />
                            Activar Equipo
                          </>
                        )}
                      </button>
                    </div>

                    {expandedBaseTeams.has(team.id) && (
                      <div className="border-t border-gray-200 p-5 bg-gray-50">
                        <PlayerManagement baseTeamId={team.id} baseTeamName={team.name} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          )} {/* fin baseTeams.length > 0 */}

          {captainInvitations.length > 0 && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-100 border border-amber-300 rounded-xl p-6 shadow-lg">
              <div className="flex items-start gap-4">
                <Shield className="h-7 w-7 text-amber-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                    Invitaciones de Capitanía ({captainInvitations.length})
                  </h2>
                  <p className="text-gray-700 mb-4">Has sido designado como capitán de estos equipos. Confirma tu participación para poder gestionarlos.</p>
                  <div className="space-y-3">
                    {captainInvitations.map((invitation) => (
                      <div key={invitation.id} className="bg-white rounded-lg p-5 shadow-md border border-amber-200">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Trophy className="h-5 w-5 text-amber-600" />
                              <p className="font-bold text-gray-900 text-lg">
                                {invitation.team?.name}
                              </p>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">
                              {invitation.team?.championship?.name}
                            </p>
                            <p className="text-sm text-gray-700 mt-2 bg-amber-50 p-3 rounded-lg">
                              {invitation.content}
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              Invitación recibida: {new Date(invitation.created_at).toLocaleString('es-ES')}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => confirmCaptainRole(invitation.team_id)}
                              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 text-sm font-semibold shadow-md transition-all"
                            >
                              <CheckCircle className="h-4 w-4" />
                              Aceptar
                            </button>
                            <button
                              onClick={() => rejectCaptainRole(invitation.team_id)}
                              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-lg hover:from-red-700 hover:to-rose-700 text-sm font-semibold shadow-md transition-all"
                            >
                              <XCircle className="h-4 w-4" />
                              Rechazar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {receivedInvitations.filter((inv) => inv.status === 'pending').length > 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <Bell className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">
                    Invitaciones de Jugador ({receivedInvitations.filter((inv) => inv.status === 'pending').length})
                  </h2>
                  <div className="space-y-3">
                    {receivedInvitations
                      .filter((inv) => inv.status === 'pending')
                      .map((invitation) => (
                        <div key={invitation.id} className="bg-white rounded-lg p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900">
                                {invitation.team?.name}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">
                                {invitation.team?.championship?.name}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">
                                Invitado por: {invitation.invited_by_user?.full_name}
                              </p>
                              {invitation.message && (
                                <p className="text-sm text-gray-700 mt-2 italic">"{invitation.message}"</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => respondToInvitation(invitation.id, true)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                              >
                                Aceptar
                              </button>
                              <button
                                onClick={() => respondToInvitation(invitation.id, false)}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                              >
                                Rechazar
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === SOY CAPITÁN EN CAMPEONATOS === */}
          {teams.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Trophy className="h-6 w-6 text-emerald-600" />
                <h2 className="text-2xl font-bold text-gray-900">Soy Capitán ({teams.length})</h2>
              </div>

              <div className="space-y-3">
                {teams.map((team) => (
                  <div key={team.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-center gap-3">
                        {team.logo_url ? (
                          <img src={team.logo_url} alt={team.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Trophy className="h-6 w-6 text-white" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-gray-900">{team.name}</h3>
                            {team.captain_confirmed ? (
                              <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">Capitán</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">Pendiente confirmación</span>
                            )}
                            {!team.is_enabled && (
                              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">Deshabilitado</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 truncate">{team.championship?.name}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm text-gray-500">{players[team.id]?.length || 0} jug.</span>
                          <button
                            onClick={() => setExpandedCaptainTeams((prev) => {
                              const s = new Set(prev);
                              s.has(team.id) ? s.delete(team.id) : s.add(team.id);
                              return s;
                            })}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            {expandedCaptainTeams.has(team.id) ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {expandedCaptainTeams.has(team.id) && (
                      <div className="border-t border-gray-200 p-4 bg-gray-50">
                        {team.captain_confirmed ? (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold text-gray-700 text-sm">Jugadores</h4>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleAddPlayer(team)}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium"
                                >
                                  <Plus className="h-3 w-3" />
                                  Agregar
                                </button>
                                <button
                                  onClick={() => handleInvitePlayer(team)}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-medium"
                                >
                                  <UserPlus className="h-3 w-3" />
                                  Invitar
                                </button>
                              </div>
                            </div>
                            {players[team.id]?.length === 0 ? (
                              <p className="text-sm text-gray-500 text-center py-4">No hay jugadores en el equipo aún.</p>
                            ) : (
                              <div className="space-y-2">
                                {players[team.id]?.map((player) => (
                                  <div key={player.id} className="bg-white rounded-lg px-3 py-2 flex items-center gap-3">
                                    <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                      {player.number || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-gray-900 text-sm truncate">{player.name}</p>
                                      <p className="text-xs text-gray-500">{player.position || 'Sin posición'}</p>
                                    </div>
                                    <div className="flex gap-3 text-xs text-gray-600 flex-shrink-0">
                                      <span title="Goles">⚽ {player.goals || 0}</span>
                                      <span title="Asistencias">🅰 {player.assists || 0}</span>
                                      {(player.yellow_cards || 0) > 0 && <span title="Amarillas">🟡 {player.yellow_cards}</span>}
                                      {(player.red_cards || 0) > 0 && <span title="Rojas">🔴 {player.red_cards}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-center py-4">
                            <AlertCircle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">
                              Confirma tu rol de capitán en la sección de invitaciones para poder gestionar el equipo.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desafíos compactos */}
              {challenges.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                    <Send className="h-4 w-4 text-emerald-600" />
                    Desafíos ({challenges.length})
                  </h3>
                  <div className="space-y-2">
                    {challenges.map((challenge) => {
                      const isChallenged = teams.some((t) => t.id === challenge.challenged_team_id);
                      return (
                        <div key={challenge.id} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">
                              {challenge.challenger_team?.name} vs {challenge.challenged_team?.name}
                            </p>
                            {challenge.message && <p className="text-xs text-gray-500 mt-0.5 truncate">{challenge.message}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {challenge.status === 'pending' && isChallenged ? (
                              <>
                                <button onClick={() => respondToChallenge(challenge.id, true)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium">Aceptar</button>
                                <button onClick={() => respondToChallenge(challenge.id, false)} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium">Rechazar</button>
                              </>
                            ) : (
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${challenge.status === 'accepted' ? 'bg-green-100 text-green-700' : challenge.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {challenge.status === 'accepted' ? 'Aceptado' : challenge.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Invitaciones enviadas compactas */}
              {invitations.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                    <UserPlus className="h-4 w-4 text-emerald-600" />
                    Invitaciones Enviadas ({invitations.length})
                  </h3>
                  <div className="space-y-2">
                    {invitations.map((invitation) => (
                      <div key={invitation.id} className="bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">
                            {invitation.invited_user?.full_name} — {invitation.team?.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{new Date(invitation.created_at).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${invitation.status === 'accepted' ? 'bg-green-100 text-green-700' : invitation.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {invitation.status === 'accepted' ? 'Aceptada' : invitation.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === SOY JUGADOR === */}
          {(memberBaseTeams.length > 0 || memberChampTeams.length > 0) && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Users className="h-6 w-6 text-blue-600" />
                <h2 className="text-2xl font-bold text-gray-900">
                  Soy Jugador ({memberBaseTeams.length + memberChampTeams.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {memberBaseTeams.map((m: any) => (
                  <div key={m.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-3">
                    {m.base_teams?.logo_url ? (
                      <img src={m.base_teams.logo_url} alt={m.base_teams?.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Users className="h-6 w-6 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 truncate">{m.base_teams?.name}</p>
                      <p className="text-sm text-gray-500 truncate">Capitán: {m.base_teams?.owner?.full_name || 'Desconocido'}</p>
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">Equipo (fuera de campeonato)</span>
                    </div>
                  </div>
                ))}
                {memberChampTeams.map((team: any) => (
                  <div key={team.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-3">
                    {team.logo_url ? (
                      <img src={team.logo_url} alt={team.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Trophy className="h-6 w-6 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 truncate">{team.name}</p>
                      <p className="text-sm text-gray-500 truncate">{team.championship?.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">Campeonato</span>
                        {team.captain?.full_name && <span className="text-xs text-gray-500">Cap: {team.captain.full_name}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {showCreateBaseTeamModal && (
          <CreateBaseTeamModal
            onClose={() => setShowCreateBaseTeamModal(false)}
            onSuccess={() => {
              setShowCreateBaseTeamModal(false);
              fetchMyTeams();
            }}
          />
        )}

        {showInviteModal && selectedTeam && (
          <InvitePlayerModal
            team={selectedTeam}
            onClose={() => {
              setShowInviteModal(false);
              setSelectedTeam(null);
            }}
            onSuccess={() => {
              fetchMyTeams();
            }}
          />
        )}

        {showAddPlayerModal && selectedTeam && (
          <AddPlayerModal
            team={selectedTeam}
            onClose={() => {
              setShowAddPlayerModal(false);
              setSelectedTeam(null);
            }}
            onSuccess={() => {
              fetchMyTeams();
            }}
          />
        )}

        {showEditBaseTeamModal && selectedBaseTeam && (
          <EditBaseTeamModal
            team={selectedBaseTeam}
            onClose={() => {
              setShowEditBaseTeamModal(false);
              setSelectedBaseTeam(null);
            }}
            onSuccess={() => {
              setShowEditBaseTeamModal(false);
              setSelectedBaseTeam(null);
              fetchMyTeams();
            }}
          />
        )}
      </Layout>
    </ProtectedRoute>
  );
};
