/**
 * Nutrizione: grammi delle righe di ricetta, valori nutrizionali, porzioni a occhio.
 *
 * Semantica di `lineGrams` (vincolante, la usano anche i contenuti):
 * - unit 'g'   → qty grammi
 * - unit 'ml'  → qty × (unitGrams.ml ?? 1)
 * - altre unità → qty × unitGrams[unit] (se manca: 0, avviso in console solo in sviluppo)
 * - se `carbScaled`, il risultato si moltiplica per `carbFactor(dayType)`.
 * Nutrienti = grammi × per100g / 100. Porzioni di vegetali = grammi / vegPortionG.
 */
import type { AppData, DayType, Food, IngredientLine, ISODate, MealSlot, Nutrients, PortionUnit, Recipe } from '../domain/types';
import { FOODS } from '../data/foods';
import { mealsForDate, type MenuState } from './menu';

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

/** Grammi della riga per il tipo di giorno (vedi semantica in testa al file). */
export function lineGrams(line: IngredientLine, dayType: DayType, foods: Record<string, Food> = FOODS): number {
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
  if (line.carbScaled) grams *= carbFactor(dayType);
  return Number.isFinite(grams) ? grams : 0;
}

/** Quantità della riga nella sua unità, già adattata al tipo di giorno. */
export function lineQty(line: IngredientLine, dayType: DayType): number {
  return line.carbScaled ? line.qty * carbFactor(dayType) : line.qty;
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
export function lineNutrition(line: IngredientLine, dayType: DayType, foods: Record<string, Food> = FOODS): Nutrients {
  const food = foodOf(line, foods);
  if (!food) return { ...ZERO_NUTRIENTS };
  return addNutrients(ZERO_NUTRIENTS, food.per100g, lineGrams(line, dayType, foods) / 100);
}

/** Valori della ricetta per il tipo di giorno (non arrotondati). */
export function recipeNutrition(recipe: Recipe | undefined, dayType: DayType, foods: Record<string, Food> = FOODS): Nutrients {
  if (!recipe) return { ...ZERO_NUTRIENTS };
  return recipe.ingredients.reduce((acc, line) => addNutrients(acc, lineNutrition(line, dayType, foods)), {
    ...ZERO_NUTRIENTS,
  });
}

/** Porzioni di frutta e verdura della ricetta (grammi / vegPortionG). */
export function recipeVegPortions(recipe: Recipe | undefined, dayType: DayType, foods: Record<string, Food> = FOODS): number {
  if (!recipe) return 0;
  let total = 0;
  for (const line of recipe.ingredients) {
    const food = foods[line.foodId];
    if (!food?.vegPortionG) continue;
    total += lineGrams(line, dayType, foods) / food.vegPortionG;
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

/** Porzione leggibile della riga, adattata al tipo di giorno. */
export function portionParts(line: IngredientLine, dayType: DayType, foods: Record<string, Food> = FOODS): PortionParts {
  const grams = roundGrams(lineGrams(line, dayType, foods));
  if (line.unit === 'g') {
    const portion = `${grams || roundGrams(line.qty)} g`;
    return { portion, grams, text: portion };
  }
  if (line.unit === 'ml') {
    const ml = roundGrams(lineQty(line, dayType));
    const portion = `${ml} ml`;
    const density = foods[line.foodId]?.unitGrams.ml;
    const text = density !== undefined && density !== 1 && grams ? `${portion} · ≈ ${grams} g` : portion;
    return { portion, grams, text };
  }
  const portion = portionWords(lineQty(line, dayType), line.unit);
  return { portion, grams, text: grams ? `${portion} · ≈ ${grams} g` : portion };
}

/** "1 pugno e mezzo · ≈ 225 g", "2 cucchiai · ≈ 20 g", "150 g". */
export function formatPortion(line: IngredientLine, dayType: DayType, foods: Record<string, Food> = FOODS): string {
  return portionParts(line, dayType, foods).text;
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
  dayType: DayType;
}

/** Valori del giorno con dettaglio per pasto e porzioni di vegetali. */
export function dayNutritionDetail(
  date: ISODate,
  state: MenuState | AppData,
  opts: DayNutritionOptions = {},
): DayNutritionDetail {
  const { dayType, meals } = mealsForDate(date, state);
  const status = state.dayLogs[date]?.status ?? {};
  let total: Nutrients = { ...ZERO_NUTRIENTS };
  let veg = 0;
  const bySlot: Partial<Record<MealSlot, Nutrients>> = {};
  for (const m of meals) {
    if (opts.onlyDone && status[`pasto:${m.slot}`] !== 'fatto') continue;
    const n = recipeNutrition(m.recipe, dayType);
    bySlot[m.slot] = n;
    total = addNutrients(total, n);
    veg += recipeVegPortions(m.recipe, dayType);
  }
  return { total, vegPortions: veg, bySlot, dayType };
}

/** Somma dei pasti del giorno (sostituzioni di ricetta comprese). */
export function dayNutrition(date: ISODate, state: MenuState | AppData, opts: DayNutritionOptions = {}): Nutrients {
  return dayNutritionDetail(date, state, opts).total;
}
