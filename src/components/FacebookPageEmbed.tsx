import { Facebook } from 'lucide-react';

interface FacebookPageEmbedProps {
  pageUrl: string;
}

export function FacebookPageEmbed({ pageUrl }: FacebookPageEmbedProps) {
  // Normalize URL
  const normalizedUrl = pageUrl.replace(/\/$/, '');
  const encodedUrl = encodeURIComponent(normalizedUrl);

  // Use Facebook's iframe plugin directly — no SDK, no App ID needed
  const iframeSrc =
    `https://www.facebook.com/plugins/page.php` +
    `?href=${encodedUrl}` +
    `&tabs=timeline%2Cphotos` +
    `&width=500` +
    `&height=600` +
    `&small_header=true` +
    `&adapt_container_width=true` +
    `&hide_cover=false` +
    `&show_facepile=false` +
    `&locale=es_LA`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-gray-700 font-semibold">
        <Facebook className="h-5 w-5 text-blue-600" />
        <span>Galería de Facebook</span>
      </div>

      <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 flex justify-center">
        <iframe
          src={iframeSrc}
          width="500"
          height="600"
          style={{ border: 'none', overflow: 'hidden', maxWidth: '100%' }}
          scrolling="no"
          frameBorder="0"
          allowFullScreen
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          title="Galería de Facebook del campeonato"
        />
      </div>

      <p className="text-xs text-gray-400 text-center">
        Fotos publicadas en la página de Facebook del campeonato.{' '}
        <a
          href={normalizedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          Ver en Facebook →
        </a>
      </p>
    </div>
  );
}
