import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronRight, CircleCheck, Moon, ShieldCheck } from 'lucide-react';
import type { HHMM } from '../../../domain/types';
import { SUCCESS_THRESHOLD, itemsToSuccess, type AdherenceSummary, type StreakInfo } from '../../../engine/timeline';
import { fmtMinutes, fmtPercent, plural } from '../../../lib/format';
import { BallIcon, NumberTicker, ProgressRing, cn, spring, type AnyTone } from '../../../ui';
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
  /** Aderenza media dei giorni chiusi degli ultimi 7 (come in Progressi), null se non ce ne sono. */
  weekAdherence: number | null;
  /** Primo giorno d'uso: al posto di tre zeri, da che ora si conta. */
  firstDay?: { time: HHMM } | null;
}

const KICKOFF_WORD: Record<Kickoff['kind'], [string, string]> = {
  partita: ['Calcio d’inizio', 'Partita'],
  calcetto: ['Calcetto', 'Calcetto'],
  allenamento: ['Allenamento', 'Allenamento'],
};

/**
 * Valore dell'anello della giornata: il punteggio pesato (fatto 1, sostituito 0,5), lo stesso numero che
 * decide la giornata riuscita. A giornata chiusa e riuscita l'anello si chiude del tutto, con il bagliore.
 */
export function dayRingValue(summary: AdherenceSummary, successful: boolean, complete: boolean): number {
  return complete && successful ? 1 : summary.score;
}

/** Colore dell'anello: verde solo a giornata riuscita, luce dei riflettori finché si gioca, neutro se è chiusa sotto soglia. */
export function dayRingTone(successful: boolean, complete: boolean, phonePending: boolean): AnyTone {
  if (successful && !phonePending) return 'good';
  return complete && !successful ? 'neutral' : 'accent';
}

