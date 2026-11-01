/**
 * Ritmo · motore dell'allenamento (funzioni pure).
 *
 * - Progressione doppia: quando tutte le serie arrivano a `repMax` con lo stesso carico, si aggiunge
 *   `incrementKg` e si riparte da `repMin`; altrimenti stesso carico puntando a una ripetizione in più.
 * - 1RM stimato con la formula di Epley: carico × (1 + ripetizioni / 30).
 * - Carico interno con il metodo session-RPE di Foster: minuti × RPE (unità arbitrarie, UA).
 * - Allarme del carico: settimana oltre il 120% della media delle 4 precedenti, con almeno 2 settimane
 *   di storico.
 * - Regola del dolore (Silbernagel adattata): dolore entro la soglia del piano → avanti; sopra soglia o in
 *   peggioramento → mantieni o riduci; con il gomito si propongono varianti adatte (elbowFriendly).
 *
 * Tutte le date sono locali ('YYYY-MM-DD'). Nessuna funzione legge l'orologio: la data arriva dagli argomenti.
 */
import type {
  AppData,
  CheckIn,
  Exercise,
  ExerciseCategory,
  ExerciseLog,
  FootballKind,
  ISODate,
  Plan,
  SessionExercise,
  SetLog,
  WorkoutLog,
  WorkoutSession,
} from '../domain/types';
import { EXERCISES, type CatalogExercise } from '../data/exercises';
import { SESSIONS } from '../data/sessions';
import { addDays, daysBetween, weekStart as weekStartOf, weekdayOf } from './dates';

// ───────────────────────── Costanti ─────────────────────────

/** Soglia dell'allarme: settimana oltre il 120% della media. */
export const LOAD_ALERT_RATIO = 1.2;
/** Settimane precedenti su cui si calcola la media. */
export const LOAD_LOOKBACK_WEEKS = 4;
/** Settimane di storico necessarie per giudicare un picco. */
export const LOAD_MIN_HISTORY_WEEKS = 2;
/** Incremento di carico quando la seduta non lo indica. */
export const DEFAULT_INCREMENT_KG = 2.5;
/** Giorni entro cui un controllo del mattino conta ancora per la regola del dolore. */
export const PAIN_LOOKBACK_DAYS = 3;
/** Variazione (sulla media delle letture precedenti) che segnala un dolore in peggioramento. */
export const PAIN_WORSENING_DELTA = 1.5;
/** Riduzione del carico quando il dolore è alto. */
export const PAIN_REDUCE_FACTOR = 0.9;
/** RPE tipico per stimare il carico di quello che è ancora in programma. */
export const TYPICAL_RPE: Record<FootballKind | 'palestra', number> = {
  partita: 7,
  calcetto: 6,
  allenamento: 6,
  palestra: 7,
};

/** Parte dello stato che serve al motore. */
export type TrainingState = Pick<AppData, 'workoutLogs' | 'footballLogs' | 'plan'> &
  Partial<Pick<AppData, 'checkIns' | 'profile' | 'physio'>>;

const EPS = 1e-9;
const round1 = (n: number) => Math.round(n * 10) / 10;

// ───────────────────────── Serie e storico ─────────────────────────

/** Serie segnate come fatte, con ripetizioni valide. */
export function doneSets(log: ExerciseLog | null | undefined): SetLog[] {
  return (log?.sets ?? []).filter((s) => s.done && s.reps > 0);
}

export interface LastEntry {
  date: ISODate;
  workoutId: string;
  sessionId: string;
  log: ExerciseLog;
}

export interface LastLogOptions {
  /** Considera solo le sedute precedenti a questa data (esclusa). */
  before?: ISODate;
  /** Esclude una seduta (es. quella che stai modificando). */
  excludeId?: string;
}

const byDateDesc = (a: WorkoutLog, b: WorkoutLog) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/** Ultima volta in cui l'esercizio è stato fatto (almeno una serie segnata), con data e seduta. */
export function lastEntryFor(exerciseId: string, logs: readonly WorkoutLog[], opts: LastLogOptions = {}): LastEntry | null {
  const sorted = logs.slice().sort(byDateDesc);
  for (const w of sorted) {
    if (opts.excludeId && w.id === opts.excludeId) continue;
    if (opts.before && w.date >= opts.before) continue;
    // In una seduta lo stesso esercizio può comparire due volte: vale l'ultima occorrenza con serie fatte.
    for (let i = w.exercises.length - 1; i >= 0; i--) {
      const ex = w.exercises[i];
      if (ex.exerciseId === exerciseId && doneSets(ex).length) {
        return { date: w.date, workoutId: w.id, sessionId: w.sessionId, log: ex };
      }
    }
  }
  return null;
}

/** Registro dell'esercizio nell'ultima seduta in cui è stato fatto, o null. */
export function lastLogFor(exerciseId: string, logs: readonly WorkoutLog[], opts: LastLogOptions = {}): ExerciseLog | null {
  return lastEntryFor(exerciseId, logs, opts)?.log ?? null;
}

/** Carico di lavoro di un registro: il più alto tra le serie fatte. */
export function workingWeight(log: ExerciseLog | null | undefined): number {
  return doneSets(log).reduce((m, s) => Math.max(m, s.weightKg), 0);
}

// ───────────────────────── Progressione doppia ─────────────────────────

export type GateLevel = 'ok' | 'mantieni' | 'riduci';

export interface SetTarget {
  weightKg: number;
  reps: number;
}

