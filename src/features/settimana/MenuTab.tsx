/**
 * Scheda Menù: il giorno scelto con i valori stimati rispetto all'obiettivo (l'elemento protagonista) e i 5
 * pasti in card compatte: miniatura, nome, kcal, proteine e minuti. Delle porzioni restano in vista solo
 * quelle cambiate per il tipo di giorno; gli altri ingredienti si aprono con un tocco o nella ricetta.
 * Il giudizio "In linea" guarda kcal e macronutrienti, non solo le kcal, rispetto all'obiettivo della data
 * (`dayTargetFor`: con il minimo di carboidrati di partita e vigilia, come in Oggi).
 * Nei giorni di avvio, finché la spesa di avvio non è fatta, una riga sola con l'orario della spesa, la lista e il
 * piano B; la pillola "Dopo la spesa" resta solo nel giorno della spesa, dove separa i pasti di prima da quelli dopo.
 *
 * Fase 2 (docs/FASE2.md § 4.10, § 6.4, § 11.5): accanto a «Pasti del giorno» la provenienza del menù (di avvio, di
 * base, approvato, ripetuto, con la settimana ripetuta sotto i pasti); un pasto rimasto vuoto per un'esclusione è una
 * card «Scegli tu» con le ricette del pasto e il piano B; nella settimana dopo, con una proposta aperta, la card «Menù
 * nuovo» in cima e un punto ambra con la ricetta nuova sui pasti che cambierebbero.
 */
import { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Activity, ArrowLeftRight, BadgeCheck, BriefcaseBusiness, ChefHat, ChevronDown, Dumbbell, Layers, Repeat, ShoppingBasket, Sparkles, Store, UtensilsCrossed } from 'lucide-react';
import type { DayType, ISODate, IngredientLine, MealSlot, Plan, AppData } from '../../domain/types';
import { FOODS } from '../../data/foods';
import { RECIPES } from '../../data/recipes';
import { formatDayLong, formatRelativeDay, weekdayOf } from '../../engine/dates';
import { workBlocksFor } from '../../engine/mealTimes';
import { MEAL_SLOTS, mealsForDate, type MealEntry, type MenuSource } from '../../engine/menu';
import { dayNutritionDetail, nutritionStateOf, portionParts, recipeNutrition, totalCarbFactor } from '../../engine/nutrition';
import { foodState, shopName } from '../../engine/shopping';
import { clearedMealDetail } from '../../engine/timeline';
import { formatWork } from '../../engine/work';
import { capitalize, fmtNumber } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { usePlanDay } from '../../state/hooks';
import { BallIcon, Button, Card, DayTypeBadge, Disclosure, EmptyState, NumberTicker, Pill, Pressable, ProgressBar, ProgressRing, SectionTitle, cn, staggerItem } from '../../ui';
import { toneColor, toneInk } from '../../ui/tones';
import { DishArt } from './art/DishArt';
import type { IconLike } from '../../ui/icon';
import { swatchFor } from './art/foodArt';
import {
  dayActivities,
  dayVerdict,
  fiberReferenceG,
  firstShoppingSafe,
  lowerFirst,
  mealScheduleFor,
  portionShort,
  preShoppingSlots,
  type DayState,
  type FirstShoppingInfo,
  type ActivityKind,
} from './helpers';
import { MenuProposalCard } from './MenuProposalCard';
import { clearedReason, menuSourceInfo } from './menuInfo';
import { SwapSheet } from './SwapSheet';
import type { MenuProposalView } from './useMenuProposal';

const ACT_ICON: Record<ActivityKind, IconLike> = { calcio: BallIcon, palestra: Dumbbell, fisio: Activity };
const SOURCE_ICON: Record<MenuSource, IconLike> = { avvio: Sparkles, rotazione: Layers, approvato: BadgeCheck, ripetuto: Repeat };
const NO_SLOTS = new Set<MealSlot>();

