/**
 * Rientro da infortunio guidato dal dolore (docs/FASE2.md § 3.8). Funzioni pure, senza orologio.
 *
 * La regola di base resta quella di `painGate`: dolore entro la soglia, avanti; sopra la soglia o in aumento il mattino
 * dopo, mantieni o riduci. Il rientro aggiunge stadi per zona (`Plan.training.rientro`). Ogni stadio ha un livello
 * d'impatto massimo (`maxImpactLevel`) e le sue eccezioni (`allowed`): la sostituzione (`substituteFor`) li applica a
 * ogni esercizio, riscaldamento compreso. Si scende da soli; si sale con il criterio, e negli stadi con impatti o corsa
 * anche con il via libera del fisioterapista (`physioOk`, un interruttore, non una diagnosi).
 *
 * I segnali d'allarme (dolore in un punto preciso dell'osso, a riposo o di notte, saltello doloroso) fermano gli impatti
 * con `Plan.impactHold`: livello 0 ovunque finché un via libera esplicito non lo toglie, e il rientro riparte dallo
 * stadio 0 (`setImpactHold` nello store fa la stessa cosa sullo stato).
 */
import type { CheckIn, ISODate, Plan, ReturnPlan, WorkoutLog } from '../../domain/types';
import type { ImpactLevel } from '../../data/exercises';
import { addDays, isISODate } from '../dates';
import { impactHoldOn, impactThresholdFor, isElbowSite, isLowerLegSite } from '../training';

export type ReturnZone = 'gamba' | 'flessori' | 'gomito' | 'adduttori' | 'altro';

/** Uno stadio del rientro. */
export interface ReturnStage {
  stage: 0 | 1 | 2 | 3 | 4;
  maxImpactLevel: ImpactLevel;
  /** Esercizi ammessi anche sopra il livello dello stadio. */
  allowed: readonly string[];
  /** Contatti massimi a seduta in questo stadio (assente = quelli della fase). */
  contactsMax?: number;
  /** Esercizi del rientro in questo stadio, nell'ordine in cui entrano nella seduta. */
  exercises: readonly string[];
  /** Cosa contiene, in breve. */
  content: string;
  /** Criterio per salire allo stadio dopo. */
  criterion: string;
  /** Lo stadio ha impatti o corsa: per salirci serve il via libera del fisioterapista. */
  needsPhysio: boolean;
  /** La velocità è ammessa (flessori: solo dall'ultimo stadio, prima con le salite). */
  speed?: boolean;
}

const HAMSTRING_RE = /flessor|femoral|ischio/i;
const ADDUCTOR_RE = /addutt|inguin|pube/i;

/** Tipo di zona del rientro. */
export function returnZone(site: string): ReturnZone {
  if (isLowerLegSite(site)) return 'gamba';
  if (HAMSTRING_RE.test(site)) return 'flessori';
  if (isElbowSite(site)) return 'gomito';
  if (ADDUCTOR_RE.test(site)) return 'adduttori';
  return 'altro';
}

/** Stadi della zona sotto il ginocchio (tabella del § 3.8). */
const LOWER_LEG: readonly ReturnStage[] = [
  {
    stage: 0,
    maxImpactLevel: 0,
    allowed: [],
    exercises: ['polpacci-seduto', 'soleo-isometria', 'tibiale-anteriore-seduto', 'cyclette-facile'],
    content: 'Nessun impatto: polpacci, soleo, tibiali, cyclette ed ellittica',
    criterion: '7 mattine con il dolore entro la soglia degli impatti',
    needsPhysio: false,
  },
  {
    stage: 1,
    maxImpactLevel: 1,
    allowed: [],
    contactsMax: 20,
    exercises: ['salti-corda', 'polpacci-seduto', 'tibiale-anteriore-seduto'],
    content: 'Salti bassi, al massimo 20 contatti a seduta',
    criterion: '2 sedute senza dolore sopra soglia e il mattino dopo non salito',
    needsPhysio: false,
  },
  {
    stage: 2,
    maxImpactLevel: 1,
    allowed: ['cammino-corsa', 'prova-saltello'],
    contactsMax: 20,
    exercises: ['salti-corda', 'cammino-corsa', 'prova-saltello'],
    content: 'Salti bassi, cammino e corsa a giorni alterni, la prova del saltello una volta',
    criterion: 'Prova del saltello senza dolore e via libera del fisioterapista',
    needsPhysio: true,
  },
  {
    stage: 3,
    maxImpactLevel: 2,
    allowed: ['corsa-facile'],
    exercises: ['corsa-facile', 'pogo-bilaterali'],
    content: 'Corsa continua di 20-30 minuti a giorni alterni, salti moderati',
    criterion: '2 settimane senza episodi',
    needsPhysio: true,
  },
  {
    stage: 4,
    maxImpactLevel: 3,
    allowed: [],
    exercises: ['accelerazioni-10m', 'cambi-direzione-45-90'],
    content: 'Accelerazioni, cambi di direzione, salti reattivi',
    criterion: 'Via libera del fisioterapista',
    needsPhysio: true,
  },
];