/**
 * nuovo: nessuno storico · aumenta: carico in su · ripetizioni: stesso carico, +1 ripetizione ·
 * ripeti: esercizio senza progressione · mantieni / riduci: frenato dalla regola del dolore.
 */
export type SuggestionKind = 'nuovo' | 'aumenta' | 'ripetizioni' | 'ripeti' | 'mantieni' | 'riduci';

export interface Suggestion {
  /** Carico proposto (lo stesso per tutte le serie). */
  weightKg: number;
  /** Ripetizioni (o secondi) proposte per la prima serie. */
  reps: number;
  /** Obiettivo serie per serie (lunghezza = serie previste, ridotte nella fase di ingresso). */
  sets: SetTarget[];
  kind: SuggestionKind;
  /** Motivo breve, mostrato sotto il suggerimento. */
  reason: string;
  /** Carico di lavoro dell'ultima volta, se c'è. */
  lastWeightKg?: number;
  /** Ripetizioni di riserva di oggi (una in più nella fase di ingresso). */
  rir?: number;
  /** Fase di ingresso: il motivo del volume ridotto (INTRO_REASON). */
  intro?: string;
}

export interface SuggestOptions {
  /** Esito della regola del dolore per l'esercizio. */
  gate?: GateLevel;
  /** Fase di ingresso (prime esecuzioni della seduta): una serie in meno e una ripetizione di riserva in più. */
  intro?: boolean;
}

// ───────────────────────── Fase di ingresso ─────────────────────────

/** Esecuzioni di ogni seduta con il volume ridotto, per chi finora si è allenato senza programma. */
export const INTRO_SESSIONS = 2;
/** Motivo mostrato durante la fase di ingresso. */
export const INTRO_REASON = 'Prime settimane: volume ridotto per arrivare fresco alla partita';

/**
 * Fase di ingresso di una seduta: 1 o 2 se la prossima esecuzione è la prima o la seconda registrata,
 * null quando la seduta è già stata fatta almeno 2 volte o è già leggera (come la C, a RIR 3). I primi Nordic e affondi bulgari danno un
 * indolenzimento che raggiunge il picco a 48-72 ore: con la seduta B il venerdì cadrebbe sulla partita.
 */
export function introLevel(sessionId: string, logs: readonly WorkoutLog[], opts: LastLogOptions = {}): 1 | 2 | null {
  const session = SESSIONS[sessionId];
  if (session && isLightSession(session)) return null;
  let n = 0;
  for (const w of logs) {
    if (w.sessionId !== sessionId) continue;
    if (opts.excludeId && w.id === opts.excludeId) continue;
    if (opts.before && w.date >= opts.before) continue;
    n++;
  }
  return n < INTRO_SESSIONS ? ((n + 1) as 1 | 2) : null;
}

/** Seduta già leggera (tutto il blocco principale con almeno 3 ripetizioni di riserva): non serve la fase di ingresso. */
export function isLightSession(session: Pick<WorkoutSession, 'blocks'>): boolean {
  const main = session.blocks.filter((b) => /principale/i.test(b.title)).flatMap((b) => b.items);
  const withRir = main.filter((it) => it.rir !== undefined);
  return withRir.length > 0 && withRir.every((it) => (it.rir ?? 0) >= 3);
}

/** Dose della fase di ingresso: una serie in meno (almeno 1) e una ripetizione di riserva in più (al massimo 4). */
export function introItem<T extends SessionExercise>(item: T): T {
  return { ...item, sets: Math.max(1, item.sets - 1), ...(item.rir !== undefined ? { rir: Math.min(4, item.rir + 1) } : {}) };
}

const clampInt = (n: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, n)));

function fmtKgShort(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  return `${s} kg`;
}

function roundToStep(n: number, step: number): number {
  const s = step > 0 ? step : 0.5;
  return Math.max(0, Number((Math.round(n / s) * s).toFixed(2)));
}

/**
 * Prossimo obiettivo per un esercizio della seduta, dall'ultimo registro.
 * Doppia progressione: se tutte le serie previste hanno raggiunto `repMax` con il carico precedente,
 * carico + `incrementKg` e `repMin`; altrimenti stesso carico puntando a +1 ripetizione per serie.
 * Nella fase di ingresso (`intro`) le serie scendono di una e le ripetizioni di riserva salgono di una.
 */
