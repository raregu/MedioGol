import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Plus, AlertTriangle, CheckCircle } from 'lucide-react';

interface Player {
  id: string;
  full_name: string;
}

interface Sanction {
  id: string;
  championship_id: string;
  player_id: string;
  match_id?: string;
  type: string;
  reason: string;
  rounds_suspended?: number;
  start_date?: string;
  end_date?: string;
  created_at: string;
  player_profiles: {
    full_name: string;
  };
}

interface SanctionsManagementModalProps {
  championshipId: string;
  onClose: () => void;
  onSuccess: () => void;
  onSanctionDeleted?: () => void;
}

export const SanctionsManagementModal = ({
  championshipId,
  onClose,
  onSuccess,
  onSanctionDeleted,
}: SanctionsManagementModalProps) => {
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [newSanction, setNewSanction] = useState({
    player_id: '',
    type: 'suspension',
    reason: '',
    rounds_suspended: 1,
    start_date: '',
    end_date: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [sanctionsRes, playersRes] = await Promise.all([
        supabase
          .from('sanctions')
          .select('*, player_profiles(full_name)')
          .eq('championship_id', championshipId)
          .order('created_at', { ascending: false }),
        supabase
          .from('player_profiles')
          .select('id, full_name')
      ]);

      if (sanctionsRes.data) {
        setSanctions(sanctionsRes.data as any);
      }

      if (playersRes.data) {
        setPlayers(playersRes.data as any);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSanction = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const insertData: any = {
        championship_id: championshipId,
        player_id: newSanction.player_id,
        type: newSanction.type,
        reason: newSanction.reason,
      };

      if (newSanction.type === 'suspension' && newSanction.rounds_suspended) {
        insertData.rounds_suspended = newSanction.rounds_suspended;
      }

      if (newSanction.start_date) {
        insertData.start_date = newSanction.start_date;
      }

      if (newSanction.end_date) {
        insertData.end_date = newSanction.end_date;
      }

      const { error } = await supabase.from('sanctions').insert(insertData);

      if (error) throw error;

      setShowAddForm(false);
      setNewSanction({
        player_id: '',
        type: 'suspension',
        reason: '',
        rounds_suspended: 1,
        start_date: '',
        end_date: '',
      });
      fetchData();
      alert('Sanción agregada exitosamente');
    } catch (error) {
      console.error('Error adding sanction:', error);
      alert('Error al agregar la sanción');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSanction = async (sanctionId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta sanción?')) return;

    try {
      console.log('Attempting to delete sanction with ID:', sanctionId);

      const { data, error } = await supabase
        .from('sanctions')
        .delete()
        .eq('id', sanctionId)
        .select();

      console.log('Delete response - data:', data);
      console.log('Delete response - error:', error);

      if (error) {
        console.error('Error deleting sanction:', error);
        alert(`Error al eliminar la sanción: ${error.message}`);
        return;
      }

      console.log('Sanction deleted successfully, updating local state');

      // Remove sanction from state immediately
      setSanctions(prev => prev.filter(s => s.id !== sanctionId));

      // Notify parent component
      if (onSanctionDeleted) {
        onSanctionDeleted();
      }

      alert('Sanción eliminada exitosamente');
    } catch (error: any) {
      console.error('Error deleting sanction:', error);
      alert(`Error al eliminar la sanción: ${error.message || 'Error desconocido'}`);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full p-8">
          <p className="text-center">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full my-8">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Sanciones</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              <Plus className="h-5 w-5" />
              Nueva Sanción
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddSanction} className="bg-gray-50 rounded-lg p-6 mb-6 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Agregar Sanción</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Jugador
                </label>
                <select
                  value={newSanction.player_id}
                  onChange={(e) => setNewSanction({ ...newSanction, player_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  required
                >
                  <option value="">Seleccionar jugador</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Sanción
                </label>
                <select
                  value={newSanction.type}
                  onChange={(e) => setNewSanction({ ...newSanction, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="suspension">Suspensión</option>
                  <option value="warning">Advertencia</option>
                  <option value="fine">Multa</option>
                  <option value="expulsion">Expulsión</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motivo
                </label>
                <textarea
                  value={newSanction.reason}
                  onChange={(e) => setNewSanction({ ...newSanction, reason: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Describe el motivo de la sanción..."
                  required
                />
              </div>

              {newSanction.type === 'suspension' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fechas de Suspensión
                  </label>
                  <input
                    type="number"
                    value={newSanction.rounds_suspended}
                    onChange={(e) => setNewSanction({ ...newSanction, rounds_suspended: parseInt(e.target.value) })}
                    min="1"
                    max="10"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="Número de fechas"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha de Inicio (opcional)
                  </label>
                  <input
                    type="date"
                    value={newSanction.start_date}
                    onChange={(e) => setNewSanction({ ...newSanction, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha de Fin (opcional)
                  </label>
                  <input
                    type="date"
                    value={newSanction.end_date}
                    onChange={(e) => setNewSanction({ ...newSanction, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 font-medium"
                >
                  {submitting ? 'Guardando...' : 'Agregar Sanción'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {sanctions.length === 0 ? (
              <p className="text-gray-600 text-center py-8">No hay sanciones registradas</p>
            ) : (
              sanctions.map((sanction) => {
                const isActive = sanction.end_date
                  ? new Date(sanction.end_date) >= new Date()
                  : true;

                return (
                  <div
                    key={sanction.id}
                    className={`border rounded-lg p-4 ${
                      isActive
                        ? 'border-red-200 bg-red-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {isActive ? (
                            <AlertTriangle className="h-5 w-5 text-red-600" />
                          ) : (
                            <CheckCircle className="h-5 w-5 text-gray-600" />
                          )}
                          <div>
                            <p className="font-semibold text-gray-900">{sanction.player_profiles.full_name}</p>
                          </div>
                        </div>

                        <div className="ml-8 space-y-1">
                          <div className="flex gap-2">
                            <span className="px-2 py-1 bg-white rounded text-xs font-medium text-gray-700 capitalize">
                              {sanction.type}
                            </span>
                            {isActive && (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                                Activa
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-gray-700">{sanction.reason}</p>

                          {sanction.type === 'suspension' && sanction.rounds_suspended && (
                            <p className="text-sm font-medium text-gray-900">
                              Fechas de suspensión: {sanction.rounds_suspended}
                            </p>
                          )}

                          {sanction.start_date && (
                            <p className="text-xs text-gray-600">
                              Inicio: {new Date(sanction.start_date).toLocaleDateString()}
                            </p>
                          )}

                          {sanction.end_date && (
                            <p className="text-xs text-gray-600">
                              Fin: {new Date(sanction.end_date).toLocaleDateString()}
                            </p>
                          )}

                          <p className="text-xs text-gray-500">
                            Creada: {new Date(sanction.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleDeleteSanction(sanction.id)}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onSuccess}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
