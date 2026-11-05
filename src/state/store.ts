/**
 * Stato dell'app.
 *
 * - `useApp`: dati persistiti (forma AppData) + azioni. localStorage 'ritmo:v1', con version e migrate.
 * - `useUi`: stato dell'interfaccia non persistito (pannello aperto, coda dei toast).
 *
 * Archivio freddo (fase 2, docs/FASE2.md § 12.5): miniature dei piatti (`dishThumbs`) e versioni del piano
 * (`planVersions`) stanno sotto `ritmo:v1:archivio`, fuori dal blob caldo che si riscrive a ogni tocco. Il `merge` di
 * persist le legge in modo sincrono e le fonde prima di normalizzare; lo scrittore parte solo dopo l'idratazione e non
 * sovrascrive mai una sezione con `undefined`.
 *
 * Se a una schermata serve un'azione che qui manca, la implementa nel proprio modulo con
 * `useApp.setState(...)` senza modificare questo file.
 */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type {
  AppData,
  BlockSummary,
  BlockWeekKind,
  ChatMessage,
  CheckIn,
  CoachPass,
  CoachUsageMonth,
  DayLog,
  DayType,
  DiffItem,
  DoseUnit,
  EatenMeal,
  EstimatedItem,
  Exercise,
  FoodExclusion,
  FootballEvent,
  FootballLog,
  ISODate,
  ItemStatus,
  LabelUnit,
  MacroTarget,
  MealSlot,
  MenuEdit,
  MenuWeek,
  MyDish,
  Nutrients,
  Overlay,
  Plan,
  PlanEdit,
  PlanPatch,
  PlanProposal,
  PlanVersion,
  Planner,
  Portion,
  PrepTask,
  Profile,
  Program,
  Proposal,
  ReturnPlan,
  ScheduleDay,
  SeasonCalendar,
  SessionExercise,
  Settings,
  Supplement,
  SupplementComponent,
  SupplementProduct,
  TrainingGoal,
  TrainingQuality,
  WeekDose,
  WeeklyReview,
  Weekday,
  WorkoutBlock,
  WorkoutLog,
  WorkoutSession,
} from '../domain/types';
import {
  DATA_VERSION,
  DEFAULT_WEEK,
  STORAGE_KEY,
  defaultAppData,
  defaultPlan,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  DEFAULT_TARGETS,
} from '../data/defaults';
import { ESTIMATE_FOODS } from '../data/estimateFoods';
import { FOODS } from '../data/foods';
import { isCatalogId } from '../data/supplementCatalogIds';
import { buildDemo } from '../demo/seed';
import { isHHMM, isISODate, nowMinutes, todayISO, weekdayOf } from '../engine/dates';
import { MAX_SURPLUS_KCAL, MAX_DEFICIT_KCAL, clampKcalCorrection, goalDeltaOf } from '../engine/energy';
import { ITEM_GRAMS_MAX, ITEM_GRAMS_MIN, ITEM_LABEL_MAX, MAX_MEAL_ITEMS, estimatedItemsValues, normalizeEstimatedItem, validPer100g } from '../engine/estimate';
import { planTodayISO } from '../engine/sleep';
import { applyPatch, beforeOf, dueApprovals, entersPlanAtApproval, isPendingApproval, isSuperseded, pendingApprovals, projectedState } from '../engine/plan/proposals';
import { IMPACT_PAIN_THRESHOLD, isLowerLegSite } from '../engine/training';
import { normalizeWork } from '../engine/work';
import { uid } from '../lib/id';

// ───────────────────────── Storage sicuro ─────────────────────────

/**
 * In anteprima o in navigazione privata localStorage può mancare: si ripiega sulla memoria, senza avvisi.
 * Se invece lo spazio è finito (QuotaExceededError) l'utente lo deve sapere: quello che segna dopo
 * resterebbe solo in memoria e andrebbe perso alla chiusura. Un avviso, una volta per sessione.
 */
const memory = new Map<string, string>();
let quotaWarned = false;

function isQuotaError(e: unknown): boolean {
  if (!(e instanceof Error) && !(typeof DOMException !== 'undefined' && e instanceof DOMException)) return false;
  const err = e as DOMException;
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014;
}

function warnQuota() {
  if (quotaWarned) return;
  quotaWarned = true;
  setTimeout(() => {
    try {
      useUi
        .getState()
        .toast('Spazio del telefono pieno: esporta un backup, togli le foto vecchie dalla chat e i piatti che non usi', 'bad', {
          durationMs: 9000,
        });
    } catch {
      /* interfaccia non ancora pronta */
    }
  }, 0);
}

/** True se l'ultima scrittura su localStorage non è riuscita per spazio esaurito. */
export function storageFull(): boolean {
  return quotaWarned;
}

/** Lettura sincrona di una chiave: localStorage, altrimenti la copia in memoria. */
function readStored(k: string): string | null {
  try {
    const v = globalThis.localStorage?.getItem(k);
    if (v !== null && v !== undefined) return v;
  } catch {
    /* non disponibile */
  }
  return memory.get(k) ?? null;
}

export const safeStorage: StateStorage = {
  getItem: (k) => readStored(k),
  setItem: (k, v) => {
    memory.set(k, v);
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch (e) {
      // Storage bloccato: resta in memoria in silenzio. Spazio finito: avvisa.
      if (isQuotaError(e)) warnQuota();
    }
  },
  removeItem: (k) => {
    memory.delete(k);
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {
      /* ignora */
    }
  },
};

/** Copia dei dati dell'utente salvata prima di caricare i dati di esempio. */
const PRE_DEMO_KEY = 'ritmo:pre-demo';

// ───────────────────────── Normalizzazione e migrazione ─────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Diario vuoto per la data (non viene scritto nello stato). */
export function emptyDayLog(date: ISODate): DayLog {
  return { date, status: {}, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {} };
}

// Ogni sezione si ripara da sola: un backup valido nella forma ma rovinato in un punto non deve mai rendere
// l'app inutilizzabile. I campi sconosciuti restano (compatibilità con i campi facoltativi aggiunti al
// contratto), quelli noti tornano del tipo giusto o prendono il valore predefinito.

const ITEM_STATUSES = new Set<string>(['fatto', 'sostituito', 'saltato']);
const MEAL_SLOT_SET = new Set<string>(['colazione', 'spuntino', 'pranzo', 'merenda', 'cena']);
const DAY_TYPE_SET = new Set<string>(['calcio', 'palestra', 'leggero', 'riposo']);
const FOOTBALL_KINDS = new Set<string>(['partita', 'calcetto', 'allenamento']);
const GOALS = new Set<string>(['ricomposizione', 'dimagrimento', 'massa', 'mantenimento']);
const THEMES = new Set<string>(['sistema', 'scuro', 'chiaro']);
const TIMINGS = new Set<string>(['colazione', 'pranzo', 'cena', 'sera']);
// Fase 2
const MEAL_SOURCES = new Set<string>(['bar', 'foto', 'piatto']);
const OIL_CHOICES = new Set<string>(['niente', 'filo', 'cucchiaio', 'due-cucchiai']);
const PORTIONS = new Set<number>([0.5, 1, 1.5]);
const EXCLUSION_ORIGINS = new Set<string>(['non-mi-piace', 'cambi-ripetuti', 'impostazioni']);
const QUALITIES = new Set<string>(['forza', 'potenza', 'rapidita', 'velocita', 'resistenza', 'ipertrofia', 'prevenzione', 'rientro']);
/** Qualità d'impatto: non si accoppiano con il rientro di una zona sotto il ginocchio o dei flessori (§ 2.3). */
const IMPACT_QUALITIES = new Set<string>(['potenza', 'rapidita', 'velocita']);
const SPACES = new Set<string>(['corsia', 'campo', 'casa']);
const PHASES = new Set<string>(['stagione', 'pausa', 'precampionato']);
const STAGES = new Set<string>(['stagione', 'transizione', 'sviluppo', 'generale', 'specifico', 'rifinitura']);
const WEEK_KINDS = new Set<string>(['carico', 'scarico', 'rifinitura']);
const OVERRIDE_KINDS = new Set<string>(['scarico', 'leggera']);
const CHANGE_KINDS = new Set<string>(['blocco', 'menu', 'obiettivi', 'ritorno']);
const PROPOSAL_STATUSES = new Set<string>(['aperta', 'approvata', 'scartata', 'superata']);
const DIFF_AREAS = new Set<string>(['pasto', 'spesa', 'seduta', 'esercizio', 'settimana', 'carico', 'obiettivo', 'calorie']);
const COACH_STATUSES = new Set<string>(['in-corso', 'fatto', 'errore']);
const VERDICTS = new Set<string>(['avanza', 'consolida', 'alleggerisci', 'meno-ma-fatto', 'rientro']);
const DOSE_UNITS = new Set<string>(['µg', 'mg', 'g', 'mL', 'UFC', 'mg/kg', 'compressa', 'bustina', 'dose']);
const LABEL_UNITS = new Set<string>(['µg', 'mg', 'g', 'UI', 'UFC', 'mL', 'mmol']);
const SCHEDULES = new Set<string>(['giornaliero', 'giorni-alterni', 'con-la-seduta', 'periodi']);
const DOSE_PER = new Set<string>(['giorno', 'settimana', 'mese']);
const WORKOUT_WHEN = new Set<string>(['prima', 'dopo', 'durante']);
const SUPPLEMENT_REASONS = new Set<string>(['mantenimento', 'prescrizione', 'carenza', 'sport', 'periodo']);
const CERTIFICATIONS = new Set<string>(['informed-sport', 'informed-choice', 'koelner-liste', 'altra']);
const SMOKER = new Set<string>(['mai', 'ex', 'si']);
const VARIANTS = new Set<string>(['piena', 'ridotta', 'minima']);
const ALCOHOL_UNITS = new Set<string>(['0', '1-3', '4-7', '8+']);
/** Zone dei flessori della coscia (come `SITE_CATEGORIES` in engine/training.ts). */
const HAMSTRING_RE = /flessor|femoral|ischio/i;

