/**
 * Ritmo · motore dell'allenamento (funzioni pure).
 *
 * - Progressione doppia: quando tutte le serie arrivano a `repMax` con lo stesso carico, si aggiunge
 *   `incrementKg` e si riparte da `repMin`; altrimenti stesso carico puntando a una ripetizione in più.
 *   Dopo due esecuzioni di fila sotto `repMin` con lo stesso carico (stallo) il carico scende del 10% circa.
 * - 1RM stimato con la formula di Epley: carico × (1 + ripetizioni / 30).
 * - Carico interno con il metodo session-RPE di Foster: minuti × RPE (unità arbitrarie, UA).
 * - Allarme del carico: settimana oltre il 120% della media delle 4 precedenti, con almeno 2 settimane
 *   di storico.
 * - Regola del dolore (Silbernagel adattata): dolore entro la soglia del piano → avanti; sopra soglia o in
 *   peggioramento → mantieni o riduci, solo per gli esercizi che caricano la zona; con il gomito si propongono
 *   varianti adatte (elbowFriendly) e, sopra soglia, le spinte con i manubri lasciano il posto alla variante del
 *   catalogo (elbowSwitch) con un carico più basso. La zona del titolo è quella che la seduta carica di più.
 * - Esercizi del fisioterapista: la prevenzione della seduta che lavora lo stesso tessuto di un suo esercizio
 *   si salta (physioCoverage), e la durata della seduta lo dice (sessionDuration).
 * - Fermo per i segnali d'allarme (`Plan.impactHold`, fase 2 § 3.8): la regola dice «niente impatti» in ogni seduta
 *   finché un via libera esplicito non lo toglie (`impactHoldOn`).
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
import { EXERCISES, elbowSwitchOf, type CatalogExercise } from '../data/exercises';
import { SESSIONS, estimateItemSec } from '../data/sessions';
import { addDays, daysBetween, isISODate, weekStart as weekStartOf, weekdayOf } from './dates';
import { droppedByOverride, sessionFor } from './plan/program';

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

/**
 * Ultime `count` esecuzioni dell'esercizio (una per seduta, la più recente per prima). Serve alla
 * progressione per riconoscere uno stallo: `suggestNext(base, recent[0], { previous: recent[1] })`.
 */
export function recentLogsFor(exerciseId: string, logs: readonly WorkoutLog[], count = 2, opts: LastLogOptions = {}): ExerciseLog[] {
  const out: ExerciseLog[] = [];
  for (const w of logs.slice().sort(byDateDesc)) {
    if (out.length >= count) break;
    if (opts.excludeId && w.id === opts.excludeId) continue;
    if (opts.before && w.date >= opts.before) continue;
    // Come in lastEntryFor: nella stessa seduta vale l'ultima occorrenza con serie fatte.
    const ex = w.exercises.slice().reverse().find((x) => x.exerciseId === exerciseId && doneSets(x).length);
    if (ex) out.push(ex);
  }
  return out;
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
 * ripeti: esercizio senza progressione · mantieni / riduci: frenato dalla regola del dolore ·
 * riduci con `stalled`: carico ridotto dopo uno stallo · sostituisci: variante presa al posto dell'esercizio
 * previsto per il dolore (es. la chest press al posto della panca con il gomito sopra soglia), con il carico
 * ridotto rispetto all'ultima volta sulla variante.
 */
export type SuggestionKind = 'nuovo' | 'aumenta' | 'ripetizioni' | 'ripeti' | 'mantieni' | 'riduci' | 'sostituisci';

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
  /**
   * Carico ridotto per uno stallo (due esecuzioni di fila sotto `repMin` con lo stesso carico), non per il
   * dolore: `kind` è 'riduci', ma l'interfaccia non lo presenta come un allarme.
   */
  stalled?: boolean;
}

export interface SuggestOptions {
  /** Esito della regola del dolore per l'esercizio. */
  gate?: GateLevel;
  /**
   * Zona e motivo che frenano l'esercizio, all'inizio del motivo mostrato ("Tibia da 1 a 2 dopo il calcio").
   * Senza, il motivo resta generico ("Dolore sopra soglia"). Vedi `painNoteForExercise`.
   */
  painNote?: string;
  /** Fase di ingresso (prime esecuzioni della seduta): una serie in meno e una ripetizione di riserva in più. */
  intro?: boolean;
  /**
   * Esecuzione precedente a `last` (vedi `recentLogsFor`): se anche lì la media delle ripetizioni è rimasta sotto
   * `repMin` con lo stesso carico, è uno stallo e il carico scende del 10%.
   */
  previous?: ExerciseLog | null;
  /**
   * L'esercizio è la variante presa al posto di quello previsto per il dolore (`elbowSwitchFor`): kind
   * 'sostituisci', carico −15% circa sull'ultima volta con la variante (uguale se anche l'ultima volta era una
   * sostituzione), alla prima volta una ripetizione di riserva in più.
   */
  switched?: boolean;
}

/** Riduzione del carico dopo uno stallo: −10%, poi si risale con la progressione doppia. */
export const STALL_REDUCE_FACTOR = 0.9;
/** Riduzione del carico sulla variante presa per il dolore: −15% circa (tra il 10 e il 20%, secondo l'incremento). */
export const SWITCH_REDUCE_FACTOR = 0.85;

/** Media delle ripetizioni delle serie fatte (0 senza serie). */
function meanReps(log: ExerciseLog | null | undefined): number {
  const d = doneSets(log);
  return d.length ? d.reduce((s, x) => s + x.reps, 0) / d.length : 0;
}

