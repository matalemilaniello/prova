/**
 * Timeline della giornata: le voci da eseguire e segnare, in ordine di orario.
 *
 * Regole (SPEC §7):
 * - controllo del mattino 5 minuti dopo la sveglia, integratori con il pasto del loro momento, i 5 pasti,
 *   palestra (se prevista), calcio, esercizi del fisioterapista, coprifuoco del telefono, a letto;
 * - calcio serale (dalle 17:30): merenda pre-calcio circa 2 h 30 prima (mai a ridosso del pranzo né
 *   nell'ultima ora prima del calcio) e cena di recupero dopo il calcio; se il calcio finisce dopo le 21:30
 *   la cena diventa "Cena di recupero, veloce e digeribile";
 * - calcio di giorno: un pasto che cadrebbe durante il calcio si sposta subito dopo;
 * - gli esercizi del fisioterapista compaiono solo se ce ne sono di inseriti;
 * - giornata minima: le 4 voci `minima:*`, più calcio e palestra del giorno come appuntamenti che non contano
 *   (così si registrano ancora minuti e RPE);
 * - gli orari dopo la mezzanotte (a letto alle 00:30) restano in fondo alla giornata.
 *
 * `buildDay` aggiunge i riti del fine settimana che reggono la settimana dopo: spesa il sabato, preparazione
 * e revisione la domenica. Sono voci derivate, con tipi propri (`RitualKind`), fuori dal contratto dei dati.
 *
 * Aderenza: fatto = 1, sostituito = 0,5, saltato o non segnato = 0, su tutte le voci tranne `letto`, gli
 * appuntamenti della giornata minima e le voci precedenti al primo avvio dell'app.
 * Giornata riuscita: aderenza ≥ 70%; in giornata minima servono tutte e 4 le voci fatte.
 *
 * Gli id sono stabili per data ('pasto:pranzo', 'palestra:A', 'calcio:partita', 'minima:frutto'):
 * il diario (`DayLog.status`) li usa come chiavi.
 */
import type {
  AppData,
  CheckIn,
  FootballKind,
  HHMM,
  ISODate,
  ItemStatus,
  MealSlot,
  Plan,
  ScheduleDay,
  Supplement,
  TimelineItem,
  TimelineKind,
} from '../domain/types';
import { estimateItemSec, SESSIONS } from '../data/sessions';
import { fmtHours, fmtMinutes, listIt, MEAL_SLOT_LABEL, plural } from '../lib/format';
import { addDays, daysBetween, hhmmToMin, isHHMM, isISODate, minToHHMM, weekdayOf, weekStart } from './dates';
import { MEAL_SLOTS, mealsForDate, menuWeekFor } from './menu';
import { shoppingList, shoppingProgress } from './shopping';
import { bedtimeFor, curfewFor, dayCutoffMin, isOnTargetFor, sleepHours } from './sleep';

/** Lo stato che serve alla timeline. I registri (controlli, sedute, calcio, spesa…) sono facoltativi. */
export type TimelineState = Pick<AppData, 'plan' | 'dayLogs'> &
  Partial<Pick<AppData, 'physio' | 'checkIns' | 'workoutLogs' | 'footballLogs' | 'reviews' | 'shoppingChecked' | 'prepDone'>>;

/** Riti del fine settimana: voci derivate dal piano, non salvate nel contratto dei dati. */
export type RitualKind = 'spesa' | 'preparazione' | 'revisione';
export type DayItemKind = TimelineKind | RitualKind;
/** Voce della giornata come la mostra Oggi: una `TimelineItem` oppure un rito del fine settimana. */
export type DayItem = Omit<TimelineItem, 'kind'> & { kind: DayItemKind };

/**
 * Primo avvio dell'app (campo facoltativo `Plan.firstUse`, scritto alla fine del benvenuto): le voci di quel
 * giorno con orario precedente non contano e non restano indietro.
 */
export interface FirstUse {
  date: ISODate;
  time: HHMM;
}

// ───────────────────────── Costanti ─────────────────────────

/** Il controllo del mattino arriva 5 minuti dopo la sveglia. */
export const CHECKIN_AFTER_WAKE_MIN = 5;
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
/** Orario degli esercizi del fisioterapista: 75 minuti dopo il pranzo, a casa. */
export const PHYSIO_AFTER_LUNCH_MIN = 75;
/** Orario della palestra quando il piano non lo indica. */
export const DEFAULT_GYM_TIME: HHMM = '17:00';
/** Soglia di aderenza per una giornata riuscita. */
export const SUCCESS_THRESHOLD = 0.7;
/** Coprifuoco, letto e telefono fuori si segnano da un'ora prima del coprifuoco, non prima. */
export const CURFEW_MARK_LEAD_MIN = 60;
/** Spesa del sabato, preparazione e revisione della domenica. */
export const SHOPPING_TIME: HHMM = '11:30';
export const PREP_TIME: HHMM = '17:00';
export const REVIEW_TIME: HHMM = '18:00';
/** La spesa è fatta quando è spuntato almeno l'80% della lista. */
export const SHOPPING_DONE_RATIO = 0.8;
/** Jolly della serie: uno a settimana con 5 giornate riuscite, al massimo uno da parte. */
export const JOLLY_WINS_PER_WEEK = 5;
export const JOLLY_MAX = 1;

