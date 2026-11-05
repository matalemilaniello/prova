/**
 * Il giorno adattato al controllo del mattino (docs/FASE2.md § 3.9). Funzioni pure: la data arriva dagli argomenti.
 *
 * Le misure soggettive del benessere seguono la risposta all'allenamento meglio di molte misure oggettive (Saw 2016); le
 * soglie qui sotto non sono validate [ipotesi], per questo la regola è scritta, testata e mostrata. `dayReadiness` somma
 * i punti di sonno, energia e calcio del giorno prima (solo per le sedute con le gambe): 0-1 piena, 2-3 ridotta, 4 o più
 * minima. In più: la regola del dolore a «riduci» porta almeno alla ridotta; una zona sotto il ginocchio a soglia degli
 * impatti + 2 porta alla minima senza impatti; due notti di fila sotto le 6 ore a letto almeno alla ridotta. Senza il
 * controllo del mattino la seduta resta piena: l'app non punisce chi non compila (la regola del dolore usa l'ultimo
 * controllo entro 3 giorni, come sempre). Nessuna domanda nuova nel controllo del mattino.
 *
 * Varianti (`reducedSession`, `minimalSession`): la ridotta toglie un terzo delle serie del blocco principale (all'intero
 * più vicino, minimo 1), aggiunge una ripetizione di riserva e dimezza contatti e metri; prevenzione e riscaldamento
 * restano. La minima tiene solo i pavimenti della settimana non ancora fatti e la mobilità, in 15-20 minuti; conta come
 * fatta. La variante non si salva: si deriva; si salva solo `WorkoutLog.variant` a seduta fatta.
 */
import type { CheckIn, ISODate, SessionExercise, WorkoutBlock, WorkoutSession } from '../../domain/types';
import { EXERCISES } from '../../data/exercises';
import { DOSE_PRESETS, estimateItemSec } from '../../data/sessions';
import { fmtHours, listIt } from '../../lib/format';
import { addDays, weekStart, weekdayOf } from '../dates';
import { checkInSleepHours } from '../sleep';
import type { AppData } from '../../domain/types';
import {
  PHYSIO_REFERRAL_MARGIN,
  TYPICAL_RPE,
  doneSets,
  impactThresholdFor,
  isLowerLegSite,
  painGate,
  physioCoverage,
  sessionLoad,
  type TrainingState,
} from '../training';
import { floorOf, isImpactItem, itemContacts, itemMeters, type FloorId } from './limits';

export type Variant = 'piena' | 'ridotta' | 'minima';

/** Punti dei segnali (§ 3.9, tabella). */
export interface ReadinessSignals {
  sleep: 0 | 1 | 2;
  energy: 0 | 1 | 2;
  football: 0 | 1;
}

export interface Readiness {
  variant: Variant;
  points: number;
  signals: ReadinessSignals;
  /** Perché, a parole e in breve: «5 h 50 a letto», «energia bassa». Vuoto con la piena. */
  reasons: string[];
  /** Minima senza impatti: una zona sotto il ginocchio molto sopra la soglia degli impatti. */
  noImpact: boolean;
  /** C'è il controllo del mattino della data. */
  checkIn: boolean;
}

