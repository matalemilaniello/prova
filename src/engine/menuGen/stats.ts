/**
 * Numeri del menù per il validatore e per il generatore (docs/FASE2.md § 4.10): un solo calcolo, così la ricerca e il
 * controllo finale non possono dire cose diverse.
 *
 * - `recipeStats(id, dayType)`: i valori di una ricetta per tipo di giorno, divisi tra righe fisse e righe di carboidrati
 *   (`carbScaled`, a scala 1): alla scala `k` valgono fisse + k × carboidrati. In cache: la ricerca li legge migliaia di
 *   volte.
 * - `daySummary(ids, day, …)`: la scala dei carboidrati del giorno con la stessa regola di `carbScaleForMeals` (obiettivo,
 *   kcal rimesse dai limiti dell'energia, minimo di 6 g/kg a partita e vigilia), i totali e le violazioni del giorno (H0,
 *   H1, H2, H5 e i legumi al giorno di H3), più il costo del punteggio del giorno.
 * - `weekResult(days, grid, …)`: le regole della settimana (H3, H4, H6 e la preparazione) e il costo della settimana.
 *
 * Classi e pesi: ogni violazione dura pesa `VIOLATION_WEIGHT` per il fattore della sua classe, così la ricerca lascia per
 * prime le regole che si allentano per prime (H6) e non tocca mai H0 e H1 (§ 4.10, «in ordine di priorità»).
 */
import type { DayType, MealSlot, MenuWeek, PrepTask, Recipe, Violation, Weekday } from '../../domain/types';
import { DEFAULT_TARGETS } from '../../data/defaults';
import { FOODS } from '../../data/foods';
import type { FoodFacts } from '../../data/foodFactsTypes';
import { factsOf, inSeason, NEW_FOODS_MAX_PER_WEEK, NEW_SEASONAL_FOODS, seasonAllows } from '../../data/foodFacts';
import { prepComponentOf } from '../../data/prepComponents';
import { RECIPES } from '../../data/recipes';
import { recipeFactsOf, type PrepComponentId } from '../../data/recipeFacts';
import { capitalize, MEAL_SLOT_LABEL, fmtNumber, WEEKDAY_LONG } from '../../lib/format';
import { preventionBan } from '../exclusions';
import { MEAL_SLOTS } from '../menu';
import { CARB_SCALE_MAX, CARB_SCALE_MIN, lineGrams, menuCarbKcal } from '../nutrition';
import {
  DRY_LEGUME_YIELD,
  FREE_SUGAR_MAX_SHARE,
  LEGUME_MEAL_G,
  LEGUME_SERVING_G,
  LEGUME_SERVINGS_MAX_PER_DAY,
  meatShareOf,
  MIN_LEGUME_MEALS,
  MIN_VEG_PORTIONS,
  MIN_WHOLE_GRAIN_G,
  RED_MEAT_MAX_G,
  RED_MEAT_MAX_MEALS,
  RICE_MAX_MEALS,
  VEG_PORTION_G,
} from '../prevention';
import { parseBuyLabel } from '../shopping';
import { FOOTBALL_LUNCH_MAX_FIBER_G } from '../similar';
import type { MenuDayCtx } from './context';

// ───────────────────────── Regole e pesi ─────────────────────────

export type RuleClass = 'H0' | 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6';

/** Peso di una violazione dura durante la ricerca (§ 4.10). */
export const VIOLATION_WEIGHT = 10_000;
/** Fattore per classe: H0 e H1 non si scambiano mai con le altre, H6 si allenta per prima. */
export const CLASS_FACTOR: Record<RuleClass, number> = { H0: 100, H1: 10, H2: 1, H3: 1, H4: 1, H5: 1, H6: 0.5 };

/** H2 (generalizza i numeri di `menu.test.ts`). */
export const KCAL_TOLERANCE = 0.08;
/** H1: partita e vigilia, con il minimo di carboidrati nel piatto. */
export const MATCH_KCAL_TOLERANCE = 0.05;
export const PROTEIN_SLACK_G = 10;
export const PROTEIN_MAX_EXCESS = 0.25;
export const MACRO_TOLERANCE = 0.15;
export const MIN_FAT_SHARE = 0.2;
export const FAT_SLACK_G = 15;
/** A7: fibre al giorno; tetti di 45 g, e di 40 g con il calcio la sera o alla vigilia. */
export const MIN_FIBER_G = 30;
export const MAX_FIBER_G = 45;
export const MAX_FIBER_FOOTBALL_G = 40;
/** A11: settimana di avvio, fibre in salita. */
export const STARTER_FIBER = { min: 22, max: 32 } as const;
/** H4. */
export const MAX_WEEK_PRODUCTS = 40;
export const MIN_PACK_SHARE = 0.5;
/** Doppioni: un solo yogurt, un solo cereale da colazione, un solo salmone, un solo riso. */
export const DUPLICATE_GROUPS: readonly (readonly string[])[] = [
  ['yogurt-greco-0', 'yogurt-greco-2', 'skyr'],
  ['avena', 'muesli', 'fiocchi-mais', 'fette-biscottate', 'crackers-integrali'],
  ['salmone', 'salmone-affumicato'],
  ['riso-basmati', 'riso-integrale'],
];
/** H6. */
export const FISH_MEALS = { min: 2, max: 3 } as const;
export const EGG_MEALS = { min: 2, max: 3 } as const;
export const MAX_SAME_BREAKFAST = 3;
export const MIN_BREAKFASTS = 3;
export const MAX_SAME_SNACK_WEEK = 3;
/** Lo stesso spuntino al massimo 5 volte su 14 (con la settimana prima). */
export const MAX_SAME_SNACK_TWO_WEEKS = 5;
export const MAX_SAME_MAIN = 2;
export const MAX_SAME_MAIN_BATCH = 3;
/** Preparazione della domenica: 4-6 compiti, 60-90 minuti. */
export const PREP_TASKS = { min: 4, max: 6 } as const;
export const PREP_MINUTES = { min: 60, max: 90 } as const;
/** Minuti del pasto oltre i quali il punteggio paga (cena di recupero 10). */
export const MEAL_MINUTES: Record<MealSlot, number> = { colazione: 5, spuntino: 5, pranzo: 15, merenda: 5, cena: 20 };
export const RECOVERY_MINUTES = 10;

const SLOT_COUNT = MEAL_SLOTS.length;
/** Grammi di legumi oltre i quali un pranzo o una cena è un piatto di legumi (A8). */
export const LEGUME_MEAL_THRESHOLD_G = LEGUME_MEAL_G;
const MAIN: ReadonlySet<MealSlot> = new Set(['pranzo', 'cena']);
const EPS = 1e-9;

// ───────────────────────── Valori delle ricette ─────────────────────────

/** Valori sommabili: alla scala k valgono fisse + k × carboidrati. */
export interface Part {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number;
  /** Porzioni di frutta e verdura (A6). */
  veg: number;
  /** Equivalente secco dei cereali integrali (A9). */
  wholeGrainG: number;
  freeSugarG: number;
  upfKcal: number;
  redMeatG: number;
  /** Legumi equivalenti cotti (porzione ≥ 60 g). */
  legumeEq: number;
  /** Legumi in grammi (piatto di legumi ≥ 100 g). */
  legumeG: number;
}

export const zeroPart = (): Part => ({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0, veg: 0, wholeGrainG: 0, freeSugarG: 0, upfKcal: 0, redMeatG: 0, legumeEq: 0, legumeG: 0 });

