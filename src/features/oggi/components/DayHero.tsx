import { motion } from 'motion/react';
import { ChevronRight, CircleCheck, Flame } from 'lucide-react';
import type { AdherenceSummary, StreakInfo } from '../../../engine/timeline';
import { SUCCESS_THRESHOLD } from '../../../engine/timeline';
import { fmtPercent, plural } from '../../../lib/format';
import { Card, NumberTicker, ProgressBar, ProgressRing, cn, springSoft } from '../../../ui';

export interface DayHeroProps {
  summary: AdherenceSummary;
  streak: StreakInfo;
  successful: boolean;
  overdueCount: number;
  onShowOverdue: () => void;
}

/** Anello della giornata, serie di giornate riuscite e aderenza verso il 70%. */
export function DayHero({ summary, streak, successful, overdueCount, onShowOverdue }: DayHeroProps) {
  const marked = summary.done + summary.replaced;
  const ratio = summary.total ? marked / summary.total : 0;
  const complete = summary.total > 0 && marked === summary.total;
  const scorePct = Math.round(summary.score * 100);

  return (
    <Card padding="none" as="section" aria-label="Avanzamento della giornata">
      <div className="flex items-center gap-5 p-5">
        <ProgressRing
          value={ratio}
          size={118}
          stroke={11}
          tone={complete ? 'good' : 'accent'}
          label={`Giornata: ${marked} voci fatte su ${summary.total}`}
        >
          <NumberTicker value={marked} className="t-num text-[2.625rem] leading-none text-ink" />
          <span className="t-caption mt-1 text-ink-3">su {summary.total}</span>
        </ProgressRing>

        <div className="flex min-w-0 flex-1 flex-col">
          <p className="t-label text-ink-3">Serie</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <motion.span
              aria-hidden
              className="grid size-7 place-items-center rounded-full"
              style={{ background: streak.days > 0 ? 'var(--accent-soft)' : 'var(--ink-soft)' }}
              animate={streak.includesToday ? { scale: [1, 1.18, 1] } : { scale: 1 }}
              transition={springSoft}
            >
              <Flame size={16} strokeWidth={2.3} className={streak.days > 0 ? 'text-accent-ink' : 'text-ink-3'} />
            </motion.span>
            <NumberTicker value={streak.days} className="t-num text-[1.875rem] leading-none text-ink" />
            <span className="t-callout text-ink-2">{plural(streak.days, 'giorno', 'giorni', false)}</span>
          </div>

          <div className="my-3.5 h-px bg-line" />

          <div className="flex items-baseline justify-between gap-2">
            <p className="t-label text-ink-3">Aderenza</p>
            <span className={cn('t-num text-[1.25rem]', successful ? 'text-good-ink' : 'text-ink')}>{fmtPercent(summary.score)}</span>
          </div>
          <ProgressBar
            value={summary.score}
            marker={summary.minimal ? undefined : SUCCESS_THRESHOLD}
            tone={successful ? 'good' : 'accent'}
            size="sm"
            className="mt-2"
            label={`Aderenza ${scorePct}%`}
          />
          <p className={cn('t-caption mt-2 flex items-center gap-1', successful ? 'font-semibold text-good-ink' : 'text-ink-3')}>
            {successful ? (
              <>
                <CircleCheck size={13} strokeWidth={2.6} aria-hidden />
                Giornata riuscita
              </>
            ) : summary.minimal ? (
              'Riuscita con 4 voci su 4'
            ) : (
              'Riuscita dal 70%'
            )}
          </p>
        </div>
      </div>

      {overdueCount > 0 && (
        <button
          type="button"
          onClick={onShowOverdue}
          className="t-footnote flex min-h-11 w-full items-center gap-2 border-t border-line px-5 text-left font-medium text-ink-2 transition-colors duration-150 active:bg-ink-soft"
        >
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warn" />
          <span className="flex-1">{plural(overdueCount, 'voce rimasta indietro', 'voci rimaste indietro')}</span>
          <span className="font-semibold text-accent-ink">Segna</span>
          <ChevronRight size={16} strokeWidth={2.4} className="-mr-1 text-ink-3" aria-hidden />
        </button>
      )}
    </Card>
  );
}
