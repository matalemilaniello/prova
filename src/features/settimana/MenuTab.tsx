/**
 * Scheda Menù: il giorno scelto con i valori stimati rispetto all'obiettivo e i 5 pasti, ciascuno con
 * l'illustrazione del piatto, le porzioni a occhio adattate al tipo di giorno e la sostituzione.
 */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, ArrowLeftRight, ChefHat, ChevronRight, Dumbbell, Undo2, UtensilsCrossed } from 'lucide-react';
import type { DayType, ISODate, MealSlot, Plan, AppData } from '../../domain/types';
import { FOODS } from '../../data/foods';
import { formatDayLong, weekdayOf } from '../../engine/dates';
import { mealsForDate, type MealEntry } from '../../engine/menu';
import { carbFactor, dayNutritionDetail, portionParts, recipeNutrition } from '../../engine/nutrition';
import { foodState, shopName } from '../../engine/shopping';
import { capitalize, fmtNumber } from '../../lib/format';
import { useApp, useUi } from '../../state/store';
import { Button, Card, DayTypeBadge, EmptyState, NumberTicker, Pill, Pressable, ProgressBar, ProgressRing, SectionTitle, staggerItem } from '../../ui';
import { toneColor, toneInk } from '../../ui/tones';
import { DishArt } from './art/DishArt';
import { BallIcon } from './BallIcon';
import type { IconLike } from '../../ui/icon';
import { swatchFor } from './art/foodArt';
import { dayActivities, mealScheduleFor, type ActivityKind } from './helpers';
import { SwapSheet } from './SwapSheet';

const ACT_ICON: Record<ActivityKind, IconLike> = { calcio: BallIcon, palestra: Dumbbell, fisio: Activity };

export interface MenuTabProps {
  date: ISODate;
  plan: Plan;
  dayLogs: AppData['dayLogs'];
}

export function MenuTab({ date, plan, dayLogs }: MenuTabProps) {
  const state = useMemo(() => ({ plan, dayLogs }), [plan, dayLogs]);
  const meals = useMemo(() => mealsForDate(date, state), [date, state]);
  const detail = useMemo(() => dayNutritionDetail(date, state), [date, state]);
  const schedule = useMemo(() => mealScheduleFor(date, plan), [date, plan]);
  const day = plan.week.find((d) => d.weekday === weekdayOf(date));
  const dayType = meals.dayType;
  const acts = dayActivities(day);
  const [swapSlot, setSwapSlot] = useState<MealSlot | null>(null);
  const swapEntry = swapSlot ? meals.bySlot[swapSlot] : undefined;
  const factor = carbFactor(dayType);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2.5 px-1">
        <h2 className="t-title text-ink">{capitalize(formatDayLong(date))}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <DayTypeBadge dayType={dayType} />
          {acts.map((a) => (
            <Pill key={a.kind} variant="outline" tone="neutral" icon={ACT_ICON[a.kind]}>
              {a.label}
            </Pill>
          ))}
        </div>
      </header>

      {meals.meals.length === 0 ? (
        <Card>
          <EmptyState compact icon={UtensilsCrossed} title="Nessun pasto previsto" text="Il menù di questo giorno non è disponibile. Prova un altro giorno." />
        </Card>
      ) : (
        <>
          <DayNutritionCard dayType={dayType} plan={plan} detail={detail} />

          <section className="flex flex-col gap-3" aria-labelledby="settimana-pasti">
            <SectionTitle
              id="settimana-pasti"
              subtitle={
                factor !== 1 ? (
                  <>
                    Porzioni per un giorno {dayTypePhrase(dayType)}: carboidrati{' '}
                    <span style={{ color: toneInk(dayType) }} className="font-semibold">
                      {factor > 1 ? '+' : '−'}
                      {fmtNumber(Math.abs(factor - 1) * 100)}%
                    </span>
                    , in colore nelle porzioni.
                  </>
                ) : (
                  'Porzioni di riferimento, per un giorno di palestra.'
                )
              }
            >
              Pasti del giorno
            </SectionTitle>
            <ul className="flex flex-col gap-3">
              {meals.meals.map((m, i) => (
                <motion.li key={`${date}-${m.slot}`} {...staggerItem(i)}>
                  <MealCard
                    entry={m}
                    date={date}
                    dayType={dayType}
                    title={schedule[m.slot]?.title ?? capitalize(m.slot)}
                    time={schedule[m.slot]?.time}
                    onSwap={() => setSwapSlot(m.slot)}
                  />
                </motion.li>
              ))}
            </ul>
          </section>
          <p className="t-footnote px-1 text-ink-3">
            Palmo, pugno e mano a coppa sono quelli della tua mano: crescono con te. Valori stimati dalle tabelle CREA e USDA.
          </p>
        </>
      )}

      {swapEntry && swapSlot && (
        <SwapSheet open onClose={() => setSwapSlot(null)} date={date} slot={swapSlot} entry={swapEntry} dayType={dayType} title={schedule[swapSlot]?.title} />
      )}
    </div>
  );
}

