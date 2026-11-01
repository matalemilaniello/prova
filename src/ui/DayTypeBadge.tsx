import { Dumbbell, Leaf, Moon } from 'lucide-react';
import type { DayType } from '../domain/types';
import { DAY_TYPE_LABEL } from '../lib/format';
import { BallIcon } from './BallIcon';
import { Pill } from './Pill';
import { cn } from './cn';
import { toneColor, toneInk, toneSoft } from './tones';
import type { IconLike } from './icon';

export const DAY_TYPE_ICON: Record<DayType, IconLike> = {
  calcio: BallIcon,
  palestra: Dumbbell,
  leggero: Leaf,
  riposo: Moon,
};

export interface DayTypeBadgeProps {
  dayType: DayType;
  /** soft (default) · solid · dot: solo puntino e testo, senza fondo. */
  variant?: 'soft' | 'solid' | 'dot';
  size?: 'sm' | 'md';
  /** Testo al posto del nome del tipo di giorno (es. "Partita 21:00"). */
  label?: string;
  /** Mostra l'icona (default true, tranne per 'dot'). */
  showIcon?: boolean;
  className?: string;
}

/** Tipo di giorno con il suo colore: Calcio, Palestra, Leggero, Riposo. */
export function DayTypeBadge({ dayType, variant = 'soft', size = 'sm', label, showIcon, className }: DayTypeBadgeProps) {
  const text = label ?? DAY_TYPE_LABEL[dayType];
  if (variant === 'dot') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 font-semibold', size === 'sm' ? 'text-[0.8125rem]' : 'text-[0.9375rem]', className)} style={{ color: toneInk(dayType) }}>
        <span
          aria-hidden
          className="size-2 rounded-full"
          style={{ background: toneColor(dayType), boxShadow: `0 0 0 3px ${toneSoft(dayType, 18)}, 0 0 10px ${toneColor(dayType)}` }}
        />
        {text}
      </span>
    );
  }
  return (
    <Pill tone={dayType} variant={variant} size={size} icon={showIcon === false ? undefined : DAY_TYPE_ICON[dayType]} className={className}>
      {text}
    </Pill>
  );
}