/** Voci della giornata minima, nell'ordine della specifica. */
export const MINIMAL_IDS = ['minima:proteine', 'minima:frutto', 'minima:integratori', 'minima:telefono'] as const;

const DAY_MIN = 1440;

/** Ordine a parità di orario: la colazione prima degli integratori, il coprifuoco prima del letto. */
const KIND_ORDER: Record<DayItemKind, number> = {
  controllo: 0,
  pasto: 1,
  integratori: 2,
  minima: 3,
  fisio: 4,
  palestra: 5,
  calcio: 6,
  spesa: 7,
  preparazione: 8,
  revisione: 9,
  coprifuoco: 10,
  letto: 11,
};

export const FOOTBALL_TITLE: Record<FootballKind, string> = {
  partita: 'Partita',
  calcetto: 'Calcetto',
  allenamento: 'Allenamento di squadra',
};

const PRE_FOOTBALL_TITLE: Record<FootballKind, string> = {
  partita: 'Merenda pre-partita',
  calcetto: 'Merenda pre-calcetto',
  allenamento: 'Merenda pre-allenamento',
};

// ───────────────────────── Orari della giornata ─────────────────────────

/** Inizio della giornata (sveglia − 90 min): unica definizione in `sleep.ts`. */
export { dayCutoffMin } from './sleep';

/** Minuti dall'inizio della giornata: 00:30 diventa 24:30 (1470), così resta dopo le 23:00. */
export function dayMinutes(t: HHMM, plan: Pick<Plan, 'sleep'>): number {
  const m = hhmmToMin(t);
  return m < dayCutoffMin(plan) ? m + DAY_MIN : m;
}

/** Arrotonda ai 5 minuti (per eccesso con `up`). */
function round5(min: number, up = false): number {
  return up ? Math.ceil(min / 5) * 5 : Math.round(min / 5) * 5;
}

/** Il calcio del giorno è serale (merenda pre-calcio e cena di recupero)? */
export function isEveningFootball(day: Pick<ScheduleDay, 'football'> | undefined): boolean {
  return Boolean(day?.football && hhmmToMin(day.football.time) >= hhmmToMin(EVENING_FOOTBALL_FROM));
}

export interface MealSchedule {
  time: HHMM;
  title: string;
}

/** Orari e titoli dei 5 pasti del giorno, con gli spostamenti dei giorni di calcio. */
export function mealSchedule(day: ScheduleDay | undefined, plan: Pick<Plan, 'mealTimes' | 'sleep'>): Record<MealSlot, MealSchedule> {
  const t = plan.mealTimes;
  const out = Object.fromEntries(MEAL_SLOTS.map((slot) => [slot, { time: t[slot], title: MEAL_SLOT_LABEL[slot] }])) as Record<
    MealSlot,
    MealSchedule
  >;
  const f = day?.football;
  if (!f) return out;

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
  for (const slot of MEAL_SLOTS) {
    const m = dayMinutes(out[slot].time, plan);
    if (m > start && m < end) {
      out[slot] = { time: minToHHMM(round5(end + RECOVERY_DELAY_MIN, true)), title: `${MEAL_SLOT_LABEL[slot]} di recupero` };
    }
  }
  return out;
}

// ───────────────────────── Costruzione delle voci ─────────────────────────

const lowerFirst = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** "Creatina monoidrato, omega-3 e vitamina D" */
export function supplementList(list: Supplement[]): string {
  return listIt(list.map((s, i) => (i === 0 ? s.name : lowerFirst(s.name))));
}

const SUPP_TITLE: Record<Supplement['timing'], string> = {
  colazione: 'Integratori',
  pranzo: 'Integratori a pranzo',
  cena: 'Integratori a cena',
  sera: 'Integratori della sera',
};

/** Durata stimata degli esercizi del fisioterapista, in minuti arrotondati a 5 (0 se non ce ne sono). */
export function physioMinutes(physio: AppData['physio'] | undefined): number {
  const sec = (physio?.prescriptions ?? []).reduce((tot, p) => tot + estimateItemSec(p), 0);
  return sec > 0 ? Math.max(5, round5(sec / 60)) : 0;
}

