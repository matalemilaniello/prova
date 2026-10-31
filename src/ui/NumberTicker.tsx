import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { fmtNumber } from '../lib/format';
import { cn } from './cn';

export interface NumberTickerProps {
  value: number;
  /** Formattazione del numero (default: italiano con `decimals` cifre). */
  format?: (n: number) => string;
  decimals?: number;
  /** Durata in secondi (default 0.6). */
  duration?: number;
  className?: string;
}

/** Numero che scorre quando cambia (cifre tabellari). Con riduzione del movimento cambia di colpo. */
export function NumberTicker({ value, format, decimals = 0, duration = 0.6, className }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  const fmt = format ?? ((n: number) => fmtNumber(n, decimals, decimals > 0));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    prev.current = value;
    if (reduce || from === value || !Number.isFinite(from) || !Number.isFinite(value)) {
      el.textContent = fmt(value);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        el.textContent = fmt(decimals > 0 ? v : Math.round(v));
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce, duration, decimals]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {fmt(value)}
    </span>
  );
}
