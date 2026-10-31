/**
 * Scheda Spesa: lista aggregata per reparto dal menù della settimana, con spunte salvate,
 * avanzamento, prodotti da dispensa separati e "Copia lista" (appunti, con ripiego a selezione).
 */
import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Apple,
  Bean,
  Check,
  ChevronRight,
  ClipboardCopy,
  Copy,
  Droplet,
  Eye,
  EyeOff,
  Fish,
  Milk,
  Package,
  RotateCcw,
  ShoppingBasket,
  Snowflake,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import type { AppData, ISODate, Plan, ShopCategory } from '../../domain/types';
import { formatWeekRange, weekdayOf } from '../../engine/dates';
import { shoppingList, shoppingProgress, shoppingText, type ShoppingItem } from '../../engine/shopping';
import { plural } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { Button, Callout, Card, CheckRow, EmptyState, ProgressRing, Sheet, type AnyTone } from '../../ui';
import { toneColor, toneSoft } from '../../ui/tones';
import { copyText } from './clipboard';
import { daysText } from './helpers';

const CATEGORY_LOOK: Record<ShopCategory, { icon: LucideIcon; tone: AnyTone }> = {
  'Frutta e verdura': { icon: Apple, tone: 'good' },
  Surgelati: { icon: Snowflake, tone: 'palestra' },
  'Carne e pesce': { icon: Fish, tone: 'bad' },
  'Latticini e uova': { icon: Milk, tone: 'riposo' },
  'Pane e cereali': { icon: Wheat, tone: 'calcio' },
  Legumi: { icon: Bean, tone: 'leggero' },
  Dispensa: { icon: Package, tone: 'warn' },
  Condimenti: { icon: Droplet, tone: 'accent' },
};

const EMPTY: string[] = [];

export interface ShoppingTabProps {
  weekStart: ISODate;
  plan: Plan;
  dayLogs: AppData['dayLogs'];
  /** Settimana mostrata rispetto a quella attuale (0 = questa). */
  offset: number;
  today: ISODate;
  onOpenWeek: (offset: number) => void;
  onGoPrep: () => void;
}

export function ShoppingTab({ weekStart, plan, dayLogs, offset, today, onOpenWeek, onGoPrep }: ShoppingTabProps) {
  const list = useMemo(() => shoppingList(weekStart, { plan, dayLogs }), [weekStart, plan, dayLogs]);
  const checked = useApp((s) => s.shoppingChecked[weekStart] ?? EMPTY);
  const toggleShopping = useApp((s) => s.toggleShopping);
  const toast = useUi((s) => s.toast);
  const [hideDone, setHideDone] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const progress = shoppingProgress(list, checked);
  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const remaining = progress.total - progress.done;
  const allDone = progress.total > 0 && remaining === 0;
  const range = formatWeekRange(weekStart);
  const wd = weekdayOf(today);

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
            <p className="t-label text-ink-3">{offset === 0 ? 'Spesa della settimana' : `Spesa · ${range}`}</p>
            <p className="t-title-2 mt-1 text-ink">{allDone ? 'Tutto preso' : `${plural(remaining, 'prodotto', 'prodotti')} da prendere`}</p>
            <p className="t-footnote mt-0.5 text-ink-2">Per {list.mealCount} pasti, da lunedì a domenica</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button icon={Copy} onClick={copy} className="flex-1">
            Copia lista
          </Button>
          {(progress.done > 0 || hideDone) && (
            <Button variant="secondary" icon={hideDone ? Eye : EyeOff} onClick={() => setHideDone((v) => !v)} aria-pressed={hideDone} className="flex-1">
              {hideDone ? 'Mostra presi' : 'Nascondi presi'}
            </Button>
          )}
        </div>
      </Card>

      {offset === 0 && wd >= 5 && (
        <Callout
          tone="accent"
          title={wd === 6 ? 'Domani inizia una nuova settimana' : 'Lunedì inizia una nuova settimana'}
          action={
            <Button variant="ghost" size="sm" iconRight={ChevronRight} onClick={() => onOpenWeek(1)}>
              Apri la prossima settimana
            </Button>
          }
        >
          La lista per la settimana prossima è già pronta: falla nel weekend, prima della preparazione della domenica.
        </Callout>
      )}

      {allDone && (
        <Callout
          tone="good"
          title="Spesa fatta"
          action={
            <Button variant="ghost" size="sm" iconRight={ChevronRight} onClick={onGoPrep}>
              Vai alla preparazione
            </Button>
          }
        >
          Adesso la preparazione della domenica: un’ora e la settimana è in discesa.
        </Callout>
      )}

      {list.groups.map((g) => (
        <CategorySection
          key={g.category}
          category={g.category}
          items={g.items}
          checked={checkedSet}
          hideDone={hideDone}
          onToggle={(k) => toggleShopping(weekStart, k)}
        />
      ))}

      {list.pantry.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="spesa-dispensa">
          <div className="flex items-center gap-2 px-1">
            <h3 id="spesa-dispensa" className="t-label text-ink-3">
              Da controllare in dispensa
            </h3>
          </div>
          <Card padding="none">
            <ul>
              {list.pantry.map((item, i) => (
                <li key={item.key} className={i > 0 ? 'relative before:absolute before:left-[54px] before:right-0 before:top-0 before:h-px before:bg-line' : undefined}>
                  <CheckRow
                    checked={checkedSet.has(item.key)}
                    onChange={() => toggleShopping(weekStart, item.key)}
                    title={item.name}
                    subtitle={item.buyG >= 50 ? `${item.qty.replace(/ /g, ' ')} in settimana` : undefined}
                    tone="accent"
                  />
                </li>
              ))}
            </ul>
          </Card>
          <p className="t-footnote px-1 text-ink-3">Di solito ci sono già: dai un’occhiata prima di uscire.</p>
        </section>
      )}

      <div className="flex flex-col gap-3 px-1">
        <p className="t-footnote text-ink-3">
          Quantità dal menù della settimana, con le porzioni di ogni tipo di giorno e le ricette che hai cambiato. Pesi a crudo dove serve,
          arrotondati per eccesso.
        </p>
        {progress.done > 0 && (
          <div>
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reset} className="-ml-3.5">
              Azzera le spunte
            </Button>
          </div>
        )}
      </div>

      <CopyFallbackSheet text={fallback} onClose={() => setFallback(null)} />
    </div>
  );
}

