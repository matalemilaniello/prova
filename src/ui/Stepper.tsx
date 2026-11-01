import { useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { fmtNumber } from '../lib/format';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { NumberTicker } from './NumberTicker';
import { springSnappy } from './motion';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Formattazione del valore (default italiano, decimali dal passo). */
  format?: (n: number) => string;
  /** Unità mostrata accanto al valore (es. "kg", "rip."). */
  unit?: string;
  /** Etichetta sopra il valore e per i lettori di schermo. */
  label: string;
  /** Nasconde l'etichetta visibile (resta per i lettori di schermo). */
  hideLabel?: boolean;
  size?: 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

const decimalsOf = (step: number) => (String(step).split('.')[1] ?? '').length;

/**
 * Stepper − valore +. Tieni premuto per ripetere (accelera dopo qualche passo).
 * Tastiera: frecce su/giù, Pagina su/giù per passi da 10.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  format,
  unit,
  label,
  hideLabel,
  size = 'md',
  disabled,
  className,
}: StepperProps) {
  const dec = decimalsOf(step);
  const fmt = format ?? ((n: number) => fmtNumber(n, dec, dec > 0));
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef<number | null>(null);
  const count = useRef(0);

  const clampRound = (n: number) => {
    const r = Math.round(n / step) * step;
    return Math.min(max, Math.max(min, Number(r.toFixed(dec))));
  };

  const bump = (dir: 1 | -1, mult = 1) => {
    const next = clampRound(valueRef.current + dir * step * mult);
    if (next !== valueRef.current) {
      valueRef.current = next;
      onChange(next);
      haptic('selection');
      return true;
    }
    return false;
  };

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    count.current = 0;
  };

  const start = (dir: 1 | -1) => {
    stop();
    bump(dir);
    const loop = (delay: number) => {
      timer.current = window.setTimeout(() => {
        count.current += 1;
        const ok = bump(dir, count.current > 12 ? 5 : 1);
        if (!ok) return stop();
        loop(count.current > 6 ? 60 : 110);
      }, delay);
    };
    loop(420);
  };

  useEffect(() => stop, []);

  const big = size === 'lg';
  const btn = (dir: 1 | -1) => {
    const off = disabled || (dir < 0 ? value <= min : value >= max);
    return (
      <motion.button
        type="button"
        aria-label={dir < 0 ? `Diminuisci ${label}` : `Aumenta ${label}`}
        disabled={off}
        whileTap={off ? undefined : { scale: 0.9 }}
        transition={springSnappy}
        onPointerDown={(e) => {
          if (off || e.button !== 0) return;
          e.preventDefault();
          start(dir);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            bump(dir);
          }
        }}
        className={cn(
          'grid shrink-0 touch-none select-none place-items-center rounded-full bg-ink-soft text-ink transition-opacity disabled:opacity-30',
          big ? 'size-14' : 'size-11',
        )}
      >
        {dir < 0 ? <Minus size={big ? 24 : 20} strokeWidth={2.4} aria-hidden /> : <Plus size={big ? 24 : 20} strokeWidth={2.4} aria-hidden />}
      </motion.button>
    );
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {!hideLabel && <span className="t-label text-ink-3">{label}</span>}
      <div
        className="flex items-center justify-between gap-3"
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={`${fmt(value)}${unit ? ` ${unit}` : ''}`}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') (e.preventDefault(), bump(1));
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') (e.preventDefault(), bump(-1));
          else if (e.key === 'PageUp') (e.preventDefault(), bump(1, 10));
          else if (e.key === 'PageDown') (e.preventDefault(), bump(-1, 10));
        }}
      >
        {btn(-1)}
        <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
          <NumberTicker value={value} format={fmt} duration={0.25} className={cn('t-num text-ink', big ? 'text-[2.75rem]' : 'text-[2rem]')} />
          {unit && <span className={cn('t-unit text-ink-2', big ? 'text-[0.9375rem]' : 'text-[0.8125rem]')}>{unit}</span>}
        </div>
        {btn(1)}
      </div>
    </div>
  );
}
