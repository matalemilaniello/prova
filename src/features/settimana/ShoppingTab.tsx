/**
 * Scheda Spesa: lista aggregata per reparto dal menù della settimana, con spunte salvate,
 * avanzamento, prodotti da dispensa separati e "Copia lista" (appunti, con ripiego a selezione).
 * Ogni reparto si chiude e mostra solo quello che resta da prendere: i prodotti spuntati scendono nel gruppo
 * "Nel carrello", chiuso di base. Carne e pesce freschi che servono oltre il giorno dopo la spesa (di sabato, o la
 * spesa di avvio nel giorno in cui cade) hanno un fiocco sulla riga e una sola nota in fondo al reparto con cosa
 * congelare appena a casa.
 * Nella prima settimana di chi inizia a metà settimana la lista parte dal giorno di inizio.
 * Nei giorni di avvio (niente preparazione della domenica) è la spesa di avvio: lo dicono l'etichetta e la riga sotto
 * il titolo, senza un riquadro in più. I giorni compresi stanno nella stessa riga.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Apple,
  Bean,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Copy,
  Droplet,
  Fish,
  Milk,
  Package,
  RotateCcw,
  ShoppingBasket,
  ShoppingCart,
  Snowflake,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import type { ISODate, ShopCategory } from '../../domain/types';
import { addDays, formatDayTitle, formatWeekRange, weekdayOf } from '../../engine/dates';
import type { NutritionState } from '../../engine/nutrition';
import { shoppingList, shoppingProgress, shoppingText, type ShoppingItem, type ShoppingLead } from '../../engine/shopping';
import { WEEKDAY_LONG, listIt, plural } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { Button, Callout, Card, CheckRow, Disclosure, EmptyState, ProgressRing, Sheet } from '../../ui';
import { copyText } from './clipboard';
import { dateSpanText, daysText, lowerFirst, shoppingDateFor } from './helpers';

/** Icona del reparto. Niente colori dei tipi di giorno: i reparti sono neutri, come le corsie. */
const CATEGORY_ICON: Record<ShopCategory, LucideIcon> = {
  'Frutta e verdura': Apple,
  Surgelati: Snowflake,
  'Carne e pesce': Fish,
  'Latticini e uova': Milk,
  'Pane e cereali': Wheat,
  Legumi: Bean,
  Dispensa: Package,
  Condimenti: Droplet,
};

const EMPTY: string[] = [];

export interface ShoppingTabProps {
  weekStart: ISODate;
  /** Piano, diario, controlli e profilo: le porzioni sono quelle del menù (minimo di carboidrati di partita compreso). */
  state: NutritionState;
  /** Settimana mostrata rispetto a quella attuale (0 = questa). */
  offset: number;
  today: ISODate;
  /** Primo giorno da comprare (prima settimana di chi inizia a metà settimana). */
  fromDate?: ISODate;
  /** Pasti di avvio del fine settimana prima del lunedì, per chi comincia il venerdì sera o il sabato. */
  lead?: ShoppingLead;
  onOpenWeek: (offset: number) => void;
  onGoPrep: () => void;
}

/** Riga sotto il titolo: pasti e giorni, e per la spesa di avvio cosa viene dopo. */
function spanText(dates: ISODate[], mealCount: number, opts: { lead: boolean; starter: boolean }): string {
  const span = opts.lead
    ? `da ${lowerFirst(formatDayTitle(dates[0]))} a ${lowerFirst(formatDayTitle(dates[dates.length - 1]))}`
    : dateSpanText(dates);
  const base = `Per ${mealCount} pasti, ${span}`;
  return opts.starter || opts.lead ? `${base}. Poi spesa il sabato e preparazione la domenica.` : base;
}

