/**
 * La settimana del blocco intorno alla partita (docs/FASE2.md § 3.2): distanza dalla partita, posizione delle sedute,
 * carico previsto (R10) e validazione delle regole R1-R9. Funzioni pure, senza orologio.
 *
 * - Le regole sono relative al giorno della partita (MD) e si calcolano da `Plan.week`: valgono anche se la partita si
 *   sposta. Senza partita nella settimana (pausa, precampionato, settimana senza calcio) restano R6 e R7.
 * - `placeSessions`: mette le sedute nei giorni ammessi (R1-R7), fuori dai blocchi di lavoro (`ScheduleDay.work`) e
 *   almeno 4 ore prima del calcio nei giorni con il calcio; tiene il giorno e l'orario dell'utente quando vanno già bene.
 *   Una seduta che non trova un giorno si toglie e lo dice.
 * - `plannedLoad(monday, plan)`: R10, previsto contro previsto: il calcio previsto (durata × RPE tipica) e la quota
 *   controllabile (durata della seduta × RPE prevista: 7 per la palestra, quella scritta per corsa e condizionamento).
 * - `validateWeek(plan, program, week, ctx)`: la rete dopo il generatore. Una violazione dura che resta è un difetto del
 *   generatore: i test la cercano.
 */
import type {
  AppData,
  CheckIn,
  FootballEvent,
  HHMM,
  ISODate,
  Plan,
  Program,
  ScheduleDay,
  SeasonPhase,
  SeasonStage,
  SessionExercise,
  TrainingSpace,
  Violation,
  Weekday,
  WorkoutSession,
} from '../../domain/types';
import { EXERCISES, type ImpactLevel } from '../../data/exercises';
import { addDays, hhmmToMin, minToHHMM, weekdayOf } from '../dates';
import { TYPICAL_RPE, sessionDuration } from '../training';
import { afterWork, overlapsWork, workSpans } from '../work';
import {
  availableSpaces,
  contactLimitsFor,
  FLOOR_LABEL,
  isCopenhagen,
  isFastSprint,
  isHeavyLegs,
  isImpactItem,
  isLegsItem,
  isNordic,
  isSprintOrJump,
  isStrengthLegs,
  itemContacts,
  itemLevel,
  itemMeters,
  MD2_CONTACTS_MAX,
  MD2_SPRINT_METERS_MAX,
  missingFloors,
  plyoLevel,
  requiredFloors,
  sessionContacts,
  spaceAvailable,
  type FloorId,
} from './limits';
import { deriveSession, droppedByOverride, programWeekDose, sessionFor } from './program';

// ───────────────────────── Distanza dalla partita ─────────────────────────

const DAY_MIN = 1440;
/** Margine tra la palestra e il calcio dello stesso giorno (R6). */
export const FOOTBALL_GAP_MIN = 240;
/** Gambe pesanti: almeno 24 ore prima del calcio e 48 ore tra due sedute (R7). */
export const LEGS_BEFORE_FOOTBALL_MIN = 24 * 60;
export const LEGS_SPACING_MIN = 48 * 60;
/** Fascia della giornata in cui si mette una seduta. */
export const GYM_EARLIEST = '07:00';
export const GYM_LATEST_END = '22:00';
/** Minuti dopo la fine del lavoro prima della seduta. */
export const AFTER_WORK_MIN = 30;

/** Giorno della settimana tipo per un giorno (0 = lunedì). */
export const dayOf = (week: readonly ScheduleDay[], wd: number): ScheduleDay | undefined =>
  week.find((d) => d.weekday === wd) ?? week[wd];

/** Giorno della partita nella settimana tipo, o null. */
export function matchWeekday(week: readonly ScheduleDay[]): Weekday | null {
  for (let wd = 0; wd < 7; wd++) if (dayOf(week, wd)?.football?.kind === 'partita') return wd as Weekday;
  return null;
}

/**
 * Distanza del giorno dalla partita: 0 = MD, 1 = MD+1, 2 = MD+2, 3 = MD+3 (MD−4), 4 = MD−3, 5 = MD−2, 6 = MD−1. Null
 * senza partita.
 */
