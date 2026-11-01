/**
 * Sonno: orario a letto della fase attuale, coprifuoco del telefono, ore dormite, notti in orario,
 * e il confine tra una giornata e la successiva (chi va a letto dopo mezzanotte è ancora "ieri").
 */
import type { CheckIn, HHMM, ISODate, Plan, ScheduleDay } from '../domain/types';
import { addDays, addMinutes, currentDate, hhmmToMin, isISODate, minToHHMM, minutesBetween, nightMinutes, toISO, weekdayOf } from './dates';

/** Tolleranza per considerare una notte "in orario". */
export const ON_TARGET_TOLERANCE_MIN = 15;

// ───────────────────────── Confine della giornata ─────────────────────────

/**
 * Inizio della giornata in minuti dalla mezzanotte: gli orari prima di quest'ora appartengono alla notte
 * della giornata precedente (a letto alle 00:30). 90 minuti prima della sveglia, tra le 03:00 e le 10:00.
 */
export function dayCutoffMin(plan: { sleep: Pick<Plan['sleep'], 'wake'> }): number {
  const wake = hhmmToMin(plan.sleep.wake);
  return Math.min(600, Math.max(180, wake - 90));
}

/**
 * Giornata del piano in corso: prima del confine (sveglia meno 90 minuti) è ancora quella di ieri.
 * Alle 00:40 di giovedì, con sveglia alle 07:15, la giornata è mercoledì.
 */
export function planDayISO(now: Date, plan: { sleep: Pick<Plan['sleep'], 'wake'> }): ISODate {
  const cal = toISO(now);
  return now.getHours() * 60 + now.getMinutes() < dayCutoffMin(plan) ? addDays(cal, -1) : cal;
}

/** Come `planDayISO`, con l'orologio dell'app (rispetta ?today= e ?now= delle anteprime). */
export function planTodayISO(plan: { sleep: Pick<Plan['sleep'], 'wake'> }, now: Date = currentDate()): ISODate {
  return planDayISO(now, plan);
}

// ───────────────────────── Orario a letto ─────────────────────────

/** Dopo il calcio serale: doccia e rientro prima della cena di recupero (come nella timeline). */
export const POST_FOOTBALL_DINNER_MIN = 30;
/**
 * Dalla cena di recupero al letto. Dopo una partita serale l'eccitazione e la temperatura corporea
 * ritardano l'addormentamento: andare a letto mezz'ora dopo un pasto abbondante non è realistico.
 */
export const POST_FOOTBALL_WIND_DOWN_MIN = 75;
/** Il calcio conta come serale da quest'ora (come EVENING_FOOTBALL_FROM della timeline). */
const EVENING_FOOTBALL_FROM_MIN = 17 * 60 + 30;

function scheduleOf(iso: ISODate, plan: Pick<Plan, 'week'>): ScheduleDay | undefined {
  const wd = weekdayOf(iso);
  return plan.week?.find((d) => d.weekday === wd) ?? plan.week?.[wd];
}

/**
 * Primo orario a letto realistico dopo il calcio serale della data: fine del calcio + 30 minuti per la cena
 * di recupero + 75 minuti per calare (partita 21:00-22:30 → 00:15). Null se quel giorno non c'è calcio serale.
 */
export function footballBedtimeFloor(iso: ISODate, plan: Pick<Plan, 'week'>): HHMM | null {
  if (!isISODate(iso)) return null;
  const f = scheduleOf(iso, plan)?.football;
  if (!f) return null;
  const start = hhmmToMin(f.time);
  if (start < EVENING_FOOTBALL_FROM_MIN) return null;
  const end = start + Math.max(0, f.durationMin || 0);
  return minToHHMM(Math.ceil((end + POST_FOOTBALL_DINNER_MIN + POST_FOOTBALL_WIND_DOWN_MIN) / 5) * 5);
}

/**
 * Orario a letto della data: la fase attuale del piano, spostata più tardi nelle sere di calcio quando
 * la fase arriverebbe prima della fine della cena di recupero. Una data non valida (es. '') restituisce la fase.
 */
export function bedtimeFor(iso: ISODate, plan: Pick<Plan, 'sleep' | 'week'>): HHMM {
  const base = plan.sleep.current;
  const floor = footballBedtimeFloor(iso, plan);
  if (!floor) return base;
  return nightMinutes(floor) > nightMinutes(base) ? floor : base;
}

