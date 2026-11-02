/**
 * Orari dei pasti di un giorno: l'unica fonte per Oggi, Settimana, la ricetta, il calendario, i promemoria, la revisione
 * e il coach (`mealTimesFor`, e `mealSchedule` per un giorno della settimana tipo).
 *
 * Si parte dagli orari del piano (`Plan.mealTimes`, quelli dei giorni normali) e si applicano, in quest'ordine:
 *
 * 1. Calcio (SPEC § 7). Calcio serale (dalle 17:30): merenda pre-calcio circa 2 h 30 prima (mai a meno di 2 ore dal
 *    pranzo né nell'ultima ora prima del calcio) e cena di recupero 30 minuti dopo la fine (mai prima della solita
 *    cena; se il calcio finisce dopo le 21:30 "veloce e digeribile"). Calcio di giorno: il pasto che cadrebbe durante il
 *    calcio va 30 minuti dopo la fine, "di recupero".
 *
 * 2. Lavoro (`ScheduleDay.work`). Senza lavoro non cambia niente. Con il lavoro, pasto per pasto e in ordine:
 *    - Colazione: se il lavoro (il primo blocco non ancora finito all'ora della colazione) comincia prima di colazione
 *      più 30 minuti, la colazione va a inizio lavoro meno 45 minuti (arrotondata ai 5 minuti per difetto). Mai prima
 *      del controllo del mattino, sveglia più 5 minuti (il peso si prende a digiuno), salvo una colazione del piano già
 *      più presto. Se servirebbe prima della sveglia lo dice `earlyBreakfast` (per l'avviso delle impostazioni); se così
 *      cade nel lavoro, è da portare.
 *    - Gli altri pasti, quando l'orario cade dentro un blocco di lavoro:
 *      a. si spostano in una pausa tra due blocchi di almeno 30 minuti, nel punto più vicino all'orario previsto che
 *         lascia 30 minuti per mangiare, se dista al massimo 90 minuti (con più pause, la più vicina);
 *      b. altrimenti, se il lavoro finisce entro 60 minuti dall'orario previsto, vanno a fine lavoro più 15 minuti
 *         (arrotondato ai 5 minuti per eccesso);
 *      c. altrimenti, se il lavoro è cominciato da non più di 30 minuti, vanno prima: inizio del lavoro meno 45 minuti
 *         (arrotondato per difetto), purché resti la distanza dal pasto prima e l'orario non cada in un altro blocco;
 *      d. altrimenti restano all'orario previsto e sono da portare (`carry`).
 *      Per b e c il lavoro comprende le pause più corte di 30 minuti, che non danno il tempo di mangiare.
 *    - L'ordine dei pasti resta quello di sempre: tra un pasto e il successivo restano almeno 90 minuti (o la distanza
 *      degli orari previsti, se è più corta: chi ha scelto pasti più vicini li tiene). Se un pasto si sposta in avanti
 *      quello dopo lo segue, e se così cade nel lavoro ripassa dalle regole qui sopra.
 *    I titoli non cambiano: la merenda pre-calcio resta la merenda pre-calcio, anche da portare.
 *
 * Il lavoro è in minuti della giornata del piano (`workSpans`), come i pasti (`dayMinutes`). Funzioni pure: niente
 * orologio, niente Math.random.
 */
import type { HHMM, ISODate, MealSlot, Plan, ScheduleDay, TimeRange } from '../domain/types';
import { MEAL_SLOT_LABEL } from '../lib/format';
import { hhmmToMin, minToHHMM, weekdayOf } from './dates';
import { dayMinutes } from './sleep';
import { normalizeWork, spanAt, workSpans, type WorkSpan } from './work';

// ───────────────────────── Costanti ─────────────────────────

/** Il calcio è "serale" da quest'ora: merenda pre-calcio e cena di recupero. */
export const EVENING_FOOTBALL_FROM: HHMM = '17:30';
/** Anticipo della merenda pre-calcio. */
export const PRE_FOOTBALL_LEAD_MIN = 150;
/** La merenda pre-calcio non arriva prima di 2 ore dopo il pranzo… */
export const PRE_FOOTBALL_AFTER_LUNCH_MIN = 120;
/** …e non nell'ultima ora prima del calcio. */
export const PRE_FOOTBALL_MIN_GAP_MIN = 60;
/** Doccia e rientro: la cena di recupero arriva 30 minuti dopo la fine del calcio. */
export const RECOVERY_DELAY_MIN = 30;
/** Se il calcio finisce dopo quest'ora la cena di recupero è veloce e digeribile. */
export const LATE_FOOTBALL_END: HHMM = '21:30';