export function ShoppingTab({ weekStart, state, offset, today, fromDate, lead, onOpenWeek, onGoPrep }: ShoppingTabProps) {
  // La spesa di avvio cade quando cade: il fresco si conta da quel giorno, non dal sabato.
  const shopDate = useMemo(() => shoppingDateFor(state.plan, weekStart), [state.plan, weekStart]);
  const list = useMemo(() => shoppingList(weekStart, state, { fromDate, lead, shopDate }), [weekStart, state, fromDate, lead, shopDate]);
  const checked = useApp((s) => s.shoppingChecked[weekStart] ?? EMPTY);
  const toggleShopping = useApp((s) => s.toggleShopping);
  const toast = useUi((s) => s.toast);
  const [fallback, setFallback] = useState<string | null>(null);
  const progress = shoppingProgress(list, checked);
  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const remaining = progress.total - progress.done;
  const allDone = progress.total > 0 && remaining === 0;
  const range = formatWeekRange(weekStart);
  const wd = weekdayOf(today);
  const inCart = list.items.filter((i) => checkedSet.has(i.key));
  // La preparazione della domenica prima di questa settimana deve ancora venire (o è oggi).
  const prepAhead = addDays(weekStart, -1) >= today;

  const copy = async () => {
    const text = shoppingText(list, { checked, title: `Spesa · ${range}` });
    const ok = await copyText(text);
    if (ok) {
      haptic('success');
      const n = remaining || progress.total;
      toast(`Lista copiata: ${plural(n, 'prodotto', 'prodotti')}`, 'good');
    } else {
      setFallback(text);
    }
  };

  const reset = () => {
    const prev = checked;
    useApp.setState((s) => ({ shoppingChecked: { ...s.shoppingChecked, [weekStart]: [] } }));
    toast('Spunte azzerate', 'neutral', {
      actionLabel: 'Annulla',
      onAction: () => useApp.setState((s) => ({ shoppingChecked: { ...s.shoppingChecked, [weekStart]: prev } })),
    });
  };

  if (!list.items.length) {
    return (
      <Card>
        <EmptyState icon={ShoppingBasket} title="Niente da comprare" text="Il menù di questa settimana non ha ancora ricette. Quando arrivano, la lista si compone da sola." />
      </Card>
    );
  }

  // Etichetta breve: la settimana è già nell'intestazione.
  const label = list.starter ? 'Spesa di avvio' : 'Lista della spesa';

  return (
    <div className="flex flex-col gap-6">
      <Card variant="highlight" tone={allDone ? 'good' : 'accent'} padding="lg" as="section" aria-label="Avanzamento della spesa">
        <div className="flex items-center gap-4">
          <ProgressRing
            value={progress.ratio}
            size={84}
            stroke={8}
            tone={allDone ? 'good' : 'accent'}
            label={`${progress.done} prodotti presi su ${progress.total}`}
          >
            {allDone ? (
              <Check aria-hidden size={30} strokeWidth={2.6} className="text-good-ink" />
            ) : (
              <>
                <span className="t-num text-[1.625rem] leading-none text-ink">{progress.done}</span>
                <span className="t-caption mt-0.5 text-ink-3">di {progress.total}</span>
              </>
            )}
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="t-label text-ink-3">{label}</p>
            <p className="t-title-2 mt-1 text-ink">{allDone ? 'Tutto preso' : `${plural(remaining, 'prodotto', 'prodotti')} da prendere`}</p>
            <p className="t-footnote mt-0.5 text-ink-2">
              {allDone && list.starter
                ? 'La prossima è sabato, con la lista già pronta qui.'
                : spanText(list.dates, list.mealCount, { lead: list.leadDates.length > 0, starter: list.starter && !allDone })}
            </p>
          </div>
        </div>
        {/* Una sola azione: copiare la lista finché c'è da comprare, poi la preparazione della domenica se deve ancora venire. */}
        {!allDone ? (
          <Button icon={Copy} onClick={copy} fullWidth className="mt-4">
            Copia lista
          </Button>
        ) : (
          !list.starter &&
          prepAhead && (
            <Button iconRight={ChevronRight} onClick={onGoPrep} fullWidth className="mt-4">
              Vai alla preparazione
            </Button>
          )
        )}
      </Card>

      {offset === 0 && wd >= 5 && (
        <Callout
          tone="accent"
          title="La spesa per lunedì è già pronta"
          action={
            <Button variant="ghost" size="sm" iconRight={ChevronRight} onClick={() => onOpenWeek(1)}>
              Apri la prossima settimana
            </Button>
          }
        />
      )}


      {/* I reparti sono una lista sola: tra un reparto e l'altro 16 px, i 24 px restano tra la lista e il resto. */}
      <div className="flex flex-col gap-4">
        {list.groups.map((g) => (
          <CategorySection key={g.category} category={g.category} items={g.items} checked={checkedSet} onToggle={(k) => toggleShopping(weekStart, k)} />
        ))}

        {inCart.length > 0 && <CartSection items={inCart} onToggle={(k) => toggleShopping(weekStart, k)} onReset={reset} />}

        {list.pantry.length > 0 && <PantrySection items={list.pantry} checked={checkedSet} onToggle={(k) => toggleShopping(weekStart, k)} />}
      </div>

      <Disclosure variant="inline" tone="quiet" title="Come si calcolano le quantità" className="px-1">
        Dal menù della settimana, con le porzioni di ogni tipo di giorno e le ricette che hai cambiato. Pesi a crudo dove serve,
        arrotondati per eccesso. Carne e pesce freschi reggono in frigo uno o due giorni: le porzioni per più avanti vanno in
        freezer appena a casa.
      </Disclosure>

      <CopyFallbackSheet text={fallback} onClose={() => setFallback(null)} />
    </div>
  );
}

