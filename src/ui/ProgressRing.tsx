import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from './cn';
import { toneColor, type AnyTone } from './tones';

export interface ProgressRingProps {
  /** Avanzamento 0-1 (oltre 1 resta pieno). */
  value: number;
  size?: number;
  stroke?: number;
  tone?: AnyTone;
  /** Contenuto al centro (numero, icona…). */
  children?: ReactNode;
  /** Etichetta per i lettori di schermo, es. "Giornata: 6 voci su 9". */
  label?: string;
  /** Bagliore sobrio quando l'anello si chiude (default true). */
  celebrate?: boolean;
  /** Gradiente lungo l'anello (default true). */
  gradient?: boolean;
  className?: string;
}

let ringSeq = 0;

/** Anello di avanzamento animato con contenuto centrale. Si chiude con un bagliore. */
export function ProgressRing({
  value,
  size = 120,
  stroke = 10,
  tone = 'accent',
  children,
  label,
  celebrate = true,
  gradient = true,
  className,
}: ProgressRingProps) {
  const reduce = useReducedMotion();
  const [gid] = useState(() => `ring-${++ringSeq}`);
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = toneColor(tone);
  const complete = v >= 1;
  const wasComplete = useRef(complete);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    if (complete && !wasComplete.current && celebrate) setFlash((n) => n + 1);
    wasComplete.current = complete;
  }, [complete, celebrate]);

  return (
    <div
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      {complete && celebrate && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 ${size * 0.22}px ${size * 0.02}px color-mix(in srgb, ${color} 38%, transparent)` }}
        />
      )}
      {flash > 0 && !reduce && (
        <span
          key={flash}
          aria-hidden
          className="pointer-events-none absolute -inset-2 rounded-full"
          style={{
            border: `2px solid ${color}`,
            animation: 'ritmo-glow 1.1s var(--ease-out) both',
            boxShadow: `0 0 24px ${color}`,
          }}
        />
      )}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        {gradient && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              {/* Opaco: un capo più chiaro e uno pieno. Con l'opacità l'ambra sul blu diventerebbe oliva. */}
              <stop offset="0%" style={{ stopColor: `color-mix(in oklch, ${color} 78%, white)` }} />
              <stop offset="100%" style={{ stopColor: color }} />
            </linearGradient>
          </defs>
        )}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />

        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={gradient ? `url(#${gid})` : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v), opacity: v === 0 ? 0 : 1 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22, mass: 1 }}
        />
      </svg>
      <div className="relative flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
