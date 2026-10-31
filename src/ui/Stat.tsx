import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { fmtDelta } from '../lib/format';
import { cn } from './cn';
import { NumberTicker } from './NumberTicker';

export interface StatDelta {
  value: number;
  unit?: string;
  decimals?: number;
  /** good: verde · bad: rosso · neutral: grigio. Default: neutral. */
  tone?: 'good' | 'bad' | 'neutral';
  /** Testo dopo la variazione, es. "in 7 giorni". */
  label?: string;
}

export interface StatProps {
  label: ReactNode;
  /** Numero (animato con NumberTicker) o testo già formattato (es. "6 h 40"). */
  value: number | string | null | undefined;
  unit?: string;
  /** Formattazione del numero. */
  format?: (n: number) => string;
  decimals?: number;
  delta?: StatDelta;
  caption?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  align?: 'start' | 'center';
  /** Colore del valore (variabile CSS), es. 'var(--good)'. */
  color?: string;
  className?: string;
}

const VALUE_SIZE = { sm: 'text-[1.625rem]', md: 'text-[2.25rem]', lg: 'text-[3.25rem]' };

/** Numero protagonista con etichetta, unità e variazione colorata. */
export function Stat({ label, value, unit, format, decimals = 0, delta, caption, size = 'md', align = 'start', color, className }: StatProps) {
  const empty = value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value));
  const tone = delta?.tone ?? 'neutral';
  const DeltaIcon = !delta || Math.abs(delta.value) < 1e-9 ? ArrowRight : delta.value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', align === 'center' && 'items-center text-center', className)}>
      <span className="t-label text-ink-3">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className={cn('t-num', VALUE_SIZE[size])} style={{ color: empty ? 'var(--ink-3)' : (color ?? 'var(--ink)') }}>
          {empty ? '–' : typeof value === 'number' ? <NumberTicker value={value} format={format} decimals={decimals} /> : value}
        </span>
        {unit && !empty && <span className={cn('t-mono text-ink-2', size === 'lg' ? 'text-[0.9375rem]' : 'text-[0.75rem]')}>{unit}</span>}
      </span>
      {delta && (
        <span
          className="t-footnote inline-flex items-center gap-1 font-medium"
          style={{ color: tone === 'good' ? 'var(--good-ink)' : tone === 'bad' ? 'var(--bad-ink)' : 'var(--ink-2)' }}
        >
          <DeltaIcon size={14} strokeWidth={2.6} aria-hidden />
          <span className="tabular">{fmtDelta(delta.value, delta.unit, delta.decimals ?? 1)}</span>
          {delta.label && <span className="font-normal text-ink-3">{delta.label}</span>}
        </span>
      )}
      {caption && <span className="t-footnote text-ink-2">{caption}</span>}
    </div>
  );
}
