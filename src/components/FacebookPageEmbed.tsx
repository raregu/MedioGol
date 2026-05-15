import { Facebook, ExternalLink, Image } from 'lucide-react';

interface FacebookPageEmbedProps {
  pageUrl: string;
}

export function FacebookPageEmbed({ pageUrl }: FacebookPageEmbedProps) {
  const normalizedUrl = pageUrl.replace(/\/$/, '');

  // Extract page name/handle for display
  const pageName = normalizedUrl.split('/').filter(Boolean).pop() || 'Facebook';
  const displayName = pageName.replace(/\./g, ' ').replace(/-/g, ' ');

  // URL to open Facebook photos directly
  const photosUrl = normalizedUrl.endsWith('/photos')
    ? normalizedUrl
    : `${normalizedUrl}/photos`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-gray-700 font-semibold">
        <Facebook className="h-5 w-5 text-blue-600" />
        <span>Galería de Facebook</span>
      </div>

      {/* Main card */}
      <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden">
        {/* Header */}
        <div className="bg-[#1877F2] px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Facebook className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-tight capitalize">{displayName}</p>
            <p className="text-blue-100 text-sm">Página de Facebook del campeonato</p>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          <div className="flex items-start gap-3 text-gray-600 text-sm">
            <Image className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <p>
              Las fotos y publicaciones del campeonato están disponibles en la página oficial de Facebook.
              Haz clic en cualquiera de los botones de abajo para verlas.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={photosUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1464d8] transition-colors shadow-sm"
            >
              <Image className="h-4 w-4" />
              Ver Fotos
            </a>
            <a
              href={normalizedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white text-[#1877F2] font-semibold rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors shadow-sm"
            >
              <ExternalLink className="h-4 w-4" />
              Ir a la Página
            </a>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Las fotos se abren directamente en Facebook.
      </p>
    </div>
  );
}
