import { useEffect, useState } from 'react';
import { Plus, Users, Trophy, Calendar, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BaseTeam, TeamRegistration } from '../types/database';
import { useAuth } from '../contexts/AuthContext';
import CreateBaseTeamModal from '../components/CreateBaseTeamModal';
import TeamHistoryModal from '../components/TeamHistoryModal';

export default function Teams() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<BaseTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<BaseTeam | null>(null);

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('base_teams')
        .select(`
          *,
          owner:profiles(full_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTeams(data || []);
    } catch (error) {
      console.error('Error loading teams:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <a
            href="/"
            className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            Volver al Inicio
          </a>
          <h1 className="text-3xl font-bold text-gray-900">Equipos</h1>
          <p className="mt-2 text-gray-600">Gestiona equipos y su historial en campeonatos</p>
        </div>
        {user && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Plus size={20} />
            Crear Equipo
          </button>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Users size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay equipos</h3>
          <p className="text-gray-600 mb-4">Crea el primer equipo para comenzar</p>
          {user && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              Crear Equipo
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              onViewHistory={() => setSelectedTeam(team)}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateBaseTeamModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadTeams();
          }}
        />
      )}

      {selectedTeam && (
        <TeamHistoryModal
          team={selectedTeam}
          onClose={() => setSelectedTeam(null)}
        />
      )}
    </div>
  );
}

function TeamCard({
  team,
  onViewHistory,
}: {
  team: BaseTeam;
  onViewHistory: () => void;
}) {
  const [registrations, setRegistrations] = useState<TeamRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<any[]>([]);
  const [showPlayers, setShowPlayers] = useState(false);

  useEffect(() => {
    loadRegistrations();
  }, [team.id]);

  const loadRegistrations = async () => {
    try {
      const [regData, playersData] = await Promise.all([
        supabase
          .from('team_registrations')
          .select(`
            *,
            championship:championships(name)
          `)
          .eq('base_team_id', team.id)
          .eq('status', 'confirmed'),
        supabase
          .from('players')
          .select('id, name, position, jersey_number')
          .eq('team_id', team.id)
      ]);

      if (regData.error) throw regData.error;
      setRegistrations(regData.data || []);

      if (playersData.data) {
        setPlayers(playersData.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden ${team.status === 'inactive' ? 'opacity-60' : ''}`}>
      <div className="p-6">
        <div className="flex items-start gap-4 mb-4">
          {team.logo_url ? (
            <img
              src={team.logo_url}
              alt={team.name}
              className="w-16 h-16 rounded-lg object-cover"
            />
          ) : (
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center">
              <Users size={32} className="text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-gray-900 truncate">{team.name}</h3>
            <p className="text-sm text-gray-600">
              {team.owner?.full_name || 'Propietario desconocido'}
            </p>
            {team.status === 'inactive' && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-800 text-xs font-medium rounded">
                Inactivo
              </span>
            )}
          </div>
        </div>

        {team.description && (
          <p className="text-gray-600 text-sm mb-4 line-clamp-2">{team.description}</p>
        )}

        <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
          {team.founded_date && (
            <div className="flex items-center gap-1">
              <Calendar size={16} />
              <span>{new Date(team.founded_date).getFullYear()}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Trophy size={16} />
            <span>{loading ? '...' : registrations.length} campeonatos</span>
          </div>
          <div className="flex items-center gap-1">
            <Users size={16} />
            <span>{players.length} jugadores</span>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={onViewHistory}
            className="w-full bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Ver Historial
          </button>

          {players.length > 0 && (
            <button
              onClick={() => setShowPlayers(!showPlayers)}
              className="w-full flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 py-2 rounded-lg hover:bg-emerald-100 transition-colors font-medium"
            >
              {showPlayers ? <EyeOff size={16} /> : <Eye size={16} />}
              {showPlayers ? 'Ocultar' : 'Ver'} Jugadores
            </button>
          )}
        </div>

        {showPlayers && players.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="font-semibold text-sm text-gray-900 mb-2">Jugadores</h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {players.map((player) => (
                <div key={player.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-900">{player.name}</span>
                  <div className="flex items-center gap-2 text-gray-600">
                    {player.jersey_number && <span>#{player.jersey_number}</span>}
                    {player.position && <span className="text-xs">{player.position}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
