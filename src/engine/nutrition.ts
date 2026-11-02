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
 *
 * Limiti dell'energia (fase 2, `engine/energy.ts`): con un deficit in vigore, i giorni in cui supera quello ammesso
 * (partita, vigilia, zona sotto il ginocchio sopra soglia, precampionato, tetto del 20%) riprendono le kcal in più
 * dalle stesse righe di carboidrati (`dayEnergyDelta`). Senza deficit niente cambia.
 */
import type {
  AppData,
  DayLog,
  DayType,
  EatenMeal,
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
import { dayEnergyDelta } from './energy';
import { effectiveDayType, isMatchDay, isMatchEve, mealsForDate, type MenuState } from './menu';
import { MATCH_CARB_G_PER_KG, PROTEIN_G_PER_KG } from './targets';

/**
 * Stato per i valori di una data: quello del menù più, se ci sono, controlli e profilo per il peso (minimo di
 * carboidrati di partita e vigilia) e, con le revisioni, per il deficit in vigore (limiti dell'energia). Passa sempre
 * anche `checkIns`, `profile` e `reviews` quando li hai.
 */
export type NutritionState = MenuState & Partial<Pick<AppData, 'checkIns' | 'profile' | 'reviews'>>;

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
  return carbPartsOf(recipeIds.map((id) => (id ? RECIPES[id] : undefined)), dayType, foods);
}

