/**
 * Nutrizione: grammi delle righe di ricetta, valori nutrizionali, porzioni a occhio.
 *
 * Semantica di `lineGrams` (vincolante, la usano anche i contenuti):
 * - unit 'g'   → qty grammi
 * - unit 'ml'  → qty × (unitGrams.ml ?? 1)
 * - altre unità → qty × unitGrams[unit] (se manca: 0, avviso in console solo in sviluppo)
 * - se `carbScaled`, il risultato si moltiplica per `carbFactor(dayType)` e per la scala del piano
 *   (vedi sotto), così le porzioni seguono gli obiettivi calorici dell'utente.
 * Nutrienti = grammi × per100g / 100. Porzioni di vegetali = grammi / vegPortionG.
 *
 * Scala del piano: il menù è tarato sugli obiettivi predefiniti (DEFAULT_TARGETS). Quando gli obiettivi
 * cambiano (ricalcolo nel benvenuto, proposta +150 kcal della revisione, modifica nelle impostazioni) la
 * differenza di kcal passa dalle righe di carboidrati (`carbScaled`): proteine e grassi restano quelli della
 * ricetta. Le funzioni accettano un ultimo argomento facoltativo `scale`: un numero già calcolato
 * (`dayCarbScale(data, stato)`, esatto per il giorno) oppure il piano (`planCarbScale`, media del tipo di giorno).
 * Senza `scale` i valori restano quelli del menù predefinito.
 */
import type { AppData, DayType, Food, IngredientLine, ISODate, MealSlot, Nutrients, Plan, PortionUnit, Recipe } from '../domain/types';
import { FOODS } from '../data/foods';
import { MENU_ROTATION } from '../data/menu';
import { RECIPES } from '../data/recipes';
import { DEFAULT_TARGETS, DEFAULT_WEEK, defaultPlan } from '../data/defaults';
import { addDays, daysBetween } from './dates';
import { effectiveDayType, mealsForDate, menuDayFor, type MenuState } from './menu';

export const CARB_FACTOR: Record<DayType, number> = {
  calcio: 1.25,
  palestra: 1,
  leggero: 0.9,
  riposo: 0.75,
};

export function carbFactor(dayType: DayType): number {
  return CARB_FACTOR[dayType] ?? 1;
}

export const ZERO_NUTRIENTS: Nutrients = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 };

const isDev = (() => {
  try {
    return Boolean(import.meta.env?.DEV) && import.meta.env?.MODE !== 'test';
  } catch {
    return false;
  }
})();

const warned = new Set<string>();
function devWarn(key: string, msg: string) {
  if (!isDev || warned.has(key)) return;
  warned.add(key);
  console.warn(`[nutrizione] ${msg}`);
}

function foodOf(line: IngredientLine, foods: Record<string, Food>): Food | undefined {
  const f = foods[line.foodId];
  if (!f) devWarn(`food:${line.foodId}`, `alimento sconosciuto: ${line.foodId}`);
  return f;
}

// ───────────────────────── Scala del piano ─────────────────────────

/** Scala dei carboidrati: un numero già calcolato oppure il piano da cui ricavarla. */
export type CarbScaleInput = number | Pick<Plan, 'targets'> | null | undefined;

/** Limiti della scala: oltre, conviene cambiare le ricette, non solo le porzioni. */
export const CARB_SCALE_MIN = 0.6;
export const CARB_SCALE_MAX = 1.6;

const clampScale = (x: number) => (Number.isFinite(x) ? Math.min(CARB_SCALE_MAX, Math.max(CARB_SCALE_MIN, x)) : 1);

/** Kcal delle righe `carbScaled` di un elenco di ricette, con il fattore del tipo di giorno. */
function carbScaledKcal(recipeIds: (string | undefined)[], dayType: DayType, foods: Record<string, Food> = FOODS): number {
  let kcal = 0;
  for (const id of recipeIds) {
    const r = id ? RECIPES[id] : undefined;
    if (!r) continue;
    for (const line of r.ingredients) {
      if (!line.carbScaled) continue;
      const f = foods[line.foodId];
      if (f) kcal += (lineGrams(line, dayType, foods) * f.per100g.kcal) / 100;
    }
  }
  return kcal;
}

const avgCache = new Map<DayType, number>();

/**
 * Kcal medie delle righe di carboidrati di un giorno di menù del tipo, sulla rotazione con la settimana
 * predefinita (vigilia della partita compresa). Se nessun giorno ha quel tipo, media di tutti i giorni.
 */
