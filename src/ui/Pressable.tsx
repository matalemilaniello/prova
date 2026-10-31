import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { haptic, type HapticKind } from '../lib/haptics';
import { cn } from './cn';
import { PRESS_SCALE, springSnappy } from './motion';

export interface PressableProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'children'> {
  /** Tocco breve (alias di onClick). */
  onPress?: () => void;
  /** Vibrazione al tocco; false per nessuna. Default 'selection'. */
  haptic?: HapticKind | false;
  /** Scala alla pressione (default 0.97). */
  pressScale?: number;
  children?: ReactNode;
}

/** Superficie toccabile generica con feedback di pressione (scala 0.97) e vibrazione leggera. */
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  { onPress, onClick, haptic: h = 'selection', pressScale = PRESS_SCALE, className, type = 'button', disabled, children, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: pressScale }}
      transition={springSnappy}
      className={cn('select-none text-left', className)}
      onClick={(e) => {
        if (h) haptic(h);
        onClick?.(e);
        onPress?.();
      }}
      {...rest}
    >
      {children}
    </motion.button>
  );
});
