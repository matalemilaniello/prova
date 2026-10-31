import { useId } from 'react';
import { motion } from 'motion/react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { springSnappy } from './motion';

export type ScaleScheme = 'pain' | 'energy' | 'neutral';

export interface ScaleSliderProps {
  /** Undefined = non ancora indicato (il pollice appare grigio al centro). */
  value: number | undefined;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /**
   * pain: verde → ambra → rosso (0 = nessun dolore) · energy: rosso → ambra → verde ·
   * neutral: accento.
   */
  scheme?: ScaleScheme;
  lowLabel?: string;
  highLabel?: string;
  /** Soglia da evidenziare sulla pista (es. soglia del dolore). */
  threshold?: number;
  /** Descrizione del valore per i lettori di schermo e sotto il numero (es. "lieve"). */
  describe?: (v: number) => string;
  hideLabel?: boolean;
  className?: string;
}

const GRADIENT: Record<ScaleScheme, string> = {
  pain: 'linear-gradient(90deg, var(--good), color-mix(in srgb, var(--good) 40%, var(--warn)) 30%, var(--warn) 55%, var(--bad))',
  energy: 'linear-gradient(90deg, var(--bad), var(--warn) 45%, color-mix(in srgb, var(--warn) 40%, var(--good)) 70%, var(--good))',
  neutral: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 30%, transparent), var(--accent))',
};

/** Colore del valore sulla scala. */
export function scaleColor(v: number, min: number, max: number, scheme: ScaleScheme): string {
  const t = (v - min) / Math.max(1, max - min);
  if (scheme === 'neutral') return 'var(--accent)';
  const x = scheme === 'pain' ? t : 1 - t;
  if (x <= 0.25) return 'var(--good)';
  if (x <= 0.6) return 'var(--warn)';
  return 'var(--bad)';
}

/** Scala 0-10 con pista a gradiente, tacche e valore grande. Usa l'input range nativo (accessibile). */
export function ScaleSlider({
  value,
  onChange,
  label,
  min = 0,
  max = 10,
  step = 1,
  scheme = 'pain',
  lowLabel,
  highLabel,
  threshold,
  describe,
  hideLabel,
  className,
}: ScaleSliderProps) {
  const id = useId();
  const set = value !== undefined;
  const v = set ? value : Math.round((min + max) / 2);
  const pct = ((v - min) / (max - min)) * 100;
  const color = set ? scaleColor(v, min, max, scheme) : 'var(--ink-3)';
  const ticks = Math.round((max - min) / step) + 1;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-end justify-between gap-3">
        {!hideLabel && (
          <label htmlFor={id} className="t-headline text-ink">
            {label}
          </label>
        )}
        <div className="flex items-baseline gap-1.5" aria-hidden>
          <motion.span
            key={set ? v : 'none'}
            initial={{ scale: 0.86, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={springSnappy}
            className="t-num text-[2rem]"
            style={{ color: set ? color : 'var(--ink-3)' }}
          >
            {set ? v : '–'}
          </motion.span>
          {set && describe && <span className="t-footnote text-ink-2">{describe(v)}</span>}
        </div>
      </div>
      <div className="relative h-11">
        <div className="absolute inset-x-[15px] top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full" aria-hidden>
          <div className="absolute inset-0 opacity-30" style={{ background: GRADIENT[scheme] }} />
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150"
            style={{ width: set ? `${pct}%` : 0, background: GRADIENT[scheme], backgroundSize: `${(100 / Math.max(pct, 1)) * 100}% 100%` }}
          />
        </div>
        <div className="pointer-events-none absolute inset-x-[15px] top-1/2 flex -translate-y-1/2 justify-between" aria-hidden>
          {Array.from({ length: ticks }, (_, i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-bg/60" />
          ))}
        </div>
        {threshold !== undefined && (
          <span
            aria-hidden
            className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-ink-2"
            style={{ left: `calc(15px + (100% - 30px) * ${(threshold - min) / (max - min)})` }}
          />
        )}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          aria-label={hideLabel ? label : undefined}
          aria-valuetext={set ? `${v}${describe ? `, ${describe(v)}` : ''}` : 'non indicato'}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n !== value) haptic('selection');
            onChange(n);
          }}
          onPointerDown={() => {
            if (!set) onChange(v);
          }}
          className="ritmo-range relative"
          style={{ ['--thumb-ring' as string]: `color-mix(in srgb, ${color} 35%, transparent)` }}
        />
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
