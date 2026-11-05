/**
 * Prevenzione oncologica come regola di base (docs/FASE2.md § 4.1-4.3, § 4.7): i numeri di un insieme di pasti, ridotti
 * ai loro alimenti con i grammi, letti dai fatti degli alimenti (`factsOf`, data/foodFacts.ts). Funzioni pure: niente
 * orologio, niente stato. Le usano le alternative e le sostituzioni (tetti della settimana, § 6.1), le misure della
 * revisione (§ 4.7, engine/review.ts) e il validatore del menù generato (onda 2A).
 *
 * Un pasto del menù conta per gli ingredienti della ricetta alla porzione del giorno (`mealFromRecipe`); un pasto stimato
 * da foto o da un piatto salvato per i suoi alimenti (`mealFromEaten`); un ordine del bar senza alimenti non conta.
 */
import type { DayType, EatenMeal, Food, ISODate, MealSlot, Recipe } from '../domain/types';
import type { FoodFacts } from '../data/foodFactsTypes';
import { FOODS } from '../data/foods';
import { ESTIMATE_FOODS } from '../data/estimateFoods';
import { factsOf } from '../data/foodFacts';
import { lineGrams } from './nutrition';

// ───────────────────────── Riferimenti ─────────────────────────

/** A4: carne rossa nel menù, al massimo una porzione e 150 g cotti a settimana (WCRF; un terzo del tetto, § 4.2). */
export const RED_MEAT_MAX_MEALS = 1;
export const RED_MEAT_MAX_G = 150;
/** B1: carne rossa in tutto, pasti fuori compresi: circa 350 g cotti a settimana, mai oltre 500 (WCRF). */
export const RED_MEAT_WEEK_G = 350;
export const RED_MEAT_WEEK_MAX_G = 500;
/** Una porzione di carne rossa fuori casa, cotta (§ 4.7: di solito 150-250 g, si conta il minimo) [stima]. */
export const OUTSIDE_RED_MEAT_PORTION_G = 150;
/** A5: riso al massimo 3 pasti a settimana (EFSA 2024). */
export const RICE_MAX_MEALS = 3;
/** A8: legumi in almeno 4 pasti principali a settimana, al massimo una porzione al giorno (CREA 2018). */
export const MIN_LEGUME_MEALS = 4;
export const LEGUME_SERVINGS_MAX_PER_DAY = 1;
/** Grammi di legumi (cotti o sgocciolati) oltre i quali un pranzo o una cena è un piatto di legumi (test del menù). */
export const LEGUME_MEAL_G = 100;
/** Grammi di legumi equivalenti cotti oltre i quali un pasto qualsiasi porta una porzione di legumi. */
export const LEGUME_SERVING_G = 60;
/** Legumi secchi o tostati: resa della cottura per confrontarli con quelli cotti. */
export const DRY_LEGUME_YIELD: Readonly<Record<string, number>> = { 'ceci-tostati': 2.4 };
/** A9: cereali integrali, in media almeno 90 g al giorno in equivalente secco (WCRF CUP). */
export const MIN_WHOLE_GRAIN_G = 90;
/** A6: verdura e frutta, almeno 400 g al giorno, cioè 5 porzioni da 80 g (OMS). */
export const MIN_VEG_PORTIONS = 5;
export const VEG_PORTION_G = 80;
/** A10: zuccheri liberi dal menù sotto il 5% delle kcal (OMS 2015, raccomandazione condizionale). */
export const FREE_SUGAR_MAX_SHARE = 0.05;
/** Pesce 2-3 pasti a settimana (varietà, § 4.10). */
export const MIN_FISH_MEALS = 2;

const MAIN_SLOTS: ReadonlySet<MealSlot> = new Set(['pranzo', 'cena']);

// ───────────────────────── Pasti ─────────────────────────

/** Un alimento di un pasto con i grammi mangiati. */
export interface MealItem {
  foodId: string;
  grams: number;
}

/** Un pasto del menù o del diario ridotto ai suoi alimenti. */
export interface PlannedMeal {
  /** Data o indice del giorno (0 = lunedì): serve a contare i giorni e le porzioni al giorno. */
  day: ISODate | number;
  slot: MealSlot;
  items: readonly MealItem[];
  /** Porzioni di frutta e verdura; senza, si ricavano dagli alimenti (`vegPortionG`, altrimenti 80 g di verdura o frutta). */
  vegPortions?: number;
  /** Kcal del pasto; senza, si ricavano dagli alimenti noti. */
  kcal?: number;
}