function minimalItems(iso: ISODate, state: TimelineState): TimelineItem[] {
  const { plan } = state;
  const t = plan.mealTimes;
  const curfew = curfewFor(iso, plan);
  const bed = bedtimeFor(iso, plan);
  const supps = plan.supplements.filter((s) => s.active);
  const items: TimelineItem[] = [
    {
      id: 'minima:proteine',
      time: t.colazione,
      kind: 'minima',
      title: 'Proteine a ogni pasto',
      detail: 'Un palmo di carne, pesce, uova, legumi o latticini',
    },
    {
      id: 'minima:frutto',
      time: t.spuntino,
      kind: 'minima',
      title: 'Almeno un frutto',
      detail: 'Intero e senza preparazione: mela, banana, clementine',
    },
    {
      id: 'minima:integratori',
      time: t.colazione,
      kind: 'minima',
      title: 'Integratori',
      detail: supps.length ? supplementList(supps) : 'Quelli del piano, con la colazione',
    },
    {
      id: 'minima:telefono',
      time: curfew,
      kind: 'minima',
      title: 'Telefono fuori dalla camera',
      detail: `Alle ${curfew}, poi a letto alle ${bed}`,
    },
  ];
  const order = (id: string) => (MINIMAL_IDS as readonly string[]).indexOf(id);
  items.sort((a, b) => dayMinutes(a.time, plan) - dayMinutes(b.time, plan) || order(a.id) - order(b.id));
  // Calcio e palestra restano come appuntamenti che non contano: minuti e RPE servono al carico.
  const wd = weekdayOf(iso);
  const day = plan.week.find((d) => d.weekday === wd) ?? plan.week[wd];
  const appointments = [gymItem(day), footballItem(day)].filter((x): x is TimelineItem => Boolean(x));
  if (!appointments.length) return items;
  return sortTimeline([...items, ...appointments], plan);
}

function gymItem(day: ScheduleDay | undefined): TimelineItem | null {
  if (!day?.gymSessionId) return null;
  const id = day.gymSessionId;
  const session = SESSIONS[id];
  const est = session?.estMin ?? 55;
  return {
    id: `palestra:${id}`,
    time: day.gymTime ?? DEFAULT_GYM_TIME,
    kind: 'palestra',
    title: session?.name ?? `Seduta ${id}`,
    detail: [day.gymOptional ? 'Facoltativa' : '', session?.subtitle ?? '', fmtMinutes(est)].filter(Boolean).join(' · '),
    ref: id,
  };
}

function footballItem(day: ScheduleDay | undefined): TimelineItem | null {
  if (!day?.football) return null;
  const f = day.football;
  const end = minToHHMM(hhmmToMin(f.time) + f.durationMin);
  return {
    id: `calcio:${f.kind}`,
    time: f.time,
    kind: 'calcio',
    title: FOOTBALL_TITLE[f.kind],
    detail: `${fmtMinutes(f.durationMin)}, fine alle ${end}`,
    ref: f.kind,
  };
}

/** Voci della giornata, ordinate per orario (gli orari dopo mezzanotte in fondo). */
export function buildTimeline(iso: ISODate, state: TimelineState): TimelineItem[] {
  const { plan } = state;
  if (state.dayLogs[iso]?.minimal) return minimalItems(iso, state);

  const wd = weekdayOf(iso);
  const day = plan.week.find((d) => d.weekday === wd) ?? plan.week[wd];
  const items: TimelineItem[] = [];
  const wake = plan.sleep.wake;

  // Controllo del mattino.
  items.push({
    id: 'controllo',
    time: minToHHMM(hhmmToMin(wake) + CHECKIN_AFTER_WAKE_MIN),
    kind: 'controllo',
    title: 'Controllo del mattino',
    detail: 'Peso, sonno, dolori ed energia',
  });

  // Pasti, con i loro orari del giorno.
  const meals = mealsForDate(iso, state);
  const schedule = mealSchedule(day, plan);
  for (const slot of MEAL_SLOTS) {
    const entry = meals.bySlot[slot];
    items.push({
      id: `pasto:${slot}`,
      time: schedule[slot].time,
      kind: 'pasto',
      title: schedule[slot].title,
      detail: entry?.recipe?.name,
      ref: entry?.recipeId || undefined,
      slot,
    });
  }

  const curfew = curfewFor(iso, plan);
  const bed = bedtimeFor(iso, plan);

  // Integratori, raggruppati per momento.
  const active = plan.supplements.filter((s) => s.active);
  for (const timing of ['colazione', 'pranzo', 'cena', 'sera'] as const) {
    const group = active.filter((s) => s.timing === timing);
    if (!group.length) continue;
    items.push({
      id: timing === 'colazione' ? 'integratori' : `integratori:${timing}`,
      time: timing === 'sera' ? curfew : schedule[timing].time,
      kind: 'integratori',
      title: SUPP_TITLE[timing],
      detail: supplementList(group),
    });
  }

  // Palestra.
  const gym = gymItem(day);
  if (gym) items.push(gym);

  // Calcio.
  const football = footballItem(day);
  if (football) items.push(football);

  // Esercizi del fisioterapista, solo se inseriti: una voce da spuntare senza esercizi non ha senso.
  const n = state.physio?.prescriptions?.length ?? 0;
  if (day?.physio && n > 0) {
    const mins = physioMinutes(state.physio);
    items.push({
      id: 'fisio',
      time: physioTime(day, plan, mins),
      kind: 'fisio',
      title: 'Esercizi del fisioterapista',
      detail: `${plural(n, 'esercizio', 'esercizi')} · ${fmtMinutes(mins)}`,
    });
  }

  // Sera.
  items.push({
    id: 'coprifuoco',
    time: curfew,
    kind: 'coprifuoco',
    title: 'Coprifuoco del telefono',
    detail: 'In carica fuori dalla camera, luci basse',
  });
  items.push({
    id: 'letto',
    time: bed,
    kind: 'letto',
    title: 'A letto',
    detail: `Sveglia alle ${wake} · ${fmtHours(sleepHours(bed, wake))} di sonno`,
  });

  return sortTimeline(items, plan);
}

