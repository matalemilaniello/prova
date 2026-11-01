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
 * Nei giorni di avvio i pasti prima della prima spesa si fanno con quello che c'è in casa (`preShopping`).
 * Gli integratori senza una dose vera ("da definire") non entrano nella voce da segnare (`takenSupplements`).
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
import { fmtMinutes, listIt, MEAL_SLOT_LABEL, plural } from '../lib/format';
import { addDays, daysBetween, hhmmToMin, isHHMM, isISODate, minToHHMM, weekdayOf, weekStart } from './dates';
import { MEAL_SLOTS, isStarterDay, mealsForDate, menuWeekFor } from './menu';
import { shoppingList, type ShoppingLead, type ShoppingOptions } from './shopping';
import { bedtimeFor, curfewFor, dayCutoffMin, isOnTargetFor, timeInBedLabel } from './sleep';
import { introLevel, sessionDuration, type SessionDuration } from './training';

/** Lo stato che serve alla timeline. I registri (controlli, sedute, calcio, spesa…) sono facoltativi. */
export type TimelineState = Pick<AppData, 'plan' | 'dayLogs'> &
  Partial<Pick<AppData, 'physio' | 'checkIns' | 'workoutLogs' | 'footballLogs' | 'reviews' | 'shoppingChecked' | 'prepDone'>>;

/** Riti del fine settimana: voci derivate dal piano, non salvate nel contratto dei dati. */
export type RitualKind = 'spesa' | 'preparazione' | 'revisione';
export type DayItemKind = TimelineKind | RitualKind;
/** Voce della giornata come la mostra Oggi: una `TimelineItem` oppure un rito del fine settimana. */
export type DayItem = Omit<TimelineItem, 'kind'> & {
  kind: DayItemKind;
  /**
   * Pasto di un giorno di avvio che viene prima della prima spesa: gli ingredienti della ricetta non ci sono
   * ancora, si mangia con quello che c'è in casa (`buildDay`). La ricetta resta in `ref`.
   */
  preShopping?: boolean;
};

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
/** Spesa di avvio: un'ora dopo il pranzo, almeno mezz'ora dopo il primo avvio, non oltre le 19:30. */
export const STARTER_SHOPPING_AFTER_LUNCH_MIN = 60;
export const STARTER_SHOPPING_AFTER_START_MIN = 30;
export const STARTER_SHOPPING_LATEST: HHMM = '19:30';
/** Quanto tiene occupati la spesa di avvio (17 prodotti, andata e ritorno): non si sovrappone agli appuntamenti. */
export const STARTER_SHOPPING_DURATION_MIN = 45;
/** Margini della palestra per la spesa di avvio: 15 minuti per arrivarci, 30 per doccia e rientro. */
export const GYM_LEAD_MIN = 15;
export const GYM_AFTER_MIN = 30;
/** Id della spesa di avvio (la spesa del sabato è `rito:spesa`). */
export const STARTER_SHOPPING_ID = 'rito:spesa-avvio';
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

/**
 * Integratore senza una dose vera ("Dose da definire con l'esame"): non entra nella voce da segnare, perché
 * prenderlo a caso è proprio l'abitudine da correggere. Oggi ricorda una volta a settimana di definirla.
 */
export function doseUndefined(s: Pick<Supplement, 'dose'>): boolean {
  return /da\s+definire/i.test(s.dose ?? '');
}

/** Integratori attivi con una dose definita: quelli che finiscono nelle voci della giornata. */
export function takenSupplements(plan: Pick<Plan, 'supplements'>): Supplement[] {
  return (plan.supplements ?? []).filter((s) => s.active && !doseUndefined(s));
}

/**
 * Integratori attivi senza dose da ricordare oggi (il lunedì e il giorno del primo avvio), con l'orario del
 * pasto a cui andrebbero presi. Null se non c'è niente da ricordare. È una riga informativa: non conta.
 */
export function supplementDoseDue(iso: ISODate, state: TimelineState): { time: HHMM; names: string[] } | null {
  const { plan } = state;
  if (state.dayLogs[iso]?.minimal) return null;
  const pending = (plan.supplements ?? []).filter((s) => s.active && doseUndefined(s));
  if (!pending.length) return null;
  const first = firstUseOf(plan);
  if (weekdayOf(iso) !== 0 && first?.date !== iso) return null;
  const wd = weekdayOf(iso);
  const day = plan.week.find((d) => d.weekday === wd) ?? plan.week[wd];
  const schedule = mealSchedule(day, plan);
  const timing = pending[0].timing;
  const time = timing === 'sera' ? curfewFor(iso, plan) : schedule[timing].time;
  return { time, names: pending.map((s) => s.name) };
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
  const supps = takenSupplements(plan);
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
  const appointments = [gymItem(day, state), footballItem(day)].filter((x): x is TimelineItem => Boolean(x));
  if (!appointments.length) return items;
  return sortTimeline([...items, ...appointments], plan);
}