function addInto(acc: Part, p: Part, k = 1): void {
  acc.kcal += p.kcal * k;
  acc.proteinG += p.proteinG * k;
  acc.carbG += p.carbG * k;
  acc.fatG += p.fatG * k;
  acc.fiberG += p.fiberG * k;
  acc.veg += p.veg * k;
  acc.wholeGrainG += p.wholeGrainG * k;
  acc.freeSugarG += p.freeSugarG * k;
  acc.upfKcal += p.upfKcal * k;
  acc.redMeatG += p.redMeatG * k;
  acc.legumeEq += p.legumeEq * k;
  acc.legumeG += p.legumeG * k;
}

/** Valori alla scala `k`. */
export function partAt(st: Pick<RecipeStats, 'fixed' | 'scaled'>, k: number): Part {
  const out = zeroPart();
  addInto(out, st.fixed);
  addInto(out, st.scaled, k);
  return out;
}

/** Un alimento da comprare di una ricetta: grammi fissi e grammi dei carboidrati a scala 1. */
export interface FoodUse {
  id: string;
  /** Posizione dell'alimento in `FOOD_IDS` (conti veloci della spesa). */
  idx: number;
  fixedG: number;
  scaledG: number;
  buyFactor: number;
}

export interface RecipeStats {
  id: string;
  recipe: Recipe;
  dayType: DayType;
  fixed: Part;
  scaled: Part;
  rice: boolean;
  /** Riso lessato in molta acqua e scolato (A5): la ricetta lo dichiara. */
  riceMethodOk: boolean;
  fish: boolean;
  oilyFish: boolean;
  /** Almeno un uovo intero. */
  wholeEgg: boolean;
  /** Legumi presenti (gruppo `legumi`). */
  legumeIds: string[];
  /** Carne alla griglia (penalità, D2). */
  meatGrill: boolean;
  batch: boolean;
  pre: boolean;
  recovery: boolean;
  carry: boolean;
  prepMin: number;
  /** Alimenti da comprare (niente dispensa). */
  foods: FoodUse[];
  /** Tutti gli alimenti, dispensa compresa (H0). */
  allFoods: string[];
  /** Freschi con la stagionalità. */
  seasonal: { id: string; facts: FoodFacts }[];
  prep: PrepComponentId[];
}

const statsCache = new Map<string, RecipeStats | null>();

/** Alimenti e ricette per posizione: i conti della settimana usano array numerici, non mappe di stringhe. */
const FOOD_IDS: readonly string[] = Object.keys(FOODS);
const FOOD_INDEX = new Map(FOOD_IDS.map((id, i) => [id, i]));
const RECIPE_IDS: readonly string[] = Object.keys(RECIPES);
const RECIPE_INDEX = new Map(RECIPE_IDS.map((id, i) => [id, i]));
/** Array di lavoro della spesa di un giorno. */
const DAY_BUY = new Float64Array(FOOD_IDS.length);
const DAY_MEALS = new Uint16Array(FOOD_IDS.length);

/** Valori e fatti di una ricetta per il tipo di giorno, o null se la ricetta non esiste. */
export function recipeStats(id: string, dayType: DayType): RecipeStats | null {
  const key = `${id}|${dayType}`;
  const hit = statsCache.get(key);
  if (hit !== undefined) return hit;
  const recipe = Object.prototype.hasOwnProperty.call(RECIPES, id) ? RECIPES[id] : undefined;
  if (!recipe) {
    statsCache.set(key, null);
    return null;
  }
  const rf = recipeFactsOf(id);
  const fixed = zeroPart();
  const scaled = zeroPart();
  const foods = new Map<string, FoodUse>();
  const all = new Set<string>();
  const seasonal = new Map<string, FoodFacts>();
  const legumeIds = new Set<string>();
  let rice = false;
  let fish = false;
  let oilyFish = false;
  let wholeEgg = false;
  let meat = false;
  for (const line of recipe.ingredients) {
    all.add(line.foodId);
    const food = FOODS[line.foodId];
    const facts = factsOf(line.foodId);
    if (facts?.season) seasonal.set(line.foodId, facts);
    if (!food) continue;
    const g = lineGrams(line, dayType, FOODS, 1);
    if (!(g > 0)) continue;
    const part = line.carbScaled ? scaled : fixed;
    const n = food.per100g;
    part.kcal += (g * n.kcal) / 100;
    part.proteinG += (g * n.proteinG) / 100;
    part.carbG += (g * n.carbG) / 100;
    part.fatG += (g * n.fatG) / 100;
    part.fiberG += (g * n.fiberG) / 100;
    if (food.vegPortionG) part.veg += g / food.vegPortionG;
    else if (facts && (facts.group === 'verdura' || facts.group === 'frutta')) part.veg += g / VEG_PORTION_G;
    if (facts) {
      if (facts.wholeGrainDry) part.wholeGrainG += g * facts.wholeGrainDry;
      if (facts.freeSugarG) part.freeSugarG += (g * facts.freeSugarG) / 100;
      if (facts.upf) part.upfKcal += (g * n.kcal) / 100;
      if (facts.group === 'carne-rossa') part.redMeatG += g * meatShareOf(facts);
      if (facts.group === 'legumi') {
        part.legumeEq += g * (DRY_LEGUME_YIELD[line.foodId] ?? 1);
        part.legumeG += g;
        legumeIds.add(line.foodId);
      }
      if (facts.group === 'pesce' || facts.group === 'pesce-grasso') fish = true;
      if (facts.group === 'pesce-grasso') oilyFish = true;
      if (facts.group === 'carne-rossa' || facts.group === 'pollame' || facts.group === 'carne-lavorata') meat = true;
      if (facts.rice) rice = true;
    }
    if (line.foodId === 'uova' && line.unit === 'pezzo' && line.qty >= 1) wholeEgg = true;
    if (!food.pantry) {
      const use = foods.get(food.id) ?? { id: food.id, idx: FOOD_INDEX.get(food.id) ?? 0, fixedG: 0, scaledG: 0, buyFactor: food.buyFactor ?? 1 };
      if (line.carbScaled) use.scaledG += g;
      else use.fixedG += g;
      foods.set(food.id, use);
    }
  }
  const st: RecipeStats = {
    id,
    recipe,
    dayType,
    fixed,
    scaled,
    rice,
    riceMethodOk: !rice || Boolean(rf?.riceMethod),
    fish,
    oilyFish,
    wholeEgg,
    legumeIds: [...legumeIds],
    meatGrill: meat && Boolean(rf?.cooking.includes('griglia')),
    batch: Boolean(recipe.batch),
    pre: recipe.tags.includes('pre-calcio'),
    recovery: recipe.tags.includes('recupero'),
    carry: Boolean(rf?.carry),
    prepMin: Number.isFinite(recipe.prepMin) ? recipe.prepMin : 0,
    foods: [...foods.values()],
    allFoods: [...all],
    seasonal: [...seasonal.entries()].map(([fid, facts]) => ({ id: fid, facts })),
    prep: rf?.prep ? [...rf.prep] : [],
  };
  statsCache.set(key, st);
  return st;
}

// ───────────────────────── Raccolta delle violazioni ─────────────────────────

/** Dove sta una violazione; `cells` (solo per la ricerca) dà le caselle che la toccano. */
export interface Where {
  day?: number;
  slot?: MealSlot;
  key?: string;
  cells?: () => number[];
}

/**
 * Raccoglie le violazioni (con i messaggi) oppure ne somma solo i pesi, durante la ricerca. Il peso cresce con la
 * distanza dal limite (`magnitude`, al massimo il quadruplo): così la ricerca vede anche i passi che avvicinano al limite
 * senza raggiungerlo, e una violazione vale sempre almeno `VIOLATION_WEIGHT` per il fattore della classe.
 */
