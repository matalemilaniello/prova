/**
 * Utilità della schermata Settimana: orari e titoli dei pasti, attività del giorno, etichette.
 * Gli orari dei pasti vengono dal motore della timeline se c'è (stessa logica della schermata Oggi),
 * altrimenti da un calcolo equivalente semplificato.
 */
import type { AppData, DayType, FootballKind, HHMM, ISODate, MealSlot, Plan, ScheduleDay } from '../../domain/types';
import { addDays, addMinutes, hhmmToMin, isISODate, minToHHMM, weekStart, weekdayOf } from '../../engine/dates';
import type { ShoppingLead } from '../../engine/shopping';
import { STARTER_FIBER_SHARE } from '../../data/menu';
import { FOOTBALL_LABEL, MEAL_SLOT_LABEL, WEEKDAY_LONG, WEEKDAY_SHORT, fmtNumber, listIt } from '../../lib/format';

interface MealSchedule {
  time: HHMM;
  title: string;
}

/** Lo stato che serve alle funzioni della timeline usate qui (i registri sono facoltativi). */
export type DayState = Pick<AppData, 'plan' | 'dayLogs'> & Partial<AppData>;

/**
 * Quello che decide l'orario della spesa di avvio oltre al piano: gli esercizi del fisioterapista e le sedute fatte
 * (la seduta dura come in Allenamento, con la fase di ingresso). Senza, giorno e orario possono non coincidere con Oggi.
 */
export type StarterShoppingState = Partial<Pick<AppData, 'physio' | 'workoutLogs'>>;

interface TimelineDayItem {
  id: string;
  time: HHMM;
  kind: string;
  title: string;
  slot?: MealSlot;
  preShopping?: boolean;
}

type TimelineModule = {
  mealSchedule?: (day: ScheduleDay | undefined, plan: Pick<Plan, 'mealTimes' | 'sleep'>) => Record<MealSlot, MealSchedule>;
  daySuccessful?: (iso: ISODate, state: AppData) => boolean;
  starterShopping?: (plan: Pick<Plan, 'startDate' | 'mealTimes'>, state?: StarterShoppingState) => { date: ISODate; time: HHMM } | null;
  firstShopping?: (state: DayState) => { id: string; date: ISODate; time: HHMM } | null;
  buildDay?: (iso: ISODate, state: DayState) => TimelineDayItem[];
  derivedStatus?: (iso: ISODate, state: DayState, item: TimelineDayItem) => string | undefined;
  shoppingLeadFor?: (monday: ISODate, state: DayState) => ShoppingLead | undefined;
};
const timelineModules = import.meta.glob<TimelineModule>('../../engine/timeline.ts', { eager: true });
const timeline: TimelineModule = Object.values(timelineModules)[0] ?? {};

const PRE_TITLE: Record<FootballKind, string> = {
  partita: 'Merenda pre-partita',
  calcetto: 'Merenda pre-calcetto',
  allenamento: 'Merenda pre-allenamento',
};

/** Orario e titolo dei 5 pasti del giorno, con merenda pre-calcio e cena di recupero. */
export function mealScheduleFor(date: ISODate, plan: Plan): Record<MealSlot, MealSchedule> {
  const day = plan.week.find((d) => d.weekday === weekdayOf(date)) ?? plan.week[weekdayOf(date)];
  try {
    const fromTimeline = timeline.mealSchedule?.(day, plan);
    if (fromTimeline) return fromTimeline;
  } catch {
    /* ripiego qui sotto */
  }
  const t = plan.mealTimes;
  const out = {
    colazione: { time: t.colazione, title: MEAL_SLOT_LABEL.colazione },
    spuntino: { time: t.spuntino, title: MEAL_SLOT_LABEL.spuntino },
    pranzo: { time: t.pranzo, title: MEAL_SLOT_LABEL.pranzo },
    merenda: { time: t.merenda, title: MEAL_SLOT_LABEL.merenda },
    cena: { time: t.cena, title: MEAL_SLOT_LABEL.cena },
  };
  const f = day?.football;
  if (f && hhmmToMin(f.time) >= hhmmToMin('17:30')) {
    out.merenda = { time: addMinutes(f.time, -150), title: PRE_TITLE[f.kind] };
    const end = hhmmToMin(f.time) + f.durationMin;
    out.cena = { time: minToHHMM(Math.ceil((end + 30) / 5) * 5), title: 'Cena di recupero' };
  }
  return out;
}