/** Numero finito (anche da stringa numerica), altrimenti il ripiego. */
const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const optNum = (v: unknown): number | undefined => {
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const hhmmOr = (v: unknown, fallback: string): string => (isHHMM(v) ? v : fallback);
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const numRecord = (v: unknown): Record<string, number> => {
  if (!isObj(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v)) {
    const n = typeof x === 'boolean' || x === null ? undefined : optNum(x);
    if (n !== undefined) out[k] = n;
  }
  return out;
};
const strRecord = (v: unknown, keep?: (k: string) => boolean): Record<string, string> => {
  if (!isObj(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) if (typeof x === 'string' && (!keep || keep(k))) out[k] = x;
  return out;
};
/** Toglie le chiavi con valore undefined (i campi facoltativi assenti restano assenti). */
const compact = <T extends object>(o: T): T => {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
};
const clampN = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** Numero finito (non booleano né null), anche da testo; altrimenti undefined. */
const finiteNum = (v: unknown): number | undefined => (typeof v === 'boolean' || v === null ? undefined : optNum(v));
/** Testo non vuoto, senza spazi ai lati; altrimenti undefined. */
const nonEmpty = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
/** Testo su una riga (a capo e spazi ripetuti diventano uno spazio), al massimo `max` caratteri. */
const oneLine = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';
const unique = <T,>(xs: T[]): T[] => [...new Set(xs)];
const optEnum = <T extends string>(set: Set<string>, v: unknown): T | undefined =>
  typeof v === 'string' && set.has(v) ? (v as T) : undefined;
const isMonday = (v: unknown): v is ISODate => isISODate(v) && weekdayOf(v) === 0;

function normalizeTargets(raw: unknown, base: Plan['targets']): Plan['targets'] {
  const out = { ...base };
  if (!isObj(raw)) return out;
  for (const t of Object.keys(DEFAULT_TARGETS) as DayType[]) {
    const v = raw[t];
    if (!isObj(v)) continue;
    const b = base[t];
    out[t] = {
      ...(v as Partial<MacroTarget>),
      kcal: Math.max(0, num(v.kcal, b.kcal)),
      proteinG: Math.max(0, num(v.proteinG, b.proteinG)),
      fatG: Math.max(0, num(v.fatG, b.fatG)),
      carbG: Math.max(0, num(v.carbG, b.carbG)),
      fiberG: Math.max(0, num(v.fiberG, b.fiberG)),
    };
  }
  return out;
}

function normalizeScheduleDay(src: Record<string, unknown>, d: ScheduleDay, i: Weekday): ScheduleDay {
  const f = src.football;
  const football =
    isObj(f) && FOOTBALL_KINDS.has(str(f.kind, ''))
      ? { ...f, kind: f.kind as FootballEvent['kind'], time: hhmmOr(f.time, '21:00'), durationMin: clampN(num(f.durationMin, 90), 0, 300) }
      : undefined;
  return compact({
    ...(src as Partial<ScheduleDay>),
    weekday: i,
    dayType: DAY_TYPE_SET.has(str(src.dayType, '')) ? (src.dayType as DayType) : d.dayType,
    football,
    gymSessionId: optStr(src.gymSessionId) || undefined,
    gymTime: isHHMM(src.gymTime) ? src.gymTime : undefined,
    gymOptional: src.gymOptional === true ? true : undefined,
    physio: src.physio === true ? true : undefined,
    // Orario di lavoro: blocchi validi, in ordine, sovrapposti uniti, al massimo 4; vuoto = campo tolto.
    work: normalizeWork(src.work),
  } as ScheduleDay);
}

/** Settimana tipo di 7 giorni da un elenco qualunque: i giorni mancanti o illeggibili prendono quelli di `base`. */
function weekFrom(raw: unknown, base: ScheduleDay[]): ScheduleDay[] {
  const list = Array.isArray(raw) ? raw : [];
  return base.map((d, i) => {
    const src = list.find((w) => isObj(w) && w.weekday === i) ?? list[i];
    return isObj(src) ? normalizeScheduleDay(src, d, i as Weekday) : d;
  });
}

function normalizePlan(raw: unknown, fallbackStart: ISODate): Plan {
  const base = defaultPlan(fallbackStart);
  if (!isObj(raw)) return base;
  const p = raw as Record<string, unknown>;
  const week: ScheduleDay[] = weekFrom(p.week, base.week);
  const sleepRaw = isObj(p.sleep) ? p.sleep : {};
  const mealRaw = isObj(p.mealTimes) ? p.mealTimes : {};
  const supplements = Array.isArray(p.supplements)
    ? p.supplements
        .filter((x): x is Record<string, unknown> => isObj(x) && typeof x.id === 'string' && typeof x.name === 'string')
        .map(normalizeSupplement)
    : base.supplements;
  const startDate = isISODate(p.startDate) ? p.startDate : base.startDate;
  return compact({
    ...(p as Partial<Plan>),
    targets: normalizeTargets(p.targets, base.targets),
    week,
    supplements,
    sleep: {
      ...(sleepRaw as Partial<Plan['sleep']>),
      wake: hhmmOr(sleepRaw.wake, base.sleep.wake),
      current: hhmmOr(sleepRaw.current, base.sleep.current),
      target: hhmmOr(sleepRaw.target, base.sleep.target),
      stepMin: clampN(num(sleepRaw.stepMin, base.sleep.stepMin), 5, 60),
      curfewLeadMin: clampN(num(sleepRaw.curfewLeadMin, base.sleep.curfewLeadMin), 0, 180),
    },
    mealTimes: {
      ...(mealRaw as Partial<Plan['mealTimes']>),
      colazione: hhmmOr(mealRaw.colazione, base.mealTimes.colazione),
      spuntino: hhmmOr(mealRaw.spuntino, base.mealTimes.spuntino),
      pranzo: hhmmOr(mealRaw.pranzo, base.mealTimes.pranzo),
      merenda: hhmmOr(mealRaw.merenda, base.mealTimes.merenda),
      cena: hhmmOr(mealRaw.cena, base.mealTimes.cena),
    },
    sweetsPerWeek: clampN(Math.round(num(p.sweetsPerWeek, base.sweetsPerWeek)), 0, 21),
    painThreshold: clampN(num(p.painThreshold, base.painThreshold), 0, 10),
    impactThreshold: normalizeImpactThreshold(p.impactThreshold),
    startDate,
    // Fase 2: ogni campo resta solo se valido, altrimenti sparisce e vale l'app di prima.
    exclusions: normalizeExclusions(p.exclusions),
    tasteAsked: normalizeDateRecord(p.tasteAsked),
    training: normalizeTraining(p.training, startDate),
    season: normalizeSeason(p.season),
    seasonWeek: Array.isArray(p.seasonWeek) ? weekFrom(p.seasonWeek, DEFAULT_WEEK) : undefined,
    program: normalizeProgram(p.program),
    weekOverrides: normalizeWeekOverrides(p.weekOverrides),
    menus: normalizeMenus(p.menus),
    goalDeltaKcal: normalizeGoalDelta(p.goalDeltaKcal),
    coffeePerDay: normalizeCoffee(p.coffeePerDay),
    impactHold: normalizeImpactHold(p.impactHold, startDate),
  });
}

/**
 * Un integratore: i campi della fase 1 come prima; quelli del catalogo restano solo se validi (§ 9.7), uno per uno.
 * Senza `catalogId` valido l'integratore è «scritto a mano», come quelli di prima.
 */
function normalizeSupplement(x: Record<string, unknown>): Supplement {
  return compact({
    ...(x as Partial<Supplement>),
    id: x.id as string,
    name: x.name as string,
    dose: str(x.dose, ''),
    timing: TIMINGS.has(str(x.timing, '')) ? (x.timing as Supplement['timing']) : 'colazione',
    note: optStr(x.note),
    active: x.active !== false,
    catalogId: isCatalogId(x.catalogId) ? x.catalogId : undefined,
    amount: normalizeDoseAmount(x.amount),
    product: normalizeProduct(x.product),
    schedule: optEnum<NonNullable<Supplement['schedule']>>(SCHEDULES, x.schedule),
    period: normalizePeriod(x.period),
    slot: optEnum<MealSlot>(MEAL_SLOT_SET, x.slot),
    workout: normalizeSupplementWorkout(x.workout),
    dosesPerDay: positiveInt(x.dosesPerDay, 8),
    reason: optEnum<NonNullable<Supplement['reason']>>(SUPPLEMENT_REASONS, x.reason),
    test: normalizeSupplementTest(x.test),
    reviewAt: isISODate(x.reviewAt) ? x.reviewAt : undefined,
    acknowledged: Array.isArray(x.acknowledged) ? orUndefined(unique(strArray(x.acknowledged).filter((c) => c.trim()))) : undefined,
    catalogVersion: positiveInt(x.catalogVersion, 10_000),
  } as Supplement);
}

/** Intero tra 1 e `max` (anche da testo); altrimenti undefined. */
function positiveInt(v: unknown, max: number): number | undefined {
  const n = finiteNum(v);
  return n !== undefined && Number.isInteger(n) && n >= 1 && n <= max ? n : undefined;
}

/** Un elenco vuoto diventa undefined (il campo facoltativo sparisce). */
const orUndefined = <T,>(xs: T[]): T[] | undefined => (xs.length ? xs : undefined);

function normalizeDoseAmount(raw: unknown): Supplement['amount'] {
  if (!isObj(raw)) return undefined;
  const amount = finiteNum(raw.amount);
  if (amount === undefined || !(amount > 0) || !DOSE_UNITS.has(str(raw.unit, ''))) return undefined;
  return compact({ amount, unit: raw.unit as DoseUnit, per: optEnum<'giorno' | 'settimana' | 'mese'>(DOSE_PER, raw.per) });
}

function normalizeComponent(raw: unknown): SupplementComponent | null {
  if (!isObj(raw)) return null;
  const name = oneLine(raw.name, 120);
  const amount = finiteNum(raw.amount);
  if (!name || amount === undefined || !(amount > 0) || !LABEL_UNITS.has(str(raw.unit, ''))) return null;
  return compact({
    ...(raw as Partial<SupplementComponent>),
    catalogId: isCatalogId(raw.catalogId) ? raw.catalogId : undefined,
    name,
    form: nonEmpty(raw.form),
    amount,
    unit: raw.unit as LabelUnit,
  } as SupplementComponent);
}

/** Composizione di un prodotto: almeno un componente valido, origine e data di lettura; altrimenti sparisce. */
function normalizeProduct(raw: unknown): SupplementProduct | undefined {
  if (!isObj(raw) || !Array.isArray(raw.components)) return undefined;
  const components = raw.components.map(normalizeComponent).filter((c): c is SupplementComponent => c !== null);
  if (!components.length || (raw.source !== 'etichetta' && raw.source !== 'stima') || !isISODate(raw.readAt)) return undefined;
  const certs = Array.isArray(raw.certifications) ? unique(strArray(raw.certifications).filter((c) => CERTIFICATIONS.has(c))) : [];
  return compact({
    ...(raw as Partial<SupplementProduct>),
    label: nonEmpty(raw.label),
    servingText: nonEmpty(raw.servingText),
    components,
    source: raw.source,
    readAt: raw.readAt,
    labelWarnings: Array.isArray(raw.labelWarnings) ? orUndefined(strArray(raw.labelWarnings)) : undefined,
    certifications: orUndefined(certs) as SupplementProduct['certifications'],
  } as SupplementProduct);
}

function normalizePeriod(raw: unknown): Supplement['period'] {
  if (!isObj(raw) || !isISODate(raw.from) || !isISODate(raw.to) || raw.from > raw.to) return undefined;
  return { from: raw.from, to: raw.to };
}

function normalizeSupplementWorkout(raw: unknown): Supplement['workout'] {
  if (!isObj(raw) || !WORKOUT_WHEN.has(str(raw.when, ''))) return undefined;
  const minutes = finiteNum(raw.minutes);
  if (minutes === undefined) return undefined;
  return { when: raw.when as 'prima' | 'dopo' | 'durante', minutes: clampN(Math.round(minutes), 0, 240) };
}

function normalizeSupplementTest(raw: unknown): Supplement['test'] {
  if (!isObj(raw)) return undefined;
  const exam = nonEmpty(raw.exam);
  if (!exam || !isISODate(raw.date)) return undefined;
  return compact({ exam, date: raw.date, value: finiteNum(raw.value), unit: nonEmpty(raw.unit) });
}

/** Esclusioni: una per alimento (la prima), con `since` valida; senza nessuna il campo sparisce. */
function normalizeExclusions(raw: unknown): FoodExclusion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: FoodExclusion[] = [];
  for (const e of raw) {
    if (!isObj(e)) continue;
    const foodId = nonEmpty(e.foodId);
    if (!foodId || seen.has(foodId) || !isISODate(e.since)) continue;
    seen.add(foodId);
    out.push({
      ...(e as Partial<FoodExclusion>),
      foodId,
      since: e.since,
      origin: optEnum<FoodExclusion['origin']>(EXCLUSION_ORIGINS, e.origin) ?? 'impostazioni',
    });
  }
  return orUndefined(out);
}

/** Record con valori data (es. `tasteAsked`): chiavi non vuote e date valide. */
function normalizeDateRecord(raw: unknown): Record<string, ISODate> | undefined {
  if (!isObj(raw)) return undefined;
  const out: Record<string, ISODate> = {};
  for (const [k, v] of Object.entries(raw)) if (k.trim() && isISODate(v)) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

function normalizeReturnPlan(raw: unknown, fallbackSince?: ISODate): ReturnPlan | undefined {
  if (!isObj(raw)) return undefined;
  const site = nonEmpty(raw.site);
  const stage = finiteNum(raw.stage);
  const since = isISODate(raw.since) ? raw.since : fallbackSince;
  if (!site || stage === undefined || !since) return undefined;
  return compact({
    ...(raw as Partial<ReturnPlan>),
    site,
    stage: clampN(Math.round(stage), 0, 4) as ReturnPlan['stage'],
    since,
    physioOk: raw.physioOk === true ? true : undefined,
  } as ReturnPlan);
}

/**
 * Obiettivo di allenamento (livello 2): qualità ammesse, secondaria diversa dalla principale, coppie vietate tolte
 * (potenza, rapidità o velocità con il rientro di una zona sotto il ginocchio o dei flessori: resta il rientro). La
 * coppia ipertrofia e resistenza dipende dalla fase e la toglie `buildBlock`. Senza principale valida il campo sparisce.
 */
export function normalizeTraining(raw: unknown, fallbackSince?: ISODate): TrainingGoal | undefined {
  if (!isObj(raw) || !QUALITIES.has(str(raw.primary, ''))) return undefined;
  let primary = raw.primary as TrainingQuality;
  let secondary = optEnum<TrainingQuality>(QUALITIES, raw.secondary);
  if (secondary === primary) secondary = undefined;
  let presetId = nonEmpty(raw.presetId);
  const rientro = normalizeReturnPlan(raw.rientro, fallbackSince);
  const fragile = rientro !== undefined && (isLowerLegSite(rientro.site) || HAMSTRING_RE.test(rientro.site));
  if (fragile && primary === 'rientro' && secondary && IMPACT_QUALITIES.has(secondary)) {
    secondary = undefined;
    presetId = undefined;
  } else if (fragile && secondary === 'rientro' && IMPACT_QUALITIES.has(primary)) {
    primary = 'rientro';
    secondary = undefined;
    presetId = undefined;
  }
  const minutes = finiteNum(raw.sessionMin);
  const gym = finiteNum(raw.gymPerWeek);
  const spaces = Array.isArray(raw.spaces) ? unique(strArray(raw.spaces).filter((x) => SPACES.has(x))) : [];
  return compact({
    ...(raw as Partial<TrainingGoal>),
    presetId,
    primary,
    secondary,
    rientro,
    sessionMin: minutes === undefined ? undefined : clampN(Math.round(minutes), 30, 90),
    gymPerWeek: gym === undefined ? undefined : clampN(Math.round(gym), 1, 3),
    spaces: orUndefined(spaces) as TrainingGoal['spaces'],
  } as TrainingGoal);
}

function normalizeSeason(raw: unknown): SeasonCalendar | undefined {
  if (!isObj(raw)) return undefined;
  const weeks = finiteNum(raw.preseasonWeeks);
  const out = compact({
    ...(raw as Partial<SeasonCalendar>),
    lastMatch: isISODate(raw.lastMatch) ? raw.lastMatch : undefined,
    firstMatch: isISODate(raw.firstMatch) ? raw.firstMatch : undefined,
    preseasonWeeks: weeks === undefined ? undefined : clampN(Math.round(weeks), 3, 8),
  } as SeasonCalendar);
  return out.lastMatch || out.firstMatch || out.preseasonWeeks !== undefined ? out : undefined;
}

function normalizeWeekOverrides(raw: unknown): Plan['weekOverrides'] {
  if (!isObj(raw)) return undefined;
  const out: NonNullable<Plan['weekOverrides']> = {};
  for (const [k, v] of Object.entries(raw)) if (isMonday(k) && OVERRIDE_KINDS.has(str(v, ''))) out[k] = v as 'scarico' | 'leggera';
  return Object.keys(out).length ? out : undefined;
}

/** Differenza dell'obiettivo del corpo: tra −500 e +500 kcal, altrimenti sparisce. */
function normalizeGoalDelta(raw: unknown): number | undefined {
  const n = finiteNum(raw);
  return n === undefined ? undefined : clampN(n, -MAX_DEFICIT_KCAL, MAX_SURPLUS_KCAL);
}

function normalizeCoffee(raw: unknown): number | undefined {
  const n = finiteNum(raw);
  return n === undefined || n < 0 ? undefined : clampN(Math.round(n), 0, 20);
}

/**
 * Fermo degli impatti: con un sito non vuoto resta; una `since` non valida diventa l'inizio del piano. Nel dubbio un
 * fermo di sicurezza non si toglie.
 */
function normalizeImpactHold(raw: unknown, startDate: ISODate): Plan['impactHold'] {
  if (!isObj(raw)) return undefined;
  const site = nonEmpty(raw.site);
  if (!site) return undefined;
  return { ...(raw as object), site, since: isISODate(raw.since) ? raw.since : startDate };
}

function normalizePrepTask(raw: unknown): PrepTask | null {
  if (!isObj(raw)) return null;
  const id = nonEmpty(raw.id);
  const minutes = finiteNum(raw.minutes);
  if (!id || typeof raw.title !== 'string' || minutes === undefined) return null;
  return compact({
    ...(raw as Partial<PrepTask>),
    id,
    title: raw.title,
    minutes: Math.max(0, minutes),
    yields: str(raw.yields, ''),
    recipeIds: Array.isArray(raw.recipeIds) ? strArray(raw.recipeIds) : undefined,
  } as PrepTask);
}

/** Settimana di menù: 7 giorni con gli id delle ricette per pasto; altrimenti null. */
function normalizeMenuWeek(raw: unknown): MenuWeek | null {
  if (!isObj(raw) || !Array.isArray(raw.days) || raw.days.length !== 7 || !raw.days.every(isObj)) return null;
  return {
    ...(raw as Partial<MenuWeek>),
    days: (raw.days as Record<string, unknown>[]).map((d) => ({ ...d, meals: strRecord(d.meals, (slot) => MEAL_SLOT_SET.has(slot)) })),
    prep: Array.isArray(raw.prep) ? raw.prep.map(normalizePrepTask).filter((t): t is PrepTask => t !== null) : [],
  };
}

/** Menù approvati per lunedì: solo lunedì validi e settimane leggibili, le 52 più recenti. */
export const MENUS_KEPT = 52;
function normalizeMenus(raw: unknown): Plan['menus'] {
  if (!isObj(raw)) return undefined;
  const valid: [ISODate, MenuWeek][] = [];
  for (const k of Object.keys(raw).filter((x) => isMonday(x)).sort()) {
    const w = normalizeMenuWeek(raw[k]);
    if (w) valid.push([k, w]);
  }
  return valid.length ? Object.fromEntries(valid.slice(-MENUS_KEPT)) : undefined;
}

function normalizeSessionExercise(raw: unknown): SessionExercise | null {
  if (!isObj(raw) || typeof raw.exerciseId !== 'string' || !raw.exerciseId) return null;
  const sets = finiteNum(raw.sets);
  const repMin = finiteNum(raw.repMin);
  const restSec = finiteNum(raw.restSec);
  if (sets === undefined || repMin === undefined || restSec === undefined) return null;
  if (raw.unit !== 'reps' && raw.unit !== 'secondi') return null;
  if (raw.progression !== 'doppia' && raw.progression !== 'nessuna') return null;
  const repMax = finiteNum(raw.repMax);
  const pos = (v: unknown) => {
    const n = finiteNum(v);
    return n !== undefined && n >= 0 ? n : undefined;
  };
  return compact({
    ...(raw as Partial<SessionExercise>),
    exerciseId: raw.exerciseId,
    sets: clampN(Math.round(sets), 1, 20),
    repMin: Math.max(0, repMin),
    repMax: Math.max(Math.max(0, repMin), repMax ?? repMin),
    unit: raw.unit,
    rir: finiteNum(raw.rir),
    restSec: Math.max(0, restSec),
    progression: raw.progression,
    incrementKg: pos(raw.incrementKg),
    perSide: raw.perSide === true ? true : undefined,
    note: optStr(raw.note),
    distanceM: pos(raw.distanceM),
    workSec: pos(raw.workSec),
    effort: nonEmpty(raw.effort),
    contactsPerRep: pos(raw.contactsPerRep),
  } as SessionExercise);
}

/** Seduta nella forma di `WorkoutSession`; null se manca un campo obbligatorio o un esercizio non si legge. */
function normalizeSession(raw: unknown): WorkoutSession | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !Array.isArray(raw.blocks)) return null;
  const blocks: WorkoutBlock[] = [];
  for (const b of raw.blocks) {
    if (!isObj(b) || typeof b.title !== 'string' || !Array.isArray(b.items)) return null;
    const items = b.items.map(normalizeSessionExercise);
    if (items.some((x) => x === null)) return null;
    blocks.push({ ...(b as Partial<WorkoutBlock>), title: b.title, items: items as SessionExercise[] });
  }
  return {
    ...(raw as Partial<WorkoutSession>),
    id: raw.id,
    name: raw.name,
    subtitle: str(raw.subtitle, ''),
    estMin: Math.max(0, num(raw.estMin, 0)),
    focus: str(raw.focus, ''),
    blocks,
  };
}