/** Orario degli esercizi del fisioterapista: dopo pranzo, oppure dopo la palestra se si sovrappongono. */
export function physioTime(day: ScheduleDay | undefined, plan: Pick<Plan, 'mealTimes' | 'sleep'>, mins = 15): HHMM {
  const schedule = mealSchedule(day, plan);
  let at = dayMinutes(schedule.pranzo.time, plan) + PHYSIO_AFTER_LUNCH_MIN;
  if (day?.gymSessionId) {
    const start = dayMinutes(day.gymTime ?? DEFAULT_GYM_TIME, plan);
    const end = start + (SESSIONS[day.gymSessionId]?.estMin ?? 55);
    if (at + Math.max(mins, 15) > start && at < end) at = end + 15;
  }
  return minToHHMM(round5(at));
}

/**
 * Giorno con il fisioterapista previsto ma senza esercizi inseriti: orario in cui proporre di aggiungerli
 * (una riga di configurazione che non conta), altrimenti null.
 */
export function physioSetupDue(iso: ISODate, state: TimelineState): HHMM | null {
  const { plan } = state;
  const wd = weekdayOf(iso);
  const day = plan.week.find((d) => d.weekday === wd) ?? plan.week[wd];
  if (!day?.physio || (state.physio?.prescriptions?.length ?? 0) > 0) return null;
  return physioTime(day, plan);
}

/** Ordina per orario della giornata, poi per tipo di voce (stabile). */
export function sortTimeline<T extends DayItem>(items: T[], plan: Pick<Plan, 'sleep'>): T[] {
  return items
    .map((it, i) => ({ it, i, m: dayMinutes(it.time, plan) }))
    .sort((a, b) => a.m - b.m || KIND_ORDER[a.it.kind] - KIND_ORDER[b.it.kind] || a.i - b.i)
    .map((x) => x.it);
}

// ───────────────────────── Riti del fine settimana ─────────────────────────

/** Attività della preparazione domenicale per la settimana che parte il lunedì dopo `iso`. */
export function nextWeekPrep(iso: ISODate, plan: Pick<Plan, 'startDate'>): { weekStart: ISODate; tasks: { id: string; minutes: number }[]; minutes: number } {
  const monday = addDays(weekStart(iso), 7);
  const tasks = menuWeekFor(monday, plan.startDate)?.prep ?? [];
  return { weekStart: monday, tasks, minutes: tasks.reduce((t, x) => t + (x.minutes || 0), 0) };
}

