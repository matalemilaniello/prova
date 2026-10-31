import { motion, useReducedMotion } from 'motion/react';
import { cn } from './cn';
import { toneColor, type AnyTone } from './tones';

export interface ProgressBarProps {
  /** 0-1 */
  value: number;
  tone?: AnyTone;
  size?: 'xs' | 'sm' | 'md';
  /** Etichetta accessibile, es. "Fibre: 22 su 30 g". */
  label?: string;
  /** Segnaposto di un obiettivo intermedio (0-1), disegnato come tacca. */
  marker?: number;
  /** Suddivide la barra in N segmenti (es. bicchieri d'acqua). */
  segments?: number;
  className?: string;
}

const H = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' };

/** Barra di avanzamento animata. */
export function ProgressBar({ value, tone = 'accent', size = 'sm', label, marker, segments, className }: ProgressBarProps) {
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const color = toneColor(tone);

  if (segments && segments > 1) {
    const filled = v * segments;
    return (
      <div
        className={cn('flex w-full gap-1', className)}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
      >
        {Array.from({ length: segments }, (_, i) => {
          const part = Math.max(0, Math.min(1, filled - i));
          return (
            <span key={i} className={cn('relative flex-1 overflow-hidden rounded-full bg-ink-soft', H[size])}>
              <motion.span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: color }}
                initial={false}
                animate={{ width: `${part * 100}%` }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30, delay: i * 0.02 }}
              />
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-full bg-ink-soft', H[size], className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, transparent), ${color})` }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${v * 100}%` }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 26 }}
      />
      {marker !== undefined && marker > 0 && marker < 1 && (
        <span aria-hidden className="absolute inset-y-0 w-0.5 bg-ink-3" style={{ left: `${marker * 100}%` }} />
      )}
    </div>
  );
}
