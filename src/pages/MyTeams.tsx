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
import { Users, Plus, Send, UserPlus, Trophy, AlertCircle, Bell, Target, Award, CheckCircle, XCircle, Shield, Eye, EyeOff, ChevronDown, ChevronUp, Edit } from 'lucide-react';

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
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [receivedInvitations, setReceivedInvitations] = useState<Invitation[]>([]);
  const [captainInvitations, setCaptainInvitations] = useState<CaptainInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showCreateBaseTeamModal, setShowCreateBaseTeamModal] = useState(false);
  const [showEditBaseTeamModal, setShowEditBaseTeamModal] = useState(false);
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
            .eq('team_id', team.id)
            .eq('is_active', true);

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
            <button
              onClick={() => setShowCreateBaseTeamModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              <Plus className="h-5 w-5" />
              Crear Equipo
            </button>
          </div>

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
                <button
                  onClick={() => setShowCreateBaseTeamModal(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                >
                  <Plus className="h-5 w-5" />
                  Crear Mi Primer Equipo
                </button>
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

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-start gap-4 mb-6">
              <Trophy className="h-6 w-6 text-emerald-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Equipos en Campeonatos ({teams.length})</h2>
                <p className="text-gray-600">
                  Aquí aparecen los equipos donde eres capitán y que están participando en campeonatos activos.
                </p>
              </div>
            </div>

            {teams.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-12 text-center">
                <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900 mb-2">No eres capitán de ningún equipo en campeonatos</h3>
                <p className="text-gray-600">
                  Espera a que un administrador te designe como capitán de un equipo en algún campeonato.
                </p>
              </div>
            ) : (
            <div className="space-y-8">
              {teams.map((team) => (
                <div key={team.id} className="bg-white rounded-xl shadow-md overflow-hidden">
                  <div className={`p-6 text-white ${
                    team.captain_confirmed
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
                      : 'bg-gradient-to-r from-gray-500 to-gray-600'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h2 className="text-2xl font-bold">{team.name}</h2>
                          {!team.captain_confirmed && (
                            <span className="bg-yellow-500 text-yellow-900 text-xs font-semibold px-3 py-1 rounded-full">
                              Pendiente de Confirmación
                            </span>
                          )}
                          {!team.is_enabled && (
                            <span className="bg-red-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                              Deshabilitado
                            </span>
                          )}
                        </div>
                        <p className={team.captain_confirmed ? 'text-emerald-50' : 'text-gray-200'}>
                          {team.championship?.name}
                        </p>
                        {!team.captain_confirmed && (
                          <p className="text-sm text-gray-200 mt-2 bg-black/20 p-2 rounded">
                            Debes confirmar tu rol como capitán para gestionar este equipo
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="bg-white/20 rounded-lg px-4 py-2">
                          <p className="text-sm text-emerald-50">Stamina</p>
                          <p className="text-2xl font-bold">{team.stamina}/100</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    {team.captain_confirmed ? (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Jugadores ({players[team.id]?.length || 0})
                          </h3>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAddPlayer(team)}
                              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                            >
                              <Plus className="h-4 w-4" />
                              Agregar Jugador
                            </button>
                            <button
                              onClick={() => handleInvitePlayer(team)}
                              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                            >
                              <UserPlus className="h-4 w-4" />
                              Invitar Usuario
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                        <AlertCircle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                        <p className="text-gray-700 font-medium">
                          Confirma tu rol como capitán en la sección de invitaciones para poder gestionar este equipo
                        </p>
                      </div>
                    )}

                    {team.captain_confirmed && players[team.id]?.length === 0 && (
                      <p className="text-gray-600 text-center py-4">No hay jugadores en el equipo aún.</p>
                    )}

                    {team.captain_confirmed && players[team.id]?.length > 0 && (
                      <div className="space-y-3">
                        {players[team.id]?.map((player) => (
                          <div key={player.id} className="bg-gray-50 rounded-lg p-4">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                {player.number || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-bold text-gray-900 text-lg">{player.name}</p>
                                  {!player.is_active && (
                                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Inactivo</span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 mb-3">{player.position || 'Sin posición'}</p>

                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                  <div className="bg-white rounded-lg p-2 text-center">
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                      <Target className="h-3 w-3 text-emerald-600" />
                                      <p className="text-xs text-gray-600">Goles</p>
                                    </div>
                                    <p className="text-lg font-bold text-gray-900">{player.goals}</p>
                                  </div>
                                  <div className="bg-white rounded-lg p-2 text-center">
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                      <Award className="h-3 w-3 text-blue-600" />
                                      <p className="text-xs text-gray-600">Asist.</p>
                                    </div>
                                    <p className="text-lg font-bold text-gray-900">{player.assists}</p>
                                  </div>
                                  <div className="bg-white rounded-lg p-2 text-center">
                                    <p className="text-xs text-gray-600 mb-1">Partidos</p>
                                    <p className="text-lg font-bold text-gray-900">{player.matches_played}</p>
                                  </div>
                                  <div className="bg-yellow-50 rounded-lg p-2 text-center">
                                    <p className="text-xs text-yellow-700 mb-1">Amar.</p>
                                    <p className="text-lg font-bold text-yellow-700">{player.yellow_cards}</p>
                                  </div>
                                  <div className="bg-red-50 rounded-lg p-2 text-center">
                                    <p className="text-xs text-red-700 mb-1">Rojas</p>
                                    <p className="text-lg font-bold text-red-700">{player.red_cards}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {challenges.length > 0 && (
                <div className="bg-white rounded-xl shadow-md p-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Send className="h-6 w-6 text-emerald-600" />
                    Desafíos
                  </h2>

                  <div className="space-y-3">
                    {challenges.map((challenge) => {
                      const isChallenged = teams.some((t) => t.id === challenge.challenged_team_id);

                      return (
                        <div key={challenge.id} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900">
                                {challenge.challenger_team?.name} vs {challenge.challenged_team?.name}
                              </p>
                              {challenge.message && (
                                <p className="text-sm text-gray-600 mt-1">{challenge.message}</p>
                              )}
                              <p className="text-xs text-gray-500 mt-2">
                                {new Date(challenge.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {challenge.status === 'pending' && isChallenged && (
                                <>
                                  <button
                                    onClick={() => respondToChallenge(challenge.id, true)}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                  >
                                    Aceptar
                                  </button>
                                  <button
                                    onClick={() => respondToChallenge(challenge.id, false)}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                                  >
                                    Rechazar
                                  </button>
                                </>
                              )}
                              {challenge.status !== 'pending' && (
                                <span
                                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                                    challenge.status === 'accepted'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {challenge.status === 'accepted' ? 'Aceptado' : 'Rechazado'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {invitations.length > 0 && (
                <div className="bg-white rounded-xl shadow-md p-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <UserPlus className="h-6 w-6 text-emerald-600" />
                    Invitaciones Enviadas
                  </h2>

                  <div className="space-y-3">
                    {invitations.map((invitation) => (
                      <div key={invitation.id} className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">
                            {invitation.invited_user?.full_name} - {invitation.team?.name}
                          </p>
                          {invitation.message && (
                            <p className="text-sm text-gray-600 mt-1">{invitation.message}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-2">
                            {new Date(invitation.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${
                            invitation.status === 'accepted'
                              ? 'bg-green-100 text-green-700'
                              : invitation.status === 'rejected'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {invitation.status === 'accepted' ? 'Aceptada' : invitation.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
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