/** Spesa il sabato, preparazione e revisione la domenica, con orari che non si sovrappongono al resto. */
export function ritualItems(iso: ISODate, state: TimelineState): DayItem[] {
  const { plan } = state;
  if (state.dayLogs[iso]?.minimal) return [];
  const wd = weekdayOf(iso);
  const day = plan.week.find((d) => d.weekday === wd) ?? plan.week[wd];
  const out: DayItem[] = [];

  if (wd === 5) {
    // Dopo la seduta del sabato mattina, se c'è e si sovrappone.
    let at = hhmmToMin(SHOPPING_TIME);
    if (day?.gymSessionId) {
      const start = hhmmToMin(day.gymTime ?? DEFAULT_GYM_TIME);
      const end = start + (SESSIONS[day.gymSessionId]?.estMin ?? 55);
      if (at < end + 10 && at + 60 > start) at = round5(end + 15, true);
    }
    out.push({
      id: 'rito:spesa',
      time: minToHHMM(at),
      kind: 'spesa',
      title: 'Spesa per la settimana',
      detail: 'La lista è già pronta in Settimana',
    });
  }

  if (wd === 6) {
    const prep = nextWeekPrep(iso, plan);
    if (prep.tasks.length) {
      // Finisce prima della revisione: con 85 minuti si comincia alle 16:35.
      const start = Math.min(hhmmToMin(PREP_TIME), Math.floor((hhmmToMin(REVIEW_TIME) - prep.minutes) / 5) * 5);
      out.push({
        id: 'rito:preparazione',
        time: minToHHMM(start),
        kind: 'preparazione',
        title: 'Preparazione della settimana',
        detail: `${plural(prep.tasks.length, 'attività', 'attività')} · ${fmtMinutes(prep.minutes)}`,
      });
    }
    out.push({
      id: 'rito:revisione',
      time: REVIEW_TIME,
      kind: 'revisione',
      title: 'Revisione della settimana',
      detail: 'Dieci minuti: voti, numeri e correzioni del piano',
    });
  }
  return out;
}

/** Voci della giornata come le mostra Oggi: la timeline più i riti del fine settimana. */
export function buildDay(iso: ISODate, state: TimelineState): DayItem[] {
  const base: DayItem[] = buildTimeline(iso, state);
  const rituals = ritualItems(iso, state);
  return rituals.length ? sortTimeline([...base, ...rituals], state.plan) : base;
}

// ───────────────────────── Primo avvio ─────────────────────────

/** Primo avvio salvato nel piano, se c'è e se è valido. */
export function firstUseOf(plan: Pick<Plan, 'startDate'>): FirstUse | null {
  const f = (plan as { firstUse?: unknown }).firstUse;
  if (!f || typeof f !== 'object') return null;
  const { date, time } = f as Partial<FirstUse>;
  return isISODate(date) && isHHMM(time) ? { date, time } : null;
}

/** La voce viene prima del primo avvio dell'app: non conta e non resta indietro. */
export function isBeforeStart(iso: ISODate, item: Pick<DayItem, 'time' | 'kind'>, plan: Pick<Plan, 'startDate' | 'sleep'>): boolean {
  const first = firstUseOf(plan);
  if (!first) return false;
  const diff = daysBetween(first.date, iso);
  if (diff > 0) return false;
  if (diff < 0) return true;
  // Le voci minime valgono per tutta la giornata.
  if (item.kind === 'minima') return false;
  return dayMinutes(item.time, plan) < dayMinutes(first.time, plan);
}

/**
 * La voce conta nell'aderenza? No per `letto`, per gli appuntamenti della giornata minima (calcio e
 * palestra) e per le voci precedenti al primo avvio.
 */
export function itemCounts(iso: ISODate, item: Pick<DayItem, 'time' | 'kind'>, state: TimelineState): boolean {
  if (item.kind === 'letto') return false;
  if (state.dayLogs[iso]?.minimal && item.kind !== 'minima') return false;
  return !isBeforeStart(iso, item, state.plan);
}

// ───────────────────────── Coprifuoco onesto ─────────────────────────

/** Le voci della notte (coprifuoco, letto, telefono fuori) che si segnano solo la sera. */
export function isNightItem(item: Pick<DayItem, 'kind' | 'id'>): boolean {
  return item.kind === 'coprifuoco' || item.kind === 'letto' || item.id === 'minima:telefono';
}

/** Orario da cui si può segnare la voce, o null se si segna quando si vuole. */
export function markableFrom(iso: ISODate, item: Pick<DayItem, 'kind' | 'id'>, plan: Pick<Plan, 'sleep' | 'week'>): HHMM | null {
  if (!isNightItem(item)) return null;
  return minToHHMM(hhmmToMin(curfewFor(iso, plan)) - CURFEW_MARK_LEAD_MIN);
}

/**
 * Si può segnare adesso? Le voci della notte di oggi solo da un'ora prima del coprifuoco; quelle dei giorni
 * passati sempre (si sistema la sera prima il mattino dopo).
 */
export function canMarkNow(
  iso: ISODate,
  item: Pick<DayItem, 'kind' | 'id'>,
  now: HHMM,
  plan: Pick<Plan, 'sleep' | 'week'>,
  today: ISODate = iso,
): boolean {
  if (daysBetween(iso, today) > 0) return true;
  const from = markableFrom(iso, item, plan);
  return !from || dayMinutes(now, plan) >= dayMinutes(from, plan);
}