/** La colazione si anticipa quando il lavoro comincia prima di colazione più questi minuti… */
export const WORK_BREAKFAST_TRIGGER_MIN = 30;
/** …e va a inizio lavoro meno questi minuti (lo stesso anticipo della regola c per gli altri pasti). */
export const WORK_BEFORE_LEAD_MIN = 45;
/** Mai prima del controllo del mattino: sveglia più 5 minuti, il peso si prende a digiuno. */
export const BREAKFAST_AFTER_WAKE_MIN = 5;
/** Pausa minima tra due blocchi per mangiare. */
export const WORK_MEAL_PAUSE_MIN = 30;
/** Una pausa vale se il pasto si sposta al massimo di tanto. */
export const WORK_PAUSE_REACH_MIN = 90;
/** Il pasto aspetta la fine del lavoro se arriva entro tanto… */
export const WORK_END_REACH_MIN = 60;
/** …e va a fine lavoro più tanto. */
export const WORK_END_DELAY_MIN = 15;
/** Il pasto si anticipa prima del lavoro se il lavoro è cominciato da non più di tanto. */
export const WORK_START_REACH_MIN = 30;
/** Distanza minima tra due pasti quando il lavoro ne sposta uno (o quella del piano, se è più corta). */
export const MEAL_GAP_MIN = 90;

const SLOTS: readonly MealSlot[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];

const PRE_FOOTBALL_TITLE = {
  partita: 'Merenda pre-partita',
  calcetto: 'Merenda pre-calcetto',
  allenamento: 'Merenda pre-allenamento',
} as const;

// ───────────────────────── Tipi ─────────────────────────

export interface MealSchedule {
  time: HHMM;
  title: string;
  /** Cade durante il lavoro: si porta da casa. */
  carry?: boolean;
}

/** Quello che serve del piano per gli orari di un giorno della settimana tipo. */
export type MealTimesPlan = Pick<Plan, 'mealTimes' | 'sleep'>;

export interface DaySchedule {
  meals: Record<MealSlot, MealSchedule>;
  /**
   * Per mangiare prima del lavoro la colazione servirebbe prima della sveglia del piano: l'orario che servirebbe.
   * La colazione resta comunque dopo il controllo del mattino.
   */
  earlyBreakfast?: HHMM;
}

export interface MealTimesOptions {
  /**
   * `false`: gli orari abituali del giorno, con il lavoro ma senza gli spostamenti del calcio. Li usa chi prima leggeva
   * `Plan.mealTimes` così com'era (giornata minima, spesa di avvio, revisione), e senza lavoro sono proprio quelli.
   */
  football?: boolean;
}

// ───────────────────────── Utilità ─────────────────────────

const ceil5 = (m: number) => Math.ceil(m / 5) * 5;
const floor5 = (m: number) => Math.floor(m / 5) * 5;
const round5 = (m: number, up = false) => (up ? ceil5(m) : Math.round(m / 5) * 5);

/** Il punto più vicino a `t` tra `lo` e `hi`, sui 5 minuti quando ce n'è uno nell'intervallo. */
function snap5(t: number, lo: number, hi: number): number {
  const c = Math.min(hi, Math.max(lo, t));
  let r = Math.round(c / 5) * 5;
  if (r < lo) r += 5;
  if (r > hi) r -= 5;
  return r < lo || r > hi ? c : r;
}

/** Giorno della settimana tipo di una data. */
export function scheduleDayOf(iso: ISODate, plan: Pick<Plan, 'week'>): ScheduleDay | undefined {
  const wd = weekdayOf(iso);
  return plan.week.find((d) => d.weekday === wd) ?? plan.week[wd];
}

/** Blocchi di lavoro di una data, normalizzati (vuoto nei giorni liberi). */
export function workBlocksFor(iso: ISODate, plan: Pick<Plan, 'week'>): TimeRange[] {
  return normalizeWork(scheduleDayOf(iso, plan)?.work) ?? [];
}

// ───────────────────────── Calcio ─────────────────────────

