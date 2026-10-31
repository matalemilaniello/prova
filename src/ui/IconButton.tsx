import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { haptic as vibrate, type HapticKind } from '../lib/haptics';
import { cn } from './cn';
import { renderIcon, type IconLike } from './icon';
import { springSnappy } from './motion';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'children'> {
  icon: IconLike;
  /** Obbligatoria: diventa aria-label (e title). */
  label: string;
  /** plain: solo icona · tinted: fondo tenue · filled: fondo card · glass: traslucido (sopra immagini) · accent: pieno accento. */
  variant?: 'plain' | 'tinted' | 'filled' | 'glass' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  /** Puntino di notifica. */
  badge?: boolean;
  haptic?: HapticKind | false;
}

const SIZE = { sm: { box: 'size-9', icon: 18 }, md: { box: 'size-11', icon: 21 }, lg: { box: 'size-13', icon: 24 } };

const VARIANT = {
  plain: 'text-ink-2 hover:text-ink',
  tinted: 'bg-ink-soft text-ink',
  filled: 'bg-card text-ink border border-line shadow-card',
  glass: 'glass text-ink border border-[var(--bar-line)]',
  accent: 'bg-accent text-on-accent',
};

/** Pulsante solo icona, area toccabile ≥ 44 px, etichetta accessibile obbligatoria. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'tinted', size = 'md', badge, haptic = 'selection', className, type = 'button', onClick, disabled, ...rest },
  ref,
) {
  const s = SIZE[size];
  return (
    <motion.button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      transition={springSnappy}
      onClick={(e) => {
        if (haptic) vibrate(haptic);
        onClick?.(e);
      }}
      className={cn(
        'hit-44 relative inline-flex shrink-0 select-none items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-40',
        s.box,
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {renderIcon(icon, s.icon, 2)}
      {badge && <span aria-hidden className="absolute right-1.5 top-1.5 size-2.5 rounded-full border-2 border-bg bg-accent" />}
    </motion.button>
  );
});