function dayTypePhrase(t: DayType): string {
  return t === 'calcio' ? 'di calcio' : t === 'palestra' ? 'di palestra' : t === 'leggero' ? 'leggero' : 'di riposo';
}

// ───────────────────────── Valori del giorno ─────────────────────────

function DayNutritionCard({ dayType, plan, detail }: { dayType: DayType; plan: Plan; detail: ReturnType<typeof dayNutritionDetail> }) {
  const target = plan.targets[dayType];
  const t = detail.total;
  const ratio = target.kcal ? t.kcal / target.kcal : 0;
  const diff = ratio - 1;
  const inLine = Math.abs(diff) <= 0.08;
  const veg = Math.round(detail.vegPortions * 2) / 2;
  const vegShown = Math.min(7, Math.floor(detail.vegPortions + 0.25));
  const rows = [
    { label: 'Proteine', v: t.proteinG, target: target.proteinG },
    { label: 'Carboidrati', v: t.carbG, target: target.carbG },
    { label: 'Grassi', v: t.fatG, target: target.fatG },
    { label: 'Fibre', v: t.fiberG, target: target.fiberG },
  ];
  return (
    <Card variant="highlight" tone={dayType} padding="lg" as="section" aria-label="Valori stimati del giorno">
      <div className="flex items-center justify-between gap-3">
        <span className="t-label text-ink-3">Stima dal menù</span>
        <Pill tone={inLine ? 'good' : 'warn'} dot>
          {inLine ? 'In linea con l’obiettivo' : `${diff > 0 ? '+' : '−'}${fmtNumber(Math.abs(diff) * 100)}% sull’obiettivo`}
        </Pill>
      </div>
      <div className="mt-4 flex items-center gap-5">
        <ProgressRing
          value={ratio}
          size={118}
          stroke={10}
          tone={dayType}
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
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <dt className="t-footnote text-ink-2">{r.label}</dt>
                <dd className="t-mono ml-auto whitespace-nowrap text-[0.75rem]">
                  <span className="font-medium text-ink">{fmtNumber(Math.round(r.v))}</span>
                  <span className="text-ink-3"> / {fmtNumber(r.target)}&nbsp;g</span>
                </dd>
              </div>
              <ProgressBar value={r.target ? r.v / r.target : 0} size="xs" tone={dayType} label={`${r.label}: ${Math.round(r.v)} su ${r.target} g`} />
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
    </Card>
  );
}

// ───────────────────────── Card del pasto ─────────────────────────

interface MealCardProps {
  entry: MealEntry;
  date: ISODate;
  dayType: DayType;
  title: string;
  time?: string;
  onSwap: () => void;
}

const SPICE_MAX_G = 6;

