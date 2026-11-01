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
 *
 * Partita e vigilia: il giorno della partita e quello prima i carboidrati non scendono sotto 6 g/kg
 * (`MATCH_CARB_G_PER_KG`, dal peso recente). La differenza dall'obiettivo del tipo di giorno passa dalle stesse righe
 * di carboidrati (`dayCarbScale`) ed entra nell'obiettivo della data (`dayTargetFor`, `DayNutritionDetail.target`).
 * Per il peso servono `checkIns` o `profile` nello stato (`NutritionState`); senza, vale il peso su cui sono
 * costruite le proteine del piano.
 */
import type {
  AppData,
  DayType,
  Food,
  IngredientLine,
  ISODate,
  MacroTarget,
  MealSlot,
  Nutrients,
  Plan,
  PortionUnit,
  Recipe,
} from '../domain/types';
import { FOODS } from '../data/foods';
import { MENU_ROTATION } from '../data/menu';
import { RECIPES } from '../data/recipes';
import { DEFAULT_TARGETS, DEFAULT_WEEK, defaultPlan } from '../data/defaults';
import { addDays, daysBetween, isISODate } from './dates';
import { effectiveDayType, isMatchDay, isMatchEve, mealsForDate, menuDayFor, type MenuState } from './menu';
import { MATCH_CARB_G_PER_KG, PROTEIN_G_PER_KG } from './targets';

/**
 * Stato per i valori di una data: quello del menù più, se ci sono, controlli e profilo per il peso (minimo di
 * carboidrati di partita e vigilia). Passa sempre anche `checkIns` e `profile` quando li hai.
 */
export type NutritionState = MenuState & Partial<Pick<AppData, 'checkIns' | 'profile'>>;

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

interface CarbParts {
  /** Kcal delle righe `carbScaled`. */
  scaledKcal: number;
  /** Carboidrati delle righe `carbScaled`. */
  scaledCarbG: number;
  /** Carboidrati delle altre righe (non cambiano con la scala). */
  fixedCarbG: number;
}

/** Kcal e carboidrati delle righe di un elenco di ricette, con il fattore del tipo di giorno e scala 1. */
function carbParts(recipeIds: (string | undefined)[], dayType: DayType, foods: Record<string, Food> = FOODS): CarbParts {
  const out: CarbParts = { scaledKcal: 0, scaledCarbG: 0, fixedCarbG: 0 };
  for (const id of recipeIds) {
    const r = id ? RECIPES[id] : undefined;
    if (!r) continue;
    for (const line of r.ingredients) {
      const f = foods[line.foodId];
      if (!f) continue;
      const g = lineGrams(line, dayType, foods);
      if (line.carbScaled) {
        out.scaledKcal += (g * f.per100g.kcal) / 100;
        out.scaledCarbG += (g * f.per100g.carbG) / 100;
      } else {
        out.fixedCarbG += (g * f.per100g.carbG) / 100;
      }
    }
  }
  return out;
}