export function mdDistance(wd: number, week: readonly ScheduleDay[]): number | null {
  const md = matchWeekday(week);
  return md === null ? null : (((wd - md) % 7) + 7) % 7;
}

/** "MD", "MD+1", "MD−3". */
export function mdLabel(d: number | null): string {
  if (d === null) return '–';
  if (d === 0) return 'MD';
  return d <= 3 ? `MD+${d}` : `MD−${7 - d}`;
}

/** Gambe pesanti, Nordic, pliometria 2-3 e sprint sopra il 90% (R2): solo da MD+2 a MD−3. */
export const HARD_DAYS: ReadonlySet<number> = new Set([2, 3, 4]);

// ───────────────────────── Seduta: forma e tipo ─────────────────────────

const allItems = (s: Pick<WorkoutSession, 'blocks'>) => s.blocks.flatMap((b) => b.items);

/** Cosa contiene una seduta, per le regole di posizione. */
export interface SessionTraits {
  heavyLegs: boolean;
  strengthLegs: boolean;
  legs: boolean;
  impacts: boolean;
  nordic: boolean;
  /** Pliometria di livello 2-3 o sprint sopra il 90%. */
  hardImpacts: boolean;
  light: boolean;
}

/** Tratti di una seduta: gambe pesanti, gambe, impatti, Nordic, leggerezza. */
export function sessionTraits(s: Pick<WorkoutSession, 'blocks'>, physio?: Pick<AppData['physio'], 'exercises'>): SessionTraits {
  const it = allItems(s);
  return {
    heavyLegs: it.some(isHeavyLegs),
    strengthLegs: it.some(isStrengthLegs),
    legs: it.some(isLegsItem),
    impacts: it.some((x) => isImpactItem(x.exerciseId, physio)),
    nordic: it.some(isNordic),
    hardImpacts: it.some((x) => (itemContacts(x) > 0 && itemLevel(x.exerciseId) >= 2) || isFastSprint(x)),
    light: it.every((x) => x.rir === undefined || x.rir >= 3),
  };
}

// ───────────────────────── Posizione delle sedute ─────────────────────────

/** Tipo di una seduta da mettere nella settimana. */
export type SlotKind = 'gambe' | 'alto' | 'leggera' | 'corsa';

export interface SlotSpec {
  slot: string;
  kind: SlotKind;
  optional?: boolean;
  /** Gambe pesanti (R2, R7). */
  heavyLegs?: boolean;
  /** Minuti previsti, per controllare lavoro e calcio. */
  minutes: number;
}

export interface Placement {
  slot: string;
  weekday: Weekday;
  time: HHMM;
  optional: boolean;
}

export interface PlacementResult {
  placements: Placement[];
  /** Sedute senza un giorno ammesso, tolte. */
  dropped: string[];
  /** Sedute spostate rispetto alla settimana dell'utente. */
  moved: string[];
}

const DEFAULT_TIMES: readonly HHMM[] = ['17:00', '18:00', '18:30', '19:00', '19:30', '12:30', '07:30', '20:00', '10:00', '15:00'];

/** Preferenza dei giorni per tipo di seduta (distanza dalla partita, la prima è la migliore). */
const MD_PREF: Record<SlotKind, readonly number[]> = {
  gambe: [4, 3, 2],
  alto: [1, 2, 3, 4],
  leggera: [5, 3, 2, 1, 4],
  corsa: [2, 3, 4, 1, 5],
};

/** Giorni ammessi per tipo (R1-R5): mai MD e MD−1; MD+1 solo parte superiore; MD−2 solo leggera. */
function mdAllowed(kind: SlotKind, d: number, heavy: boolean): boolean {
  if (d === 0 || d === 6) return false;
  if (heavy && !HARD_DAYS.has(d)) return false;
  if (kind === 'gambe') return HARD_DAYS.has(d);
  if (kind === 'alto') return d !== 5;
  if (kind === 'leggera') return d !== 0 && d !== 6;
  return d !== 1 && d !== 5;
}

/** Contesto della posizione: piano per sveglia e lavoro. */
export interface PlaceCtx {
  plan: Pick<Plan, 'sleep'>;
  /** Settimana senza partita: valgono solo R6 e R7. */
  noMatch?: boolean;
}

