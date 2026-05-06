import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Plus, Trash2, Edit2, Mail, UserX, CheckCircle, XCircle } from 'lucide-react';

interface BaseTeamPlayer {
  id: string;
  base_team_id: string;
  player_id: string;
  role: string;
  jersey_number: number | null;
  position: string | null;
  joined_at: string;
  status: string;
  player_profiles: {
    id: string;
    full_name: string;
    photo_url: string | null;
    position: string | null;
  };
}

interface BaseTeamInvitation {
  id: string;
  base_team_id: string;
  player_email: string;
  player_id: string | null;
  status: string;
  expires_at: string;
  created_at: string;
}

interface PlayerManagementProps {
  baseTeamId: string;
  baseTeamName: string;
}

export const PlayerManagement = ({ baseTeamId, baseTeamName }: PlayerManagementProps) => {
  const [players, setPlayers] = useState<BaseTeamPlayer[]>([]);
  const [invitations, setInvitations] = useState<BaseTeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showInvitePlayer, setShowInvitePlayer] = useState(false);
  const [email, setEmail] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    role: 'player',
    jersey_number: '',
    position: '',
  });

  useEffect(() => {
    fetchData();
  }, [baseTeamId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchPlayers(), fetchInvitations(), fetchAvailablePlayers()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayers = async () => {
    const { data, error } = await supabase
      .from('base_team_players')
      .select('*, player_profiles(id, full_name, photo_url, position)')
      .eq('base_team_id', baseTeamId)
      .eq('status', 'active')
      .order('joined_at', { ascending: true });

    if (error) {
      console.error('Error fetching players:', error);
      return;
    }

    setPlayers(data || []);
  };

  const fetchInvitations = async () => {
    const { data, error } = await supabase
      .from('base_team_invitations')
      .select('*')
      .eq('base_team_id', baseTeamId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invitations:', error);
      return;
    }

    setInvitations(data || []);
  };

  const fetchAvailablePlayers = async () => {
    const { data, error } = await supabase
      .from('player_profiles')
      .select('id, full_name, position, photo_url')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('Error fetching available players:', error);
      return;
    }

    setAvailablePlayers(data || []);
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPlayerId) {
      alert('Por favor selecciona un jugador');
      return;
    }

    try {
      const { error } = await supabase.from('base_team_players').insert({
        base_team_id: baseTeamId,
        player_id: selectedPlayerId,
        role: 'player',
        status: 'active',
      });

      if (error) throw error;

      alert('Jugador agregado exitosamente');
      setShowAddPlayer(false);
      setSelectedPlayerId('');
      fetchData();
    } catch (error: any) {
      console.error('Error adding player:', error);
      alert(error.message || 'Error al agregar jugador');
    }
  };

  const handleInvitePlayer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      alert('Por favor ingresa un email');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const { data: playerData } = await supabase
        .from('player_profiles')
        .select('id')
        .eq('id', (await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle())?.data?.id || '')
        .maybeSingle();

      const { error } = await supabase.from('base_team_invitations').insert({
        base_team_id: baseTeamId,
        player_email: email,
        player_id: playerData?.id || null,
        invited_by: user.id,
        status: 'pending',
      });

      if (error) throw error;

      alert('Invitación enviada exitosamente');
      setShowInvitePlayer(false);
      setEmail('');
      fetchData();
    } catch (error: any) {
      console.error('Error inviting player:', error);
      alert(error.message || 'Error al enviar invitación');
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    if (!confirm('¿Estás seguro de querer remover este jugador del equipo?')) return;

    try {
      const { error } = await supabase
        .from('base_team_players')
        .update({ status: 'inactive' })
        .eq('id', playerId);

      if (error) throw error;

      alert('Jugador removido exitosamente');
      fetchData();
    } catch (error: any) {
      console.error('Error removing player:', error);
      alert(error.message || 'Error al remover jugador');
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm('¿Estás seguro de querer cancelar esta invitación?')) return;

    try {
      const { error } = await supabase
        .from('base_team_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId);

      if (error) throw error;

      alert('Invitación cancelada');
      fetchData();
    } catch (error: any) {
      console.error('Error cancelling invitation:', error);
      alert(error.message || 'Error al cancelar invitación');
    }
  };

  const handleEditPlayer = (player: BaseTeamPlayer) => {
    setEditingPlayer(player.id);
    setEditForm({
      role: player.role,
      jersey_number: player.jersey_number?.toString() || '',
      position: player.position || '',
    });
  };

  const handleSaveEdit = async (playerId: string) => {
    try {
      const { error } = await supabase
        .from('base_team_players')
        .update({
          role: editForm.role,
          jersey_number: editForm.jersey_number ? parseInt(editForm.jersey_number) : null,
          position: editForm.position || null,
        })
        .eq('id', playerId);

      if (error) throw error;

      setEditingPlayer(null);
      fetchData();
    } catch (error: any) {
      console.error('Error updating player:', error);
      alert(error.message || 'Error al actualizar jugador');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-600" />
          Jugadores del Equipo ({players.length})
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddPlayer(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Agregar Jugador
          </button>
          <button
            onClick={() => setShowInvitePlayer(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
          >
            <Mail className="h-4 w-4" />
            Invitar por Email
          </button>
        </div>
      </div>

      {players.length === 0 && invitations.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-2" />
          <p>No hay jugadores en el equipo aún.</p>
        </div>
      ) : (
        <>
          {invitations.length > 0 && (
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Mail className="h-4 w-4 text-yellow-600" />
                Invitaciones Pendientes ({invitations.length})
              </h4>
              <div className="space-y-2">
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center justify-between bg-white rounded p-3">
                    <div>
                      <p className="font-medium text-gray-900">{invitation.player_email}</p>
                      <p className="text-xs text-gray-500">
                        Enviada: {new Date(invitation.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        Expira: {new Date(invitation.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCancelInvitation(invitation.id)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {players.map((player) => (
              <div key={player.id} className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
                {editingPlayer === player.id ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      {player.player_profiles.photo_url ? (
                        <img
                          src={player.player_profiles.photo_url}
                          alt={player.player_profiles.full_name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold">
                          {player.player_profiles.full_name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{player.player_profiles.full_name}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Rol</label>
                        <select
                          value={editForm.role}
                          onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="player">Jugador</option>
                          <option value="subcaptain">Subcapitán</option>
                          <option value="captain">Capitán</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Número</label>
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={editForm.jersey_number}
                          onChange={(e) => setEditForm({ ...editForm, jersey_number: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Posición</label>
                        <select
                          value={editForm.position}
                          onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="">Sin definir</option>
                          <option value="goalkeeper">Portero</option>
                          <option value="defender">Defensa</option>
                          <option value="midfielder">Mediocampista</option>
                          <option value="forward">Delantero</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(player.id)}
                        className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditingPlayer(null)}
                        className="flex items-center gap-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
                      >
                        <XCircle className="h-4 w-4" />
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {player.player_profiles.photo_url ? (
                        <img
                          src={player.player_profiles.photo_url}
                          alt={player.player_profiles.full_name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {player.jersey_number || player.player_profiles.full_name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-gray-900">{player.player_profiles.full_name}</p>
                          {player.role === 'captain' && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                              Capitán
                            </span>
                          )}
                          {player.role === 'subcaptain' && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                              Subcapitán
                            </span>
                          )}
                        </div>
                        <div className="flex gap-4 text-sm text-gray-600">
                          {player.position && <span>Posición: {player.position}</span>}
                          {player.jersey_number && <span>Número: #{player.jersey_number}</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Se unió: {new Date(player.joined_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditPlayer(player)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleRemovePlayer(player.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {showAddPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Agregar Jugador</h3>
            <form onSubmit={handleAddPlayer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Seleccionar Jugador
                </label>
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  required
                >
                  <option value="">Selecciona un jugador...</option>
                  {availablePlayers
                    .filter((p) => !players.some((bp) => bp.player_id === p.id))
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.full_name} {player.position ? `- ${player.position}` : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium"
                >
                  Agregar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddPlayer(false);
                    setSelectedPlayerId('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInvitePlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Invitar Jugador por Email</h3>
            <form onSubmit={handleInvitePlayer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email del Jugador
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="jugador@ejemplo.com"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  El jugador recibirá una invitación para unirse a {baseTeamName}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium"
                >
                  Enviar Invitación
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInvitePlayer(false);
                    setEmail('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
