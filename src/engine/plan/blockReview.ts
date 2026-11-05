/**
 * Criteri di fine blocco (docs/FASE2.md § 3.11). Funzioni pure, senza orologio.
 *
 * La domenica dell'ultima settimana del blocco `blockReview(program, state)` calcola il riepilogo (costanza, carichi,
 * dolore, sonno, corpo) e la tabella di decisione dà il blocco dopo (`verdict`): la prima riga che scatta decide.
 * `nextBlockPlan` traduce il verdetto nelle regole per il generatore (sedute, minuti, volume, livello d'impatto,
 * contatti, rientro) e, dopo 2 blocchi con la stessa principale, **propone** la qualità successiva nella sequenza
 * accumulo → trasformazione → realizzazione (Issurin 2010). Il corpo non cambia il blocco: le calorie seguono le regole
 * settimanali.
 *
 * Una seduta segnata tutta «fatta» dal lettore conta anche senza carico (sprint, intervalli, salti si registrano con le
 * ripetizioni previste e `weightKg: 0`, § 3.7): `doneSets` la vede, quindi costanza e pavimenti la contano.
 */
import type {
  AppData,
  BlockSummary,
  CheckIn,
  FootballLog,
  ISODate,
  Plan,
  Program,
  SeasonPhase,
  TrainingGoal,
  TrainingQuality,
  WeeklyReview,
  WorkoutLog,
} from '../../domain/types';
import { EXERCISES } from '../../data/exercises';
import { addDays, daysBetween, weekdayOf } from '../dates';
import { checkInSleepHours } from '../sleep';
import { bestSet, doneSets, impactThresholdFor, isLowerLegSite } from '../training';
import { floorOf, requiredFloors, type FloorId } from './limits';
import { qualityAllowed } from './season';

export type Verdict = BlockSummary['verdict'];

/** Stato letto dal riepilogo: piano (settimana, soglie), diari e, se ci sono, profilo e revisioni. */
export interface BlockReviewState {
  plan: Pick<Plan, 'week' | 'painThreshold' | 'impactThreshold' | 'weekOverrides'>;
  workoutLogs: readonly WorkoutLog[];
  footballLogs?: readonly FootballLog[];
  checkIns?: Readonly<Record<ISODate, CheckIn>>;
  painSites?: readonly string[];
  reviews?: readonly WeeklyReview[];
  physio?: Pick<AppData['physio'], 'exercises' | 'prescriptions'>;
}

export type LoadPattern = 'cerniera' | 'squat' | 'spinta' | 'tirata';

export interface PainSummary {
  site: string;
  mean: number;
  daysOver: number;
  daysOverLast2w: number;
  /** Pendenza in punti a settimana (regressione lineare sulle letture). */
  slopePerWeek: number;
  /** Mattine dopo un'attività con il dolore salito di almeno 1 punto. */
  nextDayRises: number;
  threshold: number;
}

export interface BlockReview {
  blockId: string;
  from: ISODate;
  to: ISODate;
  /** Sedute previste (le facoltative non contano) e fatte. */
  planned: number;
  done: number;
  adherence: number;
  /** Quota dei pavimenti fatti sui previsti. */
  floorsShare: number;
  /** Miglior 1RM stimato delle settimane 2-3 contro la settimana 1 (o il blocco prima), per schema principale. */
  loads: { pattern: LoadPattern; before: number; after: number; change: number }[];
  /** Variazione media dei carichi (frazione), null senza dati. */
  loadChange: number | null;
  pain: PainSummary[];
  sleep: { meanHours: number | null; shortNights: number; shortPerWeek: number };
  body: { weightPerWeek: number | null; waistChange: number | null };
  verdict: Verdict;
  /** Zona del rientro (verdetto `rientro`) e se diventa principale (almeno 7 giorni sopra soglia). */
  rientro?: { site: string; primary: boolean };
  reasons: string[];
}

