import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Plus, Trash2 } from 'lucide-react';

interface Player {
  id: string;
  full_name: string;
  team_id: string;
}

interface Goal {
  player_id: string;
  minute: number;
  type: 'normal' | 'penalty' | 'own_goal';
}

interface Card {
  player_id: string;
  minute: number;
  type: 'yellow' | 'red';
  reason: string;
}

interface MatchDetailsModalProps {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  championshipId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const MatchDetailsModal = ({
  matchId,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  championshipId,
  onClose,
  onSuccess,
}: MatchDetailsModalProps) => {
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [matchChampionshipId, setMatchChampionshipId] = useState<string | null>(championshipId || null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      if (!matchChampionshipId) {
        const { data: matchData } = await supabase
          .from('matches')
          .select('championship_id')
          .eq('id', matchId)
          .single();

        if (matchData) {
          setMatchChampionshipId(matchData.championship_id);
        }
      }

      const [homePlayersRes, awayPlayersRes, homeTeamRes, awayTeamRes, matchEventsRes] = await Promise.all([
        supabase
          .from('team_players')
          .select('player_profiles(id, full_name)')
          .eq('team_id', homeTeamId),
        supabase
          .from('team_players')
          .select('player_profiles(id, full_name)')
          .eq('team_id', awayTeamId),
        supabase
          .from('teams')
          .select('captain_id')
          .eq('id', homeTeamId)
          .maybeSingle(),
        supabase
          .from('teams')
          .select('captain_id')
          .eq('id', awayTeamId)
          .maybeSingle(),
        supabase
          .from('match_events')
          .select('*')
          .eq('match_id', matchId),
      ]);

      if (homePlayersRes.data) {
        const players = homePlayersRes.data
          .filter((p: any) => p.player_profiles)
          .map((p: any) => ({
            id: p.player_profiles.id,
            full_name: p.player_profiles.full_name,
            team_id: homeTeamId,
          }));

        // Add captain if exists and not already in the list
        if (homeTeamRes.data?.captain_id) {
          const { data: captainProfile } = await supabase
            .from('player_profiles')
            .select('id, full_name')
            .eq('id', homeTeamRes.data.captain_id)
            .maybeSingle();

          if (captainProfile) {
            const captainExists = players.some((p: any) => p.id === captainProfile.id);
            if (!captainExists) {
              players.unshift({
                id: captainProfile.id,
                full_name: `${captainProfile.full_name} (Capitán)`,
                team_id: homeTeamId,
              });
            }
          }
        }

        setHomePlayers(players);
      }

      if (awayPlayersRes.data) {
        const players = awayPlayersRes.data
          .filter((p: any) => p.player_profiles)
          .map((p: any) => ({
            id: p.player_profiles.id,
            full_name: p.player_profiles.full_name,
            team_id: awayTeamId,
          }));

        // Add captain if exists and not already in the list
        if (awayTeamRes.data?.captain_id) {
          const { data: captainProfile } = await supabase
            .from('player_profiles')
            .select('id, full_name')
            .eq('id', awayTeamRes.data.captain_id)
            .maybeSingle();

          if (captainProfile) {
            const captainExists = players.some((p: any) => p.id === captainProfile.id);
            if (!captainExists) {
              players.unshift({
                id: captainProfile.id,
                full_name: `${captainProfile.full_name} (Capitán)`,
                team_id: awayTeamId,
              });
            }
          }
        }

        setAwayPlayers(players);
      }

      if (matchEventsRes.data && matchEventsRes.data.length > 0) {
        const existingGoals: Goal[] = [];
        const existingCards: Card[] = [];

        matchEventsRes.data.forEach((event) => {
          if (event.event_type === 'goal') {
            existingGoals.push({
              player_id: event.player_id,
              minute: event.minute,
              type: (event.additional_info as any)?.type || 'normal',
            });
          } else if (event.event_type === 'yellow_card') {
            existingCards.push({
              player_id: event.player_id,
              minute: event.minute,
              type: 'yellow',
              reason: (event.additional_info as any)?.reason || '',
            });
          } else if (event.event_type === 'red_card') {
            existingCards.push({
              player_id: event.player_id,
              minute: event.minute,
              type: 'red',
              reason: (event.additional_info as any)?.reason || '',
            });
          }
        });

        setGoals(existingGoals);
        setCards(existingCards);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addGoal = () => {
    setGoals([...goals, { player_id: '', minute: 0, type: 'normal' }]);
  };

  const removeGoal = (index: number) => {
    setGoals(goals.filter((_, i) => i !== index));
  };

  const updateGoal = (index: number, field: keyof Goal, value: string | number) => {
    const updated = [...goals];
    updated[index] = { ...updated[index], [field]: value };
    setGoals(updated);
  };

  const addCard = () => {
    setCards([...cards, { player_id: '', minute: 0, type: 'yellow', reason: '' }]);
  };

  const removeCard = (index: number) => {
    setCards(cards.filter((_, i) => i !== index));
  };

  const updateCard = (index: number, field: keyof Card, value: string | number) => {
    const updated = [...cards];
    updated[index] = { ...updated[index], [field]: value };
    setCards(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('Session:', sessionData.session?.user);
      console.log('JWT Role:', sessionData.session?.user?.app_metadata?.role);

      const allPlayers = [...homePlayers, ...awayPlayers];

      await supabase.from('match_events').delete().eq('match_id', matchId);

      const eventsToInsert = [];

      for (const goal of goals) {
        if (goal.player_id) {
          const player = allPlayers.find((p) => p.id === goal.player_id);
          if (player) {
            eventsToInsert.push({
              match_id: matchId,
              player_id: goal.player_id,
              team_id: player.team_id,
              event_type: 'goal',
              minute: goal.minute,
              additional_info: { type: goal.type },
            });
          }
        }
      }

      for (const card of cards) {
        if (card.player_id) {
          const player = allPlayers.find((p) => p.id === card.player_id);
          if (player) {
            eventsToInsert.push({
              match_id: matchId,
              player_id: card.player_id,
              team_id: player.team_id,
              event_type: card.type === 'yellow' ? 'yellow_card' : 'red_card',
              minute: card.minute,
              additional_info: { reason: card.reason },
            });
          }
        }
      }

      if (eventsToInsert.length > 0) {
        console.log('Inserting events:', eventsToInsert);
        const { data: insertedData, error: eventsError } = await supabase
          .from('match_events')
          .insert(eventsToInsert)
          .select();

        console.log('Insert result:', { data: insertedData, error: eventsError });
        if (eventsError) throw eventsError;
      }

      const homeGoals = goals.filter((g) =>
        homePlayers.some((p) => p.id === g.player_id)
      ).length;
      const awayGoals = goals.filter((g) =>
        awayPlayers.some((p) => p.id === g.player_id)
      ).length;

      const { error: matchError } = await supabase
        .from('matches')
        .update({
          home_score: homeGoals,
          away_score: awayGoals,
          status: 'finished',
        })
        .eq('id', matchId);

      if (matchError) throw matchError;

      alert('Detalles del partido guardados exitosamente');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving match details:', error);
      alert('Error al guardar los detalles del partido');
    } finally {
      setSubmitting(false);
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

  const allPlayers = [...homePlayers, ...awayPlayers];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">
            Detalles del Partido: {homeTeamName} vs {awayTeamName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Goles</h3>
              <button
                type="button"
                onClick={addGoal}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Agregar Gol
              </button>
            </div>

            {goals.length === 0 ? (
              <p className="text-gray-600 text-sm">No hay goles registrados</p>
            ) : (
              <div className="space-y-3">
                {goals.map((goal, index) => (
                  <div key={index} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
                    <div className="flex-1 grid grid-cols-3 gap-3">
                      <select
                        value={goal.player_id}
                        onChange={(e) => updateGoal(index, 'player_id', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                        required
                      >
                        <option value="">Seleccionar jugador</option>
                        <optgroup label={homeTeamName}>
                          {homePlayers.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.full_name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={awayTeamName}>
                          {awayPlayers.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.full_name}
                            </option>
                          ))}
                        </optgroup>
                      </select>

                      <input
                        type="number"
                        value={goal.minute}
                        onChange={(e) => updateGoal(index, 'minute', parseInt(e.target.value))}
                        placeholder="Minuto"
                        min="0"
                        max="120"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                        required
                      />

                      <select
                        value={goal.type}
                        onChange={(e) => updateGoal(index, 'type', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      >
                        <option value="normal">Normal</option>
                        <option value="penalty">Penalti</option>
                        <option value="own_goal">Autogol</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeGoal(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Tarjetas</h3>
              <button
                type="button"
                onClick={addCard}
                className="flex items-center gap-2 px-3 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Agregar Tarjeta
              </button>
            </div>

            {cards.length === 0 ? (
              <p className="text-gray-600 text-sm">No hay tarjetas registradas</p>
            ) : (
              <div className="space-y-3">
                {cards.map((card, index) => (
                  <div key={index} className="flex gap-3 items-start bg-gray-50 p-3 rounded-lg">
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <select
                        value={card.player_id}
                        onChange={(e) => updateCard(index, 'player_id', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                        required
                      >
                        <option value="">Seleccionar jugador</option>
                        <optgroup label={homeTeamName}>
                          {homePlayers.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.full_name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={awayTeamName}>
                          {awayPlayers.map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.full_name}
                            </option>
                          ))}
                        </optgroup>
                      </select>

                      <input
                        type="number"
                        value={card.minute}
                        onChange={(e) => updateCard(index, 'minute', parseInt(e.target.value))}
                        placeholder="Minuto"
                        min="0"
                        max="120"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                        required
                      />

                      <select
                        value={card.type}
                        onChange={(e) => updateCard(index, 'type', e.target.value as 'yellow' | 'red')}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      >
                        <option value="yellow">Amarilla</option>
                        <option value="red">Roja</option>
                      </select>

                      <input
                        type="text"
                        value={card.reason}
                        onChange={(e) => updateCard(index, 'reason', e.target.value)}
                        placeholder="Motivo"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeCard(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </form>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 font-medium"
          >
            {submitting ? 'Guardando...' : 'Guardar Detalles'}
          </button>
        </div>
      </div>
    </div>
  );
};
