import { motion, useReducedMotion } from 'motion/react';
import { LOAD_ALERT_RATIO, LOAD_MIN_HISTORY_WEEKS, type LoadStatus } from '../../../engine/training';
import { fmtNumber } from '../../../lib/format';
import { NumberTicker, cn } from '../../../ui';

export interface LoadMeterProps {
  status: LoadStatus;
  /** Carico stimato di quello che resta in programma. */
  planned: number;
  className?: string;
}

/**
 * Carico della settimana: numero grande, barra con fatto (pieno) e in programma (tratteggio),
 * tacca della soglia al 120% della media delle 4 settimane precedenti.
 */
export function LoadMeter({ status, planned, className }: LoadMeterProps) {
  const reduce = useReducedMotion();
  const { load, average, threshold } = status;
  const projected = load + planned;
  const max = Math.max(threshold ?? 0, projected, average ?? 0, 1) * 1.14;
  const over = status.alert;
  const projOver = !over && threshold !== null && projected > threshold;
  const color = over ? 'var(--warn)' : 'var(--accent)';
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const ratio = average && average > 0 ? Math.round((load / average) * 100) : null;
  const missingWeeks = Math.max(0, LOAD_MIN_HISTORY_WEEKS - status.previous.length);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <NumberTicker value={load} className={cn('t-num text-[2.5rem]', over ? 'text-warn-ink' : 'text-ink')} />
            <span className="t-mono text-[0.8125rem] text-ink-2">UA</span>
          </div>
          <p className="t-footnote mt-0.5 text-ink-2">
            {ratio !== null ? `${fmtNumber(ratio)}% della media` : load > 0 ? 'minuti × RPE' : 'Ancora nessuna attività'}
          </p>
        </div>
        <div className="text-right">
          <p className="t-label text-ink-3">Media 4 settimane</p>
          <p className="t-callout mt-1 font-semibold text-ink tabular">{average !== null ? `${fmtNumber(Math.round(average))} UA` : '–'}</p>
        </div>
      </div>

      <div className="relative pt-1">
        <div
          className="relative h-3 w-full overflow-hidden rounded-full"
          style={{ background: 'var(--ink-soft)' }}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={Math.round(max)}
          aria-valuenow={load}
          aria-label={`Carico della settimana ${fmtNumber(load)} UA${threshold ? `, soglia ${fmtNumber(Math.round(threshold))}` : ''}`}
        >
          {planned > 0 && (
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full"
              initial={reduce ? false : { width: 0 }}
              animate={{ width: pct(projected) }}
              transition={{ type: 'spring', stiffness: 140, damping: 24, delay: 0.1 }}
              style={{
                background: `repeating-linear-gradient(-45deg, color-mix(in srgb, ${projOver ? 'var(--warn)' : color} 42%, transparent) 0 4px, color-mix(in srgb, ${projOver ? 'var(--warn)' : color} 16%, transparent) 4px 8px)`,
              }}
            />
          )}
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full"
            initial={reduce ? false : { width: 0 }}
            animate={{ width: pct(load) }}
            transition={{ type: 'spring', stiffness: 140, damping: 24 }}
            style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, transparent), ${color})`, boxShadow: `0 0 12px -2px ${color}` }}
          />
        </div>
        {threshold !== null && (
          <span
            aria-hidden
            className="absolute -bottom-1 top-0 w-[2px] -translate-x-1/2 rounded-full bg-ink"
            style={{ left: pct(threshold), boxShadow: '0 0 0 2px var(--card)' }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {load > 0 && <Legend swatch={<span className="block size-2.5 rounded-full" style={{ background: color }} />}>Fatto {fmtNumber(load)}</Legend>}
        {planned > 0 && (
          <Legend
            swatch={
              <span
                className="block size-2.5 rounded-full"
                style={{ background: `repeating-linear-gradient(-45deg, color-mix(in srgb, ${color} 60%, transparent) 0 2px, transparent 2px 4px)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 50%, transparent)` }}
              />
            }
          >
            In programma {fmtNumber(planned)}
          </Legend>
        )}
        {threshold !== null ? (
          <Legend swatch={<span className="block h-3 w-[2px] rounded-full bg-ink" />}>
            Soglia {fmtNumber(Math.round(threshold))} ({fmtNumber(Math.round(LOAD_ALERT_RATIO * 100))}%)
          </Legend>
        ) : (
          <span className="t-footnote text-ink-3">
            {missingWeeks === 1 ? 'Serve ancora una settimana di storico per la soglia.' : `Servono ancora ${missingWeeks} settimane di storico per la soglia.`}
          </span>
        )}
      </div>
    </div>
  );
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="t-footnote inline-flex items-center gap-1.5 text-ink-2 tabular">
      {swatch}
      {children}
    </span>
  );
}