const isStr = (v: unknown): v is string => typeof v === 'string';

/** Ritocco del coach a una seduta, se ha la forma di uno dei quattro `PlanEdit`. */
function normalizePlanEdit(raw: unknown): PlanEdit | null {
  if (!isObj(raw) || !isStr(raw.slot)) return null;
  const week = finiteNum(raw.week);
  const w = week !== undefined && Number.isInteger(week) && week >= 1 ? week : undefined;
  switch (raw.op) {
    case 'sostituisci':
      return isStr(raw.exerciseId) && isStr(raw.with) && isStr(raw.reason)
        ? compact<PlanEdit>({ op: 'sostituisci', slot: raw.slot, week: w, exerciseId: raw.exerciseId, with: raw.with, reason: raw.reason })
        : null;
    case 'serie': {
      const sets = finiteNum(raw.sets);
      return isStr(raw.exerciseId) && isStr(raw.reason) && sets !== undefined && Number.isInteger(sets) && sets >= 0
        ? compact<PlanEdit>({ op: 'serie', slot: raw.slot, week: w, exerciseId: raw.exerciseId, sets, reason: raw.reason })
        : null;
    }
    case 'ordine':
      return Array.isArray(raw.order) && isStr(raw.reason) ? { op: 'ordine', slot: raw.slot, order: strArray(raw.order), reason: raw.reason } : null;
    case 'nota':
      return isStr(raw.exerciseId) && isStr(raw.note) ? { op: 'nota', slot: raw.slot, exerciseId: raw.exerciseId, note: raw.note } : null;
    default:
      return null;
  }
}

function normalizeMenuEdit(raw: unknown): MenuEdit | null {
  if (!isObj(raw)) return null;
  const day = finiteNum(raw.day);
  if (day === undefined || !Number.isInteger(day) || day < 0 || day > 6) return null;
  if (!MEAL_SLOT_SET.has(str(raw.slot, '')) || !isStr(raw.recipeId) || !isStr(raw.reason)) return null;
  return { day: day as Weekday, slot: raw.slot as MealSlot, recipeId: raw.recipeId, reason: raw.reason };
}

const normalizeAnyEdit = (raw: unknown): PlanEdit | MenuEdit | null =>
  isObj(raw) && 'op' in raw ? normalizePlanEdit(raw) : normalizeMenuEdit(raw);

function normalizeWeekDose(raw: unknown): WeekDose | null {
  if (!isObj(raw)) return null;
  const mainSetsAdd = finiteNum(raw.mainSetsAdd);
  const setsFactor = finiteNum(raw.setsFactor);
  const rirDelta = finiteNum(raw.rirDelta);
  const impactFactor = finiteNum(raw.impactFactor);
  if (mainSetsAdd === undefined || setsFactor === undefined || rirDelta === undefined || impactFactor === undefined) return null;
  if (!(setsFactor > 0) || impactFactor < 0) return null;
  return { ...(raw as Partial<WeekDose>), mainSetsAdd, setsFactor, rirDelta, impactFactor };
}

/**
 * Blocco in vigore: forma di `WorkoutSession` per ogni seduta, `weeks` e `dose` della stessa lunghezza (da 1 a 8).
 * Altrimenti il campo sparisce e tornano le sedute fisse.
 */
export function normalizeProgram(raw: unknown): Program | undefined {
  if (!isObj(raw)) return undefined;
  const blockId = nonEmpty(raw.blockId);
  if (!blockId || !isISODate(raw.start) || !Array.isArray(raw.weeks) || !Array.isArray(raw.dose)) return undefined;
  if (raw.weeks.length < 1 || raw.weeks.length > 8 || raw.dose.length !== raw.weeks.length) return undefined;
  if (!raw.weeks.every((w) => WEEK_KINDS.has(str(w, '')))) return undefined;
  const dose = raw.dose.map(normalizeWeekDose);
  if (dose.some((d) => d === null)) return undefined;
  if (!PHASES.has(str(raw.phase, '')) || !STAGES.has(str(raw.stage, '')) || !QUALITIES.has(str(raw.primary, ''))) return undefined;
  if (!isObj(raw.sessions) || !Object.keys(raw.sessions).length) return undefined;
  const sessions: Record<string, WorkoutSession> = {};
  for (const [slot, sess] of Object.entries(raw.sessions)) {
    const n = normalizeSession(sess);
    if (!n) return undefined;
    sessions[slot] = n;
  }
  const edits = Array.isArray(raw.edits) ? raw.edits.map(normalizePlanEdit).filter((e): e is PlanEdit => e !== null) : [];
  const secondary = optEnum<TrainingQuality>(QUALITIES, raw.secondary);
  return compact({
    ...(raw as Partial<Program>),
    blockId,
    start: raw.start,
    weeks: raw.weeks as BlockWeekKind[],
    dose: dose as WeekDose[],
    phase: raw.phase as Program['phase'],
    stage: raw.stage as Program['stage'],
    primary: raw.primary as TrainingQuality,
    secondary: secondary === raw.primary ? undefined : secondary,
    sessions,
    edits: orUndefined(edits),
  } as Program);
}

/**
 * Soglia per gli impatti (facoltativa): un numero da 0 a 10, anche scritto come testo ("2,5"), al mezzo punto come
 * la scala del dolore; altrimenti il campo sparisce e vale il predefinito min(soglia, 2). Anche 2 toglie il campo:
 * min(2, soglia) coincide sempre con il predefinito (`IMPACT_PAIN_THRESHOLD`), come fa lo stepper delle impostazioni.
 */
export function normalizeImpactThreshold(raw: unknown): number | undefined {
  if (raw === null || typeof raw === 'boolean') return undefined;
  const n = optNum(raw);
  if (n === undefined) return undefined;
  const v = clampN(Math.round(n * 2) / 2, 0, 10);
  return v === IMPACT_PAIN_THRESHOLD ? undefined : v;
}

function normalizeProfile(raw: unknown): Profile {
  const p = isObj(raw) ? raw : {};
  const b = DEFAULT_PROFILE;
  return compact({
    ...(p as Partial<Profile>),
    name: optStr(p.name),
    sex: p.sex === 'F' ? 'F' : 'M',
    birthYear: Math.max(0, Math.round(num(p.birthYear, b.birthYear))),
    heightCm: Math.max(0, num(p.heightCm, b.heightCm)),
    startWeightKg: Math.max(0, num(p.startWeightKg, b.startWeightKg)),
    goal: GOALS.has(str(p.goal, '')) ? (p.goal as Profile['goal']) : b.goal,
    expertise: optStr(p.expertise),
    painSites: strArray(p.painSites).filter((x) => x.trim() !== ''),
    painTests: normalizePainTests(p.painTests),
    waterTargetL: clampN(num(p.waterTargetL, b.waterTargetL), 0.5, 8),
    smoker: optEnum<NonNullable<Profile['smoker']>>(SMOKER, p.smoker),
  } as Profile);
}

/** Gesti di prova per zona: solo testi non vuoti; senza nessuno il campo sparisce. */
function normalizePainTests(raw: unknown): Profile['painTests'] {
  if (!isObj(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [site, text] of Object.entries(raw)) if (typeof text === 'string' && text.trim()) out[site] = text.trim();
  return Object.keys(out).length ? out : undefined;
}

/** Tetti dei valori di un ordine al bar: oltre, il dato è rovinato (un pasto, non una giornata). */
const BAR_MEAL_MAX = { kcal: 3000, grams: 300, veg: 10, label: 120 };

/** Limiti e forma compatta degli alimenti dei pasti stimati (§ 7.3): stanno in engine/estimate.ts. */
export { ITEM_GRAMS_MAX, ITEM_GRAMS_MIN, ITEM_LABEL_MAX, MAX_MEAL_ITEMS, estimatedItemsValues, normalizeEstimatedItem, validPer100g };

/**
 * Un pasto mangiato con valori stimati (bar, foto, piatto salvato): etichetta non vuota su una riga e valori numerici
 * (anche da testo), tra 0 e un tetto da pasto (3.000 kcal, 300 g per macro). I campi della fase 2 restano solo se validi:
 * alimenti (al massimo 12), olio, provenienza, `asPlanned`, piatto, porzione. Null se illeggibile (manca l'etichetta o
 * le kcal).
 */
export function normalizeEatenMeal(raw: unknown): EatenMeal | null {
  if (!isObj(raw)) return null;
  // Etichetta su una riga: a capo e spazi ripetuti di un backup scritto a mano diventano uno spazio.
  const label = oneLine(raw.label, BAR_MEAL_MAX.label);
  const n = isObj(raw.nutrients) ? raw.nutrients : null;
  if (!label || !n) return null;
  const kcal = optNum(n.kcal);
  if (kcal === undefined || kcal < 0) return null;
  const grams = (v: unknown) => clampN(num(typeof v === 'boolean' ? NaN : v, 0), 0, BAR_MEAL_MAX.grams);
  const nutrients: Nutrients = {
    kcal: clampN(kcal, 0, BAR_MEAL_MAX.kcal),
    proteinG: grams(n.proteinG),
    carbG: grams(n.carbG),
    fatG: grams(n.fatG),
    fiberG: grams(n.fiberG),
  };
  const veg = optNum(raw.vegPortions);
  const items = Array.isArray(raw.items)
    ? raw.items
        .map(normalizeEstimatedItem)
        .filter((x): x is EstimatedItem => x !== null)
        .slice(0, MAX_MEAL_ITEMS)
    : [];
  const portion = finiteNum(raw.portion);
  return compact({
    ...(raw as Partial<EatenMeal>),
    label,
    nutrients: { ...(n as Partial<Nutrients>), ...nutrients },
    vegPortions: veg === undefined || veg < 0 ? undefined : clampN(veg, 0, BAR_MEAL_MAX.veg),
    source: optEnum<NonNullable<EatenMeal['source']>>(MEAL_SOURCES, raw.source),
    items: orUndefined(items),
    oil: optEnum<NonNullable<EatenMeal['oil']>>(OIL_CHOICES, raw.oil),
    asPlanned: raw.asPlanned === true ? true : undefined,
    dishId: nonEmpty(raw.dishId),
    portion: portion !== undefined && PORTIONS.has(portion) ? (portion as Portion) : undefined,
  } as EatenMeal);
}

/** Un pasto preso al bar: è un `EatenMeal` (nome della fase 1, stessa regola). */
export const normalizeBarMeal = normalizeEatenMeal;

/**
 * Regola del pasto stimato (§ 7.5): vale con la voce «sostituito», oppure con la voce «fatto» se era il pasto
 * previsto (`asPlanned`); in tutti gli altri casi si toglie.
 */
export function keepsEatenMeal(status: ItemStatus | undefined, meal: Pick<EatenMeal, 'asPlanned'>): boolean {
  return status === 'sostituito' || (status === 'fatto' && meal.asPlanned === true);
}

/**
 * Pasti stimati del giorno: solo pasti noti e voci leggibili; senza nessuno il campo sparisce. Con `status` (il diario
 * dello stesso giorno) restano solo quelli che la regola del § 7.5 tiene (`keepsEatenMeal`), come vuole
 * `setItemStatus`: un ordine rimasto su un pasto fatto, saltato o non segnato non entra nei valori del giorno né nella
 * revisione.
 */
export function normalizeBarMeals(raw: unknown, status?: Record<string, ItemStatus>): DayLog['barMeals'] {
  if (!isObj(raw)) return undefined;
  const out: NonNullable<DayLog['barMeals']> = {};
  for (const [slot, v] of Object.entries(raw)) {
    if (!MEAL_SLOT_SET.has(slot)) continue;
    const meal = normalizeEatenMeal(v);
    if (!meal) continue;
    if (status && !keepsEatenMeal(status[`pasto:${slot}`], meal)) continue;
    out[slot as MealSlot] = meal;
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeDayLogs(raw: unknown): AppData['dayLogs'] {
  if (!isObj(raw)) return {};
  const out: AppData['dayLogs'] = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isISODate(k) || !isObj(v)) continue;
    const status: Record<string, ItemStatus> = {};
    if (isObj(v.status)) for (const [id, st] of Object.entries(v.status)) if (ITEM_STATUSES.has(str(st, ''))) status[id] = st as ItemStatus;
    out[k] = compact({
      ...(v as Partial<DayLog>),
      date: k,
      status,
      notes: strRecord(v.notes),
      minimal: v.minimal === true,
      waterGlasses: clampN(Math.round(num(v.waterGlasses, 0)), 0, 40),
      sweets: clampN(Math.round(num(v.sweets, 0)), 0, 20),
      recipeSwaps: strRecord(v.recipeSwaps, (slot) => MEAL_SLOT_SET.has(slot)),
      barMeals: normalizeBarMeals(v.barMeals, status),
      swapPlanned: normalizeSlotRecord(v.swapPlanned),
    } as DayLog);
  }
  return out;
}

/** Ricetta per pasto (come `recipeSwaps`), facoltativa: senza voci il campo sparisce. */
function normalizeSlotRecord(raw: unknown): Partial<Record<MealSlot, string>> | undefined {
  if (!isObj(raw)) return undefined;
  const out = strRecord(raw, (slot) => MEAL_SLOT_SET.has(slot));
  return Object.keys(out).length ? out : undefined;
}

function normalizeCheckIns(raw: unknown): AppData['checkIns'] {
  if (!isObj(raw)) return {};
  const out: AppData['checkIns'] = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isISODate(k) || !isObj(v)) continue;
    const w = optNum(v.weightKg);
    const h = optNum(v.sleepHours);
    out[k] = compact({
      ...(v as Partial<CheckIn>),
      date: k,
      pain: numRecord(v.pain),
      weightKg: w !== undefined && w > 0 ? w : undefined,
      bedTime: isHHMM(v.bedTime) ? v.bedTime : undefined,
      wakeTime: isHHMM(v.wakeTime) ? v.wakeTime : undefined,
      sleepHours: h !== undefined && h > 0 && h <= 24 ? h : undefined,
      sleepQuality: optNum(v.sleepQuality),
      energy: optNum(v.energy),
    } as CheckIn);
  }
  return out;
}