/** Orario in cui il telefono esce dalla camera. */
export function curfewFor(iso: ISODate, plan: Pick<Plan, 'sleep' | 'week'>): HHMM {
  return addMinutes(bedtimeFor(iso, plan), -plan.sleep.curfewLeadMin);
}

/** Ore di sonno tra due orari (attraversa la mezzanotte): 23:30 → 07:15 = 7,75. */
export function sleepHours(bed: HHMM, wake: HHMM): number {
  return minutesBetween(bed, wake) / 60;
}

/** Ore dormite dal controllo: usa sleepHours se presente, altrimenti gli orari. */
export function checkInSleepHours(c: CheckIn | undefined): number | undefined {
  if (!c) return undefined;
  if (typeof c.sleepHours === 'number' && c.sleepHours > 0) return c.sleepHours;
  if (c.bedTime && c.wakeTime) return sleepHours(c.bedTime, c.wakeTime);
  return undefined;
}

/** True se l'orario a letto è entro `current` + tolleranza (00:45 dopo 23:30 conta come tardi). */
export function isOnTarget(bed: HHMM, plan: Pick<Plan, 'sleep'>, toleranceMin = ON_TARGET_TOLERANCE_MIN): boolean {
  return nightMinutes(bed) <= nightMinutes(plan.sleep.current) + toleranceMin;
}

/**
 * Come `isOnTarget`, per l'orario a letto segnato nel controllo del mattino di `checkInDate`: quella notte
 * appartiene al giorno prima, quindi si confronta con `bedtimeFor(checkInDate − 1)` (dopo la partita del
 * lunedì, il controllo di martedì vale in orario fino alle 00:15 + tolleranza).
 */
export function isOnTargetFor(
  bed: HHMM,
  checkInDate: ISODate,
  plan: Pick<Plan, 'sleep' | 'week'>,
  toleranceMin = ON_TARGET_TOLERANCE_MIN,
): boolean {
  const limit = isISODate(checkInDate) ? bedtimeFor(addDays(checkInDate, -1), plan) : plan.sleep.current;
  return nightMinutes(bed) <= nightMinutes(limit) + toleranceMin;
}

/** Quante delle date hanno un controllo con orario a letto in orario (sere di calcio comprese). */
export function nightsOnTarget(checkIns: Record<ISODate, CheckIn>, plan: Pick<Plan, 'sleep' | 'week'>, dates: ISODate[]): number {
  let n = 0;
  for (const d of dates) {
    const bed = checkIns[d]?.bedTime;
    if (bed && isOnTargetFor(bed, d, plan)) n++;
  }
  return n;
}

/** Prossima fase: anticipa di stepMin senza superare l'obiettivo. */
export function nextBedtime(plan: Plan): HHMM {
  const { current, target, stepMin } = plan.sleep;
  if (nightMinutes(current) <= nightMinutes(target)) return target;
  const next = nightMinutes(current) - stepMin;
  return next <= nightMinutes(target) ? target : addMinutes(current, -stepMin);
}

/** Settimane che servono per arrivare all'obiettivo con passi da stepMin. */
export function weeksToTarget(plan: Plan): number {
  const gap = nightMinutes(plan.sleep.current) - nightMinutes(plan.sleep.target);
  if (gap <= 0) return 0;
  return Math.ceil(gap / Math.max(1, plan.sleep.stepMin));
}

/** True se l'orario a letto attuale ha già raggiunto l'obiettivo. */
export function atSleepTarget(plan: Plan): boolean {
  return nightMinutes(plan.sleep.current) <= nightMinutes(plan.sleep.target);
}

/** Ore di sonno previste dalla fase attuale. */
export function plannedSleepHours(plan: Plan): number {
  return sleepHours(plan.sleep.current, plan.sleep.wake);
}

/**
 * Minuti da `now` a `target` nella serata (0 se già passato).
 * Gli orari dopo la mezzanotte contano come la stessa notte.
 */
export function minutesUntilNight(now: HHMM, target: HHMM): number {
  return Math.max(0, nightMinutes(target) - nightMinutes(now));
}