/** Ore a letto sotto cui il sonno vale 2 punti, e la soglia della notte corta. */
export const SHORT_NIGHT_H = 6;
export const OK_NIGHT_H = 7;
/** Controlli con l'energia da cui vale la media personale dei 28 giorni. */
export const ENERGY_PERSONAL_FROM = 14;
export const ENERGY_WINDOW_DAYS = 28;
/** Calcio del giorno prima che pesa sulle sedute con le gambe (per esempio 90 minuti a RPE 7). */
export const FOOTBALL_HEAVY_UA = 600;
/** Fattore delle serie del blocco principale nella ridotta, contatti e metri, durata della minima. */
export const REDUCED_SETS_FACTOR = 0.67;
export const REDUCED_IMPACT_FACTOR = 0.5;
export const MINIMAL_MAX_MIN = 20;
/** La minima dura almeno 15 minuti (§ 3.9): con i pavimenti già fatti si completa con la mobilità. */
export const MINIMAL_MIN_MIN = 15;
/** Mobilità del catalogo per completare la minima, in quest'ordine (anche, flessori dell'anca, caviglia, adduttori). */
export const MINIMAL_MOBILITY = ['rotazioni-anche-90-90', 'allungamento-flessori-anca', 'mobilita-caviglia-al-muro', 'allungamento-corridore-con-rotazione', 'dondolo-adduttori-quadrupedia'];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function sleepPoints(c: CheckIn | undefined): { pts: 0 | 1 | 2; hours?: number; quality?: number } {
  const hours = checkInSleepHours(c);
  const quality = finite(c?.sleepQuality) ? c!.sleepQuality : undefined;
  const h = finite(hours) ? hours : undefined;
  if ((h !== undefined && h < SHORT_NIGHT_H) || (quality !== undefined && quality <= 1)) return { pts: 2, hours: h, quality };
  if ((h !== undefined && h < OK_NIGHT_H) || quality === 2) return { pts: 1, hours: h, quality };
  return { pts: 0, hours: h, quality };
}

function energyPoints(iso: ISODate, c: CheckIn | undefined, checkIns: Readonly<Record<ISODate, CheckIn>>): { pts: 0 | 1 | 2; personal: boolean } {
  const e = c?.energy;
  if (!finite(e)) return { pts: 0, personal: false };
  const from = addDays(iso, -ENERGY_WINDOW_DAYS);
  const past: number[] = [];
  for (const [d, x] of Object.entries(checkIns)) if (d >= from && d < iso && finite(x?.energy)) past.push(x.energy!);
  if (past.length >= ENERGY_PERSONAL_FROM) {
    const mean = past.reduce((s, x) => s + x, 0) / past.length;
    if (e >= mean - 1) return { pts: 0, personal: true };
    return { pts: e >= mean - 2.5 ? 1 : 2, personal: true };
  }
  if (e >= 6) return { pts: 0, personal: false };
  return { pts: e >= 4 ? 1 : 2, personal: false };
}

/** Carico del calcio del giorno prima: quello registrato, altrimenti quello previsto dalla settimana tipo. */
function footballDayBefore(iso: ISODate, state: TrainingState): number {
  const prev = addDays(iso, -1);
  const logs = (state.footballLogs ?? []).filter((f) => f.date === prev);
  if (logs.length) return logs.reduce((s, f) => s + sessionLoad(f.durationMin, f.rpe), 0);
  const d = weekdayOf(prev);
  const day = state.plan.week?.find((x) => x.weekday === d);
  return day?.football ? sessionLoad(day.football.durationMin, TYPICAL_RPE[day.football.kind]) : 0;
}

const RANK: Record<Variant, number> = { piena: 0, ridotta: 1, minima: 2 };
const atLeast = (v: Variant, min: Variant): Variant => (RANK[v] >= RANK[min] ? v : min);

/**
 * Variante del giorno (§ 3.9) per una seduta: `legs` vero per le sedute che caricano le gambe (il calcio del giorno prima
 * conta solo per loro), `slot` per leggere la regola del dolore su quella seduta.
 */
