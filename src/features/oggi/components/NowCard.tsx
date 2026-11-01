import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BedDouble, CalendarDays, Check, ChefHat, ClipboardList, Ellipsis, Flag, ListChecks, MoonStar, Play, ShoppingBasket, Store, Timer } from 'lucide-react';
import type { DayType, HHMM, MealSlot, Nutrients } from '../../../domain/types';
import { gymDuration, type AdherenceSummary, type DayItem, type NowPick, type StreakInfo } from '../../../engine/timeline';
import { useApp } from '../../../state/store';
import { Button, Card, IconButton, cn, spring, toneColor, toneInk } from '../../../ui';
import { BOARD_LABEL, itemIcon, itemTone } from '../kinds';
import { eyebrowKicker, nowContent, stateLabel } from '../nowContent';

export interface NowCardProps {
  pick: NowPick | null;
  dayType: DayType;
  summary: AdherenceSummary;
  successful: boolean;
  streak: StreakInfo;
  curfew: HHMM;
  bed: HHMM;
  /** Minuti al coprifuoco (negativo se passato). */
  curfewIn: number;
  /** La voce non si può ancora segnare: da che ora sì (coprifuoco onesto). */
  lockedUntil: HHMM | null;
  /**
   * Con la voce non ancora segnabile l'azione principale guarda avanti: la lista della spesa (oggi o domani) oppure
   * la giornata di domani. L'orario da cui si segna resta come testo, mai un pulsante spento.
   */
  lockedAction?: { kind: 'spesa' | 'domani'; onPress: () => void } | null;
  /** Dal coprifuoco meno 15 minuti la voce del telefono apre il rito della sera. */
  ritual: boolean;
  /** Valori dei pasti del giorno per slot (`dayNutritionDetail(...).bySlot`): gli stessi di Settimana. */
  mealValues: Partial<Record<MealSlot, Nutrients>>;
  /** Voce "A letto" ancora da segnare, per la riga secondaria della giornata chiusa. */
  bedItem?: DayItem;
  bedLocked: HHMM | null;
  /** La giornata si è appena chiusa in questa sessione: la serie scorre. */
  justCompleted: boolean;
  /** Prima spesa dei giorni di avvio (per i pasti che vengono prima): orario e se è domani. */
  shopping?: { time: HHMM; tomorrow: boolean } | null;
  onMark: (item: DayItem) => void;
  /** Piano B al bar per il pasto (sempre offerto prima della spesa di avvio). */
  onPlanB?: (slot?: MealSlot) => void;
  onOpen: (item: DayItem) => void;
  onOptions: (item: DayItem) => void;
  onRitual: () => void;
}

