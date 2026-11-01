/**
 * Utilità della schermata Settimana: orari e titoli dei pasti, attività del giorno, etichette.
 * Gli orari dei pasti vengono dal motore della timeline se c'è (stessa logica della schermata Oggi),
 * altrimenti da un calcolo equivalente semplificato.
 */
import type { AppData, DayType, FootballKind, HHMM, ISODate, MealSlot, Plan, ScheduleDay } from '../../domain/types';
import { addDays, addMinutes, hhmmToMin, isISODate, minToHHMM, weekStart, weekdayOf } from '../../engine/dates';
import { FOOTBALL_LABEL, MEAL_SLOT_LABEL, WEEKDAY_LONG, WEEKDAY_SHORT, fmtNumber, listIt } from '../../lib/format';

interface MealSchedule {
  time: HHMM;
  title: string;
}

type TimelineModule = {
  mealSchedule?: (day: ScheduleDay | undefined, plan: Pick<Plan, 'mealTimes' | 'sleep'>) => Record<MealSlot, MealSchedule>;
  daySuccessful?: (iso: ISODate, state: AppData) => boolean;
  starterShopping?: (plan: Pick<Plan, 'startDate' | 'mealTimes'>) => { date: ISODate; time: HHMM } | null;
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

/**
 * Attività previste nel giorno della settimana tipo. Gli esercizi del fisioterapista compaiono solo se l'utente
 * li ha inseriti (`hasPhysio`): senza esercizi il giorno "fisio" non ha niente da fare.
 */
export function dayActivities(day: ScheduleDay | undefined, hasPhysio = true): DayActivity[] {
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
  if (day.physio && hasPhysio) out.push({ kind: 'fisio', label: 'Esercizi del fisio', short: 'Fisio' });
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

/** Giorno del primo avvio (campo facoltativo `Plan.firstUse`, scritto alla fine del benvenuto), se valido. */
export function firstUseDate(plan: Plan): ISODate | undefined {
  const f = (plan as { firstUse?: { date?: unknown } }).firstUse;
  return f && isISODate(f.date) ? f.date : undefined;
}

/**
 * Primo giorno da comprare per la settimana che inizia `monday`: il giorno del primo avvio se cade dopo il
 * lunedì di quella settimana (chi inizia a metà settimana non compra per i giorni passati), altrimenti nessuno.
 */
export function shoppingFromDate(plan: Plan, monday: ISODate): ISODate | undefined {
  const first = firstUseDate(plan);
  if (!first || weekStart(first) !== monday || first === monday) return undefined;
  return first;
}

/**
 * Settimana senza preparazione da fare: la settimana di avvio. Chi ha iniziato dopo la domenica che la precede
 * (o la domenica sera stessa, quando anche quella settimana è di avvio) non ha preparato nulla e non deve
 * recuperare: fino al lunedì dopo si cucina sul momento.
 */
export function prepSkipped(plan: Plan, weekStartIso: ISODate, starterMonday: boolean): boolean {
  const first = firstUseDate(plan);
  if (!first) return false;
  const prepDay = addDays(weekStartIso, -1);
  return first <= addDays(weekStartIso, 6) && (first > prepDay || starterMonday);
}

/** Sabato o domenica: la spesa e la preparazione guardano alla settimana che inizia lunedì. */
export function isWeekend(iso: ISODate): boolean {
  return weekdayOf(iso) >= 5;
}

/** "da mercoledì a domenica", "da lunedì a domenica". */
export function dateSpanText(dates: ISODate[]): string {
  if (!dates.length) return '';
  const a = WEEKDAY_LONG[weekdayOf(dates[0])];
  const b = WEEKDAY_LONG[weekdayOf(dates[dates.length - 1])];
  return dates.length === 1 ? `solo ${a}` : `da ${a} a ${b}`;
}

export function dayTypePhrase(t: DayType): string {
  return t === 'calcio' ? 'di calcio' : t === 'palestra' ? 'di palestra' : t === 'leggero' ? 'leggero' : 'di riposo';
}

/**
 * "Per un giorno leggero i carboidrati calano del 10%: le quantità cambiate sono evidenziate."
 * Il fattore comprende il tipo di giorno e la scala del piano.
 */
export function portionSentence(dayType: DayType, factor: number, matchEve = false): { lead: string; pct: string; tail: string } | null {
  const pct = Math.round(Math.abs(factor - 1) * 100);
  if (!pct) return null;
  const who = matchEve ? 'Per la vigilia della partita' : `Per un giorno ${dayTypePhrase(dayType)}`;
  return { lead: `${who} i carboidrati ${factor > 1 ? 'crescono' : 'calano'} del `, pct: `${fmtNumber(pct)}%`, tail: ': le quantità cambiate sono evidenziate.' };
}


/** Giorno e orario della spesa di avvio (la voce di Oggi), se il motore della timeline la prevede. */
export function starterShoppingSafe(plan: Plan): { date: ISODate; time: HHMM } | null {
  try {
    return timeline.starterShopping?.(plan) ?? null;
  } catch {
    return null;
  }
}

/** Abbassa solo l'iniziale, e solo se la seconda lettera è minuscola: "Aceto balsamico di Modena" → "aceto balsamico di Modena". */
export function lowerFirst(s: string): string {
  return s.length > 1 && s.charAt(1) === s.charAt(1).toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

// ───────────────────────── Giudizio del giorno ─────────────────────────

export interface Verdict {
  good: boolean;
  text: string;
}

const MACRO_TOLERANCE = 0.15;
const PROTEIN_MAX_EXCESS = 0.25;
/** Grassi: fino a 15 g sotto l'obiettivo vanno bene (o il 15%, se è di più), come nel controllo del menù. */
const FAT_SLACK_G = 15;

/**
 * Giudizio del giorno, con le stesse soglie del controllo del menù (`src/data/menu.test.ts`): "In linea" con kcal
 * entro ±8%, carboidrati entro ±15%, proteine tra −15% e +25% (qualche grammo in più non è un problema) e grassi
 * non oltre 15 g sotto l'obiettivo né oltre il 15% sopra. Altrimenti la voce più lontana dall'obiettivo.
 * I grammi si confrontano arrotondati, come si leggono nella card.
 */
export function dayVerdict(
  t: { kcal: number; proteinG: number; carbG: number; fatG: number },
  target: { kcal: number; proteinG: number; carbG: number; fatG: number },
): Verdict {
  const dev = (v: number, ref: number) => (ref > 0 ? Math.round(v) / ref - 1 : 0);
  const k = dev(t.kcal, target.kcal);
  if (Math.abs(k) > 0.08) return { good: false, text: `${k > 0 ? '+' : '−'}${fmtNumber(Math.abs(k) * 100)}% sull’obiettivo` };
  const fatUnder = target.fatG > 0 ? Math.max(MACRO_TOLERANCE, FAT_SLACK_G / target.fatG) : MACRO_TOLERANCE;
  const off: { name: string; d: number; over: number }[] = [
    { name: 'Proteine', d: dev(t.proteinG, target.proteinG), over: 0 },
    { name: 'Carboidrati', d: dev(t.carbG, target.carbG), over: 0 },
    { name: 'Grassi', d: dev(t.fatG, target.fatG), over: 0 },
  ].map((m) => {
    const limit = m.d > 0 ? (m.name === 'Proteine' ? PROTEIN_MAX_EXCESS : MACRO_TOLERANCE) : m.name === 'Grassi' ? fatUnder : MACRO_TOLERANCE;
    return { ...m, over: Math.abs(m.d) - limit };
  });
  const worst = off.filter((m) => m.over > 0).sort((a, b) => b.over - a.over)[0];
  if (worst) return { good: false, text: `${worst.name} ${worst.d > 0 ? 'sopra' : 'sotto'} l’obiettivo` };
  return { good: true, text: 'In linea con l’obiettivo' };
}