const hasIdAndDate = (x: unknown): x is Record<string, unknown> => isObj(x) && typeof x.id === 'string' && isISODate(x.date);

function normalizeWorkouts(raw: unknown): WorkoutLog[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(hasIdAndDate).map((w) => normalizeWorkoutPhase2(w, {
    ...(w as Partial<WorkoutLog>),
    id: w.id as string,
    date: w.date as ISODate,
    sessionId: str(w.sessionId, ''),
    durationMin: Math.max(0, num(w.durationMin, 0)),
    rpe: clampN(num(w.rpe, 0), 0, 10),
    pain: numRecord(w.pain),
    exercises: (Array.isArray(w.exercises) ? w.exercises : [])
      .filter((e): e is Record<string, unknown> => isObj(e) && typeof e.exerciseId === 'string')
      .map((e) =>
        compact({
          ...(e as Partial<WorkoutLog['exercises'][number]>),
          exerciseId: e.exerciseId as string,
          swappedFrom: optStr(e.swappedFrom),
          sets: (Array.isArray(e.sets) ? e.sets : []).filter(isObj).map((st) => ({
            ...(st as object),
            weightKg: Math.max(0, num(st.weightKg, 0)),
            reps: Math.max(0, num(st.reps, 0)),
            done: st.done !== false,
          })),
        } as WorkoutLog['exercises'][number]),
      ),
  }));
}

/** Campi della fase 2 di una seduta registrata: blocco, settimana e variante solo se validi. */
function normalizeWorkoutPhase2(raw: Record<string, unknown>, w: WorkoutLog): WorkoutLog {
  const week = finiteNum(raw.weekIndex);
  return compact({
    ...w,
    blockId: nonEmpty(raw.blockId),
    weekIndex: week !== undefined && Number.isInteger(week) && week >= 0 ? week : undefined,
    variant: optEnum<NonNullable<WorkoutLog['variant']>>(VARIANTS, raw.variant),
  });
}

function normalizeFootball(raw: unknown): FootballLog[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => hasIdAndDate(f) && FOOTBALL_KINDS.has(str(f.kind, '')))
    .map((f) => ({
      ...(f as Partial<FootballLog>),
      id: f.id as string,
      date: f.date as ISODate,
      kind: f.kind as FootballLog['kind'],
      durationMin: Math.max(0, num(f.durationMin, 0)),
      rpe: clampN(num(f.rpe, 0), 0, 10),
    }));
}

function normalizeReviews(raw: unknown): WeeklyReview[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => isObj(r) && isISODate(r.weekStart))
    .map((r) => {
      const v = isObj(r.votes) ? r.votes : {};
      const proposals = Array.isArray(r.proposals)
        ? (r.proposals.filter(
            (x) => isObj(x) && typeof x.id === 'string' && typeof x.title === 'string' && typeof x.reason === 'string',
          ) as Proposal[])
        : undefined;
      return compact({
        ...(r as Partial<WeeklyReview>),
        weekStart: r.weekStart as ISODate,
        votes: { energia: num(v.energia, 0), digestione: num(v.digestione, 0), umore: num(v.umore, 0), campo: num(v.campo, 0) },
        waistCm: optNum(r.waistCm),
        skinfolds: isObj(r.skinfolds) ? numRecord(r.skinfolds) : undefined,
        acceptedProposals: strArray(r.acceptedProposals),
        note: optStr(r.note),
        proposals,
        outside: normalizeOutside(r.outside),
      } as WeeklyReview);
    });
}

/** Risposte della prevenzione nella revisione (§ 4.7): ognuna tra i valori ammessi, altrimenti sparisce. */
function normalizeOutside(raw: unknown): WeeklyReview['outside'] {
  if (!isObj(raw)) return undefined;
  const portions = (v: unknown) => {
    const n = finiteNum(v);
    return n !== undefined && Number.isInteger(n) && n >= 0 && n <= 3 ? (n as 0 | 1 | 2 | 3) : undefined;
  };
  const out = compact({
    ...(raw as NonNullable<WeeklyReview['outside']>),
    redMeat: portions(raw.redMeat),
    processed: portions(raw.processed),
    alcoholUnits: optEnum<NonNullable<NonNullable<WeeklyReview['outside']>['alcoholUnits']>>(ALCOHOL_UNITS, raw.alcoholUnits),
    binge: typeof raw.binge === 'boolean' ? raw.binge : undefined,
  });
  return Object.keys(out).length ? out : undefined;
}

function normalizePhysio(raw: unknown): AppData['physio'] {
  const p = isObj(raw) ? raw : {};
  const exercises = (Array.isArray(p.exercises) ? p.exercises : [])
    .filter((e): e is Record<string, unknown> => isObj(e) && typeof e.id === 'string' && typeof e.name === 'string')
    .map((e) => ({
      ...(e as Partial<Exercise>),
      id: e.id as string,
      name: e.name as string,
      category: (typeof e.category === 'string' ? e.category : 'fisio') as Exercise['category'],
      equipment: str(e.equipment, ''),
      cues: strArray(e.cues),
      alternatives: Array.isArray(e.alternatives) ? strArray(e.alternatives) : undefined,
    }))
    .map((e) => compact(e as Exercise));
  const prescriptions = (Array.isArray(p.prescriptions) ? p.prescriptions : [])
    .filter((x): x is Record<string, unknown> => isObj(x) && typeof x.exerciseId === 'string')
    .map((x) => {
      const repMin = Math.max(0, num(x.repMin, 10));
      return {
        ...(x as Partial<SessionExercise>),
        exerciseId: x.exerciseId as string,
        sets: clampN(Math.round(num(x.sets, 3)), 1, 20),
        repMin,
        repMax: Math.max(repMin, num(x.repMax, repMin)),
        unit: x.unit === 'secondi' ? 'secondi' : 'reps',
        restSec: Math.max(0, num(x.restSec, 60)),
        progression: x.progression === 'doppia' ? 'doppia' : 'nessuna',
      } as SessionExercise;
    });
  return { exercises, prescriptions };
}

function normalizeChecklist(raw: unknown): Record<ISODate, string[]> {
  if (!isObj(raw)) return {};
  const out: Record<ISODate, string[]> = {};
  for (const [k, v] of Object.entries(raw)) if (isISODate(k)) out[k] = strArray(v);
  return out;
}

function normalizeChat(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => isObj(m) && typeof m.id === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map(
      (m) =>
        compact({
          ...(m as Partial<ChatMessage>),
          id: m.id as string,
          role: m.role as ChatMessage['role'],
          text: str(m.text, ''),
          image: optStr(m.image),
          createdAt: str(m.createdAt, new Date(0).toISOString()),
        } as ChatMessage),
    );
}

function normalizeSettings(raw: unknown): Settings {
  const s = isObj(raw) ? raw : {};
  return compact({
    ...DEFAULT_SETTINGS,
    ...(s as Partial<Settings>),
    theme: THEMES.has(str(s.theme, '')) ? (s.theme as Settings['theme']) : DEFAULT_SETTINGS.theme,
    coachModel: str(s.coachModel, '').trim() || DEFAULT_SETTINGS.coachModel,
    coachApiKey: optStr(s.coachApiKey) || undefined,
    demoData: s.demoData === true,
    coachRefine: typeof s.coachRefine === 'boolean' ? s.coachRefine : undefined,
    coachUsage: normalizeCoachUsage(s.coachUsage),
  } as Settings);
}

const USAGE_KEYS = ['calls', 'input', 'output', 'cacheRead', 'cacheWrite'] as const;

/** Uso del coach per mese ('2026-11'): conteggi interi ≥ 0. */
function normalizeCoachUsage(raw: unknown): Settings['coachUsage'] {
  if (!isObj(raw)) return undefined;
  const out: Record<string, CoachUsageMonth> = {};
  for (const [month, v] of Object.entries(raw)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !isObj(v)) continue;
    const m = {} as CoachUsageMonth;
    for (const k of USAGE_KEYS) {
      const n = finiteNum(v[k]);
      m[k] = n !== undefined && n > 0 ? Math.round(n) : 0;
    }
    out[month] = m;
  }
  return Object.keys(out).length ? out : undefined;
}

// ───────────────────────── Piatti, proposte, versioni (fase 2) ─────────────────────────

let estimateById: Map<string, (typeof ESTIMATE_FOODS)[number]> | null = null;

/** Alimento dell'archivio o di sola stima. */
function foodById(id: string) {
  if (FOODS[id]) return FOODS[id];
  if (!estimateById || estimateById.size !== ESTIMATE_FOODS.length) estimateById = new Map(ESTIMATE_FOODS.map((f) => [f.id, f]));
  return estimateById.get(id);
}

/** True se il motore sa calcolare i valori dell'alimento: dell'archivio, di sola stima o con i valori per 100 g. */
function itemResolvable(item: EstimatedItem): boolean {
  return item.foodId ? foodById(item.foodId) !== undefined : item.per100g !== undefined;
}

/** Nome di un piatto: una riga, al massimo 40 caratteri. */
export const DISH_NAME_MAX = 40;

/**
 * Un piatto salvato: id e nome non vuoti, almeno un alimento di cui il motore sa i valori, valori ricalcolati dagli
 * alimenti (i numeri salvati non contano). Null se illeggibile.
 */
export function normalizeDish(raw: unknown): MyDish | null {
  if (!isObj(raw)) return null;
  const id = nonEmpty(raw.id);
  const name = oneLine(raw.name, DISH_NAME_MAX);
  if (!id || !name || !Array.isArray(raw.items)) return null;
  const items = raw.items
    .map(normalizeEstimatedItem)
    .filter((x): x is EstimatedItem => x !== null && itemResolvable(x))
    .slice(0, MAX_MEAL_ITEMS);
  if (!items.length) return null;
  const slots = Array.isArray(raw.slots) ? unique(strArray(raw.slots).filter((x) => MEAL_SLOT_SET.has(x))) : [];
  const portion = finiteNum(raw.lastPortion);
  const values = estimatedItemsValues(items);
  return compact({
    ...(raw as Partial<MyDish>),
    id,
    name,
    slots: slots as MealSlot[],
    items,
    nutrients: values.nutrients,
    vegPortions: values.vegPortions,
    createdAt: str(raw.createdAt, ''),
    source: 'foto',
    lastPortion: portion !== undefined && PORTIONS.has(portion) ? (portion as Portion) : undefined,
  } as MyDish);
}

/** I miei piatti: voci leggibili, id unici (vince il primo); senza nessuno la sezione sparisce. */
function normalizeDishes(raw: unknown): MyDish[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: MyDish[] = [];
  for (const d of raw) {
    const n = normalizeDish(d);
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return orUndefined(out);
}

/** Miniatura di un piatto: data URL JPEG, al massimo 12 KB. */
export const THUMB_PREFIX = 'data:image/jpeg;base64,';
export const THUMB_MAX_CHARS = 12 * 1024;
export const isValidThumb = (v: unknown): v is string => typeof v === 'string' && v.startsWith(THUMB_PREFIX) && v.length <= THUMB_MAX_CHARS;

/** Miniature: solo JPEG validi e solo per piatti esistenti. */
function normalizeThumbs(raw: unknown, dishes: readonly MyDish[] | undefined): Record<string, string> | undefined {
  if (!isObj(raw) || !dishes?.length) return undefined;
  const ids = new Set(dishes.map((d) => d.id));
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(raw)) if (ids.has(id) && isValidThumb(v)) out[id] = v;
  return Object.keys(out).length ? out : undefined;
}

