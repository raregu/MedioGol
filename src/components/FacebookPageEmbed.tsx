import { useEffect, useRef } from 'react';
import { Facebook } from 'lucide-react';

interface FacebookPageEmbedProps {
  pageUrl: string;
}

declare global {
  interface Window {
    FB?: {
      init: (params: object) => void;
      XFBML?: { parse: () => void };
    };
    fbAsyncInit?: () => void;
  }
}

export function FacebookPageEmbed({ pageUrl }: FacebookPageEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadFBSDK = () => {
      if (window.FB) {
        window.FB.XFBML?.parse();
        return;
      }

      window.fbAsyncInit = function () {
        window.FB?.init({
          xfbml: true,
          version: 'v19.0',
        });
      };

      if (!document.getElementById('facebook-jssdk')) {
        const script = document.createElement('script');
        script.id = 'facebook-jssdk';
        script.src = 'https://connect.facebook.net/es_LA/sdk.js';
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
      }
    };

    loadFBSDK();
  }, [pageUrl]);

  // Normalize URL: strip trailing slash and ensure it's a full URL
  const normalizedUrl = pageUrl.replace(/\/$/, '');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-gray-700 font-semibold">
        <Facebook className="h-5 w-5 text-blue-600" />
        <span>Galería de Facebook</span>
      </div>

      <div ref={containerRef} className="flex justify-center">
        <div
          className="fb-page"
          data-href={normalizedUrl}
          data-tabs="timeline,photos"
          data-width="500"
          data-height="600"
          data-small-header="true"
          data-adapt-container-width="true"
          data-hide-cover="false"
          data-show-facepile="false"
        />
      </div>

      <div
        id="fb-root"
        style={{ display: 'none' }}
      />

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