/** Soglie della tabella di decisione (§ 3.11). */
export const ADHERENCE_LOW = 0.6;
export const ADHERENCE_HIGH = 0.8;
export const LOAD_STEP = 0.025;
export const PAIN_DAYS_2W = 4;
export const PAIN_DAYS_PRIMARY = 7;
export const PAIN_SLOPE_MAX = 0.5;
export const SLEEP_MEAN_MIN_H = 6.5;
export const SHORT_NIGHTS_PER_WEEK = 3;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x) * 1000) / 10}%`.replace('.', ',');

function patternGroup(exerciseId: string): LoadPattern | null {
  const p = EXERCISES[exerciseId]?.pattern;
  if (p === 'cerniera') return 'cerniera';
  if (p === 'squat' || p === 'affondo') return 'squat';
  if (p === 'spinta-orizzontale' || p === 'spinta-verticale') return 'spinta';
  if (p === 'tirata-orizzontale' || p === 'tirata-verticale') return 'tirata';
  return null;
}

/** Miglior 1RM stimato per schema principale nelle sedute tra due date comprese. */
function bestByPattern(logs: readonly WorkoutLog[], from: ISODate, to: ISODate): Map<LoadPattern, number> {
  const out = new Map<LoadPattern, number>();
  for (const w of logs) {
    if (w.date < from || w.date > to) continue;
    for (const ex of w.exercises) {
      const g = patternGroup(ex.exerciseId);
      const b = bestSet(ex)?.e1rm ?? 0;
      if (g && b > 0) out.set(g, Math.max(out.get(g) ?? 0, b));
    }
  }
  return out;
}

/** Pendenza delle letture in punti a settimana (minimi quadrati sui giorni). */
function slope(points: { day: number; value: number }[]): number {
  if (points.length < 2) return 0;
  const mx = mean(points.map((p) => p.day));
  const my = mean(points.map((p) => p.value));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.day - mx) * (p.value - my);
    den += (p.day - mx) ** 2;
  }
  return den > 0 ? (num / den) * 7 : 0;
}

/** Riepilogo di un blocco (§ 3.11) fino a `to` compreso (predefinito: l'ultimo giorno del blocco). */
export function blockReview(program: Program, state: BlockReviewState, to?: ISODate): BlockReview {
  const from = program.start;
  const end = to ?? addDays(from, program.weeks.length * 7 - 1);
  const logs = state.workoutLogs ?? [];
  // Costanza: sedute previste non facoltative, fatte (qualunque variante, anche la minima).
  let planned = 0;
  let done = 0;
  const required = requiredFloors(program.phase, { elbow: (state.painSites ?? []).some((s) => /gomit/i.test(s)), physio: state.physio });
  let floorsReq = 0;
  let floorsDone = 0;
  const weeks = Math.max(1, Math.ceil((daysBetween(from, end) + 1) / 7));
  for (let w = 0; w < weeks; w++) {
    const monday = addDays(from, 7 * w);
    const seen: Partial<Record<FloorId, number>> = {};
    for (let i = 0; i < 7; i++) {
      const iso = addDays(monday, i);
      if (iso > end) break;
      const day = state.plan.week.find((d) => d.weekday === weekdayOf(iso));
      const dayLogs = logs.filter((x) => x.date === iso);
      if (day?.gymSessionId && !day.gymOptional) {
        planned++;
        if (dayLogs.some((x) => x.exercises.some((e) => doneSets(e).length))) done++;
      }
      for (const lg of dayLogs) {
        const fs = new Set<FloorId>();
        for (const e of lg.exercises) {
          if (!doneSets(e).length) continue;
          const f = floorOf({ exerciseId: e.exerciseId, sets: 1, repMin: 1, repMax: 1, unit: 'reps', restSec: 0, progression: 'nessuna' });
          if (f) fs.add(f);
        }
        for (const f of fs) seen[f] = (seen[f] ?? 0) + 1;
      }
    }
    for (const [k, n] of Object.entries(required) as [FloorId, number][]) {
      floorsReq += n;
      floorsDone += Math.min(n, seen[k] ?? 0);
    }
  }
  const adherence = planned > 0 ? Math.min(1, done / planned) : 1;
  const floorsShare = floorsReq > 0 ? floorsDone / floorsReq : 1;
  // Carichi: settimane 2-3 contro la settimana 1, o contro le 4 settimane prima del blocco.
  const w1 = bestByPattern(logs, from, addDays(from, 6));
  const prior = bestByPattern(logs, addDays(from, -28), addDays(from, -1));
  const later = bestByPattern(logs, addDays(from, 7), addDays(from, 20));
  const loads: BlockReview['loads'] = [];
  for (const [g, after] of later) {
    const before = w1.get(g) ?? prior.get(g);
    if (before && before > 0) loads.push({ pattern: g, before, after, change: after / before - 1 });
  }
  const loadChange = loads.length ? mean(loads.map((l) => l.change)) : null;
  // Dolore.
  const checkIns = state.checkIns ?? {};
  const sites = new Set<string>(state.painSites ?? []);
  for (const [d, c] of Object.entries(checkIns)) if (d >= from && d <= end) for (const s of Object.keys(c?.pain ?? {})) if (!state.painSites?.length) sites.add(s);
  const pain: PainSummary[] = [];
  const general = state.plan.painThreshold ?? 3;
  const impact = impactThresholdFor(state.plan);
  const activity = new Set<ISODate>([...logs.map((x) => x.date), ...(state.footballLogs ?? []).map((f) => f.date)]);
  for (const site of [...sites].sort()) {
    const threshold = isLowerLegSite(site) ? impact : general;
    const readings: { date: ISODate; value: number }[] = [];
    for (const [d, c] of Object.entries(checkIns)) {
      const v = c?.pain?.[site];
      if (d >= from && d <= end && finite(v)) readings.push({ date: d, value: v });
    }
    if (!readings.length) continue;
    readings.sort((a, b) => (a.date < b.date ? -1 : 1));
    const last2 = addDays(end, -13);
    let rises = 0;
    for (const r of readings) {
      const prev = checkIns[addDays(r.date, -1)]?.pain?.[site];
      if (activity.has(addDays(r.date, -1)) && finite(prev) && r.value - prev >= 1) rises++;
    }
    pain.push({
      site,
      mean: mean(readings.map((r) => r.value)),
      daysOver: readings.filter((r) => r.value > threshold).length,
      daysOverLast2w: readings.filter((r) => r.date >= last2 && r.value > threshold).length,
      slopePerWeek: slope(readings.map((r) => ({ day: daysBetween(from, r.date), value: r.value }))),
      nextDayRises: rises,
      threshold,
    });
  }
  // Sonno.
  const hours: number[] = [];
  for (const [d, c] of Object.entries(checkIns)) {
    if (d < from || d > end) continue;
    const h = checkInSleepHours(c);
    if (finite(h)) hours.push(h);
  }
  const shortNights = hours.filter((h) => h < 6).length;
  const sleep = { meanHours: hours.length ? mean(hours) : null, shortNights, shortPerWeek: shortNights / weeks };
  // Corpo: peso medio della prima e dell'ultima settimana, vita dalle revisioni.
  const weightOf = (a: ISODate, b: ISODate) => {
    const xs = Object.entries(checkIns).filter(([d, c]) => d >= a && d <= b && finite(c?.weightKg)).map(([, c]) => c.weightKg!);
    return xs.length ? mean(xs) : null;
  };
  const wFirst = weightOf(from, addDays(from, 6));
  const wLast = weightOf(addDays(end, -6), end);
  const weightPerWeek = wFirst !== null && wLast !== null && weeks > 1 ? (wLast - wFirst) / (weeks - 1) : null;
  const waists = (state.reviews ?? []).filter((r) => r.weekStart >= addDays(from, -7) && r.weekStart <= end && finite(r.waistCm)).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  const waistChange = waists.length >= 2 ? waists[waists.length - 1].waistCm! - waists[0].waistCm! : null;

  // Tabella di decisione: la prima riga che scatta decide.
  const reasons: string[] = [];
  let verdict: Verdict;
  let rientro: BlockReview['rientro'];
  const hurt = pain
    .filter((p) => p.mean > p.threshold || p.daysOverLast2w >= PAIN_DAYS_2W || p.slopePerWeek > PAIN_SLOPE_MAX)
    .sort((a, b) => b.daysOver - a.daysOver || b.mean - a.mean)[0];
  const adh = `costanza ${Math.round(adherence * 100)}%`;
  if (hurt) {
    verdict = 'rientro';
    rientro = { site: hurt.site, primary: hurt.daysOver >= PAIN_DAYS_PRIMARY };
    reasons.push(`${hurt.site} sopra soglia in ${hurt.daysOver} ${hurt.daysOver === 1 ? 'giorno' : 'giorni'}: rientro guidato, impatti più bassi`);
  } else if (adherence < ADHERENCE_LOW) {
    verdict = 'meno-ma-fatto';
    reasons.push(`${capital(adh)}: una seduta in meno e più corte`);
  } else if ((sleep.meanHours !== null && sleep.meanHours < SLEEP_MEAN_MIN_H) || sleep.shortPerWeek >= SHORT_NIGHTS_PER_WEEK) {
    verdict = 'consolida';
    reasons.push('Poco sonno nel blocco: stesso volume, niente aumenti');
  } else if (adherence >= ADHERENCE_HIGH && loadChange !== null && loadChange >= LOAD_STEP) {
    verdict = 'avanza';
    reasons.push(`Carichi ${pct(loadChange)}, ${adh}: si sale`);
  } else if (adherence < ADHERENCE_HIGH) {
    verdict = 'consolida';
    reasons.push(`${capital(adh)}: stesse qualità e stesso volume`);
  } else if (loadChange === null || loadChange > -LOAD_STEP) {
    verdict = 'consolida';
    reasons.push(loadChange === null ? `${capital(adh)}: stesso volume` : `Carichi stabili (${pct(loadChange)}): cambia la variante, stesso volume`);
  } else {
    verdict = 'alleggerisci';
    reasons.push(`Carichi ${pct(loadChange)}: volume −20% e una settimana leggera in più`);
  }
  return {
    blockId: program.blockId,
    from,
    to: end,
    planned,
    done,
    adherence,
    floorsShare,
    loads,
    loadChange,
    pain,
    sleep,
    body: { weightPerWeek, waistChange },
    verdict,
    ...(rientro ? { rientro } : {}),
    reasons,
  };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Regole per il blocco dopo, dal verdetto (§ 3.11). */
export interface NextBlockPlan {
  verdict: Verdict;
  /** Sedute in meno (la B con i pavimenti resta sempre). */
  sessionsDelta: number;
  /** Minuti in meno per seduta. */
  minutesDelta: number;
  /** Volume (serie) rispetto al blocco di prima. */
  volumeFactor: number;
  /** Niente aumenti di volume tra le settimane (lo scarico resta). */
  noVolumeIncrease: boolean;
  /** Una settimana leggera in più. */
  extraLightWeek: boolean;
  /** Livello d'impatto rispetto al blocco di prima (−1, 0, +1 se il requisito c'è). */
  impactLevelDelta: number;
  /** Contatti rispetto al blocco di prima. */
  contactsFactor: number;
  /** Fascia più pesante o una serie in più (solo nella pausa). */
  heavier: boolean;
  /** Variante o schema delle serie diversi a parità di volume. */
  variantChange: boolean;
  rientro?: { site: string; primary: boolean };
  /** Qualità proposte per il blocco dopo (sequenza del § 3.11), se cambia. */
  suggested?: Pick<TrainingGoal, 'primary' | 'secondary'>;
  reasons: string[];
}

/** Sequenza accumulo → trasformazione → realizzazione (§ 3.11): in stagione e nella pausa. */
const SEQUENCE: Record<'stagione' | 'pausa', Pick<TrainingGoal, 'primary' | 'secondary'>[]> = {
  stagione: [
    { primary: 'forza' },
    { primary: 'forza', secondary: 'potenza' },
    { primary: 'potenza', secondary: 'rapidita' },
  ],
  pausa: [
    { primary: 'ipertrofia', secondary: 'forza' },
    { primary: 'forza', secondary: 'potenza' },
  ],
};

/**
 * Qualità proposte dopo 2 blocchi con la stessa principale (§ 3.11): la successiva nella sequenza della fase, se la
 * fase la ammette. Null se non cambia niente.
 */
export function sequenceSuggestion(
  training: Pick<TrainingGoal, 'primary' | 'secondary'>,
  blocks: readonly Pick<BlockSummary, 'primary'>[],
  phase: SeasonPhase,
): Pick<TrainingGoal, 'primary' | 'secondary'> | null {
  if (phase === 'precampionato') return null;
  const last2 = blocks.slice(-2);
  if (last2.length < 2 || !last2.every((b) => b.primary === training.primary)) return null;
  const seq = SEQUENCE[phase];
  const i = seq.findIndex((s) => s.primary === training.primary && (s.secondary ?? null) === (training.secondary ?? null));
  const j = i >= 0 ? (i + 1) % seq.length : seq.findIndex((s) => s.primary === training.primary) >= 0 ? (seq.findIndex((s) => s.primary === training.primary) + 1) % seq.length : -1;
  if (j < 0) return null;
  const next = seq[j];
  const ctx = { phase };
  if (!qualityAllowed(next.primary, 'principale', ctx)) return null;
  if (next.secondary && !qualityAllowed(next.secondary as TrainingQuality, 'secondaria', ctx)) return null;
  if (next.primary === training.primary && next.secondary === training.secondary) return null;
  return next;
}

/** Regole del blocco dopo per il generatore. */
export function nextBlockPlan(
  review: Pick<BlockReview, 'verdict' | 'rientro' | 'reasons'>,
  opts: { phase: SeasonPhase; training?: Pick<TrainingGoal, 'primary' | 'secondary'>; blocks?: readonly Pick<BlockSummary, 'primary'>[] } = { phase: 'stagione' },
): NextBlockPlan {
  const base: NextBlockPlan = {
    verdict: review.verdict,
    sessionsDelta: 0,
    minutesDelta: 0,
    volumeFactor: 1,
    noVolumeIncrease: false,
    extraLightWeek: false,
    impactLevelDelta: 0,
    contactsFactor: 1,
    heavier: false,
    variantChange: false,
    reasons: review.reasons.slice(0, 1),
  };
  switch (review.verdict) {
    case 'rientro':
      Object.assign(base, { impactLevelDelta: -1, contactsFactor: 0.5, ...(review.rientro ? { rientro: review.rientro } : {}) });
      base.reasons.push('Senti il fisioterapista prima di aumentare corsa e salti');
      break;
    case 'meno-ma-fatto':
      Object.assign(base, { sessionsDelta: -1, minutesDelta: -15 });
      break;
    case 'consolida':
      Object.assign(base, { noVolumeIncrease: /sonno/i.test(review.reasons[0] ?? ''), variantChange: /variante/i.test(review.reasons[0] ?? '') });
      break;
    case 'avanza':
      Object.assign(base, { heavier: true, impactLevelDelta: 1 });
      break;
    case 'alleggerisci':
      Object.assign(base, { volumeFactor: 0.8, extraLightWeek: true });
      break;
  }
  if (opts.training && opts.blocks && (review.verdict === 'avanza' || review.verdict === 'consolida')) {
    const s = sequenceSuggestion(opts.training, opts.blocks, opts.phase);
    if (s) base.suggested = s;
  }
  return base;
}

/** Riepilogo da salvare a fine blocco (`recordBlockSummary`), con il carico previsto più alto (R10). */
export function blockSummaryOf(review: BlockReview, program: Pick<Program, 'primary' | 'secondary'>, peakLoad?: number): BlockSummary {
  return {
    blockId: review.blockId,
    from: review.from,
    to: review.to,
    primary: program.primary,
    ...(program.secondary ? { secondary: program.secondary } : {}),
    verdict: review.verdict,
    adherence: Math.round(review.adherence * 100) / 100,
    ...(finite(peakLoad) && peakLoad >= 0 ? { peakLoad: Math.round(peakLoad) } : {}),
  };
}
