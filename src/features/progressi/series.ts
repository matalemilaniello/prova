/**
 * Serie per i grafici di Progressi (funzioni pure, testate in series.test.ts).
 * Una voce per giorno (o per settimana): i giorni senza dato restano null, così le linee si interrompono
 * invece di inventare valori.
 */
import type { AppData, HHMM, ISODate } from '../../domain/types';
import { addDays, dateRange, daysBetween, weekStart as weekStartOf } from '../../engine/dates';
import { isIdleFirstEvening, reviewStart } from '../../engine/review';
import { checkInSleepHours } from '../../engine/sleep';
import { adherenceSummary, isSuccessful, streakInfo } from '../../engine/timeline';
import { firstLoggedDate, loadStatus, plannedLoadRemaining, weekLoadEntries } from '../../engine/training';

export type SeriesState = Pick<AppData, 'plan' | 'dayLogs' | 'checkIns' | 'workoutLogs' | 'footballLogs' | 'profile'> &
  Partial<Pick<AppData, 'physio' | 'reviews'>>;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Media mobile "all'indietro" su `window` giorni, sui soli valori presenti; null prima del primo dato. */
export function trailingMean(values: (number | null)[], window = 7, minCount = 1): (number | null)[] {
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - window + 1); k <= i; k++) {
      const v = values[k];
      if (isNum(v)) {
        sum += v;
        n++;
      }
    }
    return n >= minCount ? sum / n : null;
  });
}

/** Primo giorno con un controllo del mattino, o null. */
export function firstCheckInDate(state: Pick<AppData, 'checkIns'>): ISODate | null {
  const ds = Object.keys(state.checkIns).sort();
  return ds[0] ?? null;
}

/**
 * Intervallo dei grafici giornalieri: gli ultimi `days` giorni fino a oggi, accorciato all'inizio dei dati
 * (o del piano) ma mai sotto `minDays`, così pochi giorni non diventano barre enormi.
 */
export function chartRange(today: ISODate, state: Pick<AppData, 'checkIns' | 'plan'>, days = 28, minDays = 14): { from: ISODate; to: ISODate } {
  const longest = addDays(today, -(days - 1));
  const shortest = addDays(today, -(minDays - 1));
  const first = firstCheckInDate(state) ?? state.plan.startDate ?? today;
  let from = first > longest ? first : longest;
  if (from > shortest) from = shortest;
  return { from, to: today };
}

export interface WeightPoint {
  date: ISODate;
  weight: number | null;
  /** Media mobile di 7 giorni. */
  trend: number | null;
}

/** Peso del mattino e media mobile di 7 giorni (calcolata anche sui giorni prima di `from`). */
export function weightSeries(state: Pick<AppData, 'checkIns'>, from: ISODate, to: ISODate): WeightPoint[] {
  const lead = addDays(from, -6);
  const all = dateRange(lead, to);
  const raw = all.map((d) => {
    const w = state.checkIns[d]?.weightKg;
    return isNum(w) && w > 0 ? w : null;
  });
  // Servono almeno 2 pesate nella finestra: una sola non è una media.
  const trend = trailingMean(raw, 7, 2);
  const firstIdx = raw.findIndex((v) => v !== null);
  return all
    .map((date, i) => ({ date, weight: raw[i], trend: firstIdx === -1 || i < firstIdx ? null : trend[i] }))
    .slice(6);
}

export interface SleepPoint {
  date: ISODate;
  hours: number | null;
  /** Orario a letto della notte prima e sveglia, se segnati. */
  bed: HHMM | null;
  wake: HHMM | null;
}

/** Ore a letto per notte e orari (dal controllo del mattino della data). */
export function sleepSeries(state: Pick<AppData, 'checkIns'>, from: ISODate, to: ISODate): SleepPoint[] {
  return dateRange(from, to).map((date) => {
    const c = state.checkIns[date];
    return { date, hours: checkInSleepHours(c) ?? null, bed: c?.bedTime ?? null, wake: c?.wakeTime ?? null };
  });
}

