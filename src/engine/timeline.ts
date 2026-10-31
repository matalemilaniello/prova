/**
 * Timeline della giornata: le voci da eseguire e segnare, in ordine di orario.
 *
 * Regole (SPEC §7):
 * - controllo del mattino 5 minuti dopo la sveglia, integratori con il pasto del loro momento, i 5 pasti,
 *   palestra (se prevista), calcio, esercizi del fisioterapista, coprifuoco del telefono, a letto;
 * - calcio serale (dalle 17:30): merenda pre-calcio circa 2 h 30 prima (mai a ridosso del pranzo né
 *   nell'ultima ora prima del calcio) e cena di recupero dopo il calcio; se il calcio finisce dopo le 21:30
 *   la cena diventa "Cena di recupero, leggera e veloce";
 * - calcio di giorno: un pasto che cadrebbe durante il calcio si sposta subito dopo;
 * - giornata minima: solo 4 voci `minima:*`;
 * - gli orari dopo la mezzanotte (a letto alle 00:30) restano in fondo alla giornata.
 *
 * Aderenza: fatto = 1, sostituito = 0,5, saltato o non segnato = 0, su tutte le voci tranne `letto`.
 * Giornata riuscita: aderenza ≥ 70%; in giornata minima servono tutte e 4 le voci fatte.
 *
 * Gli id sono stabili per data ('pasto:pranzo', 'palestra:A', 'calcio:partita', 'minima:frutto'):
 * il diario (`DayLog.status`) li usa come chiavi.
 */