export interface MenuTabProps {
  date: ISODate;
  plan: Plan;
  dayLogs: AppData['dayLogs'];
  /** Apre la scheda Spesa sulla prima spesa (giorni di avvio). */
  onOpenShopping?: () => void;
  /** Proposta aperta del menù di questa settimana (la settimana dopo, dal venerdì): card in cima e punto ambra sui pasti cambiati. */
  proposal?: MenuProposalView | null;
}

/** Voce di un pasto rimasto vuoto per un'esclusione: per scegliere un'altra ricetta dal foglio delle alternative. */
function clearedEntry(slot: MealSlot, removedId: string): MealEntry {
  return { slot, recipeId: '', recipe: undefined, plannedId: '', swapped: false, excludedFrom: removedId };
}

export function MenuTab({ date, plan, dayLogs, onOpenShopping, proposal }: MenuTabProps) {
  // Con controlli e profilo il minimo di carboidrati di partita e vigilia usa il peso recente, come in Oggi;
  // con le revisioni il deficit tiene conto delle correzioni accettate.
  const checkIns = useApp((s) => s.checkIns);
  const profile = useApp((s) => s.profile);
  const reviews = useApp((s) => s.reviews);
  const state = useMemo(
    () => nutritionStateOf({ plan, dayLogs, checkIns, profile, reviews }),
    [plan, dayLogs, checkIns, profile, reviews],
  );
  const meals = useMemo(() => mealsForDate(date, state), [date, state]);
  const detail = useMemo(() => dayNutritionDetail(date, state), [date, state]);
  const schedule = useMemo(() => mealScheduleFor(date, plan), [date, plan]);
  const day = plan.week.find((d) => d.weekday === weekdayOf(date));
  const work = workBlocksFor(date, plan);
  // Porzioni e obiettivi seguono il tipo effettivo (la vigilia mangia da calcio); colori ed etichetta il tipo previsto.
  const dayType = meals.dayType;
  const colorType = meals.scheduledDayType;
  const hasPhysio = useApp((s) => s.physio.exercises.length > 0);
  const acts = dayActivities(day, hasPhysio);
  const [swapSlot, setSwapSlot] = useState<MealSlot | null>(null);
  const cleared = meals.cleared ?? {};
  const swapEntry = swapSlot ? (meals.bySlot[swapSlot] ?? (cleared[swapSlot] ? clearedEntry(swapSlot, cleared[swapSlot] as string) : undefined)) : undefined;
  // Pasti in ordine di giornata, con quelli rimasti vuoti per un'esclusione (§ 6.4: «Scegli tu»).
  const slots = MEAL_SLOTS.filter((sl) => meals.bySlot[sl] || cleared[sl]);
  const source = useMemo(() => menuSourceInfo(meals.source, date, plan), [meals.source, date, plan]);
  // Proposta aperta di questa settimana: i pasti che cambierebbero con il menù nuovo.
  const proposed = proposal?.changed[date];
  const scale = detail.carbScale;
  const factor = totalCarbFactor(dayType, scale);

  // Prima spesa e pasti che la precedono: stesso criterio di Oggi (servono spunte, sedute e riti).
  const shoppingChecked = useApp((s) => s.shoppingChecked);
  const physio = useApp((s) => s.physio);
  const workoutLogs = useApp((s) => s.workoutLogs);
  const prepDone = useApp((s) => s.prepDone);
  const dayState = useMemo<DayState>(
    () => ({ plan, dayLogs, shoppingChecked, physio, workoutLogs, reviews, prepDone }),
    [plan, dayLogs, shoppingChecked, physio, workoutLogs, reviews, prepDone],
  );
  const shop = useMemo(() => (meals.starter ? firstShoppingSafe(dayState) : null), [meals.starter, dayState]);
  const beforeShop = useMemo(() => (meals.starter ? preShoppingSlots(date, dayState) : NO_SLOTS), [meals.starter, date, dayState]);
  // La pillola serve solo quando nel giorno ci sono pasti prima e dopo la spesa; altrimenti lo dice la riga in alto.
  const mixedShop = beforeShop.size > 0 && beforeShop.size < meals.meals.length;
  const sunday = weekdayOf(date) === 6;

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
          {work.length > 0 && (
            <Pill variant="outline" tone="neutral" icon={BriefcaseBusiness}>
              {`Lavoro ${formatWork(work)}`}
            </Pill>
          )}
        </div>
      </header>

      {proposal && <MenuProposalCard view={proposal} />}

      {meals.starter && <StarterNote date={date} shop={shop} onOpenShopping={onOpenShopping} />}

      {slots.length === 0 ? (
        <Card>
          <EmptyState compact icon={UtensilsCrossed} title="Nessun pasto previsto" text="Il menù di questo giorno non è disponibile. Prova un altro giorno." />
        </Card>
      ) : (
        <>
          <DayNutritionCard colorType={colorType} detail={detail} starter={meals.starter} />

          <section className="flex flex-col gap-3" aria-labelledby="settimana-pasti">
            <SectionTitle
              id="settimana-pasti"
              action={
                <Pill tone="neutral" icon={SOURCE_ICON[source.source]}>
                  {source.label}
                </Pill>
              }
              subtitle={
                <PortionNote
                  dayType={dayType}
                  colorType={colorType}
                  factor={factor}
                  matchEve={meals.matchEve}
                  floor={detail.matchCarbs?.extraG ? detail.matchCarbs.gPerKg : undefined}
                />
              }
            >
              Pasti del giorno
            </SectionTitle>
            <ul className="flex flex-col gap-3">
              {slots.map((slot, i) => {
                const m = meals.bySlot[slot];
                const title = (schedule[slot]?.title ?? capitalize(slot)).split(',')[0];
                return (
                  <motion.li key={`${date}-${slot}`} {...staggerItem(i)}>
                    {m ? (
                      <MealCard
                        entry={m}
                        date={date}
                        dayType={dayType}
                        colorType={colorType}
                        scale={scale}
                        title={title}
                        time={schedule[slot]?.time}
                        carry={schedule[slot]?.carry}
                        beforeShop={mixedShop && beforeShop.has(slot)}
                        sunday={sunday}
                        proposed={proposed?.[slot]}
                        onSwap={() => setSwapSlot(slot)}
                      />
                    ) : (
                      <ClearedMealCard
                        slot={slot}
                        scheme={clearedMealDetail(slot, day)}
                        title={title}
                        time={schedule[slot]?.time}
                        reason={clearedReason(cleared[slot], plan, date)}
                        proposed={proposed?.[slot]}
                        onSwap={() => setSwapSlot(slot)}
                      />
                    )}
                  </motion.li>
                );
              })}
            </ul>
            {source.note && <p className="t-footnote px-1 text-ink-3">{source.note}</p>}
          </section>
          <Disclosure variant="inline" tone="quiet" title="Come si misurano le porzioni" className="px-1">
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

/**
 * Perché le porzioni colorate cambiano: di quanto crescono pasta, riso e pane rispetto alla ricetta e, il giorno della
 * partita e la vigilia, il minimo per kg che lo chiede (`floor`, solo quando alza davvero le porzioni). La percentuale
 * è delle porzioni, non dei carboidrati del giorno. È l'unico punto del Menù che lo spiega.
 */
function PortionNote({ dayType, colorType, factor, matchEve, floor }: { dayType: DayType; colorType: DayType; factor: number; matchEve: boolean; floor?: number }) {
  const p = portionShort(dayType, factor, matchEve, floor);
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
 * Giorni di avvio, finché la spesa di avvio non è fatta: una riga con l'orario della spesa e i due collegamenti,
 * la lista e il piano B al bar. Fatta la spesa, la riga sparisce: il menù parla da solo.
 */
function StarterNote({ date, shop, onOpenShopping }: { date: ISODate; shop: FirstShoppingInfo | null; onOpenShopping?: () => void }) {
  const today = usePlanDay();
  // La prima spesa ancora da fare, per i giorni che arrivano fino a lei.
  const ahead = shop && !shop.done && shop.date >= today && shop.date >= date ? shop : null;
  if (!ahead) return null;
  return (
    <Card padding="none" as="section" aria-label="Spesa di avvio">
      <div className="flex items-center gap-1 py-1 pl-4 pr-1">
        <ShoppingBasket aria-hidden size={16} strokeWidth={2.3} className="mr-1.5 shrink-0 text-accent-ink" />
        <p className="t-footnote min-w-0 flex-1 text-ink-2">
          <span className="font-semibold text-ink">Spesa {formatRelativeDay(ahead.date, today)}</span>{' '}
          <span className="whitespace-nowrap">
            alle <span className="t-mono text-[0.75rem] text-ink">{ahead.time}</span>
          </span>
        </p>
        {onOpenShopping && (
          <Button variant="ghost" size="sm" onClick={onOpenShopping} aria-label="Apri la lista della spesa di avvio" className="px-2.5">
            Lista
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => useUi.getState().open({ type: 'barPlanB' })} aria-label="Apri il piano B al bar" className="px-2.5">
          Piano B
        </Button>
      </div>
    </Card>
  );
}

// ───────────────────────── Valori del giorno ─────────────────────────

/**
 * Valori del giorno rispetto all'obiettivo della data. Nei giorni di avvio le fibre salgono per gradi: la barra
 * delle fibre ha la tacca del riferimento di quei giorni (`fiberReferenceG`, circa 28 g su 35), il giudizio si fa su
 * quello e una riga sola lo dice.
 */
function DayNutritionCard({ colorType, detail, starter }: { colorType: DayType; detail: ReturnType<typeof dayNutritionDetail>; starter?: boolean }) {
  // Obiettivo della data: tipo di giorno effettivo più il minimo di carboidrati di partita e vigilia.
  const target = detail.target;
  const t = detail.total;
  const ratio = target.kcal ? t.kcal / target.kcal : 0;
  const fiberRef = fiberReferenceG(target.fiberG, Boolean(starter));
  const ramp = fiberRef < target.fiberG;
  const verdict = dayVerdict(t, target, fiberRef);
  const veg = Math.round(detail.vegPortions * 2) / 2;
  const vegShown = Math.min(7, Math.floor(detail.vegPortions + 0.25));
  const rows = [
    { label: 'Proteine', v: t.proteinG, target: target.proteinG },
    { label: 'Carboidrati', v: t.carbG, target: target.carbG },
    { label: 'Grassi', v: t.fatG, target: target.fatG },
    { label: 'Fibre', v: t.fiberG, target: target.fiberG, marker: ramp && target.fiberG ? fiberRef / target.fiberG : undefined },
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
                <dd className="t-footnote shrink-0 whitespace-nowrap tabular">
                  <span className="font-semibold text-ink">{fmtNumber(Math.round(r.v))}</span>
                  <span className="text-ink-3"> / {fmtNumber(r.target)}&nbsp;g</span>
                </dd>
              </div>
              <ProgressBar
                value={r.target ? r.v / r.target : 0}
                size="xs"
                tone={colorType}
                marker={r.marker}
                label={`${r.label}: ${Math.round(r.v)} su ${r.target} g${r.marker ? `, per ora circa ${fiberRef} g` : ''}`}
              />
            </div>
          ))}
        </dl>
      </div>
      {ramp && (
        <p className="t-caption mt-3 text-ink-3">
          Fibre in aumento graduale: per ora circa {fiberRef}&nbsp;g
          {/* Partita e vigilia: pasta, riso e pane alzati fino a 6 g/kg portano qualche grammo di fibre in più. */}
          {detail.matchCarbs && Math.round(t.fiberG) > fiberRef + 2 ? `, qualcuna in più con i carboidrati della ${detail.matchCarbs.when}` : ''}.
        </p>
      )}
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
    </Card>
  );
}

// ───────────────────────── Menù nuovo e caselle vuote ─────────────────────────

/** Punto ambra con la ricetta del menù nuovo: il pasto cambia se si approva la proposta. */
function ProposedLine({ recipeId }: { recipeId: string }) {
  const name = RECIPES[recipeId]?.name;
  return (
    <span className="t-footnote mt-1.5 flex items-start gap-1.5 text-ink-2">
      <span aria-hidden className="mt-[6px] size-1.5 shrink-0 rounded-full bg-accent" style={{ boxShadow: '0 0 6px var(--accent)' }} />
      <span className="min-w-0">
        Nel menù nuovo: <span className="font-medium text-ink">{name ?? 'un’altra ricetta'}</span>
      </span>
    </span>
  );
}

/**
 * Pasto rimasto vuoto perché la ricetta prevista contiene un alimento escluso e nessuna alternativa ha valori simili
 * (§ 6.4): «Scegli tu» con lo schema del piatto, perché, e due collegamenti, le ricette del pasto e il piano B al bar.
 */
function ClearedMealCard({
  slot,
  scheme: detail,
  title,
  time,
  reason,
  proposed,
  onSwap,
}: {
  slot: MealSlot;
  /** Lo schema del pasto, lo stesso del dettaglio di Oggi (`clearedMealDetail`). */
  scheme: string;
  title: string;
  time?: string;
  reason: string;
  proposed?: string;
  onSwap: () => void;
}) {
  const scheme = detail.replace(/^Scegli tu: /, '');
  return (
    <Card padding="none" as="article" className="overflow-hidden" aria-label={`${title}: scegli tu`}>
      <div className="flex items-start gap-3.5 p-4 pb-3">
        <span
          aria-hidden
          className="grid size-14 shrink-0 place-items-center rounded-[14px] text-ink-3"
          style={{ boxShadow: 'inset 0 0 0 1.5px var(--line-strong)' }}
        >
          <UtensilsCrossed size={22} strokeWidth={2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="t-label truncate text-ink-3">{title}</span>
            {time && <span className="t-mono shrink-0 text-[0.75rem] text-ink-3">{time}</span>}
          </span>
          <span className="t-headline mt-0.5 text-ink">Scegli tu</span>
          <span className="t-footnote mt-1 text-ink-2">{capitalize(scheme)}. {reason}</span>
          {proposed && <ProposedLine recipeId={proposed} />}
        </span>
      </div>
      <div className="-mt-1 flex items-center gap-5 pb-2.5 pl-[86px] pr-4">
        <button
          type="button"
          onClick={onSwap}
          aria-label={`Scegli una ricetta per ${title.toLowerCase()}`}
          className="hit-44 t-footnote inline-flex h-8 items-center gap-1.5 font-semibold text-ink-2 transition-opacity duration-150 active:opacity-60"
        >
          <ArrowLeftRight aria-hidden size={14} strokeWidth={2.4} className="text-accent-ink" />
          Ricette
        </button>
        <button
          type="button"
          onClick={() => useUi.getState().open({ type: 'barPlanB', slot })}
          aria-label={`Piano B al bar per ${title.toLowerCase()}`}
          className="hit-44 t-footnote inline-flex h-8 items-center gap-1.5 font-semibold text-ink-2 transition-opacity duration-150 active:opacity-60"
        >
          <Store aria-hidden size={14} strokeWidth={2.4} className="text-accent-ink" />
          Piano B
        </button>
      </div>
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
  /** Il pasto cade durante il lavoro: da portare. */
  carry?: boolean;
  /** Pasto prima della prima spesa: gli ingredienti non ci sono ancora. */
  beforeShop?: boolean;
  /** Il giorno mostrato è domenica: la parte da preparazione viene da quella di oggi. */
  sunday?: boolean;
  /** Ricetta del menù nuovo per questo pasto, con una proposta aperta che lo cambia (punto ambra). */
  proposed?: string;
  onSwap: () => void;
}

const SPICE_MAX_G = 6;

/** La porzione mostrata cambia rispetto a quella della ricetta (giorno di palestra, obiettivi predefiniti)? */
function portionChanged(line: IngredientLine, dayType: DayType, scale: number): boolean {
  if (!line.carbScaled) return false;
  return portionParts(line, dayType, FOODS, scale).portion !== portionParts(line, 'palestra', FOODS, 1).portion;
}

function MealCard({ entry, date, dayType, colorType, scale, title, time, carry, beforeShop, sunday, proposed, onSwap }: MealCardProps) {
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

  const openRecipe = () => useUi.getState().open({ type: 'recipe', recipeId: entry.recipeId, date, slot: entry.slot });
  const toggle = () => {
    haptic('selection');
    setOpen((v) => !v);
  };

  return (
    <Card padding="none" as="article" className="overflow-hidden" aria-label={`${title}: ${recipe.name}`}>
      <Pressable
        onPress={openRecipe}
        pressScale={0.985}
        className="flex w-full items-center gap-3.5 p-4 pb-3.5"
        aria-label={`${title}, ${recipe.name}${carry ? ', da portare al lavoro' : ''}${entry.swapped ? ', cambiato' : beforeShop ? ', dopo la spesa' : ''}${proposed ? `, nel menù nuovo ${RECIPES[proposed]?.name ?? 'un’altra ricetta'}` : ''}. Apri la ricetta`}
      >
        <span className="relative size-14 shrink-0 self-start">
          <DishArt recipe={recipe} dayType={colorType} variant="thumb" className="size-full" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="t-label truncate text-ink-3">{title}</span>
            {time && <span className="t-mono shrink-0 text-[0.75rem] text-ink-3">{time}</span>}
            {carry && <span className="t-caption shrink-0 font-semibold text-ink-2">Da portare</span>}
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
          {/* Le porzioni cambiate per il tipo di giorno, a parole: i grammi sono negli ingredienti e nella ricetta. A pezzi
              la porzione nomina già l'alimento ("7 gallette di riso"), mai "7 gallette di gallette di riso". */}
          {!open && changed.length > 0 && (
            <span className="mt-1.5 flex flex-col gap-0.5">
              {changed.map(({ l, idx, food, p }) => (
                <span key={`${l.foodId}-${idx}`} className="t-footnote text-pretty text-ink-2">
                  {p.named ? (
                    <span className="font-semibold" style={{ color: toneInk(colorType) }}>
                      {p.named}
                    </span>
                  ) : (
                    <>
                      <span className="font-semibold" style={{ color: toneInk(colorType) }}>
                        {p.portion}
                      </span>{' '}
                      di {food ? lowerFirst(shopName(food)) : l.foodId}
                    </>
                  )}
                </span>
              ))}
            </span>
          )}
          {proposed && <ProposedLine recipeId={proposed} />}
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
                  {sunday ? 'Dalla preparazione di oggi' : 'Pronta dalla domenica'}
                </span>
              )}
            </span>
          )}
        </span>
      </Pressable>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            key="righe"
            id={listId}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line"
            aria-label="Ingredienti"
          >
            <li className="h-2" aria-hidden />
            <AnimatePresence initial={false}>
              {main.map(({ l, idx, food, p, changed: isChanged }) => {
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
            {spices.length > 0 && <li className="t-caption mx-4 pt-1 text-ink-3">Per insaporire: {spices.join(', ')}</li>}
            <li className="h-2" aria-hidden />
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Due collegamenti quieti allineati al testo, senza una fascia divisa: la card resta il pasto, non una barra di comandi. */}
      <div className={cn('flex items-center gap-5 pb-2.5 pl-[86px] pr-4', open ? 'pt-1' : '-mt-1.5')}>
        <button
          type="button"
          onClick={onSwap}
          aria-label={`Cambia ${title.toLowerCase()}`}
          className="hit-44 t-footnote inline-flex h-8 items-center gap-1.5 font-semibold text-ink-2 transition-opacity duration-150 active:opacity-60"
        >
          <ArrowLeftRight aria-hidden size={14} strokeWidth={2.4} className="text-accent-ink" />
          Cambia
        </button>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className="hit-44 t-footnote inline-flex h-8 items-center gap-1 font-medium text-ink-2 transition-opacity duration-150 active:opacity-60"
        >
          {recipe.ingredients.length} ingredienti
          <motion.span aria-hidden className="inline-flex" animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}>
            <ChevronDown size={15} strokeWidth={2.4} />
          </motion.span>
        </button>
      </div>
    </Card>
  );
}
