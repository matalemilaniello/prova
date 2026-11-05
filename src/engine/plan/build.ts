/**
 * Generatore dei blocchi di allenamento (docs/FASE2.md § 3.3, § 3.12) e proposte di blocco e di obiettivi (§ 5).
 * Funzioni pure e deterministiche: la data arriva dagli argomenti, il caso da `mulberry32` con un seme derivato dagli
 * ingressi (solo «Un’altra proposta» cambia le varianti). Il generatore lavora sul piano proiettato che riceve.
 *
 * Ordine fisso di `buildBlock` (§ 3.12):
 * 1. posiziona le sedute con R1-R7, fuori dal lavoro, spostandole se serve; una seduta senza un giorno ammesso si toglie
 *    e i suoi pavimenti passano alle sedute che restano;
 * 2. costruisce il contenuto (§ 3.3): riscaldamento sul modello FIFA 11+ (i suoi balzi contano nei contatti), qualità
 *    principale in testa, forza pesante di gambe nella B, qualità secondaria, pavimenti non ancora assegnati meno quelli
 *    del fisioterapista;
 * 3. risolve freni e dosi: fermo per i segnali d'allarme, stadio del rientro, R3, R8, tetti di contatti e metri, durata,
 *    R10 (prima le serie degli accessori, poi dei principali, poi contatti e metri, mai sotto i pavimenti);
 * 4. ordina con R9 (sprint e salti prima della forza, Nordic e Copenhagen in fondo);
 * 5. valida ogni settimana del blocco con `validateWeek`.
 * Il dolore, la tibia e il carico non fanno mai decadere la proposta: cambiano il contenuto e lo dicono nei motivi. Una
 * proposta non nasce solo se la settimana non lascia nessun giorno per la palestra.
 */
import type {
  AppData,
  BlockSummary,
  BlockWeekKind,
  CheckIn,
  FootballLog,
  Goal,
  ISODate,
  Plan,
  PlanPatch,
  PlanProposal,
  Profile,
  Program,
  ScheduleDay,
  SeasonPhase,
  SeasonStage,
  SessionExercise,
  TrainingGoal,
  TrainingQuality,
  Violation,
  WeekDose,
  WorkoutBlock,
  WorkoutLog,
  WorkoutSession,
} from '../../domain/types';
import type { BuildContext } from '../../features/piano/actions';
import { EXERCISES, type ExerciseSpace, type ImpactLevel } from '../../data/exercises';
import { DOSE_PRESETS, SESSIONS, estimateItemSec } from '../../data/sessions';
import { fmtNumber, plural } from '../../lib/format';
import { hashString } from '../../lib/id';
import { addDays, daysBetween, weekStart, weekdayOf } from '../dates';
import { allowedDeficitKcal, expenditureKcal, goalDeltaOf } from '../energy';
import { dayTypeFor } from '../menu';
import { mulberry32, seedOf, shuffled, type Rng } from '../rng';
import { targetsForGoal } from '../targets';
import { impactThresholdFor, isElbowSite, isLowerLegSite, painGate, sessionDuration } from '../training';
import { blockReview, nextBlockPlan, type BlockReview, type NextBlockPlan } from './blockReview';
import { describeBlock, describeTraining, diffPatch, fromDayLabel, mondayOnOrAfter, sortDiff, QUALITY_LABEL } from './diff';
import {
  availableSpaces,
  contactLimitsFor,
  FLOOR_LABEL,
  floorOf,
  isCopenhagen,
  isFastSprint,
  isNordic,
  isSprintOrJump,
  isStrengthLegs,
  itemContacts,
  itemMeters,
  physioFloors,
  plyoLevel,
  requiredFloors,
  sessionContacts,
  substituteItem,
  type FloorId,
  type SubstituteCtx,
  SPEED_METERS_MAX,
  AGILITY_METERS_MAX,
  MD2_CONTACTS_MAX,
  WARMUP_CONTACTS_MAX,
} from './limits';
import { BASE_DOSE, DELOAD_DOSE, deriveSession, programWeekDose, sessionFor } from './program';
import { planBasis, proposalId, stableStringify } from './proposals';
import { activeReturn, impactHoldActive, returnAdvice, returnStageOf, returnZone, type ReturnStage } from './returnStages';
import {
  DEFAULT_TRAINING,
  PRESET_BY_ID,
  dayTypeForLoad,
  isFragileReturnSite,
  IMPACT_QUALITIES,
  nextPhaseChange,
  seasonOn,
  trainingForPhase,
  type SeasonInfo,
} from './season';
import {
  applyPlacements,
  dayOf,
  footballPlannedLoad,
  matchWeekday,
  mdLabel,
  placeSessions,
  plannedLoad,
  programSession,
  sessionPlannedLoad,
  validateWeek,
  weekPlannedLoad,
  type SlotKind,
  type SlotSpec,
  type TrainingCtx,
} from './week';

export { plannedLoad, validateWeek } from './week';

// ───────────────────────── Ingressi e uscite (§ 3.12) ─────────────────────────

export interface TrainingBuildInput {
  /** Inizio del blocco (un lunedì). */
  monday: ISODate;
  /** Settimana, obiettivo, stagione, soglie, programma in vigore (il piano proiettato). */
  plan: Plan;
  workoutLogs: readonly WorkoutLog[];
  footballLogs: readonly FootballLog[];
  checkIns: Readonly<Record<ISODate, CheckIn>>;
  physio: AppData['physio'];
  painSites: readonly string[];
  /** Ultimo blocco concluso. */
  previous?: BlockSummary;
  /** «Un’altra proposta». */
  attempt: number;
  /** Riepiloghi dei blocchi conclusi (R10 e sequenza delle qualità); senza, vale `previous`. */
  blocks?: readonly BlockSummary[];
}

export interface TrainingBuildResult {
  /** null solo se la settimana non ha nessun giorno ammesso per la palestra. */
  program: Program | null;
  /** Solo se la settimana tipo cambia (fase o regole R1-R7). */
  week?: ScheduleDay[];
  /** Frasi brevi, al massimo 3. */
  reasons: string[];
  /** R10 con i soli pavimenti, sedute tolte per mancanza di giorni, obiettivo pronto sostituito. */
  warnings: string[];
  /** Violazioni dure che restano dopo la risoluzione: sempre vuoto, i test lo controllano. */
  violations: Violation[];
  /** Obiettivo di allenamento da salvare con il blocco, se cambia (fase, rientro, sequenza). */
  training?: TrainingGoal;
  /** Settimana in stagione da salvare (pausa) o da togliere (ritorno in stagione), se cambia. */
  seasonWeek?: ScheduleDay[] | null;
  /** Riepilogo del blocco che finisce, se c'era. */
  review?: BlockReview;
  /** Carico previsto più alto delle settimane del blocco (R10), da salvare nel riepilogo a fine blocco. */
  peakLoad: number;
  /** Carico previsto per settimana del blocco e riferimento di R10 usato. */
  weekLoads: { football: number; controllable: number; reference: number }[];
  /** Fase e stadio del blocco. */
  season: SeasonInfo;
}

/** Mai la palestra in questa settimana: i motivi della proposta che non nasce. */
export const NO_GYM_DAY_TEXT = 'Con il calcio di questa settimana non c’è un giorno per la palestra: tengo le sedute di prima';
export const FLOORS_ONLY_TEXT = 'Settimana molto più carica delle precedenti: tengo solo il minimo';
export const RAMP_TEXT = 'Con gli allenamenti di squadra la palestra riparte da poco e cresce ogni settimana';
export const R8_TEXT = 'Con il dolore di queste settimane: solo varianti senza impatto';

/** Giorni in cui un dolore sotto il ginocchio oltre la soglia degli impatti tiene attiva R8. */
export const R8_WINDOW_DAYS = 14;

/**
 * R8 attiva (§ 3.2): una zona sotto il ginocchio sopra la soglia degli impatti almeno una volta negli ultimi 14 giorni
 * (data compresa). Potenza e rapidità restano sceglibili ma producono solo varianti di livello 0: la pagina Obiettivi lo
 * dice con `R8_TEXT` sotto gli obiettivi pronti con potenza o rapidità (il nome della zona viene dal profilo). Il rientro
 * da solo non la attiva: ha i suoi stadi.
 */
export function r8Active(plan: Pick<Plan, 'painThreshold' | 'impactThreshold'>, checkIns: Readonly<Record<ISODate, CheckIn>> | undefined, today: ISODate): boolean {
  if (!checkIns) return false;
  const threshold = impactThresholdFor(plan);
  const from = addDays(today, -(R8_WINDOW_DAYS - 1));
  for (const [date, c] of Object.entries(checkIns)) {
    if (date < from || date > today || !c?.pain) continue;
    for (const [site, v] of Object.entries(c.pain)) if (typeof v === 'number' && v > threshold && isLowerLegSite(site)) return true;
  }
  return false;
}

// ───────────────────────── Struttura del blocco ─────────────────────────

/** Fattori delle settimane per fase (§ 3.4). */
const SEASON_DOSE: WeekDose[] = [
  BASE_DOSE,
  { mainSetsAdd: 0, setsFactor: 1, rirDelta: -1, impactFactor: 1.2 },
  { mainSetsAdd: 0, setsFactor: 1, rirDelta: -1, impactFactor: 1.44 },
  DELOAD_DOSE,
];
const BREAK_DOSE: WeekDose[] = [
  BASE_DOSE,
  { mainSetsAdd: 1, setsFactor: 1, rirDelta: -1, impactFactor: 1.2 },
  { mainSetsAdd: 1, setsFactor: 1, rirDelta: -2, impactFactor: 1.44 },
  DELOAD_DOSE,
];
export const TAPER_DOSE: WeekDose = { mainSetsAdd: 0, setsFactor: 0.6, rirDelta: 0, impactFactor: 0.6 };
/** Crescita di contatti e metri a settimana nel precampionato. */
export const PRESEASON_STEP = 1.2;

export interface BlockShape {
  weeks: BlockWeekKind[];
  dose: WeekDose[];
}

/**
 * Settimane e fattori del blocco (§ 3.1, § 3.4): 4 settimane (3 di carico e 1 di scarico) in stagione e nella pausa,
 * mai oltre il cambio di fase; 2 senza progressione nella transizione; fino alla prima partita nel precampionato, con
 * l'ultima di rifinitura. `extraLight`: una settimana leggera in più (verdetto «alleggerisci»); `flat`: niente aumenti di
 * volume (verdetto «consolida» per il sonno).
 */
export function blockShape(monday: ISODate, info: SeasonInfo, season: Plan['season'], opts: { extraLight?: boolean; flat?: boolean } = {}): BlockShape {
  if (info.phase === 'pausa' && info.stage === 'transizione') return { weeks: ['carico', 'carico'], dose: [BASE_DOSE, BASE_DOSE] };
  if (info.phase === 'precampionato') {
    const first = season?.firstMatch ?? addDays(monday, 7);
    const n = Math.max(1, Math.min(8, Math.ceil(daysBetween(monday, first) / 7)));
    const weeks: BlockWeekKind[] = [];
    const dose: WeekDose[] = [];
    for (let k = 0; k < n - 1; k++) {
      weeks.push('carico');
      dose.push(k === 0 ? { ...BASE_DOSE } : { mainSetsAdd: 1, setsFactor: 1, rirDelta: 0, impactFactor: Math.round(PRESEASON_STEP ** k * 1000) / 1000 });
    }
    weeks.push('rifinitura');
    dose.push(TAPER_DOSE);
    return { weeks, dose };
  }
  const change = nextPhaseChange(monday, season, 28);
  const room = change ? Math.max(1, Math.ceil(daysBetween(monday, change) / 7)) : 4;
  const n = Math.min(4, room);
  const table = info.phase === 'pausa' ? BREAK_DOSE : SEASON_DOSE;
  let weeks: BlockWeekKind[] = n === 4 ? ['carico', 'carico', 'carico', 'scarico'] : Array.from({ length: n }, () => 'carico' as const);
  let dose = n === 4 ? table.slice() : table.slice(0, n);
  if (opts.extraLight && n === 4) {
    weeks = ['carico', 'carico', 'scarico', 'scarico'];
    dose = [table[0], table[1], DELOAD_DOSE, DELOAD_DOSE];
  }
  if (opts.flat) dose = dose.map((d) => (d.setsFactor < 1 ? d : { ...d, mainSetsAdd: 0, impactFactor: 1 }));
  return { weeks, dose };
}

