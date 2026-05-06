import { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, AlertCircle, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ShiftManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  championshipId: string;
  championshipName: string;
}

interface ShiftManagerAssignment {
  id: string;
  user_id: string;
  assigned_at: string;
  is_active: boolean;
  profiles: {
    full_name: string;
    email: string;
  };
}

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function ShiftManagerModal({
  isOpen,
  onClose,
  championshipId,
  championshipName,
}: ShiftManagerModalProps) {
  const [assignments, setAssignments] = useState<ShiftManagerAssignment[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchAssignments();
      fetchAvailableUsers();
    }
  }, [isOpen, championshipId]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredUsers([]);
      setShowResults(false);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = availableUsers.filter(
        (user) =>
          user.full_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)
      );
      setFilteredUsers(filtered);
      setShowResults(true);
    }
  }, [searchQuery, availableUsers]);

  const fetchAssignments = async () => {
    try {
      const { data: assignmentsData, error } = await supabase
        .from('shift_manager_assignments')
        .select(`
          id,
          user_id,
          assigned_at,
          is_active
        `)
        .eq('championship_id', championshipId)
        .order('assigned_at', { ascending: false });

      if (error) throw error;

      // Get user details for assigned users
      const assignmentsWithUserData = await Promise.all(
        (assignmentsData || []).map(async (assignment) => {
          const { data: userData } = await supabase
            .rpc('get_users_by_role', { role_filter: 'encargado_turno' });

          const user = userData?.find((u: User) => u.id === assignment.user_id);

          return {
            ...assignment,
            profiles: {
              full_name: user?.full_name || 'Usuario desconocido',
              email: user?.email || 'Sin email',
            },
          };
        })
      );

      setAssignments(assignmentsWithUserData);
    } catch (err) {
      console.error('Error fetching assignments:', err);
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_users_by_role', { role_filter: 'encargado_turno' });

      if (error) throw error;
      setAvailableUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setSearchQuery(user.full_name);
    setShowResults(false);
  };

  const handleAssign = async () => {
    if (!selectedUser) return;

    setLoading(true);
    setError('');

    try {
      const { error } = await supabase
        .from('shift_manager_assignments')
        .insert({
          championship_id: championshipId,
          user_id: selectedUser.id,
          assigned_by: (await supabase.auth.getUser()).data.user?.id,
        });

      if (error) {
        console.error('error al asignar', error, error.message);
        if (error.code === '23505') {
          setError('Este usuario ya está asignado a este campeonato');
        } else {
          setError(`Error al asignar: ${error.message}`);
        }
        return;
      }

      setSelectedUser(null);
      setSearchQuery('');
      await fetchAssignments();
    } catch (err) {
      console.error('Error assigning shift manager:', err);
      setError('Error al asignar encargado de turno');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (assignmentId: string, currentStatus: boolean) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('shift_manager_assignments')
        .update({ is_active: !currentStatus })
        .eq('id', assignmentId);

      if (error) throw error;
      await fetchAssignments();
    } catch (err) {
      console.error('Error updating assignment:', err);
      setError('Error al actualizar asignación');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (assignmentId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta asignación?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('shift_manager_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
      await fetchAssignments();
    } catch (err) {
      console.error('Error deleting assignment:', err);
      setError('Error al eliminar asignación');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const assignedUserIds = assignments.map(a => a.user_id);
  const unassignedUsers = filteredUsers.filter(u => !assignedUserIds.includes(u.id));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Encargados de Turno</h2>
            <p className="text-sm text-gray-600 mt-1">{championshipName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Asignar Encargado de Turno
            </label>

            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery && setShowResults(true)}
                placeholder="Buscar por nombre o email..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />

              {showResults && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {unassignedUsers.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      {availableUsers.length === 0
                        ? 'No hay usuarios con rol "encargado_turno" en el sistema'
                        : 'No se encontraron usuarios con ese criterio de búsqueda'}
                    </div>
                  ) : (
                    unassignedUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUser(user)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                      >
                        <p className="font-medium text-gray-900">{user.full_name}</p>
                        <p className="text-sm text-gray-600">{user.email}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {selectedUser && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{selectedUser.full_name}</p>
                  <p className="text-sm text-gray-600">{selectedUser.email}</p>
                </div>
                <button
                  onClick={handleAssign}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <UserPlus className="w-5 h-5" />
                  Asignar
                </button>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Encargados Asignados ({assignments.length})
            </h3>

            {assignments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No hay encargados de turno asignados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {assignment.profiles.full_name}
                      </p>
                      <p className="text-sm text-gray-600">
                        {assignment.profiles.email}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Asignado: {new Date(assignment.assigned_at).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(assignment.id, assignment.is_active)}
                        disabled={loading}
                        className={`px-3 py-1 rounded-lg text-sm font-medium ${
                          assignment.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {assignment.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                      <button
                        onClick={() => handleDelete(assignment.id)}
                        disabled={loading}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
