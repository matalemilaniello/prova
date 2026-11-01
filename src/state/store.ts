/**
 * Stato dell'app.
 *
 * - `useApp`: dati persistiti (forma AppData) + azioni. localStorage 'ritmo:v1', con version e migrate.
 * - `useUi`: stato dell'interfaccia non persistito (pannello aperto, coda dei toast).
 *
 * Se a una schermata serve un'azione che qui manca, la implementa nel proprio modulo con
 * `useApp.setState(...)` senza modificare questo file.
 */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type {
  AppData,
  ChatMessage,
  CheckIn,
  DayLog,
  DayType,
  Exercise,
  FootballEvent,
  FootballLog,
  ISODate,
  ItemStatus,
  MacroTarget,
  MealSlot,
  Overlay,
  Plan,
  Profile,
  Proposal,
  ScheduleDay,
  SessionExercise,
  Settings,
  Supplement,
  WeeklyReview,
  Weekday,
  WorkoutLog,
} from '../domain/types';
import { DATA_VERSION, STORAGE_KEY, defaultAppData, defaultPlan, DEFAULT_PROFILE, DEFAULT_SETTINGS, DEFAULT_TARGETS } from '../data/defaults';
import { buildDemo } from '../demo/seed';
import { isHHMM, isISODate, nowMinutes, todayISO } from '../engine/dates';
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
        .toast('Spazio del telefono pieno: esporta un backup e togli le foto vecchie dalla chat', 'bad', { durationMs: 9000 });
    } catch {
      /* interfaccia non ancora pronta */
    }
  }, 0);
}

/** True se l'ultima scrittura su localStorage non è riuscita per spazio esaurito. */
export function storageFull(): boolean {
  return quotaWarned;
}

export const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      const v = globalThis.localStorage?.getItem(k);
      if (v !== null && v !== undefined) return v;
    } catch {
      /* non disponibile */
    }
    return memory.get(k) ?? null;
  },
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
  } as ScheduleDay);
}

function normalizePlan(raw: unknown, fallbackStart: ISODate): Plan {
  const base = defaultPlan(fallbackStart);
  if (!isObj(raw)) return base;
  const p = raw as Record<string, unknown>;
  const week: ScheduleDay[] = base.week.map((d, i) => {
    const list = Array.isArray(p.week) ? p.week : [];
    const src = list.find((w) => isObj(w) && w.weekday === i) ?? list[i];
    return isObj(src) ? normalizeScheduleDay(src, d, i as Weekday) : d;
  });
  const sleepRaw = isObj(p.sleep) ? p.sleep : {};
  const mealRaw = isObj(p.mealTimes) ? p.mealTimes : {};
  const supplements = Array.isArray(p.supplements)
    ? p.supplements
        .filter((x): x is Record<string, unknown> => isObj(x) && typeof x.id === 'string' && typeof x.name === 'string')
        .map((x) =>
          compact({
            ...(x as Partial<Supplement>),
            id: x.id as string,
            name: x.name as string,
            dose: str(x.dose, ''),
            timing: TIMINGS.has(str(x.timing, '')) ? (x.timing as Supplement['timing']) : 'colazione',
            note: optStr(x.note),
            active: x.active !== false,
          } as Supplement),
        )
    : base.supplements;
  return {
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
    startDate: isISODate(p.startDate) ? p.startDate : base.startDate,
  };
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
  } as Profile);
}

/** Gesti di prova per zona: solo testi non vuoti; senza nessuno il campo sparisce. */
function normalizePainTests(raw: unknown): Profile['painTests'] {
  if (!isObj(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [site, text] of Object.entries(raw)) if (typeof text === 'string' && text.trim()) out[site] = text.trim();
  return Object.keys(out).length ? out : undefined;
}

function normalizeDayLogs(raw: unknown): AppData['dayLogs'] {
  if (!isObj(raw)) return {};
  const out: AppData['dayLogs'] = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isISODate(k) || !isObj(v)) continue;
    const status: Record<string, ItemStatus> = {};
    if (isObj(v.status)) for (const [id, st] of Object.entries(v.status)) if (ITEM_STATUSES.has(str(st, ''))) status[id] = st as ItemStatus;
    out[k] = {
      ...(v as Partial<DayLog>),
      date: k,
      status,
      notes: strRecord(v.notes),
      minimal: v.minimal === true,
      waterGlasses: clampN(Math.round(num(v.waterGlasses, 0)), 0, 40),
      sweets: clampN(Math.round(num(v.sweets, 0)), 0, 20),
      recipeSwaps: strRecord(v.recipeSwaps, (slot) => MEAL_SLOT_SET.has(slot)),
    };
  }
  return out;
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
  return raw.filter(hasIdAndDate).map((w) => ({
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
      } as WeeklyReview);
    });
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
  } as Settings);
}

