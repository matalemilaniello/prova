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
 *   - fibre: media < obiettivo − 5 g → proposta concreta (vellutata, legumi, frutto);
 *   - dolore: media sopra soglia o in aumento → riduci il carico e senti il fisioterapista;
 *   - carico: allarme del carico → settimana più leggera, seduta C facoltativa saltata;
 *   - dolci: oltre quelli previsti → strategia (merenda proteica, dolce dopo cena);
 *   - scarico: ogni 6-8 settimane dall'inizio (o dall'ultimo scarico), o prima con sonno < 6 h per 3 notti
 *     e dolore in aumento.
 *
 * Una proposta senza `apply` è informativa (nessun pulsante "Accetta"); `{ type: 'none' }` si accetta
 * come impegno senza toccare il piano; `sleepCurrent` e `kcalDelta` cambiano il piano con `applyProposal`.
 * Gli id sono stabili e uguali all'area ('sonno', 'calorie', …): una proposta per area.
 *
 * Nessuna funzione legge l'orologio: la data arriva dagli argomenti.
 */
import type { AppData, Goal, ISODate, Plan, Proposal, WeeklyReview } from '../domain/types';
import { fmtDelta, fmtHours, fmtKg, fmtNumber, listIt } from '../lib/format';
import { addDays, addMinutes, daysBetween, nightMinutes, weekDates, weekdayOf, weekIndexSince, weekStart as weekStartOf } from './dates';
import { mealsForDate } from './menu';
import { recipeNutrition, recipeVegPortions } from './nutrition';
import { atSleepTarget, checkInSleepHours, isOnTarget, nextBedtime, ON_TARGET_TOLERANCE_MIN, sleepHours } from './sleep';
import { adherenceSummary, isSuccessful } from './timeline';
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
  Partial<Pick<AppData, 'reviews' | 'physio'>>;

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