/** Il calcio del giorno è serale (merenda pre-calcio e cena di recupero)? */
export function isEveningFootball(day: Pick<ScheduleDay, 'football'> | undefined): boolean {
  return Boolean(day?.football && hhmmToMin(day.football.time) >= hhmmToMin(EVENING_FOOTBALL_FROM));
}

/** Orari del piano con i titoli dei pasti. */
function planSchedule(plan: MealTimesPlan): Record<MealSlot, MealSchedule> {
  const t = plan.mealTimes;
  return Object.fromEntries(SLOTS.map((slot) => [slot, { time: t[slot], title: MEAL_SLOT_LABEL[slot] }])) as Record<MealSlot, MealSchedule>;
}

/** Spostamenti dei giorni di calcio (regola 1). */
function withFootball(base: Record<MealSlot, MealSchedule>, day: ScheduleDay | undefined, plan: MealTimesPlan): Record<MealSlot, MealSchedule> {
  const f = day?.football;
  if (!f) return base;
  const t = plan.mealTimes;
  const out = { ...base };
  const start = hhmmToMin(f.time);
  const end = start + Math.max(0, f.durationMin);

  if (isEveningFootball(day)) {
    // Merenda pre-calcio: ~2 h 30 prima, ma non a ridosso del pranzo né nell'ultima ora.
    let pre = start - PRE_FOOTBALL_LEAD_MIN;
    pre = Math.max(pre, hhmmToMin(t.pranzo) + PRE_FOOTBALL_AFTER_LUNCH_MIN);
    pre = Math.min(pre, start - PRE_FOOTBALL_MIN_GAP_MIN);
    out.merenda = { time: minToHHMM(round5(pre)), title: PRE_FOOTBALL_TITLE[f.kind] };

    // Cena di recupero dopo il calcio (mai prima del solito orario di cena).
    const recovery = Math.max(dayMinutes(t.cena, plan), round5(end + RECOVERY_DELAY_MIN, true));
    const late = end > hhmmToMin(LATE_FOOTBALL_END);
    out.cena = { time: minToHHMM(recovery), title: late ? 'Cena di recupero, veloce e digeribile' : 'Cena di recupero' };
    return out;
  }

  // Calcio di giorno: il pasto che cadrebbe durante la partita si sposta subito dopo.
  for (const slot of SLOTS) {
    const m = dayMinutes(out[slot].time, plan);
    if (m > start && m < end) {
      out[slot] = { time: minToHHMM(round5(end + RECOVERY_DELAY_MIN, true)), title: `${MEAL_SLOT_LABEL[slot]} di recupero` };
    }
  }
  return out;
}

// ───────────────────────── Lavoro ─────────────────────────

interface Placed {
  t: number;
  carry: boolean;
}

/** Colazione con il lavoro (regola 2, colazione). */
function placeBreakfast(t0: number, blocks: readonly WorkSpan[], plan: MealTimesPlan): Placed & { early?: number } {
  const first = blocks.find(([, end]) => end > t0);
  if (!first || first[0] >= t0 + WORK_BREAKFAST_TRIGGER_MIN) return { t: t0, carry: false };
  const want = floor5(first[0] - WORK_BEFORE_LEAD_MIN);
  const wake = dayMinutes(plan.sleep.wake, plan);
  const t = Math.max(want, Math.min(t0, wake + BREAKFAST_AFTER_WAKE_MIN));
  return { t, carry: Boolean(spanAt(t, blocks)), ...(want < wake ? { early: want } : {}) };
}

/**
 * Un pasto che a `start` cade nel lavoro (regole a-d). `lo` è il primo orario che rispetta ordine e distanza dal pasto
 * prima. `blocks` sono i blocchi così come sono, `spans` gli stessi con le pause corte incluse.
 */