/**
 * Carico ridotto del `factor` e arrotondato all'incremento, sempre sotto il carico di partenza; null se non si
 * può scendere (carico già minimo).
 */
function reducedLoad(w: number, inc: number, factor: number): number | null {
  for (const step of [inc, 0.5]) {
    let r = roundToStep(w * factor, step);
    if (r >= w - EPS) r = roundToStep(w - step, step);
    if (r > 0 && r < w - EPS) return r;
  }
  return null;
}

// ───────────────────────── Fase di ingresso ─────────────────────────

/** Esecuzioni di ogni seduta con il volume ridotto, per chi finora si è allenato senza programma. */
export const INTRO_SESSIONS = 2;
/**
 * Motivo mostrato durante la fase di ingresso (senza punto finale). Il motivo vero è la prima esposizione:
 * gli esercizi nuovi danno molto più indolenzimento, che dalle esecuzioni successive cala (effetto della
 * serie ripetuta), e non la vicinanza della partita, che vale solo per la B.
 */
export const INTRO_REASON =
  "Le prime due volte: una serie in meno e una ripetizione di riserva in più, così l’indolenzimento dei primi giorni non pesa sul calcio";

/**
 * Fase di ingresso di una seduta: 1 o 2 se la prossima esecuzione è la prima o la seconda registrata,
 * null quando la seduta è già stata fatta almeno 2 volte o è già leggera (come la C, a RIR 3). Gli esercizi
 * nuovi danno un indolenzimento con il picco tra 24 e 72 ore, molto minore dalle esposizioni successive:
 * con la seduta B il venerdì cadrebbe proprio sulla partita.
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

/** Giorni senza sedute registrate dopo cui le sedute ripartono dalla fase di ingresso (fase 2, § 3.10). */
export const RESUME_AFTER_DAYS = 14;
/** Carico delle prime due esecuzioni dopo una pausa lunga: −20% (§ 3.10). */
export const RESUME_LOAD_FACTOR = 0.8;

export interface ExerciseIntro {
  /** 1 o 2: prima o seconda esecuzione con una serie in meno e una ripetizione di riserva in più. */
  level: 1 | 2;
  /** Fattore del carico dell'ultima volta (0,8 dopo una pausa lunga, altrimenti 1). */
  loadFactor: number;
  /** Ripresa dopo 14 giorni o più senza sedute. */
  resume: boolean;
}

/**
 * Fase di ingresso per esercizio (fase 2, § 3.3 e § 3.10), che estende `introLevel` ai blocchi generati: le prime 2
 * esecuzioni di un esercizio nuovo per l'utente hanno una serie in meno e una ripetizione di riserva in più; dopo 14
 * giorni o più senza sedute registrate le prime 2 esecuzioni di ogni esercizio tornano alla fase di ingresso con il
 * carico −20%. Null quando l'esercizio procede come sempre. `before`: la data della seduta (esclusa).
 */