/** Toppa di una proposta o di una versione: solo i campi noti e leggibili; null se non è un oggetto. */
export function normalizePatch(raw: unknown): PlanPatch | null {
  if (!isObj(raw)) return null;
  const out: PlanPatch = {};
  if (Array.isArray(raw.week)) out.week = weekFrom(raw.week, DEFAULT_WEEK);
  if (raw.seasonWeek === null) out.seasonWeek = null;
  else if (Array.isArray(raw.seasonWeek)) out.seasonWeek = weekFrom(raw.seasonWeek, DEFAULT_WEEK);
  if (raw.program === null) out.program = null;
  else {
    const program = normalizeProgram(raw.program);
    if (program) out.program = program;
  }
  if (isObj(raw.menus)) {
    const menus: Record<ISODate, MenuWeek | null> = {};
    for (const [k, v] of Object.entries(raw.menus)) {
      if (!isMonday(k)) continue;
      if (v === null) menus[k] = null;
      else {
        const w = normalizeMenuWeek(v);
        if (w) menus[k] = w;
      }
    }
    if (Object.keys(menus).length) out.menus = menus;
  }
  if (raw.training === null) out.training = null;
  else {
    const training = normalizeTraining(raw.training);
    if (training) out.training = training;
  }
  if (isObj(raw.targets)) out.targets = normalizeTargets(raw.targets, DEFAULT_TARGETS);
  if (GOALS.has(str(raw.goal, ''))) out.goal = raw.goal as Profile['goal'];
  if (raw.goalDeltaKcal === null) out.goalDeltaKcal = null;
  else {
    const delta = normalizeGoalDelta(raw.goalDeltaKcal);
    if (delta !== undefined) out.goalDeltaKcal = delta;
  }
  return out;
}

function normalizeDiffItem(raw: unknown): DiffItem | null {
  if (!isObj(raw) || !DIFF_AREAS.has(str(raw.area, '')) || typeof raw.label !== 'string') return null;
  return compact({
    ...(raw as Partial<DiffItem>),
    area: raw.area as DiffItem['area'],
    weight: num(raw.weight, 0),
    label: raw.label,
    before: optStr(raw.before),
    after: optStr(raw.after),
  } as DiffItem);
}

/** Testo per l'interfaccia di un passaggio del coach rimasto a metà (al riavvio). */
export const COACH_INTERRUPTED = 'Il coach non ha risposto: vale la proposta del motore';

/** Passaggio del coach: un «in-corso» rimasto da prima del riavvio diventa «errore». */
function normalizeCoachPass(raw: unknown): CoachPass | undefined {
  if (!isObj(raw) || !COACH_STATUSES.has(str(raw.status, ''))) return undefined;
  const interrupted = raw.status === 'in-corso';
  const applied = Array.isArray(raw.applied) ? raw.applied.map(normalizeAnyEdit).filter((e): e is PlanEdit | MenuEdit => e !== null) : [];
  const rejected = Array.isArray(raw.rejected)
    ? raw.rejected
        .map((r) => {
          if (!isObj(r) || typeof r.reason !== 'string') return null;
          const edit = normalizeAnyEdit(r.edit);
          return edit ? { edit, reason: r.reason } : null;
        })
        .filter((r): r is CoachPass['rejected'][number] => r !== null)
    : [];
  return compact({
    ...(raw as Partial<CoachPass>),
    status: interrupted ? 'errore' : (raw.status as CoachPass['status']),
    at: str(raw.at, ''),
    model: optStr(raw.model),
    summary: optStr(raw.summary),
    applied,
    rejected,
    message: optStr(raw.message) ?? (interrupted ? COACH_INTERRUPTED : undefined),
  } as CoachPass);
}

/** Una proposta del piano; null se manca un campo che serve al ciclo di vita o lo stato non è noto. */
function normalizeProposal(raw: unknown): PlanProposal | null {
  if (!isObj(raw)) return null;
  const id = nonEmpty(raw.id);
  const patch = normalizePatch(raw.patch);
  if (!id || !CHANGE_KINDS.has(str(raw.kind, '')) || !PROPOSAL_STATUSES.has(str(raw.status, ''))) return null;
  if (!isISODate(raw.effectiveFrom) || typeof raw.basis !== 'string' || typeof raw.title !== 'string' || !patch) return null;
  const attempt = finiteNum(raw.attempt);
  return compact({
    ...(raw as Partial<PlanProposal>),
    id,
    kind: raw.kind as PlanProposal['kind'],
    status: raw.status as PlanProposal['status'],
    createdAt: str(raw.createdAt, ''),
    decidedAt: optStr(raw.decidedAt),
    effectiveFrom: raw.effectiveFrom,
    approvableUntil: isISODate(raw.approvableUntil) ? raw.approvableUntil : undefined,
    basis: raw.basis,
    attempt: attempt !== undefined && Number.isInteger(attempt) && attempt >= 0 ? attempt : undefined,
    title: raw.title,
    subtitle: optStr(raw.subtitle),
    patch,
    diff: Array.isArray(raw.diff) ? raw.diff.map(normalizeDiffItem).filter((d): d is DiffItem => d !== null) : [],
    reasons: strArray(raw.reasons),
    warnings: Array.isArray(raw.warnings) ? strArray(raw.warnings) : undefined,
    source: raw.source === 'motore+coach' ? 'motore+coach' : 'motore',
    coach: normalizeCoachPass(raw.coach),
    before: normalizePatch(raw.before) ?? undefined,
  } as PlanProposal);
}

/** Proposte decise tenute per tipo (§ 5.2): le altre si rileggono dallo storico. */
export const DECIDED_KEPT_PER_KIND = 3;
/** Riepiloghi dei blocchi conclusi tenuti. */
export const BLOCKS_KEPT = 12;
/** Versioni del piano tenute nell'archivio freddo. */
export const VERSIONS_KEPT = 24;

const decidedAt = (p: PlanProposal) => p.decidedAt ?? p.createdAt;

/**
 * Regole dell'elenco delle proposte, uguali per la normalizzazione e per le azioni: una sola aperta per tipo e inizio
 * (vince l'ultima creata, le altre diventano superate) e al massimo 3 decise per tipo (le più recenti). Le approvate in
 * attesa di entrare nel piano restano sempre, fuori dal conto. L'ordine resta.
 */
function tidyProposals(list: PlanProposal[]): PlanProposal[] {
  const openKey = (p: PlanProposal) => `${p.kind}|${p.effectiveFrom}`;
  const lastOpen = new Map<string, number>();
  list.forEach((p, i) => {
    if (p.status !== 'aperta') return;
    const prev = lastOpen.get(openKey(p));
    if (prev === undefined || p.createdAt >= list[prev].createdAt) lastOpen.set(openKey(p), i);
  });
  const fixed = list.map((p, i) =>
    p.status === 'aperta' && lastOpen.get(openKey(p)) !== i ? { ...p, status: 'superata' as const, decidedAt: decidedAt(p) } : p,
  );
  const keep = new Set<number>();
  const byKind = new Map<string, number[]>();
  fixed.forEach((p, i) => {
    if (p.status === 'aperta' || isPendingApproval(p)) keep.add(i);
    else byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), i]);
  });
  for (const idx of byKind.values()) {
    const recent = [...idx].sort((a, b) => (decidedAt(fixed[b]) > decidedAt(fixed[a]) ? 1 : decidedAt(fixed[b]) < decidedAt(fixed[a]) ? -1 : b - a));
    for (const i of recent.slice(0, DECIDED_KEPT_PER_KIND)) keep.add(i);
  }
  return fixed.filter((_, i) => keep.has(i));
}

function normalizeBlockSummary(raw: unknown): BlockSummary | null {
  if (!isObj(raw)) return null;
  const blockId = nonEmpty(raw.blockId);
  const adherence = finiteNum(raw.adherence);
  if (!blockId || !isISODate(raw.from) || !isISODate(raw.to) || !QUALITIES.has(str(raw.primary, ''))) return null;
  if (!VERDICTS.has(str(raw.verdict, '')) || adherence === undefined) return null;
  const peak = finiteNum(raw.peakLoad);
  return compact({
    ...(raw as Partial<BlockSummary>),
    blockId,
    from: raw.from,
    to: raw.to,
    primary: raw.primary as TrainingQuality,
    secondary: optEnum<TrainingQuality>(QUALITIES, raw.secondary),
    verdict: raw.verdict as BlockSummary['verdict'],
    adherence,
    peakLoad: peak !== undefined && peak >= 0 ? peak : undefined,
  } as BlockSummary);
}

/** Riepiloghi dei blocchi: uno per blocco (vince l'ultimo), in ordine di inizio, gli ultimi 12. */
function tidyBlocks(list: BlockSummary[]): BlockSummary[] | undefined {
  const byId = new Map<string, BlockSummary>();
  for (const b of list) byId.set(b.blockId, b);
  const out = [...byId.values()].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)).slice(-BLOCKS_KEPT);
  return orUndefined(out);
}

/** Proposte e riepiloghi dei blocchi: stati sconosciuti scartati, poi le regole dell'elenco (`tidyProposals`). */
function normalizePlanner(raw: unknown): Planner | undefined {
  if (!isObj(raw)) return undefined;
  const seen = new Set<string>();
  const proposals: PlanProposal[] = [];
  for (const x of Array.isArray(raw.proposals) ? raw.proposals : []) {
    const p = normalizeProposal(x);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    proposals.push(p);
  }
  const blocks = Array.isArray(raw.blocks)
    ? tidyBlocks(raw.blocks.map(normalizeBlockSummary).filter((b): b is BlockSummary => b !== null))
    : undefined;
  return compact({ ...(raw as Partial<Planner>), proposals: tidyProposals(proposals), blocks } as Planner);
}

const byAt = (a: PlanVersion, b: PlanVersion) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

/** Versioni del piano: al massimo 24, ordinate per data; una versione senza `after` valido non si potrebbe ripristinare. */
function normalizePlanVersions(raw: unknown): PlanVersion[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const out: PlanVersion[] = [];
  for (const v of raw) {
    if (!isObj(v)) continue;
    const id = nonEmpty(v.id);
    const after = normalizePatch(v.after);
    if (!id || seen.has(id) || !after || !isISODate(v.effectiveFrom) || typeof v.title !== 'string') continue;
    if (v.kind !== 'blocco' && v.kind !== 'obiettivi' && v.kind !== 'ritorno') continue;
    seen.add(id);
    out.push(
      compact({
        ...(v as Partial<PlanVersion>),
        id,
        at: str(v.at, ''),
        effectiveFrom: v.effectiveFrom,
        kind: v.kind,
        title: v.title,
        before: normalizePatch(v.before) ?? {},
        after,
        proposalId: nonEmpty(v.proposalId),
      } as PlanVersion),
    );
  }
  return orUndefined(out.sort(byAt).slice(-VERSIONS_KEPT));
}

/** Sezioni facoltative della fase 2: sempre presenti come chiavi (anche `undefined`), così `set` le sostituisce. */
const OPTIONAL_SECTIONS = ['dishes', 'dishThumbs', 'planner', 'planVersions'] as const;
const NO_SECTIONS: Pick<AppData, (typeof OPTIONAL_SECTIONS)[number]> = {
  dishes: undefined,
  dishThumbs: undefined,
  planner: undefined,
  planVersions: undefined,
};

/**
 * Completa e ripara qualunque oggetto simile ad AppData (stato salvato, backup importato): ogni sezione
 * torna della forma giusta, le voci illeggibili si scartano, i numeri si ricavano anche da stringhe.
 * Le sezioni facoltative della fase 2 ci sono sempre come chiavi, `undefined` se vuote.
 */
export function normalizeData(raw: unknown): AppData {
  const base = defaultAppData();
  if (!isObj(raw)) return { ...base, ...NO_SECTIONS };
  const d = raw as Record<string, unknown>;
  const dishes = normalizeDishes(d.dishes);
  return {
    version: DATA_VERSION,
    onboarded: d.onboarded === true,
    profile: normalizeProfile(d.profile),
    plan: normalizePlan(d.plan, base.plan.startDate),
    dayLogs: normalizeDayLogs(d.dayLogs),
    checkIns: normalizeCheckIns(d.checkIns),
    workoutLogs: normalizeWorkouts(d.workoutLogs),
    footballLogs: normalizeFootball(d.footballLogs),
    reviews: normalizeReviews(d.reviews),
    physio: normalizePhysio(d.physio),
    shoppingChecked: normalizeChecklist(d.shoppingChecked),
    prepDone: normalizeChecklist(d.prepDone),
    chat: normalizeChat(d.chat),
    settings: normalizeSettings(d.settings),
    dishes,
    dishThumbs: normalizeThumbs(d.dishThumbs, dishes),
    planner: normalizePlanner(d.planner),
    planVersions: normalizePlanVersions(d.planVersions),
  };
}

/**
 * Migrazione tra versioni dei dati salvati. Versione 1 = forma attuale.
 * Aggiungi qui i passaggi quando DATA_VERSION cresce, poi normalizza sempre.
 */
export function migrateData(persisted: unknown, fromVersion: number): AppData {
  let data = persisted;
  if (fromVersion < 1 && isObj(data)) {
    data = { ...data, version: 1 };
  }
  // 1 → 2: obiettivo di fibre da 30 a 35 g (circa 14 g ogni 1.000 kcal). Chi l'aveva cambiato lo tiene.
  if (fromVersion < 2 && isObj(data) && isObj(data.plan) && isObj(data.plan.targets)) {
    const targets = { ...(data.plan.targets as Record<string, unknown>) };
    for (const [t, v] of Object.entries(targets)) {
      if (isObj(v) && v.fiberG === 30) targets[t] = { ...v, fiberG: 35 };
    }
    data = { ...data, plan: { ...data.plan, targets }, version: 2 };
  }
  // 2 → 3: obiettivo del sonno da 23:30 a 23:15 con la sveglia predefinita delle 07:15. Sono 8 ore a letto,
  // cioè circa 7 di sonno vero con un'efficienza dell'85-90%: con 7 h 45 a letto si restava sotto le 7.
  // Chi aveva scelto un altro obiettivo o un'altra sveglia lo tiene.
  if (fromVersion < 3 && isObj(data) && isObj(data.plan) && isObj(data.plan.sleep)) {
    const sleep = data.plan.sleep as Record<string, unknown>;
    if (sleep.target === '23:30' && sleep.wake === '07:15') {
      data = { ...data, plan: { ...data.plan, sleep: { ...sleep, target: '23:15' } } };
    }
  }
  if (isObj(data) && fromVersion < 3) data = { ...data, version: 3 };
  // 3 → 4 (fase 2): nessun valore cambia. Le sezioni nuove sono facoltative; il numero serve perché un'app vecchia
  // rifiuti un backup nuovo invece di perdere piatti, proposte e versioni (`parseBackup`).
  if (isObj(data) && fromVersion < 4) data = { ...data, version: 4 };
  return normalizeData(data);
}

