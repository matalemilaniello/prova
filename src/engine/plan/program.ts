/**
 * Seduta di uno slot in una data (docs/FASE2.md § 3.1, § 3.4, § 3.9, § 12.2): l'unico punto da cui passano Oggi,
 * Allenamento, il lettore, il coach e il carico previsto quando mostrano o eseguono la seduta di un giorno.
 *
 * - `sessionFor(slot, iso, plan)`: senza `Plan.program` la seduta fissa (`SESSIONS[slot]`), con la settimana scaricata
 *   o alleggerita dalla revisione (`Plan.weekOverrides`) applicata; con un blocco in vigore la seduta della settimana 1
 *   con i fattori della sua settimana (`deriveSession`). Senza i campi nuovi è `SESSIONS[slot]`, lo stesso oggetto: chi
 *   la usa vede l'app di prima.
 * - `daySession(slot, iso, state)`: la seduta del giorno con la variante. In questa onda la variante è sempre «piena»:
 *   il controllo del mattino (§ 3.9) arriva con il motore dei blocchi; la regola del dolore resta esercizio per esercizio
 *   nel lettore, come oggi.
 * - `weekOverrideFor`, `droppedByOverride`: la settimana «leggera» toglie la seduta facoltativa, che quindi non compare in
 *   Oggi né tra le sedute previste.
 *
 * Chi usa solo il nome di uno slot (editor della settimana, benvenuto, calendario ricorrente) tiene `SESSIONS`.
 * Funzioni pure: la data arriva dagli argomenti. I risultati derivati si memorizzano per oggetto di partenza, così la
 * stessa seduta ha sempre lo stesso riferimento (utile ai componenti).
 */
import type {
  ISODate,
  Plan,
  Program,
  ScheduleDay,
  SessionExercise,
  WeekDose,
  WorkoutSession,
} from '../../domain/types';
import { EXERCISES, type CatalogExercise } from '../../data/exercises';
import { SESSIONS, estimateItemSec } from '../../data/sessions';
import { daysBetween, isISODate, weekStart } from '../dates';
import type { TrainingState } from '../training';

export type WeekOverrideKind = 'scarico' | 'leggera';

/** Fattori della settimana di scarico (§ 3.4: serie × 0,5 arrotondate in su, RIR +1, contatti e metri × 0,5). */
export const DELOAD_DOSE: WeekDose = { mainSetsAdd: 0, setsFactor: 0.5, rirDelta: 1, impactFactor: 0.5 };
/** Settimana 1 di un blocco: nessun fattore. */
export const BASE_DOSE: WeekDose = { mainSetsAdd: 0, setsFactor: 1, rirDelta: 0, impactFactor: 1 };
/** Ripetizioni di riserva minime nella settimana più leggera (§ 3.9). */
export const LIGHT_WEEK_MIN_RIR = 3;
/** Ripetizioni di riserva massime dopo i fattori. */
export const MAX_RIR = 5;
/** Ciclo della ripetizione di un blocco finito senza un blocco nuovo approvato: 3 settimane di carico e 1 di scarico. */
export const REPEAT_CYCLE_WEEKS = 4;

const MAIN_BLOCK_RE = /principale/i;
/** Come `isImpactExercise` in engine/training.ts, che qui non si importa per non creare un giro di import. */
const IMPACT_RE = /balz|salt|pliometr|hop/i;

function isImpact(exerciseId: string): boolean {
  const ex = EXERCISES[exerciseId] as CatalogExercise | undefined;
  if (typeof ex?.impact === 'boolean') return ex.impact;
  return IMPACT_RE.test(`${exerciseId} ${ex?.name ?? ''}`);
}

const isLegs = (exerciseId: string): boolean => EXERCISES[exerciseId]?.category === 'gambe';

/** Settimana scaricata o alleggerita dalla revisione per la data (lunedì della settimana in `Plan.weekOverrides`). */
export function weekOverrideFor(iso: ISODate, plan: Pick<Plan, 'weekOverrides'>): WeekOverrideKind | undefined {
  if (!isISODate(iso)) return undefined;
  const kind = plan.weekOverrides?.[weekStart(iso)];
  return kind === 'scarico' || kind === 'leggera' ? kind : undefined;
}

