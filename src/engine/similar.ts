/**
 * Alternative con valori simili (docs/FASE2.md § 6.1) e sostituzioni delle esclusioni nel menù in vigore (§ 6.4).
 * Offline e deterministiche: la data e il piano arrivano dagli argomenti, niente orologio né casualità.
 *
 * `mealAlternatives(entry, ctx, limit)`:
 * 1. filtro: stesso pasto; niente alimenti esclusi o vietati (H0); contesto del giorno (H1: merenda pre-calcio e cena di
 *    recupero solo nei giorni con il calcio la sera, pre-calcio ammesso anche alla vigilia; pranzo dei giorni di calcio
 *    con fibre ≤ 20 g; vigilia senza legumi a cena; nei giorni di calcio legumi solo a pranzo e solo lenticchie rosse);
 *    freschi `strict` di stagione; niente ricette da preparazione; nessuna ricetta che porti la settimana oltre un tetto
 *    di H3 (carne rossa, riso, legumi al giorno, zuccheri liberi);
 * 2. banda dei valori alla porzione del giorno: |Δ kcal| ≤ 10%, proteine ≥ −10%, fibre ≥ −20%; se nessuna ricetta ci
 *    entra la banda si allarga (kcal ±20%, proteine −20%, fibre −40%) e il risultato lo dice (`widened`);
 * 3. ordine: quota di alimenti già nella spesa della settimana, poi già spuntati, poi distanza dei valori, minuti,
 *    familiarità (`doneRate`) e id.
 *
 * La scala dei carboidrati di una sostituzione è quella dello strato 1 (`baseCarbScale`: la regola di `dayCarbScale`
 * applicata al menù previsto senza sostituzioni), mai `dayCarbScale`, che legge lo strato 2: la catena finisce sempre
 * (`dayCarbScale` → `mealsForDate` → `weekSubstitutions` → strato 1).
 */
import type { DayType, ISODate, MacroTarget, MealSlot, Nutrients, Plan, Recipe } from '../domain/types';
import { DEFAULT_TARGETS } from '../data/defaults';
import { FOODS } from '../data/foods';
import { factsOf, seasonAllows } from '../data/foodFacts';
import { RECIPES } from '../data/recipes';
import { addDays, isISODate, weekStart } from './dates';
import { excludedFoods, recipeAllowed } from './exclusions';
import { isEveningFootball, scheduleDayOf } from './mealTimes';
import { effectiveDayType, isMatchEve, MEAL_SLOTS, mealsForDate, plannedMealsForDate, type MealEntry, type MenuState } from './menu';
import { carbScaleForMeals, dayCarbScale, energyAdjust, matchCarbs, recipeNutrition } from './nutrition';
import {
  FREE_SUGAR_MAX_SHARE,
  LEGUME_SERVINGS_MAX_PER_DAY,
  mealFromRecipe,
  mealPrevention,
  RED_MEAT_MAX_G,
  RED_MEAT_MAX_MEALS,
  RICE_MAX_MEALS,
  type MealPrevention,
} from './prevention';

// ───────────────────────── Costanti ─────────────────────────

/** Banda dei valori (§ 6.1). */
export const BAND = { kcal: 0.1, protein: 0.1, fiber: 0.2 } as const;
/** Banda allargata quando nessuna ricetta entra in quella normale. */
export const WIDE_BAND = { kcal: 0.2, protein: 0.2, fiber: 0.4 } as const;
/** Fibre massime del pranzo nei giorni di calcio (H1). */
export const FOOTBALL_LUNCH_MAX_FIBER_G = 20;

/** Ricette per data e pasto di una settimana (le caselle senza ricetta mancano). */
export type WeekMeals = Partial<Record<ISODate, Partial<Record<MealSlot, string>>>>;