/** Tacca della soglia di riuscita (70%) appena fuori dall'anello, nello stesso verso del riempimento. */
function ThresholdTick({ size, stroke }: { size: number; stroke: number }) {
  const pad = 9;
  const box = size + pad * 2;
  const c = box / 2;
  const a = SUCCESS_THRESHOLD * 2 * Math.PI;
  const r1 = size / 2 + 2;
  const r2 = size / 2 + 7;
  const rIn = size / 2 - stroke - 1;
  const p = (r: number) => ({ x: c + r * Math.sin(a), y: c - r * Math.cos(a) });
  const [a1, a2, g1] = [p(r1), p(r2), p(rIn)];
  return (
    <svg aria-hidden width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="pointer-events-none absolute" style={{ left: -pad, top: -pad }}>
      {/* Taglio sottile nell'anello e trattino fuori, come la linea di un campo. */}
      <line x1={g1.x} y1={g1.y} x2={a1.x} y2={a1.y} stroke="var(--bg)" strokeWidth={2.5} />
      <line x1={a1.x} y1={a1.y} x2={a2.x} y2={a2.y} stroke="var(--ink-3)" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function DayRing({
  summary,
  value,
  tone,
  size,
  stroke,
  big,
}: {
  summary: AdherenceSummary;
  value: number;
  tone: AnyTone;
  size: number;
  stroke: number;
  big: boolean;
}) {
  const pct = Math.round(summary.score * 100);
  return (
    <span className="relative shrink-0">
      <ProgressRing
        value={value}
        size={size}
        stroke={stroke}
        tone={tone}
        label={`Giornata al ${pct}%: ${summary.done} voci fatte su ${summary.total}. Riuscita dal 70%`}
        celebrate
      >
        <span className="flex items-baseline">
          <NumberTicker value={pct} className={cn('t-num leading-none text-ink', big ? 'text-[2.625rem]' : 'text-[1.25rem]')} />
          <span className={cn('t-num leading-none text-ink-3', big ? 'ml-0.5 text-[1.125rem]' : 'text-[0.75rem]')}>%</span>
        </span>
        {big && (
          <span className="t-caption mt-1 tabular text-ink-3">
            {summary.done} su {summary.total} fatte
          </span>
        )}
      </ProgressRing>
      {big && <ThresholdTick size={size} stroke={stroke} />}
    </span>
  );
}

/**
 * Tabellone della giornata: l'anello della giornata (lo stesso punteggio che decide se è riuscita, tacca al
 * 70%) con serie, settimana e notti in orario, come il segnapunti di uno stadio. Nel giorno di calcio il
 * protagonista è il conto alla rovescia al calcio d'inizio e l'anello si fa piccolo.
 */
export function DayHero({
  summary,
  streak,
  nights,
  successful,
  complete,
  phonePending,
  overdueCount,
  onRecover,
  kickoff,
  preMatch,
  flare,
  weekAdherence,
  firstDay,
}: DayHeroProps) {
  const reduce = useReducedMotion();
  const marked = summary.done + summary.replaced;
  const celebrate = successful && !phonePending;
  const ringValue = dayRingValue(summary, successful, complete);
  const ringTone = dayRingTone(successful, complete, Boolean(phonePending));
  const big = !kickoff;

  // A giornata chiusa lo dice già la card qui sotto: il tabellone non ripete.
  let status: { text: string; tone: 'good' | 'warn' | 'neutral'; icon?: typeof CircleCheck } | null = complete ? null : { text: needText(summary), tone: 'neutral' };
  if (!complete && successful && phonePending) status = { text: `Manca il telefono fuori alle ${phonePending.time}`, tone: 'warn', icon: Moon };
  else if (!complete && celebrate) status = { text: 'Giornata riuscita', tone: 'good', icon: CircleCheck };
  else if (!complete && streak.days === 0 && streak.best > 1 && marked === 0) status = { text: `Record ${streak.best} giorni. Si riparte oggi`, tone: 'neutral' };

  const stats = firstDay ? (
    <div className="min-w-0 flex-1">
      <p className={cn(BOARD_LABEL, 'text-accent-ink')}>Primo giorno</p>
      <p className="t-headline mt-2 text-ink">
        Si conta dalle <span className="t-mono">{firstDay.time}</span>
      </p>
    </div>
  ) : (
    <dl className={cn('min-w-0 flex-1', big ? 'flex flex-col' : 'grid grid-cols-3')}>
      <Stat label="Serie" big={big} first>
        <NumberTicker value={streak.days} className={cn('t-num leading-none text-ink', big ? 'text-[1.625rem]' : 'text-[1.75rem]')} />
        <span className="t-caption ml-1 text-ink-3">{plural(streak.days, 'giorno', 'giorni', false)}</span>
      </Stat>
      <Stat label="Settimana" big={big} title="Aderenza dei giorni chiusi negli ultimi 7, come in Progressi">
        {weekAdherence === null ? (
          <span className={cn('t-num leading-none text-ink-3', big ? 'text-[1.625rem]' : 'text-[1.75rem]')} aria-label="Ancora nessun giorno chiuso">
            –
          </span>
        ) : (
          <span className={cn('t-num leading-none', big ? 'text-[1.625rem]' : 'text-[1.75rem]', weekAdherence >= SUCCESS_THRESHOLD - 1e-9 ? 'text-good-ink' : 'text-ink')}>
            {fmtPercent(weekAdherence)}
          </span>
        )}
      </Stat>
      <Stat label="Notti" big={big}>
        <NumberTicker value={nights} className={cn('t-num leading-none text-ink', big ? 'text-[1.625rem]' : 'text-[1.75rem]')} />
        <span className="t-caption ml-1 text-ink-3">di fila</span>
      </Stat>
    </dl>
  );

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
            <p className="font-display text-[1.75rem] font-semibold leading-[1.02] text-ink">
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

      <div className={cn('relative', big ? 'pb-1 pt-2' : 'border-y border-line py-4')}>
        <div className={cn('relative flex items-center', big ? 'gap-6' : 'gap-4')}>
          <DayRing summary={summary} value={ringValue} tone={ringTone} size={big ? 114 : 60} stroke={big ? 9 : 5} big={big} />
          {stats}
        </div>

        {(status || streak.jolly > 0) && (
          <div className={cn('relative flex flex-wrap items-center gap-x-3 gap-y-1.5', big ? 'mt-3.5' : 'mt-3.5')}>
            <AnimatePresence mode="popLayout" initial={false}>
              {status && (
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
              )}
            </AnimatePresence>
            {streak.jolly > 0 && (
              <span
                className="t-caption ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--line-strong)]"
                title="Salva la serie alla prossima giornata non riuscita"
              >
                <ShieldCheck size={12} strokeWidth={2.6} aria-hidden className="text-accent-ink" />
                <span aria-hidden>{plural(streak.jolly, 'jolly', 'jolly')}</span>
                <span className="sr-only">{`${plural(streak.jolly, 'jolly disponibile', 'jolly disponibili')}: salva la serie alla prossima giornata non riuscita`}</span>
              </span>
            )}
          </div>
        )}
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

/** Cosa manca alla giornata riuscita, detto come un conto e non come una regola. */
function needText(summary: AdherenceSummary): string {
  if (summary.total === 0) return 'Niente da segnare oggi';
  const need = itemsToSuccess(summary);
  if (need === null) return summary.minimal ? 'Giornata minima: servono tutte e quattro' : 'Oggi il 70% non si raggiunge più';
  if (need === 0) return 'Giornata riuscita';
  return need === 1 ? 'Ancora una voce e la giornata è riuscita' : `Ancora ${need} voci e la giornata è riuscita`;
}

function Stat({ label, title, first, big, children }: { label: string; title?: string; first?: boolean; big: boolean; children: ReactNode }) {
  if (big) {
    return (
      <div className={cn('flex min-w-0 items-baseline justify-between gap-3 py-[7px]', !first && 'border-t border-line')}>
        <dt className={cn(BOARD_LABEL, 'text-[0.75rem] text-ink-3')} title={title}>
          {label}
          {title && <span className="sr-only">{`: ${title}`}</span>}
        </dt>
        <dd className="flex items-baseline whitespace-nowrap">{children}</dd>
      </div>
    );
  }
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', first ? 'pl-0' : 'border-l border-line pl-3')}>
      <dt className={cn(BOARD_LABEL, 'text-[0.75rem] text-ink-3')} title={title}>
        {label}
        {title && <span className="sr-only">{`: ${title}`}</span>}
      </dt>
      <dd className="flex items-baseline whitespace-nowrap">{children}</dd>
    </div>
  );
}