function MealCard({ entry, date, dayType, title, time, onSwap }: MealCardProps) {
  const recipe = entry.recipe;
  const swapRecipe = useApp((s) => s.swapRecipe);
  const toast = useUi((s) => s.toast);
  const n = useMemo(() => recipeNutrition(recipe, dayType), [recipe, dayType]);
  const factor = carbFactor(dayType);

  if (!recipe) {
    return (
      <Card>
        <EmptyState compact icon={UtensilsCrossed} title="Ricetta non trovata" text="Cambiala con un’alternativa." action={<Button size="sm" variant="secondary" icon={ArrowLeftRight} onClick={onSwap}>Cambia</Button>} />
      </Card>
    );
  }

  const lines = recipe.ingredients.map((l) => {
    const food = FOODS[l.foodId];
    const p = portionParts(l, dayType);
    return { l, food, p, spice: Boolean(food?.pantry) && p.grams < SPICE_MAX_G && l.foodId !== 'olio-evo' };
  });
  const main = lines.filter((x) => !x.spice);
  const spices = lines.filter((x) => x.spice).map((x) => (x.food ? shopName(x.food).toLowerCase() : x.l.foodId));

  const open = () => useUi.getState().open({ type: 'recipe', recipeId: entry.recipeId, date, slot: entry.slot });
  const restore = () => {
    const prev = entry.recipeId;
    swapRecipe(date, entry.slot, null);
    toast('Torna la ricetta del menù', 'neutral', { actionLabel: 'Annulla', onAction: () => swapRecipe(date, entry.slot, prev) });
  };

  return (
    <Card padding="none" as="article" className="overflow-hidden" aria-label={`${title}: ${recipe.name}`}>
      <Pressable onPress={open} pressScale={0.985} className="flex w-full items-start gap-3.5 p-4 pb-3" aria-label={`${title}, ${recipe.name}. Apri la ricetta`}>
        <span className="relative size-[68px] shrink-0">
          <DishArt recipe={recipe} dayType={dayType} variant="thumb" className="size-full" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col pt-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="t-label truncate text-ink-3">{title}</span>
            {time && <span className="t-mono shrink-0 text-[0.75rem] text-ink-3">{time}</span>}
            {entry.swapped && (
              <Pill tone="accent" size="sm" className="ml-auto">
                Cambiato
              </Pill>
            )}
          </span>
          <span className="t-headline mt-1 text-ink">{recipe.name}</span>
          <span className="t-footnote mt-1.5 text-ink-2">
            <span className="font-semibold text-ink tabular">{fmtNumber(Math.round(n.kcal))}</span> kcal
            <span aria-hidden className="text-ink-3"> · </span>
            <span className="font-semibold text-ink tabular">{fmtNumber(Math.round(n.proteinG))}</span> g proteine
            <span aria-hidden className="text-ink-3"> · </span>
            <span className="whitespace-nowrap">{recipe.prepMin} min</span>
          </span>
        </span>
        <ChevronRight aria-hidden size={18} strokeWidth={2.2} className="mt-6 shrink-0 text-ink-3" />
      </Pressable>

      <ul className="mx-4 flex flex-col border-t border-line py-2" aria-label="Porzioni">
        {main.map(({ l, food, p }, i) => {
          const name = food ? shopName(food) : l.foodId;
          const state = food ? foodState(food) : undefined;
          const scaled = l.carbScaled && factor !== 1;
          const showPortion = l.unit !== 'g' && l.unit !== 'ml';
          return (
            <li key={`${l.foodId}-${i}`} className="flex min-h-7 items-baseline gap-2.5 py-1">
              <span
                aria-hidden
                className="mt-[5px] size-2 shrink-0 self-start rounded-full"
                style={{ background: swatchFor(l.foodId, food), boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ink) 14%, transparent)' }}
              />
              <span className="t-footnote min-w-0 flex-1 text-ink">
                {name}
                {state && <span className="text-ink-3"> {state}</span>}
              </span>
              {showPortion && (
                <span className="t-footnote shrink-0 whitespace-nowrap text-right font-medium" style={{ color: scaled ? toneInk(dayType) : 'var(--ink-2)' }}>
                  {p.portion}
                </span>
              )}
              <span
                className="t-mono w-[3.75rem] shrink-0 text-right text-[0.75rem]"
                style={{ color: scaled && !showPortion ? toneInk(dayType) : 'var(--ink-3)' }}
              >
                {p.grams ? `≈ ${p.grams} g` : ''}
              </span>
            </li>
          );
        })}
        {spices.length > 0 && (
          <li className="t-caption pt-1 text-ink-3">
            Per insaporire: {spices.join(', ')}
          </li>
        )}
      </ul>

      <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
        <Button variant="ghost" size="sm" icon={ArrowLeftRight} onClick={onSwap}>
          Cambia
        </Button>
        {entry.swapped && (
          <Button variant="ghost" size="sm" icon={Undo2} onClick={restore}>
            Torna al menù
          </Button>
        )}
        <span className="flex-1" />
        {recipe.batch && (
          <span className="t-caption inline-flex items-center gap-1 pr-2 text-ink-3">
            <ChefHat aria-hidden size={13} strokeWidth={2.2} />
            Pronta dalla domenica
          </span>
        )}
      </div>
    </Card>
  );
}