export interface AlternativeCtx {
  /** Data del pasto. */
  date: ISODate;
  plan: Plan;
  /**
   * Pasti della settimana di `date`, per i tetti di H3 e l'ordine per spesa (la casella del pasto non conta). Senza, il
   * menù in vigore con le sostituzioni (`mealsForDate` senza scambi).
   */
  week?: WeekMeals;
  /** Alimenti esclusi nella data; predefinito `excludedFoods(plan, date)` (esclusioni più divieti A1-A3). */
  excluded?: ReadonlySet<string>;
  /** Scala dei carboidrati del giorno; predefinito `baseCarbScale` (strato 1). */
  scale?: number;
  /** Alimenti della spesa già spuntati: sono in casa. */
  checked?: ReadonlySet<string>;
  /** Quota di «fatto» per ricetta (familiarità). */
  doneRate?: Readonly<Record<string, number>>;
}

export interface AlternativesResult {
  recipes: Recipe[];
  /** Nessuna ricetta nella banda normale: valgono quelle della banda allargata. */
  widened: boolean;
}

// ───────────────────────── Scala dello strato 1 ─────────────────────────

/**
 * Scala dei carboidrati della data sul menù previsto senza sostituzioni (strato 1): la regola di `dayCarbScale` (obiettivo
 * del piano, kcal rimesse dai limiti dell'energia, minimo di carboidrati di partita e vigilia), letta dal solo piano.
 */
export function baseCarbScale(iso: ISODate, plan: Plan): number {
  const dayType = effectiveDayType(iso, plan);
  const state = { plan, dayLogs: {} };
  const ref = DEFAULT_TARGETS[dayType];
  const own = plan.targets?.[dayType] ?? ref;
  const target: MacroTarget = { ...own, kcal: (Number(own?.kcal) || ref.kcal) + energyAdjust(iso, state).kcal };
  const match = matchCarbs(iso, state);
  const recipes = plannedMealsForDate(iso, plan).meals.map((m) => m.recipe);
  return carbScaleForMeals(recipes, dayType, target, match?.extraG ? match.floorG : undefined);
}

// ───────────────────────── Contesto del giorno ─────────────────────────

interface DayCtx {
  dayType: DayType;
  eveningFootball: boolean;
  footballDay: boolean;
  eve: boolean;
  month: number;
}

function dayCtx(iso: ISODate, plan: Plan): DayCtx {
  const day = scheduleDayOf(iso, plan);
  return {
    dayType: effectiveDayType(iso, plan),
    eveningFootball: isEveningFootball(day),
    footballDay: Boolean(day?.football),
    eve: isMatchEve(iso, plan),
    month: Number(iso.slice(5, 7)),
  };
}

const legumeLines = (r: Recipe) => r.ingredients.filter((l) => factsOf(l.foodId)?.group === 'legumi');

/** H1 sul singolo pasto (i vincoli che non dipendono dai valori). */
function fitsDay(r: Recipe, slot: MealSlot, d: DayCtx): boolean {
  const pre = r.tags.includes('pre-calcio');
  const recovery = r.tags.includes('recupero');
  if (slot === 'merenda' && (d.eveningFootball ? !pre : pre && !d.eve)) return false;
  if (slot === 'cena' && (d.eveningFootball ? !recovery : recovery)) return false;
  const legumes = legumeLines(r);
  if (legumes.length) {
    if (d.eve && slot === 'cena') return false;
    if (d.footballDay && (slot !== 'pranzo' || legumes.some((l) => l.foodId !== 'lenticchie-rosse'))) return false;
  }
  return true;
}

/** Tutti i freschi `strict` della ricetta sono di stagione nel mese. */
export function recipeInSeason(recipe: Recipe, month: number): boolean {
  return recipe.ingredients.every((l) => seasonAllows(factsOf(l.foodId), month));
}

// ───────────────────────── Conteggi della settimana ─────────────────────────

interface WeekCounts {
  redMeatMeals: number;
  redMeatG: number;
  riceMeals: number;
  kcal: number;
  freeSugarG: number;
  /** Porzioni di legumi per data. */
  legumeByDay: Map<ISODate, number>;
  /** Alimenti della settimana (la spesa che segue il menù). */
  foods: Set<string>;
}

const preventionCache = new Map<string, MealPrevention>();