/** Inizio (in minuti) e fine del calcio di un giorno, se c'è. */
function footballMin(f: FootballEvent | undefined): number | null {
  return f ? hhmmToMin(f.time) : null;
}

/** Orario della seduta nel giorno, oppure null: fuori dal lavoro, nella fascia della giornata, lontano dal calcio. */
export function timeFor(
  day: ScheduleDay,
  next: ScheduleDay | undefined,
  spec: Pick<SlotSpec, 'kind' | 'heavyLegs' | 'minutes'>,
  ctx: PlaceCtx,
  prefer: readonly (HHMM | undefined)[],
): HHMM | null {
  const spans = workSpans(day.work, ctx.plan);
  const wake = hhmmToMin(ctx.plan.sleep.wake);
  const earliest = Math.max(hhmmToMin(GYM_EARLIEST), wake + 45);
  const latestEnd = hhmmToMin(GYM_LATEST_END);
  const fb = footballMin(day.football);
  const nextFb = footballMin(next?.football);
  const legs = spec.kind === 'gambe' || spec.kind === 'leggera' || spec.kind === 'corsa';
  if (fb !== null && legs) return null;
  const tried = new Set<number>();
  for (const c of [...prefer, ...DEFAULT_TIMES]) {
    if (!c) continue;
    let t = afterWork(hhmmToMin(c), spec.minutes, spans, AFTER_WORK_MIN);
    t = Math.max(t, earliest);
    t = afterWork(t, spec.minutes, spans, AFTER_WORK_MIN);
    if (tried.has(t)) continue;
    tried.add(t);
    const end = t + spec.minutes;
    if (end > latestEnd || overlapsWork(t, end, spans)) continue;
    if (fb !== null && end > fb - FOOTBALL_GAP_MIN) continue;
    if (spec.heavyLegs && nextFb !== null && end + LEGS_BEFORE_FOOTBALL_MIN > DAY_MIN + nextFb) continue;
    return minToHHMM(t);
  }
  return null;
}

/** Distanza in minuti tra due sedute nella settimana che si ripete (la più corta tra le due direzioni). */
function cyclicGap(a: { wd: number; t: number }, b: { wd: number; t: number }): number {
  const x = a.wd * DAY_MIN + a.t;
  const y = b.wd * DAY_MIN + b.t;
  const d = Math.abs(x - y);
  return Math.min(d, 7 * DAY_MIN - d);
}

/**
 * Sedute nei giorni ammessi (R1-R7), una al giorno, nell'ordine delle specifiche (le più importanti prima). Per ogni
 * seduta prova prima il giorno e l'orario dell'utente, poi i giorni preferiti per il tipo; tra due sedute di gambe
 * pesanti almeno 48 ore. Deterministica.
 */
export function placeSessions(week: readonly ScheduleDay[], specs: readonly SlotSpec[], ctx: PlaceCtx): PlacementResult {
  const md = ctx.noMatch ? null : matchWeekday(week);
  const used = new Map<number, Placement>();
  const heavy: { wd: number; t: number }[] = [];
  const placements: Placement[] = [];
  const dropped: string[] = [];
  const moved: string[] = [];
  const original = new Map<string, number>();
  for (let wd = 0; wd < 7; wd++) {
    const id = dayOf(week, wd)?.gymSessionId;
    if (id && !original.has(id)) original.set(id, wd);
  }
  for (const spec of specs) {
    const candidates: number[] = [];
    const push = (wd: number) => {
      if (wd >= 0 && wd < 7 && !candidates.includes(wd)) candidates.push(wd);
    };
    const own = original.get(spec.slot);
    if (own !== undefined) push(own);
    if (md !== null) for (const d of MD_PREF[spec.kind]) push((md + d) % 7);
    // Senza partita: i giorni senza calcio prima, poi gli altri, in ordine.
    const order = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => Number(Boolean(dayOf(week, a)?.football)) - Number(Boolean(dayOf(week, b)?.football)) || a - b);
    if (md === null) for (const wd of order) push(wd);
    let done = false;
    for (const wd of candidates) {
      if (used.has(wd)) continue;
      const day = dayOf(week, wd);
      if (!day) continue;
      if (md !== null && !mdAllowed(spec.kind, (((wd - md) % 7) + 7) % 7, Boolean(spec.heavyLegs))) continue;
      const next = dayOf(week, (wd + 1) % 7);
      const prefer = [own === wd ? day.gymTime : undefined, dayOf(week, own ?? -1)?.gymTime];
      const time = timeFor(day, next, spec, ctx, prefer);
      if (!time) continue;
      const t = hhmmToMin(time);
      if (spec.heavyLegs && heavy.some((h) => cyclicGap(h, { wd, t }) < LEGS_SPACING_MIN)) continue;
      const p: Placement = { slot: spec.slot, weekday: wd as Weekday, time, optional: Boolean(spec.optional) };
      used.set(wd, p);
      placements.push(p);
      if (spec.heavyLegs) heavy.push({ wd, t });
      if (own !== wd || dayOf(week, wd)?.gymTime !== time) moved.push(spec.slot);
      done = true;
      break;
    }
    if (!done) dropped.push(spec.slot);
  }
  return { placements, dropped, moved };
}

