import { useEffect, useState } from 'react';
import { X, Calendar, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface MatchEvent {
  id: string;
  match_id: string;
  event_type: string;
  minute: number;
  player_id: string | null;
  team_id: string;
  additional_info: any;
  created_at: string;
  player_profiles?: {
    id: string;
    full_name: string;
  };
  teams?: {
    id: string;
    name: string;
  };
}

interface MatchEventsModalProps {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  matchDate: string;
  onClose: () => void;
}

export const MatchEventsModal = ({
  matchId,
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
  matchDate,
  onClose,
}: MatchEventsModalProps) => {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, [matchId]);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('match_events')
        .select(`
          *,
          player_profiles:player_id (
            id,
            full_name
          ),
          teams:team_id (
            id,
            name
          )
        `)
        .eq('match_id', matchId)
        .order('minute', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'goal':
        return '⚽';
      case 'yellow_card':
        return '🟨';
      case 'red_card':
        return '🟥';
      case 'substitution_in':
      case 'substitution_out':
        return '🔄';
      default:
        return '📝';
    }
  };

  const getEventLabel = (eventType: string) => {
    switch (eventType) {
      case 'goal':
        return 'Gol';
      case 'yellow_card':
        return 'Tarjeta Amarilla';
      case 'red_card':
        return 'Tarjeta Roja';
      case 'substitution_in':
        return 'Cambio (Ingreso)';
      case 'substitution_out':
        return 'Cambio (Sale)';
      default:
        return 'Otro';
    }
  };

  const groupedEvents = {
    goals: events.filter(e => e.event_type === 'goal'),
    cards: events.filter(e => e.event_type === 'yellow_card' || e.event_type === 'red_card'),
    substitutions: events.filter(e => e.event_type === 'substitution_in' || e.event_type === 'substitution_out'),
    others: events.filter(e => !['goal', 'yellow_card', 'red_card', 'substitution_in', 'substitution_out'].includes(e.event_type)),
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-2">Detalles del Partido</h2>
            <div className="flex items-center gap-4 text-blue-50 text-sm">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {new Date(matchDate).toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 text-center">
                <p className="text-lg font-bold text-gray-900">{homeTeamName}</p>
              </div>
              <div className="px-8">
                <div className="flex items-center gap-4">
                  <span className="text-4xl font-bold text-blue-600">{homeScore}</span>
                  <span className="text-2xl text-gray-400">-</span>
                  <span className="text-4xl font-bold text-blue-600">{awayScore}</span>
                </div>
              </div>
              <div className="flex-1 text-center">
                <p className="text-lg font-bold text-gray-900">{awayTeamName}</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-gray-600">
              <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-lg font-medium">No hay eventos registrados</p>
              <p className="text-sm mt-2">Los eventos del partido aparecerán aquí cuando se registren</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedEvents.goals.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="text-2xl">⚽</span>
                    Goles ({groupedEvents.goals.length})
                  </h3>
                  <div className="space-y-2">
                    {groupedEvents.goals.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        <span className="text-2xl">{getEventIcon(event.event_type)}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-blue-600 text-lg">{event.minute}'</span>
                            <span className="font-semibold text-gray-900">
                              {event.player_profiles?.full_name || 'Jugador desconocido'}
                            </span>
                            {event.additional_info?.type && event.additional_info.type !== 'normal' && (
                              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                                {event.additional_info.type === 'penalty' ? 'Penalti' : event.additional_info.type === 'own_goal' ? 'Autogol' : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">{event.teams?.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {groupedEvents.cards.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="text-2xl">📋</span>
                    Tarjetas ({groupedEvents.cards.length})
                  </h3>
                  <div className="space-y-2">
                    {groupedEvents.cards.map((event) => (
                      <div
                        key={event.id}
                        className={`flex items-start gap-3 p-4 rounded-lg hover:bg-opacity-80 transition-colors ${
                          event.event_type === 'yellow_card' ? 'bg-yellow-50' : 'bg-red-50'
                        }`}
                      >
                        <span className="text-2xl">{getEventIcon(event.event_type)}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-blue-600 text-lg">{event.minute}'</span>
                            <span className="font-semibold text-gray-900">{getEventLabel(event.event_type)}</span>
                          </div>
                          <p className="text-sm font-medium text-gray-900">
                            {event.player_profiles?.full_name || 'Jugador desconocido'}
                          </p>
                          <p className="text-sm text-gray-600">{event.teams?.name}</p>
                          {event.additional_info?.reason && (
                            <p className="text-sm text-gray-700 mt-1">
                              <span className="font-medium">Motivo:</span> {event.additional_info.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {groupedEvents.substitutions.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="text-2xl">🔄</span>
                    Cambios ({groupedEvents.substitutions.length})
                  </h3>
                  <div className="space-y-2">
                    {groupedEvents.substitutions.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <span className="text-2xl">{getEventIcon(event.event_type)}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-blue-600 text-lg">{event.minute}'</span>
                            <span className="font-semibold text-gray-900">{getEventLabel(event.event_type)}</span>
                          </div>
                          <p className="text-sm font-medium text-gray-900">
                            {event.player_profiles?.full_name || 'Jugador desconocido'}
                          </p>
                          <p className="text-sm text-gray-600">{event.teams?.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {groupedEvents.others.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <span className="text-2xl">📝</span>
                    Otros Eventos ({groupedEvents.others.length})
                  </h3>
                  <div className="space-y-2">
                    {groupedEvents.others.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <span className="text-2xl">{getEventIcon(event.event_type)}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-blue-600 text-lg">{event.minute}'</span>
                            <span className="font-semibold text-gray-900">{getEventLabel(event.event_type)}</span>
                          </div>
                          {event.player_profiles && (
                            <p className="text-sm font-medium text-gray-900">
                              {event.player_profiles.full_name}
                            </p>
                          )}
                          <p className="text-sm text-gray-600">{event.teams?.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 pt-4 border-t">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Línea de Tiempo Completa</h4>
                <div className="space-y-2">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center gap-3 text-sm text-gray-600"
                    >
                      <span className="font-bold text-blue-600 w-12">{event.minute}'</span>
                      <span className="text-lg">{getEventIcon(event.event_type)}</span>
                      <span className="flex-1">
                        {getEventLabel(event.event_type)} - {event.player_profiles?.full_name || 'Jugador desconocido'} ({event.teams?.name})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