export function dayReadiness(iso: ISODate, state: TrainingState, opts: { legs?: boolean; slot?: string } = {}): Readiness {
  const checkIns = state.checkIns ?? {};
  const c = checkIns[iso];
  const reasons: string[] = [];
  const signals: ReadinessSignals = { sleep: 0, energy: 0, football: 0 };
  if (c) {
    const s = sleepPoints(c);
    signals.sleep = s.pts;
    if (s.pts > 0) {
      if (s.hours !== undefined && s.hours < OK_NIGHT_H) reasons.push(`${fmtHours(s.hours)} a letto`);
      else reasons.push('sonno di poca qualità');
    }
    const e = energyPoints(iso, c, checkIns);
    signals.energy = e.pts;
    if (e.pts > 0) reasons.push(e.personal ? 'energia sotto la tua media' : 'energia bassa');
    if (opts.legs) {
      const load = footballDayBefore(iso, state);
      if (load >= FOOTBALL_HEAVY_UA) {
        signals.football = 1;
        reasons.push('il calcio di ieri');
      }
    }
  }
  const points = c ? signals.sleep + signals.energy + signals.football : 0;
  let variant: Variant = points >= 4 ? 'minima' : points >= 2 ? 'ridotta' : 'piena';
  let noImpact = false;
  // Regola del dolore: «riduci» → almeno la ridotta; sotto il ginocchio molto sopra la soglia degli impatti → minima.
  const gate = painGate(state, iso, { sessionId: opts.slot ?? null });
  if (gate.level === 'riduci') {
    if (variant === 'piena') reasons.push(`${gate.flagged[0]?.site.toLowerCase() ?? 'dolore'} sopra soglia`);
    variant = atLeast(variant, 'ridotta');
  }
  const referral = gate.sites.find((s) => s.lowerLeg && Math.max(s.value, s.sessionValue ?? 0) >= impactThresholdFor(state.plan) + PHYSIO_REFERRAL_MARGIN);
  if (referral) {
    if (variant !== 'minima') reasons.push(`${referral.site.toLowerCase()} a ${referral.value} su 10`);
    variant = 'minima';
    noImpact = true;
  }
  // Due notti di fila sotto le 6 ore a letto.
  const h0 = checkInSleepHours(c);
  const h1 = checkInSleepHours(checkIns[addDays(iso, -1)]);
  if (finite(h0) && finite(h1) && h0 < SHORT_NIGHT_H && h1 < SHORT_NIGHT_H) {
    if (variant === 'piena') reasons.push('due notti corte di fila');
    variant = atLeast(variant, 'ridotta');
  }
  return { variant, points, signals, reasons: variant === 'piena' ? [] : reasons.slice(0, 3), noImpact, checkIn: Boolean(c) };
}

/** «Oggi ridotta: 5 h 50 a letto ed energia bassa» (§ 11.6); null con la piena. */
export function readinessText(r: Pick<Readiness, 'variant' | 'reasons'>): string | null {
  if (r.variant === 'piena') return null;
  const why = r.reasons.length ? `: ${listIt(r.reasons).replace(/ e (?=[aeiouàèéìòù])/i, ' ed ')}` : '';
  return `Oggi ${r.variant}${why}`;
}

// ───────────────────────── Varianti ─────────────────────────

const MAIN_RE = /principale/i;
const WARMUP_RE = /riscaldamento/i;

/** Minuti della seduta blocco per blocco (come `estMin` delle sedute fisse e `sessionDuration`). */
function blockMinutes(blocks: readonly WorkoutBlock[]): number {
  return blocks.reduce((t, b) => t + Math.round(b.items.reduce((s, it) => s + estimateItemSec(it), 0) / 60), 0);
}

const withMinutes = (base: WorkoutSession, blocks: WorkoutBlock[]): WorkoutSession => ({
  ...base,
  blocks,
  estMin: Math.max(1, base.estMin + blockMinutes(blocks) - blockMinutes(base.blocks)),
});

/** Contatti e metri dimezzati, per difetto, mai sotto 1. */
function halfImpact(it: SessionExercise): SessionExercise {
  if ((it.distanceM ?? 0) > 0) return { ...it, distanceM: Math.max(1, Math.floor(it.distanceM! * REDUCED_IMPACT_FACTOR)) };
  if (itemContacts(it) > 0) {
    const repMin = Math.max(1, Math.floor(it.repMin * REDUCED_IMPACT_FACTOR));
    return { ...it, repMin, repMax: Math.max(repMin, Math.floor(it.repMax * REDUCED_IMPACT_FACTOR)) };
  }
  return it;
}