/** La seduta facoltativa del giorno non si fa: settimana «leggera» dalla revisione (§ 3.9). */
export function droppedByOverride(iso: ISODate, day: Pick<ScheduleDay, 'gymOptional'> | undefined, plan: Pick<Plan, 'weekOverrides'>): boolean {
  return Boolean(day?.gymOptional) && weekOverrideFor(iso, plan) === 'leggera';
}

const sameDose = (a: WeekDose, b: WeekDose) =>
  a.mainSetsAdd === b.mainSetsAdd && a.setsFactor === b.setsFactor && a.rirDelta === b.rirDelta && a.impactFactor === b.impactFactor;

/**
 * Esercizio con i fattori della settimana, arrotondamenti del § 3.4:
 * - serie = max(1, ⌈setsFactor × (serie_1 + mainSetsAdd)⌉), con `mainSetsAdd` solo nel blocco principale;
 * - ripetizioni degli esercizi d'impatto (contatti) e metri = max(1, ⌊impactFactor × valore_1⌋);
 * - RIR + rirDelta, tra 0 e 5; con un RIR in meno le gambe non scendono sotto 2 in stagione e sotto 1 altrove.
 */
export function deriveItem(item: SessionExercise, dose: WeekDose, opts: { main?: boolean; legsRirFloor?: number } = {}): SessionExercise {
  const out: SessionExercise = { ...item };
  const add = opts.main ? dose.mainSetsAdd : 0;
  out.sets = Math.max(1, Math.ceil(dose.setsFactor * (item.sets + add) - 1e-9));
  if (dose.impactFactor !== 1) {
    const scale = (v: number) => Math.max(1, Math.floor(dose.impactFactor * v + 1e-9));
    if (isImpact(item.exerciseId) && item.unit === 'reps') {
      out.repMin = scale(item.repMin);
      out.repMax = Math.max(out.repMin, scale(item.repMax));
    }
    if (typeof item.distanceM === 'number' && item.distanceM > 0) out.distanceM = scale(item.distanceM);
  }
  if (typeof item.rir === 'number' && dose.rirDelta) {
    let rir = item.rir + dose.rirDelta;
    if (dose.rirDelta < 0 && isLegs(item.exerciseId)) rir = Math.max(rir, Math.min(item.rir, opts.legsRirFloor ?? 1));
    out.rir = Math.min(MAX_RIR, Math.max(0, rir));
  }
  return out;
}

/** Minuti della seduta blocco per blocco, arrotondati come li somma `sessionDuration` (e come `estMin` delle sedute fisse). */
function blockMinutes(session: Pick<WorkoutSession, 'blocks'>): number {
  return session.blocks.reduce((tot, b) => tot + Math.round(b.items.reduce((s, it) => s + estimateItemSec(it), 0) / 60), 0);
}

/**
 * Seduta con i fattori della settimana (esercizio per esercizio, vedi `deriveItem`). La durata (`estMin`) segue le serie:
 * quella della seduta di partenza più la differenza dei minuti stimati, così Oggi, Allenamento e il carico previsto
 * vedono la seduta più corta dello scarico.
 */
export function deriveSession(base: WorkoutSession, dose: WeekDose, opts: { legsRirFloor?: number } = {}): WorkoutSession {
  if (sameDose(dose, BASE_DOSE)) return base;
  const blocks = base.blocks.map((b) => {
    const main = MAIN_BLOCK_RE.test(b.title);
    return { ...b, items: b.items.map((it) => deriveItem(it, dose, { main, legsRirFloor: opts.legsRirFloor })) };
  });
  return { ...base, blocks, estMin: Math.max(1, base.estMin + blockMinutes({ blocks }) - blockMinutes(base)) };
}

/** Settimana più leggera (§ 3.9): le serie restano, chi ha un RIR sale almeno a 3. */
export function lightenSession(base: WorkoutSession): WorkoutSession {
  return {
    ...base,
    blocks: base.blocks.map((b) => ({
      ...b,
      items: b.items.map((it) => (typeof it.rir === 'number' && it.rir < LIGHT_WEEK_MIN_RIR ? { ...it, rir: LIGHT_WEEK_MIN_RIR } : it)),
    })),
  };
}

/**
 * Fattori di una settimana del blocco (0 = la prima). Dentro il blocco quelli salvati; alla fine del blocco senza un
 * blocco nuovo approvato il blocco si ripete senza progressione (§ 3.1): settimane 1-3 alla dose della settimana 2 e
 * la quarta di scarico, e così di seguito; un blocco senza progressione (tutte le settimane uguali) si ripete com'è.
 * Null prima dell'inizio del blocco.
 */
