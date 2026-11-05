/**
 * Ingressi del generatore del menù (docs/FASE2.md § 4.10). `menuGenInput` è l'unico pezzo del generatore che legge lo
 * stato: tipi di giorno dal piano proiettato (partita, vigilia, calcio la sera, palestra, riposo), obiettivi della data
 * con i limiti dell'energia e il minimo di carboidrati, rampa delle fibre, pasti da portare (orario di lavoro), seme,
 * settimana prima, gusti dedotti dal diario ed esclusioni. `validateMenuWeek` e `generateMenuWeek` dipendono solo dai
 * loro ingressi: si provano con ingressi scritti a mano.
 */
import type { AppData, DayType, ISODate, MacroTarget, MealSlot, MenuWeek, Plan, Violation, Weekday } from '../../domain/types';
import { DEFAULT_TARGETS } from '../../data/defaults';
import { RECIPES } from '../../data/recipes';
import { addDays, isISODate, weekStart } from '../dates';
import { excludedFoods } from '../exclusions';
import { isEveningFootball, mealTimesFor, scheduleDayOf } from '../mealTimes';
import { effectiveDayType, isMatchDay, isMatchEve, MEAL_SLOTS, mealsForDate, menuWeekFor, menuWeekInForce } from '../menu';
import { dayTargetFor, energyAdjust, matchCarbs, referenceWeightKg, type NutritionState } from '../nutrition';
import { weekStats } from '../review';
import { doneRates } from '../similar';
import { PROTEIN_G_PER_KG } from '../targets';

// ───────────────────────── Tipi (locali dei motori, fuori dal contratto) ─────────────────────────

/** Contesto di un giorno del menù. */
export interface MenuDayCtx {
  iso: ISODate;
  /** Effettivo: la vigilia mangia come il calcio. */
  dayType: DayType;
  matchDay: boolean;
  matchEve: boolean;
  /** Calcio la sera: merenda pre-calcio e cena di recupero. */
  eveningFootball: boolean;
  /**
   * Calcio nel giorno, a qualunque ora: pranzo con al massimo 20 g di fibre e legumi solo a pranzo, solo lenticchie rosse
   * (H1). Assente = come `eveningFootball`.
   */
  footballDay?: boolean;
  /** Obiettivo della data (`dayTargetFor`): limiti dell'energia e minimo di partita compresi. */
  target: MacroTarget;
  /** 6 g/kg a partita e vigilia, solo quando l'obiettivo del tipo di giorno non ci arriva da solo. */
  carbFloorG?: number;
  /**
   * Kcal con cui si calcola la scala dei carboidrati, come `dayCarbScale`: obiettivo del tipo di giorno più le kcal
   * rimesse dai limiti dell'energia, senza quelle del minimo di partita (le porta il minimo). Assente = `target.kcal`.
   */
  scaleKcal?: number;
  /** Rampa delle fibre (§ 4.10): soglia del punteggio, mai sotto il minimo di A7. */
  fiberTargetG: number;
  /** Pasti da portare (cadono nel lavoro e non si spostano, `mealTimesFor`): solo ricette che si portano via. */
  carry?: readonly MealSlot[];
}

export interface MenuGenInput {
  monday: ISODate;
  /** 7 giorni, dal lunedì. */
  days: MenuDayCtx[];
  /** Mese del mercoledì della settimana (1-12). */
  month: number;
  /** Ultima settimana approvata, altrimenti la rotazione di quel lunedì. */
  seed: MenuWeek;
  /** In vigore la settimana prima (stabilità e spesa). */
  previous?: MenuWeek;
  /** Menù che varrebbe senza approvazione (`menuWeekInForce`): le differenze si contano da qui. Assente = il seme. */
  fallback?: MenuWeek;
  /** Usi di ogni ricetta nelle 2 settimane prima. */
  recentUses: Record<string, number>;
  /** Quota di «fatto» per ricetta (familiarità). */
  doneRate: Record<string, number>;
  /** Quante volte l'utente ha cambiato quella ricetta (28 giorni). */
  swappedAway: Record<string, number>;
  /** Esclusioni dell'utente più i divieti A1-A3. */
  excluded: ReadonlySet<string>;
  /** Peso di riferimento: proteine per pasto. */
  weightKg: number;
  attempt: number;
  /** Tetto delle valutazioni della ricerca (3.000). */
  maxEvaluations: number;
}

export type MenuGenStatus = 'generato' | 'seme' | 'seme-adattato' | 'fuori-limiti';

