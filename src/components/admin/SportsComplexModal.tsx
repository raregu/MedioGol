import { useState } from 'react';
import { X, MapPin, Phone, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SportsComplex {
  id?: string;
  name: string;
  address: string;
  location_url: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  description: string;
  facilities: string;
}

interface SportsComplexModalProps {
  complex?: SportsComplex | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const SportsComplexModal = ({ complex, onClose, onSuccess }: SportsComplexModalProps) => {
  const [formData, setFormData] = useState<SportsComplex>({
    name: complex?.name || '',
    address: complex?.address || '',
    location_url: complex?.location_url || '',
    latitude: complex?.latitude || null,
    longitude: complex?.longitude || null,
    phone: complex?.phone || '',
    description: complex?.description || '',
    facilities: complex?.facilities || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }

    if (!formData.address.trim()) {
      setError('La dirección es obligatoria');
      return;
    }

    setLoading(true);

    try {
      const dataToSave = {
        name: formData.name.trim(),
        address: formData.address.trim(),
        location_url: formData.location_url.trim() || null,
        latitude: formData.latitude,
        longitude: formData.longitude,
        phone: formData.phone.trim() || null,
        description: formData.description.trim() || null,
        facilities: formData.facilities.trim() || null,
      };

      if (complex?.id) {
        const { error: updateError } = await supabase
          .from('sports_complexes')
          .update(dataToSave)
          .eq('id', complex.id);

        if (updateError) throw updateError;
        alert('Complejo actualizado exitosamente');
      } else {
        const { error: insertError } = await supabase
          .from('sports_complexes')
          .insert(dataToSave);

        if (insertError) throw insertError;
        alert('Complejo creado exitosamente');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving complex:', err);
      setError(err.message || 'Error al guardar el complejo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="h-6 w-6 text-emerald-600" />
            {complex?.id ? 'Editar Complejo Deportivo' : 'Nuevo Complejo Deportivo'}
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

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del Complejo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Complejo Deportivo Central"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
              Dirección Completa <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Ej: Av. Principal 123, Ciudad"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label htmlFor="location_url" className="block text-sm font-medium text-gray-700 mb-2">
              URL de Google Maps / Waze
            </label>
            <input
              type="url"
              id="location_url"
              value={formData.location_url}
              onChange={(e) => setFormData({ ...formData, location_url: e.target.value })}
              placeholder="https://maps.google.com/?q=..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Copia el enlace desde Google Maps para compartir la ubicación exacta
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="latitude" className="block text-sm font-medium text-gray-700 mb-2">
                Latitud
              </label>
              <input
                type="number"
                id="latitude"
                step="0.00000001"
                value={formData.latitude || ''}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="-34.603722"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="longitude" className="block text-sm font-medium text-gray-700 mb-2">
                Longitud
              </label>
              <input
                type="number"
                id="longitude"
                step="0.00000001"
                value={formData.longitude || ''}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="-58.381592"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-emerald-600" />
                Teléfono de Contacto
              </div>
            </label>
            <input
              type="tel"
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+54 11 1234-5678"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" />
                Descripción
              </div>
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripción del complejo deportivo..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label htmlFor="facilities" className="block text-sm font-medium text-gray-700 mb-2">
              Instalaciones y Servicios
            </label>
            <textarea
              id="facilities"
              value={formData.facilities}
              onChange={(e) => setFormData({ ...formData, facilities: e.target.value })}
              placeholder="Ej: Canchas sintéticas, vestuarios, estacionamiento, cantina..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>

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
              disabled={loading}
              className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Guardando...' : complex?.id ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
