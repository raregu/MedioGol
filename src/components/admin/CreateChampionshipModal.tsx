import { useState, useEffect } from 'react';
import { Profile } from '../../types/database';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Upload, File, Image as ImageIcon } from 'lucide-react';

interface CreateChampionshipModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateChampionshipModal = ({ onClose, onSuccess }: CreateChampionshipModalProps) => {
  const { profile } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    sport: '',
    venue: '',
    description: '',
    status: 'draft' as 'draft' | 'active' | 'finished',
    start_date: '',
    end_date: '',
    location: '',
    contact_phone: '',
    facebook_page_url: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let image_url = null;
      let rules_pdf_url = null;

      setUploadProgress('Creando campeonato...');
      const insertData: any = {
        name: formData.name,
        sport: formData.sport,
        venue: formData.venue,
        description: formData.description || null,
        status: formData.status,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        location: formData.location || null,
        contact_phone: formData.contact_phone || null,
        facebook_page_url: formData.facebook_page_url || null,
        admin_id: profile?.id,
      };

      const { data: championshipData, error: insertError } = await supabase
        .from('championships')
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      if (imageFile && championshipData) {
        setUploadProgress('Subiendo imagen...');
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${championshipData.id}/image-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('championship-images')
          .upload(fileName, imageFile);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('championship-images')
            .getPublicUrl(fileName);

          image_url = urlData.publicUrl;
        }
      }

      if (pdfFile && championshipData) {
        setUploadProgress('Subiendo reglamento...');
        const fileExt = pdfFile.name.split('.').pop();
        const fileName = `${championshipData.id}/rules-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('championship-rules')
          .upload(fileName, pdfFile);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('championship-rules')
            .getPublicUrl(fileName);

          rules_pdf_url = urlData.publicUrl;
        }
      }

      if (image_url || rules_pdf_url) {
        const updateData: any = {};
        if (image_url) updateData.image_url = image_url;
        if (rules_pdf_url) updateData.rules_pdf_url = rules_pdf_url;

        await supabase
          .from('championships')
          .update(updateData)
          .eq('id', championshipData.id);
      }

      setUploadProgress('');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating championship:', err);
      setError(err.message || 'Error al crear el campeonato');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full my-8">
        <div className="border-b px-6 py-4 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-xl">
          <h2 className="text-2xl font-bold text-gray-900">Crear Campeonato</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Administrador del Campeonato
            </label>
            <input
              type="text"
              value={profile?.full_name || ''}
              disabled
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">
              Serás el administrador de este campeonato
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre del Campeonato *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Liga de Verano 2024"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Deporte *
              </label>
              <input
                type="text"
                required
                value={formData.sport}
                onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
                placeholder="Ej: Fútbol"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recinto *
              </label>
              <input
                type="text"
                required
                value={formData.venue}
                onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                placeholder="Ej: Estadio Municipal"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="draft">Borrador</option>
                <option value="active">Activo</option>
                <option value="finished">Finalizado</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Inicio
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fecha de Fin
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ubicación
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Ej: Santiago, Chile"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Teléfono de Contacto
              </label>
              <input
                type="tel"
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                placeholder="Ej: +56912345678"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Página de Facebook (para galería de fotos)
              </label>
              <input
                type="url"
                value={formData.facebook_page_url}
                onChange={(e) => setFormData({ ...formData, facebook_page_url: e.target.value })}
                placeholder="Ej: https://www.facebook.com/MiLiga2024"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Si ingresas una URL de Facebook, aparecerá una pestaña "Galería" con las publicaciones de la página.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descripción
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Descripción del campeonato..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Imagen del Campeonato
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="image-upload"
                />
                <label
                  htmlFor="image-upload"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-emerald-500 cursor-pointer transition-colors"
                >
                  <ImageIcon className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {imageFile ? imageFile.name : 'Seleccionar imagen'}
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reglamento (PDF)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="pdf-upload"
                />
                <label
                  htmlFor="pdf-upload"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-emerald-500 cursor-pointer transition-colors"
                >
                  <File className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {pdfFile ? pdfFile.name : 'Seleccionar PDF'}
                  </span>
                </label>
              </div>
            </div>
          </div>

          {uploadProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700">{uploadProgress}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creando...' : 'Crear Campeonato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
