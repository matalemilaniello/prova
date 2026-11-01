/**
 * Scheda Menù: il giorno scelto con i valori stimati rispetto all'obiettivo (l'elemento protagonista) e i 5
 * pasti in card compatte: miniatura, nome, kcal, proteine e minuti. Delle porzioni restano in vista solo
 * quelle cambiate per il tipo di giorno; gli altri ingredienti si aprono con un tocco o nella ricetta.
 * Il giudizio "In linea" guarda kcal e macronutrienti, non solo le kcal.
 */
import { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Activity, ArrowLeftRight, ChefHat, ChevronDown, ChevronRight, Coffee, Dumbbell, ShoppingBasket, Sparkles, UtensilsCrossed } from 'lucide-react';
import type { DayType, ISODate, IngredientLine, MealSlot, Plan, AppData } from '../../domain/types';
import { FOODS } from '../../data/foods';
import { addDays, formatDayLong, formatRelativeDay, weekdayOf } from '../../engine/dates';
import { mealsForDate, starterEnd, type MealEntry } from '../../engine/menu';
import { dayNutritionDetail, portionParts, recipeNutrition, totalCarbFactor } from '../../engine/nutrition';
import { foodState, shopName } from '../../engine/shopping';
import { capitalize, fmtNumber } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { usePlanDay } from '../../state/hooks';
import { BallIcon, Button, Callout, Card, DayTypeBadge, Disclosure, EmptyState, NumberTicker, Pill, Pressable, ProgressBar, ProgressRing, SectionTitle, staggerItem } from '../../ui';
import { toneColor, toneInk } from '../../ui/tones';
import { DishArt } from './art/DishArt';
import type { IconLike } from '../../ui/icon';
import { swatchFor } from './art/foodArt';
import {
  dayActivities,
  dayVerdict,
  firstShoppingSafe,
  lowerFirst,
  mealScheduleFor,
  portionShort,
  preShoppingSlots,
  type DayState,
  type FirstShoppingInfo,
  type ActivityKind,
} from './helpers';
import { SwapSheet } from './SwapSheet';

const ACT_ICON: Record<ActivityKind, IconLike> = { calcio: BallIcon, palestra: Dumbbell, fisio: Activity };
const NO_SLOTS = new Set<MealSlot>();

export interface MenuTabProps {
  date: ISODate;
  plan: Plan;
  dayLogs: AppData['dayLogs'];
  /** Apre la scheda Spesa sulla prima spesa (giorni di avvio). */
  onOpenShopping?: () => void;
}

