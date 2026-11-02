/**
 * Ritmo · revisione della domenica (funzioni pure).
 *
 * - `weekStats(weekStart, state)`: i numeri della settimana (peso medio e variazione, pesate, aderenza,
 *   sonno medio e notti in orario, fibre e proteine stimate dai pasti segnati, dolore per zona e tendenza,
 *   carico, dolci fuori programma).
 * - `proposals(weekStart, state)`: le correzioni del piano per la settimana dopo (SPEC §7):
 *   - sonno: ≥ 5 notti a letto entro `current` + 15 min → anticipa di `stepMin` (fino a `target`);
 *   - calorie (ricomposizione): servono ≥ 4 pesate; calo medio > 0,5% del peso → +150 kcal,
 *     aumento > 0,5% → −100 kcal, altrimenti invariate (proposta informativa);
 *   - fibre: stima < obiettivo − 5 g → se il menù previsto ne porta abbastanza, quale pasto tenere quando
 *     si sostituisce (niente cibo in più); se è il menù a stare sotto, le aggiunte che servono (frutto,
 *     legumi, vellutata). La stima non conta come saltati i pasti senza stato;
 *   - dolore: media sopra soglia o in aumento → riduci il carico e senti il fisioterapista;
 *   - carico: allarme del carico → settimana più leggera, seduta C facoltativa saltata;
 *   - dolci: oltre quelli previsti → strategia (merenda proteica, dolce dopo cena);
 *   - scarico: ogni 6-8 settimane dall'inizio (o dall'ultimo scarico), o prima con sonno < 6 h per 3 notti
 *     e dolore in aumento.
 *
 * `sleepCurrent` e `kcalDelta` cambiano il piano con `applyProposal`; con i limiti dell'energia (`engine/energy.ts`) la
 * correzione delle calorie è già tagliata al tetto, e con il deficit al tetto non si propone un altro taglio. Scarico e
 * settimana più leggera hanno `weekKind`: accettati scrivono `Plan.weekOverrides` della settimana dopo
 * (`appliesToPlan`). `{ type: 'none' }` è un impegno senza toccare il piano. Nella revisione si decide solo su quello che cambia la settimana dopo (`needsDecision`:
 * piano, scarico, settimana più leggera); il resto è da sapere.
 * Gli id sono stabili e uguali all'area ('sonno', 'calorie', …): una proposta per area.
 *
 * Nessuna funzione legge l'orologio: la data arriva dagli argomenti.
 */
import type { AppData, Goal, HHMM, ISODate, MealSlot, Plan, Proposal, WeeklyReview } from '../domain/types';
import { FOODS } from '../data/foods';
import { fmtDelta, fmtHours, fmtKg, fmtNumber, listIt } from '../lib/format';
import { addDays, addMinutes, daysBetween, nightMinutes, weekDates, weekIndexSince, weekStart as weekStartOf } from './dates';
import { clampKcalCorrection, deficitAtCap } from './energy';
import { mealsForDate } from './menu';
import { dayCarbScale, dayTargetFor, eatenMeal, recipeNutrition, recipeVegPortions } from './nutrition';
import { atSleepTarget, checkInSleepHours, isOnTargetFor, nextBedtime, ON_TARGET_TOLERANCE_MIN, sleepHours } from './sleep';
import {
  adherenceSummary,
  buildDay,
  countingStart,
  firstReviewWeek,
  firstUseOf,
  isReviewableWeek,
  isSuccessful,
  itemCounts,
  type AdherenceSummary,
} from './timeline';
import { loadStatus, type LoadStatus } from './training';

// ───────────────────────── Costanti ─────────────────────────

/** Notti in orario che servono per anticipare l'orario a letto. */
export const NIGHTS_TO_ADVANCE = 5;
/** Pesate minime nella settimana per correggere le calorie. */
export const MIN_WEIGH_INS = 4;
/** Variazione settimanale del peso (frazione) oltre la quale si correggono le calorie in ricomposizione. */
export const WEIGHT_CHANGE_LIMIT = 0.005;
/** Correzioni delle calorie. */
export const KCAL_UP = 150;
export const KCAL_DOWN = -100;
/** Margine sotto l'obiettivo di fibre oltre il quale scatta la proposta. */
export const FIBER_MARGIN_G = 5;
/** Giorni con pasti segnati che servono per stimare fibre e proteine. */
export const MIN_NUTRITION_DAYS = 3;
/** Differenza tra le medie settimanali del dolore che indica una tendenza. */
export const PAIN_TREND_DELTA = 0.5;
/** Settimane di lavoro dopo le quali si propone lo scarico (6-8). */
export const DELOAD_AFTER_WEEKS = 6;
/** Notte corta per la regola dello scarico anticipato. */
export const SHORT_NIGHT_H = 6;
export const SHORT_NIGHTS_FOR_DELOAD = 3;

/** Ordine di presentazione delle proposte: prima quelle che cambiano il piano, poi la salute. */
export const PROPOSAL_ORDER: Proposal['area'][] = ['sonno', 'calorie', 'peso', 'dolore', 'allenamento', 'scarico', 'fibre', 'dolci'];

/** Lo stato che serve alla revisione. */
export type ReviewState = Pick<AppData, 'plan' | 'dayLogs' | 'checkIns' | 'workoutLogs' | 'footballLogs' | 'profile'> &
  Partial<Pick<AppData, 'reviews' | 'physio' | 'shoppingChecked' | 'prepDone'>>;

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Pendenza ai minimi quadrati di punti (x = giorno, y = valore), in unità al giorno. */
export function slope(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const my = points.reduce((s, p) => s + p.y, 0) / points.length;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

// ───────────────────────── Settimana della revisione ─────────────────────────

/** La domenica si rivede la settimana che si chiude oggi; gli altri giorni quella appena chiusa. */
export function reviewWeekFor(today: ISODate): ISODate {
  const ws = weekStartOf(today);
  return daysBetween(ws, today) === 6 ? ws : addDays(ws, -7);
}

/** True la domenica: la revisione è in evidenza. */
export function isReviewDay(today: ISODate): boolean {
  return daysBetween(weekStartOf(today), today) === 6;
}

/** Revisione salvata per la settimana, se c'è. */
export function reviewFor(weekStart: ISODate, reviews: readonly WeeklyReview[] | undefined): WeeklyReview | undefined {
  const ws = weekStartOf(weekStart);
  return (reviews ?? []).find((r) => r.weekStart === ws);
}

// La prima settimana da rivedere sta in timeline.ts (la usa anche il rito della domenica di Oggi, e
// review.ts importa già timeline.ts): qui si riesporta.
export { MIN_FIRST_WEEK_DAYS, firstReviewWeek, isReviewableWeek } from './timeline';

/** La settimana da rivedere esiste nel piano (non è prima dell'inizio né dei giorni di avvio). */
export function reviewAvailable(today: ISODate, plan: Pick<Plan, 'startDate'>): boolean {
  return isReviewableWeek(reviewWeekFor(today), plan);
}

/** Domenica della prima revisione ("La prima revisione è domenica 8 novembre"), o null. */
export function firstReviewDate(plan: Pick<Plan, 'startDate'>): ISODate | null {
  const ws = firstReviewWeek(plan);
  return ws ? addDays(ws, 6) : null;
}

/**
 * Numero della settimana del piano che parte da `weekStart`: 1 è la prima da rivedere. Prima di quella
 * (i giorni di avvio di chi comincia nel fine settimana) vale 0.
 */
export function planWeekNumber(weekStart: ISODate, plan: Pick<Plan, 'startDate'>): number {
  const first = firstReviewWeek(plan);
  if (!first) return 1;
  return Math.max(0, weekIndexSince(first, weekStartOf(weekStart)) + 1);
}

// ───────────────────────── Scala del sonno nel tempo ─────────────────────────

/**
 * Orario a letto in vigore la sera `evening` (il gradino della scala del sonno di quella settimana). Ogni
 * revisione che accetta la proposta del sonno anticipa l'orario dal lunedì dopo la settimana rivista: andando
 * indietro, prima di ogni cambio l'orario era un passo più tardi (il valore salvato nella proposta, se c'è, più
 * `stepMin`). Senza revisioni vale l'orario attuale del piano. Così le notti di tre settimane fa si giudicano
 * con l'orario di allora, non con quello di oggi.
 */
export function sleepPhaseOn(evening: ISODate, state: { plan: Pick<Plan, 'sleep'>; reviews?: readonly WeeklyReview[] }): HHMM {
  const { current, stepMin } = state.plan.sleep;
  const changes = (state.reviews ?? [])
    .filter((r) => Array.isArray(r.acceptedProposals) && r.acceptedProposals.includes('sonno'))
    .map((r) => {
      const p = r.proposals?.find((x) => x.id === 'sonno');
      return { from: addDays(weekStartOf(r.weekStart), 7), value: p?.apply?.type === 'sleepCurrent' ? p.apply.value : null };
    })
    .sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0));
  let phase = current;
  for (const c of changes) {
    if (evening >= c.from) break;
    phase = addMinutes(c.value ?? phase, stepMin);
  }
  return phase;
}

/** Il piano con l'orario a letto in vigore la sera `evening` (per `isOnTargetFor` e `bedtimeFor`). */
export function planOnEvening<P extends Pick<Plan, 'sleep'>>(evening: ISODate, state: { plan: P; reviews?: readonly WeeklyReview[] }): P {
  const current = sleepPhaseOn(evening, state);
  return current === state.plan.sleep.current ? state.plan : { ...state.plan, sleep: { ...state.plan.sleep, current } };
}

// ───────────────────────── Numeri del periodo ─────────────────────────

export type Trend = 'su' | 'giu' | 'stabile';

