import { useState, useEffect } from 'react';
import { Match } from '../../types/database';
import { supabase } from '../../lib/supabase';
import { X, FileText, MapPin } from 'lucide-react';
import { MatchDetailsModal } from './MatchDetailsModal';

interface EditMatchModalProps {
  match: Match;
  onClose: () => void;
  onSuccess: () => void;
}

interface SportsComplex {
  id: string;
  name: string;
  address: string;
  location_url: string | null;
}

export const EditMatchModal = ({ match, onClose, onSuccess }: EditMatchModalProps) => {
  const [formData, setFormData] = useState({
    match_date: match.match_date.split('T')[0],
    match_time: match.match_date.split('T')[1]?.substring(0, 5) || '00:00',
    round: match.round,
    home_score: match.home_score,
    away_score: match.away_score,
    status: match.status,
    venue: match.venue || '',
    sports_complex_id: (match as any).sports_complex_id || '',
  });
  const [sportsComplexes, setSportsComplexes] = useState<SportsComplex[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMatchDetails, setShowMatchDetails] = useState(false);

  useEffect(() => {
    fetchSportsComplexes();
  }, []);

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
    setLoading(true);
    setError(null);

    try {
      const match_datetime = `${formData.match_date}T${formData.match_time}:00`;

      const { error: updateError } = await supabase
        .from('matches')
        .update({
          match_date: match_datetime,
          round: formData.round,
          home_score: formData.home_score,
          away_score: formData.away_score,
          status: formData.status,
          venue: formData.venue || null,
          sports_complex_id: formData.sports_complex_id || null,
        })
        .eq('id', match.id);

      if (updateError) {
        console.error('Update error:', updateError);
        throw new Error(`Error actualizando: ${updateError.message}`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error updating match:', err);
      setError(err.message || 'Error al actualizar el partido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
          <div className="bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
            <h2 className="text-2xl font-bold text-gray-900">Editar Partido</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <p className="text-sm text-gray-600 mb-1">Partido</p>
                  <p className="font-bold text-gray-900">
                    {match.home_team?.name} vs {match.away_team?.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMatchDetails(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  <FileText className="h-4 w-4" />
                  Eventos
                </button>
              </div>
            </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha *
              </label>
              <input
                type="date"
                required
                value={formData.match_date}
                onChange={(e) => setFormData({ ...formData, match_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hora *
              </label>
              <input
                type="time"
                required
                value={formData.match_time}
                onChange={(e) => setFormData({ ...formData, match_time: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fecha (Número) *
            </label>
            <input
              type="number"
              required
              min="1"
              value={formData.round}
              onChange={(e) => setFormData({ ...formData, round: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-600" />
                Complejo Deportivo
              </div>
            </label>
            <select
              value={formData.sports_complex_id}
              onChange={(e) => setFormData({ ...formData, sports_complex_id: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">Selecciona un complejo...</option>
              {sportsComplexes.map((complex) => (
                <option key={complex.id} value={complex.id}>
                  {complex.name} - {complex.address}
                </option>
              ))}
            </select>
            {formData.sports_complex_id && (
              <div className="mt-2">
                {sportsComplexes.find(c => c.id === formData.sports_complex_id)?.location_url && (
                  <a
                    href={sportsComplexes.find(c => c.id === formData.sports_complex_id)?.location_url || '#'}
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Detalles adicionales (Cancha, Observaciones)
            </label>
            <input
              type="text"
              value={formData.venue}
              onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
              placeholder="Ej: Cancha 3, Sector B..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Estado *
            </label>
            <select
              required
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="scheduled">Programado</option>
              <option value="playing">En Juego</option>
              <option value="finished">Finalizado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Goles {match.home_team?.name}
              </label>
              <input
                type="number"
                min="0"
                value={formData.home_score}
                onChange={(e) => setFormData({ ...formData, home_score: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Goles {match.away_team?.name}
              </label>
              <input
                type="number"
                min="0"
                value={formData.away_score}
                onChange={(e) => setFormData({ ...formData, away_score: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>

    {showMatchDetails && match.home_team && match.away_team && (
      <MatchDetailsModal
        matchId={match.id}
        homeTeamId={match.home_team_id}
        awayTeamId={match.away_team_id}
        homeTeamName={match.home_team.name}
        awayTeamName={match.away_team.name}
        championshipId={match.championship_id}
        onClose={() => setShowMatchDetails(false)}
        onSuccess={() => {
          setShowMatchDetails(false);
          onSuccess();
        }}
      />
    )}
    </>
  );
};
