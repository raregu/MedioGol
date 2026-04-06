import { useState, useEffect } from 'react';
import { Championship, Profile } from '../../types/database';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Upload, File, Image as ImageIcon, Trash2 } from 'lucide-react';

interface EditChampionshipModalProps {
  championship: Championship;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditChampionshipModal = ({ championship, onClose, onSuccess }: EditChampionshipModalProps) => {
  const { isAdmin } = useAuth();
  const [formData, setFormData] = useState({
    name: championship.name,
    sport: championship.sport,
    venue: championship.venue,
    description: championship.description || '',
    status: championship.status,
    start_date: championship.start_date || '',
    end_date: championship.end_date || '',
    location: championship.location || '',
    contact_phone: championship.contact_phone || '',
    admin_id: championship.admin_id || '',
  });
  const [championshipAdmins, setChampionshipAdmins] = useState<Profile[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      fetchChampionshipAdmins();
    }
  }, [isAdmin]);

  const fetchChampionshipAdmins = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['admin_sistema', 'admin_campeonato'])
        .order('full_name');

      if (data) setChampionshipAdmins(data);
    } catch (error) {
      console.error('Error fetching admins:', error);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este campeonato? Esta acción no se puede deshacer y eliminará todos los equipos, partidos y estadísticas asociadas.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('championships')
        .delete()
        .eq('id', championship.id);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw new Error(`Error al eliminar: ${deleteError.message}`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error deleting championship:', err);
      setError(err.message || 'Error al eliminar el campeonato');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setUploadProgress('');
    setError(null);

    try {
      let image_url = championship.image_url;
      let rules_pdf_url = championship.rules_pdf_url;

      if (imageFile) {
        setUploadProgress('Subiendo imagen...');
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${championship.id}/image-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('championship-images')
          .upload(fileName, imageFile, { upsert: true });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error(`Error subiendo imagen: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
          .from('championship-images')
          .getPublicUrl(fileName);

        image_url = urlData.publicUrl;
      }

      if (pdfFile) {
        setUploadProgress('Subiendo PDF...');
        const fileExt = pdfFile.name.split('.').pop();
        const fileName = `${championship.id}/rules-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('championship-rules')
          .upload(fileName, pdfFile, { upsert: true });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error(`Error subiendo PDF: ${uploadError.message}`);
        }

        const { data: urlData } = supabase.storage
          .from('championship-rules')
          .getPublicUrl(fileName);

        rules_pdf_url = urlData.publicUrl;
      }

      setUploadProgress('Actualizando información...');
      const updateData: any = {
        name: formData.name,
        sport: formData.sport,
        venue: formData.venue,
        description: formData.description,
        status: formData.status,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        location: formData.location || null,
        contact_phone: formData.contact_phone || null,
      };

      if (isAdmin && formData.admin_id) {
        updateData.admin_id = formData.admin_id;
      }

      if (image_url) updateData.image_url = image_url;
      if (rules_pdf_url) updateData.rules_pdf_url = rules_pdf_url;

      const { error: updateError } = await supabase
        .from('championships')
        .update(updateData)
        .eq('id', championship.id);

      if (updateError) {
        console.error('Update error:', updateError);
        throw new Error(`Error actualizando: ${updateError.message}`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error updating championship:', err);
      setError(err.message || 'Error al actualizar el campeonato');
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Editar Campeonato</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Administrador del Campeonato *
              </label>
              <select
                required
                value={formData.admin_id}
                onChange={(e) => setFormData({ ...formData, admin_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="">Seleccionar administrador...</option>
                {championshipAdmins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.full_name} ({admin.role === 'admin_sistema' ? 'Admin Sistema' : 'Admin Campeonato'})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Este usuario podrá gestionar todos los aspectos del campeonato
              </p>
            </div>
          )}

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
                Teléfono de Contacto
              </label>
              <input
                type="tel"
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                placeholder="+56 9 1234 5678"
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
                placeholder="Dirección completa"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Imagen del Campeonato
              </label>
              {championship.image_url && !imageFile && (
                <div className="mb-2">
                  <img
                    src={championship.image_url}
                    alt="Current"
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <p className="text-xs text-gray-500 mt-1">Imagen actual</p>
                </div>
              )}
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
                Bases del Campeonato (PDF)
              </label>
              {championship.rules_pdf_url && !pdfFile && (
                <a
                  href={championship.rules_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 mb-2"
                >
                  <File className="h-4 w-4" />
                  Ver documento actual
                </a>
              )}
              <div className="relative">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="pdf-upload"
                />
                <label
                  htmlFor="pdf-upload"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-emerald-500 cursor-pointer transition-colors"
                >
                  <Upload className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {pdfFile ? pdfFile.name : 'Seleccionar PDF'}
                  </span>
                </label>
              </div>
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
              onClick={handleDelete}
              disabled={loading}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
            <div className="flex-1 flex gap-3">
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
          </div>
        </form>
      </div>
    </div>
  );
};
