import { useId } from 'react';

interface Props {
  /** Lado en píxeles */
  size?: number;
  /** Globo con signo de pregunta (para el botón que abre el asistente) */
  badge?: boolean;
  className?: string;
}

/**
 * Avatar del asistente: un futbolista con camiseta de MedioGol y, opcionalmente, un globo "?"
 * que deja claro que ahí se pide ayuda. SVG propio, sin imágenes externas.
 */
export const HelperAvatar = ({ size = 56, badge = false, className = '' }: Props) => {
  const clip = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden="true" className={className}>
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="30" />
        </clipPath>
      </defs>
      {/* Fondo: cancha */}
      <circle cx="32" cy="32" r="30" fill="#15803d" />
      <g clipPath={`url(#${clip})`}>
        <path d="M2 44h60M32 34v30" stroke="#22c55e" strokeWidth="1.5" opacity="0.5" />
        {/* Camiseta */}
        <path d="M10 64c0-12 9-19 22-19s22 7 22 19z" fill="#ffffff" />
        <path d="M10 64c0-9 4-15 10-17l3 17z M54 64c0-9-4-15-10-17l-3 17z" fill="#facc15" />
        <path d="M26 45.6 32 52l6-6.4" fill="none" stroke="#0f1f3d" strokeWidth="2.2" strokeLinejoin="round" />
        <text x="32" y="61.5" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="8" fill="#0f1f3d">10</text>
        {/* Cuello */}
        <rect x="28" y="38" width="8" height="8" rx="3" fill="#c98a5a" />
        {/* Cara */}
        <ellipse cx="32" cy="29" rx="10.5" ry="11.5" fill="#e0a476" />
        <ellipse cx="21.5" cy="30" rx="2" ry="3" fill="#d4956a" />
        <ellipse cx="42.5" cy="30" rx="2" ry="3" fill="#d4956a" />
        {/* Pelo */}
        <path d="M21.4 27c-.6-8 4.6-12.5 10.8-12.5 6.8 0 11 4.3 10.4 12-1.6-3.6-4.4-5.6-8.6-5.9-3.2 2.3-8 3.4-12.6 6.4z" fill="#2b1a10" />
        {/* Ojos y sonrisa */}
        <circle cx="28" cy="29.5" r="1.4" fill="#1f130b" />
        <circle cx="36" cy="29.5" r="1.4" fill="#1f130b" />
        <path d="M27.8 34.2c2.4 2.4 6 2.4 8.4 0" fill="none" stroke="#7a3b1e" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <circle cx="32" cy="32" r="30" fill="none" stroke="#ffffff" strokeWidth="2" />
      {badge && (
        <g>
          <circle cx="51" cy="13" r="11" fill="#facc15" stroke="#ffffff" strokeWidth="2" />
          <text x="51" y="18" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="900" fontSize="15" fill="#0f1f3d">?</text>
        </g>
      )}
    </svg>
  );
};
