import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { renderIcon, type IconLike } from './icon';
import { springSnappy } from './motion';
import { toneColor, toneInk, toneSoft, type AnyTone } from './tones';

export interface ChipProps {
  selected: boolean;
  onChange: (selected: boolean) => void;
  children: ReactNode;
  icon?: IconLike;
  tone?: AnyTone;
  disabled?: boolean;
  className?: string;
}

/** Scelta a pillola attivabile (aria-pressed), per selezioni multiple: zone di dolore, filtri. */
export function Chip({ selected, onChange, children, icon, tone = 'accent', disabled, className }: ChipProps) {
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      transition={springSnappy}
      onClick={() => {
        haptic('selection');
        onChange(!selected);
      }}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-semibold transition-colors duration-150 disabled:opacity-40',
        !selected && 'bg-control text-ink-2 shadow-[inset_0_0_0_1px_var(--control-line)]',
        className,
      )}
      style={selected ? { background: toneSoft(tone, 18), color: toneInk(tone), boxShadow: `inset 0 0 0 1.5px ${toneColor(tone)}` } : undefined}
    >
      {selected ? <Check size={16} strokeWidth={3} aria-hidden /> : renderIcon(icon, 16, 2.2)}
      {children}
    </motion.button>
  );
}