/**
 * Durata prevista della seduta, la stessa di Allenamento: senza gli esercizi già nel programma del
 * fisioterapista, con una serie in meno nella fase di ingresso, più il blocco del fisioterapista. Null se la
 * seduta non esiste.
 */
export function gymDuration(sessionId: string, state: Pick<TimelineState, 'physio' | 'workoutLogs'>): SessionDuration | null {
  const session = SESSIONS[sessionId];
  if (!session) return null;
  return sessionDuration(session, state.physio, { intro: introLevel(sessionId, state.workoutLogs ?? []) !== null });
}

/** Minuti in palestra (seduta più blocco del fisioterapista), 55 se la seduta non esiste. */
export function gymTotalMin(sessionId: string, state: Pick<TimelineState, 'physio' | 'workoutLogs'>): number {
  return gymDuration(sessionId, state)?.total ?? 55;
}

/** "45 min" oppure, con gli esercizi del fisioterapista, "45 + 24 min" (la forma breve di Allenamento). */
function gymDurationShort(d: SessionDuration): string {
  // Spazi indivisibili: "45 + 24 min" non va a capo a metà.
  return d.physio ? `${d.own}\u00a0+\u00a0${d.physio}\u00a0min` : fmtMinutes(d.own);
}

function gymItem(day: ScheduleDay | undefined, state: Pick<TimelineState, 'physio' | 'workoutLogs'>): TimelineItem | null {
  if (!day?.gymSessionId) return null;
  const id = day.gymSessionId;
  const session = SESSIONS[id];
  const d = gymDuration(id, state);
  return {
    id: `palestra:${id}`,
    time: day.gymTime ?? DEFAULT_GYM_TIME,
    kind: 'palestra',
    title: session?.name ?? `Seduta ${id}`,
    detail: [day.gymOptional ? 'Facoltativa' : '', session?.subtitle ?? '', d ? gymDurationShort(d) : fmtMinutes(55)].filter(Boolean).join(' · '),
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

  // Integratori, raggruppati per momento (senza quelli che non hanno ancora una dose).
  const active = takenSupplements(plan);
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
  const gym = gymItem(day, state);
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
      time: physioTime(day, plan, mins, day.gymSessionId ? gymTotalMin(day.gymSessionId, state) : undefined),
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
    detail: 'In carica fuori dalla camera',
  });
  items.push({
    id: 'letto',
    time: bed,
    kind: 'letto',
    title: 'A letto',
    detail: `Sveglia alle ${wake} · ${timeInBedLabel(bed, wake)}`,
  });

  return sortTimeline(items, plan);
}