export interface MenuGenResult {
  /** Con la preparazione. */
  week: MenuWeek;
  status: MenuGenStatus;
  /** Vuoto se valido. */
  violations: Violation[];
  /** Differenze rispetto al menù che varrebbe senza approvazione (`fallback`, altrimenti il seme). */
  changed: { day: Weekday; slot: MealSlot; from: string; to: string }[];
  products: number;
  cost: number;
  evaluations: number;
}

/** Contesto del validatore: i giorni, il mese, le esclusioni, la settimana prima. */
export interface MenuValidationCtx {
  days: readonly MenuDayCtx[];
  month: number;
  excluded: ReadonlySet<string>;
  /** Settimana prima: «5 su 14» degli spuntini e confezioni a lunga conservazione sulle due settimane. */
  previous?: MenuWeek;
  /**
   * `avvio`: la settimana di avvio (A11). Fibre 22-32 g, niente minimi di integrali e legumi, niente varietà né confezioni
   * né preparazione: il menù di avvio si ripete di proposito, con pochi prodotti e senza piatti di legumi interi.
   */
  rules?: 'avvio';
}

// ───────────────────────── Costanti ─────────────────────────

/** Tetto delle valutazioni della ricerca locale (§ 4.10). */
export const MAX_EVALUATIONS = 3000;
/** Rampa delle fibre: la settimana dopo al massimo 6 g più della media misurata (§ 4.10). */
export const FIBER_STEP = 6;
/** Soglia alta delle fibre del punteggio. */
export const FIBER_SCORE_G = 35;

// ───────────────────────── Stato letto ─────────────────────────

export type MenuGenState = Pick<AppData, 'plan' | 'dayLogs'> &
  Partial<Pick<AppData, 'checkIns' | 'profile' | 'reviews' | 'workoutLogs' | 'footballLogs' | 'physio' | 'shoppingChecked' | 'prepDone'>>;

const nutritionState = (s: MenuGenState): NutritionState => ({
  plan: s.plan,
  dayLogs: s.dayLogs,
  ...(s.checkIns ? { checkIns: s.checkIns } : {}),
  ...(s.profile ? { profile: s.profile } : {}),
  ...(s.reviews ? { reviews: s.reviews } : {}),
});

/** Contesto di un giorno per il menù: lo stesso obiettivo e la stessa scala che vedono le schermate. */
export function menuDayCtx(iso: ISODate, s: MenuGenState, fiberTargetG: number = FIBER_SCORE_G): MenuDayCtx {
  const plan = s.plan;
  const ns = nutritionState(s);
  const dayType = effectiveDayType(iso, plan);
  const sched = scheduleDayOf(iso, plan);
  const ref = DEFAULT_TARGETS[dayType];
  const target = dayTargetFor(iso, ns) ?? ref;
  const match = matchCarbs(iso, ns);
  const own = Number(plan.targets?.[dayType]?.kcal);
  const times = mealTimesFor(iso, plan);
  const carry = MEAL_SLOTS.filter((slot) => times[slot]?.carry);
  return {
    iso,
    dayType,
    matchDay: isMatchDay(iso, plan),
    matchEve: isMatchEve(iso, plan),
    eveningFootball: isEveningFootball(sched),
    footballDay: Boolean(sched?.football),
    target,
    ...(match?.extraG ? { carbFloorG: match.floorG } : {}),
    scaleKcal: (Number.isFinite(own) && own > 0 ? own : ref.kcal) + energyAdjust(iso, ns).kcal,
    fiberTargetG,
    ...(carry.length ? { carry } : {}),
  };
}

/** I 7 giorni della settimana che parte da `monday`. */
export function menuDaysFor(monday: ISODate, s: MenuGenState, fiberTargetG: number = FIBER_SCORE_G): MenuDayCtx[] {
  const ws = weekStart(monday);
  return Array.from({ length: 7 }, (_, i) => menuDayCtx(addDays(ws, i), s, fiberTargetG));
}

/** Mese del mercoledì della settimana (1-12). */
export function menuMonth(monday: ISODate): number {
  return Number(addDays(weekStart(monday), 2).slice(5, 7));
}

/** L'ultima settimana approvata prima di `monday` (lunedì già passati, mai una con decorrenza futura), o null. */
export function lastApprovedBefore(monday: ISODate, plan: Pick<Plan, 'menus'>): { monday: ISODate; week: MenuWeek } | null {
  const menus = plan.menus ?? {};
  let best: ISODate | null = null;
  for (const k of Object.keys(menus)) {
    if (!isISODate(k) || k >= monday || !Array.isArray(menus[k]?.days)) continue;
    if (!best || k > best) best = k;
  }
  return best ? { monday: best, week: menus[best] } : null;
}

