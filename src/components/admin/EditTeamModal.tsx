import { useState } from 'react';
import { Team } from '../../types/database';
import { supabase } from '../../lib/supabase';
import { X, Upload } from 'lucide-react';

interface EditTeamModalProps {
  team: Team;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditTeamModal = ({ team, onClose, onSuccess }: EditTeamModalProps) => {
  const [formData, setFormData] = useState({
    name: team.name,
    stamina: team.stamina,
    comments: team.comments || '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setUploadProgress('');
    setError(null);

    try {
      let logo_url = team.logo_url;

      if (logoFile) {
        setUploadProgress('Subiendo insignia...');
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `${team.id}/logo-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('teams')
          .upload(fileName, logoFile, { upsert: true });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error(`Error subiendo insignia: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
          .from('teams')
          .getPublicUrl(fileName);

        logo_url = urlData.publicUrl;
      }

      setUploadProgress('Actualizando información...');
      const updateData: any = {
        name: formData.name,
        stamina: formData.stamina,
        comments: formData.comments || null,
      };

      if (logo_url) updateData.logo_url = logo_url;

      const { error: updateError } = await supabase
        .from('teams')
        .update(updateData)
        .eq('id', team.id);

      if (updateError) {
        console.error('Update error:', updateError);
        throw new Error(`Error actualizando: ${updateError.message}`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error updating team:', err);
      setError(err.message || 'Error al actualizar el equipo');
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-2xl font-bold text-gray-900">Editar Equipo</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del Equipo *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stamina (0-100) *
            </label>
            <input
              type="number"
              required
              min="0"
              max="100"
              value={formData.stamina}
              onChange={(e) => setFormData({ ...formData, stamina: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comentarios
            </label>
            <textarea
              value={formData.comments}
              onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Insignia del Equipo
            </label>
            {team.logo_url && !logoFile && (
              <div className="mb-3">
                <img
                  src={team.logo_url}
                  alt={team.name}
                  className="w-24 h-24 object-contain rounded-lg border border-gray-200 bg-gray-50 p-2"
                />
                <p className="text-xs text-gray-500 mt-1">Insignia actual</p>
              </div>
            )}
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                className="hidden"
                id="logo-upload"
              />
              <label
                htmlFor="logo-upload"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-emerald-500 cursor-pointer transition-colors"
              >
                <Upload className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {logoFile ? logoFile.name : 'Seleccionar insignia'}
                </span>
              </label>
            </div>
          </div>

          {uploadProgress && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-sm text-emerald-700">{uploadProgress}</p>
            </div>
          )}

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
  );
};