function CategorySection({
  category,
  items,
  checked,
  hideDone,
  onToggle,
}: {
  category: ShopCategory;
  items: ShoppingItem[];
  checked: Set<string>;
  hideDone: boolean;
  onToggle: (key: string) => void;
}) {
  const look = CATEGORY_LOOK[category] ?? { icon: Package, tone: 'neutral' as AnyTone };
  const Icon = look.icon;
  const done = items.filter((i) => checked.has(i.key)).length;
  const complete = done === items.length;
  const visible = hideDone ? items.filter((i) => !checked.has(i.key)) : items;
  const id = `spesa-${category.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <div className="flex items-center gap-2.5 px-1">
        <span aria-hidden className="grid size-6 place-items-center rounded-[7px]" style={{ background: toneSoft(look.tone, 18), color: toneColor(look.tone) }}>
          <Icon size={14} strokeWidth={2.3} />
        </span>
        <h3 id={id} className="t-label text-ink-3">
          {category}
        </h3>
        <span className="ml-auto flex items-center gap-1">
          {complete ? (
            <span className="t-footnote inline-flex items-center gap-1 font-semibold text-good-ink">
              <Check aria-hidden size={14} strokeWidth={3} />
              Preso
            </span>
          ) : (
            <span className="t-mono text-[0.75rem] text-ink-3" aria-label={`${done} su ${items.length}`}>
              {done}/{items.length}
            </span>
          )}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {visible.length > 0 && (
          <motion.div
            key="card"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden rounded-card"
          >
            <Card padding="none">
              <ul>
                <AnimatePresence initial={false}>
                  {visible.map((item, i) => (
                    <motion.li
                      key={item.key}
                      layout="position"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className={i > 0 ? 'relative before:absolute before:left-[54px] before:right-0 before:top-0 before:h-px before:bg-line' : undefined}
                    >
                      <CheckRow
                        checked={checked.has(item.key)}
                        onChange={() => onToggle(item.key)}
                        title={item.name}
                        subtitle={[item.hint, daysText(item.days)].filter(Boolean).join(' · ').replace(/ /g, ' ')}
                        meta={item.amount}
                        tone="good"
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
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
        className="selectable t-mono h-full min-h-[50vh] w-full resize-none rounded-control border border-line bg-field p-3 text-[0.8125rem] leading-relaxed text-ink"
      />
    </Sheet>
  );
}