/**
 * Variante ridotta (§ 3.9): blocco principale con le serie × 0,67 all'intero più vicino (minimo 1) e una ripetizione di
 * riserva in più; contatti e metri −50% ovunque; prevenzione, riscaldamento e fisioterapista invariati.
 */
export function reducedSession(base: WorkoutSession): WorkoutSession {
  const blocks = base.blocks.map((b) => {
    const main = MAIN_RE.test(b.title);
    return {
      ...b,
      items: b.items.map((it) => {
        let out = it;
        if (main) {
          out = { ...out, sets: Math.max(1, Math.round(it.sets * REDUCED_SETS_FACTOR)) };
          if (typeof it.rir === 'number') out.rir = Math.min(5, it.rir + 1);
        }
        return itemContacts(out) > 0 || itemMeters(out) > 0 ? halfImpact(out) : out;
      }),
    };
  });
  return { ...withMinutes(base, blocks), subtitle: base.subtitle };
}

/** Pavimenti già fatti nella settimana della data, prima della data (dalle sedute registrate). */
export function floorsDoneThisWeek(iso: ISODate, state: Pick<TrainingState, 'workoutLogs'>): Set<FloorId> {
  const monday = weekStart(iso);
  const out = new Set<FloorId>();
  for (const w of state.workoutLogs ?? []) {
    if (w.date < monday || w.date >= iso) continue;
    for (const ex of w.exercises) {
      if (!doneSets(ex).length) continue;
      const f = floorOf({ exerciseId: ex.exerciseId, sets: 1, repMin: 1, repMax: 1, unit: 'reps', restSec: 0, progression: 'nessuna' });
      if (f) out.add(f);
    }
  }
  return out;
}

/** Opzioni delle varianti: `noImpact` toglie ogni impatto; `physio` dice quali pavimenti copre il fisioterapista. */
export interface VariantOptions {
  noImpact?: boolean;
  physio?: Pick<AppData['physio'], 'exercises' | 'prescriptions'>;
}

/**
 * Variante minima (§ 3.9): niente blocco principale, niente pliometria né sprint; i pavimenti della settimana non ancora
 * fatti (la forza di gambe no), la mobilità e, se servono, minuti di cyclette facile per scaldarsi. 15-20 minuti di
 * seduta propria: un pavimento coperto dal fisioterapista resta in vista ma non conta nei minuti, come nella durata che
 * mostra il lettore (`sessionDuration` con il fisioterapista). Con `noImpact` nessun esercizio d'impatto. Gli esercizi
 * del fisioterapista restano nel loro blocco, come sempre.
 */