export function MenuTab({ date, plan, dayLogs, onOpenShopping }: MenuTabProps) {
  const state = useMemo(() => ({ plan, dayLogs }), [plan, dayLogs]);
  const meals = useMemo(() => mealsForDate(date, state), [date, state]);
  const detail = useMemo(() => dayNutritionDetail(date, state), [date, state]);
  const schedule = useMemo(() => mealScheduleFor(date, plan), [date, plan]);
  const day = plan.week.find((d) => d.weekday === weekdayOf(date));
  // Porzioni e obiettivi seguono il tipo effettivo (la vigilia mangia da calcio); colori ed etichetta il tipo previsto.
  const dayType = meals.dayType;
  const colorType = meals.scheduledDayType;
  const hasPhysio = useApp((s) => s.physio.exercises.length > 0);
  const acts = dayActivities(day, hasPhysio);
  const [swapSlot, setSwapSlot] = useState<MealSlot | null>(null);
  const swapEntry = swapSlot ? meals.bySlot[swapSlot] : undefined;
  const scale = detail.carbScale;
  const factor = totalCarbFactor(dayType, scale);

  // Prima spesa e pasti che la precedono: stesso criterio di Oggi (servono spunte, sedute e riti).
  const shoppingChecked = useApp((s) => s.shoppingChecked);
  const physio = useApp((s) => s.physio);
  const workoutLogs = useApp((s) => s.workoutLogs);
  const reviews = useApp((s) => s.reviews);
  const prepDone = useApp((s) => s.prepDone);
  const dayState = useMemo<DayState>(
    () => ({ plan, dayLogs, shoppingChecked, physio, workoutLogs, reviews, prepDone }),
    [plan, dayLogs, shoppingChecked, physio, workoutLogs, reviews, prepDone],
  );
  const shop = useMemo(() => (meals.starter ? firstShoppingSafe(dayState) : null), [meals.starter, dayState]);
  const beforeShop = useMemo(() => (meals.starter ? preShoppingSlots(date, dayState) : NO_SLOTS), [meals.starter, date, dayState]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2.5 px-1">
        <h2 className="t-title text-ink">{capitalize(formatDayLong(date))}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <DayTypeBadge dayType={colorType} label={meals.matchEve ? 'Vigilia della partita' : undefined} />
          {acts.map((a) => (
            <Pill key={a.kind} variant="outline" tone="neutral" icon={ACT_ICON[a.kind]}>
              {a.label}
            </Pill>
          ))}
        </div>
      </header>

      {meals.starter && <StarterNote date={date} plan={plan} shop={shop} onOpenShopping={onOpenShopping} />}

      {meals.meals.length === 0 ? (
        <Card>
          <EmptyState compact icon={UtensilsCrossed} title="Nessun pasto previsto" text="Il menù di questo giorno non è disponibile. Prova un altro giorno." />
        </Card>
      ) : (
        <>
          <DayNutritionCard dayType={dayType} colorType={colorType} plan={plan} detail={detail} matchEve={meals.matchEve} />

          <section className="flex flex-col gap-3" aria-labelledby="settimana-pasti">
            <SectionTitle id="settimana-pasti" subtitle={<PortionNote dayType={dayType} colorType={colorType} factor={factor} matchEve={meals.matchEve} />}>
              Pasti del giorno
            </SectionTitle>
            <ul className="flex flex-col gap-3">
              {meals.meals.map((m, i) => (
                <motion.li key={`${date}-${m.slot}`} {...staggerItem(i)}>
                  <MealCard
                    entry={m}
                    date={date}
                    dayType={dayType}
                    colorType={colorType}
                    scale={scale}
                    title={(schedule[m.slot]?.title ?? capitalize(m.slot)).split(',')[0]}
                    time={schedule[m.slot]?.time}
                    beforeShop={beforeShop.has(m.slot)}
                    onSwap={() => setSwapSlot(m.slot)}
                  />
                </motion.li>
              ))}
            </ul>
          </section>
          <Disclosure variant="inline" title="Come si misurano le porzioni" className="px-1">
            Palmo, pugno e mano a coppa sono quelli della tua mano: crescono con te. Accanto a ogni porzione ci sono i
            grammi, per controllare con la bilancia le prime volte. Valori stimati dalle tabelle CREA e USDA.
          </Disclosure>
        </>
      )}

      {swapEntry && swapSlot && (
        <SwapSheet
          open
          onClose={() => setSwapSlot(null)}
          date={date}
          slot={swapSlot}
          entry={swapEntry}
          dayType={dayType}
          scale={scale}
          title={schedule[swapSlot]?.title}
          starter={meals.starter}
        />
      )}
    </div>
  );
}

function PortionNote({ dayType, colorType, factor, matchEve }: { dayType: DayType; colorType: DayType; factor: number; matchEve: boolean }) {
  const p = portionShort(dayType, factor, matchEve);
  if (!p) return null;
  return (
    <>
      {p.lead}
      <span style={{ color: toneInk(colorType) }} className="font-semibold">
        {p.pct}
      </span>
      {p.tail}
    </>
  );
}

// ───────────────────────── Giorni di avvio ─────────────────────────

/**
 * Giorni di avvio: niente preparazione della domenica e ricette da 15 minuti. Fino alla prima spesa (compreso il
 * suo giorno, finché non è fatta) si mangia con quello che c'è in casa o con il piano B al bar.
 */