export class Sink {
  penalty = 0;
  count = 0;
  readonly list: Violation[] | null;
  /** Caselle coinvolte (giorno × 5 + pasto): la ricerca le prova per prime. */
  readonly cells = new Set<number>();
  private readonly trackCells: boolean;

  constructor(collect: boolean, trackCells = true) {
    this.list = collect ? [] : null;
    this.trackCells = trackCells;
  }

  add(cls: RuleClass, code: string, message: () => string, where?: Where, value?: number, limit?: number, magnitude = 0): void {
    this.penalty += VIOLATION_WEIGHT * CLASS_FACTOR[cls] * (1 + Math.min(3, Math.max(0, Number.isFinite(magnitude) ? magnitude : 3)));
    this.count++;
    if (this.trackCells) {
      if (where?.day !== undefined && where.slot) this.cells.add(where.day * SLOT_COUNT + MEAL_SLOTS.indexOf(where.slot));
      else if (where?.day !== undefined) for (let s = 0; s < SLOT_COUNT; s++) this.cells.add(where.day * SLOT_COUNT + s);
      if (where?.cells) for (const c of where.cells()) this.cells.add(c);
    }
    if (!this.list) return;
    const w: Violation['where'] = {};
    if (where?.day !== undefined) w.day = where.day as Weekday;
    if (where?.slot) w.slot = where.slot;
    if (where?.key) w.key = where.key;
    this.list.push({
      code,
      hard: true,
      ...(Object.keys(w).length ? { where: w } : {}),
      ...(value !== undefined && Number.isFinite(value) ? { value: Math.round(value * 10) / 10 } : {}),
      ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
      message: message(),
    });
  }
}

const dayLabel = (d: number) => capitalize(WEEKDAY_LONG[d as Weekday]);
const slotLabel = (slot: MealSlot) => MEAL_SLOT_LABEL[slot].toLowerCase();
const at = (d: number, slot: MealSlot) => `${dayLabel(d)}, ${slotLabel(slot)}`;
const foodName = (id: string) => (FOODS[id]?.name ?? id).replace(/,\s*\p{L}+$/u, '').toLowerCase();
const recipeName = (id: string) => RECIPES[id]?.name ?? id;
const g0 = (n: number) => fmtNumber(Math.round(n));

// ───────────────────────── Giorno ─────────────────────────

export interface MealStat {
  slot: MealSlot;
  st: RecipeStats;
  /** Valori alla scala del giorno. */
  n: Part;
}

export interface DaySummary {
  /** Ricette per pasto, nell'ordine di MEAL_SLOTS ('' = vuoto). */
  ids: string[];
  scale: number;
  /** Scala che servirebbe per il minimo di carboidrati, senza limiti; null senza minimo. */
  neededScale: number | null;
  totals: Part;
  meals: (MealStat | null)[];
  legumeServings: number;
  /** Spesa del giorno per alimento (posizione in `FOOD_IDS`, grammi da comprare, pasti). */
  buys: { idx: number; buyG: number; meals: number }[];
  /** Conteggi del giorno per le regole della settimana. */
  counts: DayCounts;
  /** Costo del punteggio del giorno (senza le violazioni). */
  soft: number;
  /** Violazioni del giorno. */
  sink: Sink;
}

/** Pasti del giorno che contano nelle regole della settimana. */
export interface DayCounts {
  redMeat: number;
  rice: number;
  /** Pranzi e cene con un piatto di legumi (≥ 100 g). */
  legumeMeals: number;
  fish: number;
  oilyFish: number;
  eggs: number;
  /** Frutta di stagione nel mese. */
  seasonalFruit: string[];
  /** Freschi nuovi del menù generato (`NEW_SEASONAL_FOODS`). */
  newFoods: string[];
}

/** Opzioni del punteggio (solo per il generatore). */
export interface ScoreCtx {
  weightKg: number;
  doneRate: Readonly<Record<string, number>>;
  swappedAway: Readonly<Record<string, number>>;
}

const clampScale = (x: number) => (Number.isFinite(x) ? Math.min(CARB_SCALE_MAX, Math.max(CARB_SCALE_MIN, x)) : 1);

/**
 * Scala dei carboidrati del giorno, la stessa di `carbScaleForMeals` (e quindi di `dayCarbScale` per un menù approvato):
 * 1 + (kcal del giorno − kcal predefinite) / kcal delle righe di carboidrati, e almeno quella del minimo di partita.
 */
export function scaleOfDay(meals: readonly (RecipeStats | null)[], day: MenuDayCtx): { scale: number; needed: number | null } {
  const ref = DEFAULT_TARGETS[day.dayType]?.kcal;
  const kcal = Number(day.scaleKcal ?? day.target?.kcal);
  const delta = Number.isFinite(kcal) && kcal > 0 && ref ? kcal - ref : 0;
  const floor = typeof day.carbFloorG === 'number' && Number.isFinite(day.carbFloorG) && day.carbFloorG > 0 ? day.carbFloorG : 0;
  if (!delta && !floor) return { scale: 1, needed: null };
  let scaledKcal = 0;
  let scaledCarb = 0;
  let fixedCarb = 0;
  let any = false;
  for (const m of meals) {
    if (!m) continue;
    any = true;
    scaledKcal += m.scaled.kcal;
    scaledCarb += m.scaled.carbG;
    fixedCarb += m.fixed.carbG;
  }
  const base = any && scaledKcal > 0 ? scaledKcal : menuCarbKcal(day.dayType);
  const scale = delta && base > 0 ? clampScale(1 + delta / base) : 1;
  if (!floor) return { scale, needed: null };
  if (!any || !(scaledCarb > 0)) return { scale, needed: fixedCarb >= floor ? 1 : Infinity };
  const needed = (floor - fixedCarb) / scaledCarb;
  return { scale: needed > scale ? clampScale(needed) : scale, needed };
}

export interface DayRules {
  month: number;
  excluded: ReadonlySet<string>;
  starter: boolean;
}

/** Le ricette ammesse in una casella, a prescindere dai valori (H0, H1 statico, H5): i bacini del generatore. */
export function staticCellIssues(st: RecipeStats, slot: MealSlot, d: number, day: MenuDayCtx, rules: DayRules, sink: Sink): void {
  const where = { day: d, slot };
  const r = st.recipe;
  if (!r.slots.includes(slot)) sink.add('H1', 'pasto-sbagliato', () => `${at(d, slot)}: ${r.name} non è una ricetta per questo pasto.`, where);
  for (const f of st.allFoods) {
    if (preventionBan(f)) sink.add('H0', 'vietato', () => `${at(d, slot)}: ${r.name} contiene ${foodName(f)}, che non entra mai nel menù.`, { ...where, key: f });
    else if (rules.excluded.has(f)) sink.add('H0', 'escluso', () => `${at(d, slot)}: ${r.name} contiene ${foodName(f)}, che hai tolto dal piano.`, { ...where, key: f });
  }
  for (const s of st.seasonal) {
    if (!seasonAllows(s.facts, rules.month)) sink.add('H5', 'fuori-stagione', () => `${at(d, slot)}: ${foodName(s.id)} è fuori stagione.`, { ...where, key: s.id });
  }
  const evening = day.eveningFootball;
  if (slot === 'merenda') {
    if (evening && !st.pre) sink.add('H1', 'pre-calcio', () => `${at(d, slot)}: con il calcio la sera serve un pre-calcio.`, where);
    if (!evening && st.pre && !day.matchEve) sink.add('H1', 'pre-calcio', () => `${at(d, slot)}: il pre-calcio serve solo nei giorni di calcio.`, where);
  }
  if (slot === 'cena') {
    if (evening && !st.recovery) sink.add('H1', 'recupero', () => `${at(d, slot)}: dopo il calcio serve una cena di recupero.`, where);
    if (!evening && st.recovery) sink.add('H1', 'recupero', () => `${at(d, slot)}: la cena di recupero serve solo dopo il calcio.`, where);
  }
  if (st.legumeIds.length) {
    if (day.matchEve && slot === 'cena') sink.add('H1', 'legumi-vigilia', () => `${at(d, slot)}: alla vigilia della partita niente legumi a cena.`, where);
    const football = day.footballDay ?? day.eveningFootball;
    if (football && (slot !== 'pranzo' || st.legumeIds.some((id) => id !== 'lenticchie-rosse'))) {
      sink.add('H1', 'legumi-calcio', () => `${at(d, slot)}: nei giorni di calcio solo lenticchie rosse, e solo a pranzo.`, where);
    }
  }
  if (st.batch && d === 6) sink.add('H1', 'preparazione-domenica', () => `${at(d, slot)}: la domenica si cucina sul momento, senza ricette da preparazione.`, where);
  if (day.carry?.includes(slot) && !st.carry) sink.add('H1', 'da-portare', () => `${at(d, slot)}: il pasto cade nel lavoro e serve una ricetta da portare.`, where);
  if (!st.riceMethodOk) sink.add('H3', 'riso-cottura', () => `${at(d, slot)}: il riso va lessato in molta acqua e scolato.`, where);
}