export function minimalSession(base: WorkoutSession, done: ReadonlySet<FloorId>, opts: VariantOptions = {}): WorkoutSession {
  const keep: SessionExercise[] = [];
  const mobility: SessionExercise[] = [];
  const seen = new Set<FloorId>();
  for (const b of base.blocks) {
    if (MAIN_RE.test(b.title)) continue;
    for (const it of b.items) {
      const ex = EXERCISES[it.exerciseId];
      if (isImpactItem(it.exerciseId) || ex?.category === 'pliometria' || ex?.category === 'sprint') continue;
      if (opts.noImpact && isImpactItem(it.exerciseId)) continue;
      if (ex?.category === 'mobilita') {
        mobility.push(it);
        continue;
      }
      const f = floorOf(it);
      if (f && f !== 'forza-gambe' && !done.has(f) && !seen.has(f)) {
        seen.add(f);
        keep.push(it);
      }
    }
  }
  const blocks: WorkoutBlock[] = [];
  // Pavimenti che copre il fisioterapista: restano, ma non contano nei minuti della seduta propria.
  const covered = new Set<SessionExercise>();
  if (keep.length && opts.physio?.prescriptions?.length) {
    const cover = physioCoverage({ blocks: [{ title: 'Prevenzione', items: keep }] }, opts.physio);
    keep.forEach((it, i) => {
      if (cover.has(`0:${i}`)) covered.add(it);
    });
  }
  const total = (xs: SessionExercise[]) => xs.reduce((s, it) => s + (covered.has(it) ? 0 : estimateItemSec(it)), 0) / 60;
  // Al massimo 20 minuti: si tolgono prima la mobilità in più, poi i pavimenti in fondo.
  while (total([...keep, ...mobility]) > MINIMAL_MAX_MIN && mobility.length) mobility.pop();
  while (total(keep) > MINIMAL_MAX_MIN && keep.length > 1) keep.pop();
  // Almeno 15 minuti: con i pavimenti della settimana già fatti resterebbero pochi minuti di mobilità. Si aggiungono, in
  // ordine, gli esercizi di mobilità e di riscaldamento senza impatto della seduta, poi quelli di mobilità del catalogo
  // con la loro dose di riferimento, senza superare i 20 minuti; poi, se manca ancora qualcosa, la cyclette facile.
  const have = new Set([...keep, ...mobility].map((it) => it.exerciseId));
  const extra = MINIMAL_MOBILITY.map((id) => DOSE_PRESETS[id]).filter((it): it is SessionExercise => Boolean(it));
  for (const it of [...base.blocks.flatMap((b) => b.items), ...extra]) {
    if (total([...keep, ...mobility]) >= MINIMAL_MIN_MIN) break;
    const cat = EXERCISES[it.exerciseId]?.category;
    if (have.has(it.exerciseId) || isImpactItem(it.exerciseId) || (cat !== 'mobilita' && cat !== 'riscaldamento')) continue;
    if (total([...keep, ...mobility, it]) > MINIMAL_MAX_MIN) continue;
    have.add(it.exerciseId);
    mobility.push(it);
  }
  // Se non basta ancora, cyclette facile in testa per scaldarsi (livello 0), per i minuti che mancano (al massimo 10).
  const missing = MINIMAL_MIN_MIN - total([...keep, ...mobility]);
  const bike = DOSE_PRESETS['cyclette-facile'];
  if (missing > 0 && bike && !have.has(bike.exerciseId)) {
    const sec = Math.min(600, Math.ceil(missing) * 60);
    mobility.unshift({ ...bike, repMin: sec, repMax: sec });
  }
  if (keep.length) blocks.push({ title: 'Prevenzione', items: keep });
  if (mobility.length) blocks.push({ title: 'Mobilità', items: mobility });
  if (!blocks.length) {
    const fallback = base.blocks.flatMap((b) => b.items).find((it) => EXERCISES[it.exerciseId]?.category === 'mobilita' || EXERCISES[it.exerciseId]?.category === 'riscaldamento');
    if (fallback && !isImpactItem(fallback.exerciseId)) blocks.push({ title: 'Mobilità', items: [fallback] });
  }
  const minutes = blockMinutes(blocks);
  return { ...base, blocks, estMin: Math.max(1, minutes) };
}

/** Seduta del giorno nella variante. */
export function sessionForVariant(base: WorkoutSession, variant: Variant, done: ReadonlySet<FloorId>, opts: VariantOptions = {}): WorkoutSession {
  if (variant === 'ridotta') return reducedSession(base);
  if (variant === 'minima') return minimalSession(base, done, opts);
  return base;
}

/** Il blocco «Riscaldamento» di una seduta, se c'è (per i test e per le varianti). */
export const warmupBlock = (s: Pick<WorkoutSession, 'blocks'>): WorkoutBlock | undefined => s.blocks.find((b) => WARMUP_RE.test(b.title));

/** La zona sotto il ginocchio frena gli impatti (per i testi). */
export const lowerLegSites = (sites: readonly string[]): string[] => sites.filter(isLowerLegSite);
