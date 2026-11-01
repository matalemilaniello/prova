/**
 * Allenamento · aiuti dell'interfaccia: piano della seduta (con il blocco del fisioterapista),
 * dosi leggibili, etichette, stima dei tempi.
 */
import type { AppData, Exercise, ISODate, Plan, SessionExercise, WorkoutLog, WorkoutSession } from '../../domain/types';
import { EXERCISES } from '../../data/exercises';
import { estimateItemSec } from '../../data/sessions';
import { weekdayOf } from '../../engine/dates';
import {
  elbowSwitchFor,
  gateForExercise,
  introItem,
  noImpactAlternatives,
  painFlagFor,
  painNoteForExercise,
  personalRecords,
  physioCoverage,
  recentLogsFor,
  sessionDuration,
  standingRecords,
  suggestNext,
  type PainGate,
  type PersonalRecord,
  type SessionDuration,
  type Suggestion,
} from '../../engine/training';
import { fmtMinutes, fmtNumber, WEEKDAY_SHORT, listIt } from '../../lib/format';

export const PHYSIO_BLOCK_TITLE = 'Dal fisioterapista';

export interface PlayerItem {
  /** Chiave stabile nella seduta: 'b1:3' (blocco 1, esercizio 3) oppure 'f:0' (fisioterapista). */
  key: string;
  blockTitle: string;
  blockIndex: number;
  /** Posizione dentro il blocco (0…) e numero di esercizi del blocco. */
  indexInBlock: number;
  blockSize: number;
  /** Dose di oggi (ridotta nella fase di ingresso). */
  item: SessionExercise;
  /** Dose della seduta, prima della fase di ingresso: è quella da passare a suggestNext con `intro`. */
  base: SessionExercise;
  /** Esercizio previsto (prima di eventuali sostituzioni). */
  exercise: Exercise | undefined;
  /**
   * Esercizio della seduta sostituito in automatico dalla regola del dolore: i balzi del riscaldamento con la tibia
   * oltre la soglia degli impatti, la panca con i manubri con il gomito sopra soglia (elbowSwitch).
   */
  replacedFrom?: string;
  /** Perché è stato sostituito. */
  replacedReason?: string;
  /** Per quale zona: impatti (gamba) o gomito. */
  replacedKind?: 'impatto' | 'gomito';
  physio: boolean;
  warmup: boolean;
  /**
   * Esercizio della seduta che oggi non si fa: un esercizio del fisioterapista lavora lo stesso tessuto.
   * Resta nell'anteprima, barrato, ma non è un passo del lettore e non conta in serie e minuti.
   */
  coveredBy?: { exerciseId: string; name: string };
}

export type PlayerStep = { kind: 'warmup'; key: string; blockTitle: string; items: PlayerItem[] } | { kind: 'exercise'; key: string; item: PlayerItem };

export interface PlayerPlan {
  session: WorkoutSession;
  /** Esercizi da fare (senza quelli già coperti dal fisioterapista). */
  items: PlayerItem[];
  steps: PlayerStep[];
  /** Blocchi nell'ordine, con i loro esercizi (compresi quelli coperti dal fisioterapista, segnati con `coveredBy`). */
  blocks: { title: string; physio: boolean; items: PlayerItem[] }[];
  /** Esercizi della seduta saltati perché già nel programma del fisioterapista. */
  covered: PlayerItem[];
  /** Minuti: seduta (fase di ingresso e doppioni compresi) e blocco del fisioterapista. */
  duration: SessionDuration;
  /** Il fisioterapista prevede gli esercizi in questo giorno. */
  physioDay: boolean;
  /** Giorni del fisioterapista nel piano (lun, mer…). */
  physioDays: string[];
  /** Fase di ingresso: prima o seconda esecuzione della seduta (volume ridotto), null dopo. */
  intro: 1 | 2 | null;
}

export interface PlayerPlanOptions {
  /** Regola del dolore di oggi: con gli impatti bloccati il riscaldamento perde i balzi. */
  gate?: PainGate;
  /** Fase di ingresso della seduta (da introLevel). */
  intro?: 1 | 2 | null;
}

const WARMUP_RE = /riscaldamento/i;

/** Esercizio dal catalogo o tra quelli del fisioterapista. */
export function exerciseFor(id: string, physio?: AppData['physio']): Exercise | undefined {
  return EXERCISES[id] ?? physio?.exercises.find((e) => e.id === id);
}

/** Giorni del piano in cui il fisioterapista prevede gli esercizi. */
export function physioWeekdays(plan: Pick<Plan, 'week'>): string[] {
  return plan.week.filter((d) => d.physio).map((d) => WEEKDAY_SHORT[d.weekday]);
}

