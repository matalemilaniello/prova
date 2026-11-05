/**
 * Seduta di uno slot in una data (docs/FASE2.md § 3.1, § 3.4, § 3.9, § 12.2): l'unico punto da cui passano Oggi,
 * Allenamento, il lettore, il coach e il carico previsto quando mostrano o eseguono la seduta di un giorno.
 *
 * - `sessionFor(slot, iso, plan)`: senza `Plan.program` la seduta fissa (`SESSIONS[slot]`), con la settimana scaricata
 *   o alleggerita dalla revisione (`Plan.weekOverrides`) applicata; con un blocco in vigore la seduta della settimana 1
 *   con i fattori della sua settimana (`deriveSession`). Senza i campi nuovi è `SESSIONS[slot]`, lo stesso oggetto: chi
 *   la usa vede l'app di prima.
 * - `daySession(slot, iso, state)`: la seduta del giorno con la variante. Con il fermo degli impatti (`Plan.impactHold`)
 *   ogni seduta, quelle fisse comprese, passa al livello 0 da subito; con un blocco in vigore la variante segue il
 *   controllo del mattino (§ 3.9, `dayReadiness`) e dice perché. La regola del dolore resta esercizio per esercizio nel
 *   lettore, come oggi. Senza blocco e senza fermo è la seduta fissa, piena e senza motivi.
 * - `programInForce(iso, plan)`: il blocco vale dal suo lunedì e finché la fase della stagione resta la sua (§ 3.1).
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
  PlanEdit,
  Program,
  ScheduleDay,
  SessionExercise,
  WeekDose,
  WorkoutSession,
} from '../../domain/types';
import { EXERCISES, type CatalogExercise, type ExerciseSpace } from '../../data/exercises';
import { SESSIONS, estimateItemSec } from '../../data/sessions';
import { addDays, daysBetween, isISODate, weekStart } from '../dates';
import { doneSets, sessionFocus, type TrainingState } from '../training';
import { availableSpaces, isImpactItem, substituteItem } from './limits';
import { dayReadiness, floorsDoneThisWeek, sessionForVariant } from './readiness';
import { impactHoldActive } from './returnStages';
import { seasonOn } from './season';

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
 * - ripetizioni degli esercizi d'impatto (contatti) e metri della ripetuta = max(1, ⌊impactFactor × valore_1⌋): negli
 *   sprint cresce la distanza (le ripetute restano quelle), nei salti le ripetizioni;
 * - RIR + rirDelta, tra 0 e 5; con un RIR in meno le gambe non scendono sotto 2 in stagione e sotto 1 altrove.
 */
