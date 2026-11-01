/**
 * Ricetta in un foglio dal basso: illustrazione del piatto generata dagli ingredienti, valori stimati
 * per il tipo di giorno, ingredienti con porzione a mano e grammi, passaggi numerati e alternative.
 * Un'alternativa si può guardare prima di sceglierla: in fondo compare "Usa questa al posto di…".
 * Contratto dell'host dei pannelli: `{ recipeId, date, slot?, onClose }`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeftRight, ChefHat, Clock, Undo2, UtensilsCrossed } from 'lucide-react';
import type { DayType, ISODate, MealSlot, PortionUnit, Recipe } from '../../domain/types';
import { FOODS } from '../../data/foods';
import { RECIPES } from '../../data/recipes';
import { formatRelativeDay, weekdayOf } from '../../engine/dates';
import { mealsForDate, swapOptions } from '../../engine/menu';
import { dayCarbScale, dayTargetFor, matchCarbs, portionParts, recipeNutrition, recipeVegPortions, totalCarbFactor } from '../../engine/nutrition';
import { foodState, shopName } from '../../engine/shopping';
import { capitalize, fmtNumber, fmtPercent, listIt } from '../../lib/format';
import { useApp } from '../../state/store';
import { useNutritionState, usePlanDay } from '../../state/hooks';
import { Button, Card, DayTypeBadge, Disclosure, EmptyState, Pill, Pressable, SectionTitle, Sheet } from '../../ui';
import { toneInk, toneRing } from '../../ui/tones';
import { DishArt } from './art/DishArt';
import { swatchFor } from './art/foodArt';
import { mealScheduleFor, portionShort } from './helpers';
import { applySwap } from './SwapSheet';

export interface RecipeSheetProps {
  recipeId: string;
  date: ISODate;
  slot?: MealSlot;
  onClose: () => void;
}

const HAND_HELP: Partial<Record<PortionUnit, string>> = {
  palmo: 'il palmo è larghezza e spessore della mano, dita escluse',
  pugno: 'il pugno è la mano chiusa',
  'mano a coppa': 'la mano a coppa è quanto sta in una mano raccolta',
  pollice: 'il pollice va dalla punta alla prima piega',
  manciata: 'la manciata è quanto prendi con le dita',
  cucchiaio: 'cucchiai e cucchiaini sono rasi',
  cucchiaino: 'cucchiai e cucchiaini sono rasi',
};

const DAY_PHRASE: Record<DayType, string> = { calcio: 'di calcio', palestra: 'di palestra', leggero: 'leggero', riposo: 'di riposo' };

export default function RecipeSheet({ recipeId, date, slot, onClose }: RecipeSheetProps) {
  const plan = useApp((s) => s.plan);
  const dayLogs = useApp((s) => s.dayLogs);
  // Con controlli e profilo: porzioni e obiettivo di partita e vigilia dal peso recente, come in Oggi e nel menù.
  const nutrition = useNutritionState();
  const today = usePlanDay();
  const reduce = useReducedMotion();
  const [viewId, setViewId] = useState(recipeId);
  const topRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  const meals = useMemo(() => mealsForDate(date, { plan, dayLogs }), [date, plan, dayLogs]);
  const slotEff: MealSlot | undefined = slot ?? meals.meals.find((m) => m.recipeId === recipeId)?.slot ?? RECIPES[recipeId]?.slots[0];
  const entry = slotEff ? meals.bySlot[slotEff] : undefined;
  const currentId = entry?.recipeId;
  const current = currentId ? RECIPES[currentId] : undefined;
  const recipe: Recipe | undefined = RECIPES[viewId];
  const dayType = meals.dayType;
  // Colori ed etichetta seguono il tipo previsto; porzioni e valori il tipo effettivo (vigilia = calcio).
  const colorType = meals.scheduledDayType;
  const scale = useMemo(() => dayCarbScale(date, nutrition), [date, nutrition]);
  const targetKcal = useMemo(() => dayTargetFor(date, nutrition)?.kcal ?? 0, [date, nutrition]);
  // Partita e vigilia: il minimo per kg, solo quando alza davvero le porzioni (come nel Menù).
  const floor = useMemo(() => {
    const m = matchCarbs(date, nutrition);
    return m?.extraG ? m.gPerKg : undefined;
  }, [date, nutrition]);
  const schedule = mealScheduleFor(date, plan);
  const slotTitle = slotEff ? schedule[slotEff]?.title : undefined;
  const previewing = Boolean(slotEff && currentId && viewId !== currentId);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    topRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [viewId, reduce]);

  const subtitle = [slotTitle, capitalize(formatRelativeDay(date, today))].filter(Boolean).join(' · ');

  if (!recipe) {
    return (
      <Sheet open onClose={onClose} title="Ricetta non trovata">
        <EmptyState
          icon={UtensilsCrossed}
          title="Questa ricetta non c’è più"
          text="Potrebbe essere stata tolta dal menù. Scegline un’altra dalla schermata Settimana."
          action={
            <Button variant="secondary" onClick={onClose}>
              Chiudi
            </Button>
          }
        />
      </Sheet>
    );
  }

  const useThis = () => {
    if (!slotEff || !entry) return;
    applySwap(date, slotEff, entry, viewId);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      size="large"
      title={recipe.name}
      subtitle={subtitle}
      footer={
        previewing && current ? (
          <div className="flex flex-col gap-2">
            <p className="t-footnote truncate text-ink-2">
              Al posto di <span className="font-semibold text-ink">{current.name}</span>
            </p>
            <Button fullWidth size="lg" icon={ArrowLeftRight} onClick={useThis}>
              Usa questa
            </Button>
          </div>
        ) : undefined
      }
    >
      <div ref={topRef} className="scroll-mt-4" />
      <motion.div
        key={viewId}
        initial={first.current ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-6 pb-4"
      >
        {previewing && current && (
          <div className="flex items-center gap-3 rounded-[16px] bg-card p-3" style={{ boxShadow: toneRing('accent', 40) }}>
            <span className="t-footnote min-w-0 flex-1 text-ink-2">Stai guardando un’alternativa.</span>
            <Button variant="ghost" size="sm" icon={Undo2} onClick={() => setViewId(current.id)} className="-my-1 -mr-1.5">
              Torna alla ricetta
            </Button>
          </div>
        )}

        <Hero recipe={recipe} dayType={colorType} label={meals.matchEve ? 'Vigilia della partita' : undefined} sunday={weekdayOf(date) === 6} />
        <Values recipe={recipe} dayType={dayType} scale={scale} targetKcal={targetKcal} />
        <Ingredients recipe={recipe} dayType={dayType} colorType={colorType} scale={scale} matchEve={meals.matchEve} floor={floor} />
        <Steps recipe={recipe} />
        {slotEff && entry && (
          <Alternatives
            slot={slotEff}
            dayType={dayType}
            scale={scale}
            viewId={viewId}
            currentId={entry.recipeId}
            plannedId={entry.plannedId}
            onPreview={setViewId}
            onUse={(id) => {
              applySwap(date, slotEff, entry, id);
              setViewId(id);
            }}
          />
        )}
      </motion.div>
    </Sheet>
  );
}

// ───────────────────────── Parti ─────────────────────────

function Hero({ recipe, dayType, label, sunday }: { recipe: Recipe; dayType: DayType; label?: string; sunday?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-card shadow-card">
      <DishArt recipe={recipe} dayType={dayType} variant="hero" className="aspect-[360/220] w-full" />
      <div className="pointer-events-none absolute left-3 top-3">
        <DayTypeBadge dayType={dayType} variant="solid" label={label} />
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap gap-1.5">
        <span className="glass t-footnote inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--bar-line)] px-2.5 font-semibold text-ink">
          <Clock aria-hidden size={14} strokeWidth={2.4} />
          {recipe.prepMin} min
        </span>
        {recipe.batch && (
          <span className="glass t-footnote inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--bar-line)] px-2.5 font-semibold text-ink">
            <ChefHat aria-hidden size={14} strokeWidth={2.4} />
            {sunday ? 'Dalla preparazione di oggi' : 'Pronta dalla domenica'}
          </span>
        )}
      </div>
    </div>
  );
}

function Values({ recipe, dayType, scale, targetKcal }: { recipe: Recipe; dayType: DayType; scale: number; targetKcal: number }) {
  const n = recipeNutrition(recipe, dayType, FOODS, scale);
  const veg = recipeVegPortions(recipe, dayType, FOODS, scale);
  const macros = [
    { label: 'proteine', v: n.proteinG },
    { label: 'carboidrati', v: n.carbG },
    { label: 'grassi', v: n.fatG },
    { label: 'fibre', v: n.fiberG },
  ];
  const vegR = Math.round(veg * 2) / 2;
  return (
    <Card padding="none" as="section" aria-label="Valori stimati" className="overflow-hidden">
      <div className="flex items-end justify-between gap-4 p-4 pb-3.5">
        <div className="min-w-0">
          <p className="t-label text-ink-3">Valori stimati</p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="t-num text-[2.5rem] leading-none text-ink">{fmtNumber(Math.round(n.kcal))}</span>
            <span className="t-unit text-[0.875rem] text-ink-2">kcal</span>
          </p>
          {targetKcal > 0 && <p className="t-footnote mt-1 text-ink-2">{fmtPercent(n.kcal / targetKcal)} della giornata</p>}
        </div>
        {vegR > 0 && (
          <div className="flex shrink-0 flex-col items-end text-right">
            <span className="t-num text-[1.75rem] leading-none" style={{ color: 'var(--good-ink)' }}>
              {fmtNumber(vegR, 1)}
            </span>
            <span className="t-caption mt-1 max-w-[7.5rem] text-ink-2">{vegR === 1 ? 'porzione' : 'porzioni'} di frutta e verdura</span>
          </div>
        )}
      </div>
      <dl className="grid grid-cols-4 border-t border-line">
        {macros.map((m, i) => (
          <div key={m.label} className={i > 0 ? 'flex flex-col-reverse items-center gap-0.5 border-l border-line py-3' : 'flex flex-col-reverse items-center gap-0.5 py-3'}>
            <dt className="t-caption text-ink-3">{m.label}</dt>
            <dd className="flex items-baseline gap-0.5">
              <span className="t-num text-[1.375rem] leading-none text-ink">{fmtNumber(Math.round(m.v))}</span>
              <span className="t-unit text-ink-3">g</span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Ingredients({
  recipe,
  dayType,
  colorType,
  scale,
  matchEve,
  floor,
}: {
  recipe: Recipe;
  dayType: DayType;
  colorType: DayType;
  scale: number;
  matchEve: boolean;
  /** Minimo di carboidrati per kg di partita e vigilia, quando alza le porzioni. */
  floor?: number;
}) {
  const factor = totalCarbFactor(dayType, scale);
  const units = [...new Set(recipe.ingredients.map((l) => HAND_HELP[l.unit]).filter((x): x is string => Boolean(x)))];
  const hasScaled = recipe.ingredients.some((l) => l.carbScaled) && factor !== 1;
  // Nomina le righe che cambiano in questa ricetta ("Riso basmati +65%…"), non i carboidrati del giorno.
  const scaledNames = [...new Set(recipe.ingredients.filter((l) => l.carbScaled).map((l) => (FOODS[l.foodId] ? shopName(FOODS[l.foodId]) : l.foodId)))];
  const sentence = hasScaled ? portionShort(dayType, factor, matchEve, floor, scaledNames) : null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="ricetta-ingredienti">
      <SectionTitle
        id="ricetta-ingredienti"
        subtitle={
          sentence ? (
            <>
              {sentence.lead}
              <span className="font-semibold" style={{ color: toneInk(colorType) }}>
                {sentence.pct}
              </span>
              {sentence.tail}
            </>
          ) : (
            `Porzioni per ${matchEve ? 'la vigilia della partita' : `un giorno ${DAY_PHRASE[dayType]}`}.`
          )
        }
      >
        Ingredienti
      </SectionTitle>
      <Card padding="none">
        <ul>
          {recipe.ingredients.map((l, i) => {
            const food = FOODS[l.foodId];
            const p = portionParts(l, dayType, FOODS, scale);
            const scaled = l.carbScaled && factor !== 1;
            const hand = l.unit !== 'g' && l.unit !== 'ml';
            const detail = [food ? foodState(food) : undefined, l.note].filter(Boolean).join(' · ');
            return (
              <li key={`${l.foodId}-${i}`} className={i > 0 ? 'relative before:absolute before:left-11 before:right-0 before:top-0 before:h-px before:bg-line' : undefined}>
                <div className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
                  <span aria-hidden className="relative grid size-4 shrink-0 place-items-center">
                    <span
                      className="size-3 rounded-full"
                      style={{ background: swatchFor(l.foodId, food), boxShadow: '0 0 0 3px var(--ink-soft), inset 0 0 0 1px color-mix(in srgb, var(--ink) 14%, transparent)' }}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="t-callout font-medium text-ink">{food ? shopName(food) : l.foodId}</span>
                    {detail && <span className="t-footnote text-ink-3">{detail}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end text-right">
                    <span className="t-callout font-semibold" style={{ color: scaled ? toneInk(colorType) : 'var(--ink)' }}>
                      {p.portion}
                    </span>
                    {hand && p.grams > 0 && <span className="t-caption tabular text-ink-3">≈&nbsp;{p.grams}&nbsp;g</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      {units.length > 0 && (
        <Disclosure variant="inline" tone="quiet" title="Come misurare a occhio" className="px-1">
          Con la tua mano: {listIt(units)}. I grammi accanto servono a controllare con la bilancia le prime volte.
        </Disclosure>
      )}
    </section>
  );
}

function Steps({ recipe }: { recipe: Recipe }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="ricetta-passaggi">
      <SectionTitle id="ricetta-passaggi">
        Passaggi
      </SectionTitle>
      <Card padding="lg">
        <ol className="flex flex-col gap-4">
          {recipe.steps.map((s, i) => (
            <li key={i} className="flex gap-3.5">
              <span aria-hidden className="t-num grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[0.9375rem] leading-none text-accent-ink">
                {i + 1}
              </span>
              <p className="t-body selectable pt-0.5 text-ink">
                <span className="sr-only">Passaggio {i + 1}: </span>
                {s}
              </p>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}

/** Alternative in vista prima di "Tutte". */
const ALT_SHOWN = 3;

function Alternatives({
  slot,
  dayType,
  scale,
  viewId,
  currentId,
  plannedId,
  onPreview,
  onUse,
}: {
  slot: MealSlot;
  dayType: DayType;
  scale: number;
  viewId: string;
  currentId: string;
  plannedId: string;
  onPreview: (id: string) => void;
  onUse: (id: string) => void;
}) {
  const ids: string[] = [];
  const push = (id: string | undefined) => {
    if (id && RECIPES[id] && !ids.includes(id)) ids.push(id);
  };
  push(currentId);
  push(plannedId);
  for (const r of swapOptions(plannedId || currentId, slot, 6)) push(r.id);
  const [all, setAll] = useState(false);
  const full = ids.filter((id) => id !== viewId).slice(0, 6);
  // Tre bastano per scegliere: le altre dietro un tocco.
  const list = all ? full : full.slice(0, ALT_SHOWN);
  if (!full.length) return null;
  const view = recipeNutrition(RECIPES[viewId], dayType, FOODS, scale);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="ricetta-alternative">
      <SectionTitle
        id="ricetta-alternative"
        action={full.length > ALT_SHOWN ? { label: all ? 'Meno' : `Tutte (${full.length})`, onPress: () => setAll((v) => !v) } : undefined}
      >
        Alternative
      </SectionTitle>
      <Card padding="none">
        <ul>
          {list.map((id, i) => {
            const r = RECIPES[id];
            const n = recipeNutrition(r, dayType, FOODS, scale);
            const dk = Math.round(n.kcal - view.kcal);
            const isCurrent = id === currentId;
            return (
              <li key={id} className={i > 0 ? 'relative before:absolute before:left-[76px] before:right-0 before:top-0 before:h-px before:bg-line' : undefined}>
                <div className="flex items-center gap-2 pr-3">
                  <Pressable onPress={() => onPreview(id)} pressScale={0.985} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3" aria-label={`Guarda la ricetta: ${r.name}`}>
                    <DishArt recipe={r} dayType={dayType} variant="thumb" className="size-[52px] shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="t-callout font-medium text-ink">{r.name}</span>
                      <span className="t-footnote text-ink-2">
                        <span className="tabular">{fmtNumber(Math.round(n.kcal))} kcal</span>
                        {Math.abs(dk) >= 15 && (
                          <span className="t-caption tabular text-ink-3">
                            {' '}
                            {dk > 0 ? '+' : '−'}
                            {fmtNumber(Math.abs(dk))}
                          </span>
                        )}
                      </span>
                      <span className="t-footnote text-ink-2">
                        <span className="tabular">{fmtNumber(Math.round(n.proteinG))}</span> g di proteine
                      </span>
                    </span>
                  </Pressable>
                  {isCurrent ? (
                    <Pill tone="good" size="sm">
                      Nel menù
                    </Pill>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => onUse(id)} aria-label={`Usa questa: ${r.name}`}>
                      Usa questa
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