// ───────────────────────── Stato delle voci ─────────────────────────

export type StatusSource = 'diario' | 'registro';

/**
 * Stato effettivo delle voci: quello del diario, completato dai registri quando la voce non è segnata
 * (controllo salvato → controllo fatto; seduta registrata → palestra fatta, o sostituita se era un'altra
 * seduta; calcio registrato → calcio fatto).
 */
export function effectiveStatus(
  iso: ISODate,
  state: TimelineState,
  items: DayItem[] = buildDay(iso, state),
): Record<string, ItemStatus> {
  const out: Record<string, ItemStatus> = { ...(state.dayLogs[iso]?.status ?? {}) };
  for (const it of items) {
    if (out[it.id]) continue;
    const derived = derivedStatus(iso, state, it);
    if (derived) out[it.id] = derived;
  }
  return out;
}

/** Stato ricavato dai registri (controlli, sedute, calcio, spesa, preparazione, revisione), indipendente dal diario. */
export function derivedStatus(iso: ISODate, state: TimelineState, item: DayItem): ItemStatus | undefined {
  switch (item.kind) {
    case 'controllo':
      return state.checkIns?.[iso] ? 'fatto' : undefined;
    case 'palestra': {
      const logs = (state.workoutLogs ?? []).filter((w) => w.date === iso);
      if (!logs.length) return undefined;
      return logs.some((w) => w.sessionId === item.ref) ? 'fatto' : 'sostituito';
    }
    case 'calcio':
      return (state.footballLogs ?? []).some((f) => f.date === iso && f.kind === item.ref) ? 'fatto' : undefined;
    case 'revisione':
      return (state.reviews ?? []).some((r) => r.weekStart === weekStart(iso)) ? 'fatto' : undefined;
    case 'preparazione': {
      const prep = nextWeekPrep(iso, state.plan);
      const done = new Set(state.prepDone?.[prep.weekStart] ?? []);
      return prep.tasks.length > 0 && prep.tasks.every((t) => done.has(t.id)) ? 'fatto' : undefined;
    }
    case 'spesa': {
      const monday = addDays(weekStart(iso), 7);
      const checked = state.shoppingChecked?.[monday];
      if (!checked?.length) return undefined;
      const progress = shoppingProgress(shoppingList(monday, state), checked);
      return progress.total > 0 && progress.ratio >= SHOPPING_DONE_RATIO - 1e-9 ? 'fatto' : undefined;
    }
    default:
      return undefined;
  }
}

/** Da dove viene lo stato di una voce: dal diario, da un registro, o da nessuna parte. */
export function statusSource(iso: ISODate, state: TimelineState, item: DayItem): StatusSource | null {
  if (state.dayLogs[iso]?.status?.[item.id]) return 'diario';
  return derivedStatus(iso, state, item) ? 'registro' : null;
}

// ───────────────────────── Aderenza e serie ─────────────────────────

export interface AdherenceSummary {
  /** Voci che contano (vedi `itemCounts`). */
  total: number;
  done: number;
  replaced: number;
  skipped: number;
  pending: number;
  /** 0-1: fatto = 1, sostituito = 0,5. */
  score: number;
  minimal: boolean;
}

/** Conteggi e aderenza della giornata. */
export function adherenceSummary(
  iso: ISODate,
  state: TimelineState,
  items: DayItem[] = buildDay(iso, state),
  status: Record<string, ItemStatus> = effectiveStatus(iso, state, items),
): AdherenceSummary {
  let done = 0;
  let replaced = 0;
  let skipped = 0;
  let total = 0;
  for (const it of items) {
    if (!itemCounts(iso, it, state)) continue;
    total++;
    const s = status[it.id];
    if (s === 'fatto') done++;
    else if (s === 'sostituito') replaced++;
    else if (s === 'saltato') skipped++;
  }
  return {
    total,
    done,
    replaced,
    skipped,
    pending: total - done - replaced - skipped,
    score: total ? (done + replaced * 0.5) / total : 0,
    minimal: Boolean(state.dayLogs[iso]?.minimal),
  };
}

/** Aderenza 0-1: fatto = 1, sostituito = 0,5, saltato o non segnato = 0, sulle voci che contano. */
export function dayAdherence(iso: ISODate, state: TimelineState): number {
  return adherenceSummary(iso, state).score;
}

/** Giornata riuscita: aderenza ≥ 70%; in giornata minima tutte e 4 le voci fatte. */
export function isSuccessful(summary: AdherenceSummary): boolean {
  if (summary.minimal) return summary.total > 0 && summary.done === summary.total;
  return summary.total > 0 && summary.score >= SUCCESS_THRESHOLD - 1e-9;
}