/** Il giorno: scala, totali, violazioni e costo del punteggio. */
/**
 * `staticChecked`: chi chiama sa già che ogni ricetta del giorno passa H0, H1 statico e H5 (il generatore, con le ricette
 * dei bacini) e il controllo si salta.
 */
export function daySummary(ids: readonly string[], d: number, day: MenuDayCtx, rules: DayRules, collect: boolean, score?: ScoreCtx, staticChecked = false): DaySummary {
  const sink = new Sink(collect);
  const stats = MEAL_SLOTS.map((_, s) => (ids[s] ? recipeStats(ids[s], day.dayType) : null));
  const { scale, needed } = scaleOfDay(stats, day);
  const totals = zeroPart();
  const meals: (MealStat | null)[] = [];
  let legumeServings = 0;
  let soft = 0;
  const month = rules.month;
  for (let s = 0; s < SLOT_COUNT; s++) {
    const slot = MEAL_SLOTS[s];
    const st = stats[s];
    if (!st) {
      meals.push(null);
      sink.add('H1', 'pasto-vuoto', () => (ids[s] ? `${at(d, slot)}: la ricetta non esiste.` : `${at(d, slot)}: nessuna ricetta valida per questo pasto.`), { day: d, slot });
      continue;
    }
    const n = partAt(st, scale);
    addInto(totals, n);
    meals.push({ slot, st, n });
    if (n.legumeEq >= LEGUME_SERVING_G - EPS) legumeServings++;
    if (!staticChecked) staticCellIssues(st, slot, d, day, rules, sink);
    if (slot === 'pranzo' && (day.footballDay ?? day.eveningFootball) && n.fiberG > FOOTBALL_LUNCH_MAX_FIBER_G + EPS) {
      sink.add('H1', 'fibre-pranzo-calcio', () => `${at(d, slot)}: prima del calcio al massimo ${FOOTBALL_LUNCH_MAX_FIBER_G} g di fibre a pranzo (${g0(n.fiberG)} g).`, { day: d, slot }, n.fiberG, FOOTBALL_LUNCH_MAX_FIBER_G);
    }
    if (score) {
      const recovery = slot === 'cena' && day.eveningFootball;
      if (slot === 'colazione' || MAIN.has(slot)) {
        const min = Math.max(0.3 * score.weightKg, recovery ? 30 : 0);
        if (n.proteinG < min) soft += 2 * (min - n.proteinG);
      }
      if (MAIN.has(slot) && n.veg < 1 - EPS) soft += 2;
      const limit = recovery ? RECOVERY_MINUTES : MEAL_MINUTES[slot];
      if (st.prepMin > limit) soft += st.prepMin - limit;
      for (const x of st.seasonal) if (!x.facts.season?.strict && !inSeason(x.facts, month)) soft += 3;
      if (st.meatGrill) soft += 0.5;
      soft += 3 * (score.swappedAway[st.id] ?? 0);
      if ((score.doneRate[st.id] ?? 0) >= 0.7) soft -= 1;
    }
  }

  const where = { day: d };
  const target = day.target;
  const kcalDev = target?.kcal > 0 ? totals.kcal / target.kcal - 1 : 0;
  const match = day.matchDay || day.matchEve;
  if (match && day.carbFloorG) {
    if (needed !== null && needed > CARB_SCALE_MAX + EPS) {
      sink.add('H1', 'carboidrati-partita', () => `${dayLabel(d)}: con questi pasti i ${g0(day.carbFloorG ?? 0)} g di carboidrati non si raggiungono.`, where, needed, CARB_SCALE_MAX, (needed - CARB_SCALE_MAX) * 4);
    }
  }
  if (match) {
    if (Math.abs(kcalDev) > MATCH_KCAL_TOLERANCE + EPS) {
      sink.add('H1', 'carboidrati-partita', () => `${dayLabel(d)}: ${g0(totals.kcal)} kcal su ${g0(target.kcal)}, oltre il 5%.`, where, totals.kcal, target.kcal, (Math.abs(kcalDev) - MATCH_KCAL_TOLERANCE) * 20);
    }
  } else if (Math.abs(kcalDev) > KCAL_TOLERANCE + EPS) {
    sink.add('H2', 'kcal-giorno', () => `${dayLabel(d)}: ${g0(totals.kcal)} kcal su ${g0(target.kcal)}, oltre l’8%.`, where, totals.kcal, target.kcal, (Math.abs(kcalDev) - KCAL_TOLERANCE) * 20);
  }
  if (target) {
    const pMin = target.proteinG - PROTEIN_SLACK_G;
    const pMax = target.proteinG * (1 + PROTEIN_MAX_EXCESS);
    if (totals.proteinG < pMin - EPS || totals.proteinG > pMax + EPS) {
      const off = totals.proteinG < pMin ? pMin - totals.proteinG : totals.proteinG - pMax;
      sink.add('H2', 'proteine-giorno', () => `${dayLabel(d)}: ${g0(totals.proteinG)} g di proteine su ${g0(target.proteinG)}.`, where, totals.proteinG, target.proteinG, off / 10);
    }
    const carbOff = target.carbG > 0 ? Math.abs(totals.carbG / target.carbG - 1) - MACRO_TOLERANCE : 0;
    if (carbOff > EPS) {
      sink.add('H2', 'carboidrati-giorno', () => `${dayLabel(d)}: ${g0(totals.carbG)} g di carboidrati su ${g0(target.carbG)}.`, where, totals.carbG, target.carbG, carbOff * 20);
    }
    const fatShare = totals.kcal > 0 ? (totals.fatG * 9) / totals.kcal : 0;
    const fatOff = Math.max(
      target.fatG > 0 ? (Math.abs(totals.fatG / target.fatG - 1) - MACRO_TOLERANCE) * 20 : 0,
      (MIN_FAT_SHARE - fatShare) * 50,
      (target.fatG - FAT_SLACK_G - totals.fatG) / 10,
    );
    if (fatOff > EPS) {
      sink.add('H2', 'grassi-giorno', () => `${dayLabel(d)}: ${g0(totals.fatG)} g di grassi su ${g0(target.fatG)}.`, where, totals.fatG, target.fatG, fatOff);
    }
  }
  const fiberMin = rules.starter ? STARTER_FIBER.min : MIN_FIBER_G;
  // Avvio: 22-32 g alla porzione del giorno; con il minimo di partita il pane in più porta fibre, e vale il tetto del calcio.
  const footballCap = day.eveningFootball || day.matchEve ? MAX_FIBER_FOOTBALL_G : MAX_FIBER_G;
  const fiberMax = rules.starter ? (day.carbFloorG ? MAX_FIBER_FOOTBALL_G : STARTER_FIBER.max) : footballCap;
  if (totals.fiberG < fiberMin - EPS || totals.fiberG > fiberMax + EPS) {
    const off = totals.fiberG < fiberMin ? fiberMin - totals.fiberG : totals.fiberG - fiberMax;
    sink.add('H2', 'fibre-giorno', () => `${dayLabel(d)}: ${g0(totals.fiberG)} g di fibre, tra ${fiberMin} e ${fiberMax}.`, where, totals.fiberG, totals.fiberG < fiberMin ? fiberMin : fiberMax, off / 5);
  }
  if (totals.veg < MIN_VEG_PORTIONS - EPS) {
    sink.add('H2', 'vegetali-giorno', () => `${dayLabel(d)}: ${fmtNumber(totals.veg, 1)} porzioni di frutta e verdura, ne servono ${MIN_VEG_PORTIONS}.`, where, totals.veg, MIN_VEG_PORTIONS, MIN_VEG_PORTIONS - totals.veg);
  }
  if (legumeServings > LEGUME_SERVINGS_MAX_PER_DAY) {
    sink.add('H3', 'legumi-giorno', () => `${dayLabel(d)}: legumi in ${legumeServings} pasti, al massimo uno al giorno.`, where, legumeServings, LEGUME_SERVINGS_MAX_PER_DAY, legumeServings - LEGUME_SERVINGS_MAX_PER_DAY - 1);
  }

  if (score && target?.kcal > 0) {
    const dev = Math.abs(kcalDev);
    if (dev > 0.03) soft += 40 * (dev - 0.03) * 100;
    const fiberGoal = Math.max(MIN_FIBER_G, Math.min(day.fiberTargetG, 35));
    if (totals.fiberG < fiberGoal) soft += 3 * (fiberGoal - totals.fiberG);
    const vegG = totals.veg * VEG_PORTION_G;
    if (vegG < 600) soft += (3 * (600 - vegG)) / 50;
  }

  const touched: number[] = [];
  for (const m of meals) {
    if (!m) continue;
    for (const u of m.st.foods) {
      const grams = u.fixedG + u.scaledG * scale;
      if (!(grams > 0)) continue;
      if (DAY_MEALS[u.idx] === 0) touched.push(u.idx);
      DAY_BUY[u.idx] += grams * u.buyFactor;
      DAY_MEALS[u.idx]++;
    }
  }
  const buys = touched.map((idx) => ({ idx, buyG: DAY_BUY[idx], meals: DAY_MEALS[idx] }));
  const counts: DayCounts = { redMeat: 0, rice: 0, legumeMeals: 0, fish: 0, oilyFish: 0, eggs: 0, seasonalFruit: [], newFoods: [] };
  for (const m of meals) {
    if (!m) continue;
    if (m.n.redMeatG > EPS) counts.redMeat++;
    if (m.st.rice) counts.rice++;
    if (MAIN.has(m.slot) && m.n.legumeG >= LEGUME_MEAL_G - EPS) counts.legumeMeals++;
    if (m.st.fish) counts.fish++;
    if (m.st.oilyFish) counts.oilyFish++;
    if (m.st.wholeEgg) counts.eggs++;
    for (const x of m.st.seasonal) {
      if (x.facts.group === 'frutta' && inSeason(x.facts, month)) counts.seasonalFruit.push(x.id);
      if (NEW_SEASONAL_FOODS.has(x.id)) counts.newFoods.push(x.id);
    }
  }
  for (const idx of touched) {
    DAY_BUY[idx] = 0;
    DAY_MEALS[idx] = 0;
  }
  return { ids: [...ids], scale, neededScale: needed, totals, meals, legumeServings, buys, counts, soft, sink };
}

