import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { springSnappy } from './motion';
import { toneColor, type AnyTone } from './tones';

export type CardVariant = 'default' | 'nested' | 'outline' | 'highlight' | 'ghost';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  /**
   * default: card standard · nested: dentro un'altra card (card-2) · outline: solo bordo ·
   * highlight: luce dei riflettori (per la card "Adesso") · ghost: nessuno sfondo.
   */
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Colora la luce della variante highlight o una sottile barra laterale sulle altre. */
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
  const glow =
    variant === 'highlight' ? (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background: `radial-gradient(130% 90% at 85% -20%, color-mix(in srgb, ${accent} 22%, transparent), transparent 60%)`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 26%, transparent)`,
        }}
      />
    ) : tone ? (
      <span aria-hidden className="pointer-events-none absolute inset-y-4 left-0 w-[3px] rounded-r-full" style={{ background: accent }} />
    ) : null;

  const cls = cn('relative isolate rounded-card text-ink', VARIANT[variant], PAD[padding], className);
  const st: CSSProperties = { ...style };

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