/**
 * Piano della seduta per il lettore: i blocchi della seduta più, se ci sono esercizi del fisioterapista,
 * un blocco "Dal fisioterapista" in fondo. Il riscaldamento diventa un'unica lista da spuntare.
 * Nella fase di ingresso gli esercizi della seduta (non quelli del fisioterapista) hanno una serie in meno
 * e una ripetizione di riserva in più. Con gli impatti bloccati dalla regola del dolore, gli esercizi
 * d'impatto del riscaldamento diventano la prima alternativa senza volo; con il gomito sopra soglia le spinte con
 * i manubri diventano la variante del catalogo (chest press, cavi), che si può sempre riportare a quella prevista.
 */
export function buildPlayerPlan(
  session: WorkoutSession,
  physio: AppData['physio'],
  plan: Pick<Plan, 'week'>,
  date: ISODate,
  opts: PlayerPlanOptions = {},
): PlayerPlan {
  const intro = opts.intro ?? null;
  const cover = physioCoverage(session, physio);
  const blocks: PlayerPlan['blocks'] = session.blocks.map((b, bi) => {
    const warmup = WARMUP_RE.test(b.title);
    const active = b.items.filter((_, ii) => !cover.has(`${bi}:${ii}`)).length;
    let pos = 0;
    return {
      title: b.title,
      physio: false,
      items: b.items.map((it, ii) => {
        let base = it;
        let exercise = EXERCISES[it.exerciseId];
        let replacedFrom: string | undefined;
        let replacedReason: string | undefined;
        let replacedKind: PlayerItem['replacedKind'];
        const flag = warmup && opts.gate ? painFlagFor(exercise, opts.gate) : null;
        const sw = !warmup && opts.gate ? elbowSwitchFor(exercise, opts.gate) : null;
        if (flag?.kind === 'impatto') {
          const alt = noImpactAlternatives(exercise)[0];
          if (alt) {
            replacedFrom = it.exerciseId;
            replacedReason = flag.reason;
            replacedKind = 'impatto';
            base = { ...it, exerciseId: alt.id, note: undefined };
            exercise = alt;
          }
        } else if (sw && EXERCISES[sw.to]) {
          replacedFrom = it.exerciseId;
          replacedReason = sw.reason;
          replacedKind = 'gomito';
          base = { ...it, exerciseId: sw.to, note: undefined, ...(sw.incrementKg ? { incrementKg: sw.incrementKg } : {}) };
          exercise = EXERCISES[sw.to];
        }
        const c = cover.get(`${bi}:${ii}`);
        const coveredBy = c ? { exerciseId: c.physioId, name: exerciseFor(c.physioId, physio)?.name ?? c.physioId } : undefined;
        return {
          key: `b${bi}:${ii}`,
          blockTitle: b.title,
          blockIndex: bi,
          // Posizione tra gli esercizi che si fanno davvero ("Prevenzione · 2 di 3").
          indexInBlock: coveredBy ? pos : pos++,
          blockSize: active,
          item: intro ? introItem(base) : base,
          base,
          exercise,
          physio: false,
          warmup,
          ...(replacedFrom ? { replacedFrom, replacedReason, replacedKind } : {}),
          ...(coveredBy ? { coveredBy } : {}),
        };
      }),
    };
  });
  const prescriptions = physio.prescriptions.filter((p) => exerciseFor(p.exerciseId, physio));
  if (prescriptions.length) {
    const bi = blocks.length;
    blocks.push({
      title: PHYSIO_BLOCK_TITLE,
      physio: true,
      items: prescriptions.map((p, ii) => ({
        key: `f:${ii}`,
        blockTitle: PHYSIO_BLOCK_TITLE,
        blockIndex: bi,
        indexInBlock: ii,
        blockSize: prescriptions.length,
        item: p,
        base: p,
        exercise: exerciseFor(p.exerciseId, physio),
        physio: true,
        warmup: false,
      })),
    });
  }
  const steps: PlayerStep[] = [];
  for (const b of blocks) {
    const todo = b.items.filter((it) => !it.coveredBy);
    if (!todo.length) continue;
    if (todo[0].warmup) steps.push({ kind: 'warmup', key: `w:${todo[0].blockIndex}`, blockTitle: b.title, items: todo });
    else for (const it of todo) steps.push({ kind: 'exercise', key: it.key, item: it });
  }
  const day = plan.week.find((d) => d.weekday === weekdayOf(date));
  const all = blocks.flatMap((b) => b.items);
  return {
    session,
    items: all.filter((it) => !it.coveredBy),
    steps,
    blocks,
    covered: all.filter((it) => it.coveredBy),
    duration: sessionDuration(session, physio, { intro: Boolean(intro) }),
    physioDay: Boolean(day?.physio),
    physioDays: physioWeekdays(plan),
    intro,
  };
}

