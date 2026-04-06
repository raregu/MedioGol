import { User } from 'lucide-react';

interface PlayerCardProps {
  playerId: string;
  playerName: string;
  position?: string | null;
  jerseyNumber?: number | null;
  photoUrl?: string | null;
  stats?: {
    speed?: number;
    shooting?: number;
    passing?: number;
    dribbling?: number;
    defense?: number;
    physical?: number;
  };
  rating?: number;
  isHighlighted?: boolean;
  onClick?: () => void;
}

export const PlayerCard = ({
  playerName,
  position = 'DEL',
  jerseyNumber,
  photoUrl,
  stats = {},
  rating = 75,
  isHighlighted = false,
  onClick,
}: PlayerCardProps) => {
  const getPositionShort = (pos: string | null | undefined): string => {
    if (!pos) return 'DEL';
    const p = pos.toLowerCase();
    if (p.includes('portero') || p.includes('arq')) return 'ARQ';
    if (p.includes('defensa') || p.includes('def')) return 'DEF';
    if (p.includes('medio') || p.includes('med')) return 'MED';
    return 'DEL';
  };

  const getCardGradient = (rating: number): string => {
    if (rating >= 85) return 'from-yellow-400 via-amber-500 to-yellow-600';
    if (rating >= 75) return 'from-gray-300 via-gray-400 to-gray-500';
    return 'from-orange-600 via-amber-700 to-orange-800';
  };

  const getGlowColor = (rating: number): string => {
    if (rating >= 85) return 'shadow-yellow-500/50';
    if (rating >= 75) return 'shadow-gray-400/50';
    return 'shadow-orange-600/50';
  };

  const positionShort = getPositionShort(position);
  const cardGradient = getCardGradient(rating);
  const glowColor = getGlowColor(rating);

  const {
    speed = Math.floor(Math.random() * 30) + 60,
    shooting = Math.floor(Math.random() * 30) + 60,
    passing = Math.floor(Math.random() * 30) + 60,
    dribbling = Math.floor(Math.random() * 30) + 60,
    defense = Math.floor(Math.random() * 30) + 60,
    physical = Math.floor(Math.random() * 30) + 60,
  } = stats;

  return (
    <div
      onClick={onClick}
      className={`
        relative w-64 h-96 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer
        bg-gradient-to-br ${cardGradient}
        shadow-2xl hover:shadow-3xl hover:-translate-y-2 hover:scale-105
        ${isHighlighted ? `ring-4 ring-yellow-400 animate-pulse ${glowColor}` : ''}
        ${onClick ? 'hover:brightness-110' : ''}
      `}
    >
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[0.5px]"></div>

      <div className="relative h-full p-4 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <div className="text-left">
            <div className="text-5xl font-black text-white drop-shadow-2xl leading-none">
              {rating}
            </div>
            <div className="text-lg font-bold text-white drop-shadow-lg mt-1">
              {positionShort}
            </div>
          </div>

          {jerseyNumber && (
            <div className="text-right">
              <div className="text-3xl font-black text-white/90 drop-shadow-lg">
                #{jerseyNumber}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center mb-4">
          {photoUrl ? (
            <div className="relative w-40 h-40">
              <img
                src={photoUrl}
                alt={playerName}
                className="w-full h-full object-cover rounded-full border-4 border-white/30 shadow-2xl"
              />
            </div>
          ) : (
            <div className="relative w-40 h-40 bg-white/20 rounded-full border-4 border-white/30 shadow-2xl flex items-center justify-center backdrop-blur-sm">
              <User className="h-24 w-24 text-white/70" />
            </div>
          )}
        </div>

        <div className="bg-gradient-to-b from-black/60 to-black/80 backdrop-blur-sm rounded-xl p-3 shadow-xl">
          <div className="text-center mb-3">
            <h3 className="text-xl font-black text-white uppercase tracking-wide drop-shadow-lg line-clamp-1">
              {playerName}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-yellow-400 font-bold">VEL</span>
              <span className="text-white font-bold text-sm">{speed}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-yellow-400 font-bold">TIR</span>
              <span className="text-white font-bold text-sm">{shooting}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-yellow-400 font-bold">PAS</span>
              <span className="text-white font-bold text-sm">{passing}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-yellow-400 font-bold">REG</span>
              <span className="text-white font-bold text-sm">{dribbling}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-yellow-400 font-bold">DEF</span>
              <span className="text-white font-bold text-sm">{defense}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-yellow-400 font-bold">FIS</span>
              <span className="text-white font-bold text-sm">{physical}</span>
            </div>
          </div>
        </div>

        {isHighlighted && (
          <div className="absolute top-2 right-2 px-3 py-1 bg-yellow-400 text-yellow-900 rounded-full text-xs font-black shadow-lg">
            DESTACADO
          </div>
        )}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/10 pointer-events-none"></div>
    </div>
  );
};