import type {
  AppData,
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
import { addDays, daysBetween, hhmmToMin, minToHHMM, weekdayOf } from './dates';
import { MEAL_SLOTS, mealsForDate } from './menu';
import { bedtimeFor, curfewFor, sleepHours } from './sleep';

/** Lo stato che serve alla timeline. I registri (controlli, sedute, calcio) sono facoltativi. */
export type TimelineState = Pick<AppData, 'plan' | 'dayLogs'> &
  Partial<Pick<AppData, 'physio' | 'checkIns' | 'workoutLogs' | 'footballLogs'>>;

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
/** Se il calcio finisce dopo quest'ora la cena di recupero è leggera e veloce. */
export const LATE_FOOTBALL_END: HHMM = '21:30';
/** Orario degli esercizi del fisioterapista: 75 minuti dopo il pranzo, a casa. */
export const PHYSIO_AFTER_LUNCH_MIN = 75;
/** Orario della palestra quando il piano non lo indica. */
export const DEFAULT_GYM_TIME: HHMM = '17:00';
/** Soglia di aderenza per una giornata riuscita. */
export const SUCCESS_THRESHOLD = 0.7;

/** Voci della giornata minima, nell'ordine della specifica. */
export const MINIMAL_IDS = ['minima:proteine', 'minima:frutto', 'minima:integratori', 'minima:telefono'] as const;

const DAY_MIN = 1440;

/** Ordine a parità di orario: la colazione prima degli integratori, il coprifuoco prima del letto. */
const KIND_ORDER: Record<TimelineKind, number> = {
  controllo: 0,
  pasto: 1,
  integratori: 2,
  minima: 3,
  fisio: 4,
  palestra: 5,
  calcio: 6,
  coprifuoco: 7,
  letto: 8,
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

/**
 * Inizio della "giornata" in minuti: gli orari prima di quest'ora appartengono alla notte
 * della giornata precedente (a letto alle 00:30). 90 minuti prima della sveglia, tra le 03:00 e le 10:00.
 */
export function dayCutoffMin(plan: Pick<Plan, 'sleep'>): number {
  const wake = hhmmToMin(plan.sleep.wake);
  return Math.min(600, Math.max(180, wake - 90));
}

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
    out.cena = { time: minToHHMM(recovery), title: late ? 'Cena di recupero, leggera e veloce' : 'Cena di recupero' };
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
  return items.sort((a, b) => dayMinutes(a.time, plan) - dayMinutes(b.time, plan) || order(a.id) - order(b.id));
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
  let gymWindow: [number, number] | null = null;
  if (day?.gymSessionId) {
    const id = day.gymSessionId;
    const session = SESSIONS[id];
    const time = day.gymTime ?? DEFAULT_GYM_TIME;
    const est = session?.estMin ?? 55;
    gymWindow = [dayMinutes(time, plan), dayMinutes(time, plan) + est];
    items.push({
      id: `palestra:${id}`,
      time,
      kind: 'palestra',
      title: session?.name ?? `Seduta ${id}`,
      detail: [day.gymOptional ? 'Facoltativa' : '', session?.subtitle ?? '', fmtMinutes(est)].filter(Boolean).join(' · '),
      ref: id,
    });
  }

  // Calcio.
  if (day?.football) {
    const f = day.football;
    const end = minToHHMM(hhmmToMin(f.time) + f.durationMin);
    items.push({
      id: `calcio:${f.kind}`,
      time: f.time,
      kind: 'calcio',
      title: FOOTBALL_TITLE[f.kind],
      detail: `${fmtMinutes(f.durationMin)}, fine alle ${end}`,
      ref: f.kind,
    });
  }

  // Esercizi del fisioterapista: dopo pranzo, oppure dopo la palestra se si sovrappongono.
  if (day?.physio) {
    const mins = physioMinutes(state.physio);
    let at = dayMinutes(schedule.pranzo.time, plan) + PHYSIO_AFTER_LUNCH_MIN;
    if (gymWindow && at + Math.max(mins, 15) > gymWindow[0] && at < gymWindow[1]) at = gymWindow[1] + 15;
    const n = state.physio?.prescriptions.length ?? 0;
    items.push({
      id: 'fisio',
      time: minToHHMM(round5(at)),
      kind: 'fisio',
      title: 'Esercizi del fisioterapista',
      detail: n ? `${plural(n, 'esercizio', 'esercizi')} · ${fmtMinutes(mins)}` : 'Aggiungi gli esercizi nelle impostazioni',
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

/** Ordina per orario della giornata, poi per tipo di voce (stabile). */
export function sortTimeline(items: TimelineItem[], plan: Pick<Plan, 'sleep'>): TimelineItem[] {
  return items
    .map((it, i) => ({ it, i, m: dayMinutes(it.time, plan) }))
    .sort((a, b) => a.m - b.m || KIND_ORDER[a.it.kind] - KIND_ORDER[b.it.kind] || a.i - b.i)
    .map((x) => x.it);
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
  items: TimelineItem[] = buildTimeline(iso, state),
): Record<string, ItemStatus> {
  const out: Record<string, ItemStatus> = { ...(state.dayLogs[iso]?.status ?? {}) };
  for (const it of items) {
    if (out[it.id]) continue;
    const derived = derivedStatus(iso, state, it);
    if (derived) out[it.id] = derived;
  }
  return out;
}

/** Stato ricavato dai registri (controlli, sedute, calcio), indipendente dal diario. */
export function derivedStatus(iso: ISODate, state: TimelineState, item: TimelineItem): ItemStatus | undefined {
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
    default:
      return undefined;
  }
}

/** Da dove viene lo stato di una voce: dal diario, da un registro, o da nessuna parte. */
export function statusSource(iso: ISODate, state: TimelineState, item: TimelineItem): StatusSource | null {
  if (state.dayLogs[iso]?.status?.[item.id]) return 'diario';
  return derivedStatus(iso, state, item) ? 'registro' : null;
}

// ───────────────────────── Aderenza e serie ─────────────────────────

export interface AdherenceSummary {
  /** Voci che contano (tutte tranne `letto`). */
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
  items: TimelineItem[] = buildTimeline(iso, state),
  status: Record<string, ItemStatus> = effectiveStatus(iso, state, items),
): AdherenceSummary {
  let done = 0;
  let replaced = 0;
  let skipped = 0;
  let total = 0;
  for (const it of items) {
    if (it.kind === 'letto') continue;
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

/** Aderenza 0-1: fatto = 1, sostituito = 0,5, saltato o non segnato = 0, su tutte le voci tranne `letto`. */
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

export interface StreakInfo {
  /** Giornate riuscite consecutive. */
  days: number;
  /** True se oggi è già riuscita e conta nella serie. */
  includesToday: boolean;
}

/**
 * Serie di giornate riuscite fino a oggi. Oggi conta solo quando è già riuscita: finché è in corso
 * la serie parte da ieri e non si spezza. Non va prima dell'inizio del piano.
 */
export function streakInfo(state: TimelineState, today: ISODate, maxDays = 400): StreakInfo {
  const includesToday = daySuccessful(today, state);
  let days = includesToday ? 1 : 0;
  const start = state.plan.startDate;
  for (let i = 1; i <= maxDays; i++) {
    const d = addDays(today, -i);
    if (start && daysBetween(start, d) < 0) break;
    if (!daySuccessful(d, state)) break;
    days++;
  }
  return { days, includesToday };
}

/** Giornate riuscite consecutive fino a oggi (vedi `streakInfo`). */
export function streak(state: TimelineState, today: ISODate): number {
  return streakInfo(state, today).days;
}

// ───────────────────────── Adesso ─────────────────────────

export type NowState = 'adesso' | 'prossima' | 'in-ritardo';

export interface NowPick {
  item: TimelineItem;
  state: NowState;
  /** Minuti all'inizio della voce: positivo = tra quanto, negativo = da quanto. */
  deltaMin: number;
}

/** Quanto dura una voce, per capire se è "in corso". */
export function itemWindowMin(item: TimelineItem, plan: Pick<Plan, 'week' | 'sleep'>): number {
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
    default:
      return 20;
  }
}

/**
 * La voce da mostrare nella card "Adesso": quella in corso, altrimenti la prossima non segnata,
 * altrimenti l'ultima rimasta indietro. Null se non resta niente da segnare.
 */
export function pickNow(
  items: TimelineItem[],
  status: Record<string, ItemStatus>,
  now: HHMM,
  plan: Pick<Plan, 'sleep' | 'week'>,
  opts: { skip?: TimelineKind[] } = {},
): NowPick | null {
  const nowM = dayMinutes(now, plan);
  const pending = items.filter((it) => !status[it.id] && !opts.skip?.includes(it.kind));
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

/** Voci non segnate il cui orario (più la durata) è già passato. */
export function overdueItems(
  items: TimelineItem[],
  status: Record<string, ItemStatus>,
  now: HHMM,
  plan: Pick<Plan, 'sleep' | 'week'>,
): TimelineItem[] {
  const nowM = dayMinutes(now, plan);
  return items.filter((it) => !status[it.id] && it.kind !== 'letto' && dayMinutes(it.time, plan) + itemWindowMin(it, plan) <= nowM);
}

/** Minuti al coprifuoco del telefono (negativo se è già passato). */
export function minutesToCurfew(iso: ISODate, now: HHMM, plan: Plan): number {
  return dayMinutes(curfewFor(iso, plan), plan) - dayMinutes(now, plan);
}
