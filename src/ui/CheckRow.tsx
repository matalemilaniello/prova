import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { springSnappy } from './motion';
import { toneColor, type AnyTone } from './tones';

export interface CheckRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Testo a destra (quantità, minuti…). */
  meta?: ReactNode;
  tone?: AnyTone;
  disabled?: boolean;
  className?: string;
}

/** Riga con spunta circolare animata (spesa, preparazione). Spuntata: testo attenuato e barrato. */
export function CheckRow({ checked, onChange, title, subtitle, meta, tone = 'good', disabled, className }: CheckRowProps) {
  const reduce = useReducedMotion();
  const color = toneColor(tone);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        haptic(checked ? 'selection' : 'light');
        onChange(!checked);
      }}
      className={cn('group flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left disabled:opacity-50', className)}
    >
      <motion.span
        aria-hidden
        className="grid size-[26px] shrink-0 place-items-center rounded-full border-2"
        animate={{
          backgroundColor: checked ? color : 'rgba(0,0,0,0)',
          borderColor: checked ? color : 'var(--line-strong)',
          scale: checked && !reduce ? [1, 1.14, 1] : 1,
        }}
        transition={{ ...springSnappy, scale: { duration: 0.28 } }}
      >
        <motion.span initial={false} animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.5 }} transition={springSnappy}>
          <Check size={15} strokeWidth={3.4} className="text-[var(--bg)]" />
        </motion.span>
      </motion.span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('t-callout font-medium transition-colors duration-200', checked ? 'text-ink-3 line-through decoration-ink-3/60' : 'text-ink')}>
          {title}
        </span>
        {subtitle && <span className={cn('t-footnote mt-0.5', checked ? 'text-ink-3' : 'text-ink-2')}>{subtitle}</span>}
      </span>
      {meta !== undefined && <span className={cn('t-mono shrink-0 text-right', checked ? 'text-ink-3' : 'text-ink-2')}>{meta}</span>}
    </button>
  );
}
