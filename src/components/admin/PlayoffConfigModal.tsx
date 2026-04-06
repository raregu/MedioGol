import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Championship, PlayoffConfig, PlayoffFormat } from '../../types/database';

interface PlayoffConfigModalProps {
  championship: Championship;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PlayoffConfigModal({ championship, onClose, onSuccess }: PlayoffConfigModalProps) {
  const [loading, setLoading] = useState(false);
  const [existingConfig, setExistingConfig] = useState<PlayoffConfig | null>(null);
  const [teamsQualify, setTeamsQualify] = useState(4);
  const [format, setFormat] = useState<PlayoffFormat>('single_elimination');
  const [includeThirdPlace, setIncludeThirdPlace] = useState(false);

  useEffect(() => {
    loadExistingConfig();
  }, [championship.id]);

  const loadExistingConfig = async () => {
    const { data } = await supabase
      .from('playoff_config')
      .select('*')
      .eq('championship_id', championship.id)
      .maybeSingle();

    if (data) {
      setExistingConfig(data);
      setTeamsQualify(data.teams_qualify);
      setFormat(data.format);
      setIncludeThirdPlace(data.include_third_place_match);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const configData = {
        championship_id: championship.id,
        teams_qualify: teamsQualify,
        format,
        include_third_place_match: includeThirdPlace,
      };

      if (existingConfig) {
        const { error } = await supabase
          .from('playoff_config')
          .update(configData)
          .eq('id', existingConfig.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('playoff_config')
          .insert([configData]);

        if (error) throw error;
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving playoff config:', error);
      alert('Error al guardar la configuración de playoffs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">
            {existingConfig ? 'Editar Configuración de Playoffs' : 'Configurar Playoffs'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Número de Equipos Clasificados
            </label>
            <select
              value={teamsQualify}
              onChange={(e) => setTeamsQualify(Number(e.target.value))}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value={2}>2 equipos</option>
              <option value={4}>4 equipos</option>
              <option value={6}>6 equipos</option>
              <option value={8}>8 equipos</option>
              <option value={16}>16 equipos</option>
              <option value={32}>32 equipos</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              Los mejores {teamsQualify} equipos de la tabla de posiciones clasificarán a playoffs
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Formato de Playoffs
            </label>
            <div className="space-y-2">
              <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  value="single_elimination"
                  checked={format === 'single_elimination'}
                  onChange={(e) => setFormat(e.target.value as PlayoffFormat)}
                  className="mr-3"
                />
                <div>
                  <div className="font-medium">Eliminación Directa</div>
                  <div className="text-sm text-gray-600">
                    Un solo partido por llave. El ganador avanza.
                  </div>
                </div>
              </label>

              <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  value="home_away"
                  checked={format === 'home_away'}
                  onChange={(e) => setFormat(e.target.value as PlayoffFormat)}
                  className="mr-3"
                />
                <div>
                  <div className="font-medium">Ida y Vuelta</div>
                  <div className="text-sm text-gray-600">
                    Dos partidos por llave (local y visita). Se suma el marcador agregado.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={includeThirdPlace}
                onChange={(e) => setIncludeThirdPlace(e.target.checked)}
                className="mr-3"
              />
              <div>
                <div className="font-medium">Partido por el Tercer Lugar</div>
                <div className="text-sm text-gray-600">
                  Los perdedores de las semifinales jugarán por el tercer puesto
                </div>
              </div>
            </label>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Resumen de Configuración</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• {teamsQualify} equipos clasificarán a playoffs</li>
              <li>• Formato: {format === 'single_elimination' ? 'Eliminación directa' : 'Ida y vuelta'}</li>
              {includeThirdPlace && <li>• Se jugará el partido por el tercer lugar</li>}
            </ul>
          </div>

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
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Guardando...' : existingConfig ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}