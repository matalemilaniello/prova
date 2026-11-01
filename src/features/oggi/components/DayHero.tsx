import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight, CircleCheck, Moon, ShieldCheck } from 'lucide-react';
import type { HHMM } from '../../../domain/types';
import type { AdherenceSummary, StreakInfo } from '../../../engine/timeline';
import { fmtMinutes, fmtPercent, plural } from '../../../lib/format';
import { BallIcon, NumberTicker, ProgressRing, cn, spring } from '../../../ui';
import type { Kickoff } from '../useOggi';
import { BOARD_LABEL } from '../kinds';

export interface DayHeroProps {
  summary: AdherenceSummary;
  streak: StreakInfo;
  nights: number;
  successful: boolean;
  complete: boolean;
  /** Telefono fuori ancora da segnare: la giornata non si festeggia prima. */
  phonePending: { time: HHMM } | null;
  overdueCount: number;
  onRecover: () => void;
  kickoff: Kickoff | null;
  /** Orario della merenda pre-calcio, per la riga sotto il conto alla rovescia. */
  preMatch?: HHMM;
  /** La giornata si è appena chiusa in questa sessione: piccolo bagliore. */
  flare?: boolean;
}

const KICKOFF_WORD: Record<Kickoff['kind'], [string, string]> = {
  partita: ['Calcio d’inizio', 'Partita'],
  calcetto: ['Calcetto', 'Calcetto'],
  allenamento: ['Allenamento', 'Allenamento'],
};

/** Righe del campo dietro il tabellone: cerchio di centrocampo e linea di metà campo. */
function Pitch() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
      <line x1="0" y1="0.5" x2="100" y2="0.5" stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="99.5" x2="100" y2="99.5" stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Tabellone della giornata: anello delle voci, serie, aderenza e notti in orario, come il segnapunti di uno
 * stadio. Nel giorno di calcio sopra c'è il conto alla rovescia al calcio d'inizio.
 */
