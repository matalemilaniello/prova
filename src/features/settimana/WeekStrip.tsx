/**
 * Striscia dei 7 giorni: giorno, data, attività (calcio, palestra, fisio) e barra col colore del tipo
 * di giorno. Un segnale per cosa: il giorno scelto ha un fondo appena più chiaro con un anello sottile del
 * suo colore, che scorre da un giorno all'altro; oggi ha la data in luce ambra con un puntino sotto;
 * i giorni passati riusciti hanno una piccola spunta.
 */
import { motion, useReducedMotion } from 'motion/react';
import { Activity, Check, Dumbbell } from 'lucide-react';
import type { DayType, ISODate, Plan } from '../../domain/types';
import { formatDayLong, fromISO, weekdayOf } from '../../engine/dates';
import { DAY_TYPE_LABEL, WEEKDAY_SHORT } from '../../lib/format';
import { cn } from '../../ui/cn';
import { DAY_TYPE_ICON } from '../../ui/DayTypeBadge';
import { renderIcon, type IconLike } from '../../ui/icon';
import { BallIcon } from '../../ui';
import { spring } from '../../ui/motion';
import { toneColor, toneInk } from '../../ui/tones';
import { haptic } from '../../lib/haptics';
import { useApp } from '../../state/store';
import { dayActivities, type ActivityKind } from './helpers';

const ACTIVITY_ICON: Record<ActivityKind, IconLike> = { calcio: BallIcon, palestra: Dumbbell, fisio: Activity };

export interface WeekStripProps {
  dates: ISODate[];
  plan: Plan;
  today: ISODate;
  selected: ISODate;
  onSelect: (d: ISODate) => void;
  /** Giornate passate riuscite (undefined = non noto). */
  success?: Record<ISODate, boolean | undefined>;
}

export function WeekStrip({ dates, plan, today, selected, onSelect, success }: WeekStripProps) {
  const reduce = useReducedMotion();
  const hasPhysio = useApp((s) => s.physio.exercises.length > 0);
  return (
    <div className="rounded-card bg-card p-2 shadow-card" role="group" aria-label="Giorni della settimana">
      <div className="grid grid-cols-7 gap-1">
        {dates.map((d) => {
          const wd = weekdayOf(d);
          const day = plan.week.find((w) => w.weekday === wd) ?? plan.week[wd];
          const dayType: DayType = day?.dayType ?? 'riposo';
          const acts = dayActivities(day, hasPhysio);
          const isSel = d === selected;
          const isToday = d === today;
          const past = d < today;
          const ok = past ? success?.[d] : undefined;
          const label = [
            formatDayLong(d),
            isToday ? 'oggi' : null,
            DAY_TYPE_LABEL[dayType].toLowerCase(),
            ...acts.map((a) => a.label.toLowerCase()),
            ok ? 'giornata riuscita' : null,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <button
              key={d}
              type="button"
              aria-pressed={isSel}
              aria-label={label}
              onClick={() => {
                if (isSel) return;
                haptic('selection');
                onSelect(d);
              }}
              className="relative flex min-h-[92px] flex-col items-center gap-1.5 rounded-[14px] px-0.5 pb-2 pt-2.5 outline-offset-2"
            >
              {isSel && (
                <motion.span
                  layoutId="settimana-strip-sel"
                  aria-hidden
                  className="absolute inset-0 -z-0 rounded-[14px]"
                  style={{ background: 'var(--card-2)', boxShadow: `inset 0 0 0 1.5px ${toneColor(dayType)}` }}
                  transition={reduce ? { duration: 0 } : spring}
                />
              )}
              <span className={cn('t-label relative flex items-center gap-0.5 leading-none', isSel ? 'text-ink-2' : 'text-ink-3')}>
                {WEEKDAY_SHORT[wd]}
                {ok && <Check aria-hidden size={10} strokeWidth={3.4} className="text-good-ink" />}
              </span>
              <span
                className={cn(
                  't-num relative grid h-8 min-w-8 place-items-center text-[1.375rem] leading-none',
                  isToday ? 'text-accent-ink' : past && !isSel ? 'text-ink-2' : 'text-ink',
                )}
              >
                {fromISO(d).getDate()}
                {isToday && <span aria-hidden className="absolute -bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-accent" style={{ boxShadow: '0 0 6px var(--accent)' }} />}
              </span>
              <span className="relative flex h-3.5 items-center justify-center gap-[3px]" aria-hidden>
                {acts.length
                  ? acts
                      .slice(0, 2)
                      .map((a) => renderIcon(ACTIVITY_ICON[a.kind], 13, 2.3, a.optional ? 'opacity-60' : undefined))
                      .map((icon, i) => (
                        <span key={i} style={{ color: isSel ? toneInk(dayType) : 'var(--ink-2)' }}>
                          {icon}
                        </span>
                      ))
                  : <span style={{ color: isSel ? toneInk(dayType) : 'var(--ink-3)' }}>{renderIcon(DAY_TYPE_ICON[dayType], 13, 2.2)}</span>}
              </span>
              <span
                aria-hidden
                className="relative mt-auto h-[3px] w-5 rounded-full transition-[width] duration-300"
                style={{ background: toneColor(dayType), width: isSel ? 24 : 18 }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