export function daySuccessful(iso: ISODate, state: TimelineState): boolean {
  return isSuccessful(adherenceSummary(iso, state));
}

/**
 * Esito delle giornate passate, ricordato finché non cambiano il diario del giorno né i registri da cui
 * dipende: la serie si ricalcola a ogni tocco, ma solo oggi cambia davvero.
 */
const successCache = new WeakMap<object, Map<ISODate, { deps: unknown[]; ok: boolean }>>();
function daySuccessfulCached(iso: ISODate, state: TimelineState): boolean {
  const deps = [
    state.dayLogs[iso],
    state.checkIns,
    state.workoutLogs,
    state.footballLogs,
    state.reviews,
    state.shoppingChecked,
    state.prepDone,
    state.physio,
  ];
  let byDay = successCache.get(state.plan);
  if (!byDay) {
    byDay = new Map();
    successCache.set(state.plan, byDay);
  }
  const hit = byDay.get(iso);
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.ok;
  const ok = daySuccessful(iso, state);
  byDay.set(iso, { deps, ok });
  return ok;
}

export interface StreakInfo {
  /** Giornate riuscite consecutive (le giornate salvate da un jolly non si sommano ma non spezzano). */
  days: number;
  /** True se oggi è già riuscita e conta nella serie. */
  includesToday: boolean;
  /** Jolly da parte: salvano la serie alla prossima giornata non riuscita. */
  jolly: number;
  /** Giornate della serie attuale salvate da un jolly. */
  jollyDays: ISODate[];
  /** Serie più lunga di sempre (dal primo avvio o dall'inizio del piano). */
  best: number;
}

/** Primo giorno da cui contano serie e notti: inizio del piano o primo avvio, il più tardi dei due. */
export function countingStart(plan: Pick<Plan, 'startDate'>): ISODate | null {
  const first = firstUseOf(plan);
  const start = plan.startDate && isISODate(plan.startDate) ? plan.startDate : null;
  if (first && (!start || daysBetween(start, first.date) > 0)) return first.date;
  return start;
}

/**
 * Serie di giornate riuscite fino a oggi, con i jolly. Oggi conta solo quando è già riuscita: finché è in
 * corso la serie parte da ieri e non si spezza. Ogni settimana (da lunedì) con 5 giornate riuscite fa
 * guadagnare un jolly (al massimo uno da parte): la prima giornata non riuscita lo consuma e la serie continua.
 * Tutto si ricava dal diario, senza stato in più.
 */
export function streakInfo(state: TimelineState, today: ISODate, maxDays = 400): StreakInfo {
  const startIso = countingStart(state.plan);
  let from = addDays(today, -maxDays);
  if (startIso && daysBetween(from, startIso) > 0) from = startIso;

  let days = 0;
  let jolly = 0;
  let jollyDays: ISODate[] = [];
  let best = 0;
  let week = '';
  let wins = 0;
  let earned = false;

  const win = (d: ISODate) => {
    days++;
    const ws = weekStart(d);
    if (ws !== week) {
      week = ws;
      wins = 0;
      earned = false;
    }
    wins++;
    if (!earned && wins >= JOLLY_WINS_PER_WEEK) {
      earned = true;
      jolly = Math.min(JOLLY_MAX, jolly + 1);
    }
    best = Math.max(best, days);
  };

  const span = daysBetween(from, today);
  for (let i = 0; i < span; i++) {
    const d = addDays(from, i);
    if (daySuccessfulCached(d, state)) {
      win(d);
      continue;
    }
    const ws = weekStart(d);
    if (ws !== week) {
      week = ws;
      wins = 0;
      earned = false;
    }
    if (days > 0 && jolly > 0) {
      jolly--;
      jollyDays.push(d);
    } else {
      days = 0;
      jollyDays = [];
    }
  }
  const includesToday = span >= 0 && daySuccessful(today, state);
  if (includesToday) win(today);
  return { days, includesToday, jolly, jollyDays, best };
}

/** Giornate riuscite consecutive fino a oggi (vedi `streakInfo`). */
export function streak(state: TimelineState, today: ISODate): number {
  return streakInfo(state, today).days;
}

/**
 * La notte della giornata `d` è stata in orario? Dal controllo del mattino dopo (orario a letto) o dalla
 * voce "A letto" segnata. Undefined se non si sa ancora.
 */
export function nightOnTarget(d: ISODate, state: TimelineState): boolean | undefined {
  const next = state.checkIns?.[addDays(d, 1)] as CheckIn | undefined;
  if (next?.bedTime) return isOnTargetFor(next.bedTime, addDays(d, 1), state.plan);
  const st = state.dayLogs[d]?.status;
  if (st?.letto === 'fatto') return true;
  if (st?.letto) return false;
  return undefined;
}