export function menuCarbKcal(dayType: DayType): number {
  const hit = avgCache.get(dayType);
  if (hit !== undefined) return hit;
  const ref = { ...defaultPlan('2026-01-05'), week: DEFAULT_WEEK };
  const all: number[] = [];
  const same: number[] = [];
  MENU_ROTATION.forEach((week) => {
    week.days.forEach((day, i) => {
      const k = carbScaledKcal(Object.values(day?.meals ?? {}), dayType);
      all.push(k);
      if (effectiveDayType(addDays(ref.startDate, i), ref) === dayType) same.push(k);
    });
  });
  const pick = same.length ? same : all;
  const avg = pick.length ? pick.reduce((a, b) => a + b, 0) / pick.length : 0;
  avgCache.set(dayType, avg);
  return avg;
}

function scaleFrom(deltaKcal: number, baseKcal: number): number {
  if (!Number.isFinite(deltaKcal) || deltaKcal === 0 || !(baseKcal > 0)) return 1;
  return clampScale(1 + deltaKcal / baseKcal);
}

/** Differenza tra l'obiettivo del piano e quello su cui è tarato il menù. */
function targetDelta(dayType: DayType, plan: Pick<Plan, 'targets'> | undefined): number {
  const cur = Number(plan?.targets?.[dayType]?.kcal);
  const ref = DEFAULT_TARGETS[dayType]?.kcal;
  return Number.isFinite(cur) && cur > 0 && ref ? cur - ref : 0;
}

/**
 * Scala media delle righe di carboidrati per il tipo di giorno: 1 + (kcal del piano − kcal predefinite) /
 * kcal medie delle righe di carboidrati, tra 0,6 e 1,6. Da usare quando non c'è una data (anteprima di una
 * ricetta); con una data `dayCarbScale` è esatta.
 */
export function planCarbScale(dayType: DayType, plan: Pick<Plan, 'targets'> | undefined): number {
  return scaleFrom(targetDelta(dayType, plan), menuCarbKcal(dayType));
}

/**
 * Scala delle righe di carboidrati per la data: la differenza di kcal dell'obiettivo divisa per le kcal
 * delle righe di carboidrati del menù previsto quel giorno. Così il totale del giorno segue l'obiettivo
 * (+150 kcal nel piano → circa +150 kcal nel piatto).
 */
export function dayCarbScale(date: ISODate, state: MenuState): number {
  const dayType = effectiveDayType(date, state.plan);
  const delta = targetDelta(dayType, state.plan);
  if (!delta) return 1;
  const planned = menuDayFor(date, state.plan.startDate);
  const base = planned ? carbScaledKcal(Object.values(planned.meals ?? {}), dayType) : 0;
  return scaleFrom(delta, base > 0 ? base : menuCarbKcal(dayType));
}

/** Risolve l'argomento `scale` delle funzioni di questo file. */
export function resolveCarbScale(dayType: DayType, scale: CarbScaleInput): number {
  if (typeof scale === 'number') return Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (scale && typeof scale === 'object') return planCarbScale(dayType, scale);
  return 1;
}

/** Fattore complessivo delle righe di carboidrati: tipo di giorno × scala del piano. */
export function totalCarbFactor(dayType: DayType, scale?: CarbScaleInput): number {
  return carbFactor(dayType) * resolveCarbScale(dayType, scale);
}

/** Grammi della riga per il tipo di giorno (vedi semantica in testa al file). */
export function lineGrams(line: IngredientLine, dayType: DayType, foods: Record<string, Food> = FOODS, scale?: CarbScaleInput): number {
  let grams: number;
  if (line.unit === 'g') {
    grams = line.qty;
  } else {
    const food = foods[line.foodId];
    if (line.unit === 'ml') {
      grams = line.qty * (food?.unitGrams.ml ?? 1);
    } else {
      const per = food?.unitGrams[line.unit];
      if (per === undefined) {
        devWarn(`unit:${line.foodId}:${line.unit}`, `manca unitGrams['${line.unit}'] per ${line.foodId}`);
        grams = 0;
      } else {
        grams = line.qty * per;
      }
    }
  }
  if (line.carbScaled) grams *= totalCarbFactor(dayType, scale);
  return Number.isFinite(grams) ? grams : 0;
}

/** Quantità della riga nella sua unità, già adattata al tipo di giorno (e al piano, con `scale`). */
export function lineQty(line: IngredientLine, dayType: DayType, scale?: CarbScaleInput): number {
  return line.carbScaled ? line.qty * totalCarbFactor(dayType, scale) : line.qty;
}

export function addNutrients(a: Nutrients, b: Nutrients, k = 1): Nutrients {
  return {
    kcal: a.kcal + b.kcal * k,
    proteinG: a.proteinG + b.proteinG * k,
    carbG: a.carbG + b.carbG * k,
    fatG: a.fatG + b.fatG * k,
    fiberG: a.fiberG + b.fiberG * k,
  };
}