export interface PreventionCtx {
  /** Fatti degli alimenti (predefinito `factsOf`): i test ne iniettano di finti per gli alimenti di sola stima. */
  facts?: (foodId: string) => FoodFacts | undefined;
  /** Alimenti per kcal e porzioni di vegetali (predefinito FOODS più ESTIMATE_FOODS). */
  food?: (foodId: string) => Food | undefined;
}

/** Numeri di un insieme di pasti (di solito una settimana). */
export interface PreventionStats {
  meals: number;
  /** Giorni distinti con almeno un pasto. */
  days: number;
  redMeatG: number;
  redMeatMeals: number;
  processedG: number;
  processedMeals: number;
  fishMeals: number;
  oilyFishMeals: number;
  /** Pranzi e cene con un piatto di legumi (≥ 100 g). */
  legumeMeals: number;
  /** Pasti con una porzione di legumi (≥ 60 g equivalenti cotti). */
  legumeServings: number;
  /** Il giorno con più porzioni di legumi. */
  maxLegumeServingsPerDay: number;
  riceMeals: number;
  wholeGrainDryG: number;
  vegPortions: number;
  kcal: number;
  freeSugarG: number;
  /** Quota delle kcal dagli zuccheri liberi (4 kcal/g), null senza kcal. */
  freeSugarShare: number | null;
  upfKcal: number;
  upfShare: number | null;
}

/** Contributo di un solo pasto. */
export interface MealPrevention {
  redMeatG: number;
  processedG: number;
  fish: boolean;
  oilyFish: boolean;
  legumeG: number;
  /** Porta una porzione di legumi (≥ 60 g equivalenti). */
  legumeServing: boolean;
  /** È un pranzo o una cena con un piatto di legumi (≥ 100 g). */
  legumeMeal: boolean;
  rice: boolean;
  wholeGrainDryG: number;
  vegPortions: number;
  kcal: number;
  freeSugarG: number;
  upfKcal: number;
}

const ESTIMATE_BY_ID: Record<string, Food> = {};
let estimateIndexed = 0;

/** Alimento dell'archivio o di sola stima. */
function defaultFood(foodId: string): Food | undefined {
  if (Object.prototype.hasOwnProperty.call(FOODS, foodId)) return FOODS[foodId];
  // ESTIMATE_FOODS può crescere solo con una versione dell'app: l'indice si rifà se la lunghezza cambia.
  if (estimateIndexed !== ESTIMATE_FOODS.length) {
    for (const f of ESTIMATE_FOODS) ESTIMATE_BY_ID[f.id] = f;
    estimateIndexed = ESTIMATE_FOODS.length;
  }
  return Object.prototype.hasOwnProperty.call(ESTIMATE_BY_ID, foodId) ? ESTIMATE_BY_ID[foodId] : undefined;
}

const pos = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** I numeri di un pasto. */
export function mealPrevention(meal: PlannedMeal, ctx: PreventionCtx = {}): MealPrevention {
  const facts = ctx.facts ?? factsOf;
  const food = ctx.food ?? defaultFood;
  const out: MealPrevention = {
    redMeatG: 0,
    processedG: 0,
    fish: false,
    oilyFish: false,
    legumeG: 0,
    legumeServing: false,
    legumeMeal: false,
    rice: false,
    wholeGrainDryG: 0,
    vegPortions: 0,
    kcal: 0,
    freeSugarG: 0,
    upfKcal: 0,
  };
  let legumeEq = 0;
  let veg = 0;
  let kcal = 0;
  for (const it of meal.items) {
    const g = pos(it.grams);
    if (!g) continue;
    const f = facts(it.foodId);
    const fd = food(it.foodId);
    const itemKcal = fd ? (g * pos(fd.per100g.kcal)) / 100 : 0;
    kcal += itemKcal;
    if (fd?.vegPortionG) veg += g / fd.vegPortionG;
    else if (f && (f.group === 'verdura' || f.group === 'frutta')) veg += g / VEG_PORTION_G;
    if (!f) continue;
    switch (f.group) {
      case 'carne-rossa':
        out.redMeatG += g;
        break;
      case 'carne-lavorata':
        out.processedG += g;
        break;
      case 'pesce':
        out.fish = true;
        break;
      case 'pesce-grasso':
        out.fish = true;
        out.oilyFish = true;
        break;
      case 'legumi':
        out.legumeG += g;
        legumeEq += g * (DRY_LEGUME_YIELD[it.foodId] ?? 1);
        break;
      default:
        break;
    }
    if (f.rice) out.rice = true;
    if (f.wholeGrainDry) out.wholeGrainDryG += g * f.wholeGrainDry;
    if (f.freeSugarG) out.freeSugarG += (g * f.freeSugarG) / 100;
    if (f.upf) out.upfKcal += itemKcal;
  }
  out.legumeServing = legumeEq >= LEGUME_SERVING_G;
  out.legumeMeal = MAIN_SLOTS.has(meal.slot) && out.legumeG >= LEGUME_MEAL_G;
  out.vegPortions = typeof meal.vegPortions === 'number' && Number.isFinite(meal.vegPortions) ? Math.max(0, meal.vegPortions) : veg;
  out.kcal = typeof meal.kcal === 'number' && Number.isFinite(meal.kcal) ? Math.max(0, meal.kcal) : kcal;
  return out;
}

