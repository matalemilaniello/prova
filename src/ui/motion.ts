/**
 * Preset di movimento condivisi: molle brevi (stiffness ~400, damping ~32).
 * Con prefers-reduced-motion, MotionConfig reducedMotion="user" (in App) spegne trasformazioni e spostamenti.
 */
import type { Transition, Variants } from 'motion/react';

export const spring: Transition = { type: 'spring', stiffness: 400, damping: 32, mass: 0.9 };
export const springSoft: Transition = { type: 'spring', stiffness: 260, damping: 30 };
export const springSnappy: Transition = { type: 'spring', stiffness: 520, damping: 36 };
export const fade: Transition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] };

/** Scala alla pressione dei tasti. */
export const PRESS_SCALE = 0.97;

/** Ingresso leggero dall'alto verso il basso. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: spring },
};

/** Props per una voce di lista con ingresso sfalsato: <motion.li {...staggerItem(i)} />. */
export function staggerItem(i: number, step = 0.035, max = 0.3) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { ...spring, delay: Math.min(i * step, max) },
  } as const;
}
