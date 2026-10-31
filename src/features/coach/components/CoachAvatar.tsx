import { useId } from 'react';
import { cn } from '../../../ui';

export interface CoachAvatarProps {
  size?: number;
  className?: string;
  /** Alone di luce intorno (per l'intestazione della conversazione). */
  glow?: boolean;
}

/**
 * Segno del coach: il cerchio di centrocampo visto dall'alto, con la luce dei riflettori.
 * Sempre su blu notte, in entrambi i temi, come l'icona dell'app.
 */
export function CoachAvatar({ size = 32, className, glow = false }: CoachAvatarProps) {
  const id = useId().replace(/:/g, '');
  return (
    <span
      aria-hidden
      className={cn('relative inline-grid shrink-0 place-items-center rounded-full', className)}
      style={{
        width: size,
        height: size,
        boxShadow: glow
          ? '0 0 0 1px rgb(245 192 74 / 0.28), 0 10px 32px -8px rgb(245 192 74 / 0.45)'
          : '0 0 0 1px rgb(245 192 74 / 0.22)',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 64 64" className="rounded-full">
        <defs>
          <radialGradient id={`bg-${id}`} cx="50%" cy="0%" r="110%">
            <stop offset="0%" stopColor="#24375a" />
            <stop offset="55%" stopColor="#13213a" />
            <stop offset="100%" stopColor="#0b1424" />
          </radialGradient>
          <radialGradient id={`light-${id}`} cx="50%" cy="-10%" r="75%">
            <stop offset="0%" stopColor="#f5c04a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#f5c04a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`line-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd77a" />
            <stop offset="100%" stopColor="#e9a92a" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="32" fill={`url(#bg-${id})`} />
        <circle cx="32" cy="32" r="32" fill={`url(#light-${id})`} />
        {/* Linea di metà campo e cerchio di centrocampo */}
        <line x1="0" y1="38" x2="64" y2="38" stroke="#eef2f8" strokeOpacity="0.16" strokeWidth="1.6" />
        <circle cx="32" cy="38" r="14.5" fill="none" stroke={`url(#line-${id})`} strokeWidth="3.4" />
        <circle cx="32" cy="38" r="3.4" fill="#ffd77a" />
        {/* Arco di luce */}
        <path d="M14 20 A 22 22 0 0 1 50 20" fill="none" stroke="#f5c04a" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