/** True se la giornata passata è riuscita (se il motore della timeline è disponibile). */
export function daySuccessfulSafe(date: ISODate, state: AppData): boolean | undefined {
  try {
    return timeline.daySuccessful?.(date, state);
  } catch {
    return undefined;
  }
}

export type ActivityKind = 'calcio' | 'palestra' | 'fisio';

export interface DayActivity {
  kind: ActivityKind;
  /** "Partita 21:00", "Seduta A 17:00", "Fisioterapista". */
  label: string;
  /** Etichetta breve per spazi stretti. */
  short: string;
  optional?: boolean;
}

/**
 * Attività previste nel giorno della settimana tipo. Gli esercizi del fisioterapista compaiono solo se l'utente
 * li ha inseriti (`hasPhysio`): senza esercizi il giorno "fisio" non ha niente da fare.
 */
export function dayActivities(day: ScheduleDay | undefined, hasPhysio = true): DayActivity[] {
  if (!day) return [];
  const out: DayActivity[] = [];
  if (day.football) {
    out.push({ kind: 'calcio', label: `${FOOTBALL_LABEL[day.football.kind]} ${day.football.time}`, short: FOOTBALL_LABEL[day.football.kind] });
  }
  if (day.gymSessionId) {
    out.push({
      kind: 'palestra',
      label: `Seduta ${day.gymSessionId}${day.gymTime ? ` ${day.gymTime}` : ''}${day.gymOptional ? ', facoltativa' : ''}`,
      short: `Seduta ${day.gymSessionId}`,
      optional: day.gymOptional,
    });
  }
  if (day.physio && hasPhysio) out.push({ kind: 'fisio', label: 'Esercizi del fisio', short: 'Fisio' });
  return out;
}

/** "Questa settimana", "La prossima settimana", "Tra 2 settimane", "La settimana scorsa", "3 settimane fa". */
export function relativeWeekLabel(offset: number): string {
  if (offset === 0) return 'Questa settimana';
  if (offset === 1) return 'La prossima settimana';
  if (offset === -1) return 'La settimana scorsa';
  if (offset > 1) return `Tra ${offset} settimane`;
  return `${-offset} settimane fa`;
}

/** Giorni in cui serve un prodotto: "lun, mer e ven", "tutti i giorni", "6 giorni". */
export function daysText(days: ISODate[]): string {
  if (days.length >= 7) return 'tutti i giorni';
  if (days.length >= 5) return `${days.length} giorni`;
  return listIt(days.map((d) => WEEKDAY_SHORT[weekdayOf(d)]));
}

/** "1 pasto", "3 pasti". */
export function mealsText(n: number): string {
  return n === 1 ? '1 pasto' : `${n} pasti`;
}

/**
 * Due "fuochi" in parallelo: tempo stimato facendo due cose insieme (assegnazione al fornello più libero,
 * partendo dalle attività più lunghe).
 */
export function parallelMinutes(minutes: number[], lanes = 2): number {
  const load = Array.from({ length: lanes }, () => 0);
  for (const m of [...minutes].sort((a, b) => b - a)) {
    let i = 0;
    for (let j = 1; j < lanes; j++) if (load[j] < load[i]) i = j;
    load[i] += m;
  }
  return Math.max(0, ...load);
}

