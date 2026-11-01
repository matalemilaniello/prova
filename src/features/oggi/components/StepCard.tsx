/**
 * Scalino della settimana: la piccola abitudine scelta nella revisione della domenica, con i 7 giorni
 * e il conteggio verso 5. Frutta, verdura e caffè si segnano con un tocco; acqua e dolci si contano dal diario.
 */
import { motion, useReducedMotion } from 'motion/react';
import { Check, Footprints } from 'lucide-react';
import type { Weekday } from '../../../domain/types';
import type { WeeklyStepStatus } from '../../../engine/review';
import { formatWeekday } from '../../../engine/dates';
import { WEEKDAY_INITIAL } from '../../../lib/format';
import { Button, Card, cn, springSnappy, toneInk, toneRing, toneSoft } from '../../../ui';
import { BOARD_LABEL } from '../kinds';

const STATE_LABEL = {
  fatto: 'fatto',
  mancato: 'mancato',
  'in-corso': 'oggi, da fare',
  futuro: 'da venire',
  prima: 'prima dell’inizio',
} as const;

const MEASURE_NOTE = {
  acqua: 'Si conta da solo con i bicchieri d’acqua di oggi.',
  dolci: 'Si conta da solo: il giorno vale se non segni dolci oltre i previsti.',
} as const;

export function StepCard({ status, onToggle }: { status: WeeklyStepStatus; onToggle: () => void }) {
  const reduce = useReducedMotion();
  const { step, days, done, target, todayState, manual } = status;
  const reached = done >= target;
  const doneToday = todayState === 'fatto';

  return (
    <Card as="section" aria-labelledby="oggi-scalino" padding="none" tone={reached ? 'good' : undefined}>
      <div className="p-4">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-[12px]"
            style={{ background: toneSoft(reached ? 'good' : 'accent', 16), boxShadow: toneRing(reached ? 'good' : 'accent'), color: toneInk(reached ? 'good' : 'accent') }}
          >
            <Footprints size={19} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn(BOARD_LABEL, 'text-accent-ink')}>Scalino della settimana</p>
            <h3 id="oggi-scalino" className="t-headline mt-1.5 text-ink">
              {step.title}
            </h3>
            <p className="t-footnote mt-0.5 text-pretty text-ink-2">{step.how}</p>
          </div>
          <p className="shrink-0 text-right" aria-label={`${done} giorni su ${target}`}>
            <span className={cn('t-num text-[1.75rem]', reached ? 'text-good-ink' : 'text-ink')}>{done}</span>
            <span className="t-caption ml-0.5 text-ink-2">su {target}</span>
          </p>
        </div>

        <ol className="mt-3.5 grid grid-cols-7 gap-1.5" aria-label="Giorni della settimana">
          {days.map((d, i) => {
            const st = d.state;
            return (
              <li key={d.date} className="flex flex-col items-center gap-1" aria-label={`${formatWeekday(d.date)}: ${STATE_LABEL[st]}`}>
                <motion.span
                  aria-hidden
                  className={cn(
                    'grid size-7 place-items-center rounded-full',
                    st === 'fatto' && 'bg-good',
                    st === 'mancato' && 'bg-ink-soft',
                    st === 'futuro' && 'border border-line',
                    st === 'prima' && 'border border-dashed border-line',
                  )}
                  style={st === 'in-corso' ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : st === 'fatto' ? { color: 'var(--on-good)' } : undefined}
                  initial={false}
                  animate={reduce ? undefined : { scale: st === 'fatto' ? [0.85, 1] : 1 }}
                  transition={springSnappy}
                >
                  {st === 'fatto' && <Check size={14} strokeWidth={3} />}
                </motion.span>
                <span className={cn('t-caption', st === 'in-corso' ? 'font-semibold text-ink' : 'text-ink-3')}>{WEEKDAY_INITIAL[i as Weekday]}</span>
              </li>
            );
          })}
        </ol>

        {manual ? (
          <Button
            className="mt-3.5"
            fullWidth
            variant={doneToday ? 'secondary' : 'primary'}
            icon={Check}
            onClick={onToggle}
            aria-pressed={doneToday}
            disabled={todayState === 'prima'}
          >
            {doneToday ? 'Fatto oggi' : 'Segna fatto oggi'}
          </Button>
        ) : (
          <p className="t-footnote mt-3 text-ink-3">{MEASURE_NOTE[step.measure === 'acqua' ? 'acqua' : 'dolci']}</p>
        )}
      </div>
    </Card>
  );
}
