/**
 * Valori predefiniti generici ("calciatore amatoriale che va in palestra").
 * Nessun dato personale: l'utente li conferma o li cambia nell'onboarding
 * e tutto resta salvato solo sul dispositivo.
 */
import type {
  AppData,
  DayType,
  ISODate,
  MacroTarget,
  MealTimes,
  Plan,
  Profile,
  ScheduleDay,
  Settings,
  SleepPlan,
  Supplement,
} from '../domain/types';
import { todayISO, weekStart } from '../engine/dates';

/** Versione della forma dei dati salvati (AppData.version e persist di zustand). */
export const DATA_VERSION = 2;

/** Chiave di localStorage. */
export const STORAGE_KEY = 'ritmo:v1';

/** Modello predefinito del coach. */
export const DEFAULT_COACH_MODEL = 'claude-opus-5-5';

/** Zone di dolore suggerite: l'utente sceglie quali monitorare. */
export const SUGGESTED_PAIN_SITES = [
  'Tibia',
  'Gomito',
  'Ginocchio',
  'Flessori',
  'Adduttori',
  'Caviglia',
  'Schiena',
  'Spalla',
] as const;

/**
 * Profilo vuoto: anno di nascita, altezza e peso valgono 0 finché l'utente non li inserisce.
 * Usa `isProfileComplete` per sapere se sono stati compilati.
 */
export const DEFAULT_PROFILE: Profile = {
  sex: 'M',
  birthYear: 0,
  heightCm: 0,
  startWeightKg: 0,
  goal: 'ricomposizione',
  painSites: [],
  waterTargetL: 2.5,
};

export function isProfileComplete(p: Profile): boolean {
  return p.birthYear > 1900 && p.heightCm > 0 && p.startWeightKg > 0;
}

export const DEFAULT_TARGETS: Record<DayType, MacroTarget> = {
  calcio: { kcal: 2800, proteinG: 135, fatG: 80, carbG: 385, fiberG: 35 },
  palestra: { kcal: 2600, proteinG: 135, fatG: 80, carbG: 335, fiberG: 35 },
  leggero: { kcal: 2450, proteinG: 132, fatG: 80, carbG: 300, fiberG: 35 },
  riposo: { kcal: 2300, proteinG: 130, fatG: 80, carbG: 265, fiberG: 35 },
};

/** Settimana tipo, dal lunedì (0) alla domenica (6). */
export const DEFAULT_WEEK: ScheduleDay[] = [
  { weekday: 0, dayType: 'calcio', football: { kind: 'partita', time: '21:00', durationMin: 90 }, physio: true },
  { weekday: 1, dayType: 'palestra', gymSessionId: 'A', gymTime: '17:00' },
  { weekday: 2, dayType: 'calcio', football: { kind: 'calcetto', time: '21:00', durationMin: 60 }, physio: true },
  { weekday: 3, dayType: 'calcio', football: { kind: 'allenamento', time: '20:30', durationMin: 90 } },
  { weekday: 4, dayType: 'palestra', gymSessionId: 'B', gymTime: '17:00' },
  { weekday: 5, dayType: 'leggero', gymSessionId: 'C', gymTime: '11:00', gymOptional: true },
  { weekday: 6, dayType: 'riposo' },
];

export const DEFAULT_SUPPLEMENTS: Supplement[] = [
  { id: 'creatina', name: 'Creatina monoidrato', dose: '5 g', timing: 'colazione', active: true },
  { id: 'omega3', name: 'Omega-3', dose: '1-2 g di EPA+DHA', timing: 'colazione', active: true },
  {
    id: 'vitamina-d',
    name: 'Vitamina D',
    dose: 'Dose da definire con l’esame',
    timing: 'colazione',
    note: 'Da confermare con il medico dopo il dosaggio nel sangue.',
    active: true,
  },
];

export const DEFAULT_SLEEP: SleepPlan = {
  wake: '07:15',
  current: '00:45',
  target: '23:30',
  stepMin: 15,
  curfewLeadMin: 30,
};

export const DEFAULT_MEAL_TIMES: MealTimes = {
  colazione: '07:30',
  spuntino: '10:30',
  pranzo: '14:15',
  merenda: '16:30',
  cena: '20:30',
};

export const DEFAULT_SWEETS_PER_WEEK = 3;
export const DEFAULT_PAIN_THRESHOLD = 3;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'sistema',
  coachModel: DEFAULT_COACH_MODEL,
  demoData: false,
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Piano predefinito che inizia il lunedì della settimana di `startDate` (default: oggi). */
export function defaultPlan(startDate: ISODate = todayISO()): Plan {
  return {
    targets: clone(DEFAULT_TARGETS),
    week: clone(DEFAULT_WEEK),
    supplements: clone(DEFAULT_SUPPLEMENTS),
    sleep: { ...DEFAULT_SLEEP },
    mealTimes: { ...DEFAULT_MEAL_TIMES },
    sweetsPerWeek: DEFAULT_SWEETS_PER_WEEK,
    startDate: weekStart(startDate),
    painThreshold: DEFAULT_PAIN_THRESHOLD,
  };
}

/** Stato iniziale completo, non ancora configurato (onboarding da fare). */
export function defaultAppData(today: ISODate = todayISO()): AppData {
  return {
    version: DATA_VERSION,
    onboarded: false,
    profile: clone(DEFAULT_PROFILE),
    plan: defaultPlan(today),
    dayLogs: {},
    checkIns: {},
    workoutLogs: [],
    footballLogs: [],
    reviews: [],
    physio: { exercises: [], prescriptions: [] },
    shoppingChecked: {},
    prepDone: {},
    chat: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
