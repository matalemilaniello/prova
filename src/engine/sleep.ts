/**
 * Sonno: orario a letto della fase attuale, coprifuoco del telefono, ore dormite, notti in orario.
 */
import type { CheckIn, HHMM, ISODate, Plan } from '../domain/types';
import { addMinutes, minutesBetween, nightMinutes } from './dates';

/** Tolleranza per considerare una notte "in orario". */
export const ON_TARGET_TOLERANCE_MIN = 15;

/** Orario a letto della data (fase attuale del piano). */
export function bedtimeFor(_iso: ISODate, plan: Plan): HHMM {
  return plan.sleep.current;
}

/** Orario in cui il telefono esce dalla camera. */
export function curfewFor(iso: ISODate, plan: Plan): HHMM {
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
export function isOnTarget(bed: HHMM, plan: Plan, toleranceMin = ON_TARGET_TOLERANCE_MIN): boolean {
  return nightMinutes(bed) <= nightMinutes(plan.sleep.current) + toleranceMin;
}

/** Quante delle date hanno un controllo con orario a letto in orario. */
export function nightsOnTarget(checkIns: Record<ISODate, CheckIn>, plan: Plan, dates: ISODate[]): number {
  let n = 0;
  for (const d of dates) {
    const bed = checkIns[d]?.bedTime;
    if (bed && isOnTarget(bed, plan)) n++;
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