/** Settimana tipo con le sedute nelle loro posizioni; i giorni senza seduta perdono i campi della palestra. */
export function applyPlacements(week: readonly ScheduleDay[], placements: readonly Placement[]): ScheduleDay[] {
  const out: ScheduleDay[] = [];
  for (let wd = 0; wd < 7; wd++) {
    const base = dayOf(week, wd) ?? { weekday: wd as Weekday, dayType: 'riposo' as const };
    const { gymSessionId: _g, gymTime: _t, gymOptional: _o, ...rest } = base;
    const p = placements.find((x) => x.weekday === wd);
    out.push(p ? { ...rest, weekday: wd as Weekday, gymSessionId: p.slot, gymTime: p.time, ...(p.optional ? { gymOptional: true } : {}) } : { ...rest, weekday: wd as Weekday });
  }
  return out;
}

// ───────────────────────── Carico previsto (R10) ─────────────────────────

/** RPE prevista di una seduta: quella scritta negli esercizi («RPE 4-5» vale 5), altrimenti 7 come la palestra. */
export function sessionRpe(s: Pick<WorkoutSession, 'blocks'>): number {
  let max = 0;
  for (const it of allItems(s)) {
    const m = /RPE\s*(\d+)(?:\s*-\s*(\d+))?/i.exec(it.effort ?? '');
    if (m) max = Math.max(max, Number(m[2] ?? m[1]));
  }
  return max > 0 ? Math.min(10, max) : TYPICAL_RPE.palestra;
}

/** Carico previsto di una seduta in UA: durata × RPE prevista. */
export const sessionPlannedLoad = (s: WorkoutSession): number => Math.round(Math.max(0, s.estMin) * sessionRpe(s));

/** Carico previsto del calcio di un giorno in UA (durata × RPE tipica). */
export const footballPlannedLoad = (f: FootballEvent | undefined): number => (f ? Math.round(f.durationMin * TYPICAL_RPE[f.kind]) : 0);

/**
 * R10, previsto: per la settimana del lunedì il calcio previsto (`football`) e la quota controllabile (`controllable`:
 * palestra, corsa, pliometria, richiamo) con le sedute della data (`sessionFor`: blocco in vigore, settimane scaricate o
 * alleggerite). Le sedute facoltative contano: il carico previsto è quello che il piano chiede.
 */
export function plannedLoad(monday: ISODate, plan: Plan): { football: number; controllable: number } {
  let football = 0;
  let controllable = 0;
  for (let i = 0; i < 7; i++) {
    const iso = addDays(monday, i);
    const day = dayOf(plan.week, weekdayOf(iso));
    if (!day) continue;
    football += footballPlannedLoad(day.football);
    if (day.gymSessionId && !droppedByOverride(iso, day, plan)) {
      const s = sessionFor(day.gymSessionId, iso, plan);
      if (s) controllable += sessionPlannedLoad(s);
    }
  }
  return { football, controllable };
}