/** Come `carbParts`, su ricette già risolte. */
function carbPartsOf(recipes: (Recipe | undefined)[], dayType: DayType, foods: Record<string, Food> = FOODS): CarbParts {
  const out: CarbParts = { scaledKcal: 0, scaledCarbG: 0, fixedCarbG: 0 };
  for (const r of recipes) {
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
  /** Carboidrati dell'obiettivo del tipo di giorno, con quelli rimessi dai limiti dell'energia (`energyAdjust`). */
  baseG: number;
  /** Carboidrati aggiunti per arrivare al minimo (0 se l'obiettivo lo raggiunge già). */
  extraG: number;
  /** Kcal aggiunte (4 kcal/g, arrotondate a 10). */
  extraKcal: number;
}

/**
 * Kcal che i limiti dell'energia rimettono nell'obiettivo della data (`dayEnergyDelta`) e i carboidrati che le portano
 * (4 kcal/g, arrotondati a 5 g come le correzioni della revisione). Zero senza deficit.
 */
export function energyAdjust(date: ISODate, state: NutritionState): { kcal: number; carbG: number } {
  const kcal = state.plan ? dayEnergyDelta(date, state) : 0;
  return { kcal, carbG: kcal > 0 ? Math.round(kcal / 4 / 5) * 5 : 0 };
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
  const baseG = (Number(plan.targets?.[effectiveDayType(date, plan)]?.carbG) || 0) + energyAdjust(date, state).carbG;
  const floorG = Math.round((MATCH_CARB_G_PER_KG * weightKg) / 5) * 5;
  const extraG = Math.max(0, floorG - baseG);
  return { when, weightKg, gPerKg: MATCH_CARB_G_PER_KG, floorG, baseG, extraG, extraKcal: Math.round((extraG * 4) / 10) * 10 };
}

/**
 * Obiettivo della data: quello del tipo di giorno effettivo (la vigilia vale come calcio), più le kcal che i limiti
 * dell'energia rimettono quel giorno (`energyAdjust`, dai carboidrati), più il minimo di carboidrati di partita e
 * vigilia. È l'obiettivo da mostrare accanto ai valori del giorno.
 */
export function dayTargetFor(date: ISODate, state: NutritionState): MacroTarget {
  const base = state.plan.targets[effectiveDayType(date, state.plan)];
  if (!base) return base;
  const e = energyAdjust(date, state);
  const m = matchCarbs(date, state);
  if (!e.kcal && !m?.extraG) return base;
  return {
    ...base,
    carbG: base.carbG + e.carbG + (m?.extraG ?? 0),
    kcal: base.kcal + e.kcal + (m?.extraKcal ?? 0),
  };
}

/**
 * Scala dei carboidrati di un insieme di ricette (la regola di dayCarbScale su ricette date): la differenza tra le kcal
 * di `target` e quelle dell'obiettivo su cui è tarato il menù (`DEFAULT_TARGETS`) passa dalle righe di carboidrati di
 * quelle ricette; con `carbFloorG` (il minimo di partita e vigilia) la scala sale almeno quanto serve perché i loro
 * carboidrati ci arrivino. Tra 0,6 e 1,6. Serve anche al generatore del menù, che prova ricette che non sono nel piano.
 */
export function carbScaleForMeals(recipes: (Recipe | undefined)[], dayType: DayType, target: MacroTarget, carbFloorG?: number): number {
  const ref = DEFAULT_TARGETS[dayType]?.kcal;
  const cur = Number(target?.kcal);
  const delta = Number.isFinite(cur) && cur > 0 && ref ? cur - ref : 0;
  const floor = typeof carbFloorG === 'number' && Number.isFinite(carbFloorG) && carbFloorG > 0 ? carbFloorG : 0;
  if (!delta && !floor) return 1;
  const parts = recipes.length ? carbPartsOf(recipes, dayType) : null;
  const base = parts && parts.scaledKcal > 0 ? parts.scaledKcal : menuCarbKcal(dayType);
  const scale = scaleFrom(delta, base);
  if (!floor || !parts || !(parts.scaledCarbG > 0)) return scale;
  const needed = (floor - parts.fixedCarbG) / parts.scaledCarbG;
  return needed > scale ? clampScale(needed) : scale;
}

/**
 * Scala delle righe di carboidrati per la data: la differenza di kcal dell'obiettivo divisa per le kcal
 * delle righe di carboidrati del menù previsto quel giorno. Così il totale del giorno segue l'obiettivo
 * (+150 kcal nel piano → circa +150 kcal nel piatto). Il giorno della partita e la vigilia la scala sale
 * almeno quanto serve perché i carboidrati del menù previsto arrivino al minimo (`matchCarbs`): nel piatto ci
 * sono davvero 6 g/kg, non solo nell'obiettivo. Il menù previsto è quello che `mealsForDate` dà senza le
 * sostituzioni del diario (lo strato 2 del menù, § 6.4): nei giorni di avvio è il menù di avvio, non la rotazione.
 * È `carbScaleForMeals` su quelle ricette.
 */
export function dayCarbScale(date: ISODate, state: NutritionState): number {
  const dayType = effectiveDayType(date, state.plan);
  // Le kcal rimesse dai limiti dell'energia passano dalle righe di carboidrati, come la differenza dell'obiettivo.
  const delta = targetDelta(dayType, state.plan) + energyAdjust(date, state).kcal;
  const match = matchCarbs(date, state);
  if (!delta && !match?.extraG) return 1;
  const recipes = mealsForDate(date, { plan: state.plan, dayLogs: {} }).meals.map((m) => RECIPES[m.plannedId]);
  const ref = DEFAULT_TARGETS[dayType];
  const target: MacroTarget = { ...(state.plan.targets?.[dayType] ?? ref), kcal: ref.kcal + delta };
  return carbScaleForMeals(recipes, dayType, target, match?.extraG ? match.floorG : undefined);
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

/**
 * Parole di un alimento contato a pezzi. Con l'unità 'pezzo' la porzione nomina l'alimento invece di dire
 * "pezzo": "6 pezzi e mezzo" di gallette diventano "7 gallette", "mezzo pezzo" di limone "mezzo limone".
 */
export interface PieceWords {
  one: string;
  many: string;
  /** Femminile: "mezza banana", "una banana e mezza". */
  fem?: boolean;
  /** Articolo del singolare quando non è "un" o "una": "uno spicchio", "un’arancia". */
  art?: string;
  /** Sostantivo con l'aggettivo, singolare e plurale, per la frase con il nome: "piadina integrale", "cipolle rosse". */
  full?: [string, string];
  /**
   * Complemento che chiude la frase con il nome, dopo "e mezzo" e "abbondante" come in "un cucchiaio abbondante di
   * olio": "2 gallette abbondanti di riso", "una scatoletta e mezza di sgombro".
   */
  of?: string;
}

/** Parole per id di alimento, per tutti gli alimenti che hanno `unitGrams.pezzo`. */
export const PIECE_WORDS: Record<string, PieceWords> = {
  'gallette-riso': { one: 'galletta', many: 'gallette', fem: true, of: 'di riso' },
  'piadina-integrale': { one: 'piadina', many: 'piadine', fem: true, full: ['piadina integrale', 'piadine integrali'] },
  'crackers-integrali': { one: 'pacchetto', many: 'pacchetti', of: 'di cracker integrali' },
  tonno: { one: 'scatoletta', many: 'scatolette', fem: true, of: 'di tonno' },
  sgombro: { one: 'scatoletta', many: 'scatolette', fem: true, of: 'di sgombro' },
  uova: { one: 'uovo', many: 'uova' },
  albume: { one: 'albume', many: 'albumi' },
  grana: { one: 'tocchetto', many: 'tocchetti', of: 'di grana' },
  mela: { one: 'mela', many: 'mele', fem: true },
  pera: { one: 'pera', many: 'pere', fem: true },
  banana: { one: 'banana', many: 'banane', fem: true },
  arancia: { one: 'arancia', many: 'arance', fem: true, art: 'un’' },
  clementine: { one: 'clementina', many: 'clementine', fem: true },
  kiwi: { one: 'kiwi', many: 'kiwi' },
  datteri: { one: 'dattero', many: 'datteri' },
  spinaci: { one: 'cubetto', many: 'cubetti', of: 'di spinaci' },
  zucchine: { one: 'zucchina', many: 'zucchine', fem: true },
  pomodorini: { one: 'pomodorino', many: 'pomodorini' },
  carote: { one: 'carota', many: 'carote', fem: true },
  'cipolla-rossa': { one: 'cipolla', many: 'cipolle', fem: true, full: ['cipolla rossa', 'cipolle rosse'] },
  cetriolo: { one: 'cetriolo', many: 'cetrioli' },
  peperoni: { one: 'peperone', many: 'peperoni' },
  patate: { one: 'patata', many: 'patate', fem: true },
  limone: { one: 'limone', many: 'limoni' },
  mandorle: { one: 'mandorla', many: 'mandorle', fem: true },
  noci: { one: 'noce', many: 'noci', fem: true },
  'cioccolato-fondente': { one: 'quadretto', many: 'quadretti', of: 'di cioccolato' },
  aglio: { one: 'spicchio', many: 'spicchi', art: 'uno', of: 'd’aglio' },
};

/**
 * Alimenti che si contano solo a unità intere: una galletta da 8 g, un quadretto di cioccolato, un dattero o un
 * uovo non si dividono a metà. La porzione arrotonda all'unità e lo dice con "abbondanti" o "quasi".
 */
export const WHOLE_PIECES: ReadonlySet<string> = new Set([
  'gallette-riso',
  'crackers-integrali',
  'uova',
  'albume',
  'datteri',
  'spinaci',
  'pomodorini',
  'mandorle',
  'noci',
  'cioccolato-fondente',
]);

type HandUnit = Exclude<PortionUnit, 'g' | 'ml'>;

/** Parole dell'alimento quando la riga è a pezzi e l'alimento è noto. */
function pieceWordsFor(unit: HandUnit, foodId: string | undefined): PieceWords | undefined {
  return unit === 'pezzo' && foodId ? PIECE_WORDS[foodId] : undefined;
}

/** Arrotonda a mezze unità (minimo mezza). */
export function roundHalf(q: number): number {
  if (!(q > 0)) return 0;
  return Math.max(0.5, Math.round(q * 2) / 2);
}

/** Quantità già arrotondata a parole: "1 pugno e mezzo", "mezza fetta"; con l'articolo "una banana e mezza". */
function countWords(q: number, w: { one: string; many: string; fem?: boolean; art?: string }, article: boolean): string {
  const whole = Math.floor(q);
  const half = q - whole >= 0.5;
  const mezzo = w.fem ? 'mezza' : 'mezzo';
  if (whole === 0) return `${mezzo} ${w.one}`;
  const art = w.art ?? (w.fem ? 'una' : 'un');
  const base = whole === 1 && article ? `${art}${art.endsWith('’') ? '' : ' '}${w.one}` : `${whole} ${whole === 1 ? w.one : w.many}`;
  return half ? `${base} e ${mezzo}` : base;
}

/** Parole brevi (il sostantivo) o intere (con l'aggettivo) di un alimento a pezzi. */
function pieceForms(p: PieceWords, full: boolean): PieceWords {
  return full && p.full ? { ...p, one: p.full[0], many: p.full[1] } : p;
}

/**
 * "1 pugno e mezzo", "mezza fetta", "2 cucchiai". Con l'unità 'pezzo' e l'id dell'alimento nomina l'alimento:
 * "una banana e mezza", "mezzo limone", "7 gallette" (gli alimenti di `WHOLE_PIECES` arrotondano all'unità).
 */
export function portionWords(qty: number, unit: HandUnit, foodId?: string): string {
  const piece = pieceWordsFor(unit, foodId);
  if (piece) {
    const q = foodId && WHOLE_PIECES.has(foodId) ? Math.max(1, Math.round(qty)) : roundHalf(qty);
    return countWords(q, piece, true);
  }
  return countWords(roundHalf(qty), UNIT_WORDS[unit] ?? { one: unit, many: unit }, false);
}

/** Scarto massimo tra la porzione detta a parole e i grammi, oltre il quale si aggiunge "abbondante" o "quasi". */
export const PORTION_TOLERANCE = 0.1;

type Qualifier = 'esatta' | 'abbondante' | 'quasi' | 'meno';

/** Quantità di riferimento della porzione detta a parole e come si scosta dalla quantità vera. */
function portionRef(qty: number, wholeOnly: boolean): { ref: number; how: Qualifier } {
  if (wholeOnly) {
    const ref = Math.max(1, Math.round(qty));
    if (Math.abs(ref - qty) / qty <= PORTION_TOLERANCE) return { ref, how: 'esatta' };
    if (qty > ref) return { ref, how: 'abbondante' };
    return { ref, how: ref - qty > 0.5 ? 'meno' : 'quasi' };
  }
  const half = roundHalf(qty);
  if (Math.abs(half - qty) / qty <= PORTION_TOLERANCE) return { ref: half, how: 'esatta' };
  const whole = Math.round(qty);
  const ref = whole >= 1 && Math.abs(qty - whole) <= 0.25 ? whole : Math.floor(qty) + 0.5;
  if (qty > ref) return { ref, how: 'abbondante' };
  return { ref, how: ref - qty > 0.25 ? 'meno' : 'quasi' };
}

function qualify(words: string, ref: number, how: Qualifier): string {
  if (how === 'abbondante') return `${words} ${Math.floor(ref) >= 2 ? 'abbondanti' : 'abbondante'}`;
  if (how === 'quasi') return `quasi ${words}`;
  if (how === 'meno') return `meno di ${words}`;
  return words;
}

/** Porzione a parole nelle due forme: breve, accanto al nome dell'ingrediente, e intera, che nomina l'alimento. */
function phraseForms(qty: number, unit: HandUnit, foodId?: string): { short: string; named?: string } {
  const piece = pieceWordsFor(unit, foodId);
  const wholeOnly = Boolean(piece && foodId && WHOLE_PIECES.has(foodId));
  const q = qty > 0 ? qty : wholeOnly ? 1 : 0.5;
  const { ref, how } = qty > 0 ? portionRef(q, wholeOnly) : { ref: q, how: 'esatta' as const };
  if (!piece) return { short: qualify(countWords(ref, UNIT_WORDS[unit] ?? { one: unit, many: unit }, false), ref, how) };
  const named = qualify(countWords(ref, pieceForms(piece, true), true), ref, how);
  return { short: qualify(countWords(ref, pieceForms(piece, false), true), ref, how), named: piece.of ? `${named} ${piece.of}` : named };
}

/**
 * Porzione a parole coerente con i grammi. Se la mezza unità più vicina si discosta di più del 10% dalla quantità
 * vera, lo dice con "abbondante" o "quasi", al massimo un quarto di unità di scarto, e preferisce le unità intere:
 * 1,25 → "1 fetta abbondante", 1,35 → "quasi 1 fetta e mezza", 1,8 → "quasi 2 fette", 0,6 → "mezza fetta
 * abbondante". Così "1 fetta abbondante · ≈ 50 g" torna con la fetta da 40 g.
 * Con l'unità 'pezzo' e l'id dell'alimento nomina l'alimento ("mezzo limone", "quasi una piadina e mezza"); gli
 * alimenti di `WHOLE_PIECES` si contano a unità intere, con al massimo mezza unità di scarto ("7 gallette" per 6,5,
 * "quasi 4 gallette" per 3,5).
 */
export function portionPhrase(qty: number, unit: HandUnit, foodId?: string): string {
  return phraseForms(qty, unit, foodId).short;
}

/** Arrotondamento umano dei grammi: sotto 10 g al grammo, poi a 5 g. */
export function roundGrams(g: number): number {
  if (!(g > 0)) return 0;
  if (g < 10) return Math.max(1, Math.round(g));
  return Math.round(g / 5) * 5;
}

export interface PortionParts {
  /** "1 pugno e mezzo" oppure "150 g" / "200 ml"; a pezzi il sostantivo dell'alimento ("7 gallette", "mezzo limone"). */
  portion: string;
  /** Grammi arrotondati (0 se non noti). */
  grams: number;
  /** "1 pugno e mezzo · ≈ 225 g" */
  text: string;
  /**
   * Solo a pezzi, quando le parole dell'alimento sono note: la porzione che nomina già l'alimento per intero
   * ("7 gallette di riso", "mezzo limone"), da scrivere al posto di "porzione di nome". Vedi `portionWithName`.
   */
  named?: string;
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
  const { short: portion, named } = phraseForms(lineQty(line, dayType, k), line.unit, line.foodId);
  const out: PortionParts = { portion, grams, text: grams ? `${portion} · ≈ ${grams} g` : portion };
  if (named) out.named = named;
  return out;
}

/**
 * Porzione con il nome dell'alimento, per le frasi fuori dalla riga dell'ingrediente: "2 pugni e mezzo di pasta",
 * "7 gallette di riso", "mezzo limone". `name` è il nome già nella forma da frase (es. in minuscolo).
 */
export function portionWithName(parts: Pick<PortionParts, 'portion' | 'named'>, name: string): string {
  return parts.named ?? `${parts.portion} di ${name}`;
}

/** "1 pugno e mezzo · ≈ 225 g", "2 cucchiai · ≈ 20 g", "150 g". */
export function formatPortion(line: IngredientLine, dayType: DayType, foods: Record<string, Food> = FOODS, scale?: CarbScaleInput): string {
  return portionParts(line, dayType, foods, scale).text;
}

// ───────────────────────── Giornata ─────────────────────────

export interface DayNutritionOptions {
  /**
   * Conta solo i pasti segnati come fatti nel diario (voce 'pasto:<slot>' con stato 'fatto') e, per i pasti con un
   * pasto stimato che vale (`eatenMeal`: piano B al bar, foto, piatto salvato), i valori della stima. Default false:
   * valori previsti dal menù.
   */
  onlyDone?: boolean;
}

const nonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Pasto stimato che vale per la voce (§ 7.5), o null. Un `EatenMeal` (ordine al bar, foto, piatto salvato) vale con la
 * voce «sostituito», oppure con la voce «fatto» se era il pasto previsto (`asPlanned`): è la stessa regola con cui lo
 * stato lo tiene o lo toglie (`keepsEatenMeal` in state/store.ts). È l'unico accessorio dei tre lettori: valori del
 * giorno con `onlyDone`, `dayIntake` della revisione, la riga del coach. I valori si leggono in modo difensivo (dati
 * salvati o importati): senza valori numerici il pasto non vale.
 */
export function eatenMeal(log: DayLog | undefined, slot: MealSlot): EatenMeal | null {
  const meal = log?.barMeals?.[slot];
  if (!meal || typeof meal !== 'object') return null;
  const st = log?.status?.[`pasto:${slot}`];
  const counts = st === 'sostituito' || (st === 'fatto' && meal.asPlanned === true);
  if (!counts) return null;
  const n = barMealNutrients(meal);
  return n ? { ...meal, nutrients: n, ...(meal.vegPortions !== undefined ? { vegPortions: nonNeg(meal.vegPortions) } : {}) } : null;
}

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
      // Pasto stimato che vale (bar, foto, piatto salvato): i suoi valori al posto della ricetta, come nella revisione.
      const eaten = eatenMeal(log, m.slot);
      if (eaten) {
        bySlot[m.slot] = eaten.nutrients;
        total = addNutrients(total, eaten.nutrients);
        veg += nonNeg(eaten.vegPortions);
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
 * dell'inizio). Chi parte da un consumo basso aumenta le fibre per gradi, con più acqua, per evitare gonfiore: Oggi
 * mostra il consiglio sulle fibre. Le quantità le decide il menù (nei giorni di avvio circa l'80% dell'obiettivo,
 * `STARTER_FIBER_SHARE` in `data/menu.ts`), non un fattore per settimana.
 */
export function fiberRampWeek(iso: ISODate, plan: Pick<Plan, 'startDate'>): 1 | 2 | null {
  const days = daysBetween(plan.startDate, iso);
  // I giorni di avvio prima del lunedì di inizio (fino a una settimana) fanno parte della prima settimana.
  if (days < -7 || days >= 14) return null;
  return days < 7 ? 1 : 2;
}