/** Kcal delle righe `carbScaled` di un elenco di ricette, con il fattore del tipo di giorno. */
function carbScaledKcal(recipeIds: (string | undefined)[], dayType: DayType, foods: Record<string, Food> = FOODS): number {
  return carbParts(recipeIds, dayType, foods).scaledKcal;
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

// ───────────────────────── Partita e vigilia ─────────────────────────

const validWeight = (w: unknown): w is number => typeof w === 'number' && Number.isFinite(w) && w >= 30 && w <= 250;

/**
 * Peso di riferimento per la data: media delle pesate dei 7 giorni che finiscono con l'ultima pesata entro la
 * data (una pesata storta non sposta il piano), poi il peso del profilo, poi il peso su cui sono costruite le
 * proteine del piano (1,9 g/kg). Null se non si ricava.
 */
export function referenceWeightKg(date: ISODate, state: NutritionState): number | null {
  const checkIns = state.checkIns;
  if (checkIns && typeof checkIns === 'object') {
    const dated = Object.keys(checkIns)
      .filter((d) => isISODate(d) && d <= date && validWeight(checkIns[d]?.weightKg))
      .sort();
    const last = dated[dated.length - 1];
    if (last) {
      const from = addDays(last, -6);
      const recent = dated.filter((d) => d >= from).map((d) => checkIns[d].weightKg as number);
      return recent.reduce((a, b) => a + b, 0) / recent.length;
    }
  }
  if (validWeight(state.profile?.startWeightKg)) return state.profile.startWeightKg;
  const protein = Number(state.plan?.targets?.calcio?.proteinG);
  return protein > 0 ? protein / PROTEIN_G_PER_KG : null;
}

export interface MatchCarbs {
  /** 'partita' il giorno della gara, 'vigilia' il giorno prima. */
  when: 'partita' | 'vigilia';
  weightKg: number;
  /** Grammi per kg del minimo (6). */
  gPerKg: number;
  /** Minimo di carboidrati del giorno, arrotondato a 5 g. */
  floorG: number;
  /** Carboidrati dell'obiettivo del tipo di giorno. */
  baseG: number;
  /** Carboidrati aggiunti per arrivare al minimo (0 se l'obiettivo lo raggiunge già). */
  extraG: number;
  /** Kcal aggiunte (4 kcal/g, arrotondate a 10). */
  extraKcal: number;
}

/**
 * Minimo di carboidrati del giorno della partita e della vigilia (6 g/kg dal peso recente). Null negli altri
 * giorni, quando il peso non si ricava o quando la data non è valida.
 */
export function matchCarbs(date: ISODate, state: NutritionState): MatchCarbs | null {
  const plan = state.plan;
  if (!plan || !isISODate(date)) return null;
  const when = isMatchDay(date, plan) ? 'partita' : isMatchEve(date, plan) ? 'vigilia' : null;
  if (!when) return null;
  const weightKg = referenceWeightKg(date, state);
  if (!weightKg) return null;
  const baseG = Number(plan.targets?.[effectiveDayType(date, plan)]?.carbG) || 0;
  const floorG = Math.round((MATCH_CARB_G_PER_KG * weightKg) / 5) * 5;
  const extraG = Math.max(0, floorG - baseG);
  return { when, weightKg, gPerKg: MATCH_CARB_G_PER_KG, floorG, baseG, extraG, extraKcal: Math.round((extraG * 4) / 10) * 10 };
}

/**
 * Obiettivo della data: quello del tipo di giorno effettivo (la vigilia vale come calcio) più il minimo di
 * carboidrati di partita e vigilia. È l'obiettivo da mostrare accanto ai valori del giorno.
 */
export function dayTargetFor(date: ISODate, state: NutritionState): MacroTarget {
  const base = state.plan.targets[effectiveDayType(date, state.plan)];
  const m = matchCarbs(date, state);
  if (!base || !m?.extraG) return base;
  return { ...base, carbG: base.carbG + m.extraG, kcal: base.kcal + m.extraKcal };
}

/**
 * Scala delle righe di carboidrati per la data: la differenza di kcal dell'obiettivo divisa per le kcal
 * delle righe di carboidrati del menù previsto quel giorno. Così il totale del giorno segue l'obiettivo
 * (+150 kcal nel piano → circa +150 kcal nel piatto). Il giorno della partita e la vigilia la scala sale
 * almeno quanto serve perché i carboidrati del menù previsto arrivino al minimo (`matchCarbs`): nel piatto ci
 * sono davvero 6 g/kg, non solo nell'obiettivo.
 */
export function dayCarbScale(date: ISODate, state: NutritionState): number {
  const dayType = effectiveDayType(date, state.plan);
  const delta = targetDelta(dayType, state.plan);
  const match = matchCarbs(date, state);
  if (!delta && !match?.extraG) return 1;
  const planned = menuDayFor(date, state.plan.startDate);
  const parts = planned ? carbParts(Object.values(planned.meals ?? {}), dayType) : null;
  const base = parts && parts.scaledKcal > 0 ? parts.scaledKcal : menuCarbKcal(dayType);
  const scale = scaleFrom(delta, base);
  if (!match?.extraG || !parts || !(parts.scaledCarbG > 0)) return scale;
  const needed = (match.floorG - parts.fixedCarbG) / parts.scaledCarbG;
  return needed > scale ? clampScale(needed) : scale;
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

/** Scarto massimo tra la porzione detta a parole e i grammi, oltre il quale si aggiunge "abbondante" o "quasi". */
export const PORTION_TOLERANCE = 0.1;

/**
 * Porzione a parole coerente con i grammi. Se la mezza unità più vicina si discosta di più del 10% dalla quantità
 * vera, lo dice con "abbondante" o "quasi", al massimo un quarto di unità di scarto, e preferisce le unità intere:
 * 1,25 → "1 fetta abbondante", 1,35 → "quasi 1 fetta e mezza", 1,8 → "quasi 2 fette", 0,6 → "mezza fetta
 * abbondante". Così "1 fetta abbondante · ≈ 50 g" torna con la fetta da 40 g.
 */
export function portionPhrase(qty: number, unit: Exclude<PortionUnit, 'g' | 'ml'>): string {
  if (!(qty > 0)) return portionWords(0.5, unit);
  const half = roundHalf(qty);
  if (Math.abs(half - qty) / qty <= PORTION_TOLERANCE) return portionWords(half, unit);
  const whole = Math.round(qty);
  const ref = whole >= 1 && Math.abs(qty - whole) <= 0.25 ? whole : Math.floor(qty) + 0.5;
  const words = portionWords(ref, unit);
  if (qty > ref) return `${words} ${Math.floor(ref) >= 2 ? 'abbondanti' : 'abbondante'}`;
  if (ref - qty > 0.25) return `meno di ${words}`;
  return `quasi ${words}`;
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

/**
 * Porzione leggibile della riga, adattata al tipo di giorno (e al piano, con `scale`). Le unità a occhio usano
 * `portionPhrase`: mezze unità, con "abbondante" o "quasi" quando l'arrotondamento si allontanerebbe dai grammi.
 */
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
  const portion = portionPhrase(lineQty(line, dayType, k), line.unit);
  return { portion, grams, text: grams ? `${portion} · ≈ ${grams} g` : portion };
}

/** "1 pugno e mezzo · ≈ 225 g", "2 cucchiai · ≈ 20 g", "150 g". */
export function formatPortion(line: IngredientLine, dayType: DayType, foods: Record<string, Food> = FOODS, scale?: CarbScaleInput): string {
  return portionParts(line, dayType, foods, scale).text;
}

// ───────────────────────── Giornata ─────────────────────────

export interface DayNutritionOptions {
  /**
   * Conta solo i pasti segnati come fatti nel diario (voce 'pasto:<slot>' con stato 'fatto') e, per i pasti
   * sostituiti con il piano B al bar (`DayLog.barMeals`), i valori dell'ordine. Default false: valori previsti
   * dal menù.
   */
  onlyDone?: boolean;
}

const nonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Valori di un ordine al bar letti in modo difensivo (dati salvati o importati). */
function barMealNutrients(meal: { nutrients?: Partial<Nutrients> } | undefined): Nutrients | null {
  const n = meal?.nutrients;
  if (!n || typeof n !== 'object') return null;
  return { kcal: nonNeg(n.kcal), proteinG: nonNeg(n.proteinG), carbG: nonNeg(n.carbG), fatG: nonNeg(n.fatG), fiberG: nonNeg(n.fiberG) };
}

export interface DayNutritionDetail {
  total: Nutrients;
  /** Obiettivo della data (`dayTargetFor`): tipo di giorno effettivo più il minimo di partita e vigilia. */
  target: MacroTarget;
  /** Minimo di carboidrati di partita e vigilia, se vale per la data (`matchCarbs`). */
  matchCarbs: MatchCarbs | null;
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
  state: NutritionState | AppData,
  opts: DayNutritionOptions = {},
): DayNutritionDetail {
  const { dayType, meals } = mealsForDate(date, state);
  const carbScale = dayCarbScale(date, state);
  const log = state.dayLogs[date];
  const status = log?.status ?? {};
  let total: Nutrients = { ...ZERO_NUTRIENTS };
  let veg = 0;
  const bySlot: Partial<Record<MealSlot, Nutrients>> = {};
  for (const m of meals) {
    if (opts.onlyDone) {
      const st = status[`pasto:${m.slot}`];
      if (st === 'sostituito') {
        // Preso con il piano B al bar: valgono i valori dell'ordine, come nella revisione.
        const bar = log?.barMeals?.[m.slot];
        const n = barMealNutrients(bar);
        if (n) {
          bySlot[m.slot] = n;
          total = addNutrients(total, n);
          veg += nonNeg(bar?.vegPortions);
        }
        continue;
      }
      if (st !== 'fatto') continue;
    }
    const n = recipeNutrition(m.recipe, dayType, FOODS, carbScale);
    bySlot[m.slot] = n;
    total = addNutrients(total, n);
    veg += recipeVegPortions(m.recipe, dayType, FOODS, carbScale);
  }
  return { total, target: dayTargetFor(date, state), matchCarbs: matchCarbs(date, state), vegPortions: veg, bySlot, dayType, carbScale };
}

/** Somma dei pasti del giorno (sostituzioni di ricetta comprese). */
export function dayNutrition(date: ISODate, state: NutritionState | AppData, opts: DayNutritionOptions = {}): Nutrients {
  return dayNutritionDetail(date, state, opts).total;
}

// ───────────────────────── Avvio graduale delle fibre ─────────────────────────

/**
 * Settimana di avvio delle fibre: 1 nella prima settimana del piano, 2 nella seconda, null dopo (o prima
 * dell'inizio). Chi parte da un consumo basso aumenta le fibre per gradi, con più acqua, per evitare gonfiore.
 */
export function fiberRampWeek(iso: ISODate, plan: Pick<Plan, 'startDate'>): 1 | 2 | null {
  const days = daysBetween(plan.startDate, iso);
  // I giorni di avvio prima del lunedì di inizio (fino a una settimana) fanno parte della prima settimana.
  if (days < -7 || days >= 14) return null;
  return days < 7 ? 1 : 2;
}

/** Quota dell'obiettivo di fibre da puntare nell'avvio: 0,6 la prima settimana, 0,8 la seconda, poi 1. */
export function fiberRampFactor(iso: ISODate, plan: Pick<Plan, 'startDate'>): number {
  const w = fiberRampWeek(iso, plan);
  return w === 1 ? 0.6 : w === 2 ? 0.8 : 1;
}