/** Carico previsto di una settimana tipo con sedute date (per slot), senza date: il generatore lo usa sul blocco nuovo. */
export function weekPlannedLoad(week: readonly ScheduleDay[], sessions: Readonly<Record<string, WorkoutSession>>): { football: number; controllable: number } {
  let football = 0;
  let controllable = 0;
  for (let wd = 0; wd < 7; wd++) {
    const day = dayOf(week, wd);
    if (!day) continue;
    football += footballPlannedLoad(day.football);
    const s = day.gymSessionId ? sessions[day.gymSessionId] : undefined;
    if (s) controllable += sessionPlannedLoad(s);
  }
  return { football, controllable };
}

// ───────────────────────── Validazione ─────────────────────────

/** Contesto della validazione di una settimana del blocco. */
export interface TrainingCtx {
  painSites?: readonly string[];
  physio?: AppData['physio'];
  checkIns?: Readonly<Record<ISODate, CheckIn>>;
  /** Livello d'impatto massimo ammesso (fermo, rientro, R8, fase); assente = quello della fase. */
  maxImpactLevel?: ImpactLevel;
  /** Eccezioni dello stadio del rientro. */
  allowed?: readonly string[];
  /** Contatti massimi a seduta dello stadio del rientro. */
  returnContactsMax?: number;
  /** R8 attiva: una zona sotto il ginocchio sopra la soglia degli impatti negli ultimi 14 giorni. */
  r8?: boolean;
  spaces?: readonly TrainingSpace[];
  /** Minuti per seduta (predefinito 60). */
  sessionMin?: number;
  /** Riferimento di R10 (UA) per la settimana; senza, R10 non si controlla. */
  reference?: number;
  /** Avviso di R10 dato («tengo solo il minimo»): allora R10 non è una violazione. */
  floorsOnly?: boolean;
  /** Esercizi che l'utente conosce già (R3: niente esercizi nuovi alla vigilia della vigilia). */
  knownExercises?: ReadonlySet<string>;
  /** Pavimenti richiesti, se diversi da quelli della fase (dolore, sedute tolte). */
  floors?: Partial<Record<FloorId, number>>;
  /** Fase e stadio, se diversi da quelli del blocco. */
  phase?: SeasonPhase;
  stage?: SeasonStage;
}

/** Seduta di uno slot nella settimana `week` (1 = la prima) del blocco, con i fattori di quella settimana. */
export function programSession(program: Program, slot: string, week: number): WorkoutSession | undefined {
  const base = program.sessions[slot];
  if (!base) return undefined;
  const dose = programWeekDose(program, week - 1);
  if (!dose) return base;
  return deriveSession(base, dose.dose, { legsRirFloor: program.phase === 'stagione' ? 2 : 1 });
}

const v = (code: string, message: string, extra: Partial<Violation> = {}, hard = true): Violation => ({ code, hard, message, ...extra });

/**
 * Violazioni della settimana `week` (1 = la prima) del blocco con la settimana tipo del piano: R1-R9, contatti e livello,
 * durata, spazi, catalogo, lavoro, pavimenti, RIR delle gambe in stagione; R10 come avviso (non dura).
 */