/** Orario degli esercizi del fisioterapista: dopo pranzo, oppure dopo la palestra se si sovrappongono. */
export function physioTime(day: ScheduleDay | undefined, plan: Pick<Plan, 'mealTimes' | 'sleep'>, mins = 15, gymMin?: number): HHMM {
  const schedule = mealSchedule(day, plan);
  let at = dayMinutes(schedule.pranzo.time, plan) + PHYSIO_AFTER_LUNCH_MIN;
  if (day?.gymSessionId) {
    const start = dayMinutes(day.gymTime ?? DEFAULT_GYM_TIME, plan);
    const end = start + (gymMin ?? SESSIONS[day.gymSessionId]?.estMin ?? 55);
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

/** Configurazione rimasta da completare: fuori dalla timeline, senza orario, non conta nella giornata. */
export type SetupTask = { kind: 'fisio' } | { kind: 'dose'; names: string[] };

/**
 * Cosa resta da completare oggi, una cosa alla volta: prima gli esercizi del fisioterapista (nei giorni con il
 * fisioterapista, finché non sono inseriti), poi la dose di un integratore (il lunedì e il giorno del primo
 * avvio). Nella giornata minima niente: bastano le quattro cose.
 */
export function setupTask(iso: ISODate, state: TimelineState): SetupTask | null {
  if (state.dayLogs[iso]?.minimal) return null;
  if (physioSetupDue(iso, state)) return { kind: 'fisio' };
  const dose = supplementDoseDue(iso, state);
  return dose ? { kind: 'dose', names: dose.names } : null;
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

export interface StarterShopping {
  /** Giorno e orario della spesa di avvio. */
  date: ISODate;
  time: HHMM;
  /** Settimana della lista (lunedì) e, se il primo avvio è a metà settimana, il giorno da cui parte. */
  weekStart: ISODate;
  fromDate?: ISODate;
}

/**
 * Finestre occupate di una giornata, in minuti dalla mezzanotte: la palestra (da 15 minuti prima a 30 minuti dopo
 * la fine), il calcio dalla merenda pre-calcio alla fine, gli esercizi del fisioterapista se ci sono.
 */
function busyWindows(
  day: ScheduleDay | undefined,
  plan: Pick<Plan, 'mealTimes'> & Partial<Pick<Plan, 'sleep'>>,
  state: Pick<TimelineState, 'physio' | 'workoutLogs'>,
): [number, number][] {
  if (!day) return [];
  const out: [number, number][] = [];
  const gymMin = day.gymSessionId ? gymTotalMin(day.gymSessionId, state) : undefined;
  if (day.gymSessionId) {
    const start = hhmmToMin(day.gymTime ?? DEFAULT_GYM_TIME);
    out.push([start - GYM_LEAD_MIN, start + (gymMin ?? 55) + GYM_AFTER_MIN]);
  }
  if (day.football) {
    const start = hhmmToMin(day.football.time);
    const pre = plan.sleep && isEveningFootball(day) ? hhmmToMin(mealSchedule(day, { mealTimes: plan.mealTimes, sleep: plan.sleep }).merenda.time) : start - PRE_FOOTBALL_MIN_GAP_MIN;
    out.push([Math.min(pre, start - PRE_FOOTBALL_MIN_GAP_MIN), start + Math.max(0, day.football.durationMin)]);
  }
  const mins = physioMinutes(state.physio);
  if (day.physio && mins > 0 && plan.sleep) {
    const at = hhmmToMin(physioTime(day, { mealTimes: plan.mealTimes, sleep: plan.sleep }, mins, gymMin));
    out.push([at, at + mins]);
  }
  return out;
}

/**
 * Spesa di avvio: chi comincia non ha ancora fatto la spesa del sabato. Il primo giorno feriale dal primo
 * avvio con il tempo per farla (un'ora dopo il pranzo, mezz'ora dopo l'avvio, entro le 19:30; chi comincia di
 * domenica la fa il lunedì) compra i pasti dei giorni di avvio, quelli senza preparazione. Chi comincia di
 * sabato, o il venerdì sera, ha già la spesa del sabato. Null senza `Plan.firstUse`.
 * La spesa non si sovrappone a palestra, calcio (merenda pre-calcio compresa) ed esercizi del fisioterapista:
 * si fa prima della seduta se mancano almeno 60 minuti, altrimenti dopo; se fino alle 19:30 non c'è posto, il
 * giorno dopo. Con `state` la palestra dura come in Allenamento (fase di ingresso e blocco del fisioterapista).
 */
export function starterShopping(
  plan: Pick<Plan, 'startDate' | 'mealTimes'> & Partial<Pick<Plan, 'week' | 'sleep'>>,
  state: Pick<TimelineState, 'physio' | 'workoutLogs'> = {},
): StarterShopping | null {
  const first = firstUseOf(plan);
  if (!first) return null;
  const after = round5(hhmmToMin(plan.mealTimes.pranzo) + STARTER_SHOPPING_AFTER_LUNCH_MIN, true);
  const latest = hhmmToMin(STARTER_SHOPPING_LATEST);
  /** Primo orario libero da `from` alle 19:30, a passi di 5 minuti; null se la giornata è piena. */
  const freeFrom = (iso: ISODate, from: number): number | null => {
    const wd = weekdayOf(iso);
    const busy = busyWindows(plan.week?.find((d) => d.weekday === wd), plan, state);
    for (let m = from; m <= latest; m += 5) {
      if (!busy.some(([a, b]) => m < b && m + STARTER_SHOPPING_DURATION_MIN > a)) return m;
    }
    return null;
  };
  let date = first.date;
  let at = weekdayOf(date) === 6 ? null : freeFrom(date, Math.max(after, round5(hhmmToMin(first.time) + STARTER_SHOPPING_AFTER_START_MIN, true)));
  if (at === null) {
    date = addDays(date, 1);
    at = freeFrom(date, after) ?? after;
  }
  if (weekdayOf(date) >= 5) return null;
  const monday = weekStart(date);
  const fromDate = weekStart(first.date) === monday && first.date !== monday ? first.date : undefined;
  return { date, time: minToHHMM(at), weekStart: monday, ...(fromDate ? { fromDate } : {}) };
}

/**
 * Spesa il sabato, preparazione e revisione la domenica, con orari che non si sovrappongono al resto.
 * Primi giorni: la spesa di avvio; niente revisione prima della prima settimana da rivedere
 * (`firstReviewWeek`) e niente preparazione se anche la settimana dopo è di avvio.
 */
export function ritualItems(iso: ISODate, state: TimelineState): DayItem[] {
  const { plan } = state;
  if (state.dayLogs[iso]?.minimal) return [];
  const wd = weekdayOf(iso);
  const day = plan.week.find((d) => d.weekday === wd) ?? plan.week[wd];
  const out: DayItem[] = [];

  const starter = starterShopping(plan, state);
  if (starter && starter.date === iso) {
    const n = shoppingList(starter.weekStart, state, starter.fromDate ? { fromDate: starter.fromDate } : {}).items.length;
    out.push({
      id: STARTER_SHOPPING_ID,
      time: starter.time,
      kind: 'spesa',
      title: 'Spesa di avvio',
      // Il numero basta: la voce apre la lista.
      detail: n ? plural(n, 'prodotto', 'prodotti') : 'Lista pronta in Settimana',
    });
  }

  if (wd === 5) {
    // Dopo la seduta del sabato mattina, se c'è e si sovrappone.
    let at = hhmmToMin(SHOPPING_TIME);
    if (day?.gymSessionId) {
      const start = hhmmToMin(day.gymTime ?? DEFAULT_GYM_TIME);
      const end = start + gymTotalMin(day.gymSessionId, state);
      if (at < end + 10 && at + 60 > start) at = round5(end + 15, true);
    }
    // Chi comincia il sabato fa la spesa dopo il primo avvio, non prima: è la sua prima spesa.
    const first = firstUseOf(plan);
    if (first?.date === iso) at = Math.max(at, round5(hhmmToMin(first.time) + STARTER_SHOPPING_AFTER_START_MIN, true));
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
    const prepDue = !isStarterDay(addDays(iso, 1), plan);
    if (prep.tasks.length && prepDue) {
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
    // La revisione c'è solo per una settimana da rivedere: chi comincia di sabato o di domenica, o con il
    // piano che parte il lunedì dopo, la fa la domenica successiva.
    if (isReviewableWeek(weekStart(iso), plan)) {
      out.push({
        id: 'rito:revisione',
        time: REVIEW_TIME,
        kind: 'revisione',
        title: 'Revisione della settimana',
        detail: 'Voti, numeri e correzioni del piano',
      });
    }
  }
  return out;
}

/**
 * Voci della giornata come le mostra Oggi: la timeline più i riti del fine settimana. Nei giorni di avvio i
 * pasti prima della prima spesa diventano "con quello che hai in casa" (`preShopping`).
 */
export function buildDay(iso: ISODate, state: TimelineState): DayItem[] {
  const base: DayItem[] = buildTimeline(iso, state);
  const rituals = ritualItems(iso, state);
  const items = rituals.length ? sortTimeline([...base, ...rituals], state.plan) : base;
  return markPreShopping(iso, items, state);
}

// ───────────────────────── Prima della spesa ─────────────────────────

/** Dettaglio dei pasti prima della prima spesa: cosa mettere nel piatto, senza la ricetta. */
export const PRE_SHOPPING_DETAIL = 'Con quello che hai: proteine, un carboidrato, frutta o verdura';

export interface FirstShopping {
  /** Voce della spesa (`rito:spesa-avvio` o la spesa del sabato). */
  id: string;
  date: ISODate;
  time: HHMM;
}

/**
 * La prima spesa dopo il primo avvio: quella di avvio, oppure, per chi comincia il venerdì sera o il sabato,
 * la spesa del sabato (con lo stesso orario di `ritualItems`). Null senza `Plan.firstUse`.
 */
export function firstShopping(state: TimelineState): FirstShopping | null {
  const { plan } = state;
  const first = firstUseOf(plan);
  if (!first) return null;
  const starter = starterShopping(plan, state);
  if (starter) return { id: STARTER_SHOPPING_ID, date: starter.date, time: starter.time };
  const sat = weekdayOf(first.date) === 5 ? first.date : weekdayOf(first.date) === 4 ? addDays(first.date, 1) : null;
  if (!sat) return null;
  const spesa = ritualItems(sat, state).find((i) => i.id === 'rito:spesa');
  return spesa ? { id: spesa.id, date: sat, time: spesa.time } : null;
}

/**
 * Pasti del fine settimana da aggiungere alla lista della settimana di `monday`: chi comincia il venerdì sera o il
 * sabato non ha la spesa di avvio, e la spesa del sabato porta anche i pasti di avvio da dopo la spesa alla
 * domenica. I pasti del sabato prima della spesa restano fuori (si fanno con quello che c'è in casa). Undefined
 * per tutte le altre settimane.
 */
export function shoppingLeadFor(monday: ISODate, state: TimelineState): ShoppingLead | undefined {
  const { plan } = state;
  if (starterShopping(plan, state)) return undefined;
  const shop = firstShopping(state);
  if (!shop || shop.id !== 'rito:spesa' || addDays(shop.date, 2) !== monday) return undefined;
  const wd = weekdayOf(shop.date);
  const day = plan.week.find((d) => d.weekday === wd) ?? plan.week[wd];
  const schedule = mealSchedule(day, plan);
  const limit = dayMinutes(shop.time, plan);
  const skipSlots = MEAL_SLOTS.filter((slot) => dayMinutes(schedule[slot].time, plan) < limit);
  return { date: shop.date, ...(skipSlots.length ? { skipSlots } : {}) };
}

/** Opzioni della lista della spesa di una settimana come la vede l'utente (la settimana del primo avvio, il fine settimana prima). */
export function shoppingOptionsFor(monday: ISODate, state: TimelineState): ShoppingOptions {
  const lead = shoppingLeadFor(monday, state);
  return lead ? { lead } : {};
}

/** La prima spesa risulta fatta (segnata nel diario o con la lista spuntata)? */
function shoppingDone(shop: FirstShopping, state: TimelineState): boolean {
  const st = state.dayLogs[shop.date]?.status?.[shop.id];
  if (st) return st === 'fatto' || st === 'sostituito';
  const item: DayItem = { id: shop.id, time: shop.time, kind: 'spesa', title: '' };
  return derivedStatus(shop.date, state, item) === 'fatto';
}

/**
 * Segna i pasti dei giorni di avvio che vengono prima della prima spesa: dal primo avvio fino all'orario
 * della spesa. Restano fuori i pasti con una ricetta scelta a mano (chi la sceglie ha gli ingredienti), la
 * giornata minima e tutto quanto, se la spesa è già fatta.
 */
function markPreShopping(iso: ISODate, items: DayItem[], state: TimelineState): DayItem[] {
  const { plan } = state;
  const first = firstUseOf(plan);
  // La prima spesa arriva al più tardi il giorno dopo il primo avvio (domenica sera → lunedì).
  if (!first || iso < first.date || daysBetween(first.date, iso) > 2 || state.dayLogs[iso]?.minimal) return items;
  const shop = firstShopping(state);
  if (!shop || iso > shop.date) return items;
  if (shoppingDone(shop, state)) return items;
  const limit = iso === shop.date ? dayMinutes(shop.time, plan) : Number.POSITIVE_INFINITY;
  const swaps = state.dayLogs[iso]?.recipeSwaps ?? {};
  let changed = false;
  const out = items.map((it) => {
    if (it.kind !== 'pasto' || dayMinutes(it.time, plan) >= limit || (it.slot && swaps[it.slot])) return it;
    changed = true;
    return { ...it, detail: PRE_SHOPPING_DETAIL, preShopping: true };
  });
  return changed ? out : items;
}

// ───────────────────────── Primo avvio ─────────────────────────

/** Primo avvio salvato nel piano, se c'è e se è valido. */
export function firstUseOf(plan: Pick<Plan, 'startDate'>): FirstUse | null {
  const f = (plan as { firstUse?: unknown }).firstUse;
  if (!f || typeof f !== 'object') return null;
  const { date, time } = f as Partial<FirstUse>;
  return isISODate(date) && isHHMM(time) ? { date, time } : null;
}

// ───────────────────────── Prima revisione ─────────────────────────

/** Giorni con Ritmo (dal primo avvio alla domenica, compresi) che servono per rivedere la prima settimana. */
export const MIN_FIRST_WEEK_DAYS = 3;

/**
 * Lunedì della prima settimana da rivedere. È quella del primo avvio (`Plan.firstUse`) se fino alla domenica
 * restano almeno 3 giorni; chi comincia il sabato o la domenica rivede la settimana dopo, la prima vissuta
 * davvero con il piano. Mai prima della settimana di inizio del piano. Null senza inizio né primo avvio.
 */
export function firstReviewWeek(plan: Pick<Plan, 'startDate'>): ISODate | null {
  let ws: ISODate | null = plan.startDate && isISODate(plan.startDate) ? weekStart(plan.startDate) : null;
  const first = firstUseOf(plan);
  if (first) {
    const fw = weekStart(first.date);
    const left = daysBetween(first.date, addDays(fw, 6)) + 1;
    const own = left >= MIN_FIRST_WEEK_DAYS ? fw : addDays(fw, 7);
    if (!ws || own > ws) ws = own;
  }
  return ws;
}

/** La settimana che parte dal lunedì `monday` si può rivedere: non viene prima della prima settimana da rivedere. */
export function isReviewableWeek(monday: ISODate, plan: Pick<Plan, 'startDate'>): boolean {
  const first = firstReviewWeek(plan);
  return !first || weekStart(monday) >= first;
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
      // Senza spunte niente lista da calcolare: la settimana si ricava senza costruirla.
      const checked = state.shoppingChecked?.[shoppingWeek(iso, state, item).weekStart];
      if (!checked?.length) return undefined;
      const target = shoppingTarget(iso, state, item);
      const set = new Set(checked);
      const done = target ? target.keys.filter((k) => set.has(k)).length : 0;
      return target && target.keys.length > 0 && done / target.keys.length >= SHOPPING_DONE_RATIO - 1e-9 ? 'fatto' : undefined;
    }
    default:
      return undefined;
  }
}

export interface ShoppingTarget {
  /** Settimana delle spunte (`shoppingChecked[weekStart]`). */
  weekStart: ISODate;
  /** Chiavi delle voci da comprare, come le spunta Settimana. */
  keys: string[];
}

/**
 * La lista dietro una voce della spesa: la settimana delle spunte e le chiavi da comprare, con le stesse opzioni
 * di Settimana (la spesa di avvio da `starterShopping`, quella del sabato con `shoppingOptionsFor`). Serve a
 * `derivedStatus` e a Oggi, che segnando la spesa fatta spunta anche la lista. Null per le altre voci.
 */
export function shoppingTarget(iso: ISODate, state: TimelineState, item: Pick<DayItem, 'id' | 'kind'>): ShoppingTarget | null {
  if (item.kind !== 'spesa') return null;
  const { weekStart: monday, starter } = shoppingWeek(iso, state, item);
  const opts = starter ? (starter.fromDate ? { fromDate: starter.fromDate } : {}) : shoppingOptionsFor(monday, state);
  return { weekStart: monday, keys: shoppingList(monday, state, opts).items.map((i) => i.key) };
}

/** Settimana della lista di una voce della spesa: quella della spesa di avvio, altrimenti la settimana dopo. */
function shoppingWeek(iso: ISODate, state: TimelineState, item: Pick<DayItem, 'id'>): { weekStart: ISODate; starter: StarterShopping | null } {
  const starter = item.id === STARTER_SHOPPING_ID ? starterShopping(state.plan, state) : null;
  return { weekStart: starter ? starter.weekStart : addDays(weekStart(iso), 7), starter };
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

/**
 * Quante voci ancora da segnare fatte servono per la giornata riuscita: 0 se è già riuscita, null se non ci
 * si arriva più con le voci rimaste. In giornata minima servono tutte e 4 le voci fatte.
 */
export function itemsToSuccess(summary: AdherenceSummary): number | null {
  if (summary.total === 0) return null;
  if (isSuccessful(summary)) return 0;
  if (summary.minimal) {
    const need = summary.total - summary.done;
    return need <= summary.pending ? need : null;
  }
  const need = Math.max(0, Math.ceil(SUCCESS_THRESHOLD * summary.total - (summary.done + summary.replaced * 0.5) - 1e-9));
  return need <= summary.pending ? need : null;
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