const DATA_KEYS: (keyof AppData)[] = [
  'version',
  'onboarded',
  'profile',
  'plan',
  'dayLogs',
  'checkIns',
  'workoutLogs',
  'footballLogs',
  'reviews',
  'physio',
  'shoppingChecked',
  'prepDone',
  'chat',
  'settings',
  // Fase 2: anche le sezioni dell'archivio freddo, così il backup è completo.
  'dishes',
  'dishThumbs',
  'planner',
  'planVersions',
];

/** Sezioni dell'archivio freddo (§ 12.5): fuori dal blob caldo. */
export const COLD_KEYS = ['dishThumbs', 'planVersions'] as const;

/** Solo i dati (senza azioni): utile per backup ed esportazione. */
export function pickData(s: AppData): AppData {
  const out = {} as Record<string, unknown>;
  for (const k of DATA_KEYS) out[k] = s[k];
  return out as unknown as AppData;
}

/** Chiave della seduta in corso (store separato in `features/allenamento/draft.ts`, fuori dal backup). */
export const SESSION_DRAFT_KEY = 'ritmo:seduta-in-corso';
/** Evento emesso quando i dati vengono sostituiti (dati di esempio, importazione, azzeramento). */
export const DATA_REPLACED_EVENT = 'ritmo:dati-sostituiti';

/**
 * I dati sono stati sostituiti: una seduta in corso appartiene ai dati di prima e non va ripresa.
 * Toglie la bozza salvata (anche se il lettore non è ancora caricato) e avvisa chi la tiene in memoria.
 */
export function announceDataReplaced(): void {
  safeStorage.removeItem(SESSION_DRAFT_KEY);
  try {
    window.dispatchEvent(new Event(DATA_REPLACED_EVENT));
  } catch {
    /* fuori dal browser (test) */
  }
}

/**
 * Foto della chat conservate sul telefono. Ogni tocco riscrive tutto lo stato in modo sincrono: con molte foto
 * da 720 px si arriva a un megabyte a ogni bicchiere d'acqua. Restano le più recenti; le altre restano solo
 * finché l'app è aperta (il testo dei messaggi resta sempre).
 */
export const PERSISTED_CHAT_IMAGES = 4;

/**
 * Dati da scrivere in localStorage (blob caldo): come `pickData`, senza le sezioni dell'archivio freddo (miniature e
 * versioni, scritte a parte) e con le foto della chat limitate.
 */
export function persistedData(s: AppData): AppData {
  const data = pickData(s);
  for (const k of COLD_KEYS) delete data[k];
  let images = 0;
  for (const m of data.chat) if (m.image) images++;
  if (images <= PERSISTED_CHAT_IMAGES) return data;
  let skip = images - PERSISTED_CHAT_IMAGES;
  const chat = data.chat.map((m) => {
    if (!m.image || skip <= 0) return m;
    skip--;
    const { image: _drop, ...rest } = m;
    void _drop;
    return rest;
  });
  return { ...data, chat };
}

// ───────────────────────── Archivio freddo (§ 12.5) ─────────────────────────

/** Chiave dell'archivio freddo in localStorage. */
export const ARCHIVE_KEY = 'ritmo:v1:archivio';
/** Versione della forma dell'archivio. */
export const ARCHIVE_VERSION = 1;

export type ArchiveStatus = 'vuoto' | 'letto' | 'illeggibile';

/** L'idratazione è finita: da qui lo scrittore può aggiornare l'archivio. */
let archiveLoaded = false;
let archiveStatus: ArchiveStatus = 'vuoto';
/** Sezioni come sono salvate nell'archivio: una sezione `undefined` nello stato non le cancella. */
let archiveSaved: Partial<Record<(typeof COLD_KEYS)[number], unknown>> = {};

/**
 * Stato dell'archivio freddo, per la pagina Informazioni: 'illeggibile' se c'era ma non si legge o ha una versione
 * sconosciuta (non si sovrascrive: l'app parte senza miniature e versioni).
 */
export function archiveInfo(): { loaded: boolean; status: ArchiveStatus } {
  return { loaded: archiveLoaded, status: archiveStatus };
}

/** Legge l'archivio in modo sincrono e restituisce le sue sezioni grezze (le normalizza `normalizeData`). */
export function readArchive(): Partial<Pick<AppData, (typeof COLD_KEYS)[number]>> {
  archiveSaved = {};
  const raw = readStored(ARCHIVE_KEY);
  if (raw === null) {
    archiveStatus = 'vuoto';
    return {};
  }
  try {
    const v = JSON.parse(raw) as unknown;
    if (isObj(v) && v.version === ARCHIVE_VERSION) {
      for (const k of COLD_KEYS) if (v[k] !== undefined) archiveSaved[k] = v[k];
      archiveStatus = 'letto';
      return { ...archiveSaved } as Partial<Pick<AppData, (typeof COLD_KEYS)[number]>>;
    }
  } catch {
    /* illeggibile */
  }
  archiveStatus = 'illeggibile';
  return {};
}

/**
 * Scrive l'archivio freddo.
 * - 'aggiorna' (lo scrittore automatico): solo dopo l'idratazione e con un archivio leggibile; una sezione `undefined`
 *   nello stato tiene quella salvata.
 * - 'esatta' (azioni esplicite: eliminazione di un piatto, «Annulla», dati di esempio): le sezioni come sono nello
 *   stato, `undefined` le toglie; non tocca un archivio illeggibile.
 * - 'forza' (importazione, azzeramento): come 'esatta', anche sopra un archivio illeggibile.
 */
function writeArchive(s: Partial<AppData>, mode: 'aggiorna' | 'esatta' | 'forza'): void {
  if (mode !== 'forza' && (!archiveLoaded || archiveStatus === 'illeggibile')) return;
  const sections: Partial<Record<(typeof COLD_KEYS)[number], unknown>> = {};
  for (const k of COLD_KEYS) {
    const v = s[k];
    if (v !== undefined) sections[k] = v;
    else if (mode === 'aggiorna' && archiveSaved[k] !== undefined) sections[k] = archiveSaved[k];
  }
  if (!Object.keys(sections).length) {
    if (mode !== 'aggiorna' || archiveStatus === 'letto') {
      safeStorage.removeItem(ARCHIVE_KEY);
      archiveSaved = {};
      archiveStatus = 'vuoto';
    }
    return;
  }
  safeStorage.setItem(ARCHIVE_KEY, JSON.stringify({ version: ARCHIVE_VERSION, ...sections }));
  archiveSaved = sections;
  archiveStatus = 'letto';
}

/** Istantanea di un pasto per «Annulla» (§ 7.5): stato e nota della voce, pasto stimato, ricetta scelta. */
export interface MealSnapshot {
  status?: ItemStatus;
  note?: string;
  meal?: EatenMeal;
  swap?: string;
}

/** Impostazioni del coach che restano quando si caricano o si tolgono i dati di esempio (come la chiave). */
function keepCoachSettings(s: Settings): Partial<Settings> {
  return compact({ coachRefine: s.coachRefine, coachUsage: s.coachUsage });
}

// ───────────────────────── Store dell'app ─────────────────────────

export interface AppActions {
  completeOnboarding: (profile: Profile, plan: Plan) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  updatePlan: (patch: Partial<Plan>) => void;
  setTarget: (dayType: DayType, patch: Partial<MacroTarget>) => void;
  setScheduleDay: (weekday: Weekday, patch: Partial<ScheduleDay>) => void;

  /** Stato di una voce della giornata; null la riporta a "da fare" (e cancella la nota). */
  setItemStatus: (date: ISODate, itemId: string, status: ItemStatus | null, note?: string) => void;
  setMinimal: (date: ISODate, on: boolean) => void;
  /** Bicchieri d'acqua da 250 ml (delta positivo o negativo, mai sotto zero). */
  addWater: (date: ISODate, delta: number) => void;
  addSweet: (date: ISODate, delta: number) => void;
  /**
   * Ricetta al posto di quella del menù; null torna al menù. Con `plannedId` (la ricetta prevista al momento del
   * cambio) scrive anche `DayLog.swapPlanned`, che serve a imparare i gusti.
   */
  swapRecipe: (date: ISODate, slot: MealSlot, recipeId: string | null, plannedId?: string) => void;
  /** Pasto preso al bar con il piano B, con i valori stimati dell'ordine; null lo toglie. Alias di un pasto stimato 'bar'. */
  setBarMeal: (date: ISODate, slot: MealSlot, meal: EatenMeal | null) => void;
  /**
   * Pasto mangiato con valori stimati (foto, piatto salvato), in una sola transazione con lo stato della voce
   * `pasto:<slot>`: «fatto» se era il pasto previsto (`asPlanned`), altrimenti «sostituito» (§ 7.5).
   */
  setEatenMeal: (date: ISODate, slot: MealSlot, meal: EatenMeal, opts?: { note?: string }) => void;
  /** Stato, nota, pasto stimato e ricetta scelta di un pasto, per «Annulla». */
  mealSnapshot: (date: ISODate, slot: MealSlot) => MealSnapshot;
  /** Rimette un pasto com'era nell'istantanea. */
  restoreMeal: (date: ISODate, slot: MealSlot, snap: MealSnapshot) => void;
  /** Salva un piatto (o lo sostituisce per id), con i valori ricalcolati dagli alimenti e la miniatura facoltativa. */
  saveDish: (dish: MyDish, thumb?: string) => void;
  /** Cambia nome, alimenti, pasti o ultima porzione di un piatto; i valori si ricalcolano. */
  updateDish: (id: string, patch: Partial<Pick<MyDish, 'name' | 'items' | 'slots' | 'lastPortion'>>) => void;
  /** Toglie un piatto e la sua miniatura; il diario tiene la sua copia dei valori. */
  deleteDish: (id: string) => void;

  /** Segnali d'allarme (§ 3.8): fermo degli impatti; il rientro di quella zona torna allo stadio 0 senza via libera. */
  setImpactHold: (site: string, today: ISODate) => void;
  /** Via libera esplicito del fisioterapista o del medico: gli impatti tornano. */
  clearImpactHold: () => void;

  /** Esclude un alimento dal piano da `since` (una sola esclusione per alimento: la prima resta). */
  addExclusion: (foodId: string, origin: FoodExclusion['origin'], since: ISODate) => void;
  removeExclusion: (foodId: string) => void;
  /** «Tienilo»: la domanda sui cambi ripetuti non torna per 56 giorni. */
  markTasteAsked: (foodId: string, date: ISODate) => void;

  /**
   * Salva una proposta del piano (o la aggiorna per id) e supera le aperte dello stesso tipo e inizio. Una proposta già
   * decisa con lo stesso id non si riapre.
   */
  saveProposal: (p: PlanProposal) => void;
  /** Passaggio del coach su una proposta aperta; con `patch` la toppa diventa quella rifinita. */
  updateCoachPass: (id: string, pass: CoachPass, patch?: PlanPatch) => void;
  /**
   * Approva una proposta aperta e aggiunge la versione (non per i menù). La toppa entra subito, con `before` salvato,
   * solo se non può cambiare oggi né i giorni passati (la proposta vale già, oppure solo menù di settimane dopo oggi);
   * altrimenti la proposta resta approvata in attesa ed entra con `applyDueProposals` (§ 5.4). Null se la proposta non
   * c'è, non è aperta, è superata o la base del piano proiettato è cambiata.
   */
  approveProposal: (id: string, today: ISODate) => { versionId?: string } | null;
  /**
   * Le approvate in attesa con `effectiveFrom` ≤ `today` (la giornata del piano) entrano nel piano, nell'ordine delle
   * decisioni, e ricevono `before`. La chiamano l'avvio e il cambio di giornata (`app/boot.ts`). Restituisce quante.
   */
  applyDueProposals: (today: ISODate) => number;
  /** «Tieni il piano attuale». */
  rejectProposal: (id: string) => void;
  /**
   * «Annulla» dopo l'approvazione: se la toppa è già entrata riapplica `before`; toglie la versione e la proposta torna
   * aperta.
   */
  undoApproval: (proposalId: string) => void;
  /** Riepilogo di un blocco concluso (uno per blocco, gli ultimi 12). */
  recordBlockSummary: (s: BlockSummary) => void;

  /** Controllo di un integratore confermato («Aggiungilo lo stesso»): non torna finché il codice non cambia. */
  acknowledgeSupplementCheck: (supplementId: string, code: string) => void;
  /** Somma i token di una risposta del coach al mese ('2026-11'). */
  recordCoachUsage: (month: string, delta: CoachUsageMonth) => void;

  /** Salva (o aggiorna, fondendo) il controllo del mattino della sua data. */
  saveCheckIn: (checkIn: CheckIn) => void;
  /** Inserisce o sostituisce per id. */
  saveWorkout: (log: WorkoutLog) => void;
  deleteWorkout: (id: string) => void;
  /** Inserisce o sostituisce per id. */
  saveFootball: (log: FootballLog) => void;
  deleteFootball: (id: string) => void;
  /** Inserisce o sostituisce per weekStart. */
  saveReview: (review: WeeklyReview) => void;
  /**
   * Applica una proposta della revisione: 'sleepCurrent'; 'kcalDelta' tagliata ai limiti dell'energia
   * (`clampKcalCorrection`), con `Plan.goalDeltaKcal` scritto; 'planProposal' (= `approveProposal`); 'weekKind'
   * (`Plan.weekOverrides`). 'none' non cambia il piano. `today` serve solo a 'planProposal' (predefinito: la giornata
   * del piano).
   */
  applyProposal: (proposal: Proposal, today?: ISODate) => void;

  setPhysio: (exercises: Exercise[], prescriptions: SessionExercise[]) => void;
  toggleShopping: (weekStart: ISODate, key: string) => void;
  togglePrep: (weekStart: ISODate, taskId: string) => void;

  /** Aggiunge un messaggio; se manca l'id lo genera. Restituisce l'id. */
  addChat: (msg: Omit<ChatMessage, 'id' | 'createdAt'> & Partial<Pick<ChatMessage, 'id' | 'createdAt'>>) => string;
  updateChat: (id: string, patch: Partial<ChatMessage>) => void;
  clearChat: () => void;

