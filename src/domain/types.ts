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
  /** Competenze dichiarate dall'utente (es. "preparatore atletico"), usate dal coach per il tono. */
  expertise?: string;
  /** Zone di dolore da monitorare, scelte dall'utente (es. ['Tibia', 'Gomito']). */
  painSites: string[];
  /**
   * Gesto di prova del dolore per zona, indicato dal fisioterapista (chiave: nome della zona). Facoltativo:
   * senza, il controllo del mattino propone un gesto standard per la zona.
   */
  painTests?: Record<string, string>;
  /** Litri d'acqua al giorno. */
  waterTargetL: number;
  /** Fumo: chiesto solo quando un prodotto contiene beta-carotene (fase 2, § 9.4). */
  smoker?: 'mai' | 'ex' | 'si';
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
  /** Testo della dose, come lo legge l'utente (scritto a mano o da `formatDose` del catalogo). */
  dose: string;
  timing: 'colazione' | 'pranzo' | 'cena' | 'sera';
  note?: string;
  active: boolean;
  // Campi della fase 2 (§ 9): tutti facoltativi; senza `catalogId` l'integratore è «scritto a mano».
  /** Voce del catalogo (`CATALOG_IDS` in data/supplementCatalogIds.ts). */
  catalogId?: string;
  /** Dose scelta nell'unità della voce; `per` assente = al giorno. */
  amount?: { amount: number; unit: DoseUnit; per?: 'giorno' | 'settimana' | 'mese' };
  /** Composizione letta dall'etichetta o stimata dalla ricerca. */
  product?: SupplementProduct;
  schedule?: SupplementSchedule;
  period?: { from: ISODate; to: ISODate };
  /** Pasto a cui legare la presa (spuntino, merenda…). */
  slot?: MealSlot;
  /** Presa legata alla seduta: minuti prima o dopo. */
  workout?: { when: 'prima' | 'dopo' | 'durante'; minutes: number };
  dosesPerDay?: number;
  reason?: 'mantenimento' | 'prescrizione' | 'carenza' | 'sport' | 'periodo';
  /** Esame collegato (data e valore facoltativo). */
  test?: { exam: string; date: ISODate; value?: number; unit?: string };
  /** Giorno in cui riportare la scheda in «Da completare». */
  reviewAt?: ISODate;
  /** Codici dei controlli già confermati («Aggiungilo lo stesso»). */
  acknowledged?: string[];
  /** Versione del catalogo con cui l'integratore è stato rivisto. */
  catalogVersion?: number;
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
  /**
   * Soglia di dolore (0-10) per gli impatti (balzi, corsa, partita) nelle zone sotto il ginocchio, decisa con il
   * fisioterapista. Facoltativa: senza, vale min(painThreshold, 2).
   */
  impactThreshold?: number;
  /** Primo avvio dopo il benvenuto: le voci prima di quest'ora non contano e la prima settimana parte da qui. */
  firstUse?: { date: ISODate; time: HHMM };
  // Campi della fase 2 (tutti facoltativi: senza, l'app è quella della fase 1).
  /** Alimenti esclusi dall'utente (§ 6). */
  exclusions?: FoodExclusion[];
  /** Alimento → giorno in cui l'utente ha risposto «Tienilo». */
  tasteAsked?: Record<string, ISODate>;
  /** Livello 2 degli obiettivi: qualità da allenare. */
  training?: TrainingGoal;
  /** Livello 3 degli obiettivi: date della stagione. */
  season?: SeasonCalendar;
  /** Settimana tipo in stagione, salvata all'inizio della pausa e riproposta al precampionato. */
  seasonWeek?: ScheduleDay[];
  /** Blocco di allenamento in vigore; assente = sedute fisse. */
  program?: Program;
  /** Settimane scaricate o alleggerite dalla revisione, per lunedì. */
  weekOverrides?: Record<ISODate, 'scarico' | 'leggera'>;
  /** Menù approvati, per lunedì: vincono sulla rotazione (tenuti 52 settimane). */
  menus?: Record<ISODate, MenuWeek>;
  /** Differenza di kcal dell'obiettivo del corpo rispetto al dispendio stimato (negativa = deficit). */
  goalDeltaKcal?: number;
  /** Caffè al giorno, per la caffeina degli integratori. */
  coffeePerDay?: number;
  /** Fermo per i segnali d'allarme (§ 3.8): livello d'impatto 0 ovunque finché un via libera esplicito non lo toglie. */
  impactHold?: { site: string; since: ISODate };
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
  | 'fisio'
  // Fase 2 (§ 3.7)
  | 'pliometria'
  | 'sprint'
  | 'condizionamento';

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
  // Dosi che non sono serie per ripetizioni (fase 2, § 3.7).
  /** Sprint e allunghi: metri per ripetizione. */
  distanceM?: number;
  /** Intervalli: secondi di lavoro (il recupero è `restSec`). */
  workSec?: number;
  /** Intensità senza cronometro: «RPE 8», «forte ma sciolto». */
  effort?: string;
  /** Pliometria: contatti con il suolo per ripetizione (predefinito dal catalogo). */
  contactsPerRep?: number;
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
  /**
   * Pasti con valori stimati, per pasto: ordini del bar con il piano B, foto dei piatti e piatti salvati (`EatenMeal`,
   * superinsieme della forma della fase 1). Valgono con la voce «sostituito», oppure «fatto» con `asPlanned` (§ 7.5).
   * Facoltativo.
   */
  barMeals?: Partial<Record<MealSlot, EatenMeal>>;
  /** Ricetta prevista al momento di un cambio (per imparare i gusti, § 6.3). */
  swapPlanned?: Partial<Record<MealSlot, string>>;
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
  // Fase 2: seduta di un blocco generato e variante del giorno (§ 3.9).
  blockId?: string;
  weekIndex?: number;
  variant?: 'piena' | 'ridotta' | 'minima';
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
  /** Proposte mostrate al salvataggio: la revisione si rilegge com'era, anche dopo che il piano è cambiato. */
  proposals?: Proposal[];
  /** Scalino della settimana scelto nella revisione: vale la settimana dopo e Oggi ne mostra il conteggio. */
  step?: { id: 'frutta-spuntino' | 'verdura-cena' | 'acqua' | 'dolci' | 'caffe' | 'alcol'; title: string };
  /** Risposte facoltative della prevenzione (§ 4.7): fuori dal menù nella settimana. */
  outside?: { redMeat?: 0 | 1 | 2 | 3; processed?: 0 | 1 | 2 | 3; alcoholUnits?: '0' | '1-3' | '4-7' | '8+'; binge?: boolean };
}