/**
 * Rampa delle fibre (§ 4.10): min(35 g, media misurata la settimana prima + 6 g); senza misura vale l'obiettivo del piano
 * (il passo dall'avvio alla rotazione).
 */
export function fiberRampTarget(monday: ISODate, s: MenuGenState, today?: ISODate): number {
  const plan = s.plan;
  const planFiber = Number(plan.targets?.palestra?.fiberG) || FIBER_SCORE_G;
  const goal = Math.min(FIBER_SCORE_G, planFiber);
  if (!s.checkIns || !s.workoutLogs || !s.footballLogs || !s.profile) return goal;
  try {
    const stats = weekStats(addDays(monday, -7), { ...s, checkIns: s.checkIns, workoutLogs: s.workoutLogs, footballLogs: s.footballLogs, profile: s.profile }, today ? { today } : {});
    const measured = stats.fiberAvgG;
    return typeof measured === 'number' && Number.isFinite(measured) ? Math.min(goal, measured + FIBER_STEP) : goal;
  } catch {
    return goal;
  }
}

/** Usi di ogni ricetta nei giorni [from, to). */
function recipeUses(s: MenuGenState, from: ISODate, days: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    for (const m of mealsForDate(addDays(from, i), { plan: s.plan, dayLogs: s.dayLogs }).meals) {
      if (m.recipe) out[m.recipeId] = (out[m.recipeId] ?? 0) + 1;
    }
  }
  return out;
}

/** Cambi dell'utente per ricetta prevista nei `days` giorni prima di `before` (§ 6.3: la ricetta prevista al momento del cambio). */
function swapsAway(s: MenuGenState, before: ISODate, days = 28): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 1; i <= days; i++) {
    const iso = addDays(before, -i);
    const log = s.dayLogs[iso];
    const swaps = log?.recipeSwaps;
    if (!swaps) continue;
    let planned: ReturnType<typeof mealsForDate> | null = null;
    for (const slot of MEAL_SLOTS) {
      const to = swaps[slot];
      if (!to) continue;
      const from = log.swapPlanned?.[slot] ?? (planned ??= mealsForDate(iso, { plan: s.plan, dayLogs: {} })).bySlot[slot]?.plannedId;
      if (from && from !== to && RECIPES[from]) out[from] = (out[from] ?? 0) + 1;
    }
  }
  return out;
}

export interface MenuGenOptions {
  attempt?: number;
  /** Giornata del piano: misura delle fibre e familiarità; assente = il lunedì prima. */
  today?: ISODate;
  maxEvaluations?: number;
}

/** Gli ingressi del generatore per il lunedì `monday`, dal piano (già proiettato) e dal diario. */
export function menuGenInput(monday: ISODate, s: MenuGenState, opts: MenuGenOptions = {}): MenuGenInput {
  const ws = weekStart(monday);
  const plan = s.plan;
  const today = opts.today ?? addDays(ws, -1);
  const fiber = fiberRampTarget(ws, s, today);
  const approved = lastApprovedBefore(ws, plan);
  const rotation = menuWeekFor(ws, plan.startDate);
  const seed = approved?.week ?? rotation ?? { days: Array.from({ length: 7 }, () => ({ meals: {} })), prep: [] };
  const previous = menuWeekInForce(addDays(ws, -7), plan);
  const fallback = menuWeekInForce(ws, plan);
  const weight = referenceWeightKg(ws, nutritionState(s)) ?? (Number(plan.targets?.calcio?.proteinG) || 135) / PROTEIN_G_PER_KG;
  return {
    monday: ws,
    days: menuDaysFor(ws, s, fiber),
    month: menuMonth(ws),
    seed,
    ...(previous ? { previous } : {}),
    ...(fallback ? { fallback } : {}),
    recentUses: recipeUses(s, addDays(ws, -14), 14),
    doneRate: doneRates({ plan, dayLogs: s.dayLogs }, today),
    swappedAway: swapsAway(s, today),
    excluded: excludedFoods(plan, addDays(ws, 6)),
    weightKg: weight,
    attempt: Math.max(0, Math.trunc(opts.attempt ?? 0)),
    maxEvaluations: opts.maxEvaluations ?? MAX_EVALUATIONS,
  };
}

/** Il contesto del validatore che corrisponde agli ingressi del generatore. */
export function validationCtxOf(input: Pick<MenuGenInput, 'days' | 'month' | 'excluded' | 'previous'>): MenuValidationCtx {
  return { days: input.days, month: input.month, excluded: input.excluded, ...(input.previous ? { previous: input.previous } : {}) };
}
