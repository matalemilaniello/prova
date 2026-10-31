import { cn, toneColor, toneInk, type AnyTone } from '../../../ui';

export interface SessionGlyphProps {
  /** Lettera o sigla della seduta ('A', 'B', 'C'). */
  letter: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: AnyTone;
  /** Variante piena (seduta fatta o in evidenza). */
  solid?: boolean;
  className?: string;
}

const SIZE = {
  sm: { box: 'size-9 rounded-[11px]', text: 'text-[1.25rem]' },
  md: { box: 'size-11 rounded-[13px]', text: 'text-[1.5rem]' },
  lg: { box: 'size-14 rounded-[16px]', text: 'text-[2rem]' },
  xl: { box: 'size-[76px] rounded-[22px]', text: 'text-[3rem]' },
};

/**
 * La lettera della seduta come una piastrella con le righe del campo:
 * cerchio di centrocampo appena accennato e la luce del tono.
 */
export function SessionGlyph({ letter, size = 'md', tone = 'palestra', solid, className }: SessionGlyphProps) {
  const s = SIZE[size];
  const color = toneColor(tone);
  return (
    <span
      aria-hidden
      className={cn('relative isolate grid shrink-0 place-items-center overflow-hidden', s.box, className)}
      style={{
        background: solid
          ? `linear-gradient(150deg, color-mix(in srgb, ${color} 92%, white), ${color})`
          : `linear-gradient(150deg, color-mix(in srgb, ${color} 26%, transparent), color-mix(in srgb, ${color} 10%, transparent))`,
        boxShadow: solid
          ? `0 8px 22px -10px ${color}, inset 0 1px 0 rgb(255 255 255 / 0.25)`
          : `inset 0 0 0 1px color-mix(in srgb, ${color} 34%, transparent)`,
        color: solid ? `var(--on-${tone === 'accent' ? 'calcio' : tone})` : toneInk(tone),
      }}
    >
      <svg className="absolute inset-0 -z-10 h-full w-full opacity-60" viewBox="0 0 40 40" preserveAspectRatio="none">
        <line x1="0" y1="20" x2="40" y2="20" stroke="currentColor" strokeOpacity="0.16" strokeWidth="0.8" />
        <circle cx="20" cy="20" r="9" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="0.8" />
      </svg>
      <span className={cn('t-num font-bold leading-none', s.text)}>{letter}</span>
    </span>
  );
}