export interface Proposal {
  id: string;
  area: 'sonno' | 'calorie' | 'fibre' | 'allenamento' | 'dolore' | 'dolci' | 'peso' | 'scarico' | 'piano';
  title: string;
  reason: string;
  /** Proposta applicabile automaticamente al piano. */
  apply?:
    | { type: 'sleepCurrent'; value: HHMM }
    | { type: 'kcalDelta'; value: number }
    | { type: 'none' }
    /** Approva una proposta del piano (`PlanProposal.id`): è la stessa azione di `approveProposal`. */
    | { type: 'planProposal'; id: string }
    /** Scarico o settimana più leggera: scrive `Plan.weekOverrides[weekStart]`. */
    | { type: 'weekKind'; weekStart: ISODate; kind: 'scarico' | 'leggera' };
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
  /**
   * Risposta del coach non completa: interrotta dall'utente, rifiutata dal modello (non si reinvia
   * nella conversazione) o troncata al limite di lunghezza.
   */
  stop?: 'interrotta' | 'rifiuto' | 'limite';
}

// ───────────────────────── Impostazioni e stato ─────────────────────────

export type ThemePref = 'sistema' | 'scuro' | 'chiaro';

export interface Settings {
  theme: ThemePref;
  coachApiKey?: string;
  coachModel: string;
  /** Dati di esempio caricati: l'interfaccia lo segnala sempre. */
  demoData: boolean;
  /** Rifinitura del coach sulle proposte con rete e chiave (assente = sì). */
  coachRefine?: boolean;
  /** Token per mese ('2026-11'), dalle risposte dell'API. */
  coachUsage?: Record<string, CoachUsageMonth>;
}