// ───────────────────────── Contesto del generatore ─────────────────────────

interface GenCtx {
  monday: ISODate;
  info: SeasonInfo;
  phase: SeasonPhase;
  stage: SeasonStage;
  training: TrainingGoal;
  primary: TrainingQuality;
  secondary?: TrainingQuality;
  spaces: ReadonlySet<ExerciseSpace>;
  /** Livello d'impatto massimo della pliometria del blocco. */
  level: ImpactLevel;
  /** Livello d'impatto massimo per la corsa (con il dolore sotto il ginocchio nei 14 giorni: 0, cyclette o ellittica). */
  runLevel: ImpactLevel;
  /** Fermo degli impatti o R8: solo varianti di livello 0. */
  noImpact: boolean;
  r8: boolean;
  elbowSite: boolean;
  elbowBrake: boolean;
  lowerLegSite: boolean;
  rientro?: { stage: ReturnStage; site: string };
  next?: NextBlockPlan;
  previous?: Program;
  rng: Rng;
  attempt: number;
  sessionMin: number;
  physio: AppData['physio'];
  floorsCovered: Set<FloorId>;
  /** Fattori delle settimane del blocco (la durata vale in ognuna). */
  doses: readonly WeekDose[];
}

/** Dose di riferimento di un esercizio (data/sessions.ts), con le modifiche della seduta. */
const preset = (id: string, over: Partial<SessionExercise> = {}): SessionExercise => {
  const p = DOSE_PRESETS[id] ?? { exerciseId: id, sets: 2, repMin: 8, repMax: 12, unit: 'reps' as const, restSec: 60, progression: 'nessuna' as const };
  return { ...p, ...over, exerciseId: id };
};

const hasQuality = (g: GenCtx, q: TrainingQuality) => g.primary === q || g.secondary === q;

/** Livello della pliometria del blocco (§ 3.6): sale di uno solo dopo un blocco intero senza episodi e con «avanza». */
function plyoTargetLevel(input: TrainingBuildInput, info: SeasonInfo, next: NextBlockPlan | undefined, impactThr: number): ImpactLevel {
  const cap = contactLimitsFor(info.phase, info.stage).maxLevel;
  const prev = input.plan.program;
  const prevLevel = prev ? Math.max(0, ...Object.values(prev.sessions).map((s) => plyoLevel(s))) : 0;
  if (!prev || prevLevel === 0) return Math.min(1, cap) as ImpactLevel;
  const from = prev.start;
  const to = addDays(input.monday, -1);
  let episodes = 0;
  for (const [d, c] of Object.entries(input.checkIns ?? {})) {
    if (d < from || d > to) continue;
    for (const [site, val] of Object.entries(c?.pain ?? {})) if (isLowerLegSite(site) && typeof val === 'number' && val > impactThr) episodes++;
  }
  let level = prevLevel;
  if (next?.impactLevelDelta && next.impactLevelDelta < 0) level = Math.max(0, prevLevel - 1);
  else if (next?.verdict === 'avanza' && episodes === 0) {
    const needsPhysio = prevLevel + 1 >= 3 && input.painSites.some(isLowerLegSite);
    const physioOk = Boolean(input.plan.training?.rientro?.physioOk);
    if (!needsPhysio || physioOk) level = prevLevel + 1;
  }
  return Math.min(cap, Math.max(0, level)) as ImpactLevel;
}

// ───────────────────────── Sedute ─────────────────────────

/** Varianti dello stesso schema per «Un’altra proposta» e per il cambio di variante a carichi fermi (§ 3.4). */
const VARIANTS: Record<string, readonly string[]> = {
  cerniera: ['stacco-trap-bar', 'stacco-rumeno-manubri'],
  squat: ['affondo-bulgaro-manubri', 'squat-goblet', 'squat-macchina', 'leg-press'],
  ponte: ['hip-thrust-bilanciere', 'ponte-glutei-una-gamba'],
  spinta: ['panca-manubri-presa-neutra', 'chest-press-presa-neutra'],
  tirataV: ['lat-machine-presa-neutra', 'trazioni-presa-neutra'],
  tirataO: ['rematore-manubrio-una-mano', 'rematore-petto-appoggiato', 'pulley-basso-presa-neutra'],
};

/** Variante scelta: la prima al tentativo 0, poi mescolata dal seme; con il cambio di variante la seconda. */
function variant(g: GenCtx, key: keyof typeof VARIANTS, offset = 0): string {
  const list = VARIANTS[key];
  if (g.attempt === 0) return list[(offset + (g.next?.variantChange ? 1 : 0)) % list.length];
  return shuffled(list, g.rng)[offset % list.length];
}

const block = (title: string, items: SessionExercise[]): WorkoutBlock => ({ title, items });

function warmupLegs(g: GenCtx, light: boolean): SessionExercise[] {
  const items = [
    preset('cyclette-ritmo-crescente'),
    preset('apertura-chiusura-anca-in-marcia'),
    preset('affondi-in-camminata-con-rotazione'),
    preset('equilibrio-su-una-gamba-a-stella'),
  ];
  if (light) items.push(preset('mobilita-caviglia-al-muro'));
  else {
    items.push({ ...preset('balzi-del-pattinatore'), note: 'Atterraggi morbidi e silenziosi' });
    if (hasQuality(g, 'rapidita') || hasQuality(g, 'velocita')) items.push(preset('skip-tecnica'));
  }
  return items;
}

function warmupUpper(g: GenCtx, dayAfterMatch: boolean): SessionExercise[] {
  const items = [
    dayAfterMatch ? { ...preset('cyclette-facile'), note: 'Facile: le gambe vengono dalla partita' } : preset('cyclette-ritmo-crescente'),
    preset('extrarotazioni-con-elastico'),
  ];
  if (g.elbowSite) items.push({ ...preset('isometria-estensori-polso'), note: 'Prima delle spinte, sul braccio dolente' });
  return items;
}

/** Salti e lanci per livello (§ 3.6), dentro il budget di contatti della seduta. */
function powerItems(g: GenCtx, budget: number): SessionExercise[] {
  const level = g.noImpact ? 0 : g.level;
  const out: SessionExercise[] = [];
  if (level >= 3) out.push(preset(g.spaces.has('corsia') ? 'salti-ostacolini' : 'drop-jump-basso'));
  else if (level === 2) out.push(preset(g.spaces.has('corsia') && g.attempt % 2 === 1 ? 'salto-in-lungo-fermo' : 'pogo-bilaterali'));
  else if (level === 1) out.push(preset(g.attempt % 2 === 1 ? 'salto-verticale-fermo' : 'salto-sul-box'));
  out.push(preset('lancio-palla-medica-dal-basso'));
  if (level === 0) out.push(preset('lancio-palla-medica-rotazionale'));
  return fitContacts(out, budget);
}

/** Accelerazioni, frenate e cambi di direzione (§ 3.4): serve la corsia, senza passano agli sprint in cyclette. */
function agilityItems(g: GenCtx): SessionExercise[] {
  const change = g.stage === 'specifico' || g.next?.verdict === 'avanza' || g.attempt % 2 === 1;
  return [preset('accelerazioni-10m'), preset(change ? 'cambi-direzione-45-90' : 'frenate-tre-passi')];
}

/** Velocità (§ 3.4): allunghi nel primo blocco, poi sprint lanciati; serve il campo. */
function speedItems(g: GenCtx): SessionExercise[] {
  const before = g.previous ? Object.values(g.previous.sessions).some((s) => s.blocks.some((b) => b.items.some((it) => it.exerciseId === 'allunghi' || it.exerciseId === 'sprint-lanciati-20m'))) : false;
  return [preset(before ? 'sprint-lanciati-20m' : 'allunghi')];
}

/** Contatti dei salti dentro il budget: si tolgono ripetizioni, poi serie (mai sotto 1). */
function fitContacts(items: SessionExercise[], budget: number): SessionExercise[] {
  const out = items.map((x) => ({ ...x }));
  const total = () => out.reduce((t, it) => t + itemContacts(it), 0);
  let guard = 0;
  while (total() > budget && guard++ < 50) {
    const i = out.findIndex((it) => itemContacts(it) > 0 && (it.sets > 1 || it.repMax > 1));
    if (i < 0) break;
    const it = out[i];
    if (it.repMax > Math.max(3, it.repMin)) out[i] = { ...it, repMax: it.repMax - 1 };
    else if (it.sets > 1) out[i] = { ...it, sets: it.sets - 1 };
    else if (it.repMax > 1) out[i] = { ...it, repMax: it.repMax - 1, repMin: Math.min(it.repMin, it.repMax - 1) };
  }
  // Senza budget i salti contati escono (restano i lanci).
  return budget <= 0 ? out.filter((it) => itemContacts(it) === 0) : out;
}

/** Qualità di testa di una seduta (principale o secondaria): blocco e titolo. */
function qualityBlock(g: GenCtx, q: TrainingQuality | undefined, budget: number, opts: { md?: number | null } = {}): WorkoutBlock | null {
  if (!q) return null;
  switch (q) {
    case 'potenza':
      return block('Salti e lanci', powerItems(g, budget));
    case 'rapidita':
      return block('Accelerazioni', agilityItems(g));
    case 'velocita':
      // Mai il giorno dopo la partita, alla vigilia o il giorno della partita.
      if (opts.md === 0 || opts.md === 1 || opts.md === 6) return null;
      return block('Velocità', speedItems(g));
    default:
      return null;
  }
}

/** Serie della forza pesante di gambe per fase e obiettivo (§ 3.4). */
function legSets(g: GenCtx): number {
  const base = g.phase === 'pausa' ? 4 : 3;
  return base + (g.primary === 'forza' && g.phase === 'pausa' ? 1 : 0);
}

/** RIR di partenza dei principali (settimana 1, § 3.4): 3 in stagione e nella pausa, 2 nel precampionato. */
const baseRir = (g: GenCtx) => (g.phase === 'precampionato' ? 2 : 3);

function legsMain(g: GenCtx, second: boolean): SessionExercise[] {
  const rir = baseRir(g);
  const heavier = Boolean(g.next?.heavier);
  const hinge = variant(g, 'cerniera', second ? 1 : 0);
  const squat = variant(g, 'squat', second ? 2 : 0);
  const sets = legSets(g);
  const items: SessionExercise[] = [
    preset(hinge, { sets: second ? sets - 1 : sets, repMin: heavier ? 3 : 4, repMax: heavier ? 5 : 6, rir, restSec: 150 }),
    preset(squat, { sets: Math.max(2, sets - 1), repMin: heavier ? 4 : 6, repMax: heavier ? 6 : 10, rir, restSec: 90 }),
  ];
  if (!second) items.push(preset(variant(g, 'ponte'), { sets: 3, repMin: 8, repMax: 12, rir }));
  if (hasQuality(g, 'ipertrofia') && g.phase === 'pausa') items.push(preset('leg-curl-seduto', { sets: 3, rir }));
  return items;
}