/** Numeri di una ricetta alla porzione del tipo di giorno (scala 1): bastano ai tetti e restano in cache. */
function recipePrevention(recipeId: string, dayType: DayType, slot: MealSlot): MealPrevention | null {
  const r = RECIPES[recipeId];
  if (!r) return null;
  const key = `${recipeId}|${dayType}|${slot}`;
  let hit = preventionCache.get(key);
  if (!hit) {
    hit = mealPrevention(mealFromRecipe(r, dayType, 1, 0, slot));
    preventionCache.set(key, hit);
  }
  return hit;
}

function weekCounts(week: WeekMeals, plan: Plan, skip: { date: ISODate; slot: MealSlot }): WeekCounts {
  const c: WeekCounts = { redMeatMeals: 0, redMeatG: 0, riceMeals: 0, kcal: 0, freeSugarG: 0, legumeByDay: new Map(), foods: new Set() };
  for (const [date, slots] of Object.entries(week) as [ISODate, Partial<Record<MealSlot, string>>][]) {
    if (!slots) continue;
    const dayType = effectiveDayType(date, plan);
    for (const slot of MEAL_SLOTS) {
      const id = slots[slot];
      if (!id || (date === skip.date && slot === skip.slot)) continue;
      const m = recipePrevention(id, dayType, slot);
      if (!m) continue;
      if (m.redMeatG > 0) c.redMeatMeals++;
      c.redMeatG += m.redMeatG;
      if (m.rice) c.riceMeals++;
      c.kcal += m.kcal;
      c.freeSugarG += m.freeSugarG;
      if (m.legumeServing) c.legumeByDay.set(date, (c.legumeByDay.get(date) ?? 0) + 1);
      for (const l of RECIPES[id].ingredients) if (!FOODS[l.foodId]?.pantry) c.foods.add(l.foodId);
    }
  }
  return c;
}

/** La ricetta non porta la settimana oltre un tetto di H3 (un contributo nullo non sfora mai). */
function withinWeekCaps(cand: MealPrevention, ref: MealPrevention | null, c: WeekCounts, date: ISODate): boolean {
  if (cand.redMeatG > 0 && (c.redMeatMeals + 1 > RED_MEAT_MAX_MEALS || c.redMeatG + cand.redMeatG > RED_MEAT_MAX_G)) return false;
  if (cand.rice && c.riceMeals + 1 > RICE_MAX_MEALS) return false;
  if (cand.legumeServing && (c.legumeByDay.get(date) ?? 0) + 1 > LEGUME_SERVINGS_MAX_PER_DAY) return false;
  if (cand.freeSugarG > (ref?.freeSugarG ?? 0)) {
    const kcal = c.kcal + cand.kcal;
    if (kcal > 0 && ((c.freeSugarG + cand.freeSugarG) * 4) / kcal >= FREE_SUGAR_MAX_SHARE) return false;
  }
  return true;
}

/** Menù della settimana di `iso` per le alternative: lo strato 2 senza gli scambi del diario. */
function weekInForce(iso: ISODate, plan: Plan): WeekMeals {
  return weekMealsFor(weekStart(iso), { plan, dayLogs: {} });
}

/** Pasti effettivi della settimana che parte da `monday` (con gli scambi del diario che lo stato contiene). */
export function weekMealsFor(monday: ISODate, state: MenuState): WeekMeals {
  const out: WeekMeals = {};
  if (!isISODate(monday)) return out;
  const ws = weekStart(monday);
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const day: Partial<Record<MealSlot, string>> = {};
    for (const m of mealsForDate(d, state).meals) if (m.recipe) day[m.slot] = m.recipeId;
    out[d] = day;
  }
  return out;
}

// ───────────────────────── Alternative ─────────────────────────

interface Scored {
  recipe: Recipe;
  inBand: boolean;
  shop: number;
  checked: number;
  distance: number;
}

function inBandOf(n: Nutrients, ref: Nutrients, band: { kcal: number; protein: number; fiber: number }): boolean {
  if (ref.kcal > 0 && Math.abs(n.kcal - ref.kcal) > ref.kcal * band.kcal + 1e-9) return false;
  if (n.proteinG < ref.proteinG * (1 - band.protein) - 1e-9) return false;
  if (n.fiberG < ref.fiberG * (1 - band.fiber) - 1e-9) return false;
  return true;
}

