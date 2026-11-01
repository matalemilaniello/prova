import { useId } from 'react';
import { motion } from 'motion/react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { springSnappy } from './motion';

export interface RatingPickerProps {
  value: number | undefined;
  onChange: (value: number) => void;
  label: string;
  /** 5 (qualità del sonno) o 10 (voti della revisione, RPE: due righe da 5, pulsanti da 44 px). Default 5. */
  max?: 5 | 10;
  /** Primo valore (default 1). */
  min?: number;
  lowLabel?: string;
  highLabel?: string;
  /** Testo per ciascun valore (indice = valore − min), mostrato sotto la scelta. */
  labels?: string[];
  hideLabel?: boolean;
  className?: string;
}

/** Scelta di un voto con pulsanti numerati (1-5 o 1-10). Frecce per cambiare. */
export function RatingPicker({
  value,
  onChange,
  label,
  max = 5,
  min = 1,
  lowLabel,
  highLabel,
  labels,
  hideLabel,
  className,
}: RatingPickerProps) {
  const id = useId();
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  // Oltre 6 valori si va su due righe da 5: dieci pulsanti in una riga sarebbero larghi 26 px.
  const dense = values.length > 6;
  const desc = value !== undefined ? labels?.[value - min] : undefined;

  const pick = (n: number) => {
    haptic('selection');
    onChange(n);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {!hideLabel && (
        <div className="flex items-baseline justify-between gap-3">
          <span id={id} className="t-headline text-ink">
            {label}
          </span>
          {desc && <span className="t-footnote text-ink-2">{desc}</span>}
        </div>
      )}
      <div
        role="radiogroup"
        aria-labelledby={hideLabel ? undefined : id}
        aria-label={hideLabel ? label : undefined}
        className="grid grid-cols-5 gap-1.5"
        onKeyDown={(e) => {
          const cur = value ?? min - 1;
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            pick(Math.min(max, cur + 1));
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            pick(Math.max(min, cur - 1 < min ? min : cur - 1));
          }
        }}
      >
        {values.map((n) => {
          const on = value === n;
          return (
            <motion.button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={labels?.[n - min] ? `${n}, ${labels[n - min]}` : String(n)}
              tabIndex={on || (value === undefined && n === min) ? 0 : -1}
              whileTap={{ scale: 0.9 }}
              transition={springSnappy}
              onClick={() => pick(n)}
              className={cn(
                't-num relative grid place-items-center rounded-[12px] transition-colors duration-150',
                dense ? 'h-11 text-[1.25rem]' : 'h-12 text-[1.375rem]',
                on ? 'bg-accent text-on-accent shadow-[0_6px_16px_-8px_var(--accent-glow)]' : 'bg-control text-ink-2 hover:text-ink',
              )}
            >
              {n}
            </motion.button>
          );
        })}
      </div>
      {(lowLabel || highLabel) && (
        <div className="t-caption flex justify-between text-ink-3" aria-hidden>
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}
