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
  WeeklyReview,
  Weekday,
  WorkoutLog,
} from '../domain/types';
import { DATA_VERSION, STORAGE_KEY, defaultAppData, defaultPlan, DEFAULT_PROFILE, DEFAULT_SETTINGS, DEFAULT_TARGETS } from '../data/defaults';
import { buildDemo } from '../demo/seed';
import { isISODate, nowMinutes, todayISO } from '../engine/dates';
import { uid } from '../lib/id';

// ───────────────────────── Storage sicuro ─────────────────────────

/** In anteprima o in navigazione privata localStorage può mancare: si ripiega sulla memoria, senza avvisi. */
const memory = new Map<string, string>();
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
    } catch {
      /* quota piena o storage bloccato: resta in memoria */
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

function normalizePlan(raw: unknown, fallbackStart: ISODate): Plan {
  const base = defaultPlan(fallbackStart);
  if (!isObj(raw)) return base;
  const p = raw as Partial<Plan>;
  const targets = { ...base.targets };
  if (isObj(p.targets)) {
    for (const t of Object.keys(DEFAULT_TARGETS) as DayType[]) {
      const v = (p.targets as Record<string, unknown>)[t];
      if (isObj(v)) targets[t] = { ...base.targets[t], ...(v as Partial<MacroTarget>) };
    }
  }
  const week: ScheduleDay[] = base.week.map((d, i) => {
    const src = Array.isArray(p.week) ? p.week.find((w) => isObj(w) && w.weekday === i) ?? p.week[i] : undefined;
    return isObj(src) ? ({ ...d, ...(src as ScheduleDay), weekday: i as Weekday } as ScheduleDay) : d;
  });
  return {
    ...base,
    ...p,
    targets,
    week,
    supplements: Array.isArray(p.supplements) ? p.supplements : base.supplements,
    sleep: { ...base.sleep, ...(isObj(p.sleep) ? p.sleep : {}) },
    mealTimes: { ...base.mealTimes, ...(isObj(p.mealTimes) ? p.mealTimes : {}) },
    startDate: isISODate(p.startDate) ? p.startDate : base.startDate,
  };
}

/** Completa con i valori predefiniti qualunque oggetto simile ad AppData (stato salvato, backup importato). */
export function normalizeData(raw: unknown): AppData {
  const base = defaultAppData();
  if (!isObj(raw)) return base;
  const d = raw as Partial<AppData>;
  const physio = isObj(d.physio) ? (d.physio as AppData['physio']) : base.physio;
  return {
    version: DATA_VERSION,
    onboarded: Boolean(d.onboarded),
    profile: { ...DEFAULT_PROFILE, ...(isObj(d.profile) ? (d.profile as Partial<Profile>) : {}) },
    plan: normalizePlan(d.plan, base.plan.startDate),
    dayLogs: isObj(d.dayLogs) ? (d.dayLogs as AppData['dayLogs']) : {},
    checkIns: isObj(d.checkIns) ? (d.checkIns as AppData['checkIns']) : {},
    workoutLogs: Array.isArray(d.workoutLogs) ? d.workoutLogs : [],
    footballLogs: Array.isArray(d.footballLogs) ? d.footballLogs : [],
    reviews: Array.isArray(d.reviews) ? d.reviews : [],
    physio: {
      exercises: Array.isArray(physio.exercises) ? physio.exercises : [],
      prescriptions: Array.isArray(physio.prescriptions) ? physio.prescriptions : [],
    },
    shoppingChecked: isObj(d.shoppingChecked) ? (d.shoppingChecked as AppData['shoppingChecked']) : {},
    prepDone: isObj(d.prepDone) ? (d.prepDone as AppData['prepDone']) : {},
    chat: Array.isArray(d.chat) ? d.chat : [],
    settings: { ...DEFAULT_SETTINGS, ...(isObj(d.settings) ? (d.settings as Partial<Settings>) : {}) },
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
          return true;
        },
        resetAll: () => {
          safeStorage.removeItem(PRE_DEMO_KEY);
          set({ ...defaultAppData() });
        },

        getDayLog: (date) => get().dayLogs[date] ?? emptyDayLog(date),
      };
    },
    {
      name: STORAGE_KEY,
      version: DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => pickData(s),
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
