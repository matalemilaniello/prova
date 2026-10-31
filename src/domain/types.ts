/**
 * Ritmo · contratto dei dati.
 *
 * Questo file è la fonte di verità condivisa da tutti i moduli.
 * Non cambiare nomi o forme senza aggiornare docs/SPEC.md.
 * I dati personali dell'utente NON vanno mai scritti nel codice:
 * vivono solo nello stato salvato sul dispositivo.
 */

// ───────────────────────── Primitivi ─────────────────────────

/** Data locale nel formato 'YYYY-MM-DD'. */
export type ISODate = string;
/** Orario locale nel formato 'HH:MM' (24 ore). */
export type HHMM = string;
/** Giorno della settimana in ordine italiano: 0 = lunedì … 6 = domenica. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DayType = 'calcio' | 'palestra' | 'leggero' | 'riposo';

export interface MacroTarget {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
}

export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number;
}

// ───────────────────────── Profilo e piano ─────────────────────────

export type Goal = 'ricomposizione' | 'dimagrimento' | 'massa' | 'mantenimento';

export interface Profile {
  name?: string;
  sex: 'M' | 'F';
  birthYear: number;
  heightCm: number;
  /** Peso di partenza; il peso attuale si legge dai controlli del mattino. */
  startWeightKg: number;
  goal: Goal;
  /** Competenze dichiarate dall'utente (es. "allenatore"), usate dal coach per il tono. */
  expertise?: string;
  /** Zone di dolore da monitorare, scelte dall'utente (es. ['Tibia', 'Gomito']). */
  painSites: string[];
  /** Litri d'acqua al giorno. */
  waterTargetL: number;
}

export type FootballKind = 'partita' | 'calcetto' | 'allenamento';

export interface FootballEvent {
  kind: FootballKind;
  time: HHMM;
  durationMin: number;
}

export interface ScheduleDay {
  weekday: Weekday;
  dayType: DayType;
  football?: FootballEvent;
  /** Id della seduta di palestra ('A' | 'B' | 'C'). */
  gymSessionId?: string;
  gymTime?: HHMM;
  gymOptional?: boolean;
  /** Esercizi del fisioterapista in questo giorno. */
  physio?: boolean;
}

export interface Supplement {
  id: string;
  name: string;
  dose: string;
  timing: 'colazione' | 'pranzo' | 'cena' | 'sera';
  note?: string;
  active: boolean;
}

export interface SleepPlan {
  /** Sveglia fissa. */
  wake: HHMM;
  /** Orario a letto di questa fase del piano (avanza con la revisione). */
  current: HHMM;
  /** Orario a letto finale. */
  target: HHMM;
  /** Minuti di anticipo per ogni passo. */
  stepMin: number;
  /** Minuti prima di andare a letto in cui scatta il coprifuoco del telefono. */
  curfewLeadMin: number;
}

export interface MealTimes {
  colazione: HHMM;
  spuntino: HHMM;
  pranzo: HHMM;
  merenda: HHMM;
  cena: HHMM;
}

export interface Plan {
  targets: Record<DayType, MacroTarget>;
  /** Sempre 7 elementi, dal lunedì alla domenica. */
  week: ScheduleDay[];
  supplements: Supplement[];
  sleep: SleepPlan;
  mealTimes: MealTimes;
  /** Dolci previsti nel piano ogni settimana. */
  sweetsPerWeek: number;
  /** Lunedì in cui è iniziato il piano. */
  startDate: ISODate;
  /** Soglia di dolore (0-10) oltre la quale l'app frena il carico. */
  painThreshold: number;
}

// ───────────────────────── Alimentazione ─────────────────────────

export type MealSlot = 'colazione' | 'spuntino' | 'pranzo' | 'merenda' | 'cena';

export type PortionUnit =
  | 'palmo'
  | 'pugno'
  | 'mano a coppa'
  | 'pollice'
  | 'cucchiaio'
  | 'cucchiaino'
  | 'pezzo'
  | 'vasetto'
  | 'fetta'
  | 'manciata'
  | 'tazza'
  | 'bicchiere'
  | 'g'
  | 'ml';