/** Flessori: ponte sui talloni in tenuta, leg curl scivolando, Nordic assistito, Nordic; la velocità solo all'ultimo stadio. */
const HAMSTRINGS: readonly ReturnStage[] = [
  { stage: 0, maxImpactLevel: 0, allowed: [], exercises: ['ponte-flessori-isometrico'], content: 'Ponte sui talloni in tenuta', criterion: '2 sedute senza dolore sopra soglia', needsPhysio: false },
  { stage: 1, maxImpactLevel: 1, allowed: [], exercises: ['leg-curl-scivolando'], content: 'Leg curl scivolando a terra', criterion: '2 sedute senza dolore sopra soglia', needsPhysio: false },
  { stage: 2, maxImpactLevel: 1, allowed: [], exercises: ['nordic-assistito-elastico'], content: 'Nordic assistito', criterion: '2 sedute senza dolore sopra soglia', needsPhysio: false },
  { stage: 3, maxImpactLevel: 2, allowed: ['sprint-salita'], exercises: ['nordic-hamstring-curl', 'sprint-salita'], content: 'Nordic e sprint in salita', criterion: 'Via libera del fisioterapista', needsPhysio: true },
  { stage: 4, maxImpactLevel: 3, allowed: [], exercises: ['nordic-hamstring-curl', 'allunghi'], content: 'Progressione normale, velocità compresa', criterion: 'Rientro completato', needsPhysio: true, speed: true },
];

/** Gomito: isometria, Tyler twist, spinte a presa neutra −15%, progressione normale. Nessun impatto in gioco. */
const ELBOW: readonly ReturnStage[] = [
  { stage: 0, maxImpactLevel: 3, allowed: [], exercises: ['isometria-estensori-polso'], content: 'Isometria degli estensori del polso', criterion: '2 sedute senza dolore sopra soglia', needsPhysio: false },
  { stage: 1, maxImpactLevel: 3, allowed: [], exercises: ['isometria-estensori-polso', 'tyler-twist'], content: 'Tyler twist', criterion: '2 sedute senza dolore sopra soglia', needsPhysio: false },
  { stage: 2, maxImpactLevel: 3, allowed: [], exercises: ['tyler-twist', 'chest-press-presa-neutra'], content: 'Spinte a presa neutra con il carico −15%', criterion: '2 sedute senza dolore sopra soglia', needsPhysio: false },
  { stage: 3, maxImpactLevel: 3, allowed: [], exercises: ['tyler-twist', 'eccentrico-estensori-polso'], content: 'Progressione normale', criterion: 'Rientro completato', needsPhysio: false },
  { stage: 4, maxImpactLevel: 3, allowed: [], exercises: ['tyler-twist', 'eccentrico-estensori-polso'], content: 'Progressione normale', criterion: 'Rientro completato', needsPhysio: false },
];