export type Overlay =
  | { type: 'recipe'; recipeId: string; date: ISODate; slot?: MealSlot }
  | { type: 'checkin'; date: ISODate }
  | { type: 'session'; sessionId: string; date: ISODate }
  | { type: 'football'; date: ISODate; kind: FootballKind; itemId: string }
  /** `slot`: pasto da mostrare all'apertura (es. dallo spuntino di Oggi); senza, quello dell'ora attuale. */
  | { type: 'barPlanB'; slot?: MealSlot }
  /** Foto del piatto o i miei piatti (§ 7, § 8); `chatMessageId`: foto di un messaggio della chat. */
  | { type: 'mealLog'; date: ISODate; slot: MealSlot; mode: 'foto' | 'piatti'; chatMessageId?: string }
  /** Proposta del piano (§ 5, § 11.3). */
  | { type: 'planProposal'; id: string }
  /** Foglio dell'integratore: nuovo, o uno esistente (§ 9.2). */
  | { type: 'supplement'; supplementId?: string }
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
  // Sezioni della fase 2, tutte facoltative.
  /** I miei piatti (§ 8). */
  dishes?: MyDish[];
  /** Archivio freddo: data URL JPEG da 96 px per id del piatto. */
  dishThumbs?: Record<string, string>;
  /** Proposte del piano e riepiloghi dei blocchi (§ 5). */
  planner?: Planner;
  /** Archivio freddo: storico delle versioni del piano, al massimo 24. */
  planVersions?: PlanVersion[];
}

// ════════════════════════════ Fase 2 (docs/FASE2.md § 12.1) ════════════════════════════
// Ogni campo nuovo di un tipo esistente è facoltativo (sopra, nei tipi della fase 1); i tipi nuovi possono avere
// campi obbligatori, ma le sezioni che li contengono sono tutte facoltative.

// ───────────────────────── Pasti stimati e piatti (A, B) ─────────────────────────

export type MealSource = 'bar' | 'foto' | 'piatto';
export type Portion = 0.5 | 1 | 1.5;
export type OilChoice = 'niente' | 'filo' | 'cucchiaio' | 'due-cucchiai';
export type EstimateConfidence = 'bassa' | 'media' | 'alta';

/**
 * Un alimento di un pasto stimato, nello stato in cui si mangia (stessa convenzione di Food.per100g). Forma compatta: sta
 * nello stato caldo, che si riscrive a ogni tocco. Con `foodId` il nome viene da FOODS o da ESTIMATE_FOODS; `label` e
 * `per100g` ci sono solo fuori archivio. La confidenza serve solo nella scheda prima della conferma (`EstimateDraft`, tipo
 * locale di engine/estimate.ts) e non si salva.
 */
export interface EstimatedItem {
  /** Alimento di FOODS o di ESTIMATE_FOODS; assente = fuori archivio. */
  foodId?: string;
  grams: number;
  /** Solo fuori archivio: nome letto, una riga di 40 caratteri al massimo. */
  label?: string;
  /** Solo fuori archivio: valori per 100 g del coach, passati dai controlli del codice. */
  per100g?: Nutrients;
  role?: 'condimento';
}

/** Pasto mangiato con valori stimati (bar, foto, piatto salvato). È la forma di DayLog.barMeals. */
export interface EatenMeal {
  label: string;
  nutrients: Nutrients;
  vegPortions?: number;
  /** Assente = 'bar' (pasti salvati prima della fase 2). */
  source?: MealSource;
  items?: EstimatedItem[];
  oil?: OilChoice;
  /** Era il pasto previsto: la voce resta «fatto» e valgono questi valori al posto della ricetta. */
  asPlanned?: boolean;
  dishId?: string;
  portion?: Portion;
}

export interface MyDish {
  id: string;
  name: string;
  /** Pasti in cui proporlo per primo (quello in cui è nato). */
  slots: MealSlot[];
  /** Porzione normale. */
  items: EstimatedItem[];
  /** Valori della porzione normale, ricalcolati dal motore a ogni salvataggio. */
  nutrients: Nutrients;
  vegPortions: number;
  createdAt: string;
  source: 'foto';
  lastPortion?: Portion;
}

// ───────────────────────── Gusti (D) ─────────────────────────

export interface FoodExclusion {
  /** Id di FOODS. */
  foodId: string;
  /** Primo giorno senza l'alimento (domani al momento della scelta). */
  since: ISODate;
  origin: 'non-mi-piace' | 'cambi-ripetuti' | 'impostazioni';
}

// ───────────────────────── Obiettivi, stagione, programma (C) ─────────────────────────

export type TrainingQuality =
  | 'forza'
  | 'potenza'
  | 'rapidita'
  | 'velocita'
  | 'resistenza'
  | 'ipertrofia'
  | 'prevenzione'
  | 'rientro';
export type SeasonPhase = 'stagione' | 'pausa' | 'precampionato';
export type SeasonStage = 'stagione' | 'transizione' | 'sviluppo' | 'generale' | 'specifico' | 'rifinitura';
export type TrainingSpace = 'corsia' | 'campo' | 'casa';