export interface PainSiteStats {
  site: string;
  /** Media delle letture del periodo. */
  avg: number | null;
  /** Media del periodo precedente. */
  prevAvg: number | null;
  /** Ultima lettura del periodo. */
  last: number | null;
  max: number | null;
  readings: number;
  /** Variazione: avg − prevAvg, oppure l'andamento dentro il periodo se manca il precedente. */
  delta: number | null;
  trend: Trend | null;
  overThreshold: boolean;
}

export interface PeriodStats {
  dates: ISODate[];
  // Peso
  weighIns: number;
  weightAvg: number | null;
  weightPrevAvg: number | null;
  /** Variazione in kg: media contro media precedente, oppure pendenza della settimana × 7. */
  weightDelta: number | null;
  /** Variazione in frazione del peso (−0,007 = −0,7%). */
  weightDeltaPct: number | null;
  weightDeltaSource: 'confronto' | 'pendenza' | null;
  // Aderenza (solo giorni passati e dentro il piano)
  adherenceDays: number;
  adherence: number | null;
  prevAdherence: number | null;
  successfulDays: number;
  minimalDays: number;
  // Sonno
  sleepNights: number;
  sleepAvgH: number | null;
  prevSleepAvgH: number | null;
  /** Notti che contano (dal primo giorno con Ritmo): il denominatore di "notti in orario". */
  countedNights: number;
  nightsWithBedtime: number;
  nightsOnTarget: number;
  shortNights: number;
  // Alimentazione stimata dai pasti segnati (i pasti senza stato non contano come saltati)
  /** Giorni con almeno 3 pasti su 5 segnati: la stima vale da `MIN_NUTRITION_DAYS` in su. */
  nutritionDays: number;
  fiberAvgG: number | null;
  prevFiberAvgG: number | null;
  proteinAvgG: number | null;
  vegPortionsAvg: number | null;
  fiberTargetG: number;
  proteinTargetG: number;
  /** Fibre e proteine del menù previsto negli stessi giorni (sostituzioni di ricetta comprese). */
  fiberPlannedG: number | null;
  proteinPlannedG: number | null;
  /**
   * Pasti del menù nei giorni chiusi e quanti segnati entrano nella stima (quelli dei giorni con almeno 3 pasti
   * su 5 segnati): "da 23 pasti segnati su 30".
   */
  mealsCounted: number;
  mealsLogged: number;
  mealsReplaced: number;
  mealsSkipped: number;
  /** Pasti presi con il piano B al bar, contati con i valori dell'ordine. */
  mealsAtBar: number;
  /** Fibre perse per pasto nei pasti sostituiti o saltati, sommate sul periodo. */
  fiberLostBySlot: Partial<Record<MealSlot, number>>;
  /** I giorni segnati sono per lo più di avvio: le fibre salgono per gradi e il riferimento è quel menù. */
  fiberStarter: boolean;
  /** Fibre sotto il riferimento oltre il margine: la stessa regola della proposta, per colorare i numeri. */
  fiberLow: boolean;
  // Energia dei controlli del mattino (1-10)
  energyAvg: number | null;
  // Dolore
  pain: PainSiteStats[];
  /** Primo giorno che conta (vedi `reviewStart`). */
  startDate: ISODate | null;
}

export interface PeriodOptions {
  /** Oggi: i giorni dopo non contano; oggi conta per peso, sonno e dolore ma non per aderenza e pasti. */
  today?: ISODate;
}

