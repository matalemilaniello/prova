import type { ReactNode } from 'react';
import { cn } from './cn';
import { renderIcon, type IconLike } from './icon';
import { toneColor, toneInk, toneOn, toneRing, toneSoft, type AnyTone } from './tones';

export interface PillProps {
  tone?: AnyTone;
  /** soft: fondo tenue con anello di 1 px (default) · solid: fondo pieno · outline: solo bordo. */
  variant?: 'soft' | 'solid' | 'outline';
  size?: 'sm' | 'md';
  icon?: IconLike;
  /** Puntino colorato a sinistra. */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

/** Etichetta a pillola (raggio 999 px). */
export function Pill({ tone = 'neutral', variant = 'soft', size = 'sm', icon, dot, className, children }: PillProps) {
  const color = toneColor(tone);
  const style =
    variant === 'solid'
      ? { background: color, color: toneOn(tone) }
      : variant === 'outline'
        ? { boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent)`, color: toneInk(tone) }
        : tone === 'neutral'
          ? { background: toneSoft(tone, 16), color: toneInk(tone) }
          : { background: toneSoft(tone, 16), color: toneInk(tone), boxShadow: toneRing(tone, 26) };
  return (
    <span
      className={cn(
        'inline-flex w-fit max-w-full shrink-0 items-center whitespace-nowrap rounded-full font-semibold',
        size === 'sm' ? 'h-6 gap-1 px-2.5 text-[0.75rem]' : 'h-8 gap-1.5 px-3 text-[0.8125rem]',
        className,
      )}
      style={style}
    >
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: variant === 'solid' ? 'currentColor' : color }} />}
      {renderIcon(icon, size === 'sm' ? 13 : 15, 2.4)}
      <span className="truncate">{children}</span>
    </span>
  );
}