export interface ReturnPlan {
  /** Una di Profile.painSites. */
  site: string;
  stage: 0 | 1 | 2 | 3 | 4;
  since: ISODate;
  /** Via libera del fisioterapista per lo stadio attuale (necessario per gli stadi con impatti o corsa). */
  physioOk?: boolean;
}

/** Livello 2 degli obiettivi. */
export interface TrainingGoal {
  /** Obiettivo pronto (§ 2.3); assente = scelta libera. */
  presetId?: string;
  primary: TrainingQuality;
  secondary?: TrainingQuality;
  rientro?: ReturnPlan;
  /** Minuti per seduta (30-90, predefinito 60). */
  sessionMin?: number;
  /** Sedute di palestra a settimana in stagione (1-3, predefinito 2). */
  gymPerWeek?: number;
  spaces?: TrainingSpace[];
}

/** Livello 3: fatti, non scelte. */
export interface SeasonCalendar {
  lastMatch?: ISODate;
  firstMatch?: ISODate;
  /** 3-8, predefinito 5. */
  preseasonWeeks?: number;
}

export type BlockWeekKind = 'carico' | 'scarico' | 'rifinitura';

/** Fattori di una settimana del blocco rispetto alla settimana 1. */
export interface WeekDose {
  /** Serie in più sugli esercizi del blocco principale (0, 1). */
  mainSetsAdd: number;
  /** Moltiplicatore delle serie, arrotondato in su, minimo 1 (scarico 0,5; rifinitura 0,6). */
  setsFactor: number;
  /** Ripetizioni di riserva in più (negativo = più vicino al cedimento), sempre dentro i limiti del § 3.4. */
  rirDelta: number;
  /** Moltiplicatore di contatti e metri. */
  impactFactor: number;
}

/** Blocco in vigore. Le settimane 2… si derivano (engine/plan/program.ts). */
export interface Program {
  blockId: string;
  /** Lunedì di inizio. */
  start: ISODate;
  weeks: BlockWeekKind[];
  /** Stessa lunghezza di `weeks`. */
  dose: WeekDose[];
  phase: SeasonPhase;
  stage: SeasonStage;
  primary: TrainingQuality;
  secondary?: TrainingQuality;
  /** Sedute della settimana 1 per slot ('A', 'B', 'C', 'K', 'R'). */
  sessions: Record<string, WorkoutSession>;
  /** Ritocchi del coach accettati: si applicano dopo la derivazione della settimana. */
  edits?: PlanEdit[];
}

/** Ritocco piccolo e verificabile a una seduta. `week` assente = tutte le settimane. */
export type PlanEdit =
  | { op: 'sostituisci'; slot: string; week?: number; exerciseId: string; with: string; reason: string }
  | { op: 'serie'; slot: string; week?: number; exerciseId: string; sets: number; reason: string }
  | { op: 'ordine'; slot: string; order: string[]; reason: string }
  | { op: 'nota'; slot: string; exerciseId: string; note: string };

/** Ritocco del coach a un menù generato: solo ricette tra le candidate di quella casella. */
export interface MenuEdit {
  day: Weekday;
  slot: MealSlot;
  recipeId: string;
  reason: string;
}

// ───────────────────────── Proposte e versioni ─────────────────────────

export type PlanChangeKind = 'blocco' | 'menu' | 'obiettivi' | 'ritorno';
export type PlanProposalStatus = 'aperta' | 'approvata' | 'scartata' | 'superata';

/** Parti del piano che una proposta sostituisce. `null` = togli (torna alla rotazione, alle sedute fisse…). */
export interface PlanPatch {
  week?: ScheduleDay[];
  seasonWeek?: ScheduleDay[] | null;
  program?: Program | null;
  menus?: Record<ISODate, MenuWeek | null>;
  training?: TrainingGoal | null;
  targets?: Plan['targets'];
  /** Obiettivo del corpo (Profile.goal). */
  goal?: Goal;
  goalDeltaKcal?: number | null;
}

export interface DiffItem {
  area: 'pasto' | 'spesa' | 'seduta' | 'esercizio' | 'settimana' | 'carico' | 'obiettivo' | 'calorie';
  /** Più alto = più importante: la scheda mostra le prime cinque. */
  weight: number;
  /** «Mercoledì, cena», «Seduta B». */
  label: string;
  before?: string;
  after?: string;
}