function placeMeal(start: number, lo: number, blocks: readonly WorkSpan[], spans: readonly WorkSpan[]): Placed {
  if (!spanAt(start, blocks)) return { t: start, carry: false };
  const span = spanAt(start, spans) ?? [start, start];

  // a. Una pausa tra due blocchi: tra due intervalli di `spans`, che distano almeno 30 minuti per costruzione.
  let best: number | null = null;
  for (let k = 0; k + 1 < spans.length; k++) {
    const from = Math.max(spans[k][1], lo);
    const to = spans[k + 1][0] - WORK_MEAL_PAUSE_MIN;
    if (to < from) continue;
    const c = snap5(start, from, to);
    const d = Math.abs(c - start);
    if (d <= WORK_PAUSE_REACH_MIN && (best === null || d < Math.abs(best - start))) best = c;
  }
  if (best !== null) return { t: best, carry: false };

  // b. Il lavoro finisce presto: subito dopo.
  if (span[1] - start <= WORK_END_REACH_MIN) return { t: ceil5(span[1] + WORK_END_DELAY_MIN), carry: false };

  // c. Il lavoro è appena cominciato: prima di andarci.
  if (start - span[0] <= WORK_START_REACH_MIN) {
    const c = floor5(span[0] - WORK_BEFORE_LEAD_MIN);
    if (c >= lo && !spanAt(c, blocks)) return { t: c, carry: false };
  }

  // d. Da portare.
  return { t: start, carry: true };
}

/** Spostamenti del lavoro (regola 2) sugli orari già sistemati per il calcio. */
function withWork(meals: Record<MealSlot, MealSchedule>, day: ScheduleDay | undefined, plan: MealTimesPlan): DaySchedule {
  const blocks = workSpans(day?.work, plan);
  if (!blocks.length) return { meals };
  const spans = workSpans(day?.work, plan, WORK_MEAL_PAUSE_MIN);
  const planned = SLOTS.map((slot) => dayMinutes(meals[slot].time, plan));
  const out = { ...meals };
  let early: number | undefined;
  let prev = 0;
  SLOTS.forEach((slot, i) => {
    const t0 = planned[i];
    let placed: Placed;
    if (i === 0) {
      const b = placeBreakfast(t0, blocks, plan);
      early = b.early;
      placed = b;
    } else {
      // Ordine e distanza: almeno 90 minuti dal pasto prima, o la distanza del piano se è più corta.
      const lo = prev + Math.min(MEAL_GAP_MIN, Math.max(0, t0 - planned[i - 1]));
      placed = placeMeal(t0 >= lo ? t0 : ceil5(lo), lo, blocks, spans);
    }
    prev = placed.t;
    if (placed.t !== t0 || placed.carry) out[slot] = { ...meals[slot], time: minToHHMM(placed.t), ...(placed.carry ? { carry: true } : {}) };
  });
  return { meals: out, ...(early !== undefined ? { earlyBreakfast: minToHHMM(early) } : {}) };
}

// ───────────────────────── Orari del giorno ─────────────────────────

/** Orari e titoli dei 5 pasti di un giorno della settimana tipo, con calcio e lavoro, più l'avviso della colazione. */
export function daySchedule(day: ScheduleDay | undefined, plan: MealTimesPlan, opts: MealTimesOptions = {}): DaySchedule {
  const base = planSchedule(plan);
  return withWork(opts.football === false ? base : withFootball(base, day, plan), day, plan);
}

/** Orari e titoli dei 5 pasti di un giorno della settimana tipo, con gli spostamenti del calcio e del lavoro. */
export function mealSchedule(day: ScheduleDay | undefined, plan: MealTimesPlan, opts: MealTimesOptions = {}): Record<MealSlot, MealSchedule> {
  return daySchedule(day, plan, opts).meals;
}

/**
 * Orari dei pasti di una data, con il segno dei pasti da portare al lavoro: la funzione da cui passano tutti i punti
 * che mostrano o usano l'orario di un pasto.
 */
export function mealTimesFor(iso: ISODate, plan: MealTimesPlan & Pick<Plan, 'week'>, opts: MealTimesOptions = {}): Record<MealSlot, MealSchedule> {
  return mealSchedule(scheduleDayOf(iso, plan), plan, opts);
}

/**
 * Orario abituale di un pasto nella settimana tipo (con il lavoro, senza il calcio): lo stesso tutti i giorni, altrimenti
 * null. Per i testi che parlano della settimana ("merenda alle 16:30"); senza lavoro è `Plan.mealTimes`.
 */
export function usualMealTime(slot: MealSlot, plan: MealTimesPlan & Pick<Plan, 'week'>): HHMM | null {
  const times = new Set(plan.week.map((d) => mealSchedule(d, plan, { football: false })[slot].time));
  if (!plan.week.length) return plan.mealTimes[slot];
  return times.size === 1 ? [...times][0] : null;
}