// ───────────────────────── Settimana ─────────────────────────

/** Grammi della confezione di un alimento ("barattolo da 400 g", "confezione da 6" uova), se la si conosce. */
export function packGrams(foodId: string): number | undefined {
  if (packCache.has(foodId)) return packCache.get(foodId);
  const f = FOODS[foodId];
  const info = parseBuyLabel(f?.buyLabel, f);
  const grams = !info ? undefined : info.grams ? info.grams : info.pieces && f?.unitGrams.pezzo ? info.pieces * f.unitGrams.pezzo : undefined;
  packCache.set(foodId, grams);
  return grams;
}

const packCache = new Map<string, number | undefined>();

/** A lunga conservazione: surgelati, dispensa, pane e cereali, legumi secchi (una confezione aspetta la settimana dopo). */
export function isLongLife(foodId: string): boolean {
  const f = FOODS[foodId];
  if (!f) return false;
  return f.category === 'Surgelati' || f.category === 'Dispensa' || f.category === 'Pane e cereali' || (f.category === 'Legumi' && (f.buyFactor ?? 1) < 1);
}

export interface Purchase {
  buyG: number;
  meals: number;
}

/** Spesa di una settimana dai riepiloghi dei giorni: grammi da comprare e pasti per alimento. */
export function purchasesOf(days: readonly DaySummary[]): Map<string, Purchase> {
  const out = new Map<string, Purchase>();
  for (const day of days) {
    for (const b of day.buys) {
      const id = FOOD_IDS[b.idx];
      const p = out.get(id);
      if (p) {
        p.buyG += b.buyG;
        p.meals += b.meals;
      } else out.set(id, { buyG: b.buyG, meals: b.meals });
    }
  }
  return out;
}

/** Spesa della settimana negli array di lavoro (riusati: una sola valutazione alla volta). */
const BUY_G = new Float64Array(FOOD_IDS.length);
const BUY_MEALS = new Uint16Array(FOOD_IDS.length);
const PREV_BUY = new WeakMap<Map<string, Purchase>, Float64Array>();

function prevBuyOf(prev: Map<string, Purchase> | undefined): Float64Array | null {
  if (!prev) return null;
  let hit = PREV_BUY.get(prev);
  if (!hit) {
    hit = new Float64Array(FOOD_IDS.length).fill(-1);
    for (const [id, p] of prev) {
      const i = FOOD_INDEX.get(id);
      if (i !== undefined) hit[i] = p.buyG;
    }
    PREV_BUY.set(prev, hit);
  }
  return hit;
}

const DUPLICATE_IDX: readonly (readonly number[])[] = DUPLICATE_GROUPS.map((g) => g.map((id) => FOOD_INDEX.get(id) ?? -1).filter((i) => i >= 0));
const LONG_LIFE: readonly boolean[] = FOOD_IDS.map((id) => isLongLife(id));
const PACK: readonly (number | undefined)[] = FOOD_IDS.map((id) => packGrams(id));

/** Contatori per ricetta negli array di lavoro. */
const COUNT_BREAKFAST = new Uint8Array(RECIPE_IDS.length);
const COUNT_SNACK = new Uint8Array(RECIPE_IDS.length);
const COUNT_SPUNTINO = new Uint8Array(RECIPE_IDS.length);
const COUNT_MAIN = new Uint8Array(RECIPE_IDS.length);