export function suggestNext(base: SessionExercise, last: ExerciseLog | null | undefined, opts: SuggestOptions = {}): Suggestion {
  const gate = opts.gate ?? 'ok';
  const item = opts.intro ? introItem(base) : base;
  const n = Math.max(1, item.sets);
  const done = doneSets(last);
  const unitWord = item.unit === 'secondi' ? 'secondi' : 'ripetizioni';
  const extra = { ...(item.rir !== undefined ? { rir: item.rir } : {}), ...(opts.intro ? { intro: INTRO_REASON } : {}) };
  const make = (weightKg: number, reps: number[], kind: SuggestionKind, reason: string, lastW?: number): Suggestion => {
    const sets = Array.from({ length: n }, (_, i) => ({ weightKg, reps: reps[Math.min(i, reps.length - 1)] }));
    return { weightKg, reps: sets[0].reps, sets, kind, reason, ...(lastW !== undefined ? { lastWeightKg: lastW } : {}), ...extra };
  };

  if (!done.length) {
    const reason =
      item.progression === 'doppia'
        ? `Prima volta: scegli un carico che ti lasci ${item.rir ?? 2} ripetizioni di riserva`
        : item.repMin === item.repMax
          ? `Obiettivo: ${item.repMin} ${unitWord}`
          : `Obiettivo: da ${item.repMin} a ${item.repMax} ${unitWord}`;
    return make(0, [item.repMin], 'nuovo', reason);
  }

  const w = workingWeight(last);
  // Ripetizioni dell'ultima volta, serie per serie (la serie mancante ripete l'ultima fatta).
  const lastReps = Array.from({ length: n }, (_, i) => (done[i] ?? done[done.length - 1]).reps);

  if (item.progression !== 'doppia') {
    return make(w, lastReps.map((r) => Math.max(item.repMin, r)), 'ripeti', "Come l'ultima volta");
  }

  const inc = item.incrementKg && item.incrementKg > 0 ? item.incrementKg : DEFAULT_INCREMENT_KG;

  if (gate === 'riduci') {
    const reduced = roundToStep(w * PAIN_REDUCE_FACTOR, Math.min(inc, 2.5));
    return make(reduced, [item.repMin], 'riduci', 'Dolore alto: carico ridotto del 10%, lontano dal cedimento', w);
  }

  // "Tutte le serie a repMax" si giudica sulle serie previste oggi (nella fase di ingresso, quelle ridotte).
  const atWeight = done.filter((s) => s.weightKg >= w - EPS);
  const allMax = done.length >= n && atWeight.length >= n && done.every((s) => s.weightKg >= w - EPS && s.reps >= item.repMax);

  if (allMax) {
    if (gate === 'mantieni') {
      return make(w, [item.repMax], 'mantieni', 'Dolore sopra soglia: niente aumenti di carico oggi', w);
    }
    const next = Number((w + inc).toFixed(2));
    return make(next, [item.repMin], 'aumenta', `Tutte le serie a ${item.repMax}: +${fmtKgShort(inc)} e riparti da ${item.repMin}`, w);
  }

  if (gate === 'mantieni') {
    return make(w, lastReps.map((r) => clampInt(r, item.repMin, item.repMax)), 'mantieni', "Dolore sopra soglia: ripeti l'ultima volta", w);
  }

  const target = lastReps.map((r) => clampInt(r + 1, item.repMin, item.repMax));
  return make(w, target, 'ripetizioni', `Stesso carico, una ripetizione in più fino a ${item.repMax}`, w);
}

// ───────────────────────── 1RM e record ─────────────────────────