export interface PainPoint {
  date: ISODate;
  value: number | null;
  /** Media di 3 giorni (toglie il rumore delle singole mattine). */
  smooth: number | null;
}

/** Dolore di una zona per giorno, con la media di 3 giorni. */
export function painSeries(state: Pick<AppData, 'checkIns'>, site: string, from: ISODate, to: ISODate): PainPoint[] {
  const lead = addDays(from, -2);
  const all = dateRange(lead, to);
  const raw = all.map((d) => {
    const v = state.checkIns[d]?.pain?.[site];
    return isNum(v) ? v : null;
  });
  const smooth = trailingMean(raw, 3);
  return all.map((date, i) => ({ date, value: raw[i], smooth: raw.slice(0, i + 1).some((v) => v !== null) ? smooth[i] : null })).slice(2);
}

/** Zone da mostrare: quelle monitorate più quelle presenti nei controlli dell'intervallo. */
export function painSitesIn(state: Pick<AppData, 'checkIns' | 'profile'>, from: ISODate, to: ISODate): string[] {
  const set = new Set<string>(state.profile.painSites ?? []);
  for (const d of dateRange(from, to)) for (const k of Object.keys(state.checkIns[d]?.pain ?? {})) set.add(k);
  return [...set].filter((s) => dateRange(from, to).some((d) => isNum(state.checkIns[d]?.pain?.[s])));
}

export type CalendarKind = 'riuscita' | 'parziale' | 'vuota' | 'fuori' | 'futuro';

export interface CalendarDay {
  date: ISODate;
  kind: CalendarKind;
  /** Aderenza 0-1 (0 per i giorni fuori piano o futuri). */
  score: number;
  minimal: boolean;
  today: boolean;
  /** Giornata non riuscita salvata da un jolly: la serie non si è spezzata. */
  jolly?: boolean;
}

/**
 * Calendario delle giornate riuscite: `weeks` settimane intere (dal lunedì) fino a quella di oggi.
 * Oggi conta come riuscita solo quando lo è già; altrimenti resta "in corso" (parziale o vuota).
 */
export function successCalendar(state: SeriesState, today: ISODate, weeks = 12): CalendarDay[] {
  const end = addDays(weekStartOf(today), 6);
  const start = addDays(weekStartOf(today), -7 * (weeks - 1));
  const first = reviewStart(state);
  const jolly = new Set(streakInfo(state, today).jollyDays);
  return dateRange(start, end).map((date) => {
    const d = calendarDay(date, state, today, first);
    return jolly.has(date) && d.kind !== 'riuscita' && d.kind !== 'fuori' ? { ...d, jolly: true } : d;
  });
}

/**
 * Un giorno del calendario. Prima del primo giorno con Ritmo (primo avvio, o primo giorno segnato) è
 * "fuori": chi comincia il mercoledì non ha lunedì e martedì vuoti.
 */
export function calendarDay(date: ISODate, state: SeriesState, today: ISODate, first: ISODate | null = reviewStart(state)): CalendarDay {
  if (date > today) return { date, kind: 'futuro', score: 0, minimal: false, today: false };
  if (first && date < first) return { date, kind: 'fuori', score: 0, minimal: false, today: false };
  const s = adherenceSummary(date, state);
  // Nessuna voce che conta (tutte prima del primo avvio), o la prima sera senza nulla di segnato: senza dati,
  // non "non riuscita".
  if (s.total === 0 || isIdleFirstEvening(date, state.plan, s)) return { date, kind: 'fuori', score: 0, minimal: false, today: date === today };
  const ok = isSuccessful(s);
  const marked = s.done + s.replaced + s.skipped > 0;
  const kind: CalendarKind = ok ? 'riuscita' : marked && s.score > 0 ? 'parziale' : 'vuota';
  return { date, kind, score: s.score, minimal: s.minimal, today: date === today };
}