export function DayHero({ summary, streak, nights, successful, complete, phonePending, overdueCount, onRecover, kickoff, preMatch, flare }: DayHeroProps) {
  const reduce = useReducedMotion();
  const marked = summary.done + summary.replaced;
  const ratio = summary.total ? marked / summary.total : 0;
  const celebrate = successful && !phonePending;

  let status: { text: string; tone: 'good' | 'warn' | 'neutral'; icon?: typeof CircleCheck } = {
    text: summary.minimal ? 'Riuscita con 4 voci su 4' : 'Riuscita dal 70%',
    tone: 'neutral',
  };
  if (successful && phonePending) status = { text: `Quasi: manca il telefono fuori alle ${phonePending.time}`, tone: 'warn', icon: Moon };
  else if (celebrate) status = { text: complete ? 'Giornata riuscita e chiusa' : 'Giornata riuscita', tone: 'good', icon: CircleCheck };
  else if (streak.days === 0 && streak.best > 1) status = { text: `Record ${streak.best} giorni. Si riparte oggi: anche la giornata minima conta`, tone: 'neutral' };

  return (
    <section aria-label="Tabellone della giornata" className="relative -mt-1">
      {kickoff && (
        <motion.div
          className="mb-4 flex items-center gap-3.5"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
        >
          <span
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-full text-calcio-ink"
            style={{ boxShadow: 'inset 0 0 0 1px var(--calcio), 0 0 22px -6px var(--accent-glow)' }}
          >
            <BallIcon size={26} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[1.75rem] font-semibold uppercase leading-[1.02] tracking-[0.01em] text-ink">
              {kickoff.inMin > 0 ? (
                <>
                  {KICKOFF_WORD[kickoff.kind][0]} tra <span className="tabular text-accent-ink">{fmtMinutes(kickoff.inMin)}</span>
                </>
              ) : (
                <>{KICKOFF_WORD[kickoff.kind][1]} in corso</>
              )}
            </p>
            <p className="t-footnote mt-1 text-ink-2">
              Alle <span className="t-mono text-ink">{kickoff.time}</span>
              {preMatch && kickoff.inMin > 0 ? (
                <>
                  , merenda alle <span className="t-mono text-ink">{preMatch}</span>
                </>
              ) : null}
            </p>
          </div>
        </motion.div>
      )}

      <div className="relative py-4">
        <Pitch />
        <div className="relative flex items-center gap-4">
          <ProgressRing
            value={ratio}
            size={60}
            stroke={5}
            tone={complete ? 'good' : 'accent'}
            label={`Giornata: ${marked} voci su ${summary.total}`}
            celebrate
          >
            <span className="flex items-baseline">
              <NumberTicker value={marked} className="t-num text-[1.375rem] leading-none text-ink" />
              <span className="t-num text-[0.875rem] leading-none text-ink-3">/{summary.total}</span>
            </span>
          </ProgressRing>

          <dl className="grid min-w-0 flex-1 grid-cols-3">
            <Stat label="Serie" first>
              <NumberTicker value={streak.days} className="t-num text-[1.75rem] leading-none text-ink" />
              <span className="t-caption ml-1 text-ink-3">{plural(streak.days, 'giorno', 'giorni', false)}</span>
            </Stat>
            <Stat label="Aderenza">
              <span className={cn('t-num text-[1.75rem] leading-none', successful ? 'text-good-ink' : 'text-ink')}>{fmtPercent(summary.score)}</span>
            </Stat>
            <Stat label="Notti">
              <NumberTicker value={nights} className="t-num text-[1.75rem] leading-none text-ink" />
              <span className="t-caption ml-1 text-ink-3">di fila</span>
            </Stat>
          </dl>
        </div>

        <div className="relative mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={status.text}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={spring}
              className={cn(
                't-footnote flex min-w-0 items-center gap-1.5',
                status.tone === 'good' ? 'font-semibold text-good-ink' : status.tone === 'warn' ? 'font-medium text-ink' : 'text-ink-2',
              )}
            >
              {status.icon && <status.icon size={14} strokeWidth={2.5} aria-hidden className={status.tone === 'warn' ? 'shrink-0 text-riposo-ink' : 'shrink-0'} />}
              {status.text}
            </motion.p>
          </AnimatePresence>
          {streak.jolly > 0 && (
            <span className="t-caption inline-flex h-6 items-center gap-1 rounded-full px-2.5 font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--line-strong)]">
              <ShieldCheck size={12} strokeWidth={2.6} aria-hidden className="text-accent-ink" />
              {plural(streak.jolly, 'jolly disponibile', 'jolly disponibili')}
            </span>
          )}
        </div>
        {flare && !reduce && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, var(--good), transparent)' }}
            initial={{ opacity: 0, scaleX: 0.2 }}
            animate={{ opacity: [0, 1, 0], scaleX: [0.2, 1, 1] }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
          />
        )}
      </div>

      {overdueCount > 0 && (
        <button
          type="button"
          onClick={onRecover}
          aria-haspopup="dialog"
          className="t-footnote -mx-1 mt-1 flex min-h-11 w-[calc(100%+8px)] items-center gap-2.5 rounded-control px-1 text-left font-medium text-ink-2 transition-colors duration-150 active:bg-ink-soft"
        >
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warn" />
          <span className="flex-1">{plural(overdueCount, 'voce rimasta indietro', 'voci rimaste indietro')}</span>
          <span className="font-semibold text-accent-ink">Recupera</span>
          <ChevronRight size={16} strokeWidth={2.4} className="-ml-1 text-accent-ink" aria-hidden />
        </button>
      )}
    </section>
  );
}

function Stat({ label, first, children }: { label: string; first?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', first ? 'pl-0' : 'border-l border-line pl-3')}>
      <dt className={cn(BOARD_LABEL, 'text-[0.75rem] text-ink-3')}>{label}</dt>
      <dd className="flex items-baseline whitespace-nowrap">{children}</dd>
    </div>
  );
}