/** Alternative per il pasto, con l'indicazione della banda allargata. `limit` = quante; senza limite tutte. */
export function alternativesFor(entry: Pick<MealEntry, 'slot' | 'recipeId' | 'plannedId' | 'recipe'> & { excludedFrom?: string }, ctx: AlternativeCtx, limit = Infinity): AlternativesResult {
  const { date, plan } = ctx;
  if (!isISODate(date)) return { recipes: [], widened: false };
  const slot = entry.slot;
  const reference = RECIPES[entry.plannedId] ?? entry.recipe;
  const d = dayCtx(date, plan);
  const scale = ctx.scale ?? baseCarbScale(date, plan);
  const excluded = ctx.excluded ?? excludedFoods(plan, date);
  const week = ctx.week ?? weekInForce(date, plan);
  const counts = weekCounts(week, plan, { date, slot });
  const refNutr = reference ? recipeNutrition(reference, d.dayType, FOODS, scale) : null;
  const refPrev = reference ? mealPrevention(mealFromRecipe(reference, d.dayType, scale, date, slot)) : null;
  const skip = new Set([entry.recipeId, entry.plannedId, entry.excludedFrom].filter(Boolean) as string[]);

  const pool: Scored[] = [];
  for (const r of Object.values(RECIPES)) {
    if (skip.has(r.id) || !r.slots.includes(slot) || r.batch) continue;
    if (!recipeAllowed(r, excluded) || !fitsDay(r, slot, d) || !recipeInSeason(r, d.month)) continue;
    const n = recipeNutrition(r, d.dayType, FOODS, scale);
    if (slot === 'pranzo' && d.footballDay && n.fiberG > FOOTBALL_LUNCH_MAX_FIBER_G + 1e-9) continue;
    const prev = mealPrevention(mealFromRecipe(r, d.dayType, scale, date, slot));
    if (!withinWeekCaps(prev, refPrev, counts, date)) continue;
    const ref = refNutr ?? n;
    if (!inBandOf(n, ref, WIDE_BAND)) continue;
    const foods = [...new Set(r.ingredients.filter((l) => !FOODS[l.foodId]?.pantry).map((l) => l.foodId))];
    const share = (set: ReadonlySet<string> | undefined) => (foods.length && set ? foods.filter((f) => set.has(f)).length / foods.length : 0);
    pool.push({
      recipe: r,
      inBand: inBandOf(n, ref, BAND),
      shop: share(counts.foods),
      checked: share(ctx.checked),
      distance: Math.abs(n.kcal - ref.kcal) / Math.max(ref.kcal, 1) + Math.abs(n.proteinG - ref.proteinG) / Math.max(ref.proteinG, 10),
    });
  }
  const strict = pool.filter((s) => s.inBand);
  const widened = strict.length === 0 && pool.length > 0;
  const list = (widened ? pool : strict).sort(
    (a, b) =>
      b.shop - a.shop ||
      b.checked - a.checked ||
      a.distance - b.distance ||
      a.recipe.prepMin - b.recipe.prepMin ||
      (ctx.doneRate?.[b.recipe.id] ?? 0) - (ctx.doneRate?.[a.recipe.id] ?? 0) ||
      a.recipe.id.localeCompare(b.recipe.id),
  );
  return { recipes: list.slice(0, Math.max(0, limit)).map((s) => s.recipe), widened };
}

/** Alternative con valori simili per un pasto (§ 6.1): le prime `limit`, deterministiche. */
export function mealAlternatives(entry: MealEntry, ctx: AlternativeCtx, limit = 3): Recipe[] {
  return alternativesFor(entry, ctx, limit).recipes;
}

// ───────────────────────── Sostituzioni del menù in vigore (strato 2) ─────────────────────────

export type WeekSubstitutions = Partial<Record<ISODate, Partial<Record<MealSlot, string>>>>;

const NO_SUBSTITUTIONS: WeekSubstitutions = Object.freeze({}) as WeekSubstitutions;
const substitutionCache = new WeakMap<object, Map<ISODate, WeekSubstitutions>>();