function upperMain(g: GenCtx): SessionExercise[] {
  const rir = baseRir(g);
  const hyper = hasQuality(g, 'ipertrofia');
  const strong = g.primary === 'forza';
  const push = variant(g, 'spinta');
  const pullV = variant(g, 'tirataV');
  const pullO = variant(g, 'tirataO');
  const extra = hyper ? 1 : 0;
  return [
    preset(push, { sets: strong ? 4 : 3, repMin: strong ? 6 : 6, repMax: 10, rir, incrementKg: DOSE_PRESETS[push]?.incrementKg ?? 2 }),
    preset(pullV, { sets: 3, repMin: 8, repMax: 12, rir }),
    preset('panca-inclinata-manubri-presa-neutra', { sets: 2 + extra, repMin: 8, repMax: 12, rir }),
    preset(pullO, { sets: 3 + extra, repMin: 8, repMax: 12, rir, ...(pullO === 'rematore-manubrio-una-mano' ? { perSide: true, restSec: 45 } : {}) }),
    preset('face-pull-con-corda', { sets: 2 + extra, rir }),
  ];
}

function lightMain(): SessionExercise[] {
  // Vigilia della vigilia (R3): tre ripetizioni di riserva anche dopo i fattori delle settimane.
  const rir = 4;
  return [
    preset('squat-goblet', { sets: 2, repMin: 8, repMax: 12, rir, restSec: 75 }),
    preset('piegamenti-su-impugnature', { sets: 2, rir }),
    preset('stacco-rumeno-una-gamba', { sets: 2, rir }),
    preset('rematore-petto-appoggiato', { sets: 2, rir }),
  ];
}

/** Esercizio di un pavimento per tipo di seduta (§ 3.5); il rientro e la prevenzione aggiungono una serie. */
function floorItem(g: GenCtx, f: FloorId, kind: SlotKind): SessionExercise | null {
  const extra = hasQuality(g, 'prevenzione') ? 1 : 0;
  const more = (it: SessionExercise) => ({ ...it, sets: Math.min(4, it.sets + extra) });
  switch (f) {
    case 'nordic': {
      const prevNordic = g.previous ? Object.values(g.previous.sessions).flatMap((s) => s.blocks.flatMap((b) => b.items)).find((it) => it.exerciseId === 'nordic-hamstring-curl') : undefined;
      const flex = g.rientro && returnZone(g.rientro.site) === 'flessori' ? g.rientro.stage : undefined;
      if (flex && flex.stage < 3) return preset(flex.exercises[0] ?? 'nordic-assistito-elastico');
      if (g.phase === 'stagione') return preset('nordic-hamstring-curl', { sets: 2, repMin: 4, repMax: 6, restSec: 120 });
      // Pausa e precampionato: 2 × 4-6 → 3 × 6 → 3 × 8 di blocco in blocco (§ 3.4).
      const step = !prevNordic ? 0 : prevNordic.sets >= 3 ? 2 : 1;
      return preset('nordic-hamstring-curl', step === 0 ? { sets: 2, repMin: 4, repMax: 6, restSec: 120 } : { sets: 3, repMin: step === 1 ? 6 : 8, repMax: step === 1 ? 6 : 8, restSec: 120 });
    }
    case 'copenhagen':
      return more(preset(g.rientro && returnZone(g.rientro.site) === 'adduttori' ? (g.rientro.stage.exercises[0] ?? 'copenhagen-isometrico') : 'copenhagen-leva-corta', {
        note: 'Quando fai 2 serie da 10 per lato senza fastidio all’inguine, passa alla leva lunga',
      }));
    case 'polpacci':
      return more(kind === 'alto' ? preset('polpacci-seduto') : preset('polpacci-in-piedi-macchina'));
    case 'tibiale':
      return more(kind === 'alto' ? preset('sollevamenti-punte-pallina') : preset('tibiale-anteriore-seduto'));
    case 'polso':
      return preset('tyler-twist');
    default:
      return null;
  }
}

/** Esercizi del rientro nello stadio in vigore (§ 3.8), tranne quelli già messi come pavimento. */
function returnItems(g: GenCtx, used: Set<string>, floors: ReadonlySet<FloorId>): SessionExercise[] {
  if (!g.rientro) return [];
  const st = g.rientro.stage;
  const out: SessionExercise[] = [];
  for (const id of st.exercises) {
    if (used.has(id) || !DOSE_PRESETS[id]) continue;
    // Un esercizio del rientro che fa lo stesso lavoro di un pavimento già nella seduta non si ripete.
    const f = floorOf(preset(id));
    if (f && floors.has(f)) continue;
    // La prova del saltello solo nello stadio 2 con il via libera del fisioterapista (§ 3.8).
    if (id === 'prova-saltello' && !g.training.rientro?.physioOk) continue;
    out.push(preset(id));
    used.add(id);
  }
  return out;
}

/** Spec di una seduta da costruire: slot, tipo, distanza dalla partita, pavimenti assegnati. */
interface BuildSlot {
  slot: string;
  kind: SlotKind;
  md: number | null;
  footballDay: boolean;
  floors: FloorId[];
  optional?: boolean;
  /** Qualità di testa in questa seduta. */
  quality?: TrainingQuality;
  /** Seconda qualità (secondaria) in coda alla qualità principale. */
  quality2?: TrainingQuality;
  contactsBudget: number;
  /** Seconda seduta di gambe pesanti (pausa). */
  secondLegs?: boolean;
  /** Corsa facile (R) o intermittente (K). */
  run?: 'facile' | 'intermittente';
  /** Gli esercizi del rientro vanno in questa seduta (una sola, la prima con le gambe). */
  returnHere?: boolean;
}

const SUBTITLE: Record<SlotKind, string> = {
  gambe: 'Forza gambe e prevenzione',
  alto: 'Parte superiore e prevenzione',
  leggera: 'Corpo intero leggero e mobilità',
  corsa: 'Corsa e condizionamento',
};

/** Seduta della settimana 1 di uno slot. */
function buildSession(g: GenCtx, s: BuildSlot): WorkoutSession {
  const blocks: WorkoutBlock[] = [];
  const used = new Set<string>();
  if (s.kind === 'corsa') {
    const items: SessionExercise[] = [preset('apertura-chiusura-anca-in-marcia'), preset('affondi-in-camminata-con-rotazione')];
    if (s.run !== 'facile') items.unshift(preset('corsa-facile', { repMin: 480, repMax: 600, effort: 'RPE 3-4', note: 'Per scaldarti, a ritmo facile' }));
    blocks.push(block('Riscaldamento', items));
    let main: SessionExercise[];
    if (s.run === 'facile') {
      // Uscita facile: la durata dentro i minuti scelti, riscaldamento compreso.
      const sec = Math.max(600, Math.min(1800, (g.sessionMin - 5) * 60));
      main = [preset('corsa-facile', { repMin: Math.min(1500, sec), repMax: sec })];
    } else if (g.phase === 'precampionato' && g.stage !== 'generale') {
      main = [preset('ripetute-sprint')];
    } else {
      main = [g.attempt % 2 === 1 ? preset('cyclette-intervalli') : preset('intermittente-15-15', { sets: 3, note: 'Tra una serie e l’altra 3 minuti di recupero' })];
    }
    // Il blocco della corsa non è un «blocco principale»: le serie in più delle settimane di carico non valgono qui.
    blocks.push(block(s.run === 'facile' ? 'Corsa' : 'Intervalli', main));
  } else if (s.kind === 'alto') {
    blocks.push(block('Riscaldamento', warmupUpper(g, s.md === 1)));
    blocks.push(block('Blocco principale', g.stage === 'transizione' ? upperMain(g).slice(0, 3).map((it) => ({ ...it, sets: 2, rir: 4 })) : upperMain(g)));
  } else if (s.kind === 'leggera') {
    blocks.push(block('Riscaldamento', warmupLegs(g, true)));
    blocks.push(block('Blocco principale', lightMain()));
  } else {
    blocks.push(block('Riscaldamento', warmupLegs(g, false)));
    const warm = blocks[0].items.reduce((t, it) => t + itemContacts(it), 0);
    const q1 = qualityBlock(g, s.quality, Math.max(0, s.contactsBudget - warm), { md: s.md });
    if (q1) {
      const after = q1.items.reduce((t, it) => t + itemContacts(it), 0);
      const q2 = s.quality2 && s.quality2 !== s.quality ? qualityBlock(g, s.quality2, Math.max(0, s.contactsBudget - warm - after), { md: s.md }) : null;
      if (q2) q1.items.push(...q2.items.filter((it) => !q1.items.some((x) => x.exerciseId === it.exerciseId)));
      blocks.push(q1);
    } else if (s.quality2) {
      const q2 = qualityBlock(g, s.quality2, Math.max(0, s.contactsBudget - warm), { md: s.md });
      if (q2) blocks.push(q2);
    }
    blocks.push(block('Blocco principale', legsMain(g, Boolean(s.secondLegs))));
  }
  for (const b of blocks) for (const it of b.items) used.add(it.exerciseId);
  // Prevenzione: pavimenti assegnati, rientro, core; Copenhagen e Nordic in fondo (R9).
  const prev: SessionExercise[] = [];
  const tail: SessionExercise[] = [];
  for (const f of s.floors) {
    if (f === 'forza-gambe') continue;
    const it = floorItem(g, f, s.kind);
    if (!it || used.has(it.exerciseId)) continue;
    used.add(it.exerciseId);
    (isNordic(it) || isCopenhagen(it) ? tail : prev).push(it);
  }
  const ret = s.returnHere ? returnItems(g, used, new Set(prev.concat(tail).map(floorOf).filter((f): f is FloorId => Boolean(f)))) : [];
  const retHead = ret.filter((it) => isSprintOrJump(it) || itemMeters(it) > 0);
  prev.push(...ret.filter((it) => !retHead.includes(it)));
  if (retHead.length) {
    const at = blocks.findIndex((b) => !WARM_RE.test(b.title));
    blocks.splice(at < 0 ? blocks.length : at, 0, block('Rientro', retHead));
  }
  if (s.kind === 'gambe' && !s.secondLegs && g.stage !== 'transizione') {
    for (const id of ['dead-bug', 'pallof-press']) if (!used.has(id)) prev.push(preset(id));
  }
  if (s.kind === 'leggera') {
    for (const id of ['pallof-press', 'plank-laterale']) if (!used.has(id)) prev.push(preset(id, id === 'pallof-press' ? { rir: 4 } : {}));
  }
  tail.sort((a, b) => Number(isNordic(a)) - Number(isNordic(b)));
  const prevention = [...prev, ...tail];
  if (prevention.length) blocks.push(block(s.kind === 'leggera' ? 'Prevenzione e mobilità' : 'Prevenzione', prevention));
  if (s.kind === 'leggera') {
    blocks[blocks.length - 1].items.push(preset('rotazioni-anche-90-90'), preset('allungamento-flessori-anca'));
  }
  if (s.kind === 'leggera') {
    // Seduta leggera (R3): ogni esercizio con le ripetizioni di riserva ne tiene almeno 3 anche nelle settimane di carico.
    for (const b of blocks) b.items = b.items.map((it) => (typeof it.rir === 'number' && it.rir < 4 ? { ...it, rir: 4 } : it));
  }
  const name = s.kind === 'corsa' ? (s.run === 'facile' ? 'Uscita facile' : 'Corsa intermittente') : `Seduta ${s.slot}`;
  const subtitle = s.kind === 'corsa' ? (s.run === 'facile' ? 'Corsa facile o cyclette' : 'Resistenza intermittente') : SUBTITLE[s.kind];
  const focus = focusText(s);
  const session: WorkoutSession = { id: s.slot, name, subtitle, estMin: 1, focus, blocks };
  return withEstMin(session);
}