  updateSettings: (patch: Partial<Settings>) => void;
  /** Carica i dati di esempio (salva una copia dei dati dell'utente, ripristinata da clearDemo). */
  loadDemo: (today?: ISODate) => void;
  /** Rimuove i dati di esempio: ripristina la copia dei dati dell'utente o riparte da zero. */
  clearDemo: () => void;
  /** Importa un backup. Restituisce false se il contenuto non è un backup di Ritmo. */
  importData: (data: unknown) => boolean;
  /** Azzera tutto, impostazioni comprese. */
  resetAll: () => void;

  /** Diario del giorno o uno vuoto, senza scriverlo nello stato. */
  getDayLog: (date: ISODate) => DayLog;
}

export type AppState = AppData & AppActions;

const upsertBy = <T,>(list: T[], item: T, same: (a: T) => boolean): T[] => {
  const i = list.findIndex(same);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
};

const byDate = <T extends { date: ISODate }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

const toggleIn = (list: string[] | undefined, key: string): string[] => {
  const cur = list ?? [];
  return cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round5 = (v: number) => Math.round(v / 5) * 5;

/** Massimo di messaggi conservati nella chat. */
const CHAT_LIMIT = 200;

/** Toglie un pasto dal record dei pasti stimati; senza pasti il campo sparisce. */
function withoutMeal(d: DayLog, slot: MealSlot): void {
  if (!d.barMeals?.[slot]) return;
  const bar = { ...d.barMeals };
  delete bar[slot];
  if (Object.keys(bar).length) d.barMeals = bar;
  else delete d.barMeals;
}

/** Scrive o toglie la nota di una voce (testo vuoto = toglie). */
function setNote(d: DayLog, itemId: string, note: string | undefined): void {
  if (note === undefined) return;
  if (note.trim()) d.notes[itemId] = note.trim();
  else delete d.notes[itemId];
}

const nowIso = () => new Date().toISOString();

/** Stato per le funzioni delle proposte: il piano proiettato, con le approvate in attesa (§ 5.4). */
const proposalStateOf = (s: Pick<AppData, 'plan' | 'profile' | 'physio' | 'planner'>) =>
  projectedState({ plan: s.plan, profile: s.profile, physio: s.physio }, s.planner?.proposals);

export const useApp = create<AppState>()(
  persist(
    (set, get) => {
      const patchDay = (date: ISODate, fn: (d: DayLog) => DayLog) =>
        set((s) => {
          const prev = s.dayLogs[date] ?? emptyDayLog(date);
          const copy: DayLog = {
            ...prev,
            status: { ...prev.status },
            notes: { ...prev.notes },
            recipeSwaps: { ...prev.recipeSwaps },
          };
          return { dayLogs: { ...s.dayLogs, [date]: fn(copy) } };
        });

      /** Aggiorna le proposte con le regole dell'elenco (una aperta per tipo e inizio, 3 decise per tipo). */
      const withProposals = (s: AppData, proposals: PlanProposal[]): Planner => ({
        ...(s.planner ?? { proposals: [] }),
        proposals: tidyProposals(proposals),
      });

      /**
       * Approvazione in una sola transazione (§ 5.4). La base si controlla sul piano proiettato. La toppa entra subito
       * solo se non può cambiare oggi né i giorni passati (`entersPlanAtApproval`): allora `before` si scrive adesso;
       * altrimenti la proposta resta approvata in attesa ed entra con `applyDueProposals` il suo primo giorno. La
       * versione si aggiunge in ogni caso (con i valori di prima del piano proiettato, aggiornati quando la toppa entra).
       */
      const approve = (id: string, today: ISODate): { versionId?: string } | null => {
        const s = get();
        const list = s.planner?.proposals ?? [];
        const p = list.find((x) => x.id === id);
        if (!p || p.status !== 'aperta') return null;
        const state = proposalStateOf(s);
        if (isSuperseded(p, state, today)) {
          set({ planner: withProposals(s, list.map((x) => (x.id === id ? { ...x, status: 'superata', decidedAt: nowIso() } : x))) });
          return null;
        }
        const at = nowIso();
        const now = entersPlanAtApproval(p, today, pendingApprovals(list));
        const before = now ? beforeOf(s.plan, s.profile, p.patch) : undefined;
        const { plan, profile } = now ? applyPatch(s.plan, s.profile, p.patch) : { plan: s.plan, profile: s.profile };
        // Le altre proposte aperte la cui base cambia con questa non si possono più approvare (es. il menù dopo un blocco
        // nuovo), anche quando la toppa entra più avanti.
        const projected = applyPatch(state.plan, state.profile, p.patch);
        const next = { ...state, plan: projected.plan, profile: projected.profile };
        const proposals = list.map((x): PlanProposal => {
          if (x.id === id) return { ...x, status: 'approvata', decidedAt: at, ...(before ? { before } : {}) };
          if (x.status === 'aperta' && isSuperseded(x, next, today)) return { ...x, status: 'superata', decidedAt: at };
          return x;
        });
        let versionId: string | undefined;
        let planVersions = s.planVersions;
        if (p.kind !== 'menu') {
          versionId = `v-${p.id}`;
          const version: PlanVersion = {
            id: versionId,
            at,
            effectiveFrom: p.effectiveFrom,
            kind: p.kind,
            title: p.title,
            before: before ?? beforeOf(state.plan, state.profile, p.patch),
            after: JSON.parse(JSON.stringify(p.patch)) as PlanPatch,
            proposalId: p.id,
          };
          planVersions = [...(s.planVersions ?? []).filter((v) => v.id !== versionId), version].sort(byAt).slice(-VERSIONS_KEPT);
        }
        set({ plan, profile, planner: withProposals(s, proposals), planVersions });
        return versionId ? { versionId } : {};
      };

      /** Le approvate in attesa che valgono da `today` entrano nel piano, nell'ordine delle decisioni (§ 5.4). */
      const applyDue = (today: ISODate): number => {
        const s = get();
        const list = s.planner?.proposals ?? [];
        const due = dueApprovals(list, today);
        if (!due.length) return 0;
        let plan = s.plan;
        let profile = s.profile;
        const befores = new Map<string, PlanPatch>();
        for (const p of due) {
          befores.set(p.id, beforeOf(plan, profile, p.patch));
          ({ plan, profile } = applyPatch(plan, profile, p.patch));
        }
        const proposals = list.map((x): PlanProposal => {
          const before = befores.get(x.id);
          return before ? { ...x, before } : x;
        });
        const touched = (s.planVersions ?? []).some((v) => v.proposalId && befores.has(v.proposalId));
        const planVersions = touched
          ? (s.planVersions ?? []).map((v) => {
              const before = v.proposalId ? befores.get(v.proposalId) : undefined;
              return before ? { ...v, before } : v;
            })
          : s.planVersions;
        set({ plan, profile, planner: withProposals(s, proposals), planVersions });
        return due.length;
      };

      return {
        ...defaultAppData(),
        ...NO_SECTIONS,

        completeOnboarding: (profile, plan) =>
          set((s) => ({ profile, plan, onboarded: true, settings: { ...s.settings, demoData: false } })),
        updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
        updatePlan: (patch) =>
          set((s) => {
            const plan = { ...s.plan, ...patch };
            // La soglia per gli impatti resta un numero da 0 a 10; un valore vuoto o illeggibile torna al predefinito.
            if ('impactThreshold' in patch) {
              const v = normalizeImpactThreshold(patch.impactThreshold);
              if (v === undefined) delete plan.impactThreshold;
              else plan.impactThreshold = v;
            }
            return { plan };
          }),
        setTarget: (dayType, patch) =>
          set((s) => ({
            plan: { ...s.plan, targets: { ...s.plan.targets, [dayType]: { ...s.plan.targets[dayType], ...patch } } },
          })),
        setScheduleDay: (weekday, patch) =>
          set((s) => ({
            plan: {
              ...s.plan,
              week: s.plan.week.map((d) => {
                if (d.weekday !== weekday) return d;
                const next = { ...d, ...patch, weekday } as ScheduleDay;
                // L'orario di lavoro si salva solo normalizzato; senza blocchi il campo sparisce.
                if ('work' in patch) {
                  const work = normalizeWork(patch.work);
                  if (work) next.work = work;
                  else delete next.work;
                }
                return next;
              }),
            },
          })),

        setItemStatus: (date, itemId, status, note) =>
          patchDay(date, (d) => {
            // Un pasto stimato vale finché la regola del § 7.5 lo tiene: sostituito, oppure fatto se era il pasto
            // previsto. Saltato, annullato o fatto per un ordine del bar lo tolgono.
            const slot = itemId.startsWith('pasto:') ? itemId.slice(6) : '';
            const meal = MEAL_SLOT_SET.has(slot) ? d.barMeals?.[slot as MealSlot] : undefined;
            if (meal && !keepsEatenMeal(status ?? undefined, meal)) withoutMeal(d, slot as MealSlot);
            if (status === null) {
              delete d.status[itemId];
              delete d.notes[itemId];
            } else {
              d.status[itemId] = status;
              if (note !== undefined) {
                if (note.trim()) d.notes[itemId] = note.trim();
                else delete d.notes[itemId];
              }
            }
            return d;
          }),
        setMinimal: (date, on) => patchDay(date, (d) => ({ ...d, minimal: on })),
        addWater: (date, delta) => patchDay(date, (d) => ({ ...d, waterGlasses: clamp(d.waterGlasses + delta, 0, 40) })),
        addSweet: (date, delta) => patchDay(date, (d) => ({ ...d, sweets: clamp(d.sweets + delta, 0, 20) })),
        swapRecipe: (date, slot, recipeId, plannedId) =>
          patchDay(date, (d) => {
            const planned = { ...(d.swapPlanned ?? {}) };
            if (recipeId) {
              d.recipeSwaps[slot] = recipeId;
              if (plannedId) planned[slot] = plannedId;
            } else {
              delete d.recipeSwaps[slot];
              delete planned[slot];
            }
            if (Object.keys(planned).length) d.swapPlanned = planned;
            else delete d.swapPlanned;
            return d;
          }),
        setBarMeal: (date, slot, meal) =>
          patchDay(date, (d) => {
            if (!MEAL_SLOT_SET.has(slot)) return d;
            const bar = { ...(d.barMeals ?? {}) };
            // Un ordine illeggibile (senza etichetta o kcal) non si salva: vale come togliere il pasto al bar.
            // È un pasto stimato del bar: la provenienza assente vale 'bar', come nei diari della fase 1.
            const clean = meal ? normalizeEatenMeal({ ...meal, source: undefined }) : null;
            if (clean) bar[slot] = clean;
            else delete bar[slot];
            if (Object.keys(bar).length) d.barMeals = bar;
            else delete d.barMeals;
            return d;
          }),
        setEatenMeal: (date, slot, meal, opts) =>
          patchDay(date, (d) => {
            const clean = MEAL_SLOT_SET.has(slot) ? normalizeEatenMeal(meal) : null;
            if (!clean) return d;
            const itemId = `pasto:${slot}`;
            d.barMeals = { ...(d.barMeals ?? {}), [slot]: clean };
            d.status[itemId] = clean.asPlanned ? 'fatto' : 'sostituito';
            setNote(d, itemId, opts?.note);
            return d;
          }),
        mealSnapshot: (date, slot) => {
          const d = get().dayLogs[date];
          const itemId = `pasto:${slot}`;
          return compact<MealSnapshot>({
            status: d?.status[itemId],
            note: d?.notes[itemId],
            meal: d?.barMeals?.[slot] ? (JSON.parse(JSON.stringify(d.barMeals[slot])) as EatenMeal) : undefined,
            swap: d?.recipeSwaps[slot],
          });
        },
        restoreMeal: (date, slot, snap) =>
          patchDay(date, (d) => {
            if (!MEAL_SLOT_SET.has(slot)) return d;
            const itemId = `pasto:${slot}`;
            if (snap.status) d.status[itemId] = snap.status;
            else delete d.status[itemId];
            if (snap.note) d.notes[itemId] = snap.note;
            else delete d.notes[itemId];
            const meal = snap.meal ? normalizeEatenMeal(snap.meal) : null;
            if (meal) d.barMeals = { ...(d.barMeals ?? {}), [slot]: meal };
            else withoutMeal(d, slot);
            if (snap.swap) d.recipeSwaps[slot] = snap.swap;
            else if (d.recipeSwaps[slot]) {
              delete d.recipeSwaps[slot];
              if (d.swapPlanned?.[slot]) {
                const planned = { ...d.swapPlanned };
                delete planned[slot];
                if (Object.keys(planned).length) d.swapPlanned = planned;
                else delete d.swapPlanned;
              }
            }
            return d;
          }),
        saveDish: (dish, thumb) =>
          set((s) => {
            const clean = normalizeDish(dish);
            if (!clean) return {};
            const dishes = upsertBy(s.dishes ?? [], clean, (x) => x.id === clean.id);
            if (!isValidThumb(thumb)) return { dishes };
            return { dishes, dishThumbs: { ...(s.dishThumbs ?? {}), [clean.id]: thumb } };
          }),
        updateDish: (id, patch) =>
          set((s) => {
            const cur = s.dishes?.find((x) => x.id === id);
            if (!cur) return {};
            const pick: Partial<MyDish> = {};
            if (patch.name !== undefined) pick.name = patch.name;
            if (patch.items !== undefined) pick.items = patch.items;
            if (patch.slots !== undefined) pick.slots = patch.slots;
            if (patch.lastPortion !== undefined) pick.lastPortion = patch.lastPortion;
            const clean = normalizeDish({ ...cur, ...pick, id });
            if (!clean) return {};
            return { dishes: (s.dishes ?? []).map((x) => (x.id === id ? clean : x)) };
          }),
        deleteDish: (id) => {
          set((s) => {
            if (!s.dishes?.some((x) => x.id === id)) return {};
            const dishes = orUndefined(s.dishes.filter((x) => x.id !== id));
            const thumbs = { ...(s.dishThumbs ?? {}) };
            delete thumbs[id];
            return { dishes, dishThumbs: Object.keys(thumbs).length ? thumbs : undefined };
          });
          // Azione esplicita: l'archivio prende le miniature come sono, anche se non ne resta nessuna.
          writeArchive(get(), 'esatta');
        },

        setImpactHold: (site, today) =>
          set((s) => {
            const name = site.trim();
            if (!name || !isISODate(today)) return {};
            const plan: Plan = { ...s.plan, impactHold: { site: name, since: today } };
            const r = s.plan.training?.rientro;
            if (s.plan.training && r && r.site === name) {
              const rientro: ReturnPlan = { ...r, stage: 0, since: today };
              delete rientro.physioOk;
              plan.training = { ...s.plan.training, rientro };
            }
            return { plan };
          }),
        clearImpactHold: () =>
          set((s) => {
            if (!s.plan.impactHold) return {};
            const plan = { ...s.plan };
            delete plan.impactHold;
            return { plan };
          }),

        addExclusion: (foodId, origin, since) =>
          set((s) => {
            const id = foodId.trim();
            if (!id || !isISODate(since) || s.plan.exclusions?.some((e) => e.foodId === id)) return {};
            const exclusion: FoodExclusion = { foodId: id, since, origin: EXCLUSION_ORIGINS.has(origin) ? origin : 'impostazioni' };
            return { plan: { ...s.plan, exclusions: [...(s.plan.exclusions ?? []), exclusion] } };
          }),
        removeExclusion: (foodId) =>
          set((s) => {
            if (!s.plan.exclusions?.some((e) => e.foodId === foodId)) return {};
            const plan = { ...s.plan };
            const rest = s.plan.exclusions.filter((e) => e.foodId !== foodId);
            if (rest.length) plan.exclusions = rest;
            else delete plan.exclusions;
            return { plan };
          }),
        markTasteAsked: (foodId, date) =>
          set((s) => {
            const id = foodId.trim();
            if (!id || !isISODate(date)) return {};
            return { plan: { ...s.plan, tasteAsked: { ...(s.plan.tasteAsked ?? {}), [id]: date } } };
          }),

        saveProposal: (p) =>
          set((s) => {
            const list = s.planner?.proposals ?? [];
            const existing = list.find((x) => x.id === p.id);
            // Rigenerare con la stessa base e lo stesso tentativo dà lo stesso id: una proposta decisa non si riapre.
            if (existing && existing.status !== 'aperta') return {};
            const copy = JSON.parse(JSON.stringify(p)) as PlanProposal;
            const at = nowIso();
            const next = list
              .filter((x) => x.id !== p.id)
              .map((x): PlanProposal =>
                copy.status === 'aperta' && x.status === 'aperta' && x.kind === copy.kind && x.effectiveFrom === copy.effectiveFrom
                  ? { ...x, status: 'superata', decidedAt: at }
                  : x,
              );
            return { planner: withProposals(s, [...next, copy]) };
          }),
        updateCoachPass: (id, pass, patch) =>
          set((s) => {
            const list = s.planner?.proposals ?? [];
            const p = list.find((x) => x.id === id);
            // La risposta del coach per una proposta già decisa o superata si ignora.
            if (!p || p.status !== 'aperta') return {};
            const updated: PlanProposal = { ...p, coach: JSON.parse(JSON.stringify(pass)) as CoachPass };
            if (patch) {
              updated.patch = JSON.parse(JSON.stringify(patch)) as PlanPatch;
              updated.source = 'motore+coach';
            }
            return { planner: withProposals(s, list.map((x) => (x.id === id ? updated : x))) };
          }),
        approveProposal: (id, today) => approve(id, today),
        applyDueProposals: (today) => applyDue(today),
        rejectProposal: (id) =>
          set((s) => {
            const list = s.planner?.proposals ?? [];
            if (!list.some((x) => x.id === id && x.status === 'aperta')) return {};
            const at = nowIso();
            return { planner: withProposals(s, list.map((x) => (x.id === id ? { ...x, status: 'scartata', decidedAt: at } : x))) };
          }),
        undoApproval: (proposalId) => {
          const s = get();
          const list = s.planner?.proposals ?? [];
          const p = list.find((x) => x.id === proposalId);
          if (!p || p.status !== 'approvata') return;
          // Già entrata nel piano: tornano i valori di prima. Ancora in attesa: il piano non è cambiato.
          const { plan, profile } = p.before ? applyPatch(s.plan, s.profile, p.before) : { plan: s.plan, profile: s.profile };
          const reopened: PlanProposal = { ...p, status: 'aperta' };
          delete reopened.decidedAt;
          delete reopened.before;
          const removed = (s.planVersions ?? []).some((v) => v.proposalId === proposalId);
          const planVersions = removed ? orUndefined((s.planVersions ?? []).filter((v) => v.proposalId !== proposalId)) : s.planVersions;
          set({ plan, profile, planner: withProposals(s, list.map((x) => (x.id === proposalId ? reopened : x))), planVersions });
          // Azione esplicita: la versione tolta esce anche dall'archivio, anche se era l'ultima.
          if (removed) writeArchive(get(), 'esatta');
        },
        recordBlockSummary: (summary) =>
          set((s) => {
            const clean = normalizeBlockSummary(summary);
            if (!clean) return {};
            const blocks = tidyBlocks([...(s.planner?.blocks ?? []), clean]);
            return { planner: { ...(s.planner ?? { proposals: [] }), blocks } };
          }),

        acknowledgeSupplementCheck: (supplementId, code) =>
          set((s) => {
            const c = code.trim();
            const sup = s.plan.supplements.find((x) => x.id === supplementId);
            if (!c || !sup || sup.acknowledged?.includes(c)) return {};
            return {
              plan: {
                ...s.plan,
                supplements: s.plan.supplements.map((x) => (x.id === supplementId ? { ...x, acknowledged: [...(x.acknowledged ?? []), c] } : x)),
              },
            };
          }),
        recordCoachUsage: (month, delta) =>
          set((s) => {
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return {};
            const cur = s.settings.coachUsage?.[month] ?? { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
            const next = { ...cur };
            for (const k of USAGE_KEYS) {
              const n = finiteNum(delta?.[k]);
              if (n !== undefined && n > 0) next[k] = cur[k] + Math.round(n);
            }
            return { settings: { ...s.settings, coachUsage: { ...(s.settings.coachUsage ?? {}), [month]: next } } };
          }),

        saveCheckIn: (checkIn) =>
          set((s) => {
            const prev = s.checkIns[checkIn.date];
            const merged: CheckIn = { ...prev, ...checkIn, pain: { ...(prev?.pain ?? {}), ...(checkIn.pain ?? {}) } };
            return { checkIns: { ...s.checkIns, [checkIn.date]: merged } };
          }),
        saveWorkout: (log) =>
          set((s) => ({ workoutLogs: upsertBy(s.workoutLogs, log, (w) => w.id === log.id).sort(byDate) })),
        deleteWorkout: (id) => set((s) => ({ workoutLogs: s.workoutLogs.filter((w) => w.id !== id) })),
        saveFootball: (log) =>
          set((s) => ({ footballLogs: upsertBy(s.footballLogs, log, (f) => f.id === log.id).sort(byDate) })),
        deleteFootball: (id) => set((s) => ({ footballLogs: s.footballLogs.filter((f) => f.id !== id) })),
        saveReview: (review) =>
          set((s) => ({
            reviews: upsertBy(s.reviews, review, (r) => r.weekStart === review.weekStart).sort((a, b) =>
              a.weekStart < b.weekStart ? -1 : 1,
            ),
          })),
        applyProposal: (proposal, today) => {
          const a = proposal.apply;
          if (!a || a.type === 'none') return;
          if (a.type === 'planProposal') {
            // La giornata del piano, la stessa con cui le approvate in attesa entrano (fino a poco prima della sveglia è ieri).
            approve(a.id, today ?? planTodayISO(get().plan));
            return;
          }
          set((s) => {
            if (a.type === 'sleepCurrent') return { plan: { ...s.plan, sleep: { ...s.plan.sleep, current: a.value } } };
            if (a.type === 'weekKind') {
              if (!isMonday(a.weekStart) || !OVERRIDE_KINDS.has(a.kind)) return {};
              return { plan: { ...s.plan, weekOverrides: { ...(s.plan.weekOverrides ?? {}), [a.weekStart]: a.kind } } };
            }
            if (a.type === 'kcalDelta') {
              // Limiti dell'energia (§ 2.1): la correzione si taglia perché il deficit non superi 500 kcal né il 20% del
              // dispendio, e il deficit in vigore si scrive anche quando il campo mancava.
              const delta = goalDeltaOf(s.plan, s.profile, s.reviews);
              const value = clampKcalCorrection(a.value, s.plan, s.profile, s.reviews);
              const targets = { ...s.plan.targets };
              if (value !== 0) {
                for (const t of Object.keys(targets) as DayType[]) {
                  const cur = targets[t];
                  // La variazione passa dai carboidrati: proteine e grassi restano fermi.
                  targets[t] = {
                    ...cur,
                    kcal: Math.max(1200, cur.kcal + value),
                    carbG: Math.max(0, round5(cur.carbG + value / 4)),
                  };
                }
              }
              return { plan: { ...s.plan, targets, goalDeltaKcal: delta + value } };
            }
            return {};
          });
        },

        setPhysio: (exercises, prescriptions) => set({ physio: { exercises, prescriptions } }),
        toggleShopping: (weekStart, key) =>
          set((s) => ({ shoppingChecked: { ...s.shoppingChecked, [weekStart]: toggleIn(s.shoppingChecked[weekStart], key) } })),
        togglePrep: (weekStart, taskId) =>
          set((s) => ({ prepDone: { ...s.prepDone, [weekStart]: toggleIn(s.prepDone[weekStart], taskId) } })),

        addChat: (msg) => {
          const id = msg.id ?? uid('m');
          const full: ChatMessage = { ...msg, id, createdAt: msg.createdAt ?? new Date().toISOString() };
          set((s) => ({ chat: [...s.chat, full].slice(-CHAT_LIMIT) }));
          return id;
        },
        updateChat: (id, patch) => set((s) => ({ chat: s.chat.map((m) => (m.id === id ? { ...m, ...patch, id } : m)) })),
        clearChat: () => set({ chat: [] }),

        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        loadDemo: (today) => {
          const s = get();
          if (s.onboarded && !s.settings.demoData) {
            safeStorage.setItem(PRE_DEMO_KEY, JSON.stringify(pickData(s)));
          }
          const demo = buildDemo(today ?? todayISO(), { nowMin: nowMinutes() });
          set({
            ...NO_SECTIONS,
            ...demo,
            settings: {
              ...demo.settings,
              theme: s.settings.theme,
              coachApiKey: s.settings.coachApiKey,
              coachModel: s.settings.coachModel,
              ...keepCoachSettings(s.settings),
              demoData: true,
            },
          });
          writeArchive(get(), 'esatta');
          announceDataReplaced();
        },
        clearDemo: () => {
          const s = get();
          const keep = { theme: s.settings.theme, coachApiKey: s.settings.coachApiKey, coachModel: s.settings.coachModel };
          let restored: AppData | null = null;
          try {
            const raw = safeStorage.getItem(PRE_DEMO_KEY);
            if (typeof raw === 'string') restored = normalizeData(JSON.parse(raw));
          } catch {
            restored = null;
          }
          safeStorage.removeItem(PRE_DEMO_KEY);
          const next = restored ?? { ...defaultAppData(), ...NO_SECTIONS };
          set({ ...NO_SECTIONS, ...next, settings: { ...next.settings, ...keep, ...keepCoachSettings(s.settings), demoData: false } });
          writeArchive(get(), 'esatta');
          announceDataReplaced();
        },
        importData: (data) => {
          if (!isObj(data) || !isObj(data.profile) || !isObj(data.plan)) return false;
          const version = typeof data.version === 'number' ? data.version : 0;
          const next = migrateData(data, version);
          const cur = get().settings;
          set({
            ...NO_SECTIONS,
            ...next,
            settings: { ...next.settings, coachApiKey: next.settings.coachApiKey ?? cur.coachApiKey },
          });
          // Importare sostituisce tutto, archivio freddo compreso.
          writeArchive(get(), 'forza');
          announceDataReplaced();
          return true;
        },
        resetAll: () => {
          safeStorage.removeItem(PRE_DEMO_KEY);
          set({ ...defaultAppData(), ...NO_SECTIONS });
          writeArchive(get(), 'forza');
          announceDataReplaced();
        },

        getDayLog: (date) => get().dayLogs[date] ?? emptyDayLog(date),
      };
    },
    {
      name: STORAGE_KEY,
      version: DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => persistedData(s),
      migrate: (persisted, version) => migrateData(persisted, version),
      // L'archivio freddo si legge qui, in modo sincrono, e si fonde prima di normalizzare: lo stato idratato ha già
      // miniature e versioni. Lo scrittore non parte prima della fine dell'idratazione.
      merge: (persisted, current) => {
        const cold = readArchive();
        const raw = isObj(persisted) ? { ...persisted, ...cold } : persisted;
        return { ...current, ...normalizeData(raw) };
      },
      onRehydrateStorage: () => {
        archiveLoaded = false;
        return (_state, error) => {
          if (!error) archiveLoaded = true;
        };
      },
    },
  ),
);

// Scrittore dell'archivio freddo: quando cambiano i riferimenti di miniature o versioni, dopo l'idratazione.
useApp.subscribe((s, prev) => {
  if (s.dishThumbs !== prev.dishThumbs || s.planVersions !== prev.planVersions) writeArchive(s, 'aggiorna');
});

// ───────────────────────── Selettori comodi ─────────────────────────

/** Peso più recente dai controlli del mattino, altrimenti quello di partenza (0 se ignoto). */
export function latestWeight(s: Pick<AppData, 'checkIns' | 'profile'>): number {
  const dates = Object.keys(s.checkIns).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    const w = s.checkIns[dates[i]]?.weightKg;
    if (typeof w === 'number' && w > 0) return w;
  }
  return s.profile.startWeightKg;
}

// ───────────────────────── Store dell'interfaccia ─────────────────────────

export type ToastTone = 'neutral' | 'good' | 'warn' | 'bad';

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  /** Azione facoltativa, es. "Annulla". */
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  /** Default 3200 ms (5000 con un'azione). */
  durationMs?: number;
}

export interface UiState {
  overlay: Overlay;
  open: (overlay: NonNullable<Overlay>) => void;
  close: () => void;
  toasts: ToastItem[];
  /** Mostra un messaggio breve. Restituisce l'id del toast. */
  toast: (message: string, tone?: ToastTone, opts?: ToastOptions) => string;
  dismissToast: (id: string) => void;
}

export const useUi = create<UiState>()((set) => ({
  overlay: null,
  open: (overlay) => set({ overlay }),
  close: () => set({ overlay: null }),
  toasts: [],
  toast: (message, tone = 'neutral', opts = {}) => {
    const id = uid('t');
    const durationMs = opts.durationMs ?? (opts.onAction ? 5000 : 3200);
    set((s) => ({
      toasts: [...s.toasts.slice(-2), { id, message, tone, actionLabel: opts.actionLabel, onAction: opts.onAction, durationMs }],
    }));
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