/** Adduttori: pallone in isometria, Copenhagen in tenuta a leva corta, leva corta dinamica, leva lunga. */
const ADDUCTORS: readonly ReturnStage[] = [
  { stage: 0, maxImpactLevel: 1, allowed: [], exercises: ['adduttori-pallone'], content: 'Pallone stretto tra le ginocchia', criterion: '2 sedute senza dolore sopra soglia', needsPhysio: false },
  { stage: 1, maxImpactLevel: 1, allowed: [], exercises: ['copenhagen-isometrico'], content: 'Copenhagen in tenuta a leva corta', criterion: '2 sedute senza dolore sopra soglia', needsPhysio: false },
  { stage: 2, maxImpactLevel: 2, allowed: [], exercises: ['copenhagen-leva-corta'], content: 'Copenhagen a leva corta', criterion: '2 sedute senza dolore sopra soglia', needsPhysio: false },
  { stage: 3, maxImpactLevel: 3, allowed: [], exercises: ['copenhagen-leva-lunga'], content: 'Copenhagen a leva lunga', criterion: 'Via libera del fisioterapista', needsPhysio: true },
  { stage: 4, maxImpactLevel: 3, allowed: [], exercises: ['copenhagen-leva-lunga'], content: 'Progressione normale', criterion: 'Rientro completato', needsPhysio: true },
];

/** Altre zone: la regola del dolore di sempre, senza stadi d'impatto. */
const OTHER: readonly ReturnStage[] = [0, 1, 2, 3, 4].map((stage) => ({
  stage: stage as ReturnStage['stage'],
  maxImpactLevel: (stage < 2 ? 1 : stage === 2 ? 2 : 3) as ImpactLevel,
  allowed: [],
  exercises: [],
  content: stage < 4 ? 'Carico guidato dal dolore' : 'Progressione normale',
  criterion: '2 sedute senza dolore sopra soglia',
  needsPhysio: false,
}));

const STAGES: Record<ReturnZone, readonly ReturnStage[]> = { gamba: LOWER_LEG, flessori: HAMSTRINGS, gomito: ELBOW, adduttori: ADDUCTORS, altro: OTHER };

/** Stadi della zona. */
export function returnStagesFor(site: string): readonly ReturnStage[] {
  return STAGES[returnZone(site)];
}

/** Lo stadio in vigore del rientro. */
export function returnStageOf(rientro: Pick<ReturnPlan, 'site' | 'stage'>): ReturnStage {
  const stages = returnStagesFor(rientro.site);
  const i = Math.min(stages.length - 1, Math.max(0, Math.round(rientro.stage)));
  return stages[i];
}

/** Il rientro è attivo nel piano (principale o secondaria). */
export function activeReturn(plan: Pick<Plan, 'training'>): ReturnPlan | undefined {
  const t = plan.training;
  if (!t?.rientro) return undefined;
  return t.primary === 'rientro' || t.secondary === 'rientro' ? t.rientro : undefined;
}

/** Il fermo degli impatti vale nella data (dal giorno in cui è stato messo; una data non valida vale sempre). */
export function impactHoldActive(plan: Pick<Plan, 'impactHold'>, iso: ISODate): boolean {
  return impactHoldOn(plan, iso) !== null;
}

