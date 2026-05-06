import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Calendar, Trophy, Users, Clock, Plus, Edit, Trash2, AlertCircle } from 'lucide-react';

interface Championship {
  id: string;
  name: string;
  sport: string;
}

interface Match {
  id: string;
  match_date: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
  championship_id: string;
  home_team: {
    name: string;
    base_team_id: string;
  };
  away_team: {
    name: string;
    base_team_id: string;
  };
  home_score: number | null;
  away_score: number | null;
}

interface MatchEvent {
  id: string;
  match_id: string;
  event_type: string;
  minute: number;
  player_id: string | null;
  team_id: string;
  additional_info: any;
  created_at: string;
}

interface Player {
  id: string;
  full_name: string;
  team_id: string;
}

export const LiveMatches = () => {
  const { profile, isShiftManager, isChampionshipAdmin, isAdmin } = useAuth();
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedChampionship, setSelectedChampionship] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<MatchEvent | null>(null);
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  const [eventForm, setEventForm] = useState({
    event_type: 'goal',
    minute: 0,
    player_id: '',
    team_id: '',
    goal_type: 'normal',
    card_reason: '',
  });

  const canManageEvents = isShiftManager || isChampionshipAdmin || isAdmin;

  useEffect(() => {
    if (profile) {
      fetchChampionships();
    }
  }, [profile]);

  useEffect(() => {
    if (selectedChampionship) {
      fetchMatches();
    }
  }, [selectedChampionship]);

  useEffect(() => {
    if (selectedMatch) {
      fetchEvents();
      fetchPlayers();
      const subscription = supabase
        .channel(`match-${selectedMatch}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'match_events',
            filter: `match_id=eq.${selectedMatch}`,
          },
          () => {
            fetchEvents();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'matches',
            filter: `id=eq.${selectedMatch}`,
          },
          () => {
            fetchMatches();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [selectedMatch]);

  const fetchChampionships = async () => {
    try {
      let championshipsData: Championship[] = [];

      if (isAdmin || isChampionshipAdmin) {
        // Para admin de sistema: todos los campeonatos activos
        if (isAdmin) {
          const { data, error } = await supabase
            .from('championships')
            .select('id, name, sport')
            .eq('status', 'active')
            .order('name');

          if (error) throw error;
          championshipsData = data || [];
        } else {
          // Para admin de campeonato: solo sus campeonatos
          const { data, error } = await supabase
            .from('championships')
            .select('id, name, sport')
            .eq('admin_id', profile?.id)
            .eq('status', 'active')
            .order('name');

          if (error) throw error;
          championshipsData = data || [];
        }
      } else if (isShiftManager) {
        // Para encargados de turno: mostrar solo campeonatos asignados
        const { data, error } = await supabase
          .from('shift_manager_assignments')
          .select(`
            championship_id,
            championships:championship_id (
              id,
              name,
              sport
            )
          `)
          .eq('user_id', profile?.id)
          .eq('is_active', true);

        if (error) throw error;

        championshipsData = data
          .map(item => item.championships)
          .filter(Boolean) as Championship[];
      } else {
        // Para usuarios regulares: mostrar todos los campeonatos activos
        const { data, error } = await supabase
          .from('championships')
          .select('id, name, sport')
          .eq('status', 'active')
          .order('name');

        if (error) throw error;

        championshipsData = data || [];
      }

      setChampionships(championshipsData);

      if (championshipsData.length > 0) {
        setSelectedChampionship(championshipsData[0].id);
      }
    } catch (err) {
      console.error('Error fetching championships:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMatches = async () => {
    if (!selectedChampionship) return;

    try {
      // Obtener el inicio y fin del día actual
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfDay = today.toISOString();

      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);
      const endOfDayStr = endOfDay.toISOString();

      const { data, error } = await supabase
        .from('matches')
        .select(`
          id,
          match_date,
          status,
          home_score,
          away_score,
          home_team_id,
          away_team_id,
          championship_id,
          home_team:home_team_id (name, base_team_id),
          away_team:away_team_id (name, base_team_id)
        `)
        .eq('championship_id', selectedChampionship)
        .in('status', ['playing', 'scheduled'])
        .gte('match_date', startOfDay)
        .lte('match_date', endOfDayStr)
        .order('match_date', { ascending: true });

      if (error) throw error;
      setMatches(data || []);

      if (data && data.length > 0 && !selectedMatch) {
        setSelectedMatch(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching matches:', err);
    }
  };

  const fetchEvents = async () => {
    if (!selectedMatch) return;

    try {
      const { data, error } = await supabase
        .from('match_events')
        .select(`
          *,
          player_profiles:player_id (
            id,
            full_name,
            profile_photo
          )
        `)
        .eq('match_id', selectedMatch)
        .order('minute', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  const fetchPlayers = async () => {
    if (!selectedMatch) return;

    const currentMatch = matches.find(m => m.id === selectedMatch);
    if (!currentMatch) return;

    setLoadingPlayers(true);
    try {
      const [homePlayersRes, awayPlayersRes, homeRegRes, awayRegRes] = await Promise.all([
        supabase
          .from('team_players')
          .select('player_profiles(id, full_name)')
          .eq('team_id', currentMatch.home_team_id)
          .eq('is_active', true),
        supabase
          .from('team_players')
          .select('player_profiles(id, full_name)')
          .eq('team_id', currentMatch.away_team_id)
          .eq('is_active', true),
        currentMatch.home_team?.base_team_id
          ? supabase
              .from('team_registrations')
              .select('captain_id, player_profiles:captain_id(id, full_name)')
              .eq('base_team_id', currentMatch.home_team.base_team_id)
              .eq('championship_id', currentMatch.championship_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        currentMatch.away_team?.base_team_id
          ? supabase
              .from('team_registrations')
              .select('captain_id, player_profiles:captain_id(id, full_name)')
              .eq('base_team_id', currentMatch.away_team.base_team_id)
              .eq('championship_id', currentMatch.championship_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const homePlayers = new Map();

      if (homePlayersRes.data) {
        homePlayersRes.data
          .filter((p: any) => p.player_profiles)
          .forEach((p: any) => {
            homePlayers.set(p.player_profiles.id, {
              id: p.player_profiles.id,
              full_name: p.player_profiles.full_name,
              team_id: currentMatch.home_team_id,
            });
          });
      }

      if (homeRegRes.data?.player_profiles) {
        homePlayers.set(homeRegRes.data.player_profiles.id, {
          id: homeRegRes.data.player_profiles.id,
          full_name: `${homeRegRes.data.player_profiles.full_name} (Capitán)`,
          team_id: currentMatch.home_team_id,
        });
      }

      const awayPlayers = new Map();

      if (awayPlayersRes.data) {
        awayPlayersRes.data
          .filter((p: any) => p.player_profiles)
          .forEach((p: any) => {
            awayPlayers.set(p.player_profiles.id, {
              id: p.player_profiles.id,
              full_name: p.player_profiles.full_name,
              team_id: currentMatch.away_team_id,
            });
          });
      }

      if (awayRegRes.data?.player_profiles) {
        awayPlayers.set(awayRegRes.data.player_profiles.id, {
          id: awayRegRes.data.player_profiles.id,
          full_name: `${awayRegRes.data.player_profiles.full_name} (Capitán)`,
          team_id: currentMatch.away_team_id,
        });
      }

      setHomePlayers(Array.from(homePlayers.values()));
      setAwayPlayers(Array.from(awayPlayers.values()));
    } catch (err) {
      console.error('Error fetching players:', err);
    } finally {
      setLoadingPlayers(false);
    }
  };

  const handleSubmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMatch || !eventForm.player_id || !eventForm.team_id) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }

    try {
      const eventData: any = {
        match_id: selectedMatch,
        event_type: eventForm.event_type,
        minute: eventForm.minute,
        team_id: eventForm.team_id,
        player_id: eventForm.player_id,
        additional_info: {},
      };

      if (eventForm.event_type === 'goal') {
        eventData.additional_info.type = eventForm.goal_type;
      } else if (eventForm.event_type === 'yellow_card' || eventForm.event_type === 'red_card') {
        eventData.additional_info.reason = eventForm.card_reason;
      }

      if (editingEvent) {
        const { error } = await supabase
          .from('match_events')
          .update(eventData)
          .eq('id', editingEvent.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('match_events')
          .insert(eventData);

        if (error) throw error;
      }

      setEventForm({
        event_type: 'goal',
        minute: 0,
        player_id: '',
        team_id: '',
        goal_type: 'normal',
        card_reason: '',
      });
      setEditingEvent(null);
      setShowEventForm(false);
      fetchEvents();
      fetchMatches();
    } catch (err) {
      console.error('Error saving event:', err);
      alert('Error al guardar el evento');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('¿Estás seguro de eliminar este evento?')) return;

    try {
      const { error } = await supabase
        .from('match_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      fetchEvents();
      fetchMatches();
    } catch (err) {
      console.error('Error deleting event:', err);
      alert('Error al eliminar el evento');
    }
  };

  const handleEditEvent = (event: MatchEvent) => {
    setEditingEvent(event);
    setEventForm({
      event_type: event.event_type,
      minute: event.minute,
      player_id: event.player_id || '',
      team_id: event.team_id,
      goal_type: event.additional_info?.type || 'normal',
      card_reason: event.additional_info?.reason || '',
    });
    setShowEventForm(true);
  };

  const currentMatch = matches.find(m => m.id === selectedMatch);

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

  if (loading) {
    return (
      <ProtectedRoute>
        <Layout>
          <div className="flex justify-center items-center min-h-screen">
            <div className="text-gray-600">Cargando...</div>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  if (championships.length === 0) {
    return (
      <ProtectedRoute>
        <Layout>
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="bg-white rounded-xl shadow-md p-12 text-center">
              <Trophy className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Sin Campeonatos Activos</h2>
              <p className="text-gray-600">
                No hay campeonatos activos en este momento. Vuelve más tarde para ver los eventos en vivo.
              </p>
            </div>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Eventos en Vivo</h1>
            <p className="text-gray-600">
              {canManageEvents
                ? 'Gestiona los eventos de los partidos en tiempo real'
                : 'Sigue los eventos de los partidos en tiempo real'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-xl shadow-md p-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campeonato
                </label>
                <select
                  value={selectedChampionship || ''}
                  onChange={(e) => {
                    setSelectedChampionship(e.target.value);
                    setSelectedMatch(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {championships.map((champ) => (
                    <option key={champ.id} value={champ.id}>
                      {champ.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Partidos</h3>
                {matches.length === 0 ? (
                  <p className="text-gray-600 text-center py-4">No hay partidos disponibles</p>
                ) : (
                  <div className="space-y-2">
                    {matches.map((match) => (
                      <button
                        key={match.id}
                        onClick={() => setSelectedMatch(match.id)}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                          selectedMatch === match.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-medium px-2 py-1 rounded ${
                            match.status === 'playing'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {match.status === 'playing' ? 'EN VIVO' : 'PROGRAMADO'}
                          </span>
                          <span className="text-xs text-gray-600">
                            {new Date(match.match_date).toLocaleDateString('es-ES')}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900">{match.home_team.name}</span>
                            {match.home_score !== null && (
                              <span className="text-xl font-bold text-gray-900">{match.home_score}</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900">{match.away_team.name}</span>
                            {match.away_score !== null && (
                              <span className="text-xl font-bold text-gray-900">{match.away_score}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {currentMatch ? (
                <>
                  <div className="bg-white rounded-xl shadow-md p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-2xl font-bold text-gray-900">
                        {currentMatch.home_team.name} vs {currentMatch.away_team.name}
                      </h2>
                      {canManageEvents && (
                        <button
                          onClick={() => {
                            setEditingEvent(null);
                            setEventForm({
                              event_type: 'goal',
                              minute: 0,
                              player_id: '',
                              team_id: '',
                              goal_type: 'normal',
                              card_reason: '',
                            });
                            setShowEventForm(!showEventForm);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <Plus className="h-5 w-5" />
                          {showEventForm ? 'Cancelar' : 'Nuevo Evento'}
                        </button>
                      )}
                    </div>

                    {canManageEvents && showEventForm && (
                      <form onSubmit={handleSubmitEvent} className="mb-6 p-4 bg-gray-50 rounded-lg">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Tipo de Evento
                            </label>
                            <select
                              value={eventForm.event_type}
                              onChange={(e) => setEventForm({ ...eventForm, event_type: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              required
                            >
                              <option value="goal">Gol</option>
                              <option value="yellow_card">Tarjeta Amarilla</option>
                              <option value="red_card">Tarjeta Roja</option>
                              <option value="substitution_in">Cambio (Ingreso)</option>
                              <option value="substitution_out">Cambio (Sale)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Minuto
                            </label>
                            <input
                              type="number"
                              value={eventForm.minute}
                              onChange={(e) => setEventForm({ ...eventForm, minute: parseInt(e.target.value) })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              min="0"
                              max="120"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Equipo
                            </label>
                            <select
                              value={eventForm.team_id}
                              onChange={(e) => setEventForm({ ...eventForm, team_id: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              required
                            >
                              <option value="">Seleccionar equipo...</option>
                              <option value={currentMatch.home_team_id}>{currentMatch.home_team.name}</option>
                              <option value={currentMatch.away_team_id}>{currentMatch.away_team.name}</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Jugador *
                            </label>
                            <select
                              value={eventForm.player_id}
                              onChange={(e) => setEventForm({ ...eventForm, player_id: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              required
                              disabled={loadingPlayers}
                            >
                              <option value="">Seleccionar jugador...</option>
                              {eventForm.team_id === currentMatch.home_team_id && (
                                <>
                                  {homePlayers.map((player) => (
                                    <option key={player.id} value={player.id}>
                                      {player.full_name}
                                    </option>
                                  ))}
                                </>
                              )}
                              {eventForm.team_id === currentMatch.away_team_id && (
                                <>
                                  {awayPlayers.map((player) => (
                                    <option key={player.id} value={player.id}>
                                      {player.full_name}
                                    </option>
                                  ))}
                                </>
                              )}
                            </select>
                          </div>

                          {eventForm.event_type === 'goal' && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Tipo de Gol
                              </label>
                              <select
                                value={eventForm.goal_type}
                                onChange={(e) => setEventForm({ ...eventForm, goal_type: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              >
                                <option value="normal">Normal</option>
                                <option value="penalty">Penalti</option>
                                <option value="own_goal">Autogol</option>
                              </select>
                            </div>
                          )}

                          {(eventForm.event_type === 'yellow_card' || eventForm.event_type === 'red_card') && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Motivo
                              </label>
                              <input
                                type="text"
                                value={eventForm.card_reason}
                                onChange={(e) => setEventForm({ ...eventForm, card_reason: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                placeholder="Motivo de la tarjeta (opcional)"
                              />
                            </div>
                          )}
                        </div>

                        <div className="mt-4 flex gap-2">
                          <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            {editingEvent ? 'Actualizar' : 'Agregar'} Evento
                          </button>
                          {editingEvent && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEvent(null);
                                setEventForm({
                                  event_type: 'goal',
                                  minute: 0,
                                  player_id: '',
                                  team_id: '',
                                  goal_type: 'normal',
                                  card_reason: '',
                                });
                              }}
                              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                            >
                              Cancelar Edición
                            </button>
                          )}
                        </div>
                      </form>
                    )}

                    <div className="flex items-center gap-2 text-gray-600 mb-4">
                      <Clock className="h-5 w-5" />
                      <span>
                        {new Date(currentMatch.match_date).toLocaleString('es-ES', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    {currentMatch.status === 'playing' && (
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg font-medium mb-4">
                        <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                        EN VIVO
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl shadow-md p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">
                      Eventos del Partido ({events.length})
                    </h3>

                    {events.length === 0 ? (
                      <div className="text-center py-8 text-gray-600">
                        <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <p>No hay eventos registrados aún</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {events.map((event) => (
                          <div
                            key={event.id}
                            className="flex items-start justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-start gap-3 flex-1">
                              {(event as any).player_profiles?.profile_photo ? (
                                <img
                                  src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/player-photos/${(event as any).player_profiles.profile_photo}`}
                                  alt={(event as any).player_profiles?.full_name || 'Jugador'}
                                  className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center border-2 border-white shadow-md flex-shrink-0">
                                  <span className="text-2xl">{getEventIcon(event.event_type)}</span>
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-blue-600">{event.minute}'</span>
                                  <span className="font-semibold text-gray-900">{getEventLabel(event.event_type)}</span>
                                  {event.event_type === 'goal' && event.additional_info?.type && event.additional_info.type !== 'normal' && (
                                    <span className="text-xs text-gray-600">
                                      ({event.additional_info.type === 'penalty' ? 'Penalti' : event.additional_info.type === 'own_goal' ? 'Autogol' : ''})
                                    </span>
                                  )}
                                </div>
                                {(event as any).player_profiles?.full_name && (
                                  <p className="text-sm text-gray-900 font-medium">{(event as any).player_profiles.full_name}</p>
                                )}
                                {(event.event_type === 'yellow_card' || event.event_type === 'red_card') && event.additional_info?.reason && (
                                  <p className="text-sm text-gray-600 mt-1">Motivo: {event.additional_info.reason}</p>
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(event.created_at).toLocaleString('es-ES')}
                                </p>
                              </div>
                            </div>
                            {canManageEvents && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditEvent(event)}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                  title="Editar"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteEvent(event.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                  title="Eliminar"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-xl shadow-md p-12 text-center">
                  <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600">Selecciona un partido para ver y gestionar sus eventos</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  );
};