export type ShopCategory =
  | 'Frutta e verdura'
  | 'Surgelati'
  | 'Carne e pesce'
  | 'Latticini e uova'
  | 'Pane e cereali'
  | 'Legumi'
  | 'Dispensa'
  | 'Condimenti';

export interface Food {
  id: string;
  name: string;
  category: ShopCategory;
  /** Valori per 100 g nello stato in cui si mangia (es. riso cotto, legumi sgocciolati). */
  per100g: Nutrients;
  /** Grammi corrispondenti a una unità di porzione (es. { pugno: 150, palmo: 120 }). */
  unitGrams: Partial<Record<PortionUnit, number>>;
  /** Grammi da comprare per ogni grammo mangiato (es. riso cotto → crudo ≈ 0.4). Default 1. */
  buyFactor?: number;
  /** Etichetta di acquisto leggibile, es. 'confezione da 400 g'. */
  buyLabel?: string;
  /** Conta come porzione di frutta o verdura ogni N grammi (es. 80). */
  vegPortionG?: number;
  /** Prodotto da dispensa che di solito si ha già (olio, sale, spezie). */
  pantry?: boolean;
}

export interface IngredientLine {
  foodId: string;
  qty: number;
  unit: PortionUnit;
  /** Se true la quantità si adatta al tipo di giorno (carboidrati). */
  carbScaled?: boolean;
  note?: string;
}

export interface Recipe {
  id: string;
  name: string;
  slots: MealSlot[];
  /** Porzione di riferimento: giorno di palestra. */
  ingredients: IngredientLine[];
  steps: string[];
  prepMin: number;
  /** Si prepara nella preparazione della domenica. */
  batch?: boolean;
  tags: string[];
  /** Ricette alternative per lo stesso pasto. */
  swaps?: string[];
}

export interface MenuDay {
  meals: Partial<Record<MealSlot, string>>;
}

export interface PrepTask {
  id: string;
  title: string;
  minutes: number;
  /** Cosa produce, es. 'riso per 4 pranzi'. */
  yields: string;
  recipeIds?: string[];
}

export interface MenuWeek {
  /** 7 giorni, dal lunedì alla domenica. */
  days: MenuDay[];
  prep: PrepTask[];
}

export interface BarOption {
  id: string;
  name: string;
  verdict: 'si' | 'meglio' | 'programmato';
  why: string;
  /** Stima indicativa. */
  approx: Nutrients;
}

// ───────────────────────── Allenamento ─────────────────────────

export type ExerciseCategory =
  | 'spinta'
  | 'tirata'
  | 'gambe'
  | 'core'
  | 'prevenzione'
  | 'mobilita'
  | 'riscaldamento'
  | 'fisio';

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  equipment: string;
  cues: string[];
  /** Adatto con dolore al gomito (presa neutra, poco carico sugli estensori). */
  elbowFriendly?: boolean;
  /** Id di esercizi alternativi. */
  alternatives?: string[];
  /** Testo per cercare un video dimostrativo. */
  videoQuery?: string;
}

export interface SessionExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  unit: 'reps' | 'secondi';
  /** Ripetizioni di riserva. */
  rir?: number;
  restSec: number;
  progression: 'doppia' | 'nessuna';
  /** Incremento di carico quando la progressione doppia lo consente. */
  incrementKg?: number;
  /** Per lato (esercizi unilaterali). */
  perSide?: boolean;
  note?: string;
}

export interface WorkoutBlock {
  title: string;
  items: SessionExercise[];
}

export interface WorkoutSession {
  id: string;
  name: string;
  subtitle: string;
  estMin: number;
  focus: string;
  blocks: WorkoutBlock[];
}

// ───────────────────────── Giornata e diario ─────────────────────────

export type TimelineKind =
  | 'controllo'
  | 'integratori'
  | 'pasto'
  | 'palestra'
  | 'calcio'
  | 'fisio'
  | 'coprifuoco'
  | 'letto'
  | 'minima';

export interface TimelineItem {
  /** Stabile per data: es. 'pasto:pranzo', 'palestra:A', 'minima:frutto'. */
  id: string;
  time: HHMM;
  kind: TimelineKind;
  title: string;
  detail?: string;
  /** Riferimento: id ricetta, id seduta, tipo di calcio… */
  ref?: string;
  slot?: MealSlot;
}

