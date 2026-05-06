import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PlayoffMatch } from '../../types/database';

interface PlayoffMatchModalProps {
  match: PlayoffMatch;
  onClose: () => void;
  onSuccess: () => void;
}

interface Team {
  id: string;
  name: string;
}

export default function PlayoffMatchModal({ match, onClose, onSuccess }: PlayoffMatchModalProps) {
  const [loading, setLoading] = useState(false);
  const [team1Id, setTeam1Id] = useState(match.team1_id || '');
  const [team2Id, setTeam2Id] = useState(match.team2_id || '');
  const [team1Score, setTeam1Score] = useState(match.team1_score);
  const [team2Score, setTeam2Score] = useState(match.team2_score);
  const [matchDate, setMatchDate] = useState(
    match.match_date ? new Date(match.match_date).toISOString().slice(0, 16) : ''
  );
  const [status, setStatus] = useState(match.status);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);

  useEffect(() => {
    loadAvailableTeams();
  }, []);

  const loadAvailableTeams = async () => {
    const { data: teams } = await supabase
      .from('base_teams')
      .select(`
        id,
        name,
        team_registrations!inner(championship_id)
      `)
      .eq('team_registrations.championship_id', match.championship_id)
      .order('name');

    if (teams) {
      setAvailableTeams(teams);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!team1Id || !team2Id) {
      alert('Por favor selecciona ambos equipos');
      return;
    }

    if (team1Id === team2Id) {
      alert('Los equipos deben ser diferentes');
      return;
    }

    setLoading(true);

    try {
      const updateData: any = {
        team1_id: team1Id,
        team2_id: team2Id,
        team1_score: team1Score,
        team2_score: team2Score,
        match_date: matchDate || null,
        status,
      };

      if (status === 'finished') {
        if (match.leg) {
          const { data: siblingMatch } = await supabase
            .from('playoff_matches')
            .select('*')
            .eq('championship_id', match.championship_id)
            .eq('round', match.round)
            .eq('match_number', match.match_number)
            .neq('id', match.id)
            .maybeSingle();

          let team1Aggregate = team1Score;
          let team2Aggregate = team2Score;

          if (siblingMatch) {
            if (match.leg === 'first_leg') {
              team1Aggregate += siblingMatch.team2_score;
              team2Aggregate += siblingMatch.team1_score;
            } else {
              team1Aggregate += siblingMatch.team1_score;
              team2Aggregate += siblingMatch.team2_score;
            }
          }

          updateData.team1_aggregate_score = team1Aggregate;
          updateData.team2_aggregate_score = team2Aggregate;

          if (siblingMatch?.status === 'finished') {
            const winnerId = team1Aggregate > team2Aggregate ? team1Id : team2Id;
            updateData.winner_id = winnerId;

            await supabase
              .from('playoff_matches')
              .update({ winner_id: winnerId })
              .eq('id', siblingMatch.id);
          }
        } else {
          const winnerId = team1Score > team2Score ? team1Id : team2Id;
          updateData.winner_id = winnerId;
          updateData.team1_aggregate_score = team1Score;
          updateData.team2_aggregate_score = team2Score;
        }
      }

      const { error } = await supabase
        .from('playoff_matches')
        .update(updateData)
        .eq('id', match.id);

      if (error) throw error;

      if (status === 'finished' && match.round === 'final') {
        await updateChampionship();
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating playoff match:', error);
      alert('Error al actualizar el partido de playoff');
    } finally {
      setLoading(false);
    }
  };

  const updateChampionship = async () => {
    try {
      const winnerId = team1Score > team2Score ? team1Id : team2Id;
      const runnerUpId = team1Score > team2Score ? team2Id : team1Id;

      console.log('Updating championship with:', {
        champion_team_id: winnerId,
        runner_up_team_id: runnerUpId,
        phase: 'finished',
        status: 'finished',
      });

      const { error: champError } = await supabase
        .from('championships')
        .update({
          champion_team_id: winnerId,
          runner_up_team_id: runnerUpId,
          phase: 'finished',
          status: 'finished',
        })
        .eq('id', match.championship_id);

      if (champError) {
        console.error('Error updating championship:', champError);
        throw new Error(`Error al actualizar el campeonato: ${champError.message}`);
      }

      const { data: thirdPlaceMatch, error: thirdError } = await supabase
        .from('playoff_matches')
        .select('winner_id')
        .eq('championship_id', match.championship_id)
        .eq('round', 'third_place')
        .eq('status', 'finished')
        .maybeSingle();

      if (thirdError) {
        console.error('Error fetching third place match:', thirdError);
      }

      if (thirdPlaceMatch?.winner_id) {
        const { error: thirdUpdateError } = await supabase
          .from('championships')
          .update({ third_place_team_id: thirdPlaceMatch.winner_id })
          .eq('id', match.championship_id);

        if (thirdUpdateError) {
          console.error('Error updating third place:', thirdUpdateError);
        }
      }

      console.log('Championship updated successfully');
    } catch (error) {
      console.error('Error in updateChampionship:', error);
      throw error;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">Gestionar Partido de Playoff</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {match.leg && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-blue-900">
                {match.leg === 'first_leg' ? 'Partido de IDA' : 'Partido de VUELTA'}
              </p>
            </div>
          )}

          <div className="space-y-4">
            {(!match.team1_id || !match.team2_id) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-800 font-medium">
                  ⚠️ Selecciona los equipos que participarán en este partido
                </p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Equipo 1
                </label>
                <select
                  value={team1Id}
                  onChange={(e) => setTeam1Id(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Seleccionar equipo...</option>
                  {availableTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Equipo 2
                </label>
                <select
                  value={team2Id}
                  onChange={(e) => setTeam2Id(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Seleccionar equipo...</option>
                  {availableTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Goles {team1Id ? availableTeams.find(t => t.id === team1Id)?.name : 'Equipo 1'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={team1Score}
                  onChange={(e) => setTeam1Score(Number(e.target.value))}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="text-2xl font-bold text-gray-400 pt-6">vs</div>

              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Goles {team2Id ? availableTeams.find(t => t.id === team2Id)?.name : 'Equipo 2'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={team2Score}
                  onChange={(e) => setTeam2Score(Number(e.target.value))}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha y Hora del Partido
              </label>
              <input
                type="datetime-local"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado del Partido
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="scheduled">Programado</option>
                <option value="in_progress">En Progreso</option>
                <option value="finished">Finalizado</option>
              </select>
            </div>
          </div>

          {match.leg && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                En formato ida y vuelta, el marcador agregado se calculará automáticamente cuando ambos partidos estén finalizados.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-4 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              disabled={loading}
            >
              <Save className="w-4 h-4" />
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}