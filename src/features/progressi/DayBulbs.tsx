import { motion, useReducedMotion } from 'motion/react';
import type { Weekday } from '../../domain/types';
import { fmtNumber, WEEKDAY_INITIAL, WEEKDAY_LONG } from '../../lib/format';
import { cn } from '../../ui';
import type { CalendarDay } from './series';

const BULB_TEXT: Record<CalendarDay['kind'], string> = {
  riuscita: 'riuscita',
  parziale: 'parziale',
  vuota: 'non segnata',
  fuori: 'prima di Ritmo',
  futuro: 'deve arrivare',
};

/** Il giorno è ancora in corso: non è chiuso, quindi non si accende né si conta. */
function inProgress(d: CalendarDay): boolean {
  return d.today && d.kind !== 'fuori' && d.kind !== 'futuro';
}

/**
 * Le sette giornate come le lampadine di un tabellone: accesa = riuscita (con il suo alone), a metà =
 * parziale, spenta = non segnata, solo il contorno = prima di Ritmo o ancora da venire. Oggi, finché non è
 * chiuso, è un anello tratteggiato: non si accende anche se ha già superato il 70%, così le lampadine
 * accese coincidono con le giornate riuscite contate nei numeri.
 * `md` con la percentuale sotto (revisione), `sm` compatta (invito alla revisione).
 */
export function DayBulbs({ days, size = 'md', className }: { days: CalendarDay[]; size?: 'sm' | 'md'; className?: string }) {
  const reduce = useReducedMotion();
  const ok = days.filter((d) => d.kind === 'riuscita' && !inProgress(d)).length;
  const md = size === 'md';
  const px = md ? 28 : 20;
  return (
    <div
      className={cn(md ? 'rounded-[18px] bg-card-3 px-3 pb-3 pt-2.5 shadow-[inset_0_0_0_1px_var(--line)]' : '', className)}
      role="img"
      aria-label={`Giornate della settimana: ${days
        .map((d, i) => `${WEEKDAY_LONG[i as Weekday]} ${inProgress(d) ? `in corso${d.score > 0 ? ` al ${fmtNumber(Math.round(d.score * 100))}%` : ''}` : BULB_TEXT[d.kind]}`)
        .join(', ')}. ${ok} ${ok === 1 ? 'riuscita' : 'riuscite'}.`}
    >
      <div className={cn('grid grid-cols-7', md ? 'gap-1' : 'gap-0.5')} aria-hidden>
        {days.map((d, i) => {
          const live = inProgress(d);
          const lit = d.kind === 'riuscita' && !live;
          const half = d.kind === 'parziale' && !live;
          const open = d.kind === 'futuro' || d.kind === 'fuori';
          const pct = Math.round(d.score * 100);
          return (
            <div key={d.date} className={cn('flex flex-col items-center', md ? 'gap-1.5' : 'gap-1')}>
              <span className={cn('t-label', md ? 'text-[0.75rem]' : 'text-[0.6875rem]', live ? 'text-ink' : 'text-ink-3')}>{WEEKDAY_INITIAL[i as Weekday]}</span>
              <motion.span
                className={cn('relative grid place-items-center rounded-full', md ? 'size-7' : 'size-5')}
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26, delay: 0.15 + i * 0.06 }}
                style={{
                  background: lit ? 'var(--good)' : d.kind === 'vuota' && !live ? 'var(--ink-soft)' : 'transparent',
                  boxShadow: lit
                    ? `0 0 ${md ? 12 : 8}px 1px color-mix(in srgb, var(--good) 55%, transparent), inset 0 -2px 0 rgb(0 0 0 / 0.12)`
                    : half
                      ? `inset 0 0 0 ${md ? 2 : 1.5}px var(--good)`
                      : open
                        ? 'inset 0 0 0 1.5px var(--line-strong)'
                        : undefined,
                }}
              >
                {live && (
                  <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="absolute inset-0">
                    <circle
                      cx={px / 2}
                      cy={px / 2}
                      r={px / 2 - 1}
                      fill="none"
                      style={{ stroke: d.score >= 0.7 ? 'var(--good)' : 'var(--ink-2)', strokeWidth: 1.5, strokeDasharray: md ? '3 2.5' : '2.4 2' }}
                    />
                  </svg>
                )}
                {half && (
                  <span
                    className={cn('absolute rounded-full', md ? 'inset-[5px]' : 'inset-[4px]')}
                    style={{ background: 'linear-gradient(90deg, var(--good) 50%, transparent 50%)' }}
                  />
                )}
                {d.minimal && lit && <span className={cn('rounded-full bg-[var(--bg)]', md ? 'size-2' : 'size-1.5')} />}
              </motion.span>
              {md && (
                <span className={cn('t-mono text-[0.6875rem] tabular-nums', live ? 'text-ink-2' : 'text-ink-3')}>
                  {live ? (pct > 0 ? fmtNumber(pct) : 'oggi') : lit || half ? fmtNumber(pct) : '·'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