function weights(state: ReviewState, dates: ISODate[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  dates.forEach((d, i) => {
    const w = state.checkIns[d]?.weightKg;
    if (isNum(w) && w > 0) out.push({ x: i, y: w });
  });
  return out;
}

function sleepValues(state: ReviewState, dates: ISODate[]): number[] {
  return dates.map((d) => checkInSleepHours(state.checkIns[d])).filter(isNum);
}

/** Primo giorno con qualcosa di segnato: voci, acqua, dolci, controlli, sedute o calcio. */
export function firstActivityDate(state: Pick<AppData, 'dayLogs' | 'checkIns' | 'workoutLogs' | 'footballLogs'>): ISODate | null {
  let first: ISODate | null = null;
  const see = (d: ISODate | undefined) => {
    if (d && (first === null || d < first)) first = d;
  };
  for (const [d, log] of Object.entries(state.dayLogs ?? {})) {
    if (!log) continue;
    if (Object.keys(log.status ?? {}).length || log.minimal || (log.waterGlasses ?? 0) > 0 || (log.sweets ?? 0) > 0) see(d);
  }
  for (const d of Object.keys(state.checkIns ?? {})) see(d);
  for (const w of state.workoutLogs ?? []) see(w.date);
  for (const f of state.footballLogs ?? []) see(f.date);
  return first;
}

/**
 * Primo giorno che conta nei numeri della revisione: il primo avvio dell'app (`Plan.firstUse`) se c'è,
 * altrimenti il primo giorno con qualcosa di segnato, mai prima dell'inizio del piano. Il piano parte il
 * lunedì della settimana del benvenuto: chi comincia il mercoledì non viene giudicato su lunedì e martedì.
 */
export function reviewStart(state: ReviewState): ISODate | null {
  const planStart = countingStart(state.plan);
  if (firstUseOf(state.plan)) return planStart;
  const first = firstActivityDate(state);
  if (first && (!planStart || first > planStart)) return first;
  return planStart;
}

/** Giorni di cui contano aderenza e pasti: passati e dal primo giorno con Ritmo. */
function closedDays(start: ISODate | null, dates: ISODate[], today?: ISODate): ISODate[] {
  return dates.filter((d) => (!start || d >= start) && (!today || d < today));
}

/** Voci che contano oltre le quali il giorno del primo avvio è una giornata vera anche senza nulla di segnato. */
export const FIRST_DAY_MIN_ITEMS = 4;

/**
 * Il giorno del primo avvio cominciato la sera (meno di 4 voci che contano, di solito coprifuoco, telefono
 * fuori e poco altro) senza nulla di segnato non è una giornata: non entra nell'aderenza e nel calendario
 * resta "prima di Ritmo". Se qualcosa è segnato, conta come gli altri giorni.
 */
export function isIdleFirstEvening(iso: ISODate, plan: Pick<Plan, 'startDate'>, s: Pick<AdherenceSummary, 'total' | 'done' | 'replaced' | 'skipped'>): boolean {
  const first = firstUseOf(plan);
  return first !== null && first.date === iso && s.total < FIRST_DAY_MIN_ITEMS && s.done + s.replaced + s.skipped === 0;
}

/**
 * Aderenza dei giorni chiusi. Un giorno senza voci che contano (tutte prima del primo avvio) è senza dati,
 * come la prima sera senza nulla di segnato.
 */
function adherenceOf(state: ReviewState, dates: ISODate[]) {
  let sum = 0;
  let ok = 0;
  let minimal = 0;
  let days = 0;
  for (const d of dates) {
    const s = adherenceSummary(d, state);
    if (s.total === 0 || isIdleFirstEvening(d, state.plan, s)) continue;
    days++;
    sum += s.score;
    if (isSuccessful(s)) ok++;
    if (s.minimal) minimal++;
  }
  return { avg: days ? sum / days : null, successful: ok, minimal, days };
}

/**
 * Quota di un pasto sostituito che si conta quando non si sa cosa si è mangiato: di solito qualcosa di più
 * povero di fibre. Un pasto preso con il piano B al bar (`DayLog.barMeals`) vale invece per i valori dell'ordine.
 */
export const REPLACED_SHARE = 0.5;

/**
 * Quota dei pasti del menù che deve essere segnata perché un giorno entri nella stima di fibre e proteine
 * (3 pasti su 5). Mezza giornata, come il primo avvio del pomeriggio con la sola merenda, confrontata con un
 * obiettivo giornaliero darebbe un numero sbagliato.
 */
export const MIN_DAY_MEAL_SHARE = 0.6;

export interface IntakeValues {
  fiberG: number;
  proteinG: number;
  vegPortions: number;
}

const ZERO_INTAKE: IntakeValues = { fiberG: 0, proteinG: 0, vegPortions: 0 };

const addIntake = (a: IntakeValues, b: IntakeValues, k = 1): IntakeValues => ({
  fiberG: a.fiberG + b.fiberG * k,
  proteinG: a.proteinG + b.proteinG * k,
  vegPortions: a.vegPortions + b.vegPortions * k,
});

export interface DayIntake extends IntakeValues {
  /** Almeno un pasto segnato (fatto, sostituito o saltato). */
  logged: boolean;
  /** Pasti del menù del giorno, anche quelli che non contano (di solito 5). */
  menuMeals: number;
  /** Pasti del menù che contano nel giorno (non quelli prima del primo avvio o della prima spesa). */
  meals: number;
  /** Pasti segnati (fatto, sostituito o saltato). */
  mealsLogged: number;
  /** Abbastanza pasti segnati (`MIN_DAY_MEAL_SHARE` del menù) per entrare nella stima della settimana. */
  complete: boolean;
  replaced: MealSlot[];
  skipped: MealSlot[];
  /** Pasti sostituiti con il piano B al bar, contati con i valori dell'ordine. */
  bar: MealSlot[];
  /** Valori del menù per i soli pasti segnati: la base con cui si confronta quanto stimato. */
  plannedLogged: IntakeValues;
  /** Valori del menù per tutta la giornata (sostituzioni di ricetta e scala del piano comprese). */
  planned: IntakeValues;
  /** Fibre perse per pasto nei pasti sostituiti o saltati (menù − stimato). */
  fiberLost: Partial<Record<MealSlot, number>>;
  /** Giorno del menù di avvio, con le fibre che salgono per gradi. */
  starter: boolean;
}

/**
 * Pasti che non contano: nei primi giorni quelli prima del primo avvio e quelli "con quello che hai in casa"
 * prima della prima spesa (non hanno una ricetta da stimare). Negli altri giorni nessuno.
 */
function uncountedMealSlots(iso: ISODate, state: ReviewState): Set<MealSlot> {
  const out = new Set<MealSlot>();
  const first = firstUseOf(state.plan);
  if (!first || iso < first.date || daysBetween(first.date, iso) > 2) return out;
  for (const it of buildDay(iso, state)) {
    if (it.kind !== 'pasto' || !it.slot) continue;
    if (it.preShopping || !itemCounts(iso, it, state)) out.add(it.slot);
  }
  return out;
}

const finiteOr0 = (v: unknown) => (isNum(v) && v > 0 ? v : 0);

/**
 * Valori di un pasto stimato che vale per la voce (`eatenMeal`: ordine al bar, foto o piatto salvato con la voce
 * sostituita, oppure fatta se era il pasto previsto), con la sua provenienza.
 */
function eatenIntake(log: AppData['dayLogs'][string] | undefined, slot: MealSlot): (IntakeValues & { atBar: boolean }) | null {
  const meal = eatenMeal(log, slot);
  if (!meal) return null;
  return {
    fiberG: finiteOr0(meal.nutrients.fiberG),
    proteinG: finiteOr0(meal.nutrients.proteinG),
    vegPortions: finiteOr0(meal.vegPortions),
    atBar: (meal.source ?? 'bar') === 'bar',
  };
}

/**
 * Fibre, proteine e porzioni di vegetali del giorno dai pasti segnati: fatto = ricetta intera, con un pasto stimato
 * che vale (`eatenMeal`: piano B al bar, foto, piatto salvato) = i valori della stima, sostituito con altro = metà,
 * saltato = niente. I pasti senza stato
 * restano fuori (né zero né interi): `planned` e `plannedLogged` servono a stimare la settimana senza
 * contarli. Le giornate minime non hanno pasti da contare.
 */
export function dayIntake(iso: ISODate, state: ReviewState): DayIntake {
  const log = state.dayLogs[iso];
  const out: DayIntake = {
    ...ZERO_INTAKE,
    logged: false,
    menuMeals: 0,
    meals: 0,
    mealsLogged: 0,
    complete: false,
    replaced: [],
    skipped: [],
    bar: [],
    plannedLogged: { ...ZERO_INTAKE },
    planned: { ...ZERO_INTAKE },
    fiberLost: {},
    starter: false,
  };
  if (log?.minimal) return out;
  const day = mealsForDate(iso, state);
  const scale = dayCarbScale(iso, state);
  const skip = uncountedMealSlots(iso, state);
  out.starter = Boolean(day.starter);
  out.menuMeals = day.meals.length;
  for (const m of day.meals) {
    if (skip.has(m.slot)) continue;
    out.meals++;
    const n = recipeNutrition(m.recipe, day.dayType, FOODS, scale);
    const v: IntakeValues = { fiberG: n.fiberG, proteinG: n.proteinG, vegPortions: recipeVegPortions(m.recipe, day.dayType, FOODS, scale) };
    out.planned = addIntake(out.planned, v);
    const st = log?.status[`pasto:${m.slot}`];
    if (!st) continue;
    out.logged = true;
    out.mealsLogged++;
    out.plannedLogged = addIntake(out.plannedLogged, v);
    const est = eatenIntake(log, m.slot);
    const bar = est ? { fiberG: est.fiberG, proteinG: est.proteinG, vegPortions: est.vegPortions } : null;
    const eaten = bar ?? (st === 'fatto' ? v : st === 'sostituito' ? addIntake(ZERO_INTAKE, v, REPLACED_SHARE) : ZERO_INTAKE);
    Object.assign(out, addIntake(out, eaten));
    if (st === 'sostituito') out.replaced.push(m.slot);
    else if (st === 'saltato') out.skipped.push(m.slot);
    if (est && st === 'sostituito' && est.atBar) out.bar.push(m.slot);
    const lost = v.fiberG - eaten.fiberG;
    if (st !== 'fatto' && lost > 0) out.fiberLost[m.slot] = (out.fiberLost[m.slot] ?? 0) + lost;
  }
  out.complete = out.logged && out.mealsLogged >= Math.ceil(out.menuMeals * MIN_DAY_MEAL_SHARE - 1e-9);
  return out;
}

interface WeekIntake {
  /** Giorni con abbastanza pasti segnati (`DayIntake.complete`): quelli della stima. */
  days: number;
  /** Pasti presi con il piano B al bar nei giorni della stima. */
  bar: number;
  fiber: number | null;
  protein: number | null;
  veg: number | null;
  plannedFiber: number | null;
  plannedProtein: number | null;
  meals: number;
  mealsLogged: number;
  replaced: number;
  skipped: number;
  fiberLost: Partial<Record<MealSlot, number>>;
  starterDays: number;
}

/**
 * Stima del periodo: il menù previsto nei giorni con pasti segnati, per la quota che ne è arrivata nei pasti
 * segnati. Chi segna 3 pasti su 5 tutti fatti ha preso il menù intero, non tre quinti: i pasti non segnati
 * valgono come quelli segnati, non come pasti saltati. Entrano solo i giorni con almeno 3 pasti su 5 segnati:
 * mezza giornata (il primo avvio del pomeriggio, un giorno con la sola merenda) non dice com'è andata.
 */
function intakeOf(state: ReviewState, dates: ISODate[]): WeekIntake {
  const all = dates.map((d) => dayIntake(d, state));
  const days = all.filter((x) => x.complete);
  const sum = (f: (x: DayIntake) => number) => days.reduce((s, x) => s + f(x), 0);
  const estimate = (key: keyof IntakeValues): number | null => {
    if (!days.length) return null;
    const base = sum((x) => x.plannedLogged[key]);
    const plannedAvg = mean(days.map((x) => x.planned[key]))!;
    return base > 0 ? plannedAvg * (sum((x) => x[key]) / base) : mean(days.map((x) => x[key]));
  };
  const fiberLost: Partial<Record<MealSlot, number>> = {};
  for (const x of days) for (const [slot, g] of Object.entries(x.fiberLost) as [MealSlot, number][]) fiberLost[slot] = (fiberLost[slot] ?? 0) + g;
  return {
    days: days.length,
    bar: sum((x) => x.bar.length),
    fiber: estimate('fiberG'),
    protein: estimate('proteinG'),
    veg: estimate('vegPortions'),
    plannedFiber: days.length ? mean(days.map((x) => x.planned.fiberG)) : null,
    plannedProtein: days.length ? mean(days.map((x) => x.planned.proteinG)) : null,
    meals: all.reduce((s, x) => s + x.meals, 0),
    // I pasti segnati che entrano nella stima: quelli dei giorni abbastanza completi.
    mealsLogged: sum((x) => x.mealsLogged),
    replaced: sum((x) => x.replaced.length),
    skipped: sum((x) => x.skipped.length),
    fiberLost,
    starterDays: days.filter((x) => x.starter).length,
  };
}

/** Il menù porta almeno l'obiettivo di fibre meno questo margine: se le fibre mancano, è nei pasti fuori menù. */
export const MENU_FIBER_TOLERANCE_G = 2;

/**
 * Riferimento delle fibre per il periodo: l'obiettivo, oppure il menù di avvio quando la maggior parte dei
 * giorni segnati è di avvio (le fibre salgono per gradi apposta, non si chiede di aggiungerne).
 */
function fiberReference(target: number, planned: number | null, starterDays: number, days: number): { ref: number; starter: boolean } {
  const starter = planned !== null && days > 0 && starterDays * 2 >= days && planned < target;
  return { ref: starter ? Math.min(target, planned) : target, starter };
}

function targetAvg(state: ReviewState, dates: ISODate[], key: 'fiberG' | 'proteinG'): number {
  // Obiettivo del giorno come in Oggi: la vigilia della partita vale come un giorno di calcio.
  const vals = dates.map((d) => dayTargetFor(d, state)?.[key]);
  return Math.round(mean(vals.filter(isNum)) ?? state.plan.targets.palestra[key]);
}

function painSites(state: ReviewState, dates: ISODate[]): string[] {
  const set = new Set<string>(state.profile.painSites ?? []);
  for (const d of dates) for (const k of Object.keys(state.checkIns[d]?.pain ?? {})) set.add(k);
  return [...set];
}

function painStats(state: ReviewState, site: string, dates: ISODate[], prevDates: ISODate[]): PainSiteStats {
  const pts: { x: number; y: number }[] = [];
  dates.forEach((d, i) => {
    const v = state.checkIns[d]?.pain?.[site];
    if (isNum(v)) pts.push({ x: i, y: v });
  });
  const prev = prevDates.map((d) => state.checkIns[d]?.pain?.[site]).filter(isNum);
  const avg = mean(pts.map((p) => p.y));
  const prevAvg = mean(prev);
  let delta: number | null = null;
  let trend: Trend | null = null;
  if (avg !== null && prevAvg !== null) {
    delta = avg - prevAvg;
    trend = delta >= PAIN_TREND_DELTA - 1e-9 ? 'su' : delta <= -PAIN_TREND_DELTA + 1e-9 ? 'giu' : 'stabile';
  } else if (pts.length >= 3) {
    const s = slope(pts) ?? 0;
    delta = s * (pts[pts.length - 1].x - pts[0].x);
    trend = delta >= 1 ? 'su' : delta <= -1 ? 'giu' : 'stabile';
  }
  const threshold = state.plan.painThreshold ?? 3;
  return {
    site,
    avg: avg === null ? null : round1(avg),
    prevAvg: prevAvg === null ? null : round1(prevAvg),
    last: pts.length ? pts[pts.length - 1].y : null,
    max: pts.length ? Math.max(...pts.map((p) => p.y)) : null,
    readings: pts.length,
    delta: delta === null ? null : round1(delta),
    trend,
    overThreshold: avg !== null && avg > threshold + 1e-9,
  };
}

/**
 * Numeri di un periodo (di solito 7 giorni) confrontati con il periodo precedente.
 * Le date dopo `today` sono ignorate.
 */
export function periodStats(dates: ISODate[], prevDates: ISODate[], state: ReviewState, opts: PeriodOptions = {}): PeriodStats {
  const { today } = opts;
  const start = reviewStart(state);
  const upTo = (ds: ISODate[]) => (today ? ds.filter((d) => d <= today) : ds);
  const cur = upTo(dates);
  const prev = upTo(prevDates);
  const counted = cur.filter((d) => !start || d >= start);

  // Peso
  const w = weights(state, cur);
  const wPrev = weights(state, prev);
  const weightAvg = mean(w.map((p) => p.y));
  const weightPrevAvg = wPrev.length >= 2 ? mean(wPrev.map((p) => p.y)) : null;
  let weightDelta: number | null = null;
  let weightDeltaPct: number | null = null;
  let weightDeltaSource: PeriodStats['weightDeltaSource'] = null;
  if (weightAvg !== null && weightPrevAvg !== null && w.length >= 2) {
    weightDelta = weightAvg - weightPrevAvg;
    weightDeltaPct = weightDelta / weightPrevAvg;
    weightDeltaSource = 'confronto';
  } else if (weightAvg !== null && w.length >= MIN_WEIGH_INS) {
    const s = slope(w);
    if (s !== null) {
      weightDelta = s * 7;
      weightDeltaPct = weightDelta / weightAvg;
      weightDeltaSource = 'pendenza';
    }
  }

  // Aderenza
  const closed = closedDays(start, cur, today);
  const closedPrev = closedDays(start, prev, today);
  const adh = adherenceOf(state, closed);
  const adhPrev = adherenceOf(state, closedPrev);

  // Sonno
  const sleep = sleepValues(state, cur);
  const sleepPrev = sleepValues(state, prev);
  let nightsWithBedtime = 0;
  let nightsOn = 0;
  for (const d of counted) {
    const bed = state.checkIns[d]?.bedTime;
    if (!bed) continue;
    nightsWithBedtime++;
    // Ogni controllo si confronta con l'orario della sera prima (dopo la partita vale 00:15), con il gradino
    // della scala in vigore quella sera.
    if (isOnTargetFor(bed, d, planOnEvening(addDays(d, -1), state))) nightsOn++;
  }

  // Pasti
  const intake = intakeOf(state, closed);
  const intakePrev = intakeOf(state, closedPrev);

  const energy = cur.map((d) => state.checkIns[d]?.energy).filter(isNum);
  const fiberTargetG = targetAvg(state, cur.length ? cur : dates, 'fiberG');
  const fiberRef = fiberReference(fiberTargetG, intake.plannedFiber, intake.starterDays, intake.days);

  return {
    dates: cur,
    weighIns: w.length,
    weightAvg: weightAvg === null ? null : Math.round(weightAvg * 100) / 100,
    weightPrevAvg: weightPrevAvg === null ? null : Math.round(weightPrevAvg * 100) / 100,
    weightDelta: weightDelta === null ? null : Math.round(weightDelta * 100) / 100,
    weightDeltaPct,
    weightDeltaSource,
    adherenceDays: adh.days,
    adherence: adh.avg,
    prevAdherence: adhPrev.avg,
    successfulDays: adh.successful,
    minimalDays: adh.minimal,
    sleepNights: sleep.length,
    sleepAvgH: mean(sleep),
    prevSleepAvgH: mean(sleepPrev),
    countedNights: counted.length,
    nightsWithBedtime,
    nightsOnTarget: nightsOn,
    shortNights: sleep.filter((h) => h < SHORT_NIGHT_H).length,
    nutritionDays: intake.days,
    fiberAvgG: intake.fiber === null ? null : round1(intake.fiber),
    // Il confronto con la settimana prima serve solo se anche quella ha abbastanza giorni.
    prevFiberAvgG: intakePrev.fiber === null || intakePrev.days < MIN_NUTRITION_DAYS ? null : round1(intakePrev.fiber),
    proteinAvgG: intake.protein === null ? null : Math.round(intake.protein),
    vegPortionsAvg: intake.veg === null ? null : round1(intake.veg),
    fiberTargetG,
    proteinTargetG: targetAvg(state, cur.length ? cur : dates, 'proteinG'),
    fiberPlannedG: intake.plannedFiber === null ? null : round1(intake.plannedFiber),
    proteinPlannedG: intake.plannedProtein === null ? null : Math.round(intake.plannedProtein),
    mealsCounted: intake.meals,
    mealsLogged: intake.mealsLogged,
    mealsReplaced: intake.replaced,
    mealsSkipped: intake.skipped,
    mealsAtBar: intake.bar,
    fiberLostBySlot: intake.fiberLost,
    fiberStarter: fiberRef.starter,
    fiberLow: intake.days >= MIN_NUTRITION_DAYS && intake.fiber !== null && intake.fiber < fiberRef.ref - FIBER_MARGIN_G,
    energyAvg: energy.length ? round1(mean(energy) ?? 0) : null,
    pain: painSites(state, [...cur, ...prev]).map((s) => painStats(state, s, cur, prev)),
    startDate: start,
  };
}

// ───────────────────────── Numeri della settimana ─────────────────────────

export interface WeekStats extends PeriodStats {
  weekStart: ISODate;
  weekEnd: ISODate;
  /** Settimana del piano (1 = la prima da rivedere, 0 = giorni di avvio prima di quella). */
  weekNumber: number;
  /** Tutti i giorni della settimana sono passati (o è domenica). */
  complete: boolean;
  load: number;
  loadStatus: LoadStatus;
  gymSessions: number;
  footballSessions: number;
  sweets: number;
  sweetsPlanned: number;
  sweetsExtra: number;
  /** Prima settimana con Ritmo (contiene il primo giorno o è la prima da rivedere): si racconta, non si giudica. */
  firstWeek: boolean;
  /** Giorni con Ritmo nella settimana (dal primo giorno, fino a oggi). */
  daysWithRitmo: number;
  /** Voci segnate nella settimana (fatte o sostituite). */
  itemsMarked: number;
}

/** I numeri della settimana che parte da `weekStart` (allineato al lunedì), confrontati con la precedente. */
export function weekStats(weekStart: ISODate, state: ReviewState, opts: PeriodOptions = {}): WeekStats {
  const ws = weekStartOf(weekStart);
  const dates = weekDates(ws);
  const prevDates = weekDates(addDays(ws, -7));
  const base = periodStats(dates, prevDates, state, opts);
  const weekEnd = addDays(ws, 6);
  const inWeek = (d: ISODate) => d >= ws && d <= weekEnd;
  const status = loadStatus(ws, state);
  const sweets = dates.reduce((s, d) => s + (state.dayLogs[d]?.sweets ?? 0), 0);
  const planned = state.plan.sweetsPerWeek ?? 0;
  const start = base.startDate;
  const upTo = opts.today && opts.today < weekEnd ? opts.today : weekEnd;
  const withRitmo = dates.filter((d) => (!start || d >= start) && d <= upTo);
  const itemsMarked = withRitmo.reduce(
    (n, d) => n + Object.entries(state.dayLogs[d]?.status ?? {}).filter(([k, v]) => k !== STEP_ITEM_ID && (v === 'fatto' || v === 'sostituito')).length,
    0,
  );
  return {
    ...base,
    weekStart: ws,
    weekEnd,
    weekNumber: planWeekNumber(ws, state.plan),
    complete: !opts.today || weekEnd <= opts.today,
    load: status.load,
    loadStatus: status,
    gymSessions: state.workoutLogs.filter((w) => inWeek(w.date)).length,
    footballSessions: state.footballLogs.filter((f) => inWeek(f.date)).length,
    sweets,
    sweetsPlanned: planned,
    sweetsExtra: Math.max(0, sweets - planned),
    // Anche la prima settimana da rivedere di chi ha cominciato il fine settimana prima.
    firstWeek: (Boolean(start) && start! >= ws && start! <= weekEnd) || (firstUseOf(state.plan) !== null && firstReviewWeek(state.plan) === ws),
    daysWithRitmo: withRitmo.length,
    itemsMarked,
  };
}

// ───────────────────────── Proposte ─────────────────────────

const pct1 = (frac: number) => fmtDelta(frac * 100, '%', 1);

function sleepProposal(stats: WeekStats, plan: Plan): Proposal {
  const { current, target, curfewLeadMin, stepMin } = plan.sleep;
  const nights = stats.nightsOnTarget;
  const limit = addMinutes(current, ON_TARGET_TOLERANCE_MIN);
  const counted = stats.nightsWithBedtime;
  // Denominatore: le notti con Ritmo della settimana (7 a regime, meno nella prima settimana).
  const of = Math.max(stats.countedNights, counted);
  const onTarget = `${nights} ${nights === 1 ? 'notte' : 'notti'} su ${of}`;
  const curfew = (t: string) => addMinutes(t, -curfewLeadMin);
  if (counted === 0) {
    return {
      id: 'sonno',
      area: 'sonno',
      title: `Resta a letto alle ${current}`,
      reason: 'Nessun orario a letto registrato questa settimana. Segnalo nel controllo del mattino: con 5 notti in orario l’orario avanza.',
    };
  }
  if (atSleepTarget(plan)) {
    return nights >= NIGHTS_TO_ADVANCE
      ? {
          id: 'sonno',
          area: 'sonno',
          title: `Obiettivo raggiunto: a letto alle ${target}`,
          reason: `${onTarget} a letto entro le ${limit}. Tieni questo orario: il ritmo ormai è tuo.`,
        }
      : {
          id: 'sonno',
          area: 'sonno',
          title: `Tieni l’orario delle ${current}`,
          reason: `${onTarget} in orario. Telefono fuori dalla camera alle ${curfew(current)}.`,
        };
  }
  if (nights >= NIGHTS_TO_ADVANCE) {
    const next = nextBedtime(plan);
    const step = Math.min(stepMin, Math.max(0, nightMinutes(current) - nightMinutes(next)));
    return {
      id: 'sonno',
      area: 'sonno',
      title: `A letto alle ${next}`,
      reason: `${onTarget} a letto entro le ${limit}: anticipa di ${step} minuti. Coprifuoco del telefono alle ${curfew(next)}.`,
      apply: { type: 'sleepCurrent', value: next },
    };
  }
  if (stats.firstWeek && of < 7) {
    return {
      id: 'sonno',
      area: 'sonno',
      title: `Resta a letto alle ${current}`,
      reason: `Prima settimana: ${onTarget} entro le ${limit}. Da lunedì contano tutte e 7: con ${NIGHTS_TO_ADVANCE} in orario l’orario avanza di ${stepMin} minuti. Telefono fuori alle ${curfew(current)}.`,
    };
  }
  return {
    id: 'sonno',
    area: 'sonno',
    title: `Resta a letto alle ${current}`,
    reason: `${onTarget} entro le ${limit}: ne servono ${NIGHTS_TO_ADVANCE} per anticipare. Telefono fuori alle ${curfew(current)}.`,
  };
}

/** Correzione delle calorie in base all'obiettivo e alla variazione settimanale del peso (frazione). */
export function kcalCorrection(goal: Goal, pct: number): number {
  switch (goal) {
    case 'dimagrimento':
      // Calo atteso tra lo 0,5% e l'1% a settimana.
      if (pct > -0.0025) return -KCAL_UP;
      if (pct < -0.01) return KCAL_UP;
      return 0;
    case 'massa':
      // Aumento atteso tra lo 0,1% e lo 0,5% a settimana.
      if (pct < 0.001) return KCAL_UP;
      if (pct > WEIGHT_CHANGE_LIMIT) return KCAL_DOWN;
      return 0;
    default:
      // Ricomposizione e mantenimento: peso stabile entro lo 0,5%.
      if (pct < -WEIGHT_CHANGE_LIMIT) return KCAL_UP;
      if (pct > WEIGHT_CHANGE_LIMIT) return KCAL_DOWN;
      return 0;
  }
}

const GOAL_WORD: Record<Goal, string> = {
  ricomposizione: 'la ricomposizione',
  dimagrimento: 'il dimagrimento',
  massa: 'la massa',
  mantenimento: 'il mantenimento',
};

/** Settimane dall'inizio del piano in cui l'aumento di peso può essere acqua richiamata dalla creatina. */
export const CREATINE_WATER_WEEKS = 4;

/** Creatina attiva nel piano e nelle prime settimane: il peso sale per l'acqua intracellulare, non per il grasso. */
export function creatineLoading(weekStart: ISODate, plan: Pick<Plan, 'supplements' | 'startDate'>): boolean {
  const active = (plan.supplements ?? []).some((x) => x.active && (x.id === 'creatina' || /creatin/i.test(x.name)));
  if (!active || !plan.startDate) return false;
  const w = weekIndexSince(plan.startDate, weekStart);
  return w >= 0 && w < CREATINE_WATER_WEEKS;
}

/** Testo dei limiti dell'energia quando il deficit è già al tetto (§ 2.1). */
export const DEFICIT_AT_CAP_TEXT = 'Deficit già al massimo: tieni le calorie e guarda sonno e passi.';

/**
 * Revisioni salvate prima della settimana rivista: il deficit in vigore si ricava da quelle (`goalDeltaOf`), così
 * rileggere una revisione già accettata non conta due volte la sua correzione.
 */
function reviewsBefore(state: ReviewState, weekStart: ISODate): WeeklyReview[] {
  return (state.reviews ?? []).filter((r) => r && r.weekStart < weekStart);
}

function weightProposal(stats: WeekStats, state: ReviewState): Proposal {
  if (stats.weighIns < MIN_WEIGH_INS) {
    return {
      id: 'peso',
      area: 'peso',
      title: 'Pesati almeno 4 mattine',
      reason: `${stats.weighIns === 0 ? 'Nessuna pesata' : `${stats.weighIns} ${stats.weighIns === 1 ? 'pesata' : 'pesate'}`} questa settimana: ne servono ${MIN_WEIGH_INS} per correggere le calorie. A digiuno, dopo il bagno, prima di colazione.`,
      apply: { type: 'none' },
    };
  }
  const pct = stats.weightDeltaPct ?? 0;
  const delta = stats.weightDelta ?? 0;
  const goal = state.profile.goal ?? 'ricomposizione';
  const proposed = kcalCorrection(goal, pct);
  // Limiti dell'energia (§ 2.1): la correzione si taglia perché il deficit non superi 500 kcal né il 20% del dispendio.
  const reviews = reviewsBefore(state, stats.weekStart);
  const kcal = proposed ? clampKcalCorrection(proposed, state.plan, state.profile, reviews) : 0;
  const change = `${fmtDelta(delta, 'kg', 1)} (${pct1(pct)})`;
  const ref = stats.weightDeltaSource === 'confronto' ? 'rispetto alla settimana prima' : 'nella settimana';
  const avg = stats.weightAvg !== null ? `Peso medio ${fmtKg(stats.weightAvg)}, ` : '';
  if (kcal > 0) {
    return {
      id: 'calorie',
      area: 'calorie',
      title: `+${fmtNumber(kcal)} kcal al giorno`,
      reason: `${avg}${change} ${ref}: un calo così rapido per ${GOAL_WORD[goal]} rischia di costare muscolo. Le calorie in più arrivano dai carboidrati.`,
      apply: { type: 'kcalDelta', value: kcal },
    };
  }
  if (proposed < 0 && delta > 0 && creatineLoading(stats.weekStart, state.plan)) {
    // Nelle prime settimane la creatina richiama acqua nei muscoli (circa 0,5-1 kg): non è grasso.
    return {
      id: 'calorie',
      area: 'calorie',
      title: 'Calorie invariate',
      reason: `${stats.weightAvg !== null ? `Peso medio ${fmtKg(stats.weightAvg)}, in salita` : 'Peso in salita'} di ${fmtKg(Math.round(delta * 10) / 10)} (${pct1(pct)}) ${ref}: nelle prime settimane di creatina è soprattutto acqua nei muscoli. Calorie invariate, ricontrolliamo tra una settimana.`,
    };
  }
  if (proposed < 0 && (kcal === 0 || deficitAtCap(state.plan, state.profile, reviews))) {
    // Il deficit è già al tetto: nessun taglio in più.
    return {
      id: 'calorie',
      area: 'calorie',
      title: 'Calorie invariate',
      reason: `${avg}${change} ${ref}. ${DEFICIT_AT_CAP_TEXT}`,
    };
  }
  if (proposed > 0 && kcal === 0) {
    // Surplus già al tetto (+500 kcal): nessun aumento in più.
    return {
      id: 'calorie',
      area: 'calorie',
      title: 'Calorie invariate',
      reason: `${avg}${change} ${ref}: le calorie sono già al massimo previsto per ${GOAL_WORD[goal]}.`,
    };
  }
  if (kcal < 0) {
    const n = Math.abs(kcal);
    return {
      id: 'calorie',
      area: 'calorie',
      title: `${fmtNumber(-n)} kcal al giorno`,
      reason:
        goal === 'dimagrimento'
          ? `${avg}${change} ${ref}: il calo è troppo lento. Togli ${fmtNumber(n)} kcal dai carboidrati, proteine invariate.`
          : `${avg}${change} ${ref}: sali più del previsto per ${GOAL_WORD[goal]}. Togli ${fmtNumber(n)} kcal dai carboidrati, proteine invariate.`,
      apply: { type: 'kcalDelta', value: kcal },
    };
  }
  return {
    id: 'calorie',
    area: 'calorie',
    title: 'Calorie invariate',
    reason: `${avg}${change} ${ref}: sei nella fascia giusta per ${GOAL_WORD[goal]}. Avanti così.`,
  };
}

/** Il pasto, con l'articolo: "soprattutto la cena". */
const SLOT_WITH_ARTICLE: Record<MealSlot, string> = {
  colazione: 'la colazione',
  spuntino: 'lo spuntino',
  pranzo: 'il pranzo',
  merenda: 'la merenda',
  cena: 'la cena',
};

/** Il pasto con "in" e l'articolo: "nella cena", "nello spuntino". */
const SLOT_IN: Record<MealSlot, string> = {
  colazione: 'nella colazione',
  spuntino: 'nello spuntino',
  pranzo: 'nel pranzo',
  merenda: 'nella merenda',
  cena: 'nella cena',
};
const SLOT_FEMININE: Record<MealSlot, boolean> = { colazione: true, spuntino: false, pranzo: false, merenda: true, cena: true };

/** "nei 5", ma "negli 8", "negli 11", "negli 80": davanti ai numeri che si leggono con una vocale. */
function inThePlural(n: number): string {
  return n === 8 || n === 11 || (n >= 80 && n < 90) || (n >= 800 && n < 900) ? 'negli' : 'nei';
}

/** Come tenere le fibre quando quel pasto esce dal menù. */
const SLOT_FIBER_TIP: Record<MealSlot, string> = {
  colazione: 'Se la colazione salta o cambia, porta via un frutto e una manciata di frutta secca.',
  spuntino: 'Se lo spuntino cambia, tieni il frutto: al bar una spremuta non lo sostituisce, perché le fibre restano nella polpa.',
  pranzo: 'Quando sostituisci il pranzo tieni la verdura: un’insalata in busta o una porzione di verdure surgelate bastano.',
  merenda: 'Se la merenda cambia, tieni il frutto: una banana o una mela si portano ovunque.',
  cena: 'Quando sostituisci la cena tieni la verdura: una busta di verdure surgelate in padella è pronta in 8 minuti.',
};

/**
 * Aggiunte al menù quando è il menù stesso a stare sotto l'obiettivo, nell'ordine in cui si propongono (le
 * più leggere prima). Le fibre si calcolano dal catalogo degli alimenti.
 */
const FIBER_ADDITIONS: { id: string; text: string; foodId: string; grams: number }[] = [
  { id: 'frutto', text: 'un frutto allo spuntino', foodId: 'mela', grams: 170 },
  { id: 'legumi', text: 'una mano a coppa di legumi in barattolo a pranzo', foodId: 'cannellini', grams: 80 },
  { id: 'vellutata', text: 'una vellutata di verdure a cena', foodId: 'vellutata-pronta', grams: 250 },
];

/** Le aggiunte che servono per colmare `gapG` grammi di fibre, con le fibre e le calorie che portano. */
export function fiberAdditions(gapG: number): { items: { id: string; text: string; fiberG: number; kcal: number }[]; fiberG: number; kcal: number } {
  const items: { id: string; text: string; fiberG: number; kcal: number }[] = [];
  let fiber = 0;
  let kcal = 0;
  for (const a of FIBER_ADDITIONS) {
    if (items.length && fiber >= gapG - 0.5) break;
    const per100 = FOODS[a.foodId]?.per100g;
    const item = { id: a.id, text: a.text, fiberG: ((per100?.fiberG ?? 0) * a.grams) / 100, kcal: ((per100?.kcal ?? 0) * a.grams) / 100 };
    items.push(item);
    fiber += item.fiberG;
    kcal += item.kcal;
  }
  return { items, fiberG: fiber, kcal };
}

/** Il pasto che ha perso più fibre nel periodo. */
function mostLostSlot(lost: Partial<Record<MealSlot, number>>): MealSlot | null {
  let best: MealSlot | null = null;
  for (const [slot, g] of Object.entries(lost) as [MealSlot, number][]) if (g > 0 && (best === null || g > (lost[best] ?? 0))) best = slot;
  return best;
}

/**
 * Fibre: si propone qualcosa solo se le fibre stimate stanno sotto il riferimento oltre il margine
 * (`fiberLow`). Se il menù previsto ne porta abbastanza, il problema sono i pasti sostituiti o saltati e la
 * proposta dice quale pasto tenere, senza aggiungere cibo a un menù già tarato. Solo quando è il menù a stare
 * sotto l'obiettivo (obiettivo alzato o ricette cambiate) si aggiungono alimenti, quanti ne servono.
 */
function fiberProposal(stats: WeekStats): Proposal | null {
  if (!stats.fiberLow || stats.fiberAvgG === null || stats.fiberPlannedG === null) return null;
  const eaten = fmtNumber(Math.round(stats.fiberAvgG));
  const planned = Math.round(stats.fiberPlannedG);
  const target = stats.fiberTargetG;
  const missed = stats.mealsReplaced + stats.mealsSkipped;
  const menuOk = stats.fiberStarter || stats.fiberPlannedG >= target - MENU_FIBER_TOLERANCE_G;
  if (menuOk) {
    const slot = mostLostSlot(stats.fiberLostBySlot);
    let where: string;
    if (missed === 1 && slot) {
      // "mancano nella cena sostituita", "mancano nello spuntino saltato".
      const fem = SLOT_FEMININE[slot];
      where = `mancano ${SLOT_IN[slot]} ${stats.mealsReplaced ? (fem ? 'sostituita' : 'sostituito') : fem ? 'saltata' : 'saltato'}`;
    } else {
      const kind = stats.mealsReplaced && stats.mealsSkipped ? 'sostituiti o saltati' : stats.mealsReplaced ? 'sostituiti' : 'saltati';
      where = `mancano ${inThePlural(missed)} ${missed}\u00a0pasti ${kind}${slot ? `, soprattutto ${SLOT_WITH_ARTICLE[slot]}` : ''}`;
    }
    return {
      id: 'fibre',
      area: 'fibre',
      title: 'Le fibre si perdono fuori menù',
      reason: `Il menù${stats.fiberStarter ? ' di avvio' : ''} ne porta circa ${fmtNumber(planned)}\u00a0g al giorno, dai pasti segnati ne arrivano circa ${eaten}: ${where}. ${slot ? SLOT_FIBER_TIP[slot] : 'Segui il menù nei pasti principali, la verdura prima di tutto.'}`,
      apply: { type: 'none' },
    };
  }
  const add = fiberAdditions(target - stats.fiberPlannedG);
  const kcal = Math.round(add.kcal / 10) * 10;
  return {
    id: 'fibre',
    area: 'fibre',
    title: 'Più fibre nel menù',
    reason: `Il menù ne porta circa ${fmtNumber(planned)}\u00a0g al giorno, l’obiettivo è ${target}\u00a0g. Aggiungi ${listIt(add.items.map((a) => a.text))}: circa ${fmtNumber(Math.round(add.fiberG))}\u00a0g di fibre e ${fmtNumber(kcal)}\u00a0kcal in più.${kcal > 120 ? ' Per restare nelle calorie togli mezza porzione di pane o pasta.' : ''}`,
    apply: { type: 'none' },
  };
}

function painProposal(stats: WeekStats, plan: Plan): Proposal | null {
  const flagged = stats.pain.filter((p) => p.readings > 0 && (p.overThreshold || p.trend === 'su'));
  if (!flagged.length) return null;
  const threshold = plan.painThreshold ?? 3;
  const parts = flagged.map((p) => {
    const avg = fmtNumber(p.avg ?? 0, 1);
    if (p.overThreshold) return `${p.site} in media a ${avg} su 10, sopra la soglia di ${threshold}`;
    const from = p.prevAvg !== null ? ` da ${fmtNumber(p.prevAvg, 1)} a ${avg}` : '';
    return `${p.site} in aumento${from}`;
  });
  // Le sedute sono già a presa neutra: sopra soglia cambia l'esercizio (elbowSwitch in training.ts).
  const elbowOver = flagged.some((p) => /gomit/i.test(p.site) && p.overThreshold);
  const elbowTip = elbowOver ? ' Con il gomito sopra soglia, la panca con i manubri passa alla chest press e ai cavi.' : '';
  return {
    id: 'dolore',
    area: 'dolore',
    title: flagged.length === 1 ? `${flagged[0].site}: riduci il carico` : 'Dolore: riduci il carico',
    reason: `${capital(listIt(parts))}. Togli una serie agli esercizi che la caricano e niente aumenti di carico.${elbowTip} Senti il fisioterapista prima della prossima partita.`,
    apply: { type: 'none' },
  };
}

function capital(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function loadProposal(stats: WeekStats, plan: Plan): Proposal | null {
  const st = stats.loadStatus;
  if (!st.alert) return null;
  const optional = plan.week.find((d) => d.gymOptional && d.gymSessionId);
  const ratio = st.ratio !== null ? `il ${fmtNumber(st.ratio * 100)}% della media` : 'molto sopra la media';
  const skip = optional ? `Salta la seduta ${optional.gymSessionId} facoltativa` : 'Togli una seduta di palestra';
  return {
    id: 'allenamento',
    area: 'allenamento',
    title: 'Settimana più leggera',
    reason: `Carico di ${fmtNumber(st.load)} UA, ${ratio} delle settimane precedenti (soglia 120%). ${skip} e tieni le altre a RIR 3.`,
    // Accettata scrive `Plan.weekOverrides` della settimana dopo: la seduta facoltativa sparisce, le altre a RIR ≥ 3.
    apply: { type: 'weekKind', weekStart: addDays(weekStartOf(stats.weekStart), 7), kind: 'leggera' },
  };
}

function sweetsProposal(stats: WeekStats, plan: Plan): Proposal | null {
  if (stats.sweetsExtra <= 0) return null;
  return {
    id: 'dolci',
    area: 'dolci',
    title: 'Dolci: sposta la voglia',
    reason: `${stats.sweets} dolci su ${stats.sweetsPlanned} previsti. Merenda proteica alle ${plan.mealTimes.merenda} (yogurt greco e frutta) per arrivare a cena senza fame, e il dolce programmato dopo cena, mai a stomaco vuoto.`,
    apply: { type: 'none' },
  };
}

/** Settimana da cui contare le settimane di lavoro: dopo l'ultimo scarico accettato, o l'inizio del piano. */
export function loadingSince(weekStart: ISODate, state: ReviewState): ISODate {
  const ws = weekStartOf(weekStart);
  const last = (state.reviews ?? [])
    .filter((r) => r.weekStart < ws && r.acceptedProposals.includes('scarico'))
    .map((r) => r.weekStart)
    .sort()
    .pop();
  // Lo scarico si fa la settimana dopo la revisione che lo accetta; si riparte da quella successiva.
  if (last) return addDays(last, 14);
  return weekStartOf(state.plan.startDate || ws);
}

function deloadProposal(stats: WeekStats, state: ReviewState): Proposal | null {
  const since = loadingSince(stats.weekStart, state);
  const weeks = weekIndexSince(since, stats.weekStart) + 1;
  const rising = stats.pain.filter((p) => p.trend === 'su');
  const early = stats.shortNights >= SHORT_NIGHTS_FOR_DELOAD && rising.length > 0;
  if (weeks < DELOAD_AFTER_WEEKS && !early) return null;
  const how = 'stessi esercizi con metà delle serie e RIR 3-4; il calcio resta com’è';
  const reason =
    weeks >= DELOAD_AFTER_WEEKS
      ? `${weeks} settimane di lavoro ${since === weekStartOf(state.plan.startDate || since) ? 'dall’inizio del piano' : 'dall’ultimo scarico'}: è il momento di recuperare. La prossima settimana ${how}.`
      : `${stats.shortNights} notti sotto le ${SHORT_NIGHT_H} ore e ${listIt(rising.map((p) => p.site.toLowerCase()))} in aumento: meglio scaricare adesso. La prossima settimana ${how}.`;
  // Accettata scrive `Plan.weekOverrides` della settimana dopo: le sedute (anche quelle fisse) prendono i fattori dello
  // scarico (engine/plan/program.ts).
  return {
    id: 'scarico',
    area: 'scarico',
    title: 'Settimana di scarico',
    reason,
    apply: { type: 'weekKind', weekStart: addDays(weekStartOf(stats.weekStart), 7), kind: 'scarico' },
  };
}

/**
 * Proposte per la settimana dopo quella rivista, nell'ordine di `PROPOSAL_ORDER`.
 * Sonno e calorie (o peso) ci sono sempre; le altre solo quando scatta la regola. Nessuna proposta per una
 * settimana che non si può rivedere (`isReviewableWeek`).
 */
export function proposals(weekStart: ISODate, state: ReviewState, opts: PeriodOptions & { stats?: WeekStats } = {}): Proposal[] {
  // Una settimana di avvio troppo corta non si rivede: niente correzioni senza dati.
  if (!isReviewableWeek(weekStart, state.plan)) return [];
  const stats = opts.stats ?? weekStats(weekStart, state, opts);
  const plan = state.plan;
  const list: (Proposal | null)[] = [
    sleepProposal(stats, plan),
    weightProposal(stats, state),
    painProposal(stats, plan),
    loadProposal(stats, plan),
    deloadProposal(stats, state),
    fiberProposal(stats),
    sweetsProposal(stats, plan),
  ];
  return list
    .filter((p): p is Proposal => p !== null)
    .sort((a, b) => PROPOSAL_ORDER.indexOf(a.area) - PROPOSAL_ORDER.indexOf(b.area));
}

/** Proposte che si possono accettare (hanno un `apply`). */
export function acceptable(list: readonly Proposal[]): Proposal[] {
  return list.filter((p) => p.apply !== undefined);
}

/** Proposte che cambiano davvero il piano salvato in modo visibile (orario a letto, calorie). */
export function changesPlan(p: Proposal): boolean {
  return p.apply?.type === 'sleepCurrent' || p.apply?.type === 'kcalDelta';
}

/**
 * Proposte che, accettate, si passano ad `applyProposal`: quelle che cambiano il piano più lo scarico e la settimana
 * più leggera, che scrivono `Plan.weekOverrides` (`weekKind`), e le proposte del piano (`planProposal`). Lo scarico e la
 * settimana leggera restano impegni della settimana nel riepilogo (`changesPlan` falso).
 */
export function appliesToPlan(p: Proposal): boolean {
  return changesPlan(p) || p.apply?.type === 'weekKind' || p.apply?.type === 'planProposal';
}

/** Impegni della settimana dopo che cambiano il programma anche se non toccano il piano salvato. */
const WEEK_COMMITMENTS: readonly Proposal['area'][] = ['scarico', 'allenamento'];

/**
 * Proposte su cui decidere ("Accetta" o "Non ora"): quelle che cambiano il piano (orario a letto, calorie) e gli
 * impegni della settimana dopo (scarico, settimana più leggera: lo scarico accettato fa ripartire il conto delle
 * settimane). Le altre (pesate, dolore, fibre, dolci) sono consigli da sapere: niente da accettare.
 */
export function needsDecision(p: Proposal): boolean {
  return p.apply !== undefined && (changesPlan(p) || WEEK_COMMITMENTS.includes(p.area));
}

/** Descrizione breve dell'effetto sul piano, per il riepilogo dopo il salvataggio. */
export function proposalEffect(p: Proposal): string | null {
  if (p.apply?.type === 'sleepCurrent') return `a letto alle ${p.apply.value}`;
  if (p.apply?.type === 'kcalDelta') return `${p.apply.value > 0 ? '+' : ''}${fmtNumber(p.apply.value)} kcal`;
  return null;
}

/** Voto medio di una revisione (1-10). */
export function reviewScore(r: Pick<WeeklyReview, 'votes'>): number {
  const v = r.votes;
  return round1((v.energia + v.digestione + v.umore + v.campo) / 4);
}

/** Somma delle pliche (mm), se ce ne sono. */
export function skinfoldSum(r: Pick<WeeklyReview, 'skinfolds'> | undefined): number | null {
  const vals = Object.values(r?.skinfolds ?? {}).filter(isNum);
  return vals.length ? round1(vals.reduce((s, v) => s + v, 0)) : null;
}

/** Ultima revisione salvata prima della settimana indicata. */
export function previousReview(weekStart: ISODate, reviews: readonly WeeklyReview[] | undefined): WeeklyReview | undefined {
  const ws = weekStartOf(weekStart);
  return (reviews ?? [])
    .filter((r) => r.weekStart < ws)
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
    .pop();
}

/** Ore di sonno previste dall'orario obiettivo (per la linea del grafico). */
export function targetSleepHours(plan: Pick<Plan, 'sleep'>): number {
  return sleepHours(plan.sleep.target, plan.sleep.wake);
}

/** Testo compatto di una durata media di sonno, o un trattino. */
export function fmtSleepAvg(h: number | null): string {
  return h === null ? '–' : fmtHours(h);
}

// ───────────────────────── Scalino della settimana ─────────────────────────
//
// Un solo obiettivo piccolo e misurabile alla volta, scelto dai dati della settimana più debole: chi parte
// da poca frutta e verdura non passa da zero al menù completo in un giorno. Si propone nella revisione,
// si salva nella revisione (campo facoltativo `step`) e vale per la settimana dopo; Oggi lo mostra con il
// conteggio dei giorni. Acqua e dolci si contano da soli dal diario; gli altri si segnano con un tocco
// (voce `scalino` nel diario del giorno, che non conta nell'aderenza).

export type WeeklyStepId = 'frutta-spuntino' | 'verdura-cena' | 'acqua' | 'caffe' | 'dolci';

export interface WeeklyStepDef {
  id: WeeklyStepId;
  /** "Un frutto allo spuntino" */
  title: string;
  /** Come si fa, in una frase. */
  how: string;
  /** Perché conta, in una frase con il dato scientifico essenziale. */
  why: string;
  /** Come si conta: dal diario (acqua, dolci) o con un tocco in Oggi. */
  measure: 'acqua' | 'dolci' | 'manuale';
}

/** Voce del diario con cui Oggi segna lo scalino del giorno (fuori dalla timeline, non conta nell'aderenza). */
export const STEP_ITEM_ID = 'scalino';
/** Giorni su 7 che rendono riuscito lo scalino. */
export const STEP_TARGET_DAYS = 5;
/** Bicchieri da 250 ml dello scalino dell'acqua (o l'obiettivo del profilo, se più basso). */
export const STEP_WATER_GLASSES = 8;

export const WEEKLY_STEP_IDS: WeeklyStepId[] = ['frutta-spuntino', 'verdura-cena', 'acqua', 'dolci', 'caffe'];

/** Bicchieri dello scalino dell'acqua per questo profilo. */
export function stepWaterGlasses(profile: Pick<AppData['profile'], 'waterTargetL'> | undefined): number {
  const target = Math.round(((profile?.waterTargetL ?? 0) > 0 ? profile!.waterTargetL : 2.5) / 0.25);
  return Math.max(4, Math.min(STEP_WATER_GLASSES, target));
}

export function weeklyStepDef(id: WeeklyStepId, state?: Pick<ReviewState, 'profile' | 'plan'>): WeeklyStepDef {
  const glasses = stepWaterGlasses(state?.profile);
  const planned = state?.plan.sweetsPerWeek ?? 3;
  const snack = state?.plan.mealTimes.spuntino ?? '10:30';
  switch (id) {
    case 'frutta-spuntino':
      return {
        id,
        title: 'Un frutto allo spuntino',
        how: `Ogni giorno un frutto intero allo spuntino delle ${snack}: una mela o una banana si portano in tasca, anche al lavoro.`,
        why: 'Ogni porzione di frutta e verdura in più, fino a 5 al giorno, si associa a meno infiammazione e a un microbiota più vario.',
        measure: 'manuale',
      };
    case 'verdura-cena':
      return {
        id,
        title: 'Verdura a ogni cena',
        how: 'Mezzo piatto di verdura a cena, due pugni: surgelata, in busta o una vellutata pronta vanno benissimo.',
        why: 'È la porzione che si perde per prima fuori casa: con la cena coperta le fibre salgono di 5-6 g al giorno.',
        measure: 'manuale',
      };
    case 'acqua':
      return {
        id,
        title: `${glasses} bicchieri d’acqua al giorno`,
        how: `Un bicchiere a ogni pasto e uno a metà mattina e a metà pomeriggio: ${glasses} bicchieri da 250 ml, segnati nel contatore di Oggi.`,
        why: 'Una disidratazione anche lieve, intorno al 2% del peso, riduce resistenza e lucidità in campo.',
        measure: 'acqua',
      };
    case 'dolci':
      return {
        id,
        title: 'Nessun dolce fuori programma',
        how: `I ${planned} dolci previsti restano; gli altri si rimandano. Se arriva la voglia, yogurt greco con frutta o due quadretti di cioccolato fondente.`,
        why: 'Gli zuccheri aggiunti fuori pasto tolgono spazio a fibre e proteine e alimentano la voglia del giorno dopo.',
        measure: 'dolci',
      };
    case 'caffe':
      return {
        id,
        title: 'Ultimo caffè entro le 14',
        how: 'Il secondo caffè dopo pranzo, non a merenda: nel pomeriggio, se serve, decaffeinato o un tè deteinato.',
        why: 'La caffeina ha un’emivita media di circa 5 ore: un caffè alle 17 a mezzanotte è ancora per più di un terzo in circolo e alleggerisce il sonno profondo.',
        measure: 'manuale',
      };
  }
}

/** Scalino salvato in una revisione (campo facoltativo `step`, annotato in SPEC.md). */
export interface SavedWeeklyStep {
  id: WeeklyStepId;
  title: string;
}

export type WeeklyReviewWithStep = WeeklyReview & { step?: SavedWeeklyStep };

const isStepId = (v: unknown): v is WeeklyStepId => typeof v === 'string' && (WEEKLY_STEP_IDS as string[]).includes(v);

/** Scalino di una revisione, se c'è ed è valido. */
export function reviewStep(review: WeeklyReview | undefined): SavedWeeklyStep | null {
  const st = (review as WeeklyReviewWithStep | undefined)?.step;
  if (!st || typeof st !== 'object' || !isStepId(st.id)) return null;
  return { id: st.id, title: typeof st.title === 'string' && st.title ? st.title : weeklyStepDef(st.id).title };
}

export type StepDayState = 'fatto' | 'mancato' | 'in-corso' | 'futuro' | 'prima';

/** Stato dello scalino in un giorno. Oggi resta "in corso" finché non è fatto (o, per i dolci, finché non finisce). */
export function stepDayState(id: WeeklyStepId, date: ISODate, state: ReviewState, today: ISODate, start: ISODate | null = null): StepDayState {
  if (date > today) return 'futuro';
  if (start && date < start) return 'prima';
  const log = state.dayLogs[date];
  const isToday = date === today;
  switch (id) {
    case 'acqua': {
      const ok = (log?.waterGlasses ?? 0) >= stepWaterGlasses(state.profile);
      return ok ? 'fatto' : isToday ? 'in-corso' : 'mancato';
    }
    case 'dolci': {
      const ws = weekStartOf(date);
      let cum = 0;
      for (let d = ws; d <= date; d = addDays(d, 1)) cum += state.dayLogs[d]?.sweets ?? 0;
      const over = (log?.sweets ?? 0) > 0 && cum > (state.plan.sweetsPerWeek ?? 0);
      if (over) return 'mancato';
      return isToday ? 'in-corso' : 'fatto';
    }
    default:
      return log?.status?.[STEP_ITEM_ID] === 'fatto' ? 'fatto' : isToday ? 'in-corso' : 'mancato';
  }
}

export interface WeeklyStepStatus {
  step: WeeklyStepDef;
  /** Lunedì della settimana in cui vale lo scalino. */
  weekStart: ISODate;
  days: { date: ISODate; state: StepDayState }[];
  done: number;
  target: number;
  todayState: StepDayState;
  /** Si segna con un tocco in Oggi (frutta, verdura, caffè); acqua e dolci si contano dal diario. */
  manual: boolean;
}

/** Avanzamento di uno scalino nella settimana che parte da `weekStart`. */
export function stepProgress(id: WeeklyStepId, weekStart: ISODate, state: ReviewState, today: ISODate): WeeklyStepStatus {
  const ws = weekStartOf(weekStart);
  const start = reviewStart(state);
  const step = weeklyStepDef(id, state);
  const days = weekDates(ws).map((date) => ({ date, state: stepDayState(id, date, state, today, start) }));
  const todayEntry = days.find((d) => d.date === today);
  return {
    step,
    weekStart: ws,
    days,
    done: days.filter((d) => d.state === 'fatto').length,
    target: STEP_TARGET_DAYS,
    todayState: todayEntry?.state ?? 'futuro',
    manual: step.measure === 'manuale',
  };
}

/**
 * Scalino attivo nella settimana di `today`: quello scelto nella revisione della settimana prima.
 * Per Oggi (riquadro con il conteggio dei giorni) e per il coach. Null se non ce n'è uno.
 */
export function weeklyStepStatus(today: ISODate, state: ReviewState): WeeklyStepStatus | null {
  const ws = weekStartOf(today);
  const st = reviewStep(reviewFor(addDays(ws, -7), state.reviews));
  return st ? stepProgress(st.id, ws, state, today) : null;
}

export interface StepOption {
  id: WeeklyStepId;
  title: string;
  /** Il dato della settimana che lo motiva. */
  reason: string;
  /** Quanto è debole la settimana su questo punto (0-1). */
  gap: number;
}

export interface StepSuggestion {
  /** Scalino consigliato. */
  suggested: StepOption;
  /** Tutti gli scalini, il consigliato per primo. */
  options: StepOption[];
  /** Scalino della settimana rivista e come è andato. */
  previous: { id: WeeklyStepId; title: string; done: number; target: number; consolidated: boolean } | null;
}

/** Il pasto è stato sostituito o saltato (o non segnato) nei giorni chiusi: quante volte. */
function mealMisses(state: ReviewState, dates: ISODate[], slot: 'spuntino' | 'cena'): number {
  return dates.filter((d) => {
    const log = state.dayLogs[d];
    if (!log || log.minimal) return false;
    const st = log.status[`pasto:${slot}`];
    return st === 'sostituito' || st === 'saltato';
  }).length;
}

/**
 * Scalino da proporre per la settimana dopo `weekStart`, scelto sul punto più debole della settimana:
 * frutta e verdura dai pasti segnati, acqua dal contatore, dolci fuori programma, qualità del sonno
 * (per il caffè). Lo scalino della settimana rivista, se non è riuscito (meno di 5 giorni), si ripete;
 * se è riuscito si sale al prossimo.
 */
export function proposeWeeklyStep(weekStart: ISODate, state: ReviewState, opts: PeriodOptions & { stats?: WeekStats } = {}): StepSuggestion {
  const ws = weekStartOf(weekStart);
  const stats = opts.stats ?? weekStats(ws, state, opts);
  const today = opts.today ?? addDays(ws, 6);
  const start = stats.startDate;
  const closed = closedDays(start, stats.dates, opts.today && opts.today <= addDays(ws, 6) ? opts.today : addDays(ws, 7));
  const glasses = stepWaterGlasses(state.profile);

  // Dati della settimana.
  const water = closed.map((d) => state.dayLogs[d]?.waterGlasses ?? 0);
  const waterAvg = mean(water);
  const veg = stats.nutritionDays >= MIN_NUTRITION_DAYS ? stats.vegPortionsAvg : null;
  const snackMiss = mealMisses(state, closed, 'spuntino');
  const dinnerMiss = mealMisses(state, closed, 'cena');
  const quality = stats.dates.map((d) => state.checkIns[d]?.sleepQuality).filter(isNum);
  const qualityAvg = mean(quality);

  const options: StepOption[] = WEEKLY_STEP_IDS.map((id) => {
    const def = weeklyStepDef(id, state);
    let gap = 0;
    let reason = def.why;
    switch (id) {
      case 'frutta-spuntino':
      case 'verdura-cena': {
        const misses = id === 'frutta-spuntino' ? snackMiss : dinnerMiss;
        const vegGap = veg !== null ? Math.max(0, (5 - veg) / 5) : 0;
        gap = Math.min(1, vegGap * 0.8 + (closed.length ? (misses / closed.length) * 0.6 : 0));
        if (veg !== null && veg < 5)
          reason = `Circa ${fmtNumber(veg, 1)} porzioni di frutta e verdura al giorno dai pasti segnati${misses ? `, ${id === 'frutta-spuntino' ? 'spuntino' : 'cena'} fuori menù ${misses} ${misses === 1 ? 'volta' : 'volte'}` : ''}. ${def.why}`;
        else if (misses) reason = `${id === 'frutta-spuntino' ? 'Spuntino' : 'Cena'} fuori menù ${misses} ${misses === 1 ? 'volta' : 'volte'} questa settimana. ${def.why}`;
        break;
      }
      case 'acqua':
        if (waterAvg !== null) {
          gap = Math.max(0, (glasses - waterAvg) / glasses);
          if (waterAvg < glasses) reason = `In media ${fmtNumber(waterAvg, 1)} bicchieri al giorno questa settimana, ne servono ${glasses}. ${def.why}`;
        }
        break;
      case 'dolci':
        if (stats.sweetsExtra > 0) {
          gap = Math.min(1, 0.35 + stats.sweetsExtra / Math.max(1, stats.sweetsPlanned) / 2);
          reason = `${stats.sweets} dolci su ${stats.sweetsPlanned} previsti questa settimana. ${def.why}`;
        }
        break;
      case 'caffe':
        if (qualityAvg !== null && qualityAvg <= 3.2) {
          gap = Math.min(1, (4 - qualityAvg) / 3);
          reason = `Qualità del sonno in media ${fmtNumber(qualityAvg, 1)} su 5 questa settimana. ${def.why}`;
        } else gap = 0.05;
        break;
    }
    return { id, title: def.title, reason, gap: Math.round(gap * 100) / 100 };
  });

  // Scalino della settimana rivista.
  const prevSaved = reviewStep(reviewFor(addDays(ws, -7), state.reviews));
  let previous: StepSuggestion['previous'] = null;
  if (prevSaved) {
    const pr = stepProgress(prevSaved.id, ws, state, today);
    previous = { id: prevSaved.id, title: pr.step.title, done: pr.done, target: pr.target, consolidated: pr.done >= pr.target };
  }

  const ranked = [...options].sort((a, b) => b.gap - a.gap || WEEKLY_STEP_IDS.indexOf(a.id) - WEEKLY_STEP_IDS.indexOf(b.id));
  let suggested = ranked[0];
  if (previous && !previous.consolidated) {
    const same = options.find((o) => o.id === previous!.id)!;
    suggested = {
      ...same,
      reason: `Questa settimana è riuscito ${previous.done} ${previous.done === 1 ? 'giorno' : 'giorni'} su 7: ripetilo e diventa un’abitudine, poi si sale. ${weeklyStepDef(same.id, state).why}`,
    };
  } else if (previous?.consolidated && suggested.id === previous.id) {
    suggested = ranked.find((o) => o.id !== previous!.id) ?? suggested;
  }
  const rest = options.filter((o) => o.id !== suggested.id).sort((a, b) => b.gap - a.gap || WEEKLY_STEP_IDS.indexOf(a.id) - WEEKLY_STEP_IDS.indexOf(b.id));
  return { suggested, options: [suggested, ...rest], previous };
}