/** Intestazione di un gruppo chiudibile: icona, nome, contatore e freccia. */
function GroupHeader({
  id,
  icon: Icon,
  title,
  count,
  open,
  controls,
  onToggle,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  count: ReactNode;
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      onClick={() => {
        haptic('selection');
        onToggle();
      }}
      aria-expanded={open}
      aria-controls={controls}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-[12px] px-1 text-left"
    >
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-ink-soft text-ink-2">
        <Icon size={14} strokeWidth={2.3} />
      </span>
      <h3 id={id} className="t-label min-w-0 flex-1 truncate text-ink-3">
        {title}
      </h3>
      <span className="t-footnote shrink-0 tabular text-ink-2">{count}</span>
      <motion.span aria-hidden className="inline-flex shrink-0 text-ink-3" animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}>
        <ChevronDown size={18} strokeWidth={2.4} />
      </motion.span>
    </button>
  );
}

/** Contenuto di un gruppo che si apre e si chiude con un'animazione di altezza. */
function GroupBody({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          key="body"
          initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const DIVIDER = 'relative before:absolute before:left-[54px] before:right-0 before:top-0 before:h-px before:bg-line';

/**
 * Reparto: solo i prodotti ancora da prendere (quelli spuntati scendono in "Nel carrello"), chiudibile, con il
 * contatore. Per carne e pesce freschi una sola riga in fondo dice cosa congelare appena a casa.
 */
function CategorySection({
  category,
  items,
  checked,
  onToggle,
}: {
  category: ShopCategory;
  items: ShoppingItem[];
  checked: Set<string>;
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const Icon = CATEGORY_ICON[category] ?? Package;
  const todo = items.filter((i) => !checked.has(i.key));
  const freeze = todo.filter((i) => i.freezeDates?.length);
  const id = `spesa-${category.toLowerCase().replace(/\s+/g, '-')}`;
  if (!todo.length) return null;
  return (
    <section className="flex flex-col gap-1.5" aria-labelledby={id}>
      <GroupHeader id={id} icon={Icon} title={category} count={`${todo.length} da prendere`} open={open} controls={`${id}-lista`} onToggle={() => setOpen((v) => !v)} />
      <GroupBody id={`${id}-lista`} open={open}>
        <Card padding="none">
          <ul>
            <AnimatePresence initial={false}>
              {todo.map((item, i) => (
                <motion.li
                  key={item.key}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className={i > 0 ? DIVIDER : undefined}
                >
                  <CheckRow checked={false} onChange={() => onToggle(item.key)} title={item.name} subtitle={itemSubtitle(item, category)} meta={item.amount} tone="good" />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Card>
        <FreezeNote items={freeze} />
      </GroupBody>
    </section>
  );
}

/** "Nel carrello": i prodotti spuntati, chiusi di base. Toccarne uno lo riporta nel suo reparto. */
function CartSection({ items, onToggle, onReset }: { items: ShoppingItem[]; onToggle: (key: string) => void; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const id = 'spesa-carrello';
  return (
    <section className="flex flex-col gap-1.5" aria-labelledby={id}>
      <GroupHeader id={id} icon={ShoppingCart} title="Nel carrello" count={<>{items.length}<span className="sr-only">{items.length === 1 ? ' prodotto' : ' prodotti'}</span></>} open={open} controls={`${id}-lista`} onToggle={() => setOpen((v) => !v)} />
      <GroupBody id={`${id}-lista`} open={open}>
        <Card padding="none">
          <ul>
            {items.map((item, i) => (
              <li key={item.key} className={i > 0 ? DIVIDER : undefined}>
                <CheckRow checked onChange={() => onToggle(item.key)} title={item.name} meta={item.amount} tone="good" />
              </li>
            ))}
          </ul>
        </Card>
        <Button variant="ghost" size="sm" icon={RotateCcw} onClick={onReset} className="mt-1">
          Azzera le spunte
        </Button>
      </GroupBody>
      {/* A casa serve proprio questa nota: resta in vista anche con il carrello chiuso. */}
      <FreezeNote items={items.filter((i) => i.freezeDates?.length)} />
    </section>
  );
}

/** Prodotti da dispensa: di solito ci sono già, chiusi di base. */
function PantrySection({ items, checked, onToggle }: { items: ShoppingItem[]; checked: Set<string>; onToggle: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const id = 'spesa-dispensa';
  const todo = items.filter((i) => !checked.has(i.key)).length;
  return (
    <section className="flex flex-col gap-1.5" aria-labelledby={id}>
      <GroupHeader
        id={id}
        icon={Package}
        title="Da controllare in dispensa"
        count={todo ? <>{todo}<span className="sr-only"> da controllare</span></> : <span className="inline-flex items-center gap-1 font-semibold text-good-ink"><Check aria-hidden size={14} strokeWidth={3} />Fatto</span>}
        open={open}
        controls={`${id}-lista`}
        onToggle={() => setOpen((v) => !v)}
      />
      <GroupBody id={`${id}-lista`} open={open}>
        <Card padding="none">
          <ul>
            {items.map((item, i) => (
              <li key={item.key} className={i > 0 ? DIVIDER : undefined}>
                <CheckRow
                  checked={checked.has(item.key)}
                  onChange={() => onToggle(item.key)}
                  title={item.name}
                  subtitle={item.buyG >= 50 ? `${item.qty.replace(/ /g, ' ')} in settimana` : undefined}
                  tone="accent"
                />
              </li>
            ))}
          </ul>
        </Card>
        <p className="t-footnote mt-2 px-1 text-ink-3">Di solito ci sono già: dai un’occhiata prima di uscire.</p>
      </GroupBody>
    </section>
  );
}

/** Una sola riga per gruppo: carne e pesce freschi da congelare appena a casa, per i giorni oltre il giorno dopo la spesa. */
function FreezeNote({ items }: { items: ShoppingItem[] }) {
  if (!items.length) return null;
  const what = items.map((i) => `${lowerFirst(i.name)} per ${listIt((i.freezeDates ?? []).map((d) => WEEKDAY_LONG[weekdayOf(d)]))}`).join('; ');
  return (
    <p className="t-footnote mt-2 flex gap-2 px-1 text-ink-2">
      <Snowflake aria-hidden size={14} strokeWidth={2.4} className="mt-[3px] shrink-0 text-ink-3" />
      <span>Appena a casa, in freezer a porzioni: {what}. La sera prima passale in frigo.</span>
    </p>
  );
}

/** Reparti in cui i giorni d'uso servono davvero al banco: carne e pesce freschi reggono poco in frigo. */
const DAYS_SHOWN = new Set<ShopCategory>(['Carne e pesce']);

/**
 * Sotto il nome: lo stato a crudo o la confezione e, solo per i freschi che reggono poco, i giorni; un fiocco per quelli
 * da congelare in parte (la nota è in fondo al reparto). Per il resto basta il nome con la quantità: i giorni sono nel menù.
 */
function itemSubtitle(item: ShoppingItem, category: ShopCategory): ReactNode {
  const days = DAYS_SHOWN.has(category) || item.freezeDates?.length ? daysText(item.days) : '';
  const line = [item.hint, days].filter(Boolean).join(' · ').replace(/ /g, ' ');
  if (!line) return undefined;
  if (!item.freezeDates?.length) return line;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{line}</span>
      <Snowflake aria-label="in parte da congelare" role="img" size={13} strokeWidth={2.4} className="shrink-0 text-ink-3" />
    </span>
  );
}

/** Se gli appunti non sono disponibili: il testo pronto da selezionare e copiare a mano. */
function CopyFallbackSheet({ text, onClose }: { text: string | null; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const selectAll = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length);
    try {
      if (document.execCommand('copy')) {
        haptic('success');
        useUi.getState().toast('Lista copiata', 'good');
        onClose();
      }
    } catch {
      /* resta selezionato: l'utente copia dal menu */
    }
  };
  return (
    <Sheet
      open={text !== null}
      onClose={onClose}
      title="Copia la lista"
      subtitle="Da qui il browser non permette di copiare da solo: seleziona il testo e scegli Copia."
      size="large"
      initialFocus={ref}
      footer={
        <Button fullWidth size="lg" icon={ClipboardCopy} onClick={selectAll}>
          Seleziona tutto
        </Button>
      }
    >
      <textarea
        ref={ref}
        readOnly
        value={text ?? ''}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Lista della spesa"
        className="selectable t-callout h-full min-h-[50vh] w-full resize-none rounded-control border border-line bg-field p-3 text-[0.8125rem] leading-relaxed text-ink"
      />
    </Sheet>
  );
}
