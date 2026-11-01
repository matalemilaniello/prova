import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { haptic as vibrate, type HapticKind } from '../lib/haptics';
import { cn } from './cn';
import { renderIcon, type IconLike } from './icon';
import { PRESS_SCALE, springSnappy } from './motion';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icona a sinistra (componente lucide o elemento). */
  icon?: IconLike;
  /** Icona a destra. */
  iconRight?: IconLike;
  /** Mostra lo spinner e disattiva il tasto. */
  loading?: boolean;
  fullWidth?: boolean;
  /** Vibrazione al tocco (default 'light'; false per nessuna). */
  haptic?: HapticKind | false;
  children?: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_6px_18px_-8px_var(--accent-glow)] disabled:bg-control disabled:text-ink-3 disabled:shadow-none',
  secondary: 'bg-control text-ink border border-control-line disabled:text-ink-3',
  ghost: 'bg-transparent text-accent-ink hover:bg-ink-soft disabled:text-ink-3',
  danger: 'bg-bad-soft text-bad border border-[color-mix(in_srgb,var(--bad)_30%,transparent)] disabled:opacity-50',
};

const SIZE: Record<ButtonSize, { cls: string; icon: number }> = {
  // Il piccolo è alto 36 px ma tocca su 44 (hit-44: pseudo-elemento invisibile, l'aspetto non cambia).
  sm: { cls: 'h-9 px-3.5 text-[0.875rem] gap-1.5 rounded-[12px] hit-44', icon: 16 },
  md: { cls: 'h-11 px-4.5 text-[0.9375rem] gap-2 rounded-control', icon: 18 },
  lg: { cls: 'h-[52px] px-6 text-[1.0625rem] gap-2.5 rounded-[16px]', icon: 20 },
};

/** Pulsante del design system. Pressione con scala 0.97, focus visibile, stato di caricamento. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    fullWidth = false,
    haptic = 'light',
    disabled,
    className,
    children,
    type = 'button',
    onClick,
    ...rest
  },
  ref,
) {
  const s = SIZE[size];
  const off = disabled || loading;
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={off}
      aria-busy={loading || undefined}
      whileTap={off ? undefined : { scale: PRESS_SCALE }}
      transition={springSnappy}
      onClick={(e) => {
        if (haptic) vibrate(haptic);
        onClick?.(e);
      }}
      className={cn(
        'relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold tracking-[-0.005em] transition-colors duration-150',
        s.cls,
        VARIANT[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      <span className={cn('inline-flex items-center justify-center', s.cls.match(/gap-\S+/)?.[0], loading && 'opacity-0')}>
        {renderIcon(icon, s.icon, 2.2)}
        {children !== undefined && children !== null && <span>{children}</span>}
        {renderIcon(iconRight, s.icon, 2.2)}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={s.icon} label="Attendi" />
        </span>
      )}
    </motion.button>
  );
});