function focusText(s: BuildSlot): string {
  const where = s.md !== null ? ` (${mdLabel(s.md)})` : '';
  switch (s.kind) {
    case 'gambe':
      return `${s.quality ? `${capitalize(QUALITY_LABEL[s.quality])} in testa, poi forza` : 'Forza'} di gambe${where}: lontano dal cedimento, Nordic in fondo.`;
    case 'alto':
      return `Spinte e tirate a presa neutra, poi prevenzione${where}.`;
    case 'leggera':
      return `Leggera${where}: tre ripetizioni di riserva, mobilità e prevenzione.`;
    case 'corsa':
      return s.run === 'facile' ? 'Ritmo con cui riesci a parlare.' : 'Ripetute brevi e intense, recuperi completi.';
  }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Minuti della seduta blocco per blocco (come `estMin` delle sedute fisse e `sessionDuration`). */
function withEstMin(s: WorkoutSession): WorkoutSession {
  const minutes = s.blocks.reduce((t, b) => t + Math.round(b.items.reduce((x, it) => x + estimateItemSec(it), 0) / 60), 0);
  return { ...s, estMin: Math.max(1, minutes) };
}

// ───────────────────────── Freni, dosi, durata, R9 ─────────────────────────

const MAIN_RE = /principale/i;
const WARM_RE = /riscaldamento/i;

/** Sostituzione sicura di tutti gli esercizi (regola 1 del § 3.7); un esercizio senza sostituto salta. */
/** Famiglie ammesse per il sostituto di uno sprint o di un salto: mai un esercizio di forza (R9). */
const QUALITY_CATEGORIES: ReadonlySet<string> = new Set(['pliometria', 'sprint', 'condizionamento', 'prevenzione']);

function applySafety(s: WorkoutSession, ctx: SubstituteCtx): WorkoutSession {
  const used = new Set(s.blocks.flatMap((b) => b.items.map((it) => it.exerciseId)));
  const blocks = s.blocks
    .map((b) => ({
      ...b,
      items: b.items.flatMap((it) => {
        // Nel riscaldamento solo le alternative del catalogo; nella qualità un sostituto della stessa famiglia.
        const family: Partial<SubstituteCtx> = WARM_RE.test(b.title)
          ? { alternativesOnly: true }
          : isSprintOrJump(it) || itemMeters(it) > 0
            ? { categories: QUALITY_CATEGORIES }
            : {};
        const sub = substituteItem(it, { ...ctx, ...family, exclude: new Set([...used].filter((x) => x !== it.exerciseId)) });
        if (!sub) return [];
        used.add(sub.exerciseId);
        return [sub];
      }),
    }))
    .filter((b) => b.items.length);
  // Doppioni dopo le sostituzioni: resta il primo.
  const seen = new Set<string>();
  const dedup = blocks
    .map((b) => ({ ...b, items: b.items.filter((it) => (seen.has(it.exerciseId) ? false : (seen.add(it.exerciseId), true))) }))
    .filter((b) => b.items.length);
  return withEstMin({ ...s, blocks: dedup });
}

/** Contatti di tutta la seduta dentro un tetto: prima i salti della qualità, poi quelli del riscaldamento. */
function capContacts(s: WorkoutSession, cap: number, warmCap = WARMUP_CONTACTS_MAX): WorkoutSession {
  let out = s;
  const total = () => sessionContacts(out);
  const warm = out.blocks.find((b) => WARM_RE.test(b.title));
  if (warm && warm.items.reduce((t, it) => t + itemContacts(it), 0) > warmCap) {
    out = { ...out, blocks: out.blocks.map((b) => (b === warm ? { ...b, items: fitContacts(b.items, warmCap) } : b)) };
  }
  let guard = 0;
  while (total() > cap && guard++ < 60) {
    const bi = out.blocks.findIndex((b) => !WARM_RE.test(b.title) && b.items.some((it) => itemContacts(it) > 0));
    const target = bi >= 0 ? bi : out.blocks.findIndex((b) => b.items.some((it) => itemContacts(it) > 0));
    if (target < 0) break;
    const b = out.blocks[target];
    const other = total() - b.items.reduce((t, it) => t + itemContacts(it), 0);
    out = { ...out, blocks: out.blocks.map((x, i) => (i === target ? { ...x, items: fitContacts(x.items, Math.max(0, cap - other)) } : x)) };
    if (total() > cap && cap - other <= 0) {
      out = { ...out, blocks: out.blocks.map((x, i) => (i === target ? { ...x, items: x.items.filter((it) => itemContacts(it) === 0) } : x)).filter((x) => x.items.length) };
    }
  }
  return withEstMin(out);
}

/** Metri sopra il 90% e metri di rapidità dentro i tetti (§ 3.4, R3): si accorciano le ripetute, poi si tolgono. */
function capMeters(s: WorkoutSession, fastCap: number, allCap: number): WorkoutSession {
  let out = s;
  const fast = () => out.blocks.flatMap((b) => b.items).filter(isFastSprint).reduce((t, it) => t + itemMeters(it), 0);
  const all = () => out.blocks.flatMap((b) => b.items).reduce((t, it) => t + itemMeters(it), 0);
  let guard = 0;
  while ((fast() > fastCap || all() > allCap) && guard++ < 60) {
    let changed = false;
    out = {
      ...out,
      blocks: out.blocks.map((b) => {
        if (changed) return b;
        const i = b.items.findIndex((it) => itemMeters(it) > 0 && (fast() > fastCap ? isFastSprint(it) : true) && it.repMax > 1);
        if (i < 0) return b;
        changed = true;
        const it = b.items[i];
        const items = b.items.slice();
        items[i] = { ...it, repMax: it.repMax - 1, repMin: Math.min(it.repMin, it.repMax - 1) };
        return { ...b, items };
      }),
    };
    if (!changed) break;
  }
  return withEstMin(out);
}

/** Esercizio protetto dai tagli: pavimenti, forza pesante di gambe (in stagione), rientro. */
function protectedItem(it: SessionExercise, g: GenCtx): boolean {
  const f = floorOf(it);
  if (f && f !== 'forza-gambe') return true;
  // Almeno un'esposizione di forza di gambe (in stagione è un pavimento; nel precampionato la rampa riparte da lì).
  if (f === 'forza-gambe') return true;
  return Boolean(g.rientro?.stage.exercises.includes(it.exerciseId));
}

/**
 * Un passo di riduzione (§ 3.2, R10 e durata): prima le serie degli accessori (anche fino a toglierli), poi quelle dei
 * principali (mai sotto 2 per la forza di gambe), poi contatti e metri della qualità, poi il riscaldamento che non serve
 * ai salti. Null se non resta niente da togliere senza scendere sotto i pavimenti.
 */
function reduceOnce(s: WorkoutSession, g: GenCtx): WorkoutSession | null {
  const blocks = s.blocks.map((b) => ({ ...b, items: b.items.slice() }));
  const mainIdx = blocks.findIndex((b) => MAIN_RE.test(b.title));
  // 1. Accessori: blocco principale dal terzo esercizio, core e prevenzione non protetti.
  const accessories: [number, number][] = [];
  blocks.forEach((b, bi) => {
    if (WARM_RE.test(b.title)) return;
    b.items.forEach((it, ii) => {
      if (protectedItem(it, g)) return;
      const isMain = bi === mainIdx && ii < 2;
      const quality = isSprintOrJump(it) || itemMeters(it) > 0;
      if (!isMain && !quality) accessories.push([bi, ii]);
    });
  });
  for (let k = accessories.length - 1; k >= 0; k--) {
    const [bi, ii] = accessories[k];
    const it = blocks[bi].items[ii];
    if (it.sets > 1) {
      blocks[bi].items[ii] = { ...it, sets: it.sets - 1 };
      return withEstMin({ ...s, blocks });
    }
  }
  for (let k = accessories.length - 1; k >= 0; k--) {
    const [bi, ii] = accessories[k];
    if (EXERCISES[blocks[bi].items[ii].exerciseId]?.category === 'mobilita') continue;
    blocks[bi].items.splice(ii, 1);
    return withEstMin({ ...s, blocks: blocks.filter((b) => b.items.length) });
  }
  // 2. Principali.
  if (mainIdx >= 0) {
    const b = blocks[mainIdx];
    for (let ii = b.items.length - 1; ii >= 0; ii--) {
      const it = b.items[ii];
      const min = isStrengthLegs(it) ? 2 : 1;
      if (it.sets > min) {
        b.items[ii] = { ...it, sets: it.sets - 1 };
        return withEstMin({ ...s, blocks });
      }
    }
  }
  // 3. Qualità: serie, poi ripetizioni.
  for (const b of blocks) {
    if (WARM_RE.test(b.title)) continue;
    for (let ii = b.items.length - 1; ii >= 0; ii--) {
      const it = b.items[ii];
      if (!(isSprintOrJump(it) || itemMeters(it) > 0)) continue;
      if (it.sets > 1) {
        b.items[ii] = { ...it, sets: it.sets - 1 };
        return withEstMin({ ...s, blocks });
      }
      if (it.repMax > 2) {
        b.items[ii] = { ...it, repMax: it.repMax - 1, repMin: Math.min(it.repMin, it.repMax - 1) };
        return withEstMin({ ...s, blocks });
      }
    }
  }
  // 4. Riscaldamento: l'equilibrio e la mobilità in più, le serie in più, i minuti di cyclette oltre i 5.
  const w = blocks.findIndex((b) => WARM_RE.test(b.title));
  if (w >= 0) {
    const wb = blocks[w];
    const ii = wb.items.length > 2 ? wb.items.findIndex((it) => it.exerciseId === 'equilibrio-su-una-gamba-a-stella' || it.exerciseId === 'mobilita-caviglia-al-muro') : -1;
    if (ii >= 0) {
      wb.items.splice(ii, 1);
      return withEstMin({ ...s, blocks });
    }
    const multi = wb.items.findIndex((it) => it.sets > 2 && itemContacts(it) === 0);
    if (multi >= 0) {
      wb.items[multi] = { ...wb.items[multi], sets: 2 };
      return withEstMin({ ...s, blocks });
    }
    const long = wb.items.findIndex((it) => it.unit === 'secondi' && it.repMax > 300);
    if (long >= 0) {
      wb.items[long] = { ...wb.items[long], repMin: 300, repMax: 300 };
      return withEstMin({ ...s, blocks });
    }
  }
  // 5. Pavimenti e rientro: le serie in più (prevenzione, rientro) fino alla dose minima di 2 serie.
  for (const b of blocks) {
    if (WARM_RE.test(b.title)) continue;
    for (let ii = b.items.length - 1; ii >= 0; ii--) {
      const it = b.items[ii];
      if (protectedItem(it, g) && !isStrengthLegs(it) && it.sets > 2) {
        b.items[ii] = { ...it, sets: it.sets - 1 };
        return withEstMin({ ...s, blocks });
      }
    }
  }
  // 6. Corsa, intervalli e cyclette: minuti e ripetute oltre il minimo (5-10 minuti, una serie).
  for (const b of blocks) {
    if (!WARM_RE.test(b.title)) {
      const ii = b.items.findIndex((it) => it.unit === 'secondi' && it.repMax > 300 && EXERCISES[it.exerciseId]?.category === 'condizionamento' && !/^(corsa|intervalli)$/i.test(b.title));
      if (ii >= 0) {
        b.items[ii] = { ...b.items[ii], repMin: 300, repMax: 300 };
        return withEstMin({ ...s, blocks });
      }
    }
    if (!/^(corsa|intervalli)$/i.test(b.title)) continue;
    for (let ii = 0; ii < b.items.length; ii++) {
      const it = b.items[ii];
      if (it.unit === 'secondi' && it.repMax > 600) {
        b.items[ii] = { ...it, repMin: Math.max(600, it.repMin - 300), repMax: Math.max(600, it.repMax - 300) };
        return withEstMin({ ...s, blocks });
      }
      if (it.sets > 1) {
        b.items[ii] = { ...it, sets: it.sets - 1 };
        return withEstMin({ ...s, blocks });
      }
    }
  }
  // 7. Ultimi tagli prima di arrendersi: il riscaldamento oltre i primi due esercizi, gli esercizi del rientro che non
  //    sono pavimenti (la sicurezza resta: si toglie, non si sostituisce con qualcosa di più duro).
  if (w >= 0 && blocks[w].items.length > 2 && blocks[w].items.slice(2).every((it) => itemContacts(it) === 0)) {
    blocks[w].items.pop();
    return withEstMin({ ...s, blocks });
  }
  for (const b of blocks) {
    if (WARM_RE.test(b.title)) continue;
    for (let ii = b.items.length - 1; ii >= 0; ii--) {
      const it = b.items[ii];
      if (floorOf(it) || !g.rientro?.stage.exercises.includes(it.exerciseId)) continue;
      b.items.splice(ii, 1);
      return withEstMin({ ...s, blocks: blocks.filter((x) => x.items.length) });
    }
  }
  // 8. La qualità di testa lascia il posto ai pavimenti quando i minuti non bastano per tutti e due.
  for (const b of blocks) {
    if (WARM_RE.test(b.title)) continue;
    const ii = b.items.findIndex((it) => (isSprintOrJump(it) || itemMeters(it) > 0) && !protectedItem(it, g));
    if (ii >= 0) {
      b.items.splice(ii, 1);
      return withEstMin({ ...s, blocks: blocks.filter((x) => x.items.length) });
    }
  }
  return null;
}

/** Durata entro i minuti scelti + 5 (§ 3.3), con il blocco del fisioterapista. */
function fitDuration(s: WorkoutSession, g: GenCtx): WorkoutSession {
  let out = s;
  let guard = 0;
  // La durata conta nella settimana più lunga del blocco (le serie in più delle settimane 2-3 comprese).
  const longest = (x: WorkoutSession) => Math.max(...g.doses.map((d) => sessionDuration(deriveSession(x, d), g.physio).total));
  while (longest(out) > g.sessionMin + 5 && guard++ < 80) {
    const next = reduceOnce(out, g);
    if (!next) break;
    out = next;
  }
  return out;
}

/** R9: sprint e salti dopo il riscaldamento e prima della forza; Nordic e Copenhagen in fondo. */
function orderR9(s: WorkoutSession): WorkoutSession {
  const warm = s.blocks.filter((b) => WARM_RE.test(b.title));
  const rest = s.blocks.filter((b) => !WARM_RE.test(b.title));
  const quality = rest.filter((b) => b.items.every(isSprintOrJump) && b.items.length);
  const others = rest.filter((b) => !quality.includes(b));
  const all = [...warm, ...quality, ...others].map((b) => ({ ...b, items: b.items.slice() }));
  // Nordic e Copenhagen escono dal loro blocco e vanno in coda all'ultimo blocco di prevenzione.
  const tail: SessionExercise[] = [];
  for (const b of all) {
    if (WARM_RE.test(b.title)) continue;
    b.items = b.items.filter((it) => (isNordic(it) || isCopenhagen(it) ? (tail.push(it), false) : true));
  }
  const kept = all.filter((b) => b.items.length);
  if (tail.length) {
    tail.sort((a, b) => Number(isNordic(a)) - Number(isNordic(b)));
    let last = [...kept].reverse().find((b) => /prevenzione/i.test(b.title));
    if (!last) {
      last = { title: 'Prevenzione', items: [] };
      kept.push(last);
    }
    // La mobilità resta in fondo, dopo il Nordic e il Copenhagen.
    const mobility = last.items.filter((it) => EXERCISES[it.exerciseId]?.category === 'mobilita');
    last.items = [...last.items.filter((it) => EXERCISES[it.exerciseId]?.category !== 'mobilita'), ...tail, ...mobility];
  }
  return withEstMin({ ...s, blocks: kept });
}

// ───────────────────────── Settimana tipo di base ─────────────────────────

/** Settimana tipo senza partita (precampionato) o senza calcio (pausa); i tipi di giorno si ricavano dopo dal carico. */
function weekWithout(week: readonly ScheduleDay[], what: 'partita' | 'calcio'): ScheduleDay[] {
  return week.map((d) => {
    if (!d.football || (what === 'partita' && d.football.kind !== 'partita')) return { ...d };
    const { football: _f, ...rest } = d;
    return { ...rest };
  });
}

/** Tipo di giorno di una settimana tipo nuova: in stagione dai fatti, nella pausa e nel precampionato dal carico. */
function withDayTypes(week: ScheduleDay[], sessions: Readonly<Record<string, WorkoutSession>>, phase: SeasonPhase, original: readonly ScheduleDay[]): ScheduleDay[] {
  return week.map((d) => {
    if (phase === 'pausa' || (phase === 'precampionato' && dayOf(original, d.weekday)?.football?.kind === 'partita')) {
      const s = d.gymSessionId ? sessions[d.gymSessionId] : undefined;
      const load = footballPlannedLoad(d.football) + (s ? sessionPlannedLoad(s) : 0);
      return { ...d, dayType: dayTypeForLoad(load) };
    }
    const o = dayOf(original, d.weekday);
    const same = o && o.gymSessionId === d.gymSessionId && o.gymOptional === d.gymOptional && Boolean(o.football) === Boolean(d.football);
    if (same) return { ...d, dayType: o!.dayType };
    if (d.football) return { ...d, dayType: 'calcio' };
    if (d.gymSessionId) return { ...d, dayType: d.gymOptional ? 'leggero' : 'palestra' };
    return { ...d, dayType: o?.dayType === 'palestra' ? 'riposo' : (o?.dayType ?? 'riposo') };
  });
}

// ───────────────────────── Riferimento di R10 ─────────────────────────

/**
 * Riferimento di R10 (§ 3.2): il totale previsto più alto tra le 4 settimane prima, senza ricostruire piani vecchi. Per
 * le settimane del blocco in vigore si deriva da `Plan.program`; per quelle di un blocco già chiuso vale il suo
 * `peakLoad`; senza blocchi le sedute fisse con la settimana attuale (la settimana in stagione salvata, se la settimana
 * era in stagione). Uno scarico non abbassa il riferimento.
 */
export function r10Reference(monday: ISODate, plan: Plan, blocks: readonly BlockSummary[] = []): number {
  let best = 0;
  for (let k = 1; k <= 4; k++) {
    const w = addDays(monday, -7 * k);
    const summary = blocks.find((b) => b.from <= w && w <= b.to && typeof b.peakLoad === 'number');
    let total: number;
    if (plan.program && plan.program.start <= w) {
      // Settimane del blocco in vigore (o delle sedute fisse se nel frattempo è cambiata la fase): derivate dal piano.
      const l = plannedLoad(w, plan);
      total = l.football + l.controllable;
    } else if (summary) {
      total = summary.peakLoad!;
    } else {
      const inSeason = plan.season ? seasonOn(w, plan.season).phase === 'stagione' : true;
      const week = inSeason && plan.seasonWeek ? plan.seasonWeek : plan.week;
      const l = plannedLoad(w, { ...plan, week, program: undefined });
      total = l.football + l.controllable;
    }
    best = Math.max(best, total);
  }
  return best;
}

// ───────────────────────── Generatore ─────────────────────────

/** Tetti di contatti, metri e livello per la vigilia della vigilia (R3). */
const MD2 = 5;

/** Specifiche delle sedute per fase (§ 2.4, § 3.2). */
function slotSpecs(g: GenCtx, noFootballWeek: boolean): SlotSpec[] {
  const min = g.sessionMin + 5;
  const less = g.next?.sessionsDelta ?? 0;
  if (g.phase === 'pausa' && g.stage === 'transizione') {
    return [
      { slot: 'A', kind: 'alto', minutes: min },
      { slot: 'C', kind: 'leggera', minutes: min },
      { slot: 'R', kind: 'corsa', minutes: 45 },
    ];
  }
  if (g.phase === 'pausa') {
    const out: SlotSpec[] = [
      { slot: 'B', kind: 'gambe', heavyLegs: true, minutes: min },
      { slot: 'A', kind: 'alto', minutes: min },
      { slot: 'C', kind: 'gambe', heavyLegs: true, minutes: min },
      { slot: 'K', kind: 'corsa', minutes: 50 },
      { slot: 'R', kind: 'corsa', minutes: 45 },
    ];
    return less < 0 ? out.filter((s) => s.slot !== 'C') : out;
  }
  if (g.phase === 'precampionato') {
    const out: SlotSpec[] = [
      { slot: 'B', kind: 'gambe', heavyLegs: true, minutes: min },
      { slot: 'A', kind: 'alto', minutes: min },
    ];
    if (g.primary === 'resistenza') out.push({ slot: 'K', kind: 'corsa', minutes: 50 });
    return less < 0 ? out.filter((s) => s.slot !== 'A') : out;
  }
  const gym = Math.min(3, Math.max(1, g.training.gymPerWeek ?? 2)) + less;
  const out: SlotSpec[] = [{ slot: 'B', kind: 'gambe', heavyLegs: true, minutes: min }];
  if (gym >= 2) out.push({ slot: 'A', kind: 'alto', minutes: min });
  if (gym >= 3) out.push({ slot: 'C', kind: 'leggera', minutes: min });
  else if (less === 0) out.push({ slot: 'C', kind: 'leggera', optional: true, minutes: min });
  if (noFootballWeek) out.push({ slot: 'K', kind: 'corsa', minutes: 50 });
  return out;
}

/** Pavimenti assegnati alle sedute (§ 3.5), dove sono ammessi (Nordic solo da MD+2 a MD−3, gambe mai il giorno dopo la partita). */
function assignFloors(required: Partial<Record<FloorId, number>>, slots: BuildSlot[]): { missing: FloorId[] } {
  const missing: FloorId[] = [];
  const order: FloorId[] = ['forza-gambe', 'nordic', 'copenhagen', 'polpacci', 'tibiale', 'polso'];
  // Le sedute facoltative non contano: i pavimenti vanno in quelle previste, se ce ne sono.
  const planned = slots.filter((s) => s.kind !== 'corsa' && !s.optional);
  const gymSlots = planned.length ? planned : slots.filter((s) => s.kind !== 'corsa');
  for (const f of order) {
    let n = required[f] ?? 0;
    if (!n) continue;
    const pref = (s: BuildSlot) => {
      if (f === 'forza-gambe') return s.kind === 'gambe' ? 0 : 9;
      if (f === 'nordic') return s.kind === 'gambe' ? 0 : s.kind === 'alto' ? 2 : 9;
      if (f === 'copenhagen') return s.kind === 'alto' ? 0 : s.kind === 'gambe' ? 1 : 2;
      if (f === 'polpacci') return s.kind === 'gambe' && !s.secondLegs ? 0 : s.kind === 'alto' ? 1 : 2;
      if (f === 'tibiale') return s.kind === 'gambe' && !s.secondLegs ? 0 : 1;
      return s.kind === 'alto' ? 0 : s.kind === 'gambe' ? 1 : 2;
    };
    const allowed = (s: BuildSlot) => {
      if (f === 'nordic') return s.md === null || [2, 3, 4].includes(s.md);
      if (f === 'forza-gambe') return s.kind === 'gambe';
      return true;
    };
    // A parità di preferenza (o quasi: una differenza di 1) la seduta con meno pavimenti, così nessuna si allunga troppo.
    const candidates = gymSlots.filter(allowed).sort((a, b) => {
      const pa = pref(a);
      const pb = pref(b);
      if (Math.abs(pa - pb) <= 1 && f !== 'forza-gambe' && f !== 'nordic') return a.floors.length - b.floors.length || pa - pb;
      return pa - pb;
    });
    for (const s of candidates) {
      if (n <= 0) break;
      if (!s.floors.includes(f)) {
        s.floors.push(f);
        n--;
      }
    }
    if (n > 0) missing.push(f);
  }
  return { missing };
}

/**
 * Blocco di allenamento (§ 3.12). Deterministico: stessi ingressi, stesso blocco; `attempt` cambia solo le varianti.
 */
export function buildBlock(input: TrainingBuildInput): TrainingBuildResult {
  const monday = weekStart(input.monday);
  const plan = input.plan;
  const info = seasonOn(monday, plan.season);
  const phase = info.phase;
  const stage = info.stage;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const blocks = input.blocks ?? (input.previous ? [input.previous] : []);
  const state = {
    plan,
    workoutLogs: input.workoutLogs as WorkoutLog[],
    footballLogs: input.footballLogs as FootballLog[],
    checkIns: input.checkIns as Record<ISODate, CheckIn>,
    physio: input.physio,
    profile: { painSites: [...input.painSites] } as unknown as Profile,
  };

  // Settimana di base per fase (§ 2.4).
  const seasonWeek = plan.seasonWeek ?? (matchWeekday(plan.week) !== null ? plan.week : undefined);
  let baseWeek: ScheduleDay[];
  let nextSeasonWeek: ScheduleDay[] | null | undefined;
  if (phase === 'pausa') {
    baseWeek = weekWithout(seasonWeek ?? plan.week, 'calcio');
    if (!plan.seasonWeek && seasonWeek) nextSeasonWeek = seasonWeek.map((d) => ({ ...d }));
  } else if (phase === 'precampionato') {
    baseWeek = weekWithout(seasonWeek ?? plan.week, 'partita');
    if (!plan.seasonWeek && seasonWeek) nextSeasonWeek = seasonWeek.map((d) => ({ ...d }));
  } else {
    baseWeek = (plan.seasonWeek ?? plan.week).map((d) => ({ ...d }));
    if (plan.seasonWeek) nextSeasonWeek = null;
  }
  const noFootballWeek = phase === 'stagione' && baseWeek.every((d) => !d.football);

  // Obiettivo valido nella fase, rientro e fine del blocco prima.
  const phaseCtx = { phase, ...(info.lateBreak ? { lateBreak: true } : {}), ...(noFootballWeek ? { noFootballWeek: true } : {}) };
  let training: TrainingGoal = plan.training ?? DEFAULT_TRAINING;
  let trainingChanged = false;
  const review = plan.program && plan.program.start < monday ? blockReview(plan.program, { ...state, painSites: input.painSites, physio: input.physio }, addDays(monday, -1)) : undefined;
  // Dopo la transizione (recupero attivo, senza progressione) il riepilogo non toglie sedute né volume: conta solo il dolore.
  const fromRecovery = plan.program?.stage === 'transizione';
  const nextPlan = review && (!fromRecovery || review.verdict === 'rientro') ? nextBlockPlan(review, { phase, training, blocks }) : undefined;
  if (review) reasons.push(review.reasons[0]);
  // Rientro proposto: dal riepilogo del blocco, o dal fermo degli impatti senza rientro (§ 3.8).
  const hold = impactHoldActive(plan, monday) ? plan.impactHold : undefined;
  const wantReturn = nextPlan?.rientro ?? (hold && !activeReturn(plan) ? { site: hold.site, primary: false } : undefined);
  if (wantReturn && !activeReturn({ training })) {
    const rientro = { site: wantReturn.site, stage: 0 as const, since: monday };
    const fragile = isFragileReturnSite(wantReturn.site);
    training = wantReturn.primary || (fragile && IMPACT_QUALITIES.has(training.primary))
      ? { ...stripPreset(training), primary: 'rientro', secondary: 'prevenzione', rientro }
      : { ...stripPreset(training), secondary: 'rientro', rientro };
    trainingChanged = true;
  }
  const tf = trainingForPhase(training, phaseCtx);
  if (tf.replaced) {
    training = tf.training;
    trainingChanged = true;
    warnings.push(`«${tf.replaced.from}» non vale in questa fase: diventa «${tf.replaced.to}»`);
  }
  if (nextPlan?.suggested && phase !== 'precampionato' && !(stage === 'transizione')) {
    const s = nextPlan.suggested;
    const candidate: TrainingGoal = { ...stripPreset(training), primary: s.primary, ...(s.secondary ? { secondary: s.secondary } : { secondary: undefined }) };
    if (!candidate.secondary) delete candidate.secondary;
    const ok = trainingForPhase(candidate, phaseCtx);
    if (!ok.replaced && (candidate.primary !== training.primary || candidate.secondary !== training.secondary)) {
      training = matchPreset(candidate);
      trainingChanged = true;
      reasons.push(`Dopo due blocchi con la stessa qualità: ${describeTraining(training)}`);
    }
  }
  // Stadio del rientro (si scende da soli, si sale con il criterio e, dove serve, con il via libera).
  let rientroStage: { stage: ReturnStage; site: string } | undefined;
  const ret = activeReturn({ training });
  if (ret) {
    const advice = returnAdvice(ret, monday, { plan, checkIns: input.checkIns, workoutLogs: input.workoutLogs });
    if (advice.stage !== ret.stage) {
      training = { ...training, rientro: { ...ret, stage: advice.stage, since: monday, physioOk: undefined } };
      if (!training.rientro!.physioOk) delete training.rientro!.physioOk;
      trainingChanged = true;
      reasons.push(advice.reason);
    }
    rientroStage = { stage: returnStageOf(training.rientro!), site: ret.site };
  }

  // Livelli, spazi, freni.
  const impactThr = impactThresholdFor(plan);
  const r8 = r8Active(plan, input.checkIns, addDays(monday, -1));
  const noImpact = Boolean(hold) || r8;
  let level = plyoTargetLevel(input, info, nextPlan, impactThr);
  if (rientroStage) level = Math.min(level, rientroStage.stage.maxImpactLevel) as ImpactLevel;
  if (noImpact) level = 0;
  if (r8) reasons.push(R8_TEXT);
  const gate = painGate(state, addDays(monday, -1), { sessionId: null });
  const sessionMin = Math.max(30, Math.min(90, (training.sessionMin ?? 60) + (nextPlan?.minutesDelta ?? 0)));
  const shape = blockShape(monday, info, plan.season, { extraLight: nextPlan?.extraLightWeek, flat: nextPlan?.noVolumeIncrease });
  const seed = seedOf('blocco', monday, stableStringify({ training, phase, stage, week: baseWeek.map((d) => [d.football?.kind ?? '', d.gymSessionId ?? '']) }), input.attempt);
  const g: GenCtx = {
    monday,
    info,
    phase,
    stage,
    training,
    primary: training.primary,
    ...(training.secondary ? { secondary: training.secondary } : {}),
    spaces: availableSpaces(training.spaces),
    level,
    runLevel: noImpact || r8 ? 0 : rientroStage ? rientroStage.stage.maxImpactLevel : 3,
    noImpact,
    r8,
    elbowSite: input.painSites.some(isElbowSite),
    elbowBrake: gate.elbowOver,
    lowerLegSite: input.painSites.some(isLowerLegSite),
    ...(rientroStage ? { rientro: rientroStage } : {}),
    ...(nextPlan ? { next: nextPlan } : {}),
    ...(plan.program ? { previous: plan.program } : {}),
    rng: mulberry32(seed),
    attempt: Math.max(0, Math.trunc(input.attempt) || 0),
    sessionMin,
    physio: input.physio,
    floorsCovered: physioFloors(input.physio),
    doses: shape.dose,
  };

  // 1. Posizione delle sedute (R1-R7, lavoro).
  const specs = slotSpecs(g, noFootballWeek);
  const placed = placeSessions(baseWeek, specs, { plan, noMatch: phase !== 'stagione' });
  const gymPlaced = placed.placements.filter((p) => specs.find((s) => s.slot === p.slot)?.kind !== 'corsa');
  const season = info;
  // Senza un giorno libero dal calcio per la palestra (per esempio calcio tutti i giorni) la proposta non nasce.
  if (!gymPlaced.some((p) => !dayOf(baseWeek, p.weekday)?.football)) {
    return { program: null, reasons: [NO_GYM_DAY_TEXT], warnings: [NO_GYM_DAY_TEXT], violations: [], ...(review ? { review } : {}), peakLoad: 0, weekLoads: [], season };
  }
  for (const slot of placed.dropped) {
    const spec = specs.find((s) => s.slot === slot);
    if (spec && !spec.optional) warnings.push(`Seduta ${slot} tolta: nessun giorno libero dal calcio e dal lavoro`);
  }
  const growth = Math.max(1, ...shape.dose.map((d) => d.impactFactor));
  const limits = contactLimitsFor(phase, stage);

  // 2. Contenuto: qualità, forza, pavimenti.
  const md = matchWeekday(baseWeek);
  const slots: BuildSlot[] = placed.placements.map((p) => {
    const spec = specs.find((s) => s.slot === p.slot)!;
    const d = phase === 'stagione' && md !== null ? (((p.weekday - md) % 7) + 7) % 7 : null;
    return {
      slot: p.slot,
      kind: spec.kind,
      md: d,
      footballDay: Boolean(dayOf(baseWeek, p.weekday)?.football),
      floors: [],
      ...(spec.optional ? { optional: true } : {}),
      contactsBudget: 0,
      ...(spec.kind === 'corsa' ? { run: p.slot === 'R' ? ('facile' as const) : ('intermittente' as const) } : {}),
      ...(phase === 'pausa' && p.slot === 'C' && spec.kind === 'gambe' ? { secondLegs: true } : {}),
    };
  });
  // Qualità: la principale nella prima seduta di gambe, la secondaria nella seconda (pausa) o in coda alla prima.
  const legSlots = slots.filter((s) => s.kind === 'gambe');
  const headQ = (q: TrainingQuality | undefined) => (q && ['potenza', 'rapidita', 'velocita'].includes(q) ? q : undefined);
  const qP = headQ(g.primary);
  const qS = headQ(g.secondary);
  if (legSlots[0]) {
    legSlots[0].quality = qP ?? qS;
    if (qP && qS && !legSlots[1]) legSlots[0].quality2 = qS;
  }
  if (legSlots[1]) legSlots[1].quality = qS ?? qP;
  const host = legSlots[0] ?? slots.find((s) => s.kind === 'alto') ?? slots.find((s) => s.kind !== 'corsa' && s.md !== MD2) ?? slots.find((s) => s.kind !== 'corsa');
  if (host) host.returnHere = true;
  // Budget dei contatti della settimana 1: i tetti valgono anche dopo i fattori delle settimane (§ 3.4).
  const returnCap = rientroStage?.stage.contactsMax;
  const sessionCap = Math.floor(Math.min(limits.session, returnCap ?? limits.session) / growth);
  const weekCap = Math.floor(limits.week / growth);
  const prevContacts = g.previous ? Math.max(0, ...Object.values(g.previous.sessions).map(sessionContacts)) : 0;
  const factorCap = nextPlan && nextPlan.contactsFactor < 1 && prevContacts > 0 ? Math.floor(prevContacts * nextPlan.contactsFactor) : Infinity;
  const prevLevel = g.previous ? Math.max(0, ...Object.values(g.previous.sessions).map((s) => plyoLevel(s))) : 0;
  const levelCap = g.previous && level > prevLevel && prevContacts > 0 ? Math.floor(prevContacts * 0.8) : Infinity;
  const perLeg = Math.min(sessionCap, factorCap, levelCap);
  const legCount = Math.max(1, legSlots.length);
  for (const s of legSlots) s.contactsBudget = Math.max(0, Math.min(perLeg, Math.floor(weekCap / legCount)));
  // Pavimenti (§ 3.5), meno quelli del fisioterapista e con le sedute che ci sono.
  const required = requiredFloors(phase, { elbow: g.elbowSite, physio: input.physio, inSeasonStrength: !(rientroStage && ['gamba', 'flessori'].includes(returnZone(rientroStage.site))) });
  const gymCount = Math.max(1, slots.filter((s) => s.kind !== 'corsa' && !s.optional).length);
  for (const k of Object.keys(required) as FloorId[]) required[k] = Math.min(required[k] ?? 0, gymCount);
  const { missing } = assignFloors(required, slots);
  for (const f of missing) {
    warnings.push(`Pavimento senza un giorno adatto: ${FLOOR_LABEL[f]}`);
    delete required[f];
  }

  const ctxFor = (s: BuildSlot): SubstituteCtx => {
    let max: ImpactLevel = s.kind === 'corsa' ? g.runLevel : g.level;
    if (s.md === 1) max = 0;
    if (s.md === MD2) max = Math.min(max, 1) as ImpactLevel;
    if (s.footballDay) max = 0;
    if (g.noImpact) max = 0;
    return {
      maxLevel: max,
      allowed: g.noImpact ? [] : (rientroStage?.stage.allowed ?? []),
      elbow: g.elbowBrake,
      spaces: g.spaces,
    };
  };
  let sessions: Record<string, WorkoutSession> = {};
  for (const s of slots) {
    let session = buildSession(g, s);
    session = applySafety(session, ctxFor(s));
    const cap = s.md === MD2 ? Math.min(MD2_CONTACTS_MAX, sessionCap) : s.contactsBudget > 0 ? Math.max(s.contactsBudget, 0) : sessionCap;
    session = capContacts(session, Math.min(cap, sessionCap), Math.min(WARMUP_CONTACTS_MAX, rientroStage?.stage.contactsMax ?? WARMUP_CONTACTS_MAX));
    session = capMeters(session, Math.floor((s.md === MD2 ? 80 : SPEED_METERS_MAX) / growth), Math.floor(AGILITY_METERS_MAX / growth));
    session = orderR9(session);
    session = fitDuration(session, g);
    sessions[s.slot] = session;
  }
  // Contatti della settimana entro il tetto (le sedute di gambe prima).
  let weekC = Object.values(sessions).reduce((t, x) => t + sessionContacts(x), 0);
  for (const s of [...slots].reverse()) {
    if (weekC <= weekCap) break;
    const cur = sessionContacts(sessions[s.slot]);
    const cut = Math.max(0, cur - (weekC - weekCap));
    sessions[s.slot] = capContacts(sessions[s.slot], cut, Math.min(cut, WARMUP_CONTACTS_MAX));
    weekC = Object.values(sessions).reduce((t, x) => t + sessionContacts(x), 0);
  }

  // Volume del verdetto «alleggerisci» (−20%).
  if (nextPlan && nextPlan.volumeFactor < 1) {
    for (const k of Object.keys(sessions)) sessions[k] = scaleVolume(sessions[k], nextPlan.volumeFactor);
  }

  // Le serie in più delle settimane di carico restano solo se ogni seduta sta nei minuti scelti.
  for (let k = 1; k < shape.dose.length; k++) {
    const d = shape.dose[k];
    if (d.mainSetsAdd > 0 && Object.values(sessions).some((x) => sessionDuration(deriveSession(x, d), input.physio).total > sessionMin + 5)) {
      shape.dose[k] = { ...d, mainSetsAdd: 0 };
    }
  }

  // Settimana tipo con le sedute e i tipi di giorno.
  const placedWeek = withDayTypes(applyPlacements(baseWeek, placed.placements), sessions, phase, phase === 'stagione' ? plan.week : (seasonWeek ?? plan.week));
  const dose = shape.dose.map((d) => ({ ...d }));

  // 3. R10: previsto contro previsto, settimana per settimana del blocco.
  const reference0 = r10Reference(monday, plan, blocks);
  let floorsOnly = false;
  const loadsFor = (prog: Program) =>
    prog.weeks.map((_, k) => {
      const derived: Record<string, WorkoutSession> = {};
      for (const slot of Object.keys(prog.sessions)) derived[slot] = programSession(prog, slot, k + 1)!;
      return weekPlannedLoad(placedWeek, derived);
    });
  const program = (): Program => ({
    blockId: `${phase}-${monday}-${hashString(stableStringify({ training: { p: g.primary, s: g.secondary }, stage, attempt: g.attempt })).toString(36)}`,
    start: monday,
    weeks: shape.weeks,
    dose,
    phase,
    stage,
    primary: g.primary,
    ...(g.secondary ? { secondary: g.secondary } : {}),
    sessions,
  });
  const check = (prog: Program): { ok: boolean; refs: number[]; loads: { football: number; controllable: number }[] } => {
    const loads = loadsFor(prog);
    const refs: number[] = [];
    let ok = true;
    const window: number[] = [];
    // Le 4 settimane prima del blocco danno il riferimento iniziale; dentro il blocco il riferimento sale con il previsto.
    for (let k = 0; k < loads.length; k++) {
      const ref = Math.max(reference0, ...window.slice(-4));
      refs.push(ref);
      const total = loads[k].football + loads[k].controllable;
      if (ref > 0 && total > ref * 1.1 + 1e-6) ok = false;
      window.push(total);
    }
    return { ok, refs, loads };
  };
  let res = check(program());
  const failing = (r: typeof res) => r.loads.map((l, k) => r.refs[k] > 0 && l.football + l.controllable > r.refs[k] * 1.1 + 1e-6);
  // Una seduta alla volta, la più carica per prima: prima gli accessori, poi i principali, poi contatti e metri.
  const reduceWhile = (bad: () => boolean) => {
    let guard = 0;
    while (bad() && guard++ < 200) {
      const order = Object.keys(sessions).sort((a, b) => sessionPlannedLoad(sessions[b]) - sessionPlannedLoad(sessions[a]));
      let changed = false;
      for (const slot of order) {
        const next = reduceOnce(sessions[slot], g);
        if (next) {
          sessions = { ...sessions, [slot]: next };
          changed = true;
          break;
        }
      }
      if (!changed) break;
      res = check(program());
    }
  };
  // 1. La settimana 1 dentro il riferimento delle 4 settimane prima.
  reduceWhile(() => failing(res)[0]);
  // 2. Le settimane dopo: la serie in più (precampionato e pausa) resta solo se ci sta. Il riferimento sale con il
  //    previsto delle settimane del blocco: così nel precampionato la palestra riparte da poco e cresce.
  for (let k = 1; k < dose.length; k++) {
    if (failing(res)[k] && dose[k].mainSetsAdd > 0) {
      dose[k] = { ...dose[k], mainSetsAdd: 0 };
      res = check(program());
    }
  }
  // 3. Se una settimana resta sopra, ancora tagli sulla settimana 1 (ne derivano tutte).
  reduceWhile(() => failing(res).some(Boolean));
  res = { ...res, ok: !failing(res).some(Boolean) };
  if (!res.ok) {
    floorsOnly = true;
    warnings.push(FLOORS_ONLY_TEXT);
  }
  if (phase === 'precampionato' && reference0 > 0) {
    const f0 = res.loads[0]?.football ?? 0;
    if (f0 > 0) reasons.push(RAMP_TEXT);
  }

  // 4-5. Programma finale e validazione di ogni settimana.
  const prog = program();
  const patchedPlan: Plan = { ...plan, week: placedWeek, program: prog };
  const known = new Set<string>([
    ...Object.values(SESSIONS).flatMap((s) => s.blocks.flatMap((b) => b.items.map((it) => it.exerciseId))),
    ...Object.values(prog.sessions).flatMap((s) => s.blocks.flatMap((b) => b.items.map((it) => it.exerciseId))),
    ...input.workoutLogs.flatMap((w) => w.exercises.map((e) => e.exerciseId)),
  ]);
  const tctx: TrainingCtx = {
    painSites: input.painSites,
    physio: input.physio,
    checkIns: input.checkIns,
    ...(g.noImpact ? { maxImpactLevel: 0 as ImpactLevel } : rientroStage ? { maxImpactLevel: rientroStage.stage.maxImpactLevel } : {}),
    allowed: g.noImpact ? [] : (rientroStage?.stage.allowed ?? []),
    ...(returnCap ? { returnContactsMax: returnCap } : {}),
    r8,
    spaces: training.spaces,
    sessionMin,
    floorsOnly,
    knownExercises: known,
    floors: required,
  };
  const violations: Violation[] = [];
  const weekLoads: TrainingBuildResult['weekLoads'] = [];
  for (let k = 1; k <= prog.weeks.length; k++) {
    const ref = res.refs[k - 1] ?? reference0;
    const vs = validateWeek(patchedPlan, prog, k, { ...tctx, reference: ref });
    for (const x of vs) if (x.hard) violations.push({ ...x, message: `Settimana ${k}: ${x.message}` });
    const l = res.loads[k - 1];
    weekLoads.push({ football: l.football, controllable: l.controllable, reference: ref });
  }
  const peakLoad = Math.max(0, ...weekLoads.map((l) => l.football + l.controllable));
  if (placed.moved.some((slot) => specs.find((s) => s.slot === slot && s.kind !== 'corsa')) && phase === 'stagione') {
    reasons.push('Sedute spostate nei giorni ammessi, fuori dal lavoro e lontano dal calcio');
  }
  if (!reasons.length) reasons.push(defaultReason(g, md, slots));
  const weekChanged = stableStringify(placedWeek) !== stableStringify(plan.week);
  return {
    program: prog,
    ...(weekChanged ? { week: placedWeek } : {}),
    reasons: unique(reasons).slice(0, 3),
    warnings: unique(warnings),
    violations,
    ...(trainingChanged ? { training } : {}),
    ...(nextSeasonWeek !== undefined ? { seasonWeek: nextSeasonWeek } : {}),
    ...(review ? { review } : {}),
    peakLoad,
    weekLoads,
    season,
  };
}

const unique = (xs: string[]) => [...new Set(xs.filter(Boolean))];

function stripPreset(t: TrainingGoal): TrainingGoal {
  const { presetId: _p, ...rest } = t;
  return rest;
}

/** Obiettivo pronto che coincide con principale e secondaria, se c'è. */
function matchPreset(t: TrainingGoal): TrainingGoal {
  const p = Object.values(PRESET_BY_ID).find((x) => x.primary === t.primary && x.secondary === t.secondary);
  return p ? { ...t, presetId: p.id } : stripPreset(t);
}

function defaultReason(g: GenCtx, md: number | null, slots: BuildSlot[]): string {
  const legs = slots.find((s) => s.kind === 'gambe');
  if (g.phase === 'stagione' && md !== null && legs?.md !== null && legs) {
    return `Gambe pesanti a ${mdLabel(legs.md)}, circa 72 ore prima della partita`;
  }
  if (g.phase === 'pausa') return g.stage === 'transizione' ? 'Pausa: due settimane di recupero attivo, niente test' : 'Pausa: tre sedute di palestra e due di corsa';
  if (g.phase === 'precampionato') return 'Precampionato: la squadra porta il carico, la palestra lo completa';
  return `Obiettivo: ${describeTraining(g.training)}`;
}

/** Volume (serie) × fattore, all'intero più vicino, mai sotto 1 (2 per la forza di gambe). */
function scaleVolume(s: WorkoutSession, f: number): WorkoutSession {
  return withEstMin({
    ...s,
    blocks: s.blocks.map((b) => ({
      ...b,
      items: b.items.map((it) => (WARM_RE.test(b.title) ? it : { ...it, sets: Math.max(isStrengthLegs(it) ? 2 : 1, Math.round(it.sets * f)) })),
    })),
  });
}

// ───────────────────────── Quando nasce una proposta di blocco ─────────────────────────

export type BlockTrigger = 'fine-blocco' | 'fase' | 'obiettivo' | 'primo';

/**
 * Perché serve una proposta di blocco nella giornata (§ 5.3), o null: domenica dell'ultima settimana del blocco o dopo
 * (anche nel blocco ripetuto senza approvazione, a ogni fine ciclo di 4 settimane), cambio di fase dal lunedì dopo,
 * obiettivo di allenamento diverso da quello del blocco. Senza blocco: `primo` se l'utente ha scelto un obiettivo o le
 * date della stagione.
 */
export function blockTrigger(plan: Pick<Plan, 'program' | 'season' | 'training'>, today: ISODate): BlockTrigger | null {
  const monday = mondayOnOrAfter(addDays(today, 1));
  const p = plan.program;
  if (!p) return plan.training || plan.season ? 'primo' : null;
  const info = seasonOn(monday, plan.season);
  if (info.phase !== p.phase) return 'fase';
  const t = plan.training;
  if (t && (t.primary !== p.primary || (t.secondary ?? null) !== (p.secondary ?? null))) return 'obiettivo';
  const weeks = Math.floor(daysBetween(p.start, monday) / 7);
  if (weeks >= p.weeks.length && (weeks - p.weeks.length) % 4 === 0) return 'fine-blocco';
  return null;
}

// ───────────────────────── Proposta del blocco ─────────────────────────

/** Ingressi del generatore dallo stato (già proiettato) e dalla giornata. */
export function buildInputOf(state: AppData, today: ISODate, attempt: number): TrainingBuildInput {
  const blocks = state.planner?.blocks ?? [];
  return {
    monday: mondayOnOrAfter(addDays(today, 1)),
    plan: state.plan,
    workoutLogs: state.workoutLogs ?? [],
    footballLogs: state.footballLogs ?? [],
    checkIns: state.checkIns ?? {},
    physio: state.physio ?? { exercises: [], prescriptions: [] },
    painSites: state.profile?.painSites ?? [],
    ...(blocks.length ? { previous: blocks[blocks.length - 1], blocks } : {}),
    attempt,
  };
}

/** Primo giorno, da `from`, in cui la palestra o il tipo di giorno cambiano con la toppa; null se non cambia niente. */
function firstChangedDay(plan: Plan, next: Plan, from: ISODate, days: number): ISODate | null {
  for (let i = 0; i < days; i++) {
    const iso = addDays(from, i);
    const wd = weekdayOf(iso);
    const a = dayOf(plan.week, wd);
    const b = dayOf(next.week, wd);
    if (dayTypeFor(iso, plan) !== dayTypeFor(iso, next)) return iso;
    const sa = a?.gymSessionId ? sessionFor(a.gymSessionId, iso, plan) : undefined;
    const sb = b?.gymSessionId ? sessionFor(b.gymSessionId, iso, next) : undefined;
    if (stableStringify(sa ?? null) !== stableStringify(sb ?? null) || a?.gymTime !== b?.gymTime) return iso;
  }
  return null;
}

/**
 * Proposta di blocco dal `BuildContext` di features/piano/actions.ts (§ 5): il blocco dal lunedì dopo, con le differenze
 * rispetto al piano proiettato, i motivi e gli avvisi. `effectiveFrom` = `program.start` (un lunedì): il blocco in vigore
 * resta fino a quel giorno. Si può approvare fino al giorno prima del primo giorno in cui sedute o tipo di giorno
 * cambierebbero (`approvableUntil`). Null se la settimana non lascia nessun giorno per la palestra.
 */
export function buildBlockProposal(ctx: BuildContext): PlanProposal | null {
  const s = ctx.state;
  const input = buildInputOf(s, ctx.today, ctx.attempt);
  const res = buildBlock(input);
  if (!res.program) return null;
  const patch: PlanPatch = { program: res.program };
  if (res.week) patch.week = res.week;
  if (res.seasonWeek !== undefined) patch.seasonWeek = res.seasonWeek;
  if (res.training) patch.training = res.training;
  const monday = res.program.start;
  const nextPlan: Plan = { ...s.plan, program: res.program, ...(res.week ? { week: res.week } : {}) };
  const first = firstChangedDay(s.plan, nextPlan, monday, 28);
  const approvableUntil = first ? addDays(first, -1) : addDays(monday, 6);
  const physioNames = new Map((s.physio?.exercises ?? []).map((e) => [e.id, e.name]));
  const diff = sortDiff(diffPatch(s.plan, s.profile, patch, { exerciseName: (id) => physioNames.get(id) }));
  const basis = planBasis('blocco', { plan: s.plan, profile: s.profile, physio: s.physio });
  return {
    id: proposalId('blocco', monday, basis, ctx.attempt),
    kind: 'blocco',
    status: 'aperta',
    createdAt: ctx.today,
    effectiveFrom: monday,
    approvableUntil: approvableUntil < addDays(monday, -1) ? addDays(monday, -1) : approvableUntil,
    basis,
    attempt: ctx.attempt,
    title: `Nuovo blocco ${fromDayLabel(monday)}`,
    subtitle: describeBlock(res.program),
    patch,
    diff,
    reasons: res.reasons.slice(0, 3),
    ...(res.warnings.length ? { warnings: res.warnings } : {}),
    source: 'motore',
  };
}

// ───────────────────────── Proposta degli obiettivi ─────────────────────────

/** Bozza della pagina Obiettivi: corpo e allenamento scelti, non ancora approvati. */
export interface GoalsDraft {
  goal?: Goal;
  training?: TrainingGoal | null;
}

const GOAL_LABEL: Record<Goal, string> = { ricomposizione: 'Ricomposizione', dimagrimento: 'Dimagrimento', massa: 'Massa', mantenimento: 'Mantenimento' };

/**
 * Proposta di obiettivi (§ 2.1, § 5.3) dalla bozza della pagina Obiettivi: obiettivo del corpo con le calorie per tipo
 * di giorno ricalcolate (`targetsForGoal`), deficit dentro i limiti (500 kcal e il 20% del dispendio), proteine 2,2 g/kg
 * in dimagrimento; obiettivo di allenamento valido nella fase. Vale da domani. Null se la bozza non cambia niente.
 */
export function goalsProposal(state: AppData, today: ISODate, draft: GoalsDraft, attempt = 0): PlanProposal | null {
  const plan = state.plan;
  const profile = state.profile;
  const patch: PlanPatch = {};
  const reasons: string[] = [];
  if (draft.goal && draft.goal !== profile.goal) {
    const current = goalDeltaOf(plan, profile, state.reviews ?? []);
    const maxDeficit = Math.min(...(['calcio', 'palestra', 'leggero', 'riposo'] as const).map((t) => allowedDeficitKcal(expenditureKcal(plan, t, current))));
    const weight = latestWeight(state, today) ?? (profile.startWeightKg > 0 ? profile.startWeightKg : undefined);
    const next = targetsForGoal(plan.targets, current, draft.goal, { weightKg: weight, maxDeficitKcal: maxDeficit });
    patch.goal = draft.goal;
    patch.targets = next.targets;
    patch.goalDeltaKcal = next.goalDeltaKcal;
    const d = next.goalDeltaKcal;
    reasons.push(
      d < 0
        ? `${fmtNumber(-d)} kcal sotto il dispendio, mai a partita e vigilia`
        : d > 0
          ? `${fmtNumber(d)} kcal sopra il dispendio`
          : 'Calorie uguali al dispendio stimato',
    );
    if (next.capped) reasons.push('Deficit tagliato ai limiti di sicurezza');
    if (draft.goal === 'dimagrimento') reasons.push('Proteine a 2,2 g per kg: in deficit servono per tenere il muscolo');
  }
  if (draft.training !== undefined) {
    const cur = plan.training ?? null;
    const t = draft.training;
    if (stableStringify(cur) !== stableStringify(t)) {
      const info = seasonOn(addDays(today, 1), plan.season);
      const fixed = t ? trainingForPhase(t, { phase: info.phase, ...(info.lateBreak ? { lateBreak: true } : {}) }) : null;
      patch.training = fixed ? fixed.training : null;
      if (fixed?.replaced) reasons.push(`«${fixed.replaced.from}» non vale in questa fase: diventa «${fixed.replaced.to}»`);
      reasons.push(`Allenamento: ${describeTraining(patch.training)}`);
    }
  }
  if (!Object.keys(patch).length) return null;
  const effectiveFrom = addDays(today, 1);
  const basis = planBasis('obiettivi', { plan, profile, physio: state.physio });
  const diff = sortDiff(diffPatch(plan, profile, patch, { deltaInForce: goalDeltaOf(plan, profile, state.reviews ?? []) }));
  const subtitle = patch.goal
    ? `${GOAL_LABEL[patch.goal]}: ${deltaWords(patch.goalDeltaKcal ?? 0)}`
    : `Allenamento: ${describeTraining(patch.training)}`;
  return {
    id: proposalId('obiettivi', effectiveFrom, basis, attempt),
    kind: 'obiettivi',
    status: 'aperta',
    createdAt: today,
    effectiveFrom,
    basis,
    attempt,
    title: 'Nuovi obiettivi da domani',
    subtitle,
    patch,
    diff,
    reasons: reasons.slice(0, 3),
    source: 'motore',
  };
}

function deltaWords(d: number | null): string {
  if (typeof d !== 'number' || d === 0) return 'calorie del dispendio';
  return d < 0 ? `−${fmtNumber(-d)} kcal, mai a partita e vigilia` : `+${fmtNumber(d)} kcal`;
}

/** Peso più recente dai controlli del mattino fino alla data. */
function latestWeight(state: Pick<AppData, 'checkIns'>, today: ISODate): number | undefined {
  let best: [ISODate, number] | undefined;
  for (const [d, c] of Object.entries(state.checkIns ?? {})) {
    if (d > today || typeof c?.weightKg !== 'number' || !(c.weightKg > 0)) continue;
    if (!best || d > best[0]) best = [d, c.weightKg];
  }
  return best?.[1];
}

/**
 * Generatore registrabile delle proposte di obiettivi (`registerProposalBuilder('obiettivi', …)`): rifà la proposta dalla
 * bozza che la proposta di partenza conteneva (obiettivo del corpo e di allenamento della sua toppa).
 */
export function buildGoalsProposal(ctx: BuildContext): PlanProposal | null {
  const p = ctx.previous;
  if (!p) return null;
  const draft: GoalsDraft = {
    ...(p.patch.goal ? { goal: p.patch.goal } : {}),
    ...(p.patch.training !== undefined ? { training: p.patch.training } : {}),
  };
  return goalsProposal(ctx.state, ctx.today, draft, ctx.attempt);
}

/** Testo delle sedute di un blocco per i riepiloghi («3 sedute e 2 uscite»). */
export function blockSessionsText(p: Pick<Program, 'sessions'>): string {
  const slots = Object.keys(p.sessions);
  const runs = slots.filter((s) => s === 'K' || s === 'R').length;
  const gym = slots.length - runs;
  return runs ? `${plural(gym, 'seduta', 'sedute')} e ${plural(runs, 'uscita', 'uscite')}` : plural(gym, 'seduta', 'sedute');
}

/** Settimana del blocco (1 = la prima) e tipo, per la pillola «Settimana 2 di 4 · carico». */
export function blockWeekInfo(plan: Pick<Plan, 'program'> & Partial<Pick<Plan, 'season'>>, iso: ISODate): { week: number; of: number; kind: BlockWeekKind } | null {
  const p = plan.program;
  if (!p || iso < p.start) return null;
  const k = Math.floor(daysBetween(p.start, iso) / 7);
  const d = programWeekDose(p, k);
  if (!d) return null;
  if (k < p.weeks.length) return { week: k + 1, of: p.weeks.length, kind: p.weeks[k] };
  const pos = (k - p.weeks.length) % 4;
  return { week: pos + 1, of: 4, kind: d.deload ? 'scarico' : 'carico' };
}