/**
 * Notti in orario consecutive fino a stanotte. La notte appena passata, se non c'è ancora il controllo del
 * mattino, non spezza la serie.
 */
export function nightStreak(state: TimelineState, today: ISODate, maxDays = 120): number {
  const startIso = countingStart(state.plan);
  let n = 0;
  for (let i = 1; i <= maxDays; i++) {
    const d = addDays(today, -i);
    if (startIso && daysBetween(startIso, d) < 0) break;
    const ok = nightOnTarget(d, state);
    if (ok === undefined && i === 1) continue;
    if (!ok) break;
    n++;
  }
  return n;
}

// ───────────────────────── Adesso ─────────────────────────

export type NowState = 'adesso' | 'prossima' | 'in-ritardo';

export interface NowPick {
  item: DayItem;
  state: NowState;
  /** Minuti all'inizio della voce: positivo = tra quanto, negativo = da quanto. */
  deltaMin: number;
}

/** Quanto dura una voce, per capire se è "in corso". */
export function itemWindowMin(item: DayItem, plan: Pick<Plan, 'week' | 'sleep'>): number {
  switch (item.kind) {
    case 'minima': {
      // Le voci minime valgono per tutta la giornata, fino al coprifuoco.
      if (item.id === 'minima:telefono') return 20;
      const curfew = dayMinutes(minToHHMM(hhmmToMin(plan.sleep.current) - plan.sleep.curfewLeadMin), plan);
      return Math.max(20, curfew - dayMinutes(item.time, plan));
    }
    case 'pasto':
      return 45;
    case 'controllo':
      return 60;
    case 'palestra':
      return SESSIONS[item.ref ?? '']?.estMin ?? 55;
    case 'calcio':
      return plan.week.find((d) => d.football?.kind === item.ref)?.football?.durationMin ?? 90;
    case 'fisio':
      return 30;
    case 'spesa':
      return 60;
    case 'preparazione':
      return Math.max(30, round5(hhmmToMin(REVIEW_TIME) - hhmmToMin(item.time)));
    case 'revisione':
      return 30;
    default:
      return 20;
  }
}

/**
 * La voce da mostrare nella card "Adesso": quella in corso, altrimenti la prossima non segnata,
 * altrimenti l'ultima rimasta indietro. Null se non resta niente da segnare.
 */
export function pickNow(
  items: DayItem[],
  status: Record<string, ItemStatus>,
  now: HHMM,
  plan: Pick<Plan, 'sleep' | 'week'>,
  opts: { skip?: DayItemKind[]; exclude?: (item: DayItem) => boolean } = {},
): NowPick | null {
  const nowM = dayMinutes(now, plan);
  const pending = items.filter((it) => !status[it.id] && !opts.skip?.includes(it.kind) && !opts.exclude?.(it));
  if (!pending.length) return null;
  for (const it of pending) {
    const start = dayMinutes(it.time, plan);
    if (nowM >= start - 5 && nowM < start + itemWindowMin(it, plan)) return { item: it, state: 'adesso', deltaMin: start - nowM };
  }
  const next = pending.find((it) => dayMinutes(it.time, plan) > nowM);
  if (next) return { item: next, state: 'prossima', deltaMin: dayMinutes(next.time, plan) - nowM };
  const last = pending[pending.length - 1];
  return { item: last, state: 'in-ritardo', deltaMin: dayMinutes(last.time, plan) - nowM };
}

/**
 * Voci non segnate il cui orario (più la durata) è già passato. Con `counts` restano fuori le voci che non
 * contano (letto, appuntamenti della giornata minima, voci precedenti al primo avvio).
 */
export function overdueItems<T extends DayItem>(
  items: T[],
  status: Record<string, ItemStatus>,
  now: HHMM,
  plan: Pick<Plan, 'sleep' | 'week'>,
  counts: (item: T) => boolean = (it) => it.kind !== 'letto',
): T[] {
  const nowM = dayMinutes(now, plan);
  return items.filter((it) => !status[it.id] && counts(it) && dayMinutes(it.time, plan) + itemWindowMin(it, plan) <= nowM);
}

/** Voci che contano e non sono segnate in una giornata (per sistemare ieri sera). */
export function openItems(iso: ISODate, state: TimelineState): DayItem[] {
  const items = buildDay(iso, state);
  const status = effectiveStatus(iso, state, items);
  return items.filter((it) => !status[it.id] && itemCounts(iso, it, state));
}

/** Minuti al coprifuoco del telefono (negativo se è già passato). */
export function minutesToCurfew(iso: ISODate, now: HHMM, plan: Plan): number {
  return dayMinutes(curfewFor(iso, plan), plan) - dayMinutes(now, plan);
}
