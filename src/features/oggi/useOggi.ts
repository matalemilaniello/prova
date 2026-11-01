/**
 * Dati della schermata Oggi, calcolati una volta per render dai pezzi di stato che servono.
 */
import { useMemo } from 'react';
import type { DayType, FootballKind, HHMM, ISODate, ItemStatus, MacroTarget } from '../../domain/types';
import { addDays, dateRange, daysBetween, weekDates, weekStart, weekdayOf } from '../../engine/dates';
import { dayTypeFor, isMatchEve, isStarterDay } from '../../engine/menu';
import { dayNutritionDetail, dayTargetFor, type DayNutritionDetail } from '../../engine/nutrition';
import { periodStats } from '../../engine/review';
import {
  adherenceSummary,
  buildDay,
  countingStart,
  dayMinutes,
  derivedStatus,
  effectiveStatus,
  firstShopping,
  firstUseOf,
  isBeforeStart,
  isNightItem,
  itemCounts,
  nightStreak,
  openItems,
  overdueItems,
  pickNow,
  setupTask,
  streakInfo,
  type AdherenceSummary,
  type DayItem,
  type NowPick,
  type SetupTask,
  type StreakInfo,
  type TimelineState,
} from '../../engine/timeline';
import { STARTER_FIBER_SHARE } from '../../data/menu';
import { useApp } from '../../state/store';
import { useCalendarTask, type CalendarTask } from '../impostazioni/reminders';
import { welcomeBoard, type WelcomeSpot } from './firstDay';

/** Fino a quest'ora Oggi propone di sistemare le voci rimaste aperte ieri. */
export const YESTERDAY_UNTIL_MIN = 12 * 60;

export interface Kickoff {
  kind: FootballKind;
  time: HHMM;
  /** Minuti al calcio d'inizio (negativo se è già iniziato). */
  inMin: number;
  itemId: string;
}

export interface OggiData {
  today: ISODate;
  state: TimelineState;
  /** Tipo previsto dalla settimana: etichetta e colori. */
  dayType: DayType;
  /** Vigilia della partita: porzioni e obiettivo da giorno di calcio. */
  matchEve: boolean;
  /** Obiettivo del giorno (`dayTargetFor`: con la vigilia quello del calcio, più il minimo di carboidrati di partita e vigilia). */
  target: MacroTarget;
  /**
   * Riferimento dei valori del giorno: l'obiettivo, ma nei giorni di avvio le fibre sono quelle che il menù di avvio porta
   * di proposito (`STARTER_FIBER_SHARE`, circa 28 g su 35), come nel Menù di Settimana.
   */
  valuesTarget: MacroTarget;
  /**
   * Nota dei valori del giorno nei giorni di avvio, la stessa del Menù di Settimana: le fibre salgono per gradi e, a
   * partita e vigilia, pasta, riso e pane alzati fino a 6 g/kg ne portano qualcuna in più. Null negli altri giorni.
   */
  valuesNote: string | null;
  items: DayItem[];
  status: Record<string, ItemStatus>;
  summary: AdherenceSummary;
  streak: StreakInfo;
  nights: number;
  /** La voce "Adesso"; null quando tutte le voci che contano sono segnate. */
  now: NowPick | null;
  overdue: DayItem[];
  /** Voci rimaste aperte ieri (solo la mattina). */
  yesterdayOpen: DayItem[];
  minimal: boolean;
  checkInDone: boolean;
  /** Tutte le voci che contano sono segnate. */
  complete: boolean;
  /** Voce del telefono fuori (coprifuoco o minima:telefono) e se è segnata. */
  phoneItem: DayItem | undefined;
  phoneDone: boolean;
  /** Voce "A letto", se c'è ed è ancora da segnare. */
  bedItem: DayItem | undefined;
  /** Primo giorno d'uso: le voci prima dell'inizio non contano. */
  firstDay: boolean;
  /** Configurazione da completare (esercizi del fisioterapista, dose di un integratore): fuori dalla timeline. */
  /**
   * Una cosa da completare alla volta, sotto la timeline: prima i promemoria nel calendario (l'unico modo in cui Ritmo
   * raggiunge l'utente con l'app chiusa), poi esercizi del fisioterapista e dose degli integratori.
   */
  setup: SetupTask | CalendarTask | null;
  /** Calcio di oggi ancora da giocare (o in corso). */
  kickoff: Kickoff | null;
  counts: (item: DayItem) => boolean;
  beforeStart: (item: DayItem) => boolean;
  planned: DayNutritionDetail;
  eaten: DayNutritionDetail;
  /** Dolci mangiati questa settimana (da lunedì a oggi compreso). */
  weekSweets: number;
  /** Aderenza media dei giorni chiusi negli ultimi 7, calcolata come in Progressi; null senza giorni chiusi. */
  weekAdherence: number | null;
  /** Prima spesa dei giorni di avvio, quando oggi ci sono pasti che vengono prima (`DayItem.preShopping`). */
  shopping: { time: HHMM; tomorrow: boolean } | null;
  /** Voci di domani, come le mostrerà Oggi. */
  tomorrowItems: DayItem[];
  /** Primo giorno, finché la giornata non è chiusa: i due o tre orari che la reggono, al posto dell'anello. */
  welcome: WelcomeSpot[] | null;
  /** Spesa ancora da fare oggi o domani (la sua lista si apre da Oggi). */
  pendingShopping: { item: DayItem; date: ISODate } | null;
  /**
   * Il menù di oggi vale per intero: nessun pasto viene prima del primo avvio. Il primo giorno, con dei pasti già
   * passati, i valori del giorno conterebbero anche quelli e non si mostrano.
   */
  fullMenu: boolean;
  /** Giorno del piano dal primo avvio (1 il giorno del primo avvio), null senza primo avvio (dati di esempio). */
  planDay: number | null;
}