/**
 * Sostituzioni delle esclusioni di una settimana (strato 2, § 6.4), giorno per giorno dal lunedì e pasto per pasto in
 * ordine fisso: una ricetta con un alimento escluso (nei giorni da `since`, o vietato) diventa la prima delle sue
 * alternative, con la scala dello strato 1 e i conteggi della settimana aggiornati dalle sostituzioni già fatte. Una
 * casella senza alternative valide vale `''`: resta vuota. Memorizzato per (lunedì, piano).
 */
export function substitutionsForWeek(monday: ISODate, plan: Plan): WeekSubstitutions {
  if (!isISODate(monday)) return NO_SUBSTITUTIONS;
  const ws = weekStart(monday);
  let byWeek = substitutionCache.get(plan);
  if (!byWeek) {
    byWeek = new Map();
    substitutionCache.set(plan, byWeek);
  }
  const hit = byWeek.get(ws);
  if (hit) return hit;
  const result = computeSubstitutions(ws, plan);
  byWeek.set(ws, result);
  return result;
}

function computeSubstitutions(ws: ISODate, plan: Plan): WeekSubstitutions {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const layer1 = dates.map((d) => plannedMealsForDate(d, plan));
  const excludedByDay = dates.map((d) => excludedFoods(plan, d));
  const touched = layer1.some((day, i) => day.meals.some((m) => m.recipe && !recipeAllowed(m.recipe, excludedByDay[i])));
  if (!touched) return NO_SUBSTITUTIONS;
  const week: WeekMeals = {};
  layer1.forEach((day, i) => {
    const slots: Partial<Record<MealSlot, string>> = {};
    for (const m of day.meals) if (m.recipe) slots[m.slot] = m.plannedId;
    week[dates[i]] = slots;
  });
  const out: WeekSubstitutions = {};
  layer1.forEach((day, i) => {
    const date = dates[i];
    const excluded = excludedByDay[i];
    let scale: number | null = null;
    for (const slot of MEAL_SLOTS) {
      const entry = day.bySlot[slot];
      if (!entry?.recipe || recipeAllowed(entry.recipe, excluded)) continue;
      scale ??= baseCarbScale(date, plan);
      const pick = alternativesFor(entry, { date, plan, week, excluded, scale }, 1).recipes[0];
      (out[date] ??= {})[slot] = pick?.id ?? '';
      const slots = week[date] ?? {};
      if (pick) slots[slot] = pick.id;
      else delete slots[slot];
      week[date] = slots;
    }
  });
  return out;
}

// ───────────────────────── Per l'interfaccia ─────────────────────────

/** Quota di «fatto» per ricetta negli ultimi `days` giorni (oggi escluso): familiarità per l'ordine delle alternative. */
export function doneRates(state: MenuState, today: ISODate, days = 28): Record<string, number> {
  const seen = new Map<string, { n: number; done: number }>();
  if (!isISODate(today)) return {};
  for (let i = 1; i <= days; i++) {
    const iso = addDays(today, -i);
    const log = state.dayLogs[iso];
    if (!log) continue;
    for (const m of mealsForDate(iso, state).meals) {
      const st = log.status[`pasto:${m.slot}`];
      if (!st) continue;
      const cur = seen.get(m.recipeId) ?? { n: 0, done: 0 };
      cur.n++;
      if (st === 'fatto') cur.done++;
      seen.set(m.recipeId, cur);
    }
  }
  return Object.fromEntries([...seen.entries()].map(([id, v]) => [id, v.done / v.n]));
}

/**
 * Pasti che cambiano nei `days` giorni da `since` se si escludono gli alimenti (per l'avviso «cambiano 2 pasti da
 * domani»): ricette sostituite, caselle lasciate vuote e scambi del diario che contengono l'alimento (tornano allo
 * strato 2). Si confronta la ricetta che si mangia, scambi dell'utente compresi.
 */
