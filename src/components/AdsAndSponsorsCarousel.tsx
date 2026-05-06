import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Advertisement, Sponsor } from '../types/database';

interface CarouselItem {
  id: string;
  type: 'advertisement' | 'sponsor';
  title: string;
  image_url?: string;
  link_url?: string;
  description?: string;
}

interface AdsAndSponsorsCarouselProps {
  advertisements: Advertisement[];
  sponsors: Sponsor[];
}

export const AdsAndSponsorsCarousel = ({ advertisements, sponsors }: AdsAndSponsorsCarouselProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [items, setItems] = useState<CarouselItem[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const carouselItems: CarouselItem[] = [
      ...advertisements.map(ad => ({
        id: ad.id,
        type: 'advertisement' as const,
        title: ad.title,
        image_url: ad.image_url,
        link_url: ad.link_url,
        description: ad.description,
      })),
      ...sponsors.map(sponsor => ({
        id: sponsor.id,
        type: 'sponsor' as const,
        title: sponsor.name,
        image_url: sponsor.logo_url,
        link_url: sponsor.website_url,
        description: sponsor.description,
      })),
    ];
    setItems(carouselItems);
  }, [advertisements, sponsors]);

  useEffect(() => {
    if (items.length <= 1) return;

    const interval = setInterval(() => {
      handleNext();
    }, 5000);

    return () => clearInterval(interval);
  }, [items.length, currentIndex]);

  const handleNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prevIndex) => (prevIndex + 1) % items.length);
    setTimeout(() => setIsTransitioning(false), 500);
  };

  const handlePrevious = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prevIndex) => (prevIndex - 1 + items.length) % items.length);
    setTimeout(() => setIsTransitioning(false), 500);
  };

  const goToSlide = (index: number) => {
    if (isTransitioning || index === currentIndex) return;
    setIsTransitioning(true);
    setCurrentIndex(index);
    setTimeout(() => setIsTransitioning(false), 500);
  };

  if (items.length === 0) return null;

  const handleClick = (item: CarouselItem) => {
    if (item.link_url) {
      window.open(item.link_url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="w-full bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-2xl overflow-hidden">
      <div className="relative h-80 md:h-96">
        <div className="relative w-full h-full overflow-hidden">
          {items.map((item, index) => {
            const offset = index - currentIndex;
            const isActive = index === currentIndex;

            return (
              <div
                key={item.id}
                className={`absolute top-0 left-0 w-full h-full transition-all duration-500 ease-in-out ${
                  item.link_url ? 'cursor-pointer' : ''
                }`}
                style={{
                  transform: `translateX(${offset * 100}%)`,
                  opacity: isActive ? 1 : 0,
                  pointerEvents: isActive ? 'auto' : 'none',
                }}
                onClick={() => handleClick(item)}
              >
                {item.image_url ? (
                  <div className="relative w-full h-full">
                    <div className="absolute inset-0 flex items-center justify-center p-8">
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="max-w-full max-h-[70%] object-contain"
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-6 pb-8">
                      <div className="max-w-4xl mx-auto">
                        <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">
                          {item.title}
                        </h3>
                        {item.description && (
                          <p className="text-sm md:text-base text-gray-200 mb-3 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                        {item.link_url && (
                          <div className="inline-flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                            <span>Ver más</span>
                            <span>→</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative w-full h-full bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 flex items-center justify-center p-8">
                    <div className="text-center text-white max-w-3xl">
                      <h3 className="text-3xl md:text-5xl font-bold mb-4 drop-shadow-lg">
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="text-lg md:text-xl mb-6 drop-shadow">
                          {item.description}
                        </p>
                      )}
                      {item.link_url && (
                        <div className="inline-flex items-center gap-2 bg-white text-emerald-700 px-6 py-3 rounded-full font-bold text-base shadow-lg hover:shadow-xl transition-shadow">
                          <span>Más información</span>
                          <span>→</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="absolute top-4 right-4 px-4 py-2 rounded-full text-xs font-bold backdrop-blur-md bg-white/90 text-gray-900 shadow-lg">
                  {item.type === 'advertisement' ? 'PUBLICIDAD' : 'SPONSOR'}
                </div>
              </div>
            );
          })}
        </div>

        {items.length > 1 && (
          <>
            <button
              onClick={handlePrevious}
              disabled={isTransitioning}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/95 hover:bg-white shadow-xl flex items-center justify-center text-gray-900 hover:text-emerald-600 transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed z-10"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>
            <button
              onClick={handleNext}
              disabled={isTransitioning}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/95 hover:bg-white shadow-xl flex items-center justify-center text-gray-900 hover:text-emerald-600 transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed z-10"
              aria-label="Siguiente"
            >
              <ChevronRight className="w-7 h-7" />
            </button>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex items-center justify-center gap-3 px-4 py-5 bg-black/40">
          {items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => goToSlide(index)}
              disabled={isTransitioning}
              className={`transition-all duration-300 rounded-full ${
                index === currentIndex
                  ? 'w-10 h-3 bg-emerald-500'
                  : 'w-3 h-3 bg-gray-400 hover:bg-gray-300'
              } disabled:cursor-not-allowed`}
              aria-label={`Ir a slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
