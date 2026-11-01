import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronRight, CircleCheck, Moon, ShieldCheck } from 'lucide-react';
import type { HHMM } from '../../../domain/types';
import { SUCCESS_THRESHOLD, itemsToSuccess, type AdherenceSummary, type StreakInfo } from '../../../engine/timeline';
import { fmtMinutes, fmtNumber, fmtPercent, plural } from '../../../lib/format';
import { BallIcon, NumberTicker, ProgressRing, cn, spring, type AnyTone } from '../../../ui';
import type { Kickoff } from '../useOggi';
import type { WelcomeSpot } from '../firstDay';
import { BOARD_LABEL } from '../kinds';
import { RecoverLink } from './CatchUp';

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
  /**
   * Primo giorno d'uso, finché la giornata non è chiusa: "Il piano è pronto" con i due o tre orari che la reggono,
   * al posto dell'anello a zero, delle statistiche vuote e del conto alla rovescia.
   */
  welcome?: WelcomeSpot[] | null;
  /** Tocco su un orario del tabellone del primo giorno (la spesa apre la sua lista). */
  onWelcomeSpot?: (spot: WelcomeSpot) => void;
  /**
   * Giorno del piano dal primo avvio (1 il primo giorno), null senza primo avvio (dati di esempio). Nei primi giorni
   * serie, settimana e notti valgono zero e non dicono niente: al loro posto una riga di avvio.
   */
  planDay?: number | null;
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

/** Punti della giornata: le voci fatte valgono 1, le sostituite mezza. "7", "5,5". */
export function dayPoints(summary: AdherenceSummary): string {
  const points = summary.done + summary.replaced / 2;
  return fmtNumber(points, Number.isInteger(points) ? 0 : 1);
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
  const points = dayPoints(summary);
  // Prima della prima voce segnata niente "0%": il conto di quello che c'è da fare ("0 su 9").
  const fresh = summary.done + summary.replaced === 0;
  const label = fresh
    ? `Giornata da cominciare: 0 voci su ${summary.total}. Riuscita dal 70%`
    : `Giornata al ${pct}%: ${points} su ${summary.total}${summary.replaced ? ', le sostituite valgono metà' : ''}. Riuscita dal 70%`;
  return (
    <ProgressRing value={value} size={size} stroke={stroke} tone={tone} marker={SUCCESS_THRESHOLD} label={label} celebrate className="shrink-0">
      {fresh ? (
        <span className={cn('t-num leading-none text-ink', big ? 'text-[1.75rem]' : 'text-[1.25rem]')}>0</span>
      ) : (
        <span className="flex items-baseline">
          <NumberTicker value={pct} className={cn('t-num leading-none text-ink', big ? 'text-[1.75rem]' : 'text-[1.25rem]')} />
          <span className={cn('t-num leading-none text-ink-3', big ? 'ml-px text-[0.875rem]' : 'text-[0.75rem]')}>%</span>
        </span>
      )}
      {(big || fresh) && (
        <span className={cn('t-caption mt-0.5 leading-none tabular text-ink-3', big ? 'text-[0.6875rem]' : 'text-[0.625rem]')}>
          {fresh ? `su ${summary.total}` : `${points} su ${summary.total}`}
        </span>
      )}
    </ProgressRing>
  );
}