function StarterNote({ date, plan, shop, onOpenShopping }: { date: ISODate; plan: Plan; shop: FirstShoppingInfo | null; onOpenShopping?: () => void }) {
  const today = usePlanDay();
  const end = starterEnd(plan);
  const lastDay = end ? addDays(end, -1) : null;
  // La prima spesa ancora da fare, per i giorni che arrivano fino a lei.
  const ahead = shop && !shop.done && shop.date >= today && shop.date >= date ? shop : null;
  return (
    <Callout
      tone="accent"
      icon={Sparkles}
      title="Settimana di avvio"
      action={
        ahead ? (
          <span className="flex flex-wrap gap-x-1 gap-y-1">
            {onOpenShopping && (
              <Button variant="ghost" size="sm" icon={ShoppingBasket} onClick={onOpenShopping}>
                Lista della spesa
              </Button>
            )}
            <Button variant="ghost" size="sm" icon={Coffee} onClick={() => useUi.getState().open({ type: 'barPlanB' })} aria-label="Apri il piano B al bar">
              Piano B
            </Button>
          </span>
        ) : undefined
      }
    >
      {ahead ? (
        <>
          Fino alla spesa di {formatRelativeDay(ahead.date, today)} alle {ahead.time}: quello che hai in casa o il piano B al bar.
        </>
      ) : (
        <>
          Ricette da 15 minuti e niente preparazione {lastDay ? `fino a ${formatDayLong(lastDay)}` : 'in questi giorni'}. Le fibre salgono per gradi:
          pane comune e ceci a piccole dosi.
        </>
      )}
    </Callout>
  );
}

// ───────────────────────── Valori del giorno ─────────────────────────

function DayNutritionCard({
  dayType,
  colorType,
  plan,
  detail,
  matchEve,
}: {
  dayType: DayType;
  colorType: DayType;
  plan: Plan;
  detail: ReturnType<typeof dayNutritionDetail>;
  matchEve: boolean;
}) {
  const target = plan.targets[dayType];
  const t = detail.total;
  const ratio = target.kcal ? t.kcal / target.kcal : 0;
  const verdict = dayVerdict(t, target);
  const veg = Math.round(detail.vegPortions * 2) / 2;
  const vegShown = Math.min(7, Math.floor(detail.vegPortions + 0.25));
  const rows = [
    { label: 'Proteine', v: t.proteinG, target: target.proteinG },
    { label: 'Carboidrati', v: t.carbG, target: target.carbG },
    { label: 'Grassi', v: t.fatG, target: target.fatG },
    { label: 'Fibre', v: t.fiberG, target: target.fiberG },
  ];
  return (
    <Card variant="highlight" tone={colorType} padding="lg" as="section" aria-label="Valori stimati del giorno">
      <div className="flex items-center justify-between gap-3">
        <span className="t-label text-ink-3">Stima dal menù</span>
        <Pill tone={verdict.good ? 'good' : 'warn'} dot>
          {verdict.text}
        </Pill>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <ProgressRing
          value={ratio}
          size={108}
          stroke={10}
          tone={colorType}
          celebrate={false}
          label={`${fmtNumber(t.kcal)} kcal stimate su ${fmtNumber(target.kcal)} di obiettivo`}
        >
          <span className="t-num text-[1.875rem] leading-none text-ink">
            <NumberTicker value={Math.round(t.kcal)} format={(n) => fmtNumber(n)} />
          </span>
          <span className="t-caption mt-1 text-ink-2">di {fmtNumber(target.kcal)} kcal</span>
        </ProgressRing>
        <dl className="flex min-w-0 flex-1 flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-x-1.5">
                <dt className="t-footnote min-w-0 truncate text-ink-2">{r.label}</dt>
                <dd className="t-mono shrink-0 whitespace-nowrap text-[0.75rem] max-[380px]:text-[0.6875rem]">
                  <span className="font-medium text-ink">{fmtNumber(Math.round(r.v))}</span>
                  <span className="text-ink-3"> / {fmtNumber(r.target)}&nbsp;g</span>
                </dd>
              </div>
              <ProgressBar value={r.target ? r.v / r.target : 0} size="xs" tone={colorType} label={`${r.label}: ${Math.round(r.v)} su ${r.target} g`} />
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <div className="flex shrink-0 gap-1" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <span
              key={i}
              className="size-2.5 rounded-full"
              style={
                i < vegShown
                  ? { background: toneColor('good') }
                  : i < 5
                    ? { boxShadow: 'inset 0 0 0 1.5px var(--line-strong)' }
                    : { background: 'var(--ink-soft)' }
              }
            />
          ))}
        </div>
        <p className="t-footnote min-w-0 text-ink-2">
          <span className="font-semibold text-ink">{fmtNumber(veg, 1)}</span> porzioni di frutta e verdura
          <span className="text-ink-3">, obiettivo 5</span>
        </p>
      </div>
      {matchEve && (
        <Disclosure variant="inline" title="Perché più carboidrati" className="mt-3">
          Domani c’è la partita: oggi porzioni da giorno di calcio, per arrivare in campo con le scorte di glicogeno piene.
        </Disclosure>
      )}
    </Card>
  );
}