/** La settimana da rivedere esiste nel piano (non è prima dell'inizio). */
export function reviewAvailable(today: ISODate, plan: Pick<Plan, 'startDate'>): boolean {
  return reviewWeekFor(today) >= weekStartOf(plan.startDate);
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
  nightsWithBedtime: number;
  nightsOnTarget: number;
  shortNights: number;
  // Alimentazione stimata dai pasti segnati
  nutritionDays: number;
  fiberAvgG: number | null;
  prevFiberAvgG: number | null;
  proteinAvgG: number | null;
  vegPortionsAvg: number | null;
  fiberTargetG: number;
  proteinTargetG: number;
  // Energia dei controlli del mattino (1-10)
  energyAvg: number | null;
  // Dolore
  pain: PainSiteStats[];
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

function inPlan(state: ReviewState, d: ISODate): boolean {
  return !state.plan.startDate || d >= state.plan.startDate;
}

/** Giorni di cui contano aderenza e pasti: passati e dentro il piano. */
function closedDays(state: ReviewState, dates: ISODate[], today?: ISODate): ISODate[] {
  return dates.filter((d) => inPlan(state, d) && (!today || d < today));
}

function adherenceOf(state: ReviewState, dates: ISODate[]) {
  let sum = 0;
  let ok = 0;
  let minimal = 0;
  for (const d of dates) {
    const s = adherenceSummary(d, state);
    sum += s.score;
    if (isSuccessful(s)) ok++;
    if (s.minimal) minimal++;
  }
  return { avg: dates.length ? sum / dates.length : null, successful: ok, minimal };
}

export interface DayIntake {
  fiberG: number;
  proteinG: number;
  vegPortions: number;
  /** Almeno un pasto segnato (fatto, sostituito o saltato). */
  logged: boolean;
}

/**
 * Fibre e proteine stimate dai pasti segnati: fatto = ricetta intera, sostituito = metà (si è mangiato
 * altro, di solito più povero), saltato = niente. Le giornate minime non hanno pasti da contare.
 */
export function dayIntake(iso: ISODate, state: ReviewState): DayIntake {
  const log = state.dayLogs[iso];
  const empty = { fiberG: 0, proteinG: 0, vegPortions: 0, logged: false };
  if (!log || log.minimal) return empty;
  const { dayType, meals } = mealsForDate(iso, state);
  const out = { ...empty };
  for (const m of meals) {
    const st = log.status[`pasto:${m.slot}`];
    if (!st) continue;
    out.logged = true;
    const k = st === 'fatto' ? 1 : st === 'sostituito' ? 0.5 : 0;
    if (!k || !m.recipe) continue;
    const n = recipeNutrition(m.recipe, dayType);
    out.fiberG += n.fiberG * k;
    out.proteinG += n.proteinG * k;
    out.vegPortions += recipeVegPortions(m.recipe, dayType) * k;
  }
  return out;
}

function intakeOf(state: ReviewState, dates: ISODate[]) {
  const days = dates.map((d) => dayIntake(d, state)).filter((x) => x.logged);
  return {
    days: days.length,
    fiber: mean(days.map((x) => x.fiberG)),
    protein: mean(days.map((x) => x.proteinG)),
    veg: mean(days.map((x) => x.vegPortions)),
  };
}

function targetAvg(state: ReviewState, dates: ISODate[], key: 'fiberG' | 'proteinG'): number {
  const vals = dates.map((d) => state.plan.targets[state.plan.week.find((w) => w.weekday === weekdayOf(d))?.dayType ?? 'palestra']?.[key]);
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
  const upTo = (ds: ISODate[]) => (today ? ds.filter((d) => d <= today) : ds);
  const cur = upTo(dates);
  const prev = upTo(prevDates);

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
  const closed = closedDays(state, cur, today);
  const closedPrev = closedDays(state, prev, today);
  const adh = adherenceOf(state, closed);
  const adhPrev = adherenceOf(state, closedPrev);

  // Sonno
  const sleep = sleepValues(state, cur);
  const sleepPrev = sleepValues(state, prev);
  let nightsWithBedtime = 0;
  let nightsOn = 0;
  for (const d of cur) {
    const bed = state.checkIns[d]?.bedTime;
    if (!bed) continue;
    nightsWithBedtime++;
    if (isOnTarget(bed, state.plan)) nightsOn++;
  }

  // Pasti
  const intake = intakeOf(state, closed);
  const intakePrev = intakeOf(state, closedPrev);

  const energy = cur.map((d) => state.checkIns[d]?.energy).filter(isNum);

  return {
    dates: cur,
    weighIns: w.length,
    weightAvg: weightAvg === null ? null : Math.round(weightAvg * 100) / 100,
    weightPrevAvg: weightPrevAvg === null ? null : Math.round(weightPrevAvg * 100) / 100,
    weightDelta: weightDelta === null ? null : Math.round(weightDelta * 100) / 100,
    weightDeltaPct,
    weightDeltaSource,
    adherenceDays: closed.length,
    adherence: adh.avg,
    prevAdherence: adhPrev.avg,
    successfulDays: adh.successful,
    minimalDays: adh.minimal,
    sleepNights: sleep.length,
    sleepAvgH: mean(sleep),
    prevSleepAvgH: mean(sleepPrev),
    nightsWithBedtime,
    nightsOnTarget: nightsOn,
    shortNights: sleep.filter((h) => h < SHORT_NIGHT_H).length,
    nutritionDays: intake.days,
    fiberAvgG: intake.fiber === null ? null : round1(intake.fiber),
    prevFiberAvgG: intakePrev.fiber === null ? null : round1(intakePrev.fiber),
    proteinAvgG: intake.protein === null ? null : Math.round(intake.protein),
    vegPortionsAvg: intake.veg === null ? null : round1(intake.veg),
    fiberTargetG: targetAvg(state, cur.length ? cur : dates, 'fiberG'),
    proteinTargetG: targetAvg(state, cur.length ? cur : dates, 'proteinG'),
    energyAvg: energy.length ? round1(mean(energy) ?? 0) : null,
    pain: painSites(state, [...cur, ...prev]).map((s) => painStats(state, s, cur, prev)),
  };
}

// ───────────────────────── Numeri della settimana ─────────────────────────

export interface WeekStats extends PeriodStats {
  weekStart: ISODate;
  weekEnd: ISODate;
  /** Settimana del piano (1 = la prima). */
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
  return {
    ...base,
    weekStart: ws,
    weekEnd,
    weekNumber: weekIndexSince(state.plan.startDate || ws, ws) + 1,
    complete: !opts.today || weekEnd <= opts.today,
    load: status.load,
    loadStatus: status,
    gymSessions: state.workoutLogs.filter((w) => inWeek(w.date)).length,
    footballSessions: state.footballLogs.filter((f) => inWeek(f.date)).length,
    sweets,
    sweetsPlanned: planned,
    sweetsExtra: Math.max(0, sweets - planned),
  };
}

// ───────────────────────── Proposte ─────────────────────────

const pct1 = (frac: number) => fmtDelta(frac * 100, '%', 1);

function sleepProposal(stats: WeekStats, plan: Plan): Proposal {
  const { current, target, curfewLeadMin, stepMin } = plan.sleep;
  const nights = stats.nightsOnTarget;
  const limit = addMinutes(current, ON_TARGET_TOLERANCE_MIN);
  const counted = stats.nightsWithBedtime;
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
          reason: `${nights} notti su 7 a letto entro le ${limit}. Tieni questo orario: il ritmo ormai è tuo.`,
        }
      : {
          id: 'sonno',
          area: 'sonno',
          title: `Tieni l’orario delle ${current}`,
          reason: `${nights} notti su 7 in orario. Telefono fuori dalla camera alle ${addMinutes(current, -curfewLeadMin)}.`,
        };
  }
  if (nights >= NIGHTS_TO_ADVANCE) {
    const next = nextBedtime(plan);
    const step = Math.min(stepMin, Math.max(0, nightMinutes(current) - nightMinutes(next)));
    return {
      id: 'sonno',
      area: 'sonno',
      title: `A letto alle ${next}`,
      reason: `${nights} notti su 7 a letto entro le ${limit}: anticipa di ${step} minuti. Coprifuoco del telefono alle ${addMinutes(next, -curfewLeadMin)}.`,
      apply: { type: 'sleepCurrent', value: next },
    };
  }
  return {
    id: 'sonno',
    area: 'sonno',
    title: `Resta a letto alle ${current}`,
    reason: `${nights} ${nights === 1 ? 'notte' : 'notti'} su 7 entro le ${limit}: ne servono ${NIGHTS_TO_ADVANCE} per anticipare. Telefono fuori alle ${addMinutes(current, -curfewLeadMin)}.`,
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
  const kcal = kcalCorrection(goal, pct);
  const change = `${fmtDelta(delta, 'kg', 1)} (${pct1(pct)})`;
  const ref = stats.weightDeltaSource === 'confronto' ? 'rispetto alla settimana prima' : 'nella settimana';
  const avg = stats.weightAvg !== null ? `Peso medio ${fmtKg(stats.weightAvg)}, ` : '';
  if (kcal > 0) {
    return {
      id: 'calorie',
      area: 'calorie',
      title: `+${KCAL_UP} kcal al giorno`,
      reason: `${avg}${change} ${ref}: un calo così rapido per ${GOAL_WORD[goal]} rischia di costare muscolo. Le calorie in più arrivano dai carboidrati.`,
      apply: { type: 'kcalDelta', value: kcal },
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
          ? `${avg}${change} ${ref}: il calo è troppo lento. Togli ${n} kcal dai carboidrati, proteine invariate.`
          : `${avg}${change} ${ref}: sali più del previsto per ${GOAL_WORD[goal]}. Togli ${n} kcal dai carboidrati, proteine invariate.`,
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

function fiberProposal(stats: WeekStats): Proposal | null {
  if (stats.nutritionDays < MIN_NUTRITION_DAYS || stats.fiberAvgG === null) return null;
  if (stats.fiberAvgG >= stats.fiberTargetG - FIBER_MARGIN_G) return null;
  return {
    id: 'fibre',
    area: 'fibre',
    title: 'Più fibre, senza cucinare di più',
    reason: `Circa ${fmtNumber(stats.fiberAvgG)} g al giorno dai pasti segnati, obiettivo ${stats.fiberTargetG} g. Aggiungi una vellutata di verdure a cena, un pugno di legumi in barattolo a pranzo e un frutto allo spuntino: sono circa 12 g in più.`,
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
  const elbow = flagged.some((p) => /gomit/i.test(p.site));
  const tips = ['Togli una serie agli esercizi che la caricano e niente aumenti di carico'];
  if (elbow) tips.push('per il gomito usa solo le varianti a presa neutra');
  return {
    id: 'dolore',
    area: 'dolore',
    title: flagged.length === 1 ? `${flagged[0].site}: riduci il carico` : 'Dolore: riduci il carico',
    reason: `${capital(listIt(parts))}. ${listIt(tips)}. Senti il fisioterapista prima della prossima partita.`,
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
    apply: { type: 'none' },
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
  return { id: 'scarico', area: 'scarico', title: 'Settimana di scarico', reason, apply: { type: 'none' } };
}

/**
 * Proposte per la settimana dopo quella rivista, nell'ordine di `PROPOSAL_ORDER`.
 * Sonno e calorie (o peso) ci sono sempre; le altre solo quando scatta la regola.
 */
export function proposals(weekStart: ISODate, state: ReviewState, opts: PeriodOptions & { stats?: WeekStats } = {}): Proposal[] {
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

/** Proposte che cambiano davvero il piano. */
export function changesPlan(p: Proposal): boolean {
  return p.apply?.type === 'sleepCurrent' || p.apply?.type === 'kcalDelta';
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