export function exclusionImpact(
  plan: Plan,
  foodIds: string | readonly string[],
  since: ISODate,
  days = 7,
  dayLogs: MenuState['dayLogs'] = {},
): number {
  if (!isISODate(since)) return 0;
  const ids = typeof foodIds === 'string' ? [foodIds] : [...foodIds];
  const after: Plan = {
    ...plan,
    exclusions: [...(plan.exclusions ?? []).filter((e) => !ids.includes(e.foodId)), ...ids.map((foodId) => ({ foodId, since, origin: 'impostazioni' as const }))],
  };
  let n = 0;
  for (let i = 0; i < days; i++) {
    const iso = addDays(since, i);
    const a = mealsForDate(iso, { plan, dayLogs });
    const b = mealsForDate(iso, { plan: after, dayLogs });
    for (const slot of MEAL_SLOTS) if ((a.bySlot[slot]?.recipeId ?? '') !== (b.bySlot[slot]?.recipeId ?? '')) n++;
  }
  return n;
}

/** Un pasto lasciato vuoto dalle esclusioni: data, pasto e ricetta tolta. */
export interface ClearedMeal {
  date: ISODate;
  slot: MealSlot;
  recipeId: string;
}

/** Pasti lasciati vuoti dalle esclusioni nei `days` giorni da `from` (nessuna alternativa valida). */
export function clearedMeals(plan: Plan, from: ISODate, days = 14): ClearedMeal[] {
  const out: ClearedMeal[] = [];
  if (!isISODate(from)) return out;
  for (let i = 0; i < days; i++) {
    const iso = addDays(from, i);
    const cleared = mealsForDate(iso, { plan, dayLogs: {} }).cleared ?? {};
    for (const slot of MEAL_SLOTS) {
      const id = cleared[slot];
      if (id) out.push({ date: iso, slot, recipeId: id });
    }
  }
  return out;
}

/** Vincoli che le esclusioni dell'utente fanno mancare nei giorni a venire (per l'avviso della pagina dei gusti). */
export interface ExclusionWarnings {
  /** Giorni sotto i 30 g di fibre che senza le esclusioni ci arriverebbero. */
  fiberDays: number;
  /** Giorni sotto le 5 porzioni di frutta e verdura che senza le esclusioni ci arriverebbero. */
  vegDays: number;
  /** Pasti rimasti senza un'alternativa valida. */
  cleared: ClearedMeal[];
}

/** Fibre minime del giorno (A7) e porzioni di frutta e verdura (A6) per l'avviso. */
const MIN_FIBER_G = 30;
const MIN_VEG = 5;

function dayValues(iso: ISODate, plan: Plan): { fiberG: number; veg: number } {
  const state = { plan, dayLogs: {} };
  const day = mealsForDate(iso, state);
  const scale = dayCarbScale(iso, state);
  let fiberG = 0;
  let veg = 0;
  for (const m of day.meals) {
    if (!m.recipe) continue;
    fiberG += recipeNutrition(m.recipe, day.dayType, FOODS, scale).fiberG;
    veg += mealPrevention(mealFromRecipe(m.recipe, day.dayType, scale, iso, m.slot)).vegPortions;
  }
  return { fiberG, veg };
}

/**
 * Cosa fanno mancare le esclusioni dell'utente nei `days` giorni da `from`: giorni che scendono sotto le fibre o le
 * porzioni di frutta e verdura solo per le esclusioni (i giorni di avvio, con le fibre in salita, non contano), e pasti
 * rimasti senza alternativa. Vuoto senza esclusioni.
 */
export function exclusionWarnings(plan: Plan, from: ISODate, days = 14): ExclusionWarnings {
  const out: ExclusionWarnings = { fiberDays: 0, vegDays: 0, cleared: [] };
  if (!plan.exclusions?.length || !isISODate(from)) return out;
  const without: Plan = { ...plan };
  delete without.exclusions;
  for (let i = 0; i < days; i++) {
    const iso = addDays(from, i);
    if (plannedMealsForDate(iso, plan).starter) continue;
    const a = dayValues(iso, without);
    const b = dayValues(iso, plan);
    if (b.fiberG < MIN_FIBER_G - 1e-9 && a.fiberG >= MIN_FIBER_G - 1e-9) out.fiberDays++;
    if (b.veg < MIN_VEG - 1e-9 && a.veg >= MIN_VEG - 1e-9) out.vegDays++;
  }
  out.cleared = clearedMeals(plan, from, days);
  return out;
}
