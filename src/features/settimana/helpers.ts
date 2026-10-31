/**
 * Utilità della schermata Settimana: orari e titoli dei pasti, attività del giorno, etichette.
 * Gli orari dei pasti vengono dal motore della timeline se c'è (stessa logica della schermata Oggi),
 * altrimenti da un calcolo equivalente semplificato.
 */
import type { AppData, FootballKind, HHMM, ISODate, MealSlot, Plan, ScheduleDay } from '../../domain/types';
import { addMinutes, hhmmToMin, minToHHMM, weekdayOf } from '../../engine/dates';
import { FOOTBALL_LABEL, MEAL_SLOT_LABEL, WEEKDAY_SHORT, listIt } from '../../lib/format';

interface MealSchedule {
  time: HHMM;
  title: string;
}

type TimelineModule = {
  mealSchedule?: (day: ScheduleDay | undefined, plan: Pick<Plan, 'mealTimes' | 'sleep'>) => Record<MealSlot, MealSchedule>;
  daySuccessful?: (iso: ISODate, state: AppData) => boolean;
};
const timelineModules = import.meta.glob<TimelineModule>('../../engine/timeline.ts', { eager: true });
const timeline: TimelineModule = Object.values(timelineModules)[0] ?? {};

const PRE_TITLE: Record<FootballKind, string> = {
  partita: 'Merenda pre-partita',
  calcetto: 'Merenda pre-calcetto',
  allenamento: 'Merenda pre-allenamento',
};

/** Orario e titolo dei 5 pasti del giorno, con merenda pre-calcio e cena di recupero. */
export function mealScheduleFor(date: ISODate, plan: Plan): Record<MealSlot, MealSchedule> {
  const day = plan.week.find((d) => d.weekday === weekdayOf(date)) ?? plan.week[weekdayOf(date)];
  try {
    const fromTimeline = timeline.mealSchedule?.(day, plan);
    if (fromTimeline) return fromTimeline;
  } catch {
    /* ripiego qui sotto */
  }
  const t = plan.mealTimes;
  const out = {
    colazione: { time: t.colazione, title: MEAL_SLOT_LABEL.colazione },
    spuntino: { time: t.spuntino, title: MEAL_SLOT_LABEL.spuntino },
    pranzo: { time: t.pranzo, title: MEAL_SLOT_LABEL.pranzo },
    merenda: { time: t.merenda, title: MEAL_SLOT_LABEL.merenda },
    cena: { time: t.cena, title: MEAL_SLOT_LABEL.cena },
  };
  const f = day?.football;
  if (f && hhmmToMin(f.time) >= hhmmToMin('17:30')) {
    out.merenda = { time: addMinutes(f.time, -150), title: PRE_TITLE[f.kind] };
    const end = hhmmToMin(f.time) + f.durationMin;
    out.cena = { time: minToHHMM(Math.ceil((end + 30) / 5) * 5), title: 'Cena di recupero' };
  }
  return out;
}

/** True se la giornata passata è riuscita (se il motore della timeline è disponibile). */
export function daySuccessfulSafe(date: ISODate, state: AppData): boolean | undefined {
  try {
    return timeline.daySuccessful?.(date, state);
  } catch {
    return undefined;
  }
}

export type ActivityKind = 'calcio' | 'palestra' | 'fisio';

export interface DayActivity {
  kind: ActivityKind;
  /** "Partita 21:00", "Seduta A 17:00", "Fisioterapista". */
  label: string;
  /** Etichetta breve per spazi stretti. */
  short: string;
  optional?: boolean;
}

/** Attività previste nel giorno della settimana tipo. */
export function dayActivities(day: ScheduleDay | undefined): DayActivity[] {
  if (!day) return [];
  const out: DayActivity[] = [];
  if (day.football) {
    out.push({ kind: 'calcio', label: `${FOOTBALL_LABEL[day.football.kind]} ${day.football.time}`, short: FOOTBALL_LABEL[day.football.kind] });
  }
  if (day.gymSessionId) {
    out.push({
      kind: 'palestra',
      label: `Seduta ${day.gymSessionId}${day.gymTime ? ` ${day.gymTime}` : ''}${day.gymOptional ? ', facoltativa' : ''}`,
      short: `Seduta ${day.gymSessionId}`,
      optional: day.gymOptional,
    });
  }
  if (day.physio) out.push({ kind: 'fisio', label: 'Esercizi del fisio', short: 'Fisio' });
  return out;
}

/** "Questa settimana", "La prossima settimana", "Tra 2 settimane", "La settimana scorsa", "3 settimane fa". */
export function relativeWeekLabel(offset: number): string {
  if (offset === 0) return 'Questa settimana';
  if (offset === 1) return 'La prossima settimana';
  if (offset === -1) return 'La settimana scorsa';
  if (offset > 1) return `Tra ${offset} settimane`;
  return `${-offset} settimane fa`;
}

/** Giorni in cui serve un prodotto: "lun, mer e ven", "tutti i giorni", "6 giorni". */
export function daysText(days: ISODate[]): string {
  if (days.length >= 7) return 'tutti i giorni';
  if (days.length >= 5) return `${days.length} giorni`;
  return listIt(days.map((d) => WEEKDAY_SHORT[weekdayOf(d)]));
}

/** "1 pasto", "3 pasti". */
export function mealsText(n: number): string {
  return n === 1 ? '1 pasto' : `${n} pasti`;
}

/**
 * Due "fuochi" in parallelo: tempo stimato facendo due cose insieme (assegnazione al fornello più libero,
 * partendo dalle attività più lunghe).
 */
export function parallelMinutes(minutes: number[], lanes = 2): number {
  const load = Array.from({ length: lanes }, () => 0);
  for (const m of [...minutes].sort((a, b) => b - a)) {
    let i = 0;
    for (let j = 1; j < lanes; j++) if (load[j] < load[i]) i = j;
    load[i] += m;
  }
  return Math.max(0, ...load);
}
