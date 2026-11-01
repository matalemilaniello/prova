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

/**
 * Le sette giornate come le lampadine di un tabellone: accesa = riuscita (con il suo alone), a metà =
 * parziale, spenta = non segnata, solo il contorno = prima di Ritmo o ancora da venire.
 * `md` con la percentuale sotto (referto), `sm` compatta (invito alla revisione).
 */
export function DayBulbs({ days, size = 'md', className }: { days: CalendarDay[]; size?: 'sm' | 'md'; className?: string }) {
  const reduce = useReducedMotion();
  const ok = days.filter((d) => d.kind === 'riuscita').length;
  const md = size === 'md';
  return (
    <div
      className={cn(md ? 'rounded-[18px] bg-card-3 px-3 pb-3 pt-2.5 shadow-[inset_0_0_0_1px_var(--line)]' : '', className)}
      role="img"
      aria-label={`Giornate della settimana: ${days.map((d, i) => `${WEEKDAY_LONG[i as Weekday]} ${d.today && d.kind !== 'riuscita' ? 'in corso' : BULB_TEXT[d.kind]}`).join(', ')}. ${ok} ${ok === 1 ? 'riuscita' : 'riuscite'}.`}
    >
      <div className={cn('grid grid-cols-7', md ? 'gap-1' : 'gap-0.5')} aria-hidden>
        {days.map((d, i) => {
          const lit = d.kind === 'riuscita';
          const half = d.kind === 'parziale';
          const open = d.kind === 'futuro' || d.kind === 'fuori';
          return (
            <div key={d.date} className={cn('flex flex-col items-center', md ? 'gap-1.5' : 'gap-1')}>
              <span className={cn('t-label text-ink-3', md ? 'text-[0.75rem]' : 'text-[0.6875rem]')}>{WEEKDAY_INITIAL[i as Weekday]}</span>
              <motion.span
                className={cn('relative grid place-items-center rounded-full', md ? 'size-7' : 'size-5')}
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26, delay: 0.15 + i * 0.06 }}
                style={{
                  background: lit ? 'var(--good)' : d.kind === 'vuota' ? 'var(--ink-soft)' : 'transparent',
                  boxShadow: lit
                    ? `0 0 ${md ? 12 : 8}px 1px color-mix(in srgb, var(--good) 55%, transparent), inset 0 -2px 0 rgb(0 0 0 / 0.12)`
                    : half
                      ? `inset 0 0 0 ${md ? 2 : 1.5}px var(--good)`
                      : open
                        ? 'inset 0 0 0 1.5px var(--line-strong)'
                        : d.today
                          ? 'inset 0 0 0 1.5px var(--ink-3)'
                          : undefined,
                }}
              >
                {half && (
                  <span
                    className={cn('absolute rounded-full', md ? 'inset-[5px]' : 'inset-[4px]')}
                    style={{ background: 'linear-gradient(90deg, var(--good) 50%, transparent 50%)' }}
                  />
                )}
                {d.minimal && lit && <span className={cn('rounded-full bg-[var(--bg)]', md ? 'size-2' : 'size-1.5')} />}
              </motion.span>
              {md && (
                <span className="t-mono text-[0.6875rem] tabular-nums text-ink-3">
                  {d.today && !lit ? 'oggi' : lit || half ? fmtNumber(Math.round(d.score * 100)) : '·'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