export type ItemStatus = 'fatto' | 'sostituito' | 'saltato';

export interface DayLog {
  date: ISODate;
  status: Record<string, ItemStatus>;
  /** Cosa hai mangiato o fatto al posto di quanto previsto. */
  notes: Record<string, string>;
  /** Giornata minima attiva. */
  minimal: boolean;
  /** Bicchieri d'acqua da 250 ml. */
  waterGlasses: number;
  /** Dolci mangiati oggi (previsti e non). */
  sweets: number;
  /** Ricetta scelta al posto di quella del menù, per pasto. */
  recipeSwaps: Partial<Record<MealSlot, string>>;
}

export interface CheckIn {
  date: ISODate;
  weightKg?: number;
  bedTime?: HHMM;
  wakeTime?: HHMM;
  sleepHours?: number;
  /** 1 (pessima) … 5 (ottima). */
  sleepQuality?: number;
  /** Dolore 0-10 per zona. */
  pain: Record<string, number>;
  /** Energia 1-10. */
  energy?: number;
}

export interface SetLog {
  weightKg: number;
  reps: number;
  done: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  sets: SetLog[];
  /** Esercizio sostituito con un'alternativa. */
  swappedFrom?: string;
}

export interface WorkoutLog {
  id: string;
  date: ISODate;
  sessionId: string;
  durationMin: number;
  /** Fatica percepita della seduta, 1-10. */
  rpe: number;
  pain: Record<string, number>;
  exercises: ExerciseLog[];
  notes?: string;
}

export interface FootballLog {
  id: string;
  date: ISODate;
  kind: FootballKind;
  durationMin: number;
  rpe: number;
}

export interface WeeklyReview {
  /** Lunedì della settimana rivista. */
  weekStart: ISODate;
  votes: { energia: number; digestione: number; umore: number; campo: number };
  waistCm?: number;
  /** Pliche in mm, per sito. */
  skinfolds?: Record<string, number>;
  acceptedProposals: string[];
  note?: string;
}

export interface Proposal {
  id: string;
  area: 'sonno' | 'calorie' | 'fibre' | 'allenamento' | 'dolore' | 'dolci' | 'peso' | 'scarico';
  title: string;
  reason: string;
  /** Proposta applicabile automaticamente al piano. */
  apply?: { type: 'sleepCurrent'; value: HHMM } | { type: 'kcalDelta'; value: number } | { type: 'none' };
}

// ───────────────────────── Coach ─────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Immagine allegata, data URL JPEG ridotta. */
  image?: string;
  createdAt: string;
  error?: boolean;
}

// ───────────────────────── Impostazioni e stato ─────────────────────────

export type ThemePref = 'sistema' | 'scuro' | 'chiaro';

export interface Settings {
  theme: ThemePref;
  coachApiKey?: string;
  coachModel: string;
  /** Dati di esempio caricati: l'interfaccia lo segnala sempre. */
  demoData: boolean;
}

export type Overlay =
  | { type: 'recipe'; recipeId: string; date: ISODate; slot?: MealSlot }
  | { type: 'checkin'; date: ISODate }
  | { type: 'session'; sessionId: string; date: ISODate }
  | { type: 'football'; date: ISODate; kind: FootballKind; itemId: string }
  | { type: 'barPlanB' }
  | null;

export interface AppData {
  version: number;
  onboarded: boolean;
  profile: Profile;
  plan: Plan;
  dayLogs: Record<ISODate, DayLog>;
  checkIns: Record<ISODate, CheckIn>;
  workoutLogs: WorkoutLog[];
  footballLogs: FootballLog[];
  reviews: WeeklyReview[];
  /** Esercizi del fisioterapista inseriti dall'utente. */
  physio: { exercises: Exercise[]; prescriptions: SessionExercise[] };
  /** Voci della spesa spuntate, per lunedì della settimana. */
  shoppingChecked: Record<ISODate, string[]>;
  /** Attività della preparazione domenicale completate, per lunedì. */
  prepDone: Record<ISODate, string[]>;
  chat: ChatMessage[];
  settings: Settings;
}
