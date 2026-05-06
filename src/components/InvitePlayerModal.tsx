import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, Team } from '../types/database';
import { X, UserPlus, Search } from 'lucide-react';

interface InvitePlayerModalProps {
  team: Team;
  onClose: () => void;
  onSuccess: () => void;
}

export const InvitePlayerModal = ({ team, onClose, onSuccess }: InvitePlayerModalProps) => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: baseTeamsData } = await supabase
        .from('base_teams')
        .select('id')
        .eq('owner_id', user.id);

      if (!baseTeamsData || baseTeamsData.length === 0) {
        setUsers([]);
        return;
      }

      const baseTeamIds = baseTeamsData.map(bt => bt.id);

      const { data: baseTeamPlayersData } = await supabase
        .from('base_team_players')
        .select('user_id')
        .in('base_team_id', baseTeamIds);

      if (!baseTeamPlayersData || baseTeamPlayersData.length === 0) {
        setUsers([]);
        return;
      }

      const userIds = baseTeamPlayersData.map(btp => btp.user_id);

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds)
        .order('full_name');

      if (data) setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const filteredUsers = users.filter((user) =>
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleInvite = async () => {
    if (!selectedUser) {
      setError('Selecciona un usuario para invitar');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('id')
        .eq('team_id', team.id)
        .eq('user_id', selectedUser.id)
        .maybeSingle();

      if (existingPlayer) {
        setError('Este usuario ya es jugador del equipo');
        setLoading(false);
        return;
      }

      const { data: existingInvitation } = await supabase
        .from('invitations')
        .select('id')
        .eq('team_id', team.id)
        .eq('invited_user_id', selectedUser.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingInvitation) {
        setError('Ya existe una invitación pendiente para este usuario');
        setLoading(false);
        return;
      }

      const { error: inviteError } = await supabase
        .from('invitations')
        .insert({
          team_id: team.id,
          invited_user_id: selectedUser.id,
          invited_by_user_id: (await supabase.auth.getUser()).data.user?.id,
          message: message || `Te invitamos a unirte a ${team.name}`,
          status: 'pending',
        });

      if (inviteError) throw inviteError;

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error sending invitation:', err);
      setError('Error al enviar la invitación. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-emerald-600" />
            Invitar Jugador a {team.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Buscar Usuario
            </label>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
              <p className="text-sm text-blue-800">
                Solo se muestran usuarios de tus equipos base
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seleccionar Usuario
            </label>
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg divide-y">
              {filteredUsers.length === 0 ? (
                <p className="text-center text-gray-600 py-8">No se encontraron usuarios</p>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                      selectedUser?.id === user.id ? 'bg-emerald-50 border-l-4 border-emerald-600' : ''
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{user.full_name}</p>
                    <p className="text-sm text-gray-600 capitalize">{user.role.replace('_', ' ')}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          {selectedUser && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm text-emerald-800">
                Usuario seleccionado: <strong>{selectedUser.full_name}</strong>
              </p>
            </div>
          )}

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
              Mensaje (Opcional)
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Escribe un mensaje personalizado para la invitación..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleInvite}
              disabled={loading || !selectedUser}
              className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Enviando...' : 'Enviar Invitación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
