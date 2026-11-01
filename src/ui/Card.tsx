import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { springSnappy } from './motion';
import { toneColor, toneEdge, type AnyTone } from './tones';

export type CardVariant = 'default' | 'nested' | 'outline' | 'highlight' | 'ghost';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  /**
   * default: card standard · nested: dentro un'altra card (card-2) · outline: solo bordo ·
   * highlight: luce dei riflettori (per la card "Adesso") · ghost: nessuno sfondo.
   */
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Colora la luce della variante highlight; sulle altre accende una sottile luce di bordo in alto. */
  tone?: AnyTone;
  /** Rende la card toccabile (button) con feedback di pressione. */
  onPress?: () => void;
  /** Elemento semantico quando non è toccabile. */
  as?: 'div' | 'section' | 'article' | 'li';
  children?: ReactNode;
}

const PAD = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' };

const VARIANT: Record<CardVariant, string> = {
  default: 'bg-card shadow-card',
  nested: 'bg-card-2 !rounded-[14px]',
  outline: 'border border-line bg-transparent',
  highlight: 'bg-card shadow-card overflow-hidden',
  ghost: 'bg-transparent',
};

/** Contenitore del design system: raggio 20 px, niente ombra nel tema scuro. */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { variant = 'default', padding = 'md', tone, onPress, as = 'div', className, style, children, ...rest },
  ref,
) {
  const accent = tone ? toneColor(tone) : 'var(--accent)';
  // Highlight: luce bianco calda dall'alto (nel tema chiaro, una velatura del tono), luce di bordo in alto e
  // anello di 1 px nel colore del tono. Le altre varianti con tono hanno solo la luce di bordo.
  const glow =
    variant === 'highlight' ? (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background: `radial-gradient(120% 70% at 85% -25%, var(--glow-warm, color-mix(in srgb, ${accent} 20%, transparent)), transparent 60%)`,
          boxShadow: `inset 0 1px 0 0 color-mix(in srgb, ${accent} 50%, transparent), inset 0 0 0 1px color-mix(in srgb, ${accent} 22%, transparent)`,
        }}
      />
    ) : tone && variant !== 'ghost' ? (
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ boxShadow: toneEdge(tone, 45) }} />
    ) : null;

  const st: CSSProperties = {
    ...(variant === 'highlight' && (tone ?? 'accent') === 'accent' ? { boxShadow: '0 18px 50px -24px var(--accent-glow)' } : null),
    ...style,
  };

  const cls = cn('relative isolate rounded-card text-ink', VARIANT[variant], PAD[padding], className);

  if (onPress) {
    return (
      <motion.button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        whileTap={{ scale: 0.98 }}
        transition={springSnappy}
        onClick={() => {
          haptic('selection');
          onPress();
        }}
        className={cn(cls, 'block w-full select-none text-left')}
        style={st}
        {...(rest as Omit<HTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'>)}
      >
        {glow}
        {children}
      </motion.button>
    );
  }
  const Tag = as as 'div';
  return (
    <Tag ref={ref as React.Ref<HTMLDivElement>} className={cls} style={st} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {glow}
      {children}
    </Tag>
  );
});