/** Settimane del calendario: dalla settimana del primo giorno con Ritmo, al massimo `max`. */
export function calendarWeeks(state: SeriesState, today: ISODate, max = 12): number {
  const first = reviewStart(state);
  if (!first || first > today) return 1;
  const weeks = Math.floor(daysBetween(weekStartOf(first), weekStartOf(today)) / 7) + 1;
  return Math.max(1, Math.min(max, weeks));
}

/** Valori giornalieri di una settimana per le piccole linee della revisione (null = nessun dato). */
export function weekDaily(state: Pick<AppData, 'checkIns'>, weekStart: ISODate, pick: (c: AppData['checkIns'][string]) => number | undefined): (number | null)[] {
  return dateRange(weekStart, addDays(weekStart, 6)).map((d) => {
    const c = state.checkIns[d];
    const v = c ? pick(c) : undefined;
    return isNum(v) ? v : null;
  });
}

export interface CalendarSummary {
  successful: number;
  /** Giorni del piano già chiusi (oggi escluso se non ancora riuscito). */
  counted: number;
  /** Serie attuale di giornate riuscite. */
  streak: number;
  /** Serie più lunga nell'intervallo. */
  best: number;
}

export function calendarSummary(days: CalendarDay[]): CalendarSummary {
  const inPlan = days.filter((d) => d.kind !== 'fuori' && d.kind !== 'futuro');
  const closed = inPlan.filter((d) => !d.today || d.kind === 'riuscita');
  let best = 0;
  let run = 0;
  // Come in Oggi: una giornata salvata da un jolly non si somma ma non spezza la serie.
  for (const d of closed) {
    run = d.kind === 'riuscita' ? run + 1 : d.jolly ? run : 0;
    best = Math.max(best, run);
  }
  let streak = 0;
  for (let i = closed.length - 1; i >= 0 && (closed[i].kind === 'riuscita' || closed[i].jolly); i--) if (closed[i].kind === 'riuscita') streak++;
  return { successful: closed.filter((d) => d.kind === 'riuscita').length, counted: closed.length, streak, best };
}

export interface LoadWeek {
  weekStart: ISODate;
  gym: number;
  football: number;
  total: number;
  /** Carico ancora in programma (solo la settimana in corso). */
  planned: number;
  /** Soglia del 120% della media delle 4 precedenti, se c'è abbastanza storico. */
  threshold: number | null;
  ratio: number | null;
  alert: boolean;
  current: boolean;
}

/** Settimane da mostrare nel grafico del carico: dalla prima registrata, tra `min` e `max`. */
export function loadWeekCount(state: Pick<AppData, 'workoutLogs' | 'footballLogs'>, today: ISODate, min = 4, max = 8): number {
  const first = firstLoggedDate(state);
  if (!first) return min;
  const weeks = Math.floor(daysBetween(weekStartOf(first), weekStartOf(today)) / 7) + 1;
  return Math.min(max, Math.max(min, weeks));
}

/** Carico settimanale (palestra + calcio) delle ultime `count` settimane, con soglia e carico in programma. */
export function loadWeeks(state: SeriesState, today: ISODate, count = 8): LoadWeek[] {
  const thisWeek = weekStartOf(today);
  return Array.from({ length: count }, (_, i) => {
    const ws = addDays(thisWeek, -7 * (count - 1 - i));
    const entries = weekLoadEntries(ws, state);
    const gym = entries.filter((e) => e.kind === 'palestra').reduce((s, e) => s + e.load, 0);
    const football = entries.filter((e) => e.kind !== 'palestra').reduce((s, e) => s + e.load, 0);
    const st = loadStatus(ws, state);
    const current = ws === thisWeek;
    const planned = current ? plannedLoadRemaining(ws, state, today).load : 0;
    return { weekStart: ws, gym, football, total: gym + football, planned, threshold: st.threshold, ratio: st.ratio, alert: st.alert, current };
  });
}

/** Giorni tra due date, comprese (per le etichette "in 7 giorni"). */
export function spanDays(from: ISODate, to: ISODate): number {
  return daysBetween(from, to) + 1;
}
