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
import { addDays, todayISO, weekdayOf, weekStart } from '../engine/dates';
import { CATALOG_VERSION } from './supplementCatalogIds';

/**
 * Versione della forma dei dati salvati (AppData.version e persist di zustand). La 4 (fase 2) non cambia valori: serve
 * perché un'app vecchia rifiuti un backup nuovo invece di perdere in silenzio piatti, proposte e versioni.
 */
export const DATA_VERSION = 4;

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

/**
 * Caffeina di un espresso, in mg: una stima dentro un intervallo di circa 60-110 mg per tazza, che varia molto con la
 * miscela e la preparazione (EFSA 2015, parere sulla sicurezza della caffeina: circa 80 mg per un espresso; da
 * controllare sulla fonte primaria nell'onda 3A). Un solo numero in tutta l'app: il testo sul caffè (fino a 400 mg al
 * giorno, «circa 4-5 espressi») e la somma della caffeina degli integratori (`Plan.coffeePerDay`), che dice sempre
 * «circa». Non è la dose dello studio sul sonno (107 mg), che è un'altra cosa.
 */
export const ESPRESSO_CAFFEINE_MG = 80;

/**
 * Integratori per chi comincia, dal catalogo (`scripts/data/supplement-catalog.json`, docs/FASE2.md § 9.7): stessi id
 * della fase 1 con la voce del catalogo e la sua dose predefinita, tutti con la colazione.
 * - creatina 3 g: etichetta italiana e claim UE (l'AIS indica 3-5 g);
 * - omega-3 600 mg di EPA+DHA: mantenimento AIS (500-600 mg);
 * - vitamina D 15 µg (600 UI): fabbisogno EFSA; la Endocrine Society 2024 sconsiglia negli adulti tra 19 e 74 anni
 *   l'integrazione empirica sopra la DRI. Per una dose di mantenimento l'esame non serve; serve sopra i 50 µg.
 * `catalogVersion` è già segnata: la revisione degli integratori non li ripropone.
 */
export const DEFAULT_SUPPLEMENTS: Supplement[] = [
  {
    id: 'creatina',
    name: 'Creatina monoidrato',
    dose: '3 g',
    timing: 'colazione',
    active: true,
    catalogId: 'creatina',
    amount: { amount: 3, unit: 'g' },
    catalogVersion: CATALOG_VERSION,
  },
  {
    id: 'omega3',
    name: 'Omega-3',
    dose: '600 mg di EPA+DHA',
    timing: 'colazione',
    active: true,
    catalogId: 'omega-3',
    amount: { amount: 600, unit: 'mg' },
    catalogVersion: CATALOG_VERSION,
  },
  {
    id: 'vitamina-d',
    name: 'Vitamina D',
    dose: '15 µg',
    timing: 'colazione',
    active: true,
    catalogId: 'vitamina-d',
    amount: { amount: 15, unit: 'µg' },
    catalogVersion: CATALOG_VERSION,
  },
];

/**
 * Integratori predefiniti della fase 1, scritti a mano: è il piano di chi ha cominciato prima del catalogo (la vitamina
 * D con la dose da definire). Non si usano per i nuovi utenti: servono alla migrazione (§ 9.7, «Rivedi gli integratori»)
 * e ai test del comportamento di quei piani, che resta com'era.
 */
export const LEGACY_DEFAULT_SUPPLEMENTS: readonly Supplement[] = [
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

/**
 * Sonno. L'obiettivo è un orario a letto: dalle 23:15 alle 07:15 sono 8 ore a letto, circa 7 di sonno vero
 * (efficienza dell'85-90%), il minimo raccomandato per un adulto che si allena.
 */
export const DEFAULT_SLEEP: SleepPlan = {
  wake: '07:15',
  current: '00:45',
  target: '23:15',
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

/**
 * Lunedì da cui parte il piano per chi finisce il benvenuto in `today`. Dal lunedì al giovedì è il lunedì di
 * questa settimana (la prima settimana conta dal primo avvio, `Plan.firstUse`); dal venerdì alla domenica è il
 * lunedì dopo, così chi comincia la domenica sera vive lunedì la sua settimana 1, non la 2, e non trova la
 * revisione di una settimana mai vissuta. I giorni prima sono di avvio (vedi `isStarterDay` in engine/menu).
 */
export function planStartFor(today: ISODate = todayISO()): ISODate {
  return weekdayOf(today) <= 3 ? weekStart(today) : addDays(weekStart(today), 7);
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