/** Giorno del primo avvio (campo facoltativo `Plan.firstUse`, scritto alla fine del benvenuto), se valido. */
export function firstUseDate(plan: Plan): ISODate | undefined {
  const f = (plan as { firstUse?: { date?: unknown } }).firstUse;
  return f && isISODate(f.date) ? f.date : undefined;
}

/**
 * Primo giorno da comprare per la settimana che inizia `monday`: il giorno del primo avvio se cade dopo il
 * lunedì di quella settimana (chi inizia a metà settimana non compra per i giorni passati), altrimenti nessuno.
 */
export function shoppingFromDate(plan: Plan, monday: ISODate): ISODate | undefined {
  const first = firstUseDate(plan);
  if (!first || weekStart(first) !== monday || first === monday) return undefined;
  return first;
}

/**
 * Settimana senza preparazione da fare: la settimana di avvio. Chi ha iniziato dopo la domenica che la precede
 * (o la domenica sera stessa, quando anche quella settimana è di avvio) non ha preparato nulla e non deve
 * recuperare: fino al lunedì dopo si cucina sul momento.
 */
export function prepSkipped(plan: Plan, weekStartIso: ISODate, starterMonday: boolean): boolean {
  const first = firstUseDate(plan);
  if (!first) return false;
  const prepDay = addDays(weekStartIso, -1);
  return first <= addDays(weekStartIso, 6) && (first > prepDay || starterMonday);
}

/** Sabato o domenica: la spesa e la preparazione guardano alla settimana che inizia lunedì. */
export function isWeekend(iso: ISODate): boolean {
  return weekdayOf(iso) >= 5;
}

/** "da mercoledì a domenica", "da lunedì a domenica". */
export function dateSpanText(dates: ISODate[]): string {
  if (!dates.length) return '';
  const a = WEEKDAY_LONG[weekdayOf(dates[0])];
  const b = WEEKDAY_LONG[weekdayOf(dates[dates.length - 1])];
  return dates.length === 1 ? `solo ${a}` : `da ${a} a ${b}`;
}

export function dayTypePhrase(t: DayType): string {
  return t === 'calcio' ? 'di calcio' : t === 'palestra' ? 'di palestra' : t === 'leggero' ? 'leggero' : 'di riposo';
}

/** Le righe che seguono il tipo di giorno (`carbScaled`: pasta, riso, pane, avena, patate, gallette), dette in breve. */
export const SCALED_FOODS_LABEL = 'Pasta, riso e pane';

/**
 * Di quanto cambiano le porzioni di pasta, riso e pane rispetto alla ricetta, e perché: "Pasta, riso e pane +25% per
 * un giorno di calcio". La percentuale è delle righe che si adattano, non dei carboidrati del giorno: alla vigilia le
 * righe crescono del 65% ma il totale passa da 385 a 425 g, il 10% in più. Per questo non si scrive "Carboidrati +65%".
 * Il fattore comprende il tipo di giorno e la scala del piano; il riferimento delle ricette è il giorno di palestra,
 * dove la differenza viene solo dagli obiettivi del piano. Con `floorGPerKg` (partita e vigilia, quando il minimo per
 * kg alza davvero le porzioni) il motivo è il minimo: "Pasta, riso e pane +65% per arrivare a 6 g di carboidrati per kg".
 * Con `foods` (la ricetta: i nomi delle righe che si adattano, al massimo tre) la frase nomina proprio quelle: "Riso
 * basmati +65% per arrivare a 6 g di carboidrati per kg".
 */
export function portionShort(
  dayType: DayType,
  factor: number,
  matchEve = false,
  floorGPerKg?: number,
  foods?: readonly string[],
): { lead: string; pct: string; tail: string } | null {
  const pct = Math.round(Math.abs(factor - 1) * 100);
  if (!pct) return null;
  const who =
    floorGPerKg && factor > 1
      ? `per arrivare a ${fmtNumber(floorGPerKg)} g di carboidrati per kg`
      : matchEve
        ? 'per la vigilia della partita'
        : dayType === 'palestra'
          ? 'per i tuoi obiettivi'
          : `per un giorno ${dayTypePhrase(dayType)}`;
  const named = foods && foods.length > 0 && foods.length <= 3 ? listIt(foods.map((f, i) => (i === 0 ? f : lowerFirst(f)))) : null;
  return { lead: `${named ?? SCALED_FOODS_LABEL} `, pct: `${factor > 1 ? '+' : '−'}${fmtNumber(pct)}%`, tail: ` ${who}.` };
}

