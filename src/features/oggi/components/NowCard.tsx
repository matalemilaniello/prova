import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BedDouble, Check, ChefHat, ClipboardList, Ellipsis, Flag, ListChecks, MoonStar, Play, ShoppingBasket, Timer } from 'lucide-react';
import type { DayType, HHMM, MealSlot, Nutrients } from '../../../domain/types';
import { gymDuration, type AdherenceSummary, type DayItem, type NowPick, type StreakInfo } from '../../../engine/timeline';
import { useApp } from '../../../state/store';
import { fmtPercent, plural } from '../../../lib/format';
import { Button, Card, IconButton, NumberTicker, cn, spring, toneColor, toneInk, toneRing, toneSoft } from '../../../ui';
import { BOARD_LABEL, itemIcon, itemTone } from '../kinds';
import { nowContent, stateLabel } from '../nowContent';

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
  /** Dal coprifuoco meno 15 minuti la voce del telefono apre il rito della sera. */
  ritual: boolean;
  /** Valori dei pasti del giorno per slot (`dayNutritionDetail(...).bySlot`): gli stessi di Settimana. */
  mealValues: Partial<Record<MealSlot, Nutrients>>;
  /** Voce "A letto" ancora da segnare, per la riga secondaria della giornata chiusa. */
  bedItem?: DayItem;
  bedLocked: HHMM | null;
  /** La giornata si è appena chiusa in questa sessione: la serie scorre. */
  justCompleted: boolean;
  onMark: (item: DayItem) => void;
  onOpen: (item: DayItem) => void;
  onOptions: (item: DayItem) => void;
  onRitual: () => void;
}