export function deriveItem(item: SessionExercise, dose: WeekDose, opts: { main?: boolean; legsRirFloor?: number } = {}): SessionExercise {
  const out: SessionExercise = { ...item };
  const add = opts.main ? dose.mainSetsAdd : 0;
  out.sets = Math.max(1, Math.ceil(dose.setsFactor * (item.sets + add) - 1e-9));
  if (dose.impactFactor !== 1) {
    const scale = (v: number) => Math.max(1, Math.floor(dose.impactFactor * v + 1e-9));
    // Metri di sprint e ripetute: cresce la distanza della ripetuta; contatti dei salti: crescono le ripetizioni. Mai
    // tutte e due, così contatti e metri seguono il fattore una volta sola.
    if (typeof item.distanceM === 'number' && item.distanceM > 0) out.distanceM = scale(item.distanceM);
    else if (isImpact(item.exerciseId) && item.unit === 'reps' && !(item.workSec && item.workSec > 0)) {
      out.repMin = scale(item.repMin);
      out.repMax = Math.max(out.repMin, scale(item.repMax));
    }
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
export function sessionFor(
  slot: string,
  iso: ISODate,
  plan: Pick<Plan, 'program' | 'weekOverrides'> & Partial<Pick<Plan, 'season'>>,
): WorkoutSession | undefined {
  const kind = weekOverrideFor(iso, plan);
  const program = programInForce(iso, plan);
  const week = program ? Math.floor(daysBetween(program.start, iso) / 7) : -1;
  const base = program?.sessions?.[slot];
  const dose = program && base ? programWeekDose(program, week) : null;
  if (program && base && dose) {
    const legsRirFloor = program.phase === 'stagione' ? 2 : 1;
    const edited = (x: WorkoutSession) => withEdits(x, program.edits, slot, week + 1);
    if (kind === 'scarico') return edited(memo(base, `scarico|${legsRirFloor}`, () => deriveSession(base, DELOAD_DOSE, { legsRirFloor })));
    const derived = edited(memo(base, `${JSON.stringify(dose.dose)}|${legsRirFloor}`, () => deriveSession(base, dose.dose, { legsRirFloor })));
    return kind === 'leggera' ? memo(derived, 'leggera', () => lightenSession(derived)) : derived;
  }
  const fixed = SESSIONS[slot];
  if (!fixed) return undefined;
  return withOverride(fixed, kind, fixed, 'fissa');
}

/**
 * Ritocchi del coach accettati (`Program.edits`, § 10.5), applicati dopo la derivazione della settimana `week` (1 = la
 * prima): «sostituisci» cambia l'esercizio tenendo la dose, «serie» fissa le serie, «ordine» riordina gli esercizi della
 * seduta (quelli non nominati restano dopo, nel loro ordine), «nota» aggiunge una nota. Un ritocco con `week` vale solo in
 * quella settimana. Chi li accetta li ha già validati (`validateWeek`); qui si applicano e basta.
 */
export function applyEdits(session: WorkoutSession, edits: readonly PlanEdit[], slot: string, week: number): WorkoutSession {
  let blocks = session.blocks.map((b) => ({ ...b, items: b.items.slice() }));
  for (const e of edits) {
    if (e.slot !== slot) continue;
    if ((e.op === 'sostituisci' || e.op === 'serie') && e.week !== undefined && e.week !== week) continue;
    switch (e.op) {
      case 'sostituisci':
        blocks = blocks.map((b) => ({ ...b, items: b.items.map((it) => (it.exerciseId === e.exerciseId ? { ...it, exerciseId: e.with } : it)) }));
        break;
      case 'serie':
        blocks = blocks.map((b) => ({ ...b, items: b.items.map((it) => (it.exerciseId === e.exerciseId ? { ...it, sets: Math.max(1, Math.round(e.sets)) } : it)) }));
        break;
      case 'nota':
        blocks = blocks.map((b) => ({ ...b, items: b.items.map((it) => (it.exerciseId === e.exerciseId ? { ...it, note: e.note } : it)) }));
        break;
      case 'ordine': {
        const rank = (id: string) => {
          const i = e.order.indexOf(id);
          return i < 0 ? e.order.length : i;
        };
        blocks = blocks.map((b) => ({ ...b, items: b.items.map((it, i) => ({ it, i })).sort((a, b2) => rank(a.it.exerciseId) - rank(b2.it.exerciseId) || a.i - b2.i).map((x) => x.it) }));
        break;
      }
    }
  }
  return { ...session, blocks, estMin: Math.max(1, session.estMin + blockMinutes({ blocks }) - blockMinutes(session)) };
}

function withEdits(session: WorkoutSession, edits: readonly PlanEdit[] | undefined, slot: string, week: number): WorkoutSession {
  const mine = (edits ?? []).filter((e) => e.slot === slot && !((e.op === 'sostituisci' || e.op === 'serie') && e.week !== undefined && e.week !== week));
  if (!mine.length) return session;
  return memo(session, `ritocchi|${week}|${JSON.stringify(mine)}`, () => applyEdits(session, mine, slot, week));
}

/**
 * Blocco in vigore nella data, se c'è: dal suo lunedì in poi, e finché la fase della stagione resta quella del blocco
 * (§ 3.1). A un cambio di fase senza approvazione il blocco della fase prima non si ripete (un blocco della pausa con il
 * precampionato sopra sarebbe troppo): valgono le sedute fisse, cioè l'app di oggi, finché l'utente non approva la
 * proposta della fase nuova. La transizione e lo sviluppo sono la stessa pausa: lì il blocco si ripete. Senza date della
 * stagione la fase è sempre «in stagione».
 */
export function programInForce(iso: ISODate, plan: Pick<Plan, 'program'> & Partial<Pick<Plan, 'season'>>): Program | undefined {
  const program = plan.program;
  if (!program || !isISODate(iso) || !isISODate(program.start) || iso < program.start) return undefined;
  if (plan.season && seasonOn(iso, plan.season).phase !== program.phase) return undefined;
  return program;
}

export interface DaySession {
  session: WorkoutSession;
  variant: 'piena' | 'ridotta' | 'minima';
  reasons: string[];
}

/** Settimana (1 = la prima) del blocco in vigore nella data, o null. */
export function programWeekOf(iso: ISODate, plan: Pick<Plan, 'program'> & Partial<Pick<Plan, 'season'>>): number | null {
  const program = programInForce(iso, plan);
  return program ? Math.floor(daysBetween(program.start, iso) / 7) + 1 : null;
}

const holdCache = new WeakMap<object, WorkoutSession>();

/**
 * Seduta con gli impatti fermi (§ 3.8): ogni esercizio d'impatto passa al sostituto senza volo, oppure salta. È un
 * freno di sicurezza come la regola del dolore: vale in ogni seduta, quelle fisse comprese, da subito.
 */
export function withoutImpacts(session: WorkoutSession, spaces: ReadonlySet<ExerciseSpace> = availableSpaces(undefined)): WorkoutSession {
  const hit = holdCache.get(session);
  if (hit) return hit;
  let changed = false;
  const blocks = session.blocks
    .map((b) => {
      const used = new Set(b.items.map((it) => it.exerciseId));
      const items = b.items.flatMap((it) => {
        if (!isImpactItem(it.exerciseId)) return [it];
        changed = true;
        const sub = substituteItem(it, { maxLevel: 0, spaces, exclude: used });
        if (sub) used.add(sub.exerciseId);
        return sub ? [sub] : [];
      });
      return { ...b, items };
    })
    .filter((b) => b.items.length);
  const out = changed ? { ...session, blocks, estMin: Math.max(1, session.estMin + blockMinutes({ blocks }) - blockMinutes(session)) } : session;
  holdCache.set(session, out);
  return out;
}

const dayCache = new WeakMap<object, Map<string, WorkoutSession>>();
function dayMemo(owner: object, key: string, make: () => WorkoutSession): WorkoutSession {
  let m = dayCache.get(owner);
  if (!m) {
    m = new Map();
    dayCache.set(owner, m);
  }
  const hit = m.get(key);
  if (hit) return hit;
  const v = make();
  m.set(key, v);
  return v;
}

/** Richiamo dopo una partita giocata poco (§ 3.10): cyclette 6 × 1 minuto forte e 1 facile, in coda alla seduta A. */
export const RECALL_ITEM: SessionExercise = {
  exerciseId: 'cyclette-intervalli',
  sets: 1,
  repMin: 6,
  repMax: 6,
  unit: 'reps',
  workSec: 60,
  restSec: 60,
  progression: 'nessuna',
  effort: 'RPE 8, poi 1 minuto facile',
  note: 'Hai giocato poco: un richiamo breve in cyclette',
};
/** Minuti di partita sotto cui serve il richiamo. */
export const SHORT_MATCH_MIN = 45;

/**
 * sessionFor + fermo degli impatti + controllo del mattino + regola del dolore (§ 3.9, § 3.10). Senza blocco e senza
 * fermo è la seduta fissa, piena e senza motivi: l'app di prima. Con un blocco in vigore:
 * - la variante del giorno (`dayReadiness`): ridotta o minima con i motivi («5 h 50 a letto», «energia bassa»);
 * - la prova del saltello del rientro una volta sola: fatta, sparisce dalle sedute dopo;
 * - il richiamo in cyclette in coda alla seduta del giorno dopo una partita giocata meno di 45 minuti.
 * La regola del dolore resta esercizio per esercizio nel lettore, come oggi. La variante non si salva.
 */
export function daySession(slot: string, iso: ISODate, state: TrainingState): DaySession | null {
  const plan = state.plan;
  const base = sessionFor(slot, iso, plan);
  if (!base) return null;
  let session = base;
  const reasons: string[] = [];
  if (impactHoldActive(plan, iso)) {
    const spaces = availableSpaces(plan.training?.spaces);
    session = withoutImpacts(session, spaces);
    reasons.push('impatti fermi');
  }
  const program = programInForce(iso, plan);
  if (!program || !program.sessions[slot]) {
    return { session, variant: 'piena', reasons };
  }
  // Prova del saltello: una volta sola dall'inizio dello stadio.
  const since = plan.training?.rientro?.since ?? program.start;
  const hopDone = (state.workoutLogs ?? []).some((w) => w.date >= since && w.date < iso && w.exercises.some((e) => e.exerciseId === 'prova-saltello' && doneSets(e).length));
  if (hopDone && session.blocks.some((b) => b.items.some((it) => it.exerciseId === 'prova-saltello'))) {
    const from = session;
    session = dayMemo(from, 'senza-prova', () => {
      const blocks = from.blocks.map((b) => ({ ...b, items: b.items.filter((it) => it.exerciseId !== 'prova-saltello') })).filter((b) => b.items.length);
      return { ...from, blocks, estMin: Math.max(1, from.estMin + blockMinutes({ blocks }) - blockMinutes(from)) };
    });
  }
  // Partita giocata poco ieri: richiamo in coda alla seduta senza gambe del giorno dopo.
  const prev = addDays(iso, -1);
  const shortMatch = (state.footballLogs ?? []).some((f) => f.date === prev && f.kind === 'partita' && f.durationMin < SHORT_MATCH_MIN);
  if (shortMatch && sessionFocus(session) === 'alto' && !session.blocks.some((b) => b.items.some((it) => it === RECALL_ITEM))) {
    const from = session;
    session = dayMemo(from, 'richiamo', () => {
      const blocks = [...from.blocks, { title: 'Richiamo', items: [RECALL_ITEM] }];
      return { ...from, blocks, estMin: from.estMin + blockMinutes({ blocks: [{ title: 'Richiamo', items: [RECALL_ITEM] }] }) };
    });
    reasons.push('richiamo dopo una partita breve');
  }
  const r = dayReadiness(iso, state, { legs: sessionFocus(session) === 'basso', slot });
  if (r.variant === 'piena') return { session, variant: 'piena', reasons };
  const done = floorsDoneThisWeek(iso, state);
  const key = `${r.variant}|${r.noImpact ? 1 : 0}|${[...done].sort().join(',')}`;
  const from = session;
  session = dayMemo(from, key, () => sessionForVariant(from, r.variant, done, { noImpact: r.noImpact }));
  return { session, variant: r.variant, reasons: [...r.reasons, ...reasons] };
}
