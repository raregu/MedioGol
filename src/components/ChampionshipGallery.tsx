import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ChampionshipPhoto } from '../types/database';
import { Upload, Trash2, X, ChevronLeft, ChevronRight, Image, Loader2 } from 'lucide-react';

interface ChampionshipGalleryProps {
  championshipId: string;
  isAdmin: boolean;
}

export function ChampionshipGallery({ championshipId, isAdmin }: ChampionshipGalleryProps) {
  const { profile } = useAuth();
  const [photos, setPhotos] = useState<ChampionshipPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null); // index of open photo
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPhotos();
  }, [championshipId]);

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('championship_photos')
        .select('*')
        .eq('championship_id', championshipId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPhotos(data || []);
    } catch (err) {
      console.error('Error fetching photos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !profile) return;
    setUploading(true);
    setUploadError(null);

    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 5 * 1024 * 1024) {
          setUploadError('Cada foto debe pesar menos de 5MB.');
          continue;
        }

        const ext = file.name.split('.').pop();
        const fileName = `${championshipId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('championship-photos')
          .upload(fileName, file, { cacheControl: '3600', upsert: false });

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('championship-photos')
          .getPublicUrl(fileName);

        const { error: insertErr } = await supabase
          .from('championship_photos')
          .insert({
            championship_id: championshipId,
            url: urlData.publicUrl,
            uploaded_by: profile.id,
          });

        if (insertErr) throw insertErr;
      }

      await fetchPhotos();
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Error al subir la foto.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (photo: ChampionshipPhoto) => {
    if (!confirm('¿Eliminar esta foto?')) return;
    try {
      // Extract storage path from URL
      const url = new URL(photo.url);
      const pathParts = url.pathname.split('/object/public/championship-photos/');
      const storagePath = pathParts[1];

      if (storagePath) {
        await supabase.storage.from('championship-photos').remove([storagePath]);
      }

      await supabase.from('championship_photos').delete().eq('id', photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));

      // Close lightbox if deleting the open photo
      if (lightbox !== null && photos[lightbox]?.id === photo.id) {
        setLightbox(null);
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const openLightbox = (index: number) => setLightbox(index);
  const closeLightbox = () => setLightbox(null);
  const prevPhoto = () => setLightbox((i) => (i === null ? null : (i - 1 + photos.length) % photos.length));
  const nextPhoto = () => setLightbox((i) => (i === null ? null : (i + 1) % photos.length));

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (lightbox === null) return;
      if (e.key === 'ArrowLeft') prevPhoto();
      if (e.key === 'ArrowRight') nextPhoto();
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox, photos.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + upload button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-700 font-semibold">
          <Image className="h-5 w-5 text-emerald-600" />
          <span>Galería de fotos</span>
          {photos.length > 0 && (
            <span className="text-xs text-gray-400 font-normal">({photos.length} fotos)</span>
          )}
        </div>
        {isAdmin && (
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
            uploading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}>
            {uploading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo...</>
            ) : (
              <><Upload className="h-4 w-4" /> Subir fotos</>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => handleUpload(e.target.files)}
            />
          </label>
        )}
      </div>

      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {uploadError}
        </div>
      )}

      {/* Empty state */}
      {photos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <Image className="h-14 w-14 opacity-30" />
          <p className="text-sm">
            {isAdmin ? 'Sube la primera foto del campeonato.' : 'Aún no hay fotos publicadas.'}
          </p>
        </div>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer"
              onClick={() => openLightbox(index)}
            >
              <img
                src={photo.url}
                alt={photo.caption || `Foto ${index + 1}`}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200" />

              {/* Delete button (admin only) */}
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(photo); }}
                  className="absolute top-1.5 right-1.5 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 shadow-md"
                  title="Eliminar foto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && photos[lightbox] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
            onClick={closeLightbox}
          >
            <X className="h-8 w-8" />
          </button>

          {/* Prev */}
          {photos.length > 1 && (
            <button
              className="absolute left-4 text-white/70 hover:text-white z-10 p-2"
              onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
            >
              <ChevronLeft className="h-10 w-10" />
            </button>
          )}

          {/* Image */}
          <img
            src={photos[lightbox].url}
            alt={photos[lightbox].caption || ''}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          {photos.length > 1 && (
            <button
              className="absolute right-4 text-white/70 hover:text-white z-10 p-2"
              onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
            >
              <ChevronRight className="h-10 w-10" />
            </button>
          )}

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {lightbox + 1} / {photos.length}
          </div>
        </div>
      )}
    </div>
  );
}