/** Card "Adesso": la prossima voce da fare, grande, con l'azione principale a portata di pollice. */
export function NowCard(props: NowCardProps) {
  const { pick, dayType, curfewIn, bed, lockedUntil, ritual, mealValues, onMark, onOpen, onOptions, onRitual } = props;
  const physio = useApp((s) => s.physio);
  const workoutLogs = useApp((s) => s.workoutLogs);
  if (!pick) return <DoneCard {...props} />;
  const { item } = pick;
  const gym = item.kind === 'palestra' && item.ref ? gymDuration(item.ref, { physio, workoutLogs }) : null;
  const tone = itemTone(item, dayType);
  const Icon = itemIcon(item);
  const label = stateLabel(pick);
  const c = nowContent(item, { mealValues, curfewIn, bed, timeShown: Boolean(label.time), gym });
  const late = pick.state === 'in-ritardo';
  const allDay = item.kind === 'minima' && item.id !== 'minima:telefono' && pick.state === 'adesso';
  const ink = tone === 'neutral' ? 'var(--ink-2)' : toneInk(tone);

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
    primary = (
      <Button size="lg" variant="secondary" icon={MoonStar} className="min-w-0 flex-1 px-4" disabled>
        {`Si segna dalle ${lockedUntil}`}
      </Button>
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
    if (item.kind === 'pasto' && item.ref) {
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
          <div className="flex items-center justify-between gap-3">
            <h2 id="oggi-adesso" className={cn(BOARD_LABEL, 'flex items-center gap-2')} style={{ color: late ? 'var(--warn-ink)' : ink }}>
              {pick.state === 'adesso' && (
                <span aria-hidden className="relative flex size-2">
                  <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: toneColor(tone) }} />
                  <span className="relative size-2 rounded-full" style={{ background: toneColor(tone) }} />
                </span>
              )}
              <span>
                {label.label}
                {label.time && (
                  <>
                    {' · '}
                    <span className="normal-case tracking-[0.03em]">{label.time}</span>
                  </>
                )}
              </span>
            </h2>
            <div className="-mr-1 flex shrink-0 items-center gap-2">
              <span className="t-mono rounded-full bg-card-2 px-2.5 py-1 text-[0.8125rem] font-medium text-ink shadow-[inset_0_0_0_1px_var(--line)]">
                {late ? `era alle ${item.time}` : allDay ? 'in giornata' : item.time}
              </span>
              <IconButton icon={Ellipsis} label={`Altre opzioni: ${item.title}`} size="sm" variant="tinted" onClick={() => onOptions(item)} />
            </div>
          </div>

          <div className="mt-3.5 flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-[10px]"
              style={{ background: toneSoft(tone, 16), color: ink, boxShadow: tone === 'neutral' ? 'inset 0 0 0 1px var(--line-strong)' : toneRing(tone, 55) }}
            >
              <Icon size={17} strokeWidth={2.3} />
            </span>
            <p className="t-callout min-w-0 truncate font-semibold text-ink-2">{c.kicker}</p>
          </div>
          <p className="t-title mt-2 text-[1.875rem] leading-[1.04] text-ink [text-wrap:balance]">{c.headline}</p>
          {c.sub && <p className="t-footnote mt-2 line-clamp-2 text-ink-2">{c.sub}</p>}
          {c.meta.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Dettagli">
              {c.meta.map((m) => (
                <li key={m} className="t-mono inline-flex h-7 items-center rounded-full px-2.5 text-[0.75rem] font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
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

/** Giornata chiusa: tutte le voci che contano sono segnate. La serie scorre, "A letto" resta a portata. */
function DoneCard({ summary, successful, streak, curfew, bed, curfewIn, bedItem, bedLocked, justCompleted, onMark }: NowCardProps) {
  const reduce = useReducedMotion();
  const empty = summary.total === 0;
  const target = streak.days;
  const [shown, setShown] = useState(() => (justCompleted && streak.includesToday ? Math.max(0, target - 1) : target));
  useEffect(() => {
    if (shown === target) return;
    const id = window.setTimeout(() => setShown(target), reduce ? 0 : 520);
    return () => window.clearTimeout(id);
  }, [target, shown, reduce]);

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
        <h2 id="oggi-adesso" className={cn(BOARD_LABEL, successful ? 'text-good-ink' : 'text-ink-2')}>
          {empty ? 'Giornata libera' : successful ? 'Giornata completa' : 'Giornata chiusa'}
        </h2>
        <div className="mt-4 flex items-center gap-4">
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
            <p className="t-title text-ink">{empty ? 'Niente in programma' : 'Tutto segnato'}</p>
            {!empty &&
              (successful ? (
                <p className="t-callout mt-0.5 flex items-baseline gap-1.5 text-ink-2">
                  Serie di
                  <NumberTicker value={shown} className="t-num text-[1.375rem] leading-none text-accent-ink" />
                  {plural(target, 'giorno', 'giorni', false)}
                </p>
              ) : (
                <p className="t-callout mt-0.5 text-ink-2">Giornata al {fmtPercent(summary.score)}, sotto il 70%. Domani si riparte.</p>
              ))}
          </div>
        </div>

        {bedItem ? (
          <button
            type="button"
            onClick={() => onMark(bedItem)}
            className="t-callout mt-5 flex min-h-12 w-full items-center gap-3 rounded-control bg-card-2 px-4 text-left shadow-[inset_0_0_0_1px_var(--line)] transition-transform duration-150 active:scale-[0.98]"
            aria-label={bedLocked ? `A letto alle ${bed}. Si segna dalle ${bedLocked}` : `A letto alle ${bed}: segna fatto`}
          >
            <BedDouble size={18} strokeWidth={2.2} aria-hidden className="shrink-0 text-riposo-ink" />
            <span className="min-w-0 flex-1 font-medium text-ink">
              A letto alle <span className="t-mono">{bed}</span>
            </span>
            <span className="t-footnote shrink-0 font-semibold text-accent-ink">{bedLocked ? `Dalle ${bedLocked}` : 'Segna'}</span>
          </button>
        ) : (
          <p className="t-callout mt-4 text-ink-2">
            {curfewIn > 0 ? `Telefono fuori alle ${curfew}, a letto alle ${bed}.` : `Buonanotte. Domani si riparte.`}
          </p>
        )}
      </motion.div>
    </Card>
  );
}