export function programWeekDose(program: Pick<Program, 'start' | 'weeks' | 'dose'>, weekIndex: number): { dose: WeekDose; deload: boolean } | null {
  const n = Math.min(program.weeks.length, program.dose.length);
  if (!(weekIndex >= 0) || n === 0) return null;
  if (weekIndex < n) return { dose: program.dose[weekIndex], deload: program.weeks[weekIndex] !== 'carico' };
  const flat = program.dose.slice(0, n).every((d) => sameDose(d, program.dose[0]));
  if (flat) return { dose: program.dose[(weekIndex - n) % n], deload: program.weeks[(weekIndex - n) % n] !== 'carico' };
  const pos = (weekIndex - n) % REPEAT_CYCLE_WEEKS;
  if (pos === REPEAT_CYCLE_WEEKS - 1) {
    const i = program.weeks.findIndex((w) => w === 'scarico');
    return { dose: i >= 0 && program.dose[i] ? program.dose[i] : DELOAD_DOSE, deload: true };
  }
  const second = program.weeks[1] === 'carico' && program.dose[1] ? program.dose[1] : program.dose[0];
  return { dose: second, deload: false };
}

// Memoria dei risultati: stesso oggetto di partenza e stessa chiave → stesso riferimento.
const cache = new WeakMap<object, Map<string, WorkoutSession>>();
function memo(owner: object, key: string, make: () => WorkoutSession): WorkoutSession {
  let m = cache.get(owner);
  if (!m) {
    m = new Map();
    cache.set(owner, m);
  }
  const hit = m.get(key);
  if (hit) return hit;
  const v = make();
  m.set(key, v);
  return v;
}

function withOverride(session: WorkoutSession, kind: WeekOverrideKind | undefined, owner: object, key: string): WorkoutSession {
  if (kind === 'scarico') return memo(owner, `${key}|scarico`, () => deriveSession(session, DELOAD_DOSE));
  if (kind === 'leggera') return memo(owner, `${key}|leggera`, () => lightenSession(session));
  return session;
}

/**
 * Seduta di uno slot nella data: senza Plan.program SESSIONS[slot] (con weekOverrides), altrimenti la settimana
 * derivata. Prima dell'inizio del blocco, o per uno slot che il blocco non ha, vale la seduta fissa. Una settimana
 * scaricata dalla revisione prende i fattori dello scarico al posto dei suoi; una leggera porta il RIR ad almeno 3.
 */
export function sessionFor(slot: string, iso: ISODate, plan: Pick<Plan, 'program' | 'weekOverrides'>): WorkoutSession | undefined {
  const kind = weekOverrideFor(iso, plan);
  const program = plan.program;
  const week = program && isISODate(iso) && isISODate(program.start) ? Math.floor(daysBetween(program.start, iso) / 7) : -1;
  const base = program?.sessions?.[slot];
  const dose = program && base ? programWeekDose(program, week) : null;
  if (program && base && dose) {
    const legsRirFloor = program.phase === 'stagione' ? 2 : 1;
    if (kind === 'scarico') return memo(base, `scarico|${legsRirFloor}`, () => deriveSession(base, DELOAD_DOSE, { legsRirFloor }));
    const derived = memo(base, `${JSON.stringify(dose.dose)}|${legsRirFloor}`, () => deriveSession(base, dose.dose, { legsRirFloor }));
    return kind === 'leggera' ? memo(derived, 'leggera', () => lightenSession(derived)) : derived;
  }
  const fixed = SESSIONS[slot];
  if (!fixed) return undefined;
  return withOverride(fixed, kind, fixed, 'fissa');
}

export interface DaySession {
  session: WorkoutSession;
  variant: 'piena' | 'ridotta' | 'minima';
  reasons: string[];
}

/**
 * sessionFor + controllo del mattino + regola del dolore. In questa onda la variante è sempre «piena» e senza motivi:
 * la regola del dolore resta esercizio per esercizio nel lettore (`painGate`), come oggi.
 */
export function daySession(slot: string, iso: ISODate, state: TrainingState): DaySession | null {
  const session = sessionFor(slot, iso, state.plan);
  return session ? { session, variant: 'piena', reasons: [] } : null;
}
