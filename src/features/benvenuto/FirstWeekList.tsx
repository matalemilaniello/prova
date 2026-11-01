/**
 * "La prima settimana" nel riepilogo del benvenuto: le prime volte che contano, raggruppate per giorno come
 * un calendario delle partite. A sinistra il giorno da tabellone, a destra orario, voce e cosa aspettarsi.
 * Icone e colori sono quelli delle voci di Oggi, così l'utente le riconosce il giorno dopo.
 */
import { motion } from 'motion/react';
import type { ISODate } from '../../domain/types';
import { dayOfMonthLabel, daysBetween, formatDayLong, formatWeekdayShort, fromISO } from '../../engine/dates';
import { Card, cn, staggerItem, toneInk, toneRing } from '../../ui';
import { itemIcon, itemTone } from '../oggi/kinds';
import type { FirstStep } from './firstWeek';

interface DayGroup {
  date: ISODate;
  steps: FirstStep[];
}

function groupByDay(steps: FirstStep[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last && last.date === s.date) last.steps.push(s);
    else out.push({ date: s.date, steps: [s] });
  }
  return out;
}

function dayLabel(date: ISODate, first: ISODate): string {
  const diff = daysBetween(first, date);
  return diff === 0 ? 'Oggi' : diff === 1 ? 'Domani' : formatWeekdayShort(date);
}

export function FirstWeekList({ steps, first }: { steps: FirstStep[]; first: ISODate }) {
  const days = groupByDay(steps);
  if (!days.length) return null;
  return (
    <Card padding="none" className="overflow-hidden">
      <ol className="flex flex-col divide-y divide-line">
        {days.map((g, i) => {
          const today = g.date === first;
          const label = dayLabel(g.date, first);
          return (
            <motion.li key={g.date} {...staggerItem(i, 0.05, 0.15)} className="flex gap-3.5 px-4 py-3.5">
              <span className="sr-only">{`${label === 'Oggi' || label === 'Domani' ? `${label}, ` : ''}${formatDayLong(g.date)}`}</span>
              <span
                aria-hidden
                className="flex w-11 shrink-0 flex-col items-center gap-0.5 self-start rounded-[12px] bg-card-2 pb-1.5 pt-1"
                style={today ? { boxShadow: toneRing('accent', 55) } : undefined}
              >
                <span className={cn('t-label text-[0.6875rem] leading-tight', today ? 'text-accent-ink' : 'text-ink-3')}>{label}</span>
                <span className="t-num text-[1.375rem] leading-none text-ink">{dayOfMonthLabel(fromISO(g.date).getDate())}</span>
              </span>
              <ul className="flex min-w-0 flex-1 flex-col gap-3">
                {g.steps.map((s) => {
                  const Icon = itemIcon(s.item);
                  return (
                    <li key={s.id} className="flex min-w-0 gap-2.5">
                      <Icon size={16} strokeWidth={2.2} aria-hidden className="mt-[3px] shrink-0" style={{ color: toneInk(itemTone(s.item, 'riposo')) }} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="t-callout font-semibold text-pretty text-ink">{s.title}</span>
                          <span className="t-mono shrink-0 text-[0.8125rem] text-ink-2">{s.time}</span>
                        </div>
                        {s.detail && <p className="t-footnote text-pretty text-ink-3">{s.detail}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.li>
          );
        })}
      </ol>
    </Card>
  );
}
