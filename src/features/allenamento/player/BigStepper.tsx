import { useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { haptic } from '../../../lib/haptics';
import { NumberTicker, cn, springSnappy } from '../../../ui';

export interface BigStepperProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  max?: number;
  unit?: string;
  format?: (n: number) => string;
  className?: string;
}

const decimalsOf = (step: number) => (String(step).split('.')[1] ?? '').length;

/**
 * Stepper da palestra: numero grande sopra, due tasti larghi sotto (− e +), da usare con le mani sudate.
 * Tieni premuto per ripetere (accelera). Da tastiera: frecce e Pagina su/giù sul valore.
 */
export function BigStepper({ label, value, onChange, step, min = 0, max = 999, unit, format, className }: BigStepperProps) {
  const dec = Math.max(decimalsOf(step), decimalsOf(value));
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef<number | null>(null);
  const count = useRef(0);
  const fmt = format ?? ((n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: dec }));

  const bump = (dir: 1 | -1, mult = 1) => {
    const raw = valueRef.current + dir * step * mult;
    // Dal valore attuale si va al multiplo del passo più vicino nella direzione scelta.
    const snapped = dir > 0 ? Math.floor(raw / step + 1e-9) * step : Math.ceil(raw / step - 1e-9) * step;
    const next = Math.min(max, Math.max(min, Number(snapped.toFixed(3))));
    if (next === valueRef.current) return false;
    valueRef.current = next;
    onChange(next);
    haptic('selection');
    return true;
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
        if (!bump(dir, count.current > 12 ? 4 : 1)) return stop();
        loop(count.current > 6 ? 60 : 110);
      }, delay);
    };
    loop(420);
  };
  useEffect(() => stop, []);

  const btn = (dir: 1 | -1) => {
    const off = dir < 0 ? value <= min : value >= max;
    return (
      <motion.button
        type="button"
        aria-label={`${dir < 0 ? 'Diminuisci' : 'Aumenta'} ${label.toLowerCase()}`}
        disabled={off}
        whileTap={off ? undefined : { scale: 0.92 }}
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
        className="grid h-12 flex-1 touch-none select-none place-items-center rounded-[14px] bg-ink-soft text-ink shadow-[inset_0_0_0_1px_var(--control-line)] transition-opacity disabled:opacity-30"
      >
        {dir < 0 ? <Minus size={22} strokeWidth={2.6} aria-hidden /> : <Plus size={22} strokeWidth={2.6} aria-hidden />}
      </motion.button>
    );
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span className="t-label text-center text-ink-3">{label}</span>
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={`${fmt(value)}${unit ? ` ${unit}` : ''}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') (e.preventDefault(), bump(1));
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') (e.preventDefault(), bump(-1));
          else if (e.key === 'PageUp') (e.preventDefault(), bump(1, 10));
          else if (e.key === 'PageDown') (e.preventDefault(), bump(-1, 10));
        }}
        className="flex h-12 items-baseline justify-center gap-1 rounded-[12px]"
      >
        <NumberTicker value={value} format={fmt} duration={0.22} className="t-num text-[2.875rem] leading-none text-ink" />
        {unit && <span className="t-mono text-[0.875rem] text-ink-2">{unit}</span>}
      </div>
      <div className="flex gap-2">
        {btn(-1)}
        {btn(1)}
      </div>
    </div>
  );
}