/**
 * Tabellone della giornata: l'anello della giornata (lo stesso punteggio che decide se è riuscita, tacca al
 * 70%) con serie, settimana e notti in orario in colonne, come il segnapunti di uno stadio. Le colonne a zero non ci
 * sono; nei primi giorni, quando non ne resta nessuna, al loro posto c'è il giorno del piano. È compatto: la
 * protagonista della schermata è la card Adesso. Nelle ultime ore prima del calcio sopra c'è il conto alla rovescia
 * al calcio d'inizio e l'anello si fa ancora più piccolo.
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
  welcome,
  onWelcomeSpot,
  planDay = null,
}: DayHeroProps) {
  const reduce = useReducedMotion();
  if (welcome?.length) return <WelcomeBoard spots={welcome} onSpot={onWelcomeSpot} overdueCount={overdueCount} onRecover={onRecover} />;
  const marked = summary.done + summary.replaced;
  const celebrate = successful && !phonePending;
  const ringValue = dayRingValue(summary, successful, complete);
  const ringTone = dayRingTone(successful, complete, Boolean(phonePending));
  const big = !kickoff;

  // Una sola forma di tabellone in tutti i giorni: anello e numeri in colonna, come il segnapunti di uno stadio.
  // Un numero a zero non dice niente (serie e notti non ancora partite): la sua colonna non c'è. La settimana a
  // zero si mostra solo dopo almeno un giorno intero con il piano, non per il pomeriggio del primo avvio.
  const num = cn('t-num leading-none', big ? 'text-[1.75rem]' : 'text-[1.625rem]');
  const fullDays = planDay === null ? Number.POSITIVE_INFINITY : planDay - 2;
  const cells: { key: string; label: string; title?: string; fr: number; node: ReactNode }[] = [];
  if (streak.days > 0) {
    cells.push({
      key: 'serie',
      label: 'Serie',
      fr: 0.85,
      node: (
        <>
          <NumberTicker value={streak.days} className={cn(num, 'text-ink')} />
          <span className="t-caption ml-1 text-ink-3">{plural(streak.days, 'giorno', 'giorni', false)}</span>
        </>
      ),
    });
  }
  if (weekAdherence !== null && (weekAdherence > 0 || fullDays >= 1)) {
    cells.push({
      key: 'settimana',
      label: 'Settimana',
      title: 'Aderenza dei giorni chiusi negli ultimi 7, come in Progressi',
      fr: 1.2,
      node: <span className={cn(num, weekAdherence >= SUCCESS_THRESHOLD - 1e-9 ? 'text-good-ink' : 'text-ink')}>{fmtPercent(weekAdherence)}</span>,
    });
  }
  if (nights > 0) {
    cells.push({
      key: 'notti',
      label: 'Notti',
      fr: 0.95,
      node: (
        <>
          <NumberTicker value={nights} className={cn(num, 'text-ink')} />
          <span className="t-caption ml-1 text-ink-3">di fila</span>
        </>
      ),
    });
  }
  // A giornata chiusa lo dice già la card qui sotto: il tabellone non ripete.
  let status: { text: string; tone: 'good' | 'warn' | 'neutral'; icon?: typeof CircleCheck } | null = complete ? null : { text: needText(summary), tone: 'neutral' };
  // Il telefono fuori lo dice già la card Adesso: qui solo il punteggio e l'ora in cui la giornata si chiude.
  if (!complete && successful && phonePending) status = { text: `Il 70% c’è, si chiude alle ${phonePending.time}`, tone: 'warn', icon: Moon };
  else if (!complete && celebrate) status = { text: 'Giornata riuscita', tone: 'good', icon: CircleCheck };
  // Senza colonne la ripartenza la dice già la riga di avvio.
  else if (!complete && cells.length && streak.days === 0 && streak.best > 1 && marked === 0) status = { text: `Record ${streak.best} giorni. Si riparte oggi`, tone: 'neutral' };

  const stats = cells.length ? (
    <dl className="grid min-w-0 flex-1" style={{ gridTemplateColumns: cells.map((c) => `minmax(0,${c.fr}fr)`).join(' ') }}>
      {cells.map((c, i) => (
        <Stat key={c.key} label={c.label} title={c.title} first={i === 0}>
          {c.node}
        </Stat>
      ))}
    </dl>
  ) : (
    // Primi giorni: niente fila di zeri. Il giorno del piano e da quando parte la serie.
    <div className="min-w-0 flex-1">
      <p className="t-headline text-ink">{planDay !== null && planDay > 0 ? `Giorno ${planDay} del piano` : 'Si comincia oggi'}</p>
      <p className="t-footnote mt-0.5 text-ink-2">{`${streak.best > 0 ? 'La serie riparte' : 'La prima serie parte'} ${complete ? 'domani' : 'oggi'}`}</p>
    </div>
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
              Alle <span className="font-semibold tabular text-ink">{kickoff.time}</span>
              {preMatch && kickoff.inMin > 0 ? (
                <>
                  , merenda alle <span className="font-semibold tabular text-ink">{preMatch}</span>
                </>
              ) : null}
            </p>
          </div>
        </motion.div>
      )}

      <div className={cn('relative', big ? 'pt-1' : 'border-y border-line py-4')}>
        <div className="relative flex items-center gap-4">
          <DayRing summary={summary} value={ringValue} tone={ringTone} size={big ? 80 : 60} stroke={big ? 7 : 5} big={big} />
          {stats}
        </div>

        {(status || streak.jolly > 0) && (
          <div className="relative mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
                className={cn(
                  't-caption inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--line-strong)]',
                  // Da solo (giornata chiusa) sta sotto l'anello, non appeso a destra di una riga vuota.
                  status && 'ml-auto',
                )}
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

      <RecoverRow count={overdueCount} onRecover={onRecover} />
    </section>
  );
}

function RecoverRow({ count, onRecover }: { count: number; onRecover: () => void }) {
  if (count <= 0) return null;
  return <RecoverLink className="mt-1" text={plural(count, 'voce rimasta indietro', 'voci rimaste indietro')} action="Recupera" onPress={onRecover} />;
}

/**
 * Il primo giorno: il piano già deciso, detto in due o tre orari come il tabellone di uno stadio ("Stasera 23:45,
 * telefono fuori · Domani 15:15, spesa di avvio · 21:00, partita"). Niente anello a zero: la giornata è appena
 * cominciata. La spesa da fare apre la sua lista.
 */