/** 1RM stimato con la formula di Epley; 0 se il carico o le ripetizioni mancano. */
export function e1rm(weightKg: number, reps: number): number {
  if (!(weightKg > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Serie migliore di un registro (1RM stimato più alto) e il suo valore. */
export function bestSet(log: ExerciseLog | null | undefined): { set: SetLog; e1rm: number } | null {
  let best: { set: SetLog; e1rm: number } | null = null;
  for (const s of doneSets(log)) {
    const v = e1rm(s.weightKg, s.reps);
    if (v > 0 && (!best || v > best.e1rm + EPS)) best = { set: s, e1rm: v };
  }
  return best;
}

/** Miglior 1RM stimato di sempre per un esercizio (0 se mai fatto con carico). */
export function bestE1rm(exerciseId: string, logs: readonly WorkoutLog[], opts: LastLogOptions = {}): number {
  let best = 0;
  for (const w of logs) {
    if (opts.excludeId && w.id === opts.excludeId) continue;
    if (opts.before && w.date >= opts.before) continue;
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      best = Math.max(best, bestSet(ex)?.e1rm ?? 0);
    }
  }
  return best;
}

export interface PersonalRecord {
  exerciseId: string;
  /** Nuovo 1RM stimato. */
  e1rm: number;
  /** Record precedente. */
  previous: number;
  /** Serie che ha fatto il record. */
  weightKg: number;
  reps: number;
}

/**
 * Record personali di una seduta: esercizi con carico il cui 1RM stimato supera il migliore precedente.
 * La prima volta che fai un esercizio non conta come record. Ordinati per miglioramento percentuale.
 */
export function personalRecords(workout: WorkoutLog, history: readonly WorkoutLog[]): PersonalRecord[] {
  const out = new Map<string, PersonalRecord>();
  const prior = history.filter((w) => w.id !== workout.id && w.date <= workout.date);
  for (const ex of workout.exercises) {
    const best = bestSet(ex);
    if (!best) continue;
    const previous = bestE1rm(ex.exerciseId, prior);
    if (previous <= 0 || best.e1rm <= previous + 0.05) continue;
    const cur = out.get(ex.exerciseId);
    if (!cur || best.e1rm > cur.e1rm) {
      out.set(ex.exerciseId, { exerciseId: ex.exerciseId, e1rm: best.e1rm, previous, weightKg: best.set.weightKg, reps: best.set.reps });
    }
  }
  return [...out.values()].sort((a, b) => b.e1rm / b.previous - a.e1rm / a.previous);
}

/**
 * Record ancora imbattuti di una seduta: i record personali il cui 1RM stimato resta il migliore di sempre
 * per quell'esercizio, contando anche le sedute successive. Ordinati per miglioramento percentuale.
 */
export function standingRecords(workout: WorkoutLog, history: readonly WorkoutLog[]): PersonalRecord[] {
  const all = history.some((w) => w.id === workout.id) ? history : [...history, workout];
  return personalRecords(workout, history).filter((r) => r.e1rm >= bestE1rm(r.exerciseId, all) - 0.05);
}

export interface E1rmPoint {
  date: ISODate;
  e1rm: number;
}

/** Andamento del 1RM stimato di un esercizio, una voce per seduta, in ordine di data. */
export function e1rmHistory(exerciseId: string, logs: readonly WorkoutLog[]): E1rmPoint[] {
  const pts: E1rmPoint[] = [];
  for (const w of logs.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    let best = 0;
    for (const ex of w.exercises) if (ex.exerciseId === exerciseId) best = Math.max(best, bestSet(ex)?.e1rm ?? 0);
    if (best > 0) pts.push({ date: w.date, e1rm: round1(best) });
  }
  return pts;
}

/** Volume della seduta: somma di carico × ripetizioni delle serie fatte (kg). */
export function workoutVolume(log: Pick<WorkoutLog, 'exercises'>): number {
  return log.exercises.reduce((tot, ex) => tot + doneSets(ex).reduce((s, set) => s + set.weightKg * set.reps, 0), 0);
}

/** Serie fatte nella seduta. */
export function workoutSetCount(log: Pick<WorkoutLog, 'exercises'>): number {
  return log.exercises.reduce((tot, ex) => tot + doneSets(ex).length, 0);
}

// ───────────────────────── Carico interno ─────────────────────────

/** Carico della seduta con il metodo session-RPE: minuti × RPE (UA). */
export function sessionLoad(durationMin: number, rpe: number): number {
  if (!(durationMin > 0) || !(rpe > 0)) return 0;
  return Math.round(durationMin * Math.min(10, rpe));
}

export interface LoadEntry {
  id: string;
  date: ISODate;
  kind: 'palestra' | FootballKind;
  /** Id della seduta di palestra. */
  sessionId?: string;
  durationMin: number;
  rpe: number;
  load: number;
}

/** Sedute e partite registrate in una settimana (da lunedì a domenica), in ordine di data. */
export function weekLoadEntries(weekStart: ISODate, state: Pick<TrainingState, 'workoutLogs' | 'footballLogs'>): LoadEntry[] {
  const ws = weekStartOf(weekStart);
  const we = addDays(ws, 6);
  const inWeek = (d: ISODate) => d >= ws && d <= we;
  const out: LoadEntry[] = [];
  for (const w of state.workoutLogs ?? []) {
    if (!inWeek(w.date)) continue;
    out.push({ id: w.id, date: w.date, kind: 'palestra', sessionId: w.sessionId, durationMin: w.durationMin, rpe: w.rpe, load: sessionLoad(w.durationMin, w.rpe) });
  }
  for (const f of state.footballLogs ?? []) {
    if (!inWeek(f.date)) continue;
    out.push({ id: f.id, date: f.date, kind: f.kind, durationMin: f.durationMin, rpe: f.rpe, load: sessionLoad(f.durationMin, f.rpe) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Carico settimanale (palestra + calcio), in UA. */
export function weeklyLoad(weekStart: ISODate, state: Pick<TrainingState, 'workoutLogs' | 'footballLogs'>): number {
  return weekLoadEntries(weekStart, state).reduce((s, e) => s + e.load, 0);
}

/** Primo giorno con un'attività registrata (palestra o calcio), o null. */
export function firstLoggedDate(state: Pick<TrainingState, 'workoutLogs' | 'footballLogs'>): ISODate | null {
  let first: ISODate | null = null;
  for (const l of [...(state.workoutLogs ?? []), ...(state.footballLogs ?? [])]) {
    if (!first || l.date < first) first = l.date;
  }
  return first;
}

export interface WeekLoad {
  weekStart: ISODate;
  load: number;
  /** La settimana rientra nello storico registrato. */
  inHistory: boolean;
}

/** Carico delle ultime `count` settimane fino a quella indicata compresa (dalla più vecchia). */
export function weeklyLoadSeries(lastWeekStart: ISODate, state: Pick<TrainingState, 'workoutLogs' | 'footballLogs'>, count = 6): WeekLoad[] {
  const last = weekStartOf(lastWeekStart);
  const first = firstLoggedDate(state);
  const firstWeek = first ? weekStartOf(first) : null;
  return Array.from({ length: count }, (_, i) => {
    const ws = addDays(last, -7 * (count - 1 - i));
    return { weekStart: ws, load: weeklyLoad(ws, state), inHistory: firstWeek !== null && ws >= firstWeek };
  });
}

export interface LoadStatus {
  weekStart: ISODate;
  /** Carico registrato nella settimana. */
  load: number;
  /** Media delle settimane precedenti nello storico (fino a 4), o null se lo storico non basta. */
  average: number | null;
  /** Carico / media (null se la media manca o è zero). */
  ratio: number | null;
  /** Soglia dell'allarme in UA (120% della media). */
  threshold: number | null;
  /** Settimane precedenti usate per la media (dalla più recente). */
  previous: { weekStart: ISODate; load: number }[];
  enoughHistory: boolean;
  alert: boolean;
}

/** Stato del carico di una settimana rispetto alla media delle 4 precedenti. */
export function loadStatus(weekStart: ISODate, state: Pick<TrainingState, 'workoutLogs' | 'footballLogs'>): LoadStatus {
  const ws = weekStartOf(weekStart);
  const load = weeklyLoad(ws, state);
  const first = firstLoggedDate(state);
  const firstWeek = first ? weekStartOf(first) : null;
  const previous: { weekStart: ISODate; load: number }[] = [];
  for (let k = 1; k <= LOAD_LOOKBACK_WEEKS; k++) {
    const p = addDays(ws, -7 * k);
    if (!firstWeek || p < firstWeek) break;
    previous.push({ weekStart: p, load: weeklyLoad(p, state) });
  }
  const enoughHistory = previous.length >= LOAD_MIN_HISTORY_WEEKS;
  const average = enoughHistory ? previous.reduce((s, p) => s + p.load, 0) / previous.length : null;
  const ratio = average && average > 0 ? load / average : null;
  const threshold = average !== null ? average * LOAD_ALERT_RATIO : null;
  // Da una media nulla qualunque ripresa è un picco: va fatta con gradualità.
  const alert = enoughHistory && average !== null && (average > 0 ? load > average * LOAD_ALERT_RATIO + EPS : load > 0);
  return { weekStart: ws, load, average, ratio, threshold, previous, enoughHistory, alert };
}

/**
 * Allarme del carico: la settimana supera il 120% della media delle 4 precedenti (servono almeno
 * 2 settimane di storico). Restituisce lo stato quando scatta, altrimenti null.
 */
export function loadAlert(weekStart: ISODate, state: Pick<TrainingState, 'workoutLogs' | 'footballLogs'>): (LoadStatus & { alert: true }) | null {
  const s = loadStatus(weekStart, state);
  return s.alert ? (s as LoadStatus & { alert: true }) : null;
}

// ───────────────────────── Programma della settimana ─────────────────────────

export interface PlannedSession {
  date: ISODate;
  sessionId: string;
  time?: string;
  optional: boolean;
  /** Giorni da oggi (0 = oggi). */
  daysAway: number;
}

/** Seduta di palestra prevista in una data dal piano, se c'è. */
export function plannedSessionFor(iso: ISODate, plan: Pick<Plan, 'week'>): Omit<PlannedSession, 'daysAway'> | null {
  const day = plan.week.find((d) => d.weekday === weekdayOf(iso));
  if (!day?.gymSessionId) return null;
  return { date: iso, sessionId: day.gymSessionId, time: day.gymTime, optional: Boolean(day.gymOptional) };
}

/** True se in quella data c'è già una seduta registrata (qualsiasi). */
export function hasWorkoutOn(iso: ISODate, logs: readonly WorkoutLog[]): boolean {
  return logs.some((w) => w.date === iso);
}

/**
 * Prossima seduta prevista da oggi in avanti (oggi compreso se non ancora registrata).
 * Con `skipOptional` salta le sedute facoltative.
 */
export function nextPlannedSession(
  today: ISODate,
  state: Pick<TrainingState, 'plan' | 'workoutLogs'>,
  opts: { skipOptional?: boolean; after?: ISODate } = {},
): PlannedSession | null {
  for (let i = 0; i < 14; i++) {
    const iso = addDays(today, i);
    if (opts.after && iso <= opts.after) continue;
    const p = plannedSessionFor(iso, state.plan);
    if (!p) continue;
    if (opts.skipOptional && p.optional) continue;
    if (hasWorkoutOn(iso, state.workoutLogs ?? [])) continue;
    return { ...p, daysAway: daysBetween(today, iso) };
  }
  return null;
}

export interface PlannedLoadItem {
  date: ISODate;
  kind: 'palestra' | FootballKind;
  sessionId?: string;
  optional: boolean;
  load: number;
}

/**
 * Carico stimato di quello che resta in programma nella settimana da `today` (compreso, se non già
 * registrato), con RPE tipici. Le sedute facoltative sono elencate ma non sommate.
 */
export function plannedLoadRemaining(
  weekStart: ISODate,
  state: Pick<TrainingState, 'plan' | 'workoutLogs' | 'footballLogs'>,
  today: ISODate,
): { load: number; items: PlannedLoadItem[] } {
  const ws = weekStartOf(weekStart);
  const items: PlannedLoadItem[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDays(ws, i);
    if (iso < today) continue;
    const day = state.plan.week.find((d) => d.weekday === weekdayOf(iso));
    if (!day) continue;
    if (day.gymSessionId && !hasWorkoutOn(iso, state.workoutLogs ?? [])) {
      const est = SESSIONS[day.gymSessionId]?.estMin ?? 50;
      items.push({ date: iso, kind: 'palestra', sessionId: day.gymSessionId, optional: Boolean(day.gymOptional), load: sessionLoad(est, TYPICAL_RPE.palestra) });
    }
    if (day.football && !(state.footballLogs ?? []).some((f) => f.date === iso)) {
      const f = day.football;
      items.push({ date: iso, kind: f.kind, optional: false, load: sessionLoad(f.durationMin, TYPICAL_RPE[f.kind]) });
    }
  }
  return { load: items.filter((i) => !i.optional).reduce((s, i) => s + i.load, 0), items };
}

// ───────────────────────── Regola del dolore ─────────────────────────

/** Giorni entro cui il dolore registrato a fine seduta frena ancora la seduta successiva. */
export const PAIN_SESSION_LOOKBACK_DAYS = 2;
/** Aumento (punti su 10) tra il mattino prima e il mattino dopo un'attività che segnala un peggioramento. */
export const PAIN_NEXT_DAY_DELTA = 1;
/**
 * Soglia degli impatti (balzi, salti, corsa) per le zone sotto il ginocchio. Gli impatti caricano molto la
 * gamba e lungo la tibia il dolore da carico può essere da stress osseo: lì la tolleranza è più bassa che
 * per un tendine.
 */
export const IMPACT_PAIN_THRESHOLD = 2;

/** Perché una zona frena il carico. */
export type PainCause = 'soglia' | 'seduta' | 'giorno-dopo' | 'aumento';

export interface PainSiteStatus {
  site: string;
  /** Lettura del mattino o, se manca, il dolore registrato nell'ultima seduta. */
  value: number;
  /** Media delle letture dei 7 giorni prima (fino a 3), o null. */
  previous: number | null;
  over: boolean;
  worsening: boolean;
  level: GateLevel;
  /** Motivo principale per cui la zona frena (assente se non frena). */
  cause?: PainCause;
  /** Dolore registrato a fine seduta nell'ultima seduta entro 2 giorni. */
  sessionValue?: number;
  /** Lettura del mattino prima dell'attività del giorno precedente, quando è stata confrontata. */
  before?: number;
  /** Attività del giorno precedente dopo cui il dolore è salito. */
  after?: 'seduta' | 'calcio';
  /** Zona sotto il ginocchio (tibia, caviglia, polpaccio, tendine d'Achille, piede). */
  lowerLeg?: boolean;
  /** Oggi niente impatti per questa zona (oltre la soglia ridotta degli impatti). */
  noImpact?: boolean;
}

export interface PainGate {
  level: GateLevel;
  /** Data del controllo del mattino usato, o null se non ce n'è uno recente. */
  date: ISODate | null;
  sites: PainSiteStatus[];
  /** Zone che frenano il carico. */
  flagged: PainSiteStatus[];
  /** Il gomito è tra le zone che frenano: si propongono varianti adatte. */
  elbow: boolean;
  /** Tibia, caviglia o polpaccio tra le zone che frenano il carico. */
  lowerLeg: boolean;
  /** Niente impatti oggi (balzi e salti): una zona sotto il ginocchio supera la soglia degli impatti. */
  impact: boolean;
  /** Zona che blocca gli impatti, per i testi. */
  impactSite?: string;
  title: string;
  message: string;
}

const ELBOW_RE = /gomit/i;
const LOWER_LEG_RE = /tibi|stinc|cavigl|polpacc|achill|piede|metatars/i;
/** Riconosce gli esercizi d'impatto tra quelli senza segnalazione esplicita (es. inseriti dal fisioterapista). */
const IMPACT_RE = /balz|salt|pliometr|hop/i;

const LEVEL_RANK: Record<GateLevel, number> = { ok: 0, mantieni: 1, riduci: 2 };
const CAUSE_RANK: Record<PainCause, number> = { soglia: 0, seduta: 1, 'giorno-dopo': 2, aumento: 3 };

/** Letture del dolore di una zona tra due date comprese, in ordine di data. */
function painReadings(checkIns: Record<ISODate, CheckIn>, site: string, from: ISODate, to: ISODate): number[] {
  const out: [ISODate, number][] = [];
  for (const [d, c] of Object.entries(checkIns)) {
    if (d < from || d > to) continue;
    const v = c?.pain?.[site];
    if (typeof v === 'number' && Number.isFinite(v)) out.push([d, v]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const siteName = (site: string) => site.charAt(0).toUpperCase() + site.slice(1);

type PainState = Pick<TrainingState, 'plan'> & Partial<Pick<AppData, 'checkIns' | 'profile' | 'workoutLogs' | 'footballLogs'>>;

/** Attività del giorno: seduta o calcio registrati, oppure calcio previsto dal piano. */
function activityOn(iso: ISODate, state: PainState): 'seduta' | 'calcio' | null {
  if ((state.footballLogs ?? []).some((f) => f.date === iso)) return 'calcio';
  if ((state.workoutLogs ?? []).some((w) => w.date === iso)) return 'seduta';
  const day = state.plan.week?.find((d) => d.weekday === weekdayOf(iso));
  return day?.football ? 'calcio' : null;
}

/**
 * Regola del dolore, adattata dal modello di monitoraggio di Silbernagel:
 * - controllo del mattino più recente (entro 3 giorni): sopra la soglia del piano o in aumento rispetto ai
 *   giorni prima → mantieni; molto alto (oltre 5 e oltre la soglia di almeno 2) → riduci;
 * - dolore registrato a fine seduta nell'ultima seduta entro 2 giorni sopra la soglia → mantieni;
 * - il mattino dopo una seduta o un calcio il dolore sale di almeno 1 punto rispetto al mattino prima
 *   → mantieni (per i tendini conta da 2 su 10 in su, sotto il ginocchio sempre);
 * - zone sotto il ginocchio: gli impatti hanno una soglia più bassa (al massimo 2 su 10), perché il dolore
 *   lungo la tibia è da stress osseo e non si gestisce come un tendine.
 * Gli argomenti facoltativi `workoutLogs` e `footballLogs` attivano le regole sulla seduta e sul giorno dopo.
 */
export function painGate(state: PainState, iso: ISODate): PainGate {
  const checkIns = state.checkIns ?? {};
  const threshold = state.plan.painThreshold ?? 3;
  const impactThreshold = Math.min(threshold, IMPACT_PAIN_THRESHOLD);
  const monitored = state.profile?.painSites ?? [];
  const watched = (site: string) => !monitored.length || monitored.includes(site);
  const strong = Math.max(5, threshold + 2);

  let date: ISODate | null = null;
  for (let i = 0; i <= PAIN_LOOKBACK_DAYS; i++) {
    const d = addDays(iso, -i);
    const c = checkIns[d];
    if (c && Object.keys(c.pain ?? {}).length) {
      date = d;
      break;
    }
  }
  const morning = date ? checkIns[date].pain : {};

  // Ultima seduta entro 2 giorni con il dolore registrato a fine seduta.
  const from = addDays(iso, -PAIN_SESSION_LOOKBACK_DAYS);
  const lastWorkout = (state.workoutLogs ?? [])
    .filter((w) => w.date >= from && w.date <= iso && Object.keys(w.pain ?? {}).length)
    .sort(byDateDesc)[0];
  const sessionPain = lastWorkout?.pain ?? {};

  // Il giorno dopo: attività il giorno prima del controllo e lettura del mattino di quel giorno.
  const dayBefore = date ? addDays(date, -1) : null;
  const activity = dayBefore ? activityOn(dayBefore, state) : null;

  const names = new Set([...Object.keys(morning), ...Object.keys(sessionPain)]);
  const sites: PainSiteStatus[] = [];
  for (const site of names) {
    if (!watched(site)) continue;
    const m = morning[site];
    const sv = sessionPain[site];
    const hasMorning = finite(m);
    const hasSession = finite(sv);
    if (!hasMorning && !hasSession) continue;
    const lowerLeg = LOWER_LEG_RE.test(site);
    const value = hasMorning ? m : (sv as number);

    let previous: number | null = null;
    let over = false;
    let worsening = false;
    let before: number | undefined;
    let nextDay = false;
    if (hasMorning && date) {
      const prior = painReadings(checkIns, site, addDays(date, -7), addDays(date, -1)).slice(-3);
      previous = prior.length ? prior.reduce((s, v) => s + v, 0) / prior.length : null;
      over = m > threshold;
      worsening = previous !== null && m >= 2 && m - previous >= PAIN_WORSENING_DELTA;
      if (activity && dayBefore) {
        const base = painReadings(checkIns, site, addDays(dayBefore, -2), dayBefore).slice(-1)[0];
        if (finite(base) && m - base >= PAIN_NEXT_DAY_DELTA && (lowerLeg || m >= 2)) {
          before = base;
          nextDay = true;
        }
      }
    }
    const sessionOver = hasSession && sv > threshold;

    const peak = Math.max(hasMorning ? m : 0, hasSession ? sv : 0);
    const level: GateLevel = peak > strong ? 'riduci' : over || sessionOver || nextDay || worsening ? 'mantieni' : 'ok';
    const causes: PainCause[] = [];
    if (over || (hasMorning && m > strong)) causes.push('soglia');
    if (sessionOver) causes.push('seduta');
    if (nextDay) causes.push('giorno-dopo');
    if (worsening) causes.push('aumento');
    const cause = level === 'ok' ? undefined : (causes.sort((a, b) => CAUSE_RANK[a] - CAUSE_RANK[b])[0] ?? 'soglia');
    const noImpact = lowerLeg && (level !== 'ok' || (hasMorning && m > impactThreshold) || (hasSession && sv > impactThreshold));

    sites.push({
      site,
      value,
      previous: previous === null ? null : round1(previous),
      over,
      worsening,
      level,
      ...(cause ? { cause } : {}),
      ...(hasSession ? { sessionValue: sv } : {}),
      ...(nextDay ? { before, after: activity ?? undefined } : {}),
      ...(lowerLeg ? { lowerLeg } : {}),
      ...(noImpact ? { noImpact } : {}),
    });
  }
  sites.sort(
    (a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || Number(Boolean(b.noImpact)) - Number(Boolean(a.noImpact)) || b.value - a.value,
  );
  const flagged = sites.filter((s) => s.level !== 'ok');
  const level = flagged.reduce<GateLevel>((m, s) => (LEVEL_RANK[s.level] > LEVEL_RANK[m] ? s.level : m), 'ok');
  const elbow = flagged.some((s) => ELBOW_RE.test(s.site));
  const lowerLeg = flagged.some((s) => s.lowerLeg);
  const impactBy = sites.find((s) => s.noImpact);
  const impact = Boolean(impactBy);

  let title = 'Dolore sotto controllo';
  let message = date || lastWorkout ? 'Segui la progressione come previsto.' : 'Nessun controllo del mattino recente: ascolta le sensazioni.';
  if (flagged.length) {
    const top = flagged[0];
    const name = siteName(top.site);
    title =
      top.cause === 'seduta'
        ? `${name} a ${top.sessionValue} su 10 nell'ultima seduta`
        : top.cause === 'giorno-dopo'
          ? `${name} da ${top.before} a ${top.value} dopo ${top.after === 'calcio' ? 'il calcio' : 'la seduta'}`
          : top.cause === 'aumento'
            ? `${name} in aumento`
            : `${name} a ${top.value} su 10, sopra soglia`;
    const parts = [
      level === 'riduci'
        ? 'Riduci i carichi del 10% e resta lontano dal cedimento.'
        : top.cause === 'giorno-dopo'
          ? "Il giorno dopo il dolore non deve salire: mantieni i carichi dell'ultima volta, niente aumenti."
          : "Mantieni i carichi dell'ultima volta, niente aumenti.",
    ];
    if (elbow) parts.push('Per il gomito usa le varianti a presa neutra proposte.');
    if (impact) parts.push('Niente balzi e salti oggi, tieni polpacci, soleo e tibiale.');
    if (level === 'riduci') parts.push('Scrivi al fisioterapista oggi.');
    message = parts.join(' ');
  } else if (impactBy) {
    const mv = date ? morning[impactBy.site] : undefined;
    title =
      finite(mv) && mv > impactThreshold
        ? `${siteName(impactBy.site)} a ${mv} su 10: niente impatti oggi`
        : `${siteName(impactBy.site)} a ${impactBy.sessionValue} su 10 nell'ultima seduta: niente impatti oggi`;
    message = `Negli impatti la soglia è più bassa, ${impactThreshold} su 10: salta balzi e salti. Il resto come previsto.`;
  }
  return { level, date, sites, flagged, elbow, lowerLeg, impact, ...(impactBy ? { impactSite: impactBy.site } : {}), title, message };
}

/** Esercizio dal catalogo o dagli esercizi del fisioterapista. */
export function findExercise(id: string, physio?: Pick<AppData['physio'], 'exercises'>): Exercise | undefined {
  return EXERCISES[id] ?? physio?.exercises.find((e) => e.id === id);
}

/** Alternative adatte al gomito di un esercizio (nell'ordine del catalogo). */
export function elbowFriendlyAlternatives(exerciseId: string, catalog: Record<string, Exercise> = EXERCISES): Exercise[] {
  const ex = catalog[exerciseId];
  return (ex?.alternatives ?? []).map((id) => catalog[id]).filter((e): e is Exercise => Boolean(e?.elbowFriendly));
}

/** Esercizio d'impatto (balzi, salti, fasi di volo): segnalato nel catalogo o riconosciuto dal nome. */
export function isImpactExercise(exercise: Exercise | undefined): boolean {
  if (!exercise) return false;
  const flag = (exercise as CatalogExercise).impact;
  if (typeof flag === 'boolean') return flag;
  return IMPACT_RE.test(`${exercise.id} ${exercise.name}`);
}

/** Alternative senza impatto di un esercizio (nell'ordine del catalogo). */
export function noImpactAlternatives(exercise: Exercise | undefined, catalog: Record<string, Exercise> = EXERCISES): Exercise[] {
  return (exercise?.alternatives ?? []).map((id) => catalog[id]).filter((e): e is Exercise => Boolean(e) && !isImpactExercise(e));
}

export interface PainFlag {
  /** Perché l'esercizio è segnalato. */
  reason: string;
  /** Alternative consigliate (id). */
  alternatives: string[];
  /** Motivo: gomito sopra soglia o impatti da evitare per la gamba. */
  kind?: 'gomito' | 'impatto';
}

/**
 * Esercizio da sostituire per la regola del dolore: con il gomito sopra soglia gli esercizi non adatti
 * (elbowFriendly false) propongono le alternative adatte; con una zona sotto il ginocchio oltre la soglia
 * degli impatti gli esercizi d'impatto propongono le alternative senza volo.
 */
export function painFlagFor(exercise: Exercise | undefined, gate: PainGate, catalog: Record<string, Exercise> = EXERCISES): PainFlag | null {
  if (!exercise) return null;
  if (gate.elbow && exercise.elbowFriendly === false) {
    const alts = elbowFriendlyAlternatives(exercise.id, catalog).map((e) => e.id);
    return { reason: 'Gomito sopra soglia: meglio una variante adatta', alternatives: alts, kind: 'gomito' };
  }
  if (gate.impact && isImpactExercise(exercise)) {
    const alts = noImpactAlternatives(exercise, catalog).map((e) => e.id);
    const site = gate.impactSite ? siteName(gate.impactSite) : 'Gamba';
    return { reason: `${site} sopra soglia: niente impatti oggi`, alternatives: alts, kind: 'impatto' };
  }
  return null;
}

/** Categorie di esercizi frenate dal dolore di ciascuna zona (le zone sconosciute frenano tutto il lavoro con carico). */
const SITE_CATEGORIES: [RegExp, ExerciseCategory[]][] = [
  [/gomit|polso|avambracc/i, ['spinta', 'tirata']],
  [/spall/i, ['spinta', 'tirata']],
  [/tibi|stinc|cavigl|polpacc|achill|piede/i, ['gambe']],
  [/ginocch/i, ['gambe']],
  [/flessor|femoral|ischio/i, ['gambe']],
  [/addutt|inguin|pube/i, ['gambe']],
  [/schien|lomb/i, ['gambe', 'core']],
  [/anca|glute/i, ['gambe']],
];
const LOADED_CATEGORIES: ExerciseCategory[] = ['spinta', 'tirata', 'gambe', 'core'];

/**
 * Esito della regola del dolore per un esercizio: frena solo gli esercizi che caricano la zona
 * (il dolore alla tibia non blocca la panca). Prevenzione, riscaldamento, mobilità ed esercizi del
 * fisioterapista restano dosati sul dolore e non vengono frenati. Con il gomito sono frenati anche gli
 * esercizi non adatti di altre categorie (es. lo stacco, per la presa).
 */
export function gateForExercise(exercise: Exercise | undefined, gate: PainGate): GateLevel {
  if (!exercise || gate.level === 'ok') return 'ok';
  let level: GateLevel = 'ok';
  for (const s of gate.flagged) {
    const cats = SITE_CATEGORIES.find(([re]) => re.test(s.site))?.[1] ?? LOADED_CATEGORIES;
    const hits = cats.includes(exercise.category) || (ELBOW_RE.test(s.site) && exercise.elbowFriendly === false);
    if (hits && LEVEL_RANK[s.level] > LEVEL_RANK[level]) level = s.level;
  }
  return level;
}
