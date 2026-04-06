import { useState, useEffect } from 'react';
import { Team } from '../../types/database';
import { supabase } from '../../lib/supabase';
import { X, Search, User } from 'lucide-react';

interface AssignCaptainModalProps {
  team: Team;
  onClose: () => void;
  onSuccess: () => void;
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
}

export const AssignCaptainModal = ({ team, onClose, onSuccess }: AssignCaptainModalProps) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      const filtered = users.filter(user =>
        user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(users);
    }
  }, [searchTerm, users]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.rpc('get_all_profiles');

      if (error) {
        console.error('Error fetching users:', error);
        setError('Error al cargar usuarios');
        return;
      }

      if (data) {
        setUsers(data);
        setFilteredUsers(data);
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Error al cargar usuarios');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUserId) {
      setError('Por favor selecciona un usuario');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: assignError } = await supabase.rpc('assign_team_captain', {
        team_id_param: team.id,
        new_captain_id: selectedUserId
      });

      if (assignError) {
        console.error('Error assigning captain:', assignError);
        throw new Error(`Error al asignar capitán: ${assignError.message}`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error assigning captain:', err);
      setError(err.message || 'Error al asignar capitán');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Asignar Capitán</h2>
            <p className="text-sm text-gray-600 mt-1">Equipo: {team.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Buscar Usuario
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre o email..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Seleccionar Usuario *
            </label>
            <div className="border border-gray-300 rounded-lg max-h-96 overflow-y-auto">
              {loadingUsers ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto"></div>
                  <p className="text-gray-600 mt-2">Cargando usuarios...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-gray-600">
                  <User className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p>No se encontraron usuarios</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredUsers.map((user) => (
                    <label
                      key={user.id}
                      className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedUserId === user.id ? 'bg-emerald-50' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="user"
                        value={user.id}
                        checked={selectedUserId === user.id}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{user.full_name}</p>
                        <p className="text-sm text-gray-600">{user.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>

        <div className="border-t px-6 py-4 bg-gray-50 rounded-b-xl flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedUserId}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Asignando...' : 'Asignar Capitán'}
          </button>
        </div>
      </div>
    </div>
  );
};
