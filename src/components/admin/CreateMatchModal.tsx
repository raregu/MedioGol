import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Team } from '../../types/database';
import { X, Calendar, MapPin } from 'lucide-react';

interface CreateMatchModalProps {
  championshipId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface SportsComplex {
  id: string;
  name: string;
  address: string;
  location_url: string | null;
}

export const CreateMatchModal = ({ championshipId, onClose, onSuccess }: CreateMatchModalProps) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [sportsComplexes, setSportsComplexes] = useState<SportsComplex[]>([]);
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [round, setRound] = useState('1');
  const [location, setLocation] = useState('');
  const [sportsComplexId, setSportsComplexId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTeams();
    fetchSportsComplexes();
  }, [championshipId]);

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('championship_id', championshipId)
        .eq('is_enabled', true)
        .order('name');

      if (error) throw error;
      setTeams(data || []);
    } catch (err) {
      console.error('Error fetching teams:', err);
      setError('Error al cargar los equipos');
    }
  };

  const fetchSportsComplexes = async () => {
    try {
      const { data, error } = await supabase
        .from('sports_complexes')
        .select('id, name, address, location_url')
        .order('name');

      if (error) throw error;
      setSportsComplexes(data || []);
    } catch (err) {
      console.error('Error fetching sports complexes:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!homeTeamId || !awayTeamId) {
      setError('Debes seleccionar ambos equipos');
      return;
    }

    if (homeTeamId === awayTeamId) {
      setError('Los equipos deben ser diferentes');
      return;
    }

    if (!matchDate) {
      setError('Debes seleccionar una fecha y hora para el partido');
      return;
    }

    setLoading(true);

    try {
      const { error: insertError } = await supabase
        .from('matches')
        .insert({
          championship_id: championshipId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          match_date: matchDate,
          round: parseInt(round),
          venue: location || null,
          sports_complex_id: sportsComplexId || null,
          status: 'scheduled',
          home_score: 0,
          away_score: 0,
        });

      if (insertError) throw insertError;

      alert('Partido creado exitosamente');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating match:', err);
      setError(err.message || 'Error al crear el partido');
    } finally {
      setLoading(false);
    }
  };

  const getTodayDatetimeLocal = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-emerald-600" />
            Crear Nuevo Partido
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
              {error}
            </div>
          )}

          {teams.length < 2 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
              <p className="font-medium mb-1">No hay suficientes equipos</p>
              <p className="text-sm">Necesitas al menos 2 equipos habilitados para crear un partido.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="homeTeam" className="block text-sm font-medium text-gray-700 mb-2">
                    Equipo Local <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="homeTeam"
                    value={homeTeamId}
                    onChange={(e) => setHomeTeamId(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    required
                  >
                    <option value="">Selecciona un equipo...</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id} disabled={team.id === awayTeamId}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="awayTeam" className="block text-sm font-medium text-gray-700 mb-2">
                    Equipo Visitante <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="awayTeam"
                    value={awayTeamId}
                    onChange={(e) => setAwayTeamId(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    required
                  >
                    <option value="">Selecciona un equipo...</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id} disabled={team.id === homeTeamId}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="matchDate" className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha y Hora del Partido <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    id="matchDate"
                    value={matchDate}
                    onChange={(e) => setMatchDate(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="round" className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha (Jornada) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="round"
                    value={round}
                    onChange={(e) => setRound(e.target.value)}
                    min="1"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Número de jornada o fecha del campeonato</p>
                </div>
              </div>

              <div>
                <label htmlFor="sportsComplex" className="block text-sm font-medium text-gray-700 mb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-600" />
                    Complejo Deportivo
                  </div>
                </label>
                <select
                  id="sportsComplex"
                  value={sportsComplexId}
                  onChange={(e) => setSportsComplexId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">Selecciona un complejo...</option>
                  {sportsComplexes.map((complex) => (
                    <option key={complex.id} value={complex.id}>
                      {complex.name} - {complex.address}
                    </option>
                  ))}
                </select>
                {sportsComplexId && (
                  <div className="mt-2">
                    {sportsComplexes.find(c => c.id === sportsComplexId)?.location_url && (
                      <a
                        href={sportsComplexes.find(c => c.id === sportsComplexId)?.location_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
                      >
                        <MapPin className="h-3 w-3" />
                        Ver ubicación en el mapa
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
                  Detalles adicionales (Cancha, Observaciones)
                </label>
                <input
                  type="text"
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ej: Cancha 3, Sector B..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {homeTeamId && awayTeamId && homeTeamId !== awayTeamId && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-emerald-900 mb-2">Vista previa del partido:</p>
                  <div className="flex items-center justify-center gap-4 text-gray-900">
                    <span className="font-bold">{teams.find((t) => t.id === homeTeamId)?.name}</span>
                    <span className="text-gray-500">vs</span>
                    <span className="font-bold">{teams.find((t) => t.id === awayTeamId)?.name}</span>
                  </div>
                  {matchDate && (
                    <p className="text-sm text-gray-700 text-center mt-2">
                      {new Date(matchDate).toLocaleString('es-ES', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || teams.length < 2}
                  className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creando...' : 'Crear Partido'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
