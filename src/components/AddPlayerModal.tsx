import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Search, User } from 'lucide-react';
import { Team } from '../types/database';

interface AddPlayerModalProps {
  team: Team;
  onClose: () => void;
  onSuccess: () => void;
}

interface PlayerProfile {
  id: string;
  full_name: string;
  position: string | null;
  photo_url: string | null;
}

export const AddPlayerModal = ({ team, onClose, onSuccess }: AddPlayerModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [existingPlayerIds, setExistingPlayerIds] = useState<Set<string>>(new Set());
  const [availablePlayerIds, setAvailablePlayerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadExistingPlayers();
    loadAvailablePlayers();
  }, [team.id]);

  const loadExistingPlayers = async () => {
    try {
      const { data } = await supabase
        .from('team_players')
        .select('player_id')
        .eq('team_id', team.id)
        .eq('is_active', true);

      if (data) {
        setExistingPlayerIds(new Set(data.map(p => p.player_id)));
      }
    } catch (err) {
      console.error('Error loading existing players:', err);
    }
  };

  const loadAvailablePlayers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: baseTeamsData } = await supabase
        .from('base_teams')
        .select('id')
        .eq('owner_id', user.id);

      if (!baseTeamsData || baseTeamsData.length === 0) {
        setAvailablePlayerIds(new Set());
        return;
      }

      const baseTeamIds = baseTeamsData.map(bt => bt.id);

      const { data } = await supabase
        .from('base_team_players')
        .select('user_id')
        .in('base_team_id', baseTeamIds);

      if (data) {
        setAvailablePlayerIds(new Set(data.map(p => p.user_id)));
      }
    } catch (err) {
      console.error('Error loading available players:', err);
    }
  };

  useEffect(() => {
    const searchPlayers = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const { data, error: searchError } = await supabase
          .from('player_profiles')
          .select('id, full_name, position, photo_url')
          .ilike('full_name', `%${searchQuery}%`)
          .limit(10);

        if (searchError) throw searchError;

        const filtered = (data || []).filter(p =>
          !existingPlayerIds.has(p.id) && availablePlayerIds.has(p.id)
        );
        setSearchResults(filtered);
      } catch (err) {
        console.error('Error searching players:', err);
      } finally {
        setSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchPlayers, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, existingPlayerIds, availablePlayerIds]);

  const handleAddPlayer = async (playerId: string) => {
    setLoading(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('team_players')
        .insert({
          team_id: team.id,
          player_id: playerId,
          is_active: true,
        });

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('Este jugador ya está en el equipo');
        }
        throw insertError;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error adding player:', err);
      setError(err.message || 'Error al agregar el jugador');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Agregar Jugador</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Equipo
            </label>
            <input
              type="text"
              value={team.name}
              disabled
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Buscar Jugador
            </label>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
              <p className="text-sm text-blue-800">
                Solo se muestran jugadores de tus equipos base
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            {searching && (
              <p className="text-center text-gray-500 py-4">Buscando...</p>
            )}

            {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
              <p className="text-center text-gray-500 py-4">No se encontraron jugadores</p>
            )}

            {!searching && searchQuery.length < 2 && (
              <p className="text-center text-gray-500 py-4">
                Escribe al menos 2 caracteres para buscar
              </p>
            )}

            {searchResults.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {player.photo_url ? (
                  <img
                    src={player.photo_url}
                    alt={player.full_name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <User className="h-6 w-6 text-gray-400" />
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{player.full_name}</p>
                  {player.position && (
                    <p className="text-sm text-gray-600">{player.position}</p>
                  )}
                </div>
                <button
                  onClick={() => handleAddPlayer(player.id)}
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {loading ? 'Agregando...' : 'Agregar'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
