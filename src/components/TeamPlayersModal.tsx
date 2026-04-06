import { useEffect, useState } from 'react';
import { X, User, Users, AlertCircle, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Player {
  id: string;
  player_profiles: {
    id: string;
    full_name: string;
    position: string | null;
    photo_url: string | null;
  };
}

interface TeamPlayersModalProps {
  teamId: string;
  teamName: string;
  captainId?: string;
  captainName?: string;
  onClose: () => void;
  isBaseTeam?: boolean;
}

export const TeamPlayersModal = ({ teamId, teamName, captainId, captainName, onClose, isBaseTeam = false }: TeamPlayersModalProps) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [captain, setCaptain] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [teamId, captainId, isBaseTeam]);

  const fetchData = async () => {
    try {
      console.log('TeamPlayersModal - captainId:', captainId);
      console.log('TeamPlayersModal - teamId:', teamId);
      console.log('TeamPlayersModal - isBaseTeam:', isBaseTeam);

      const playersPromise = isBaseTeam
        ? supabase
            .from('base_team_players')
            .select(`
              id,
              player_profiles:player_id (
                id,
                full_name,
                position,
                photo_url
              )
            `)
            .eq('base_team_id', teamId)
            .eq('status', 'active')
            .order('joined_at', { ascending: true })
        : supabase
            .from('team_players')
            .select(`
              id,
              player_profiles:player_id (
                id,
                full_name,
                position,
                photo_url
              )
            `)
            .eq('team_id', teamId)
            .eq('is_active', true)
            .order('joined_at', { ascending: true });

      const captainPromise = captainId
        ? supabase
            .from('player_profiles')
            .select('id, full_name, position, photo_url')
            .eq('id', captainId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const [playersResult, captainResult] = await Promise.all([playersPromise, captainPromise]);

      console.log('Players result:', playersResult);
      console.log('Captain result:', captainResult);

      if (playersResult.error) {
        console.error('Error fetching players:', playersResult.error);
      } else if (playersResult.data) {
        setPlayers(playersResult.data as any);
      }

      if (captainResult.error) {
        console.error('Error fetching captain:', captainResult.error);
      } else if (captainResult.data) {
        console.log('Setting captain data:', captainResult.data);
        setCaptain(captainResult.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPositionLabel = (position: string | null) => {
    if (!position) return 'Sin posición';

    const positions: { [key: string]: string } = {
      goalkeeper: 'Portero',
      defender: 'Defensa',
      midfielder: 'Mediocampista',
      forward: 'Delantero'
    };

    return positions[position] || position;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-white" />
            <h2 className="text-xl font-bold text-white">Jugadores de {teamName}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
            </div>
          ) : !captain && players.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg font-medium mb-2">No hay jugadores registrados</p>
              <p className="text-gray-500 text-sm">Este equipo aún no tiene jugadores agregados.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {captain && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-amber-600" />
                    Capitán
                  </h3>
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-4 border-2 border-amber-300 hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      {captain.photo_url ? (
                        <div className="relative">
                          <img
                            src={captain.photo_url}
                            alt={captain.full_name}
                            className="w-16 h-16 rounded-full object-cover border-2 border-amber-400"
                          />
                          <Shield className="h-5 w-5 text-amber-600 absolute -bottom-1 -right-1 bg-white rounded-full p-0.5" />
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
                            <User className="h-8 w-8 text-white" />
                          </div>
                          <Shield className="h-5 w-5 text-amber-600 absolute -bottom-1 -right-1 bg-white rounded-full p-0.5" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 text-lg">
                          {captain.full_name}
                        </h3>
                        <span className="inline-block mt-1 px-3 py-1 bg-amber-200 text-amber-800 rounded-full text-xs font-semibold">
                          {getPositionLabel(captain.position || null)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {players.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-600" />
                    Jugadores ({players.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {players.map((player) => (
                      <div
                        key={player.id}
                        className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center gap-4">
                          {player.player_profiles?.photo_url ? (
                            <img
                              src={player.player_profiles.photo_url}
                              alt={player.player_profiles?.full_name}
                              className="w-16 h-16 rounded-full object-cover border-2 border-emerald-200"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center">
                              <User className="h-8 w-8 text-white" />
                            </div>
                          )}
                          <div className="flex-1">
                            <h3 className="font-bold text-gray-900 text-lg">
                              {player.player_profiles?.full_name}
                            </h3>
                            <span className="inline-block mt-1 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                              {getPositionLabel(player.player_profiles?.position || null)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