/**
 * Completa e ripara qualunque oggetto simile ad AppData (stato salvato, backup importato): ogni sezione
 * torna della forma giusta, le voci illeggibili si scartano, i numeri si ricavano anche da stringhe.
 */
export function normalizeData(raw: unknown): AppData {
  const base = defaultAppData();
  if (!isObj(raw)) return base;
  const d = raw as Record<string, unknown>;
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
];

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

/** Dati da scrivere in localStorage: come `pickData`, con le foto della chat limitate. */
export function persistedData(s: AppData): AppData {
  const data = pickData(s);
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
  /** Ricetta al posto di quella del menù; null torna al menù. */
  swapRecipe: (date: ISODate, slot: MealSlot, recipeId: string | null) => void;

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
  /** Applica una proposta della revisione: 'sleepCurrent' e 'kcalDelta'; 'none' non cambia il piano. */
  applyProposal: (proposal: Proposal) => void;

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

      return {
        ...defaultAppData(),

        completeOnboarding: (profile, plan) =>
          set((s) => ({ profile, plan, onboarded: true, settings: { ...s.settings, demoData: false } })),
        updateProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
        updatePlan: (patch) => set((s) => ({ plan: { ...s.plan, ...patch } })),
        setTarget: (dayType, patch) =>
          set((s) => ({
            plan: { ...s.plan, targets: { ...s.plan.targets, [dayType]: { ...s.plan.targets[dayType], ...patch } } },
          })),
        setScheduleDay: (weekday, patch) =>
          set((s) => ({
            plan: {
              ...s.plan,
              week: s.plan.week.map((d) => (d.weekday === weekday ? ({ ...d, ...patch, weekday } as ScheduleDay) : d)),
            },
          })),

        setItemStatus: (date, itemId, status, note) =>
          patchDay(date, (d) => {
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
        swapRecipe: (date, slot, recipeId) =>
          patchDay(date, (d) => {
            if (recipeId) d.recipeSwaps[slot] = recipeId;
            else delete d.recipeSwaps[slot];
            return d;
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
        applyProposal: (proposal) =>
          set((s) => {
            const a = proposal.apply;
            if (!a || a.type === 'none') return {};
            if (a.type === 'sleepCurrent') return { plan: { ...s.plan, sleep: { ...s.plan.sleep, current: a.value } } };
            if (a.type === 'kcalDelta') {
              const targets = { ...s.plan.targets };
              for (const t of Object.keys(targets) as DayType[]) {
                const cur = targets[t];
                // La variazione passa dai carboidrati: proteine e grassi restano fermi.
                targets[t] = {
                  ...cur,
                  kcal: Math.max(1200, cur.kcal + a.value),
                  carbG: Math.max(0, round5(cur.carbG + a.value / 4)),
                };
              }
              return { plan: { ...s.plan, targets } };
            }
            return {};
          }),

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
            ...demo,
            settings: {
              ...demo.settings,
              theme: s.settings.theme,
              coachApiKey: s.settings.coachApiKey,
              coachModel: s.settings.coachModel,
              demoData: true,
            },
          });
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
          const next = restored ?? defaultAppData();
          set({ ...next, settings: { ...next.settings, ...keep, demoData: false } });
          announceDataReplaced();
        },
        importData: (data) => {
          if (!isObj(data) || !isObj(data.profile) || !isObj(data.plan)) return false;
          const version = typeof data.version === 'number' ? data.version : 0;
          const next = migrateData(data, version);
          const cur = get().settings;
          set({
            ...next,
            settings: { ...next.settings, coachApiKey: next.settings.coachApiKey ?? cur.coachApiKey },
          });
          announceDataReplaced();
          return true;
        },
        resetAll: () => {
          safeStorage.removeItem(PRE_DEMO_KEY);
          set({ ...defaultAppData() });
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
      merge: (persisted, current) => ({ ...current, ...normalizeData(persisted) }),
    },
  ),
);

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