/** Card "Adesso": la prossima voce da fare, grande, con l'azione principale a portata di pollice. */
export function NowCard(props: NowCardProps) {
  const { pick, dayType, curfewIn, bed, lockedUntil, lockedAction, ritual, mealValues, shopping, onMark, onOpen, onOptions, onRitual, onPlanB } = props;
  const physio = useApp((s) => s.physio);
  const workoutLogs = useApp((s) => s.workoutLogs);
  if (!pick) return <DoneCard {...props} />;
  const { item } = pick;
  const gym = item.kind === 'palestra' && item.ref ? gymDuration(item.ref, { physio, workoutLogs }) : null;
  const tone = itemTone(item, dayType);
  const Icon = itemIcon(item);
  const label = stateLabel(pick);
  const c = nowContent(item, { mealValues, curfewIn, bed, timeShown: Boolean(label.time), gym, shopping });
  const late = pick.state === 'in-ritardo';
  const allDay = item.kind === 'minima' && item.id !== 'minima:telefono' && pick.state === 'adesso';
  const ink = tone === 'neutral' ? 'var(--ink-2)' : toneInk(tone);
  const kicker = eyebrowKicker(c.kicker, c.headline);
  // L'orario apre la riga dei dettagli (le voci della giornata minima non ne hanno: si fanno in giornata).
  const showTime = !allDay;

  let primary: ReactNode;
  let secondary: ReactNode = null;
  const markBtn = (variant: 'primary' | 'secondary') => (
    <Button
      size="lg"
      variant={variant}
      icon={Check}
      className={variant === 'primary' ? 'min-w-0 flex-1 px-4' : 'px-5'}
      haptic={variant === 'primary' ? 'success' : undefined}
      onClick={() => onMark(item)}
      aria-label={variant === 'secondary' ? `Segna fatto: ${item.title}` : undefined}
    >
      Fatto
    </Button>
  );

  if (lockedUntil && !ritual) {
    const spesa = lockedAction?.kind === 'spesa';
    primary = lockedAction ? (
      <Button size="lg" icon={spesa ? ShoppingBasket : CalendarDays} className="min-w-0 flex-1 px-4" onClick={lockedAction.onPress} aria-haspopup="dialog">
        {spesa ? 'Lista della spesa' : 'Vedi domani'}
      </Button>
    ) : null;
    secondary = (
      <p className={cn('t-footnote leading-snug text-ink-3', lockedAction ? 'shrink-0 text-right' : 'flex-1')}>
        Si segna{lockedAction ? <br /> : ' '}dalle <span className="font-semibold tabular text-ink-2">{lockedUntil}</span>
      </p>
    );
  } else if (ritual) {
    primary = (
      <Button size="lg" icon={MoonStar} className="min-w-0 flex-1 px-4" onClick={onRitual}>
        Rito della sera
      </Button>
    );
  } else if (item.kind === 'palestra') {
    primary = (
      <Button size="lg" icon={Play} className="min-w-0 flex-1 px-4" onClick={() => onOpen(item)}>
        Inizia
      </Button>
    );
    secondary = markBtn('secondary');
  } else if (item.kind === 'calcio') {
    primary = (
      <Button size="lg" icon={Timer} className="flex-1" onClick={() => onOpen(item)}>
        Minuti e RPE
      </Button>
    );
  } else if (item.kind === 'controllo') {
    primary = (
      <Button size="lg" icon={ClipboardList} className="flex-1" onClick={() => onOpen(item)}>
        Compila
      </Button>
    );
  } else if (item.kind === 'revisione') {
    primary = (
      <Button size="lg" icon={Flag} className="min-w-0 flex-1 px-4" onClick={() => onOpen(item)}>
        Apri la revisione
      </Button>
    );
  } else if (item.kind === 'spesa' || item.kind === 'preparazione') {
    primary = markBtn('primary');
    secondary = (
      <Button size="lg" variant="secondary" icon={item.kind === 'spesa' ? ShoppingBasket : ListChecks} className="px-5" onClick={() => onOpen(item)}>
        {item.kind === 'spesa' ? 'Lista' : 'Attività'}
      </Button>
    );
  } else {
    primary = markBtn('primary');
    if (item.kind === 'pasto' && item.preShopping && onPlanB) {
      secondary = (
        <Button size="lg" variant="secondary" icon={Store} className="px-5" onClick={() => onPlanB(item.slot)}>
          Piano B
        </Button>
      );
    } else if (item.kind === 'pasto' && item.ref) {
      secondary = (
        <Button size="lg" variant="secondary" icon={ChefHat} className="px-5" onClick={() => onOpen(item)}>
          Ricetta
        </Button>
      );
    } else if (item.kind === 'fisio') {
      secondary = (
        <Button size="lg" variant="secondary" className="px-5" onClick={() => onOpen(item)}>
          Esercizi
        </Button>
      );
    }
  }

  return (
    <Card variant="highlight" tone={tone} padding="none" as="section" aria-labelledby="oggi-adesso">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={item.id}
          className="relative p-5"
          initial={{ opacity: 0, y: 18, filter: 'blur(3px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -14, filter: 'blur(3px)' }}
          transition={spring}
        >
          {/* Tre livelli: occhiello (stato, quando, categoria), titolo, una riga di dettagli. Orari in Figtree tabellare, come il testo intorno. */}
          <div className="flex items-center justify-between gap-3">
            <h2 id="oggi-adesso" className={cn(BOARD_LABEL, 'flex min-w-0 flex-1 items-center')} style={{ color: late ? 'var(--warn-ink)' : ink }}>
              {pick.state === 'adesso' ? (
                <span aria-hidden className="relative mr-2 flex size-2 shrink-0">
                  <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: toneColor(tone) }} />
                  <span className="relative size-2 rounded-full" style={{ background: toneColor(tone) }} />
                </span>
              ) : (
                <Icon size={14} strokeWidth={2.4} aria-hidden className="mr-1.5 shrink-0" />
              )}
              <span className="shrink-0 whitespace-nowrap">
                {label.label}
                {label.time && (
                  <>
                    {' · '}
                    <span className="normal-case tracking-[0.03em]">{label.time}</span>
                  </>
                )}
              </span>
              {kicker && (
                <span className="min-w-0 truncate normal-case tracking-[0.03em] text-ink-2">
                  {'\u00a0· '}
                  {kicker}
                </span>
              )}
            </h2>
            <IconButton icon={Ellipsis} label={`Altre opzioni: ${item.title}`} size="sm" variant="tinted" className="-mr-1 shrink-0" onClick={() => onOptions(item)} />
          </div>

          <p className="t-title mt-2.5 text-[1.875rem] leading-[1.04] text-ink [text-wrap:balance]">{c.headline}</p>
          {c.sub && <p className="t-footnote mt-2 line-clamp-2 text-ink-2">{c.sub}</p>}
          {(showTime || c.meta.length > 0) && (
            <ul className="t-footnote mt-2.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 tabular text-ink-2" aria-label="Dettagli">
              {showTime && (
                <li className={cn('whitespace-nowrap font-semibold', late ? 'text-warn-ink' : 'text-ink')}>
                  {late && <span className="font-sans font-medium">era alle </span>}
                  <span className="tabular">{item.time}</span>
                </li>
              )}
              {c.meta.map((m, i) => (
                <li key={m} className="whitespace-nowrap font-medium">
                  {(showTime || i > 0) && (
                    <span aria-hidden className="mr-1.5 text-ink-4">
                      ·
                    </span>
                  )}
                  {m}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center gap-2.5">
            {primary}
            {secondary}
          </div>
        </motion.div>
      </AnimatePresence>
    </Card>
  );
}

/**
 * Giornata chiusa: tutte le voci che contano sono segnate. Tre livelli e niente di ripetuto: punteggio e serie li dice
 * il tabellone qui sopra (che scorre con il bagliore), la card dice com'è finita e cosa resta per la notte.
 */
function DoneCard({ summary, successful, curfew, bed, curfewIn, bedItem, bedLocked, justCompleted, onMark }: NowCardProps) {
  const reduce = useReducedMotion();
  const empty = summary.total === 0;
  // Prima del coprifuoco la riga dice la sera che resta; dopo, la buonanotte (con la serie che continua, se riuscita).
  const evening = curfewIn > 0 ? `Telefono fuori alle ${curfew}, a letto alle ${bed}.` : null;
  const line = empty
    ? (evening ?? 'Buonanotte.')
    : successful
      ? (evening ?? 'Buonanotte, la serie continua.')
      : `Sotto il 70%: domani si riparte.${evening ? ` ${evening}` : ''}`;

  return (
    <Card variant="highlight" tone={successful ? 'good' : 'neutral'} padding="none" as="section" aria-labelledby="oggi-adesso">
      {justCompleted && !reduce && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(90% 80% at 50% 0%, rgb(255 248 230 / 0.16), transparent 70%)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.35] }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
        />
      )}
      <motion.div className="relative p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <div className="flex items-center gap-4">
          <motion.span
            aria-hidden
            className={cn(
              'grid size-14 shrink-0 place-items-center rounded-full',
              successful ? 'bg-good text-[var(--on-good)] shadow-[0_0_28px_-4px_var(--good)]' : 'bg-card-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line-strong)]',
            )}
            initial={justCompleted && !reduce ? { scale: 0.6 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 16 }}
          >
            {empty ? <MoonStar size={26} strokeWidth={2.2} /> : <Check size={28} strokeWidth={3} />}
          </motion.span>
          <div className="min-w-0">
            <h2 id="oggi-adesso" className={cn(BOARD_LABEL, successful ? 'text-good-ink' : 'text-ink-2')}>
              {empty ? 'Giornata libera' : successful ? 'Giornata riuscita' : 'Giornata chiusa'}
            </h2>
            <p className="t-title mt-1 text-ink">{empty ? 'Niente in programma' : 'Tutto segnato'}</p>
            <p className="t-callout mt-0.5 text-pretty text-ink-2">{line}</p>
          </div>
        </div>

        {bedItem && (
          <button
            type="button"
            onClick={() => onMark(bedItem)}
            className="t-callout mt-5 flex min-h-12 w-full items-center gap-3 rounded-control bg-card-2 px-4 text-left shadow-[inset_0_0_0_1px_var(--line)] transition-transform duration-150 active:scale-[0.98]"
            aria-label={bedLocked ? `A letto alle ${bed}. Si segna dalle ${bedLocked}` : `A letto alle ${bed}: segna fatto`}
          >
            <BedDouble size={18} strokeWidth={2.2} aria-hidden className="shrink-0 text-riposo-ink" />
            <span className="min-w-0 flex-1 font-medium text-ink">
              A letto alle <span className="font-semibold tabular">{bed}</span>
            </span>
            <span className="t-footnote shrink-0 font-semibold text-accent-ink">{bedLocked ? `Dalle ${bedLocked}` : 'Segna'}</span>
          </button>
        )}
      </motion.div>
    </Card>
  );
}
