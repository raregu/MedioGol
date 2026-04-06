import { useEffect, useState } from 'react';
import { X, Trophy, Calendar, Users, Award } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BaseTeam, TeamRegistration, Match } from '../types/database';

interface TeamHistoryModalProps {
  team: BaseTeam;
  onClose: () => void;
}

export default function TeamHistoryModal({ team, onClose }: TeamHistoryModalProps) {
  const [registrations, setRegistrations] = useState<TeamRegistration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [team.id]);

  const loadHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('team_registrations')
        .select(`
          *,
          championship:championships(
            id,
            name,
            sport,
            start_date,
            end_date,
            status
          ),
          captain:profiles(full_name)
        `)
        .eq('base_team_id', team.id)
        .order('registered_at', { ascending: false });

      if (error) throw error;
      setRegistrations(data || []);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-4">
              {team.logo_url ? (
                <img
                  src={team.logo_url}
                  alt={team.name}
                  className="w-16 h-16 rounded-lg object-cover"
                />
              ) : (
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <Users size={32} className="text-white" />
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{team.name}</h2>
                <p className="text-gray-600">Historial de Campeonatos</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {team.description && (
            <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{team.description}</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : registrations.length === 0 ? (
            <div className="text-center py-12">
              <Trophy size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Sin participaciones
              </h3>
              <p className="text-gray-600">
                Este equipo aún no se ha registrado en ningún campeonato
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {registrations.map((reg) => (
                <RegistrationCard key={reg.id} registration={reg} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RegistrationCard({ registration }: { registration: TeamRegistration }) {
  const [stats, setStats] = useState<{
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
  } | null>(null);

  useEffect(() => {
    loadStats();
  }, [registration.id]);

  const loadStats = async () => {
    try {
      const { data: teamsData } = await supabase
        .from('teams')
        .select('id')
        .eq('base_team_id', registration.base_team_id)
        .eq('championship_id', registration.championship_id)
        .maybeSingle();

      if (!teamsData) return;

      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .eq('championship_id', registration.championship_id)
        .or(`home_team_id.eq.${teamsData.id},away_team_id.eq.${teamsData.id}`)
        .eq('status', 'finished');

      if (!matches) return;

      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;

      matches.forEach((match: Match) => {
        const isHome = match.home_team_id === teamsData.id;
        const teamScore = isHome ? match.home_score : match.away_score;
        const opponentScore = isHome ? match.away_score : match.home_score;

        goalsFor += teamScore;
        goalsAgainst += opponentScore;

        if (teamScore > opponentScore) wins++;
        else if (teamScore === opponentScore) draws++;
        else losses++;
      });

      setStats({
        matches: matches.length,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      confirmed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800',
    };
    const labels = {
      confirmed: 'Confirmado',
      pending: 'Pendiente',
      rejected: 'Rechazado',
    };
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {registration.championship?.name}
          </h3>
          <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Trophy size={16} />
              {registration.championship?.sport}
            </span>
            {registration.championship?.start_date && (
              <span className="flex items-center gap-1">
                <Calendar size={16} />
                {new Date(registration.championship.start_date).getFullYear()}
              </span>
            )}
          </div>
        </div>
        {getStatusBadge(registration.status)}
      </div>

      {registration.captain && (
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-medium">Capitán:</span> {registration.captain.full_name}
        </p>
      )}

      {stats && stats.matches > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-4 border-t border-gray-200">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.matches}</p>
            <p className="text-xs text-gray-600">Partidos</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{stats.wins}</p>
            <p className="text-xs text-gray-600">Victorias</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-600">{stats.draws}</p>
            <p className="text-xs text-gray-600">Empates</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{stats.losses}</p>
            <p className="text-xs text-gray-600">Derrotas</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {stats.goalsFor}-{stats.goalsAgainst}
            </p>
            <p className="text-xs text-gray-600">Goles</p>
          </div>
        </div>
      )}
    </div>
  );
}