export function exerciseIntro(exerciseId: string, logs: readonly WorkoutLog[], before: ISODate): ExerciseIntro | null {
  const past = logs.filter((w) => w.date < before).sort(byDateDesc);
  const last = past[0];
  const gap = last ? daysBetween(last.date, before) : 0;
  if (last && gap >= RESUME_AFTER_DAYS) return { level: 1, loadFactor: RESUME_LOAD_FACTOR, resume: true };
  // Dopo una ripresa: le esecuzioni dall'ultima pausa lunga.
  let since: ISODate | null = null;
  for (let i = 0; i < past.length - 1; i++) {
    if (daysBetween(past[i + 1].date, past[i].date) >= RESUME_AFTER_DAYS) {
      since = past[i].date;
      break;
    }
  }
  const done = past.filter((w) => (!since || w.date >= since) && w.exercises.some((e) => e.exerciseId === exerciseId && doneSets(e).length)).length;
  if (since && done < INTRO_SESSIONS) return { level: (done + 1) as 1 | 2, loadFactor: done === 0 ? RESUME_LOAD_FACTOR : 1, resume: true };
  if (since) return null;
  return done < INTRO_SESSIONS ? { level: (done + 1) as 1 | 2, loadFactor: 1, resume: false } : null;
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
 * Con `previous` riconosce lo stallo: due esecuzioni di fila con la media sotto `repMin` allo stesso carico →
 * carico −10% circa (arrotondato all'incremento) e `repMin`.
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

  if (!done.length && opts.switched) {
    // Prima volta con la variante e il dolore sopra soglia: più lontano dal cedimento.
    const rirUp = Math.min(4, (item.rir ?? 2) + 1);
    const note = opts.painNote?.trim() || 'Dolore sopra soglia';
    return { ...make(0, [item.repMin], 'sostituisci', `${note}: scegli un carico che ti lasci ${rirUp} ripetizioni di riserva`), rir: rirUp };
  }

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

  if (opts.switched) {
    const note = opts.painNote?.trim() || 'Dolore sopra soglia';
    const held = lastReps.map((r) => clampInt(r, item.repMin, item.repMax));
    // Anche l'ultima volta era una sostituzione: il carico è già quello adatto, scendere ancora non serve.
    if (item.progression !== 'doppia' || w <= 0 || last?.swappedFrom) {
      return make(w, held, 'sostituisci', `${note}: stesso carico dell’ultima volta`, w);
    }
    const incSwitch = item.incrementKg && item.incrementKg > 0 ? item.incrementKg : DEFAULT_INCREMENT_KG;
    const r = reducedLoad(w, incSwitch, SWITCH_REDUCE_FACTOR);
    if (r === null) return make(w, held, 'sostituisci', `${note}: stesso carico dell’ultima volta`, w);
    const pct = Math.round((1 - r / w) * 100);
    return make(r, [item.repMin], 'sostituisci', `${note}: carico −${pct}% rispetto all’ultima volta`, w);
  }

  if (item.progression !== 'doppia') {
    return make(w, lastReps.map((r) => Math.max(item.repMin, r)), 'ripeti', "Come l’ultima volta");
  }

  const inc = item.incrementKg && item.incrementKg > 0 ? item.incrementKg : DEFAULT_INCREMENT_KG;

  const note = opts.painNote?.trim();
  if (gate === 'riduci') {
    const reduced = roundToStep(w * PAIN_REDUCE_FACTOR, Math.min(inc, 2.5));
    return make(reduced, [item.repMin], 'riduci', `${note || 'Dolore alto'}: carico ridotto del 10%, lontano dal cedimento`, w);
  }

  // Stallo: due esecuzioni di fila con la media sotto repMin allo stesso carico. Riproporre lo stesso carico con
  // una ripetizione in più non funziona: si scende di circa il 10% e si risale con la progressione doppia.
  // Vale anche con la regola del dolore a "mantieni" (scendere di carico la rispetta).
  const prev = opts.previous;
  if (
    w > 0 &&
    doneSets(prev).length > 0 &&
    Math.abs(workingWeight(prev) - w) < EPS &&
    meanReps(last) < item.repMin - EPS &&
    meanReps(prev) < item.repMin - EPS
  ) {
    const r = reducedLoad(w, inc, STALL_REDUCE_FACTOR);
    if (r !== null) {
      const pct = Math.round((1 - r / w) * 100);
      return { ...make(r, [item.repMin], 'riduci', `Due volte sotto le ${item.repMin} ripetizioni: carico −${pct}% e risali`, w), stalled: true };
    }
  }

  // "Tutte le serie a repMax" si giudica sulle serie previste oggi (nella fase di ingresso, quelle ridotte).
  const atWeight = done.filter((s) => s.weightKg >= w - EPS);
  const allMax = done.length >= n && atWeight.length >= n && done.every((s) => s.weightKg >= w - EPS && s.reps >= item.repMax);

  if (allMax) {
    if (gate === 'mantieni') {
      return make(w, [item.repMax], 'mantieni', `${note || 'Dolore sopra soglia'}: niente aumenti di carico oggi`, w);
    }
    const next = Number((w + inc).toFixed(2));
    return make(next, [item.repMin], 'aumenta', `Tutte le serie a ${item.repMax}: +${fmtKgShort(inc)} e riparti da ${item.repMin}`, w);
  }

  if (gate === 'mantieni') {
    return make(w, lastReps.map((r) => clampInt(r, item.repMin, item.repMax)), 'mantieni', `${note || 'Dolore sopra soglia'}: ripeti l’ultima volta`, w);
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

/**
 * Quante volte conta il carico segnato nel volume: con due manubri (il carico si segna per manubrio) e negli
 * esercizi per lato (le ripetizioni si segnano per lato) il carico sollevato davvero è il doppio.
 */
export function volumeFactor(exerciseId: string, perSide = false): number {
  const ex = EXERCISES[exerciseId];
  const pair = ex ? /\bmanubri\b/i.test(ex.equipment) : false;
  return (pair ? 2 : 1) * (perSide ? 2 : 1);
}

/**
 * Volume della seduta: somma di carico × ripetizioni delle serie fatte (kg), con i due manubri e i due lati
 * (vedi `volumeFactor`). Il lato si legge dalla seduta (`sessionId`), solo per l'esercizio previsto.
 */
export function workoutVolume(log: Pick<WorkoutLog, 'exercises'> & Partial<Pick<WorkoutLog, 'sessionId'>>): number {
  const session = log.sessionId ? SESSIONS[log.sessionId] : undefined;
  const perSide = new Set((session?.blocks ?? []).flatMap((b) => b.items.filter((it) => it.perSide).map((it) => it.exerciseId)));
  return log.exercises.reduce((tot, ex) => {
    const k = volumeFactor(ex.exerciseId, !ex.swappedFrom && perSide.has(ex.exerciseId));
    return tot + doneSets(ex).reduce((s, set) => s + set.weightKg * set.reps * k, 0);
  }, 0);
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

/**
 * Seduta di palestra prevista in una data dal piano, se c'è. Nella settimana «leggera» accettata nella revisione
 * (`Plan.weekOverrides`) la seduta facoltativa non c'è.
 */
export function plannedSessionFor(
  iso: ISODate,
  plan: Pick<Plan, 'week'> & Partial<Pick<Plan, 'weekOverrides'>>,
): Omit<PlannedSession, 'daysAway'> | null {
  const day = plan.week.find((d) => d.weekday === weekdayOf(iso));
  if (!day?.gymSessionId || droppedByOverride(iso, day, plan)) return null;
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
    if (day.gymSessionId && !droppedByOverride(iso, day, state.plan) && !hasWorkoutOn(iso, state.workoutLogs ?? [])) {
      const est = sessionFor(day.gymSessionId, iso, state.plan)?.estMin ?? 50;
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
/**
 * Di quanto una zona sotto il ginocchio deve superare la soglia degli impatti perché l'avviso rimandi al
 * fisioterapista se il giorno dopo non scende.
 */
export const PHYSIO_REFERRAL_MARGIN = 2;

/**
 * Soglia degli impatti del piano: quella scelta con il fisioterapista (`Plan.impactThreshold`), altrimenti
 * min(soglia del dolore, 2). Non supera mai la soglia generale: sopra quella la regola ferma comunque gli
 * impatti. La usano la regola del dolore, gli avvisi di Oggi e del calcio, i consigli, il coach, le impostazioni.
 */
export function impactThresholdFor(plan: Pick<Plan, 'painThreshold' | 'impactThreshold'>): number {
  const general = plan.painThreshold ?? 3;
  const own = plan.impactThreshold;
  if (typeof own === 'number' && Number.isFinite(own)) return Math.min(general, 10, Math.max(0, own));
  return Math.min(general, IMPACT_PAIN_THRESHOLD);
}

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
  /** Il gomito è sopra la soglia (mattino o fine seduta): le spinte con i manubri passano alla variante (elbowSwitch). */
  elbowOver: boolean;
  /** Soglia del dolore del piano e soglia degli impatti usate. */
  threshold: number;
  impactThreshold: number;
  /** Seduta per cui è letta la regola (titolo sulla zona che carica di più), se c'è. */
  sessionId?: string;
  title: string;
  message: string;
}

export interface PainGateOptions {
  /**
   * Seduta di palestra per cui si legge la regola: a parità di livello il titolo va sulla zona che la seduta carica
   * di più (gomito per la A, gamba per B e C), il messaggio dice quali spinte cambiano e tace i balzi se la seduta
   * non ne ha. Senza, la seduta prevista dal piano in quella data; null per nessuna seduta.
   */
  sessionId?: string | null;
}

const ELBOW_RE = /gomit/i;
const LOWER_LEG_RE = /tibi|stinc|cavigl|polpacc|achill|piede|metatars/i;
/** Zona del profilo sotto il ginocchio (tibia, caviglia, polpaccio, tendine d'Achille, piede): impatti con soglia più bassa. */
export const isLowerLegSite = (site: string): boolean => LOWER_LEG_RE.test(site);
/** Zona del profilo al gomito: spinte a presa neutra e varianti `elbowFriendly`. */
export const isElbowSite = (site: string): boolean => ELBOW_RE.test(site);
/** Riconosce gli esercizi d'impatto tra quelli senza segnalazione esplicita (es. inseriti dal fisioterapista). */
const IMPACT_RE = /balz|salt|pliometr|hop/i;

const LEVEL_RANK: Record<GateLevel, number> = { ok: 0, mantieni: 1, riduci: 2 };
const UPPER_CATEGORIES: readonly ExerciseCategory[] = ['spinta', 'tirata'];
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
const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Parti del corpo frenate da ogni zona, per i testi: parte bassa, parte alta o tronco. */
const SITE_SCOPE: [RegExp, string, 'basso' | 'alto'][] = [
  [/tibi|stinc|cavigl|polpacc|achill|piede|metatars/i, 'gambe e polpacci', 'basso'],
  [/ginocch|flessor|femoral|ischio|addutt|inguin|pube|anca|glute/i, 'gambe', 'basso'],
  [/schien|lomb/i, 'gambe e core', 'basso'],
  [/gomit|polso|avambracc|spall/i, 'spinte e tirate', 'alto'],
];

/**
 * Cosa frena la regola del dolore, detto a parole: "gambe e polpacci" (e la parte superiore procede) oppure
 * "spinte e tirate" (e le gambe procedono). Null con zone sconosciute o in parti diverse del corpo: allora la
 * regola vale per tutti gli esercizi con carico.
 */
function gateScope(flagged: readonly PainSiteStatus[]): { words: string; rest: string } | null {
  const hits = flagged.map((s) => SITE_SCOPE.find(([re]) => re.test(s.site)));
  if (!hits.length || hits.some((h) => !h)) return null;
  const parts = new Set(hits.map((h) => h![2]));
  if (parts.size > 1) return null;
  // "gambe e polpacci" + "gambe e core" → "gambe, polpacci e core".
  const words = [...new Set(hits.flatMap((h) => h![1].split(' e ')))];
  const all = words.length > 1 ? `${words.slice(0, -1).join(', ')} e ${words[words.length - 1]}` : words[0];
  return hits[0]![2] === 'basso'
    ? { words: all, rest: 'La parte superiore procede come previsto.' }
    : { words: all, rest: 'Le gambe procedono come previsto.' };
}

/** Parte del corpo di una zona, per i testi e per la seduta: 'alto', 'basso' o null se sconosciuta. */
const sitePart = (site: string): 'alto' | 'basso' | null => SITE_SCOPE.find(([re]) => re.test(site))?.[2] ?? null;

/**
 * Parte del corpo che una seduta carica di più, dal blocco principale: più spinte e tirate che esercizi di gambe
 * → 'alto' (la A); altrimenti, anche a pari merito (la C, corpo intero), 'basso': per chi gioca a calcio il carico
 * sulla gamba è quello che conta di più.
 */
export function sessionFocus(session: Pick<WorkoutSession, 'blocks'>): 'alto' | 'basso' {
  const main = session.blocks.filter((b) => /principale/i.test(b.title)).flatMap((b) => b.items);
  let upper = 0;
  let lower = 0;
  for (const it of main) {
    const cat = EXERCISES[it.exerciseId]?.category;
    if (cat && UPPER_CATEGORIES.includes(cat)) upper++;
    else if (cat === 'gambe') lower++;
  }
  return upper > lower ? 'alto' : 'basso';
}

/** "Panca piana con manubri a presa neutra" → "panca piana", "Distensioni ai cavi in piedi…" → "distensioni ai cavi". */
function briefName(name: string): string {
  const cut = name.split(/ (?:con|a presa|in piedi|al|alla|da|su)(?= )/)[0].trim() || name;
  return cut.charAt(0).toLowerCase() + cut.slice(1);
}

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
 * - zone sotto il ginocchio: gli impatti hanno una soglia più bassa (quella del fisioterapista, altrimenti al
 *   massimo 2 su 10), perché il dolore lungo la tibia può essere da stress osseo e non si gestisce come un
 *   tendine; 2 punti sopra quella soglia l'avviso rimanda al fisioterapista se il giorno dopo non scende.
 * Gli argomenti facoltativi `workoutLogs` e `footballLogs` attivano le regole sulla seduta e sul giorno dopo.
 * `opts.sessionId` legge la regola per una seduta (vedi `PainGateOptions`).
 */
export function painGate(state: PainState, iso: ISODate, opts: PainGateOptions = {}): PainGate {
  const checkIns = state.checkIns ?? {};
  const threshold = state.plan.painThreshold ?? 3;
  const impactThreshold = impactThresholdFor(state.plan);
  const sessionId = opts.sessionId === undefined ? (state.plan.week ? plannedSessionFor(iso, state.plan)?.sessionId : undefined) : opts.sessionId;
  const session = sessionId ? sessionFor(sessionId, iso, state.plan) : undefined;
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
  // A parità di livello: con una seduta prima la zona che la seduta carica (il gomito nella A, la gamba in B e C),
  // poi la più alta; senza seduta prima la zona che blocca gli impatti (il calcio della giornata).
  const focus = session ? sessionFocus(session) : null;
  const inFocus = (s: PainSiteStatus) => (focus && sitePart(s.site) === focus ? 1 : 0);
  sites.sort((a, b) =>
    focus
      ? LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || inFocus(b) - inFocus(a) || b.value - a.value
      : LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || Number(Boolean(b.noImpact)) - Number(Boolean(a.noImpact)) || b.value - a.value,
  );
  const flagged = sites.filter((s) => s.level !== 'ok');
  const level = flagged.reduce<GateLevel>((m, s) => (LEVEL_RANK[s.level] > LEVEL_RANK[m] ? s.level : m), 'ok');
  const elbow = flagged.some((s) => ELBOW_RE.test(s.site));
  const elbowOver = flagged.some((s) => ELBOW_RE.test(s.site) && (s.over || (s.sessionValue ?? 0) > threshold || s.value > threshold));
  const lowerLeg = flagged.some((s) => s.lowerLeg);
  const impactBy = sites.find((s) => s.noImpact);
  // Fermo per i segnali d'allarme (§ 3.8): niente impatti in ogni seduta, quelle fisse comprese, da subito e finché un
  // via libera esplicito non lo toglie. È un freno di sicurezza come questa regola, non una proposta.
  const hold = impactHoldOn(state.plan, iso);
  const impact = Boolean(impactBy) || Boolean(hold);
  // Con una seduta senza balzi né salti "niente balzi oggi" non serve (resta negli avvisi del calcio).
  const sessionImpact = session ? session.blocks.some((b) => b.items.some((it) => isImpactExercise(EXERCISES[it.exerciseId]))) : true;
  // Le spinte della seduta che lasciano il posto alla variante: "chest press e distensioni ai cavi".
  const switchTargets = session && elbowOver
    ? [...new Set(session.blocks.flatMap((b) => b.items.map((it) => elbowSwitchOf(EXERCISES[it.exerciseId])?.to).filter((id): id is string => Boolean(id && EXERCISES[id]))))]
    : [];
  // Zona sotto il ginocchio oltre la soglia degli impatti di 2 punti o più: se domani non scende, il fisioterapista.
  const referral = sites.find((s) => s.lowerLeg && Math.max(s.value, s.sessionValue ?? 0) >= impactThreshold + PHYSIO_REFERRAL_MARGIN);

  let title = 'Dolore sotto controllo';
  let message = date || lastWorkout ? 'Segui la progressione come previsto.' : 'Nessun controllo del mattino recente: ascolta le sensazioni.';
  if (flagged.length) {
    const top = flagged[0];
    const name = siteName(top.site);
    title =
      top.cause === 'seduta'
        ? `${name} a ${top.sessionValue} su 10 nell’ultima seduta`
        : top.cause === 'giorno-dopo'
          ? `${name} da ${top.before} a ${top.value} dopo ${top.after === 'calcio' ? 'il calcio' : 'la seduta'}`
          : top.cause === 'aumento'
            ? `${name} in aumento`
            : `${name} a ${top.value} su 10, sopra soglia`;
    // La regola frena solo gli esercizi che caricano le zone segnalate: il testo dice quali e cosa resta libero.
    const scope = gateScope(flagged);
    const per = scope ? `per ${scope.words} ` : '';
    const parts = [
      level === 'riduci'
        ? capitalizeFirst(`${per}riduci i carichi del 10% e resta lontano dal cedimento.`)
        : top.cause === 'giorno-dopo'
          ? `Il giorno dopo il dolore non deve salire: ${per}mantieni i carichi dell’ultima volta.`
          : capitalizeFirst(`${per}mantieni i carichi dell’ultima volta.`),
    ];
    if (switchTargets.length) parts.push(`Le spinte con i manubri passano a ${joinIt(switchTargets.map((id) => briefName(EXERCISES[id].name)))}.`);
    if (impact && sessionImpact) parts.push('Niente balzi e salti oggi.');
    if (scope?.rest) parts.push(scope.rest);
    if (level === 'riduci') parts.push('Scrivi al fisioterapista oggi.');
    else if (referral) parts.push(referralSentence(referral, referral === top, Math.max(referral.value, referral.sessionValue ?? 0)));
    message = parts.join(' ');
  } else if (hold && !impactBy) {
    title = 'Impatti fermi';
    message = 'Niente balzi e salti oggi. Senti il fisioterapista o il medico prima di correre o saltare.';
  } else if (impactBy) {
    const mv = date ? morning[impactBy.site] : undefined;
    title =
      finite(mv) && mv > impactThreshold
        ? `${siteName(impactBy.site)} a ${mv} su 10: niente impatti oggi`
        : `${siteName(impactBy.site)} a ${impactBy.sessionValue} su 10 nell’ultima seduta: niente impatti oggi`;
    message = `Negli impatti la soglia è più bassa, ${impactThreshold} su 10: salta balzi e salti. Il resto come previsto.`;
    if (referral) message += ` ${referralSentence(referral, referral === impactBy, Math.max(referral.value, referral.sessionValue ?? 0))}`;
  }
  return {
    level,
    date,
    sites,
    flagged,
    elbow,
    lowerLeg,
    impact,
    ...(impactBy ? { impactSite: impactBy.site } : hold ? { impactSite: hold.site } : {}),
    elbowOver,
    threshold,
    impactThreshold,
    ...(session ? { sessionId: session.id } : {}),
    title,
    message,
  };
}

/**
 * Fermo degli impatti in vigore nella data (`Plan.impactHold`, § 3.8): dal giorno in cui è stato messo; con una data non
 * valida vale sempre (nel dubbio un fermo di sicurezza non si toglie).
 */
export function impactHoldOn(plan: Pick<Plan, 'impactHold'>, iso: ISODate): { site: string; since: ISODate } | null {
  const hold = plan.impactHold;
  if (!hold || typeof hold.site !== 'string' || !hold.site.trim()) return null;
  if (isISODate(hold.since) && isISODate(iso) && iso < hold.since) return null;
  return hold;
}

/** "a e b", "a, b e c". */
const joinIt = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}` : (xs[0] ?? ''));

/** Rinvio al fisioterapista per una zona sotto il ginocchio molto sopra la soglia degli impatti. */
function referralSentence(site: PainSiteStatus, isTitle: boolean, value: number): string {
  return isTitle
    ? 'Se domani è ancora sopra soglia, scrivi al fisioterapista.'
    : // Spazi indivisibili: "4 su 10" non va a capo a metà.
      `${siteName(site.site)} a ${value}\u00a0su\u00a010: se domani è ancora sopra soglia, scrivi al fisioterapista.`;
}

/**
 * Testi della regola del dolore per una seduta che non è oggi (es. quella di domani nella schermata Allenamento):
 * la regola si calcola sul controllo di oggi, quindi "niente balzi e salti oggi" diventa "nella prossima seduta".
 * "Scrivi al fisioterapista oggi" resta: quello vale adesso.
 */
export function gateForLater(gate: PainGate): PainGate {
  const later = (s: string) => s.replace(/(niente impatti|niente balzi e salti) oggi/gi, '$1 nella prossima seduta');
  return { ...gate, title: later(gate.title), message: later(gate.message) };
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
  /** Alternative consigliate (id), la migliore per prima. */
  alternatives: string[];
  /** Motivo: gomito sopra soglia o impatti da evitare per la gamba. */
  kind?: 'gomito' | 'impatto';
}

/** Zona del gomito che frena, con la causa in breve: "Gomito a 5 su 10", "Gomito in aumento". */
function elbowNote(gate: PainGate): string {
  const s = gate.flagged.find((x) => ELBOW_RE.test(x.site));
  if (!s) return 'Gomito sopra soglia';
  const name = siteName(s.site);
  if (s.cause === 'seduta') return `${name} a ${s.sessionValue} su 10 nell’ultima seduta`;
  if (s.cause === 'giorno-dopo') return `${name} da ${s.before} a ${s.value}`;
  if (s.cause === 'aumento') return `${name} in aumento`;
  return `${name} a ${s.value} su 10`;
}

export interface ElbowSwitch {
  /** Variante da usare al posto dell'esercizio. */
  to: string;
  /** Passo del carico sulla variante, se diverso da quello della seduta. */
  incrementKg?: number;
  /** Motivo breve: "Gomito a 5 su 10: meglio una variante con meno presa". */
  reason: string;
}

/**
 * Variante per il gomito sopra soglia: le spinte con i manubri del catalogo che hanno `elbowSwitch` (panca piana,
 * panca inclinata) lasciano il posto alla macchina o ai cavi, che chiedono meno presa e meno stabilizzazione al
 * polso. Solo sopra soglia: con il gomito in aumento ma ancora entro la soglia si tengono i carichi e basta.
 */
export function elbowSwitchFor(exercise: Exercise | undefined, gate: PainGate, catalog: Record<string, Exercise> = EXERCISES): ElbowSwitch | null {
  if (!exercise || !gate.elbowOver) return null;
  const sw = elbowSwitchOf(exercise);
  if (!sw || !catalog[sw.to]) return null;
  return { to: sw.to, ...(sw.incrementKg ? { incrementKg: sw.incrementKg } : {}), reason: `${elbowNote(gate)}: meglio una variante con meno presa` };
}

/**
 * Esercizio da sostituire per la regola del dolore: con il gomito sopra soglia le spinte con i manubri propongono
 * la variante del catalogo (elbowSwitch) e gli esercizi non adatti (elbowFriendly false) le alternative adatte;
 * con una zona sotto il ginocchio oltre la soglia degli impatti gli esercizi d'impatto propongono le alternative
 * senza volo.
 */
export function painFlagFor(exercise: Exercise | undefined, gate: PainGate, catalog: Record<string, Exercise> = EXERCISES): PainFlag | null {
  if (!exercise) return null;
  const sw = elbowSwitchFor(exercise, gate, catalog);
  if (sw) {
    const alts = [sw.to, ...elbowFriendlyAlternatives(exercise.id, catalog).map((e) => e.id).filter((id) => id !== sw.to)];
    return { reason: sw.reason, alternatives: alts, kind: 'gomito' };
  }
  if (gate.elbow && exercise.elbowFriendly === false) {
    const alts = elbowFriendlyAlternatives(exercise.id, catalog).map((e) => e.id);
    return { reason: `${elbowNote(gate)}: meglio una variante adatta`, alternatives: alts, kind: 'gomito' };
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
 * Esercizi di prevenzione con carico che lavorano proprio sotto il ginocchio (polpacci, soleo, tibiali):
 * con la tibia o la caviglia segnalate restano al carico dell'ultima volta, come le gambe.
 */
const LOWER_LEG_PREVENTION_RE = /polpacc|soleo|tibial|sulle punte/i;

/** Zona segnalata che frena l'esercizio (la più severa), o null. */
function brakingSite(exercise: Exercise | undefined, gate: PainGate): PainSiteStatus | null {
  if (!exercise || gate.level === 'ok') return null;
  let best: PainSiteStatus | null = null;
  for (const s of gate.flagged) {
    const cats = SITE_CATEGORIES.find(([re]) => re.test(s.site))?.[1] ?? LOADED_CATEGORIES;
    const hits =
      cats.includes(exercise.category) ||
      (ELBOW_RE.test(s.site) && exercise.elbowFriendly === false) ||
      (s.lowerLeg === true && exercise.category === 'prevenzione' && LOWER_LEG_PREVENTION_RE.test(`${exercise.id} ${exercise.name}`));
    if (hits && (!best || LEVEL_RANK[s.level] > LEVEL_RANK[best.level])) best = s;
  }
  return best;
}

/**
 * Esito della regola del dolore per un esercizio: frena solo gli esercizi che caricano la zona
 * (il dolore alla tibia non blocca la panca). Con la tibia o la caviglia segnalate sono frenati anche
 * polpacci, soleo e tibiali di prevenzione (niente aumenti di carico). Il resto della prevenzione, il
 * riscaldamento, la mobilità e gli esercizi del fisioterapista restano dosati sul dolore e non vengono
 * frenati. Con il gomito sono frenati anche gli esercizi non adatti di altre categorie (es. lo stacco, per la presa).
 */
export function gateForExercise(exercise: Exercise | undefined, gate: PainGate): GateLevel {
  return brakingSite(exercise, gate)?.level ?? 'ok';
}

/**
 * Inizio del motivo di un suggerimento frenato dal dolore, con la zona e la causa:
 * "Tibia da 1 a 2 dopo il calcio", "Gomito a 4 su 10", "Tibia in aumento". Undefined se l'esercizio non è frenato.
 */
export function painNoteForExercise(exercise: Exercise | undefined, gate: PainGate): string | undefined {
  const s = brakingSite(exercise, gate);
  if (!s) return undefined;
  const name = siteName(s.site);
  switch (s.cause) {
    case 'seduta':
      return `${name} a ${s.sessionValue} su 10 nell’ultima seduta`;
    case 'giorno-dopo':
      return `${name} da ${s.before} a ${s.value} dopo ${s.after === 'calcio' ? 'il calcio' : 'la seduta'}`;
    case 'aumento':
      return `${name} in aumento`;
    default:
      return `${name} a ${s.value} su 10`;
  }
}

// ───────────────────────── Esercizi del fisioterapista e doppioni ─────────────────────────

export type TissueId = 'gomito' | 'soleo' | 'polpacci' | 'tibiale-anteriore' | 'tibiale-posteriore' | 'adduttori' | 'flessori';

/**
 * Tessuti che la prevenzione della seduta e gli esercizi del fisioterapista possono caricare due volte.
 * Si riconoscono dal nome, perché gli esercizi del fisioterapista li scrive l'utente. Il tibiale anteriore si
 * allena "sollevando le punte" (dei piedi), il polpaccio "salendo sulle punte": le due forme non si confondono.
 */
export const TISSUES: readonly { id: TissueId; label: string; re: RegExp }[] = [
  { id: 'gomito', label: 'gli estensori del polso', re: /estensor\w*\s+(?:del|dei)\s+pols|tyler|epicondil|gomit/i },
  // Il soleo (ginocchio piegato) prima dei polpacci in generale: l'isometria del soleo non copre i polpacci in piedi.
  { id: 'soleo', label: 'il soleo', re: /soleo/i },
  { id: 'polpacci', label: 'i polpacci', re: /polpacc|gastrocnem/i },
  { id: 'tibiale-anteriore', label: 'il tibiale anteriore', re: /tibiale anteriore|solleva\w*\s+(?:delle|le)\s+punte|dorsiflession/i },
  { id: 'tibiale-posteriore', label: 'il tibiale posteriore', re: /tibiale posteriore|pallina tra i talloni/i },
  { id: 'adduttori', label: 'gli adduttori', re: /copenhagen|addutt/i },
  { id: 'flessori', label: 'i flessori della coscia', re: /nordic|leg curl|flessori della coscia|ischiocrural/i },
];

/** Allungamenti e mobilità non caricano il tessuto: non fanno doppione con un esercizio di forza. */
const NOT_LOADING_RE = /allungament|stretch|mobilit|massagg|rullo|foam/i;

/** Tessuto principale di un esercizio (il primo riconosciuto), o null. */
export function tissueOf(exercise: Pick<Exercise, 'name'> | undefined): TissueId | null {
  if (!exercise || NOT_LOADING_RE.test(exercise.name)) return null;
  return TISSUES.find((t) => t.re.test(exercise.name))?.id ?? null;
}

export interface PhysioCover {
  /** Esercizio della seduta che non si fa. */
  exerciseId: string;
  /** Esercizio del fisioterapista che lavora lo stesso tessuto (o lo stesso esercizio). */
  physioId: string;
  /** Tessuto in comune; null se è proprio lo stesso esercizio e non ha un tessuto riconosciuto. */
  tissue: TissueId | null;
}

/**
 * Esercizi della seduta già coperti dal programma del fisioterapista: la prevenzione (blocchi di prevenzione
 * ed esercizi di categoria prevenzione, riscaldamento escluso) che lavora lo stesso tessuto di un suo esercizio.
 * Il fisioterapista ha la precedenza: fare entrambi raddoppierebbe il volume sul tessuto sensibile (es. Tyler
 * twist ed eccentrico degli estensori del polso, polpacci da seduto e isometria del soleo).
 * Chiave: "blocco:esercizio" (indici nella seduta).
 */
export function physioCoverage(
  session: Pick<WorkoutSession, 'blocks'>,
  physio: Pick<AppData['physio'], 'exercises' | 'prescriptions'> | undefined,
  catalog: Record<string, Exercise> = EXERCISES,
): Map<string, PhysioCover> {
  const out = new Map<string, PhysioCover>();
  const byTissue = new Map<TissueId, string>();
  const ids = new Set<string>();
  for (const p of physio?.prescriptions ?? []) {
    const ex = catalog[p.exerciseId] ?? physio?.exercises.find((e) => e.id === p.exerciseId);
    if (!ex) continue;
    ids.add(ex.id);
    const t = tissueOf(ex);
    if (t && !byTissue.has(t)) byTissue.set(t, ex.id);
  }
  if (!ids.size) return out;
  session.blocks.forEach((b, bi) => {
    if (/riscaldamento/i.test(b.title)) return;
    const preventionBlock = /prevenzione/i.test(b.title);
    b.items.forEach((it, ii) => {
      const ex = catalog[it.exerciseId];
      if (!ex || !(preventionBlock || ex.category === 'prevenzione')) return;
      if (ids.has(ex.id)) {
        out.set(`${bi}:${ii}`, { exerciseId: ex.id, physioId: ex.id, tissue: tissueOf(ex) });
        return;
      }
      const t = tissueOf(ex);
      const physioId = t ? byTissue.get(t) : undefined;
      if (t && physioId) out.set(`${bi}:${ii}`, { exerciseId: ex.id, physioId, tissue: t });
    });
  });
  return out;
}

export interface SessionDuration {
  /** Minuti della seduta senza gli esercizi del fisioterapista (doppioni tolti, fase di ingresso compresa). */
  own: number;
  /** Minuti stimati degli esercizi del fisioterapista (0 se non ce ne sono). */
  physio: number;
  /** Somma dei due. */
  total: number;
  /** Esercizi della seduta saltati perché già nel programma del fisioterapista. */
  covered: number;
}

/**
 * Durata della seduta come la vive l'utente: `estMin` riscalato sugli esercizi che fa davvero (senza i
 * doppioni del fisioterapista, con una serie in meno nella fase di ingresso), più il blocco del fisioterapista.
 */
export function sessionDuration(
  session: WorkoutSession,
  physio?: Pick<AppData['physio'], 'exercises' | 'prescriptions'>,
  opts: { intro?: boolean } = {},
): SessionDuration {
  const cover = physioCoverage(session, physio);
  // Minuti arrotondati blocco per blocco, come li mostra l'anteprima: la somma dei blocchi torna con il totale.
  let full = 0;
  let active = 0;
  session.blocks.forEach((b, bi) => {
    let all = 0;
    let todo = 0;
    b.items.forEach((it, ii) => {
      all += estimateItemSec(it);
      if (!cover.has(`${bi}:${ii}`)) todo += estimateItemSec(opts.intro ? introItem(it) : it);
    });
    full += Math.round(all / 60);
    active += Math.round(todo / 60);
  });
  const own = cover.size || opts.intro ? Math.round((session.estMin * active) / Math.max(1, full)) : session.estMin;
  const valid = (physio?.prescriptions ?? []).filter((p) => EXERCISES[p.exerciseId] || physio?.exercises.some((e) => e.id === p.exerciseId));
  const physioMin = Math.round(valid.reduce((s, p) => s + estimateItemSec(p), 0) / 60);
  return { own, physio: physioMin, total: own + physioMin, covered: cover.size };
}