/**
 * Giorno e orario della spesa di avvio (la voce di Oggi), se il motore della timeline la prevede. Passa gli esercizi
 * del fisioterapista e le sedute: la spesa non si sovrappone alla seduta né agli esercizi, come in Oggi.
 */
export function starterShoppingSafe(plan: Plan, state: StarterShoppingState = {}): { date: ISODate; time: HHMM } | null {
  try {
    return timeline.starterShopping?.(plan, state) ?? null;
  } catch {
    return null;
  }
}

/**
 * Giorno della spesa per la lista della settimana di `monday` quando non è il sabato prima: la spesa di avvio, se
 * cade in quella settimana. Da lì si contano i giorni in cui il fresco regge in frigo. Undefined altrimenti (la
 * lista usa il sabato della prima spesa o il sabato prima del lunedì).
 */
export function shoppingDateFor(plan: Plan, monday: ISODate, state: StarterShoppingState = {}): ISODate | undefined {
  const s = starterShoppingSafe(plan, state);
  return s && weekStart(s.date) === monday ? s.date : undefined;
}

export interface FirstShoppingInfo {
  /** Voce della spesa in Oggi (`rito:spesa-avvio` o la spesa del sabato). */
  id: string;
  date: ISODate;
  time: HHMM;
  /** Segnata nel diario o con la lista spuntata (come la conta Oggi). */
  done: boolean;
}

/**
 * La prima spesa dopo il primo avvio, come la vede Oggi (`firstShopping` della timeline: la spesa di avvio,
 * oppure quella del sabato per chi comincia venerdì sera o sabato), con lo stato. Null senza primo avvio.
 */
export function firstShoppingSafe(state: DayState): FirstShoppingInfo | null {
  try {
    const shop =
      timeline.firstShopping?.(state) ??
      (() => {
        const s = starterShoppingSafe(state.plan, state);
        return s ? { id: 'rito:spesa-avvio', date: s.date, time: s.time } : null;
      })();
    if (!shop) return null;
    const marked = state.dayLogs[shop.date]?.status?.[shop.id];
    const derived = marked ? undefined : timeline.derivedStatus?.(shop.date, state, { id: shop.id, time: shop.time, kind: 'spesa', title: '' });
    const done = marked ? marked === 'fatto' || marked === 'sostituito' : derived === 'fatto';
    return { ...shop, done };
  } catch {
    return null;
  }
}

/**
 * Pasti del fine settimana da comprare con la lista della settimana di `monday` (chi comincia il venerdì sera o il
 * sabato: la spesa del sabato porta anche i pasti di avvio fino alla domenica). Undefined per le altre settimane.
 */
export function shoppingLeadSafe(monday: ISODate, state: DayState): ShoppingLead | undefined {
  try {
    return timeline.shoppingLeadFor?.(monday, state);
  } catch {
    return undefined;
  }
}

/**
 * Pasti del giorno che vengono prima della prima spesa: gli ingredienti non ci sono ancora e Oggi li propone
 * "con quello che hai" (`preShopping` di `buildDay`). Stesso criterio di Oggi, così le due schermate coincidono.
 */
export function preShoppingSlots(date: ISODate, state: DayState): Set<MealSlot> {
  const out = new Set<MealSlot>();
  try {
    for (const it of timeline.buildDay?.(date, state) ?? []) if (it.preShopping && it.slot) out.add(it.slot);
  } catch {
    /* timeline non disponibile: nessuna pillola */
  }
  return out;
}