export function validateWeek(plan: Plan, program: Program, week: number, ctx: TrainingCtx = {}): Violation[] {
  const out: Violation[] = [];
  const phase = ctx.phase ?? program.phase;
  const stage = ctx.stage ?? program.stage;
  const kind = program.weeks[(week - 1) % program.weeks.length];
  const limits = contactLimitsFor(phase, kind === 'rifinitura' ? 'rifinitura' : stage);
  const maxLevel = Math.min(limits.maxLevel, ctx.maxImpactLevel ?? limits.maxLevel);
  const spaces = availableSpaces(ctx.spaces);
  const minutes = ctx.sessionMin ?? 60;
  const md = matchWeekday(plan.week);
  const days: { wd: number; day: ScheduleDay; session?: WorkoutSession; start?: number; end?: number }[] = [];
  for (let wd = 0; wd < 7; wd++) {
    const day = dayOf(plan.week, wd);
    if (!day) continue;
    const session = day.gymSessionId ? programSession(program, day.gymSessionId, week) : undefined;
    const start = session && day.gymTime ? hhmmToMin(day.gymTime) : undefined;
    const end = session && start !== undefined ? start + sessionDuration(session, ctx.physio).total : undefined;
    days.push({ wd, day, session, start, end });
  }
  let weekContacts = 0;
  const heavyDays: { wd: number; t: number }[] = [];
  const isImpactDay = (wd: number) => {
    const d = days.find((x) => x.wd === ((wd % 7) + 7) % 7);
    return Boolean(d?.day.football || (d?.session && allItems(d.session).some((it) => isImpactItem(it.exerciseId, ctx.physio))));
  };
  for (const { wd, day, session, start, end } of days) {
    if (!session) continue;
    const where = { day: wd as Weekday, slot: day.gymSessionId };
    const traits = sessionTraits(session, ctx.physio);
    const d = md === null ? null : (((wd - md) % 7) + 7) % 7;
    const its = allItems(session);
    // Catalogo, spazi, livello, contatti.
    for (const it of its) {
      const known = Boolean(EXERCISES[it.exerciseId]) || Boolean(ctx.physio?.exercises.some((e) => e.id === it.exerciseId));
      if (!known) out.push(v('catalogo', `Esercizio fuori dal catalogo: ${it.exerciseId}`, { where: { ...where, key: it.exerciseId } }));
      if (!spaceAvailable(it.exerciseId, spaces)) out.push(v('spazio', `Serve uno spazio che non c’è: ${EXERCISES[it.exerciseId]?.name ?? it.exerciseId}`, { where: { ...where, key: it.exerciseId } }));
      // Il livello della fase vale per la pliometria (contatti); il fermo, il rientro e R8 per ogni impatto.
      const level = itemLevel(it.exerciseId, ctx.physio);
      const cap = itemContacts(it) > 0 ? maxLevel : (ctx.maxImpactLevel ?? 3);
      if (level > cap && !(ctx.allowed ?? []).includes(it.exerciseId)) {
        out.push(v('livello', `Livello d’impatto ${level} oltre il massimo ${cap}`, { where: { ...where, key: it.exerciseId }, value: level, limit: cap }));
      }
      if (phase === 'stagione' && isStrengthLegs(it) && typeof it.rir === 'number' && it.rir < 2) {
        out.push(v('rir-gambe', 'Gambe in stagione mai sotto RIR 2', { where: { ...where, key: it.exerciseId }, value: it.rir, limit: 2 }));
      }
    }
    const contacts = sessionContacts(session);
    weekContacts += contacts;
    const cap = Math.min(limits.session, ctx.returnContactsMax ?? limits.session);
    if (contacts > cap) out.push(v('contatti-seduta', `Contatti ${contacts} oltre i ${cap} della seduta`, { where, value: contacts, limit: cap }));
    const dur = sessionDuration(session, ctx.physio).total;
    if (dur > minutes + 5) out.push(v('durata', `Seduta da ${dur} minuti oltre i ${minutes} scelti`, { where, value: dur, limit: minutes + 5 }));
    // Lavoro.
    if (start !== undefined && end !== undefined && overlapsWork(start, end, workSpans(day.work, plan))) {
      out.push(v('lavoro', 'Seduta durante il lavoro', { where }));
    }
    // R1-R5 rispetto alla partita.
    if (d !== null) {
      if (d === 0) out.push(v('R1', 'Niente palestra il giorno della partita', { where }));
      if (d === 6) out.push(v('R4', 'Niente palestra alla vigilia della partita', { where }));
      if (!HARD_DAYS.has(d) && (traits.heavyLegs || traits.nordic || traits.hardImpacts)) {
        out.push(v('R2', `Gambe pesanti, Nordic, salti alti e sprint solo da MD+2 a MD−3 (qui ${mdLabel(d)})`, { where }));
      }
      if (d === 5) {
        const fastMeters = its.filter(isFastSprint).reduce((t, it) => t + itemMeters(it), 0);
        const newEx = ctx.knownExercises ? its.find((it) => !ctx.knownExercises!.has(it.exerciseId)) : undefined;
        if (!traits.light || traits.nordic || contacts > MD2_CONTACTS_MAX || plyoLevel(session) > 1 || fastMeters > MD2_SPRINT_METERS_MAX || newEx) {
          out.push(v('R3', 'A due giorni dalla partita solo una seduta leggera', { where, ...(newEx ? { key: newEx.exerciseId } : {}) }));
        }
      }
      if (d === 1 && (its.some((it) => isLegsItem(it)) || traits.impacts)) {
        out.push(v('R5', 'Il giorno dopo la partita: parte superiore e prevenzione, niente impatti', { where }));
      }
    }
    // R6: giorni con il calcio.
    if (day.football && day.football.kind !== 'partita') {
      if (traits.legs || traits.impacts) out.push(v('R6', 'Niente gambe nei giorni con il calcio', { where }));
      const fb = hhmmToMin(day.football.time);
      if (end !== undefined && end > fb - FOOTBALL_GAP_MIN) out.push(v('R6', 'La palestra finisce meno di 4 ore prima del calcio', { where, value: fb - end, limit: FOOTBALL_GAP_MIN }));
    }
    // R7: gambe pesanti.
    if (traits.heavyLegs && start !== undefined && end !== undefined) {
      const next = dayOf(plan.week, (wd + 1) % 7);
      if (next?.football && end + LEGS_BEFORE_FOOTBALL_MIN > DAY_MIN + hhmmToMin(next.football.time)) {
        out.push(v('R7', 'Gambe pesanti meno di 24 ore prima del calcio', { where }));
      }
      if (heavyDays.some((h) => cyclicGap(h, { wd, t: start }) < LEGS_SPACING_MIN)) out.push(v('R7', 'Meno di 48 ore tra due sedute di gambe pesanti', { where }));
      heavyDays.push({ wd, t: start });
    }
    // R8: il giorno dopo due giorni di fila con impatti, niente impatti.
    if (ctx.r8 && traits.impacts && isImpactDay(wd - 1) && isImpactDay(wd - 2)) {
      out.push(v('R8', 'Dopo due giorni di fila con impatti, niente impatti', { where }));
    }
    // R9: sprint e salti prima della forza; Nordic e Copenhagen in fondo.
    const main = session.blocks.filter((b) => !/riscaldamento/i.test(b.title)).flatMap((b) => b.items);
    const firstStrength = main.findIndex((it) => it.progression === 'doppia' && ['gambe', 'spinta', 'tirata'].includes(EXERCISES[it.exerciseId]?.category ?? ''));
    const lastJump = main.reduce((m, it, i) => (isSprintOrJump(it) ? i : m), -1);
    if (firstStrength >= 0 && lastJump > firstStrength) out.push(v('R9', 'Sprint e salti vanno prima della forza', { where }));
    const firstEnd = main.findIndex((it) => isNordic(it) || isCopenhagen(it));
    if (firstEnd >= 0 && main.slice(firstEnd).some((it) => !(isNordic(it) || isCopenhagen(it) || EXERCISES[it.exerciseId]?.category === 'mobilita'))) {
      out.push(v('R9', 'Nordic e Copenhagen vanno in fondo alla seduta', { where }));
    }
  }
  if (weekContacts > limits.week) out.push(v('contatti-settimana', `Contatti della settimana ${weekContacts} oltre i ${limits.week}`, { value: weekContacts, limit: limits.week }));
  // Pavimenti.
  const required =
    ctx.floors ?? requiredFloors(phase, { elbow: (ctx.painSites ?? []).some((s) => /gomit/i.test(s)), physio: ctx.physio });
  const missing = missingFloors(required, days.flatMap((d) => (d.session ? [d.session] : [])));
  for (const [k, n] of Object.entries(missing) as [FloorId, number][]) {
    out.push(v('pavimento', `Manca ${FLOOR_LABEL[k]} (${n} ${n === 1 ? 'volta' : 'volte'})`, { where: { key: k }, value: n }));
  }
  // R10, regola di dosaggio.
  if (ctx.reference !== undefined && ctx.reference > 0 && !ctx.floorsOnly) {
    const total = days.reduce((t, d) => t + footballPlannedLoad(d.day.football) + (d.session ? sessionPlannedLoad(d.session) : 0), 0);
    if (total > ctx.reference * 1.1 + 1e-6) out.push(v('R10', 'Settimana oltre il 110% del carico previsto più alto delle 4 prima', { value: total, limit: Math.round(ctx.reference * 1.1) }, false));
  }
  return out;
}

/** Item di comodo per i test e per il generatore: tutti gli esercizi di una seduta. */
export const sessionItems = (s: Pick<WorkoutSession, 'blocks'>): SessionExercise[] => allItems(s);