/** Somma dei numeri di un insieme di pasti (§ 4.2, § 4.7). Deterministica: lo stesso ingresso dà lo stesso risultato. */
export function weekPreventionStats(meals: PlannedMeal[], ctx: PreventionCtx = {}): PreventionStats {
  const s: PreventionStats = {
    meals: 0,
    days: 0,
    redMeatG: 0,
    redMeatMeals: 0,
    processedG: 0,
    processedMeals: 0,
    fishMeals: 0,
    oilyFishMeals: 0,
    legumeMeals: 0,
    legumeServings: 0,
    maxLegumeServingsPerDay: 0,
    riceMeals: 0,
    wholeGrainDryG: 0,
    vegPortions: 0,
    kcal: 0,
    freeSugarG: 0,
    freeSugarShare: null,
    upfKcal: 0,
    upfShare: null,
  };
  const days = new Set<string>();
  const servingsByDay = new Map<string, number>();
  for (const meal of meals) {
    const m = mealPrevention(meal, ctx);
    const day = String(meal.day);
    days.add(day);
    s.meals++;
    s.redMeatG += m.redMeatG;
    if (m.redMeatG > 0) s.redMeatMeals++;
    s.processedG += m.processedG;
    if (m.processedG > 0) s.processedMeals++;
    if (m.fish) s.fishMeals++;
    if (m.oilyFish) s.oilyFishMeals++;
    if (m.legumeMeal) s.legumeMeals++;
    if (m.legumeServing) {
      s.legumeServings++;
      servingsByDay.set(day, (servingsByDay.get(day) ?? 0) + 1);
    }
    if (m.rice) s.riceMeals++;
    s.wholeGrainDryG += m.wholeGrainDryG;
    s.vegPortions += m.vegPortions;
    s.kcal += m.kcal;
    s.freeSugarG += m.freeSugarG;
    s.upfKcal += m.upfKcal;
  }
  s.days = days.size;
  s.maxLegumeServingsPerDay = servingsByDay.size ? Math.max(...servingsByDay.values()) : 0;
  s.freeSugarShare = s.kcal > 0 ? (s.freeSugarG * 4) / s.kcal : null;
  s.upfShare = s.kcal > 0 ? s.upfKcal / s.kcal : null;
  return s;
}

/** Un pasto del menù: gli ingredienti della ricetta alla porzione del giorno (tipo di giorno e scala dei carboidrati). */
export function mealFromRecipe(recipe: Recipe, dayType: DayType, scale: number, day: ISODate | number, slot: MealSlot): PlannedMeal {
  return {
    day,
    slot,
    items: recipe.ingredients.map((l) => ({ foodId: l.foodId, grams: lineGrams(l, dayType, FOODS, scale) })),
  };
}

/**
 * Un pasto stimato (foto o piatto salvato) per i suoi alimenti, con le kcal e le porzioni di vegetali della stima. Null
 * senza alimenti: un ordine del bar non dice cosa c'era nel piatto e non conta.
 */
export function mealFromEaten(meal: Pick<EatenMeal, 'items' | 'nutrients' | 'vegPortions'>, day: ISODate | number, slot: MealSlot): PlannedMeal | null {
  const items = (meal.items ?? []).filter((it) => typeof it.foodId === 'string' && it.foodId && pos(it.grams) > 0) as MealItem[];
  if (!items.length) return null;
  return {
    day,
    slot,
    items: items.map((it) => ({ foodId: it.foodId, grams: it.grams })),
    ...(typeof meal.vegPortions === 'number' ? { vegPortions: meal.vegPortions } : {}),
    ...(typeof meal.nutrients?.kcal === 'number' ? { kcal: meal.nutrients.kcal } : {}),
  };
}