// ───────────────────────── Card del pasto ─────────────────────────

interface MealCardProps {
  entry: MealEntry;
  date: ISODate;
  dayType: DayType;
  /** Tipo previsto dalla settimana, per i colori. */
  colorType: DayType;
  /** Scala del piano per le righe di carboidrati (`dayCarbScale`). */
  scale: number;
  title: string;
  time?: string;
  /** Pasto prima della prima spesa: gli ingredienti non ci sono ancora. */
  beforeShop?: boolean;
  onSwap: () => void;
}

const SPICE_MAX_G = 6;

/** La porzione mostrata cambia rispetto a quella della ricetta (giorno di palestra, obiettivi predefiniti)? */
function portionChanged(line: IngredientLine, dayType: DayType, scale: number): boolean {
  if (!line.carbScaled) return false;
  return portionParts(line, dayType, FOODS, scale).portion !== portionParts(line, 'palestra', FOODS, 1).portion;
}

function MealCard({ entry, date, dayType, colorType, scale, title, time, beforeShop, onSwap }: MealCardProps) {
  const recipe = entry.recipe;
  const n = useMemo(() => recipeNutrition(recipe, dayType, FOODS, scale), [recipe, dayType, scale]);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const reduce = useReducedMotion();

  if (!recipe) {
    return (
      <Card>
        <EmptyState compact icon={UtensilsCrossed} title="Ricetta non trovata" text="Cambiala con un’alternativa." action={<Button size="sm" variant="secondary" icon={ArrowLeftRight} onClick={onSwap}>Cambia</Button>} />
      </Card>
    );
  }

  const lines = recipe.ingredients.map((l, idx) => {
    const food = FOODS[l.foodId];
    const p = portionParts(l, dayType, FOODS, scale);
    return { l, idx, food, p, changed: portionChanged(l, dayType, scale), spice: Boolean(food?.pantry) && p.grams < SPICE_MAX_G && l.foodId !== 'olio-evo' };
  });
  const main = lines.filter((x) => !x.spice);
  const changed = main.filter((x) => x.changed);
  const spices = lines.filter((x) => x.spice).map((x) => (x.food ? lowerFirst(shopName(x.food)) : x.l.foodId));
  // Chiuso restano in vista solo le quantità cambiate per il tipo di giorno; aperto, tutti gli ingredienti.
  const shown = open ? main : changed;

  const openRecipe = () => useUi.getState().open({ type: 'recipe', recipeId: entry.recipeId, date, slot: entry.slot });
  const toggle = () => {
    haptic('selection');
    setOpen((v) => !v);
  };

  return (
    <Card padding="none" as="article" className="overflow-hidden" aria-label={`${title}: ${recipe.name}`}>
      <Pressable onPress={openRecipe} pressScale={0.985} className="flex w-full items-center gap-3.5 p-4" aria-label={`${title}, ${recipe.name}${entry.swapped ? ', cambiato' : beforeShop ? ', dopo la spesa' : ''}. Apri la ricetta`}>
        <span className="relative size-16 shrink-0">
          <DishArt recipe={recipe} dayType={colorType} variant="thumb" className="size-full" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="t-label truncate text-ink-3">{title}</span>
            {time && <span className="t-mono shrink-0 text-[0.75rem] text-ink-3">{time}</span>}
          </span>
          <span className="t-headline mt-0.5 text-ink">{recipe.name}</span>
          <span className="t-footnote mt-1 text-ink-2">
            <span className="font-semibold text-ink tabular">{fmtNumber(Math.round(n.kcal))}</span> kcal
            <span aria-hidden className="text-ink-3"> · </span>
            <span className="whitespace-nowrap">
              <span className="font-semibold text-ink tabular">{fmtNumber(Math.round(n.proteinG))}</span> g proteine
            </span>
            <span aria-hidden className="text-ink-3"> · </span>
            <span className="whitespace-nowrap">{recipe.prepMin} min</span>
          </span>
          {(entry.swapped || beforeShop || recipe.batch) && (
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              {entry.swapped ? (
                <Pill tone="accent" size="sm">
                  Cambiato
                </Pill>
              ) : beforeShop ? (
                <Pill tone="neutral" size="sm" icon={ShoppingBasket}>
                  Dopo la spesa
                </Pill>
              ) : null}
              {recipe.batch && (
                <span className="t-caption inline-flex items-center gap-1 text-ink-3">
                  <ChefHat aria-hidden size={13} strokeWidth={2.2} />
                  Pronta dalla domenica
                </span>
              )}
            </span>
          )}
        </span>
        <ChevronRight aria-hidden size={18} strokeWidth={2.2} className="shrink-0 text-ink-4" />
      </Pressable>

      <AnimatePresence initial={false}>
        {shown.length > 0 && (
          <motion.ul
            key="righe"
            id={listId}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line"
            aria-label={open ? 'Ingredienti' : 'Quantità cambiate oggi'}
          >
            <li className="h-2" aria-hidden />
            <AnimatePresence initial={false}>
              {shown.map(({ l, idx, food, p, changed: isChanged }) => {
                const name = food ? shopName(food) : l.foodId;
                const state = food ? foodState(food) : undefined;
                const hand = l.unit !== 'g' && l.unit !== 'ml';
                return (
                  <motion.li
                    key={`${l.foodId}-${idx}`}
                    layout="position"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    className="mx-4 flex items-start gap-2.5 py-1"
                  >
                    <span
                      aria-hidden
                      className="mt-[6px] size-2 shrink-0 rounded-full"
                      style={{ background: swatchFor(l.foodId, food), boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 14%, transparent)' }}
                    />
                    <span className="t-footnote min-w-0 flex-1 text-ink">
                      {name}
                      {state && <span className="text-ink-3"> {state}</span>}
                    </span>
                    <span className="t-footnote max-w-[55%] shrink-0 text-right leading-5">
                      <span className="font-medium" style={{ color: isChanged ? toneInk(colorType) : 'var(--ink-2)' }}>
                        {p.portion}
                      </span>
                      {hand && p.grams > 0 && <span className="tabular whitespace-nowrap text-ink-3"> · ≈&nbsp;{p.grams}&nbsp;g</span>}
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {open && spices.length > 0 && <li className="t-caption mx-4 pt-1 text-ink-3">Per insaporire: {spices.join(', ')}</li>}
            <li className="h-2" aria-hidden />
          </motion.ul>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-1 border-t border-line px-2 py-1">
        <Button variant="ghost" size="sm" icon={ArrowLeftRight} onClick={onSwap} aria-label={`Cambia ${title.toLowerCase()}`}>
          Cambia
        </Button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={shown.length ? listId : undefined}
          className="hit-44 inline-flex h-9 items-center gap-1.5 rounded-control px-3 text-[0.875rem] font-medium text-ink-2"
        >
          {recipe.ingredients.length} ingredienti
          <motion.span aria-hidden className="inline-flex" animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}>
            <ChevronDown size={16} strokeWidth={2.4} />
          </motion.span>
        </button>
      </div>
    </Card>
  );
}