/** Spesa approssimata di un menù (porzioni a scala 1 del tipo di giorno): serve alla settimana prima. */
export function weekPurchasesAtScale1(week: MenuWeek | undefined, dayTypes: readonly DayType[]): Map<string, Purchase> {
  const out = new Map<string, Purchase>();
  if (!week?.days) return out;
  week.days.forEach((day, d) => {
    for (const slot of MEAL_SLOTS) {
      const id = day?.meals?.[slot];
      const st = id ? recipeStats(id, dayTypes[d] ?? 'palestra') : null;
      if (!st) continue;
      for (const u of st.foods) {
        const g = u.fixedG + u.scaledG;
        if (!(g > 0)) continue;
        const p = out.get(u.id) ?? { buyG: 0, meals: 0 };
        p.buyG += g * u.buyFactor;
        p.meals++;
        out.set(u.id, p);
      }
    }
  });
  return out;
}

export interface PrepSummary {
  tasks: number;
  minutes: number;
  /** Ricette da preparazione (lunedì-sabato) senza un compito della domenica. */
  uncovered: { day: number; slot: MealSlot; id: string }[];
}

/**
 * Ricette da preparazione della settimana, dal lunedì al sabato, come coppie giorno-ricetta (giorno × 1000 + posizione
 * della ricetta) in ordine crescente: due menù con le stesse ricette da preparazione negli stessi giorni hanno lo stesso
 * elenco.
 */
export function batchLayout(grid: readonly string[]): number[] {
  const out: number[] = [];
  for (let c = 0; c < 6 * SLOT_COUNT; c++) {
    const id = grid[c];
    if (!id || !RECIPES[id]?.batch) continue;
    out.push(Math.floor(c / SLOT_COUNT) * 1000 + (RECIPE_INDEX.get(id) ?? 999));
  }
  return out.sort((a, b) => a - b);
}

const componentCache = new Map<string, readonly PrepComponentId[]>();

/**
 * Componenti della preparazione di una ricetta: quelli dichiarati dalle ricette da preparazione, oppure i sacchetti della
 * frutta secca per le ricette da portare che la contengono (`PrepComponent.portionsOf`).
 */
export function recipeComponents(id: string): readonly PrepComponentId[] {
  const hit = componentCache.get(id);
  if (hit) return hit;
  const r = Object.prototype.hasOwnProperty.call(RECIPES, id) ? RECIPES[id] : undefined;
  const rf = recipeFactsOf(id);
  let out: PrepComponentId[] = [];
  if (r?.batch) out = [...(rf?.prep ?? [])];
  else if (r && rf?.carry) {
    for (const c of PORTION_COMPONENTS) if (r.ingredients.some((l) => c.portionsOf.includes(l.foodId))) out.push(c.id);
  }
  componentCache.set(id, out);
  return out;
}

/** Componenti della preparazione usati da una griglia (lunedì-sabato), compresi i sacchetti della frutta secca. */
export function componentsOf(grid: readonly string[]): PrepComponentId[] {
  const set = new Set<PrepComponentId>();
  for (let c = 0; c < 6 * SLOT_COUNT; c++) {
    const id = grid[c];
    if (id) for (const x of recipeComponents(id)) set.add(x);
  }
  return [...set];
}

const PORTION_COMPONENTS: { id: PrepComponentId; portionsOf: readonly string[] }[] = (['sacchetti-frutta-secca'] as PrepComponentId[])
  .map((id) => prepComponentOf(id))
  .filter((c): c is NonNullable<typeof c> => Boolean(c?.portionsOf))
  .map((c) => ({ id: c.id, portionsOf: c.portionsOf ?? [] }));

/** Preparazione di una settimana: compiti scritti (il seme o quelli generati) e ricette da preparazione coperte. */
export function prepSummaryOf(grid: readonly string[], prep: readonly PrepTask[]): PrepSummary {
  const covered = new Set(prep.flatMap((t) => t.recipeIds ?? []));
  const uncovered: PrepSummary['uncovered'] = [];
  for (let d = 0; d < 6; d++) {
    for (let s = 0; s < SLOT_COUNT; s++) {
      const id = grid[d * SLOT_COUNT + s];
      if (id && RECIPES[id]?.batch && !covered.has(id)) uncovered.push({ day: d, slot: MEAL_SLOTS[s], id });
    }
  }
  return { tasks: prep.length, minutes: prep.reduce((a, t) => a + (Number.isFinite(t.minutes) ? t.minutes : 0), 0), uncovered };
}

/** Preparazione generata da componenti, solo i numeri (per la ricerca): compiti e minuti. */
export function componentPrepSummary(grid: readonly string[]): PrepSummary {
  const comps = componentsOf(grid);
  return { tasks: comps.length, minutes: comps.reduce((a, c) => a + (prepComponentOf(c)?.minutes ?? 0), 0), uncovered: [] };
}

export interface WeekCtx {
  rules: DayRules;
  days: readonly MenuDayCtx[];
  /** Settimana prima: «5 su 14», confezioni, prodotti nuovi e pasti cambiati. */
  previous?: MenuWeek;
  previousPurchases?: Map<string, Purchase>;
  /** Solo per il punteggio. */
  score?: ScoreCtx & {
    /** Ricette da preparazione del seme (giorno-ricetta): oltre una cambiata, il punteggio paga. */
    seedBatch: readonly number[];
  };
}

export interface WeekResult {
  sink: Sink;
  soft: number;
  products: number;
  /** Solo raccogliendo le violazioni. */
  purchases?: Map<string, Purchase>;
}

const previousGrid = (week: MenuWeek | undefined): string[] => {
  const out: string[] = [];
  for (let d = 0; d < 7; d++) for (const slot of MEAL_SLOTS) out.push(week?.days?.[d]?.meals?.[slot] ?? '');
  return out;
};

const prevGridCache = new WeakMap<MenuWeek, string[]>();
function gridOfWeek(week: MenuWeek | undefined): string[] {
  if (!week) return previousGrid(undefined);
  let hit = prevGridCache.get(week);
  if (!hit) {
    hit = previousGrid(week);
    prevGridCache.set(week, hit);
  }
  return hit;
}

/** Caselle della griglia (lunedì-domenica) che soddisfano una condizione sulla ricetta: per le priorità della ricerca. */
function cellsWhere(days: readonly DaySummary[], pred: (m: MealStat) => boolean, slots?: readonly number[]): () => number[] {
  return () => {
    const out: number[] = [];
    days.forEach((day, d) =>
      day.meals.forEach((m, s) => {
        if (m && (!slots || slots.includes(s)) && pred(m)) out.push(d * SLOT_COUNT + s);
      }),
    );
    return out;
  };
}

const ALL = () => true;