export function useOggi(today: ISODate, nowHHMM: HHMM): OggiData {
  const plan = useApp((s) => s.plan);
  const dayLogs = useApp((s) => s.dayLogs);
  const physio = useApp((s) => s.physio);
  const checkIns = useApp((s) => s.checkIns);
  const workoutLogs = useApp((s) => s.workoutLogs);
  const footballLogs = useApp((s) => s.footballLogs);
  const reviews = useApp((s) => s.reviews);
  const shoppingChecked = useApp((s) => s.shoppingChecked);
  const prepDone = useApp((s) => s.prepDone);
  const profile = useApp((s) => s.profile);

  const state = useMemo<TimelineState>(
    () => ({ plan, dayLogs, physio, checkIns, workoutLogs, footballLogs, reviews, shoppingChecked, prepDone }),
    [plan, dayLogs, physio, checkIns, workoutLogs, footballLogs, reviews, shoppingChecked, prepDone],
  );

  const items = useMemo(() => buildDay(today, state), [today, state]);
  const status = useMemo(() => effectiveStatus(today, state, items), [today, state, items]);
  const summary = useMemo(() => adherenceSummary(today, state, items, status), [today, state, items, status]);
  const streak = useMemo(() => streakInfo(state, today), [state, today]);
  const nights = useMemo(() => nightStreak(state, today), [state, today]);
  const checkInDone = Boolean(checkIns[today]);
  const minimal = Boolean(dayLogs[today]?.minimal);

  const counts = useMemo(() => (it: DayItem) => itemCounts(today, it, state), [today, state]);
  const beforeStart = useMemo(() => (it: DayItem) => isBeforeStart(today, it, plan), [today, plan]);
  const complete = summary.total > 0 && summary.pending === 0;

  const now = useMemo(() => {
    if (complete) return null;
    return pickNow(items, status, nowHHMM, plan, {
      skip: checkInDone || status.controllo ? [] : ['controllo'],
      exclude: (it) => isBeforeStart(today, it, plan),
    });
  }, [complete, items, status, nowHHMM, plan, checkInDone, today]);

  const overdue = useMemo(() => overdueItems(items, status, nowHHMM, plan, counts), [items, status, nowHHMM, plan, counts]);

  const yesterday = addDays(today, -1);
  const start = countingStart(plan);
  const morning = dayMinutes(nowHHMM, plan) < YESTERDAY_UNTIL_MIN;
  const yesterdayOpen = useMemo(() => {
    if (!morning) return [];
    if (start && daysBetween(start, yesterday) < 0) return [];
    // Le voci della notte non segnate restano aperte: la sera si sistema il mattino dopo.
    return openItems(yesterday, state);
  }, [morning, start, yesterday, state]);

  const phoneItem = items.find(isNightItem);
  const phoneDone = !phoneItem || phoneItem.kind === 'letto' || Boolean(status[phoneItem.id]);
  const bedRaw = items.find((i) => i.kind === 'letto');
  const bedItem = bedRaw && !status[bedRaw.id] ? bedRaw : undefined;

  const first = firstUseOf(plan);
  const firstDay = Boolean(first && first.date === today);
  const calendar = useCalendarTask();
  const setup = useMemo<SetupTask | CalendarTask | null>(() => {
    if (dayLogs[today]?.minimal) return null;
    return calendar ?? setupTask(today, state);
  }, [dayLogs, today, calendar, state]);

  const kickoff = useMemo<Kickoff | null>(() => {
    const day = plan.week.find((d) => d.weekday === weekdayOf(today));
    const f = day?.football;
    if (!f) return null;
    const itemId = `calcio:${f.kind}`;
    if (status[itemId]) return null;
    const inMin = dayMinutes(f.time, plan) - dayMinutes(nowHHMM, plan);
    if (inMin < -f.durationMin) return null;
    return { kind: f.kind, time: f.time, inMin, itemId };
  }, [plan, today, status, nowHHMM]);

  const dayType = dayTypeFor(today, plan);
  const matchEve = isMatchEve(today, plan);
  // Con controlli e profilo il minimo di carboidrati di partita e vigilia usa il peso recente: gli stessi numeri
  // di Settimana e della ricetta, obiettivo dell'intestazione compreso.
  const nutrition = useMemo(() => ({ plan, dayLogs, checkIns, profile }), [plan, dayLogs, checkIns, profile]);
  const planned = useMemo(() => dayNutritionDetail(today, nutrition), [today, nutrition]);
  const eaten = useMemo(() => dayNutritionDetail(today, nutrition, { onlyDone: true }), [today, nutrition]);
  const target = useMemo(() => dayTargetFor(today, nutrition), [today, nutrition]);
  const starterDay = isStarterDay(today, plan);
  const valuesTarget = useMemo(
    () => (starterDay ? { ...target, fiberG: Math.round(target.fiberG * STARTER_FIBER_SHARE) } : target),
    [starterDay, target],
  );
  const valuesNote = useMemo(() => {
    if (!starterDay) return null;
    const ref = valuesTarget.fiberG;
    const more = planned.matchCarbs && Math.round(planned.total.fiberG) > ref + 2 ? `, qualcuna in più con i carboidrati della ${planned.matchCarbs.when}` : '';
    return `Fibre in aumento graduale: per ora circa ${ref}\u00a0g${more}.`;
  }, [starterDay, valuesTarget, planned]);

  const weekSweets = useMemo(() => {
    let n = 0;
    for (const d of weekDates(weekStart(today))) {
      if (d > today) break;
      n += dayLogs[d]?.sweets ?? 0;
    }
    return n;
  }, [today, dayLogs]);

  // Gli stessi numeri di Progressi: ultimi 7 giorni, solo quelli chiusi (oggi è ancora in corso).
  const weekAdherence = useMemo(
    () =>
      periodStats(dateRange(addDays(today, -6), today), [], { plan, dayLogs, checkIns, workoutLogs, footballLogs, profile, reviews, physio }, { today })
        .adherence,
    [today, plan, dayLogs, checkIns, workoutLogs, footballLogs, profile, reviews, physio],
  );

  const shopping = useMemo(() => {
    if (!items.some((i) => i.preShopping)) return null;
    const shop = firstShopping(state);
    return shop ? { time: shop.time, tomorrow: shop.date > today } : null;
  }, [items, state, today]);

  const tomorrow = addDays(today, 1);
  const tomorrowItems = useMemo(() => buildDay(tomorrow, state), [tomorrow, state]);

  const welcome = useMemo(() => {
    if (!firstDay || complete) return null;
    const spots = welcomeBoard(items, tomorrowItems, { beforeStart: (it) => isBeforeStart(today, it, plan), status });
    return spots.length ? spots : null;
  }, [firstDay, complete, items, tomorrowItems, today, plan, status]);

  const pendingShopping = useMemo(() => {
    const own = items.find((i) => i.kind === 'spesa' && !status[i.id] && !isBeforeStart(today, i, plan));
    if (own) return { item: own, date: today };
    const next = tomorrowItems.find((i) => i.kind === 'spesa');
    if (!next || dayLogs[tomorrow]?.status?.[next.id] || derivedStatus(tomorrow, state, next)) return null;
    return { item: next, date: tomorrow };
  }, [items, status, today, plan, tomorrowItems, dayLogs, tomorrow, state]);

  const fullMenu = !items.some((i) => i.kind === 'pasto' && isBeforeStart(today, i, plan));
  const planDay = first ? daysBetween(first.date, today) + 1 : null;

  return {
    today,
    state,
    dayType,
    matchEve,
    target,
    valuesTarget,
    valuesNote,
    items,
    status,
    summary,
    streak,
    nights,
    now,
    overdue,
    yesterdayOpen,
    minimal,
    checkInDone,
    complete,
    phoneItem,
    phoneDone,
    bedItem,
    firstDay,
    setup,
    kickoff,
    counts,
    beforeStart,
    planned,
    eaten,
    weekSweets,
    weekAdherence,
    shopping,
    tomorrowItems,
    welcome,
    pendingShopping,
    fullMenu,
    planDay,
  };
}