export interface CoachPass {
  status: 'in-corso' | 'fatto' | 'errore';
  at: string;
  model?: string;
  summary?: string;
  applied: (PlanEdit | MenuEdit)[];
  rejected: { edit: PlanEdit | MenuEdit; reason: string }[];
  /** Testo dell'errore, già pronto per l'interfaccia. */
  message?: string;
}

export interface PlanProposal {
  /** Impronta degli ingressi più `attempt`. */
  id: string;
  kind: PlanChangeKind;
  status: PlanProposalStatus;
  createdAt: string;
  decidedAt?: string;
  effectiveFrom: ISODate;
  /** Ultimo giorno in cui si può approvare (§ 5.2); assente = il giorno prima di effectiveFrom. */
  approvableUntil?: ISODate;
  /** Impronta delle parti del piano che il suo tipo legge (planBasis, § 5.2). */
  basis: string;
  attempt?: number;
  title: string;
  subtitle?: string;
  patch: PlanPatch;
  diff: DiffItem[];
  reasons: string[];
  warnings?: string[];
  source: 'motore' | 'motore+coach';
  coach?: CoachPass;
  /**
   * Valori di prima, scritti quando la toppa entra nel piano (all'approvazione o il suo primo giorno, § 5.4): servono ad
   * «Annulla». In una proposta approvata, assente = in attesa di entrare.
   */
  before?: PlanPatch;
}

export interface PlanVersion {
  id: string;
  at: string;
  effectiveFrom: ISODate;
  kind: Exclude<PlanChangeKind, 'menu'>;
  title: string;
  /** Valori dei campi toccati prima che la toppa entrasse nel piano (fino ad allora quelli del piano proiettato). */
  before: PlanPatch;
  /** La toppa applicata, con i soli campi toccati: «Torna a questa versione» la ripropone (restoreTo, § 5.5; un blocco riparte di lunedì). */
  after: PlanPatch;
  proposalId?: string;
}

/** Riepilogo di un blocco concluso (§ 3.11). */
export interface BlockSummary {
  blockId: string;
  from: ISODate;
  to: ISODate;
  primary: TrainingQuality;
  secondary?: TrainingQuality;
  verdict: 'avanza' | 'consolida' | 'alleggerisci' | 'meno-ma-fatto' | 'rientro';
  adherence: number;
  /** Totale previsto più alto delle settimane del blocco, in UA (calcio previsto + quota controllabile): riferimento di R10. */
  peakLoad?: number;
}

export interface Planner {
  proposals: PlanProposal[];
  /** Al massimo gli ultimi 12. */
  blocks?: BlockSummary[];
}

// ───────────────────────── Integratori (F) ─────────────────────────

export type DoseUnit = 'µg' | 'mg' | 'g' | 'mL' | 'UFC' | 'mg/kg' | 'compressa' | 'bustina' | 'dose';
export type LabelUnit = 'µg' | 'mg' | 'g' | 'UI' | 'UFC' | 'mL' | 'mmol';
export type SupplementSchedule = 'giornaliero' | 'giorni-alterni' | 'con-la-seduta' | 'periodi';

export interface SupplementComponent {
  /** Voce del catalogo riconosciuta; senza, il componente è solo descritto. */
  catalogId?: string;
  name: string;
  form?: string;
  /** Al giorno. */
  amount: number;
  unit: LabelUnit;
}

export interface SupplementProduct {
  label?: string;
  servingText?: string;
  components: SupplementComponent[];
  /** 'stima' = composto scelto dalla ricerca, con le dosi predefinite delle voci, finché non si legge l'etichetta. */
  source: 'etichetta' | 'stima';
  readAt: ISODate;
  labelWarnings?: string[];
  certifications?: Array<'informed-sport' | 'informed-choice' | 'koelner-liste' | 'altra'>;
}

// ───────────────────────── Coach ─────────────────────────

export interface CoachUsageMonth {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

// ───────────────────────── Validatori dei motori ─────────────────────────

/**
 * Violazione di una regola, unica per tutti i validatori (menù, settimana di allenamento, ritocchi del coach). Non si
 * salva nello stato: è un tipo condiviso dei motori, qui perché lo definisce una sola onda.
 */
export interface Violation {
  /** 'kcal-giorno', 'prodotti', 'carne-rossa-settimana', 'escluso', 'fuori-stagione', 'contatti-seduta', 'R2'… */
  code: string;
  hard: boolean;
  where?: { day?: Weekday; slot?: MealSlot | string; key?: string };
  value?: number;
  limit?: number;
  /** In italiano: lo legge l'utente nella scheda e il coach nel motivo dello scarto. */
  message: string;
}