/** Abbassa solo l'iniziale, e solo se la seconda lettera è minuscola: "Aceto balsamico di Modena" → "aceto balsamico di Modena". */
export function lowerFirst(s: string): string {
  return s.length > 1 && s.charAt(1) === s.charAt(1).toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

// ───────────────────────── Giudizio del giorno ─────────────────────────

export interface Verdict {
  good: boolean;
  text: string;
}

const MACRO_TOLERANCE = 0.15;
const PROTEIN_MAX_EXCESS = 0.25;
/** Grassi: fino a 15 g sotto l'obiettivo vanno bene (o il 15%, se è di più), come nel controllo del menù. */
const FAT_SLACK_G = 15;
/** Fibre: fino a 5 g sotto il riferimento vanno bene, come per la proposta della revisione. */
const FIBER_SLACK_G = 5;

/**
 * Riferimento delle fibre per il giorno: l'obiettivo, oppure nei giorni di avvio la quota che il menù di avvio porta
 * di proposito (`STARTER_FIBER_SHARE`, circa 28 g su 35), perché le fibre salgono per gradi.
 */
export function fiberReferenceG(targetFiberG: number, starter: boolean): number {
  return starter ? Math.round(targetFiberG * STARTER_FIBER_SHARE) : targetFiberG;
}

/**
 * Giudizio del giorno, con le stesse soglie del controllo del menù (`src/data/menu.test.ts`): "In linea" con kcal
 * entro ±8%, carboidrati entro ±15%, proteine tra −15% e +25% (qualche grammo in più non è un problema) e grassi
 * non oltre 15 g sotto l'obiettivo né oltre il 15% sopra; fibre non oltre 5 g sotto il riferimento (`fiberRefG`, di
 * base l'obiettivo; nei giorni di avvio `fiberReferenceG`). Altrimenti la voce più lontana dall'obiettivo.
 * I grammi si confrontano arrotondati, come si leggono nella card.
 */
export function dayVerdict(
  t: { kcal: number; proteinG: number; carbG: number; fatG: number; fiberG?: number },
  target: { kcal: number; proteinG: number; carbG: number; fatG: number; fiberG?: number },
  fiberRefG?: number,
): Verdict {
  const dev = (v: number, ref: number) => (ref > 0 ? Math.round(v) / ref - 1 : 0);
  const k = dev(t.kcal, target.kcal);
  if (Math.abs(k) > 0.08) return { good: false, text: `${k > 0 ? '+' : '−'}${fmtNumber(Math.abs(k) * 100)}% sull’obiettivo` };
  const fatUnder = target.fatG > 0 ? Math.max(MACRO_TOLERANCE, FAT_SLACK_G / target.fatG) : MACRO_TOLERANCE;
  const off: { name: string; d: number; over: number }[] = [
    { name: 'Proteine', d: dev(t.proteinG, target.proteinG), over: 0 },
    { name: 'Carboidrati', d: dev(t.carbG, target.carbG), over: 0 },
    { name: 'Grassi', d: dev(t.fatG, target.fatG), over: 0 },
  ].map((m) => {
    const limit = m.d > 0 ? (m.name === 'Proteine' ? PROTEIN_MAX_EXCESS : MACRO_TOLERANCE) : m.name === 'Grassi' ? fatUnder : MACRO_TOLERANCE;
    return { ...m, over: Math.abs(m.d) - limit };
  });
  const worst = off.filter((m) => m.over > 0).sort((a, b) => b.over - a.over)[0];
  if (worst) return { good: false, text: `${worst.name} ${worst.d > 0 ? 'sopra' : 'sotto'} l’obiettivo` };
  const fiberRef = fiberRefG ?? target.fiberG;
  if (t.fiberG !== undefined && fiberRef && Math.round(t.fiberG) < fiberRef - FIBER_SLACK_G) return { good: false, text: 'Fibre sotto l’obiettivo' };
  return { good: true, text: 'In linea con l’obiettivo' };
}