/** Arrotonda per la visualizzazione: kcal all'unità, grammi a 1 decimale. */
export function roundNutrients(n: Nutrients): Nutrients {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { kcal: Math.round(n.kcal), proteinG: r1(n.proteinG), carbG: r1(n.carbG), fatG: r1(n.fatG), fiberG: r1(n.fiberG) };
}

/** Nutrienti di una singola riga. */
export function lineNutrition(
  line: IngredientLine,
  dayType: DayType,
  foods: Record<string, Food> = FOODS,
  scale?: CarbScaleInput,
): Nutrients {
  const food = foodOf(line, foods);
  if (!food) return { ...ZERO_NUTRIENTS };
  return addNutrients(ZERO_NUTRIENTS, food.per100g, lineGrams(line, dayType, foods, scale) / 100);
}

/**
 * Valori della ricetta per il tipo di giorno (non arrotondati). Con `scale` (numero da `dayCarbScale` o il
 * piano) le righe di carboidrati seguono gli obiettivi dell'utente.
 */
export function recipeNutrition(
  recipe: Recipe | undefined,
  dayType: DayType,
  foods: Record<string, Food> = FOODS,
  scale?: CarbScaleInput,
): Nutrients {
  if (!recipe) return { ...ZERO_NUTRIENTS };
  const k = resolveCarbScale(dayType, scale);
  return recipe.ingredients.reduce((acc, line) => addNutrients(acc, lineNutrition(line, dayType, foods, k)), {
    ...ZERO_NUTRIENTS,
  });
}

/** Porzioni di frutta e verdura della ricetta (grammi / vegPortionG). */
export function recipeVegPortions(
  recipe: Recipe | undefined,
  dayType: DayType,
  foods: Record<string, Food> = FOODS,
  scale?: CarbScaleInput,
): number {
  if (!recipe) return 0;
  const k = resolveCarbScale(dayType, scale);
  let total = 0;
  for (const line of recipe.ingredients) {
    const food = foods[line.foodId];
    if (!food?.vegPortionG) continue;
    total += lineGrams(line, dayType, foods, k) / food.vegPortionG;
  }
  return total;
}

// ───────────────────────── Porzioni a occhio ─────────────────────────

interface UnitWords {
  one: string;
  many: string;
  /** Femminile: "mezza fetta", "1 fetta e mezza". */
  fem?: boolean;
}

export const UNIT_WORDS: Record<Exclude<PortionUnit, 'g' | 'ml'>, UnitWords> = {
  palmo: { one: 'palmo', many: 'palmi' },
  pugno: { one: 'pugno', many: 'pugni' },
  'mano a coppa': { one: 'mano a coppa', many: 'mani a coppa', fem: true },
  pollice: { one: 'pollice', many: 'pollici' },
  cucchiaio: { one: 'cucchiaio', many: 'cucchiai' },
  cucchiaino: { one: 'cucchiaino', many: 'cucchiaini' },
  pezzo: { one: 'pezzo', many: 'pezzi' },
  vasetto: { one: 'vasetto', many: 'vasetti' },
  fetta: { one: 'fetta', many: 'fette', fem: true },
  manciata: { one: 'manciata', many: 'manciate', fem: true },
  tazza: { one: 'tazza', many: 'tazze', fem: true },
  bicchiere: { one: 'bicchiere', many: 'bicchieri' },
};

/** Arrotonda a mezze unità (minimo mezza). */
export function roundHalf(q: number): number {
  if (!(q > 0)) return 0;
  return Math.max(0.5, Math.round(q * 2) / 2);
}

/** "1 pugno e mezzo", "mezza fetta", "2 cucchiai". */
export function portionWords(qty: number, unit: Exclude<PortionUnit, 'g' | 'ml'>): string {
  const w = UNIT_WORDS[unit] ?? { one: unit, many: unit };
  const q = roundHalf(qty);
  const whole = Math.floor(q);
  const half = q - whole >= 0.5;
  const mezzo = w.fem ? 'mezza' : 'mezzo';
  if (whole === 0) return `${mezzo} ${w.one}`;
  const base = `${whole} ${whole === 1 ? w.one : w.many}`;
  return half ? `${base} e ${mezzo}` : base;
}

/** Arrotondamento umano dei grammi: sotto 10 g al grammo, poi a 5 g. */
export function roundGrams(g: number): number {
  if (!(g > 0)) return 0;
  if (g < 10) return Math.max(1, Math.round(g));
  return Math.round(g / 5) * 5;
}

