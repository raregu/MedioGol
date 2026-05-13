import { useState } from 'react';
import { X, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BaseTeam } from '../types/database';

interface EditBaseTeamModalProps {
  team: BaseTeam;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditBaseTeamModal({ team, onClose, onSuccess }: EditBaseTeamModalProps) {
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: team.name,
    description: team.description || '',
    founded_date: team.founded_date || '',
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setUploadProgress('');

    try {
      let logo_url = team.logo_url;

      if (logoFile) {
        setUploadProgress('Subiendo logo...');
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `base-teams/${team.id}/logo-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('teams')
          .upload(fileName, logoFile, { upsert: true });

        if (uploadError) throw new Error(`Error subiendo logo: ${uploadError.message}`);

        const { data: urlData } = supabase.storage
          .from('teams')
          .getPublicUrl(fileName);

        logo_url = urlData.publicUrl;
      }

      setUploadProgress('Guardando cambios...');
      const { error } = await supabase
        .from('base_teams')
        .update({
          name: formData.name,
          description: formData.description || null,
          logo_url,
          founded_date: formData.founded_date || null,
        })
        .eq('id', team.id);

      if (error) throw error;

      onSuccess();
    } catch (error: any) {
      console.error('Error updating team:', error);
      alert('Error al actualizar el equipo: ' + error.message);
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Editar Equipo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del Equipo *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ej: Real Madrid"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="Descripción del equipo..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Logo del Equipo
            </label>
            <div className="mb-2">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Preview nuevo logo"
                  className="w-20 h-20 object-contain rounded-lg border border-gray-200 bg-gray-50 p-1"
                />
              ) : team.logo_url ? (
                <img
                  src={team.logo_url}
                  alt="Logo actual"
                  className="w-20 h-20 object-contain rounded-lg border border-gray-200 bg-gray-50 p-1"
                />
              ) : null}
            </div>
            <label
              htmlFor="logo-upload-edit"
              className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <Upload className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-600">
                {logoFile ? logoFile.name : team.logo_url ? 'Cambiar logo...' : 'Seleccionar imagen...'}
              </span>
            </label>
            <input
              id="logo-upload-edit"
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Fundación
            </label>
            <input
              type="date"
              value={formData.founded_date}
              onChange={(e) => setFormData({ ...formData, founded_date: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {uploadProgress && (
            <p className="text-sm text-blue-600 font-medium">{uploadProgress}</p>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