/** Le regole della settimana (H3, H4, H6, preparazione) e il punteggio della settimana. */
export function weekResult(
  days: readonly DaySummary[],
  grid: readonly string[],
  prep: PrepSummary,
  ctx: WeekCtx,
  collect: boolean,
  opts: { trackCells?: boolean; layout?: readonly number[] } = {},
): WeekResult {
  const sink = new Sink(collect, opts.trackCells ?? collect);
  const starter = ctx.rules.starter;
  let redMeatMeals = 0;
  let redMeatG = 0;
  let riceMeals = 0;
  let legumeMeals = 0;
  let wholeGrainG = 0;
  let kcal = 0;
  let freeSugarG = 0;
  let upfKcal = 0;
  let fishMeals = 0;
  let oilyFishMeals = 0;
  let eggMeals = 0;
  const seasonalFruit = new Set<string>();
  const newFoods = new Set<string>();
  for (const day of days) {
    kcal += day.totals.kcal;
    wholeGrainG += day.totals.wholeGrainG;
    freeSugarG += day.totals.freeSugarG;
    upfKcal += day.totals.upfKcal;
    redMeatG += day.totals.redMeatG;
    const c = day.counts;
    redMeatMeals += c.redMeat;
    riceMeals += c.rice;
    legumeMeals += c.legumeMeals;
    fishMeals += c.fish;
    oilyFishMeals += c.oilyFish;
    eggMeals += c.eggs;
    for (const id of c.seasonalFruit) seasonalFruit.add(id);
    for (const id of c.newFoods) newFoods.add(id);
  }
  const nDays = Math.max(1, days.length);

  // H3 · prevenzione della settimana
  if (redMeatMeals > RED_MEAT_MAX_MEALS || redMeatG > RED_MEAT_MAX_G + EPS) {
    sink.add(
      'H3',
      'carne-rossa-settimana',
      () => `Carne rossa in ${redMeatMeals} pasti, ${g0(redMeatG)} g cotti: al massimo una porzione e ${RED_MEAT_MAX_G} g.`,
      { cells: cellsWhere(days, (m) => m.n.redMeatG > EPS) },
      redMeatG,
      RED_MEAT_MAX_G,
      Math.max(redMeatMeals - RED_MEAT_MAX_MEALS - 1, (redMeatG - RED_MEAT_MAX_G) / 50),
    );
  }
  if (riceMeals > RICE_MAX_MEALS) {
    sink.add('H3', 'riso-settimana', () => `Riso in ${riceMeals} pasti: al massimo ${RICE_MAX_MEALS} a settimana.`, { cells: cellsWhere(days, (m) => m.st.rice) }, riceMeals, RICE_MAX_MEALS, (riceMeals - RICE_MAX_MEALS - 1) * 0.5);
  }
  if (!starter && legumeMeals < MIN_LEGUME_MEALS) {
    sink.add('H3', 'legumi-settimana', () => `Legumi in ${legumeMeals} pasti principali: ne servono almeno ${MIN_LEGUME_MEALS}.`, { cells: cellsWhere(days, ALL, [2, 4]) }, legumeMeals, MIN_LEGUME_MEALS, (MIN_LEGUME_MEALS - legumeMeals - 1) * 0.5);
  }
  const wholeAvg = wholeGrainG / nDays;
  if (!starter && wholeAvg < MIN_WHOLE_GRAIN_G - EPS) {
    sink.add('H3', 'integrali-settimana', () => `Cereali integrali: ${g0(wholeAvg)} g al giorno in media, ne servono ${MIN_WHOLE_GRAIN_G}.`, { cells: cellsWhere(days, ALL) }, wholeAvg, MIN_WHOLE_GRAIN_G, (MIN_WHOLE_GRAIN_G - wholeAvg) / 20);
  }
  const sugarShare = kcal > 0 ? (freeSugarG * 4) / kcal : 0;
  if (sugarShare >= FREE_SUGAR_MAX_SHARE) {
    sink.add('H3', 'zuccheri-liberi', () => `Zuccheri liberi al ${fmtNumber(sugarShare * 100, 1)}% delle kcal: devono stare sotto il 5%.`, { cells: cellsWhere(days, (m) => m.n.freeSugarG > EPS) }, sugarShare, FREE_SUGAR_MAX_SHARE, (sugarShare - FREE_SUGAR_MAX_SHARE) * 100);
  }

  // H4 · spesa
  const used: number[] = [];
  for (const day of days) {
    for (const b of day.buys) {
      if (BUY_MEALS[b.idx] === 0) used.push(b.idx);
      BUY_G[b.idx] += b.buyG;
      BUY_MEALS[b.idx] += b.meals;
    }
  }
  const products = used.length;
  const usingFood = (ids: readonly string[]) => cellsWhere(days, (m) => m.st.foods.some((u) => ids.includes(u.id)));
  // Il tetto dei 40 prodotti vale per ogni menù generato, anche nel ripiego (§ 13.4, test 13): pesa come H1.
  if (products > MAX_WEEK_PRODUCTS) {
    sink.add('H1', 'prodotti', () => `La spesa sale a ${products} prodotti: al massimo ${MAX_WEEK_PRODUCTS}.`, { cells: cellsWhere(days, ALL) }, products, MAX_WEEK_PRODUCTS, (products - MAX_WEEK_PRODUCTS - 1) * 0.5);
  }
  const prevBuy = prevBuyOf(ctx.previousPurchases);
  if (!starter) {
    for (const i of used) {
      const pack = PACK[i];
      if (!pack) continue;
      const buyG = BUY_G[i];
      const share = buyG / pack;
      if (share >= MIN_PACK_SHARE - EPS) continue;
      const twoWeeks = (buyG + Math.max(0, prevBuy?.[i] ?? 0)) / pack >= MIN_PACK_SHARE - EPS;
      if (!LONG_LIFE[i] || (BUY_MEALS[i] < 2 && !twoWeeks)) {
        const id = FOOD_IDS[i];
        sink.add('H4', 'confezione', () => `${capitalize(foodName(id))}: si usa meno di metà confezione.`, { key: id, cells: usingFood([id]) }, buyG, pack * MIN_PACK_SHARE, (MIN_PACK_SHARE - share) * 2);
      }
    }
  }
  for (const group of DUPLICATE_IDX) {
    let n = 0;
    for (const i of group) if (BUY_MEALS[i] > 0) n++;
    if (n > 1) {
      const ids = group.filter((i) => BUY_MEALS[i] > 0).map((i) => FOOD_IDS[i]);
      sink.add('H4', 'doppione', () => `Doppione nella spesa: ${ids.map(foodName).join(' e ')}.`, { key: ids.join('+'), cells: usingFood(ids) }, n, 1, n - 2);
    }
  }
  let freshProducts = 0;
  if (prevBuy) for (const i of used) if (prevBuy[i] < 0) freshProducts++;
  const purchases = collect ? new Map(used.map((i) => [FOOD_IDS[i], { buyG: BUY_G[i], meals: BUY_MEALS[i] }])) : undefined;
  for (const i of used) {
    BUY_G[i] = 0;
    BUY_MEALS[i] = 0;
  }
  if (newFoods.size > NEW_FOODS_MAX_PER_WEEK) {
    sink.add(
      'H4',
      'prodotti-nuovi',
      () => `${newFoods.size} freschi nuovi nella stessa settimana: al massimo ${NEW_FOODS_MAX_PER_WEEK}.`,
      { cells: usingFood([...newFoods]) },
      newFoods.size,
      NEW_FOODS_MAX_PER_WEEK,
      newFoods.size - NEW_FOODS_MAX_PER_WEEK - 1,
    );
  }

  // Preparazione
  for (const u of prep.uncovered) {
    sink.add('H1', 'preparazione', () => `${at(u.day, u.slot)}: ${recipeName(u.id)} non ha il suo compito nella preparazione della domenica.`, { day: u.day, slot: u.slot });
  }

  // H6 · varietà
  const layout = opts.layout ?? batchLayout(grid);
  if (!starter) {
    if (fishMeals < FISH_MEALS.min || fishMeals > FISH_MEALS.max) {
      const off = fishMeals < FISH_MEALS.min ? FISH_MEALS.min - fishMeals : fishMeals - FISH_MEALS.max;
      sink.add('H6', 'varieta', () => `Pesce in ${fishMeals} pasti: tra ${FISH_MEALS.min} e ${FISH_MEALS.max} a settimana.`, { key: 'pesce', cells: fishMeals > FISH_MEALS.max ? cellsWhere(days, (m) => m.st.fish) : cellsWhere(days, ALL, [2, 4]) }, fishMeals, undefined, (off - 1) * 0.5);
    }
    if (eggMeals < EGG_MEALS.min || eggMeals > EGG_MEALS.max) {
      const off = eggMeals < EGG_MEALS.min ? EGG_MEALS.min - eggMeals : eggMeals - EGG_MEALS.max;
      sink.add('H6', 'varieta', () => `Uova in ${eggMeals} pasti: tra ${EGG_MEALS.min} e ${EGG_MEALS.max} a settimana.`, { key: 'uova', cells: eggMeals > EGG_MEALS.max ? cellsWhere(days, (m) => m.st.wholeEgg) : cellsWhere(days, ALL) }, eggMeals, undefined, (off - 1) * 0.5);
    }
    const breakfasts = countInto(COUNT_BREAKFAST, grid, [0]);
    const snacks = countInto(COUNT_SNACK, grid, [1, 3]);
    const spuntini = countInto(COUNT_SPUNTINO, grid, [1]);
    const mains = countInto(COUNT_MAIN, grid, [2, 4]);
    const sameId = (id: string, slots: readonly number[]) => cellsWhere(days, (m) => m.st.id === id, slots);
    for (const [id, n] of breakfasts) {
      if (n > MAX_SAME_BREAKFAST) sink.add('H6', 'varieta', () => `${recipeName(id)} a colazione ${n} volte: al massimo ${MAX_SAME_BREAKFAST}.`, { key: id, cells: sameId(id, [0]) }, n, MAX_SAME_BREAKFAST, (n - MAX_SAME_BREAKFAST - 1) * 0.5);
    }
    if (breakfasts.size < MIN_BREAKFASTS) {
      sink.add('H6', 'varieta', () => `Solo ${breakfasts.size} colazioni diverse: ne servono almeno ${MIN_BREAKFASTS}.`, { key: 'colazioni', cells: cellsWhere(days, ALL, [0]) }, breakfasts.size, MIN_BREAKFASTS, MIN_BREAKFASTS - breakfasts.size - 1);
    }
    for (const [id, n] of snacks) {
      if (n > MAX_SAME_SNACK_WEEK) sink.add('H6', 'varieta', () => `${recipeName(id)} tra spuntini e merende ${n} volte: al massimo ${MAX_SAME_SNACK_WEEK}.`, { key: id, cells: sameId(id, [1, 3]) }, n, MAX_SAME_SNACK_WEEK, (n - MAX_SAME_SNACK_WEEK - 1) * 0.5);
    }
    if (ctx.previous) {
      const prev = gridOfWeek(ctx.previous);
      for (const [id, n] of spuntini) {
        let before = 0;
        for (let d = 0; d < 7; d++) if (prev[d * SLOT_COUNT + 1] === id) before++;
        const total = n + before;
        if (total > MAX_SAME_SNACK_TWO_WEEKS) sink.add('H6', 'varieta', () => `${recipeName(id)} come spuntino ${total} volte in due settimane: al massimo ${MAX_SAME_SNACK_TWO_WEEKS}.`, { key: id, cells: sameId(id, [1]) }, total, MAX_SAME_SNACK_TWO_WEEKS, (total - MAX_SAME_SNACK_TWO_WEEKS - 1) * 0.5);
      }
    }
    for (const [id, n] of mains) {
      const max = RECIPES[id]?.batch ? MAX_SAME_MAIN_BATCH : MAX_SAME_MAIN;
      if (n > max) sink.add('H6', 'varieta', () => `${recipeName(id)} tra pranzi e cene ${n} volte: al massimo ${max}.`, { key: id, cells: sameId(id, [2, 4]) }, n, max, (n - max - 1) * 0.5);
    }
    for (const s of [2, 4]) {
      for (let d = 0; d + 2 < 7; d++) {
        const id = grid[d * SLOT_COUNT + s];
        if (id && grid[(d + 1) * SLOT_COUNT + s] === id && grid[(d + 2) * SLOT_COUNT + s] === id) {
          sink.add('H6', 'varieta', () => `${recipeName(id)} a ${slotLabel(MEAL_SLOTS[s])} tre giorni di fila.`, { key: id, cells: () => [d * SLOT_COUNT + s, (d + 1) * SLOT_COUNT + s, (d + 2) * SLOT_COUNT + s] });
        }
      }
    }
    {
      const off = Math.max(PREP_TASKS.min - prep.tasks, prep.tasks - PREP_TASKS.max, 0) + Math.max(PREP_MINUTES.min - prep.minutes, prep.minutes - PREP_MINUTES.max, 0) / 15;
      if (off > EPS) {
        sink.add(
          'H6',
          'preparazione-tempo',
          () => `Preparazione della domenica: ${prep.tasks} compiti e ${g0(prep.minutes)} minuti, tra ${PREP_TASKS.min}-${PREP_TASKS.max} compiti e ${PREP_MINUTES.min}-${PREP_MINUTES.max} minuti.`,
          { key: 'preparazione', cells: cellsWhere(days, (m) => m.st.batch || m.st.carry) },
          prep.minutes,
          undefined,
          off - 1,
        );
      }
    }
  }

  // Punteggio della settimana
  let soft = 0;
  const score = ctx.score;
  if (score) {
    if (wholeAvg < 120) soft += (2 * (120 - wholeAvg)) / 10;
    if (redMeatG > 110) soft += (2 * (redMeatG - 110)) / 25;
    if (riceMeals > 2) soft += 2 * (riceMeals - 2);
    if (oilyFishMeals === 0) soft += 3;
    const upfShare = kcal > 0 ? upfKcal / kcal : 0;
    if (upfShare > 0.05) soft += ((upfShare - 0.05) * 100) / 2;
    if (products > 34) soft += 10 * (products - 34);
    if (prevBuy) soft += 2 * freshProducts;
    if (ctx.previous) {
      const prev = gridOfWeek(ctx.previous);
      let changed = 0;
      for (let d = 0; d < 7; d++) for (const s of [2, 4]) if ((grid[d * SLOT_COUNT + s] ?? '') !== (prev[d * SLOT_COUNT + s] ?? '')) changed++;
      if (changed > 5) soft += 15 * (changed - 5) ** 2;
    }
    let batchChanged = 0;
    for (const x of layout) if (!score.seedBatch.includes(x)) batchChanged++;
    for (const x of score.seedBatch) if (!layout.includes(x)) batchChanged++;
    if (batchChanged > 1) soft += 20 * (batchChanged - 1);
    if (seasonalFruit.size > 1) soft -= 2 * (seasonalFruit.size - 1);
  }
  return { sink, soft, products, ...(purchases ? { purchases } : {}) };
}