function WelcomeBoard({
  spots,
  onSpot,
  overdueCount,
  onRecover,
}: {
  spots: WelcomeSpot[];
  onSpot?: (spot: WelcomeSpot) => void;
  overdueCount: number;
  onRecover: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="oggi-pronto" className="relative -mt-1">
      <motion.h2
        id="oggi-pronto"
        className="font-display text-[1.75rem] font-semibold leading-[1.02] text-ink"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        Il piano è pronto
      </motion.h2>
      {/* Colonne larghe quanto il loro contenuto: "Spesa di avvio" non va a capo per fare posto a "Partita". */}
      <ol className="mt-4 flex border-y border-line py-3.5">
        {spots.map((spot, i) => {
          const done = spot.status === 'fatto' || spot.status === 'sostituito';
          const opens = spot.kind === 'spesa' && !spot.status && Boolean(onSpot);
          const body = (
            <>
              <span className={cn(BOARD_LABEL, 'block h-3 text-[0.75rem] text-ink-3')}>
                {spot.group ?? '\u00a0'}
              </span>
              <span className={cn('t-num mt-2 flex items-center gap-1 text-[1.75rem] leading-none', done ? 'text-good-ink' : 'text-ink')}>
                {done && <Check size={18} strokeWidth={3} aria-hidden />}
                {spot.time}
              </span>
              <span className={cn('t-footnote mt-1.5 line-clamp-2 block font-medium', opens ? 'text-accent-ink' : 'text-ink-2')}>
                {spot.name}
                {opens && <ChevronRight size={15} strokeWidth={2.5} aria-hidden className="-mt-px ml-0.5 inline align-middle" />}
              </span>
            </>
          );
          const label = `${spot.tomorrow ? 'Domani' : spot.group === 'Stasera' ? 'Stasera' : 'Oggi'} alle ${spot.time}: ${spot.name}${done ? ', fatto' : ''}`;
          return (
            <motion.li
              key={spot.id}
              className={cn('min-w-0 flex-[1_1_auto]', i > 0 && 'border-l border-line pl-3', i < spots.length - 1 && 'pr-3')}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: reduce ? 0 : 0.08 + i * 0.07 }}
            >
              {opens ? (
                <button
                  type="button"
                  onClick={() => onSpot?.(spot)}
                  aria-label={`${label}. Apri la lista della spesa`}
                  className="-m-1 block w-[calc(100%+8px)] rounded-control p-1 text-left transition-colors duration-150 active:bg-ink-soft"
                >
                  {body}
                </button>
              ) : (
                <>
                  <span className="sr-only">{label}</span>
                  <div aria-hidden>{body}</div>
                </>
              )}
            </motion.li>
          );
        })}
      </ol>
      <RecoverRow count={overdueCount} onRecover={onRecover} />
    </section>
  );
}

/** Cosa manca alla giornata riuscita, detto come un conto e non come una regola. */
function needText(summary: AdherenceSummary): string {
  if (summary.total === 0) return 'Niente da segnare oggi';
  const need = itemsToSuccess(summary);
  if (need === null) return summary.minimal ? 'Giornata minima: servono tutte e quattro' : 'Il 70% è sfumato, la settimana no';
  if (need === 0) return 'Giornata riuscita';
  return need === 1 ? 'Ancora una voce e la giornata è riuscita' : `Ancora ${need} voci e la giornata è riuscita`;
}

function Stat({ label, title, first, children }: { label: string; title?: string; first?: boolean; children: ReactNode }) {
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