/**
 * Suggerimento di progressione per un esercizio del piano, lo stesso nell'anteprima, nella card della prossima
 * seduta e nel lettore: le ultime due esecuzioni (per lo stallo), la regola del dolore per quell'esercizio, la
 * fase di ingresso e, per la variante presa al posto della panca con il gomito sopra soglia, il carico ridotto.
 * `exerciseId` è l'esercizio in uso (diverso da quello del piano se l'utente l'ha sostituito).
 */
export function suggestionForItem(
  it: PlayerItem,
  ctx: { history: readonly WorkoutLog[]; gate: PainGate; intro: boolean; catalog?: Record<string, Exercise>; exerciseId?: string },
): Suggestion {
  const id = ctx.exerciseId ?? it.item.exerciseId;
  const ex = (ctx.catalog ?? EXERCISES)[id];
  const [last = null, previous = null] = recentLogsFor(id, ctx.history, 2);
  return suggestNext({ ...it.base, exerciseId: id }, last, {
    gate: gateForExercise(ex, ctx.gate),
    painNote: painNoteForExercise(ex, ctx.gate),
    intro: !it.physio && ctx.intro,
    previous,
    switched: it.replacedKind === 'gomito' && id === it.item.exerciseId,
  });
}

/**
 * Durata da mostrare, come in Oggi: "55 min" oppure, con gli esercizi del fisioterapista,
 * "45 min + 24 min dal fisioterapista" (va a capo prima del "+", mai dentro una durata).
 * `short` dà la forma compatta per le righe strette ("45 + 24 min", come la timeline).
 */
export function durationLabel(d: Pick<SessionDuration, 'own' | 'physio'>, opts: { short?: boolean } = {}): string {
  if (!d.physio) return fmtMinutes(d.own);
  if (opts.short && d.own < 60 && d.physio < 60) return `${d.own} + ${d.physio} min`;
  const both = `${fmtMinutes(d.own)} + ${fmtMinutes(d.physio)}`;
  return opts.short ? both : `${both} dal fisioterapista`;
}

/** Nomi brevi degli esercizi saltati, per le frasi: "polpacci da seduto e Tyler twist". */
export function coveredPhrase(items: readonly PlayerItem[]): string {
  return listIt(items.map((it) => shortName(it.exercise?.name ?? it.item.exerciseId, it.item.exerciseId)));
}

/** Serie previste in totale. */
export function plannedSets(items: readonly PlayerItem[]): number {
  return items.reduce((s, it) => s + it.item.sets, 0);
}

/** Minuti stimati di una lista di esercizi. */
export function estimateMinutes(items: readonly SessionExercise[]): number {
  return Math.round(items.reduce((s, it) => s + estimateItemSec(it), 0) / 60);
}

/** "6-10" oppure "15". */
export function repRange(item: Pick<SessionExercise, 'repMin' | 'repMax'>): string {
  return item.repMin === item.repMax ? `${item.repMin}` : `${item.repMin}-${item.repMax}`;
}

/** "3 × 6-10", "3 × 30-40 s", "1 × 2 min", con "per lato" se serve. */
export function doseLabel(item: SessionExercise, opts: { perSide?: boolean } = {}): string {
  const { perSide = true } = opts;
  let body: string;
  if (item.unit === 'secondi') {
    body = item.repMin === item.repMax && item.repMin % 60 === 0 && item.repMin >= 60 ? `${item.repMin / 60} min` : `${repRange(item)} s`;
  } else body = repRange(item);
  const sets = item.sets > 1 ? `${item.sets} × ${body}` : body;
  return `${sets}${perSide && item.perSide ? ' per lato' : ''}`;
}

