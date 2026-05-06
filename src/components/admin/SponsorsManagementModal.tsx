import { useState, useEffect } from 'react';
import { X, Plus, CreditCard as Edit, Trash2, Eye, EyeOff, ExternalLink, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Sponsor, Championship } from '../../types/database';

interface SponsorsManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  championshipId?: string;
}

export const SponsorsManagementModal = ({ isOpen, onClose, championshipId }: SponsorsManagementModalProps) => {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    logo_url: '',
    website_url: '',
    description: '',
    championship_id: championshipId || '',
    display_order: 0,
    is_active: true,
  });

  useEffect(() => {
    if (isOpen) {
      fetchSponsors();
      if (!championshipId) {
        fetchChampionships();
      }
    }
  }, [isOpen, championshipId]);

  const fetchSponsors = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sponsors')
        .select(`
          *,
          championship:championships(name)
        `)
        .order('display_order', { ascending: true });

      if (championshipId) {
        query = query.eq('championship_id', championshipId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSponsors(data || []);
    } catch (error) {
      console.error('Error fetching sponsors:', error);
      alert('Error al cargar sponsors');
    } finally {
      setLoading(false);
    }
  };

  const fetchChampionships = async () => {
    try {
      const { data, error } = await supabase
        .from('championships')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      setChampionships(data || []);
    } catch (error) {
      console.error('Error fetching championships:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.championship_id) {
      alert('Debes seleccionar un campeonato');
      return;
    }

    setLoading(true);

    try {
      if (editingSponsor) {
        const { error } = await supabase
          .from('sponsors')
          .update(formData)
          .eq('id', editingSponsor.id);

        if (error) throw error;
        alert('Sponsor actualizado exitosamente');
      } else {
        const { error } = await supabase
          .from('sponsors')
          .insert([formData]);

        if (error) throw error;
        alert('Sponsor creado exitosamente');
      }

      resetForm();
      fetchSponsors();
    } catch (error) {
      console.error('Error saving sponsor:', error);
      alert('Error al guardar sponsor');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen');
      return;
    }

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from('sponsor-logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('sponsor-logos')
        .getPublicUrl(filePath);

      setFormData({ ...formData, logo_url: publicUrl });
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('Error al subir logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleEdit = (sponsor: Sponsor) => {
    setEditingSponsor(sponsor);
    setFormData({
      name: sponsor.name,
      logo_url: sponsor.logo_url || '',
      website_url: sponsor.website_url || '',
      description: sponsor.description || '',
      championship_id: sponsor.championship_id,
      display_order: sponsor.display_order,
      is_active: sponsor.is_active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este sponsor?')) return;

    try {
      const { error } = await supabase
        .from('sponsors')
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert('Sponsor eliminado exitosamente');
      fetchSponsors();
    } catch (error) {
      console.error('Error deleting sponsor:', error);
      alert('Error al eliminar sponsor');
    }
  };

  const toggleActive = async (sponsor: Sponsor) => {
    try {
      const { error } = await supabase
        .from('sponsors')
        .update({ is_active: !sponsor.is_active })
        .eq('id', sponsor.id);

      if (error) throw error;
      fetchSponsors();
    } catch (error) {
      console.error('Error toggling sponsor status:', error);
      alert('Error al cambiar estado');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      logo_url: '',
      website_url: '',
      description: '',
      championship_id: championshipId || '',
      display_order: 0,
      is_active: true,
    });
    setEditingSponsor(null);
    setShowForm(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {championshipId ? 'Gestión de Sponsors del Campeonato' : 'Gestión de Sponsors'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!showForm ? (
            <div>
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Nuevo Sponsor
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : sponsors.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No hay sponsors creados
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sponsors.map((sponsor) => (
                    <div
                      key={sponsor.id}
                      className={`border rounded-lg p-4 ${
                        sponsor.is_active ? 'border-gray-200 bg-white' : 'border-gray-300 bg-gray-50'
                      }`}
                    >
                      <div className="flex gap-4 items-start">
                        {sponsor.logo_url && (
                          <img
                            src={sponsor.logo_url}
                            alt={sponsor.name}
                            className="w-24 h-24 object-contain rounded-lg border border-gray-200"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-lg text-gray-900 truncate">{sponsor.name}</h3>
                          {sponsor.description && (
                            <p className="text-gray-600 text-sm mt-1 line-clamp-2">{sponsor.description}</p>
                          )}
                          {sponsor.website_url && (
                            <a
                              href={sponsor.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1 mt-2"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Sitio web
                            </a>
                          )}
                          <div className="flex items-center gap-2 mt-2 text-xs">
                            <span className="text-gray-500">Orden: {sponsor.display_order}</span>
                            <span className={`px-2 py-1 rounded-full ${
                              sponsor.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {sponsor.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                            {!championshipId && (
                              <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                                {(sponsor as any).championship?.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => toggleActive(sponsor)}
                          className="flex-1 p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
                          title={sponsor.is_active ? 'Desactivar' : 'Activar'}
                        >
                          {sponsor.is_active ? <EyeOff className="w-4 h-4 mx-auto" /> : <Eye className="w-4 h-4 mx-auto" />}
                        </button>
                        <button
                          onClick={() => handleEdit(sponsor)}
                          className="flex-1 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4 mx-auto" />
                        </button>
                        <button
                          onClick={() => handleDelete(sponsor.id)}
                          className="flex-1 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4 mx-auto" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Sponsor *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ejemplo: Nike"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo
                </label>
                <div className="flex gap-4 items-start">
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {uploadingLogo && (
                      <p className="text-sm text-gray-500 mt-1">Subiendo logo...</p>
                    )}
                  </div>
                  {formData.logo_url && (
                    <img
                      src={formData.logo_url}
                      alt="Preview"
                      className="w-24 h-24 object-contain rounded-lg border border-gray-200"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sitio Web (URL)
                </label>
                <input
                  type="url"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://ejemplo.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Descripción del sponsor"
                />
              </div>

              {!championshipId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Campeonato *
                  </label>
                  <select
                    required
                    value={formData.championship_id}
                    onChange={(e) => setFormData({ ...formData, championship_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Selecciona un campeonato</option>
                    {championships.map((champ) => (
                      <option key={champ.id} value={champ.id}>
                        {champ.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Orden de visualización
                  </label>
                  <input
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estado
                  </label>
                  <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-gray-700">Activo</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || uploadingLogo}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingSponsor ? 'Actualizar' : 'Crear'} Sponsor
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};