export interface PortionParts {
  /** "1 pugno e mezzo" oppure "150 g" / "200 ml". */
  portion: string;
  /** Grammi arrotondati (0 se non noti). */
  grams: number;
  /** "1 pugno e mezzo · ≈ 225 g" */
  text: string;
}

/** Porzione leggibile della riga, adattata al tipo di giorno (e al piano, con `scale`). */
export function portionParts(
  line: IngredientLine,
  dayType: DayType,
  foods: Record<string, Food> = FOODS,
  scale?: CarbScaleInput,
): PortionParts {
  const k = resolveCarbScale(dayType, scale);
  const grams = roundGrams(lineGrams(line, dayType, foods, k));
  if (line.unit === 'g') {
    const portion = `${grams || roundGrams(line.qty)} g`;
    return { portion, grams, text: portion };
  }
  if (line.unit === 'ml') {
    const ml = roundGrams(lineQty(line, dayType, k));
    const portion = `${ml} ml`;
    const density = foods[line.foodId]?.unitGrams.ml;
    const text = density !== undefined && density !== 1 && grams ? `${portion} · ≈ ${grams} g` : portion;
    return { portion, grams, text };
  }
  const portion = portionWords(lineQty(line, dayType, k), line.unit);
  return { portion, grams, text: grams ? `${portion} · ≈ ${grams} g` : portion };
}

/** "1 pugno e mezzo · ≈ 225 g", "2 cucchiai · ≈ 20 g", "150 g". */
export function formatPortion(line: IngredientLine, dayType: DayType, foods: Record<string, Food> = FOODS, scale?: CarbScaleInput): string {
  return portionParts(line, dayType, foods, scale).text;
}

// ───────────────────────── Giornata ─────────────────────────

export interface DayNutritionOptions {
  /**
   * Conta solo i pasti segnati come fatti nel diario (voce 'pasto:<slot>' con stato 'fatto').
   * Default false: valori previsti dal menù.
   */
  onlyDone?: boolean;
}

export interface DayNutritionDetail {
  total: Nutrients;
  vegPortions: number;
  bySlot: Partial<Record<MealSlot, Nutrients>>;
  /** Tipo di giorno delle porzioni (la vigilia della partita vale come calcio). */
  dayType: DayType;
  /** Scala delle righe di carboidrati usata per il giorno (1 con gli obiettivi predefiniti). */
  carbScale: number;
}

/** Valori del giorno con dettaglio per pasto e porzioni di vegetali. */
export function dayNutritionDetail(
  date: ISODate,
  state: MenuState | AppData,
  opts: DayNutritionOptions = {},
): DayNutritionDetail {
  const { dayType, meals } = mealsForDate(date, state);
  const carbScale = dayCarbScale(date, state);
  const status = state.dayLogs[date]?.status ?? {};
  let total: Nutrients = { ...ZERO_NUTRIENTS };
  let veg = 0;
  const bySlot: Partial<Record<MealSlot, Nutrients>> = {};
  for (const m of meals) {
    if (opts.onlyDone && status[`pasto:${m.slot}`] !== 'fatto') continue;
    const n = recipeNutrition(m.recipe, dayType, FOODS, carbScale);
    bySlot[m.slot] = n;
    total = addNutrients(total, n);
    veg += recipeVegPortions(m.recipe, dayType, FOODS, carbScale);
  }
  return { total, vegPortions: veg, bySlot, dayType, carbScale };
}

/** Somma dei pasti del giorno (sostituzioni di ricetta comprese). */
export function dayNutrition(date: ISODate, state: MenuState | AppData, opts: DayNutritionOptions = {}): Nutrients {
  return dayNutritionDetail(date, state, opts).total;
}

// ───────────────────────── Avvio graduale delle fibre ─────────────────────────

/**
 * Settimana di avvio delle fibre: 1 nella prima settimana del piano, 2 nella seconda, null dopo (o prima
 * dell'inizio). Chi parte da un consumo basso aumenta le fibre per gradi, con più acqua, per evitare gonfiore.
 */
export function fiberRampWeek(iso: ISODate, plan: Pick<Plan, 'startDate'>): 1 | 2 | null {
  const days = daysBetween(plan.startDate, iso);
  if (days < 0 || days >= 14) return null;
  return days < 7 ? 1 : 2;
}

/** Quota dell'obiettivo di fibre da puntare nell'avvio: 0,6 la prima settimana, 0,8 la seconda, poi 1. */
export function fiberRampFactor(iso: ISODate, plan: Pick<Plan, 'startDate'>): number {
  const w = fiberRampWeek(iso, plan);
  return w === 1 ? 0.6 : w === 2 ? 0.8 : 1;
}