/** "2:00" per i recuperi, "45 s" sotto il minuto. */
export function restLabel(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Carico leggibile: "22,5 kg", "corpo libero" a 0. */
export function kgLabel(n: number): string {
  return n > 0 ? `${fmtNumber(n, 1)} kg` : 'corpo libero';
}

/** Unità delle ripetizioni: "rip." oppure "s". */
export function repsUnit(item: Pick<SessionExercise, 'unit'>): string {
  return item.unit === 'secondi' ? 's' : 'rip.';
}

/** Esercizio senza attrezzi o con l'elastico: il carico di solito non si registra. */
export function isBodyweight(ex: Exercise | undefined): boolean {
  if (!ex) return false;
  const eq = ex.equipment.toLowerCase();
  if (/manubr|bilanc|trap|cavo|cavi|macchin|kettle|disco|zavorr|pulley|lat machine|leg press/.test(eq)) return false;
  return /corpo libero|muro|elastico|tappetino|sbarra|impugnature|panca$|cyclette|ellittica|ruota/.test(eq) || ex.category === 'mobilita' || ex.category === 'riscaldamento';
}

/** Passo dello stepper del carico: l'incremento della seduta se il valore lo rispetta, altrimenti più fine. */
export function weightStep(item: SessionExercise, value: number): number {
  const inc = item.incrementKg && item.incrementKg > 0 ? item.incrementKg : 2.5;
  const fits = (v: number, s: number) => Math.abs(v / s - Math.round(v / s)) < 1e-6;
  if (fits(value, inc)) return inc;
  if (fits(value, 1)) return 1;
  return 0.5;
}

/** Scala RPE CR10 (Foster) in italiano, indice = valore − 1. */
export const RPE_LABELS = [
  'Molto, molto facile',
  'Facile',
  'Moderata',
  'Abbastanza dura',
  'Dura',
  'Più che dura',
  'Molto dura',
  'Molto, molto dura',
  'Quasi massimale',
  'Massimale',
];

/** "lunedì e mercoledì" dai giorni brevi. */
export function daysPhrase(days: string[]): string {
  const long: Record<string, string> = { lun: 'lunedì', mar: 'martedì', mer: 'mercoledì', gio: 'giovedì', ven: 'venerdì', sab: 'sabato', dom: 'domenica' };
  return listIt(days.map((d) => long[d] ?? d));
}


/**
 * Colore della seduta: il tipo del giorno in cui il piano la prevede (A e B palestra, C leggero).
 * Una seduta in un giorno di calcio resta del colore della palestra.
 */
export function sessionTone(sessionId: string, plan: Pick<Plan, 'week'>): 'palestra' | 'leggero' | 'riposo' {
  const day = plan.week.find((d) => d.gymSessionId === sessionId);
  if (day?.dayType === 'leggero' || day?.dayType === 'riposo') return day.dayType;
  return 'palestra';
}

/** Categorie che contano per i record personali (niente core, riscaldamento, mobilità ed esercizi del fisio). */
const RECORD_CATEGORIES = new Set(['spinta', 'tirata', 'gambe', 'prevenzione']);

const isStrength = (id: string, physio?: AppData['physio']) => RECORD_CATEGORIES.has(exerciseFor(id, physio)?.category ?? '');

/** Record personali della seduta sugli esercizi di forza (1RM stimato oltre il migliore precedente). */
export function strengthRecords(log: WorkoutLog, history: readonly WorkoutLog[], physio?: AppData['physio']): PersonalRecord[] {
  return personalRecords(log, history).filter((r) => isStrength(r.exerciseId, physio));
}

/**
 * Il record della seduta da mostrare nello storico: tra i record ancora imbattuti (1RM stimato migliore di
 * sempre, anche contando le sedute successive), quello con il miglioramento maggiore. Uno solo, così il
 * trofeo resta raro.
 */
export function headlineRecord(log: WorkoutLog, history: readonly WorkoutLog[], physio?: AppData['physio']): PersonalRecord | null {
  return standingRecords(log, history).find((r) => isStrength(r.exerciseId, physio)) ?? null;
}

/** Nomi propri che restano maiuscoli nel nome breve. */
const PROPER_START = /^(Nordic|Copenhagen|Tyler|Pallof)\b/;
/** Nomi brevi dove il taglio automatico sarebbe ambiguo (due rematori, tre polpacci…). */
const SHORT_NAME: Record<string, string> = {
  'rematore-manubrio-una-mano': 'rematore a una mano',
  'rematore-petto-appoggiato': 'rematore con petto appoggiato',
  'polpacci-in-piedi-macchina': 'polpacci in piedi',
  'polpacci-seduto': 'polpacci da seduto',
  'polpacci-una-gamba-manubrio': 'polpacci su una gamba',
  'stacco-trap-bar': 'stacco con trap bar',
  'stacco-rumeno-una-gamba': 'stacco rumeno su una gamba',
  'distensioni-ai-cavi-presa-neutra': 'distensioni ai cavi',
  'leg-press': 'leg press',
};

/**
 * Nome breve di un esercizio, minuscolo, per le frasi: "Hip thrust con bilanciere" → "hip thrust",
 * "Panca piana con manubri a presa neutra" → "panca piana", "Pallof press al cavo" → "Pallof press".
 */
export function shortName(name: string, id?: string): string {
  if (id && SHORT_NAME[id]) return SHORT_NAME[id];
  const cut = name.split(/ (?:con|a presa|al|alla|alle|ai|da|su|sulla|in|a una|a leva|degli|del|dei)(?= |$)/)[0].trim() || name;
  return PROPER_START.test(cut) ? cut : cut.charAt(0).toLowerCase() + cut.slice(1);
}