/** Conta le ricette delle colonne `slots` negli array di lavoro e restituisce le coppie ricetta-volte (azzerando gli array). */
function countInto(counts: Uint8Array, grid: readonly string[], slots: readonly number[]): Map<string, number> {
  const touched: number[] = [];
  for (let d = 0; d < 7; d++) {
    for (const s of slots) {
      const id = grid[d * SLOT_COUNT + s];
      if (!id) continue;
      const i = RECIPE_INDEX.get(id);
      if (i === undefined) continue;
      if (counts[i] === 0) touched.push(i);
      counts[i]++;
    }
  }
  const out = new Map<string, number>();
  for (const i of touched) {
    out.set(RECIPE_IDS[i], counts[i]);
    counts[i] = 0;
  }
  return out;
}

/** Le ricette di un menù come griglia: 7 giorni × 5 pasti, '' dove manca. */
export function gridOf(week: MenuWeek): string[] {
  return previousGrid(week);
}

/** Il menù da una griglia, con la preparazione data. */
export function weekOf(grid: readonly string[], prep: PrepTask[]): MenuWeek {
  const days = Array.from({ length: 7 }, (_, d) => {
    const meals: Partial<Record<MealSlot, string>> = {};
    for (let s = 0; s < SLOT_COUNT; s++) {
      const id = grid[d * SLOT_COUNT + s];
      if (id) meals[MEAL_SLOTS[s]] = id;
    }
    return { meals };
  });
  return { days, prep };
}

export { SLOT_COUNT };