/** Stato per i criteri: controlli del mattino e sedute registrate. */
export interface ReturnState {
  plan: Pick<Plan, 'painThreshold' | 'impactThreshold' | 'impactHold' | 'training'>;
  checkIns?: Readonly<Record<ISODate, CheckIn>>;
  workoutLogs?: readonly WorkoutLog[];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Letture del mattino della zona tra due date comprese, in ordine. */
function morning(state: ReturnState, site: string, from: ISODate, to: ISODate): { date: ISODate; value: number }[] {
  const out: { date: ISODate; value: number }[] = [];
  for (const [d, c] of Object.entries(state.checkIns ?? {})) {
    if (d < from || d > to) continue;
    const v = c?.pain?.[site];
    if (finite(v)) out.push({ date: d, value: v });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface ReturnAdvice {
  /** Stadio proposto (uguale, più basso o più alto). */
  stage: ReturnPlan['stage'];
  /** Perché, in una frase. */
  reason: string;
  /** Salire chiede il via libera del fisioterapista, che manca. */
  waitingPhysio?: boolean;
}

/**
 * Stadio del rientro al lunedì `monday` (§ 3.8): si scende da soli (dolore sopra la soglia degli impatti per le zone sotto
 * il ginocchio, o sopra la soglia per le altre, in almeno 2 mattine dell'ultima settimana; un fermo per i segnali
 * d'allarme riporta a 0); si sale di uno con il criterio dello stadio e, se lo stadio dopo ha impatti o corsa, solo con il
 * via libera del fisioterapista. Senza `physioOk` mai uno stadio con impatti o corsa.
 */
export function returnAdvice(rientro: ReturnPlan, monday: ISODate, state: ReturnState): ReturnAdvice {
  const stages = returnStagesFor(rientro.site);
  const cur = returnStageOf(rientro);
  if (impactHoldActive(state.plan, monday)) return { stage: 0, reason: 'Impatti fermi per i segnali d’allarme: il rientro riparte dallo stadio 0' };
  const lower = isLowerLegSite(rientro.site);
  const limit = lower ? impactThresholdFor(state.plan) : (state.plan.painThreshold ?? 3);
  const lastWeek = morning(state, rientro.site, addDays(monday, -7), addDays(monday, -1));
  const over = lastWeek.filter((r) => r.value > limit).length;
  if (over >= 2 && cur.stage > 0) {
    return { stage: (cur.stage - 1) as ReturnPlan['stage'], reason: `Dolore sopra soglia in ${over} mattine: un passo indietro` };
  }
  if (cur.stage >= stages.length - 1) return { stage: cur.stage, reason: 'Ultimo stadio del rientro' };
  const since = isISODate(rientro.since) ? rientro.since : addDays(monday, -28);
  const ok = criterionMet(rientro, monday, since, state, limit);
  if (!ok) return { stage: cur.stage, reason: `Per salire: ${cur.criterion.charAt(0).toLowerCase()}${cur.criterion.slice(1)}` };
  const next = stages[cur.stage + 1];
  if (next.needsPhysio && !rientro.physioOk) {
    return { stage: cur.stage, reason: 'Per salire serve il via libera del fisioterapista', waitingPhysio: true };
  }
  return { stage: next.stage, reason: `Criterio raggiunto: stadio ${next.stage}` };
}

/** Criterio dello stadio in vigore, dai controlli e dalle sedute dall'inizio dello stadio. */
function criterionMet(rientro: ReturnPlan, monday: ISODate, since: ISODate, state: ReturnState, limit: number): boolean {
  const readings = morning(state, rientro.site, since, addDays(monday, -1));
  const zone = returnZone(rientro.site);
  if (zone === 'gamba' && rientro.stage === 0) {
    // 7 mattine con il dolore entro la soglia degli impatti, e nessuna sopra.
    return readings.length >= 7 && readings.every((r) => r.value <= limit);
  }
  if (zone === 'gamba' && rientro.stage === 3) {
    // 2 settimane senza episodi.
    const twoWeeks = readings.filter((r) => r.date >= addDays(monday, -14));
    return twoWeeks.length >= 7 && twoWeeks.every((r) => r.value <= limit);
  }
  if (zone === 'gamba' && rientro.stage === 2) {
    // Prova del saltello fatta senza dolore (registrata con il dolore della seduta entro la soglia).
    return (state.workoutLogs ?? []).some(
      (w) => w.date >= since && w.exercises.some((e) => e.exerciseId === 'prova-saltello' && e.sets.some((s) => s.done)) && !((w.pain?.[rientro.site] ?? 0) > limit),
    );
  }
  // 2 sedute senza dolore sopra soglia e il mattino dopo non salito.
  const sessions = (state.workoutLogs ?? []).filter((w) => w.date >= since && w.date < monday).sort((a, b) => (a.date < b.date ? -1 : 1));
  let good = 0;
  for (const w of sessions) {
    const during = w.pain?.[rientro.site] ?? 0;
    const before = morning(state, rientro.site, addDays(w.date, -2), w.date).slice(-1)[0]?.value;
    const after = state.checkIns?.[addDays(w.date, 1)]?.pain?.[rientro.site];
    const rose = finite(after) && finite(before) && after - before >= 1;
    if (during <= limit && !rose) good++;
    else good = 0;
  }
  return good >= 2;
}
