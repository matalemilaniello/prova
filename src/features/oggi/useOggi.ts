/**
 * Dati della schermata Oggi, calcolati una volta per render dai pezzi di stato che servono.
 */
import { useMemo } from 'react';
import type { DayType, FootballKind, HHMM, ISODate, ItemStatus, MacroTarget } from '../../domain/types';
import { addDays, dateRange, daysBetween, weekDates, weekStart, weekdayOf } from '../../engine/dates';
import { dayTypeFor, effectiveDayType, isMatchEve } from '../../engine/menu';
import { dayNutritionDetail, type DayNutritionDetail } from '../../engine/nutrition';
import { periodStats } from '../../engine/review';
import {
  adherenceSummary,
  buildDay,
  countingStart,
  dayMinutes,
  effectiveStatus,
  firstUseOf,
  isBeforeStart,
  isNightItem,
  itemCounts,
  nightStreak,
  openItems,
  overdueItems,
  physioSetupDue,
  pickNow,
  streakInfo,
  type AdherenceSummary,
  type DayItem,
  type NowPick,
  type StreakInfo,
  type TimelineState,
} from '../../engine/timeline';
import { useApp } from '../../state/store';

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
  /** Obiettivo del giorno (con la vigilia, quello del calcio). */
  target: MacroTarget;
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
  /** Orario della riga "aggiungi gli esercizi del fisioterapista", o null. */
  physioSetup: HHMM | null;
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
  const physioSetup = useMemo(() => physioSetupDue(today, state), [today, state]);

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
  const planned = useMemo(() => dayNutritionDetail(today, { plan, dayLogs }), [today, plan, dayLogs]);
  const eaten = useMemo(() => dayNutritionDetail(today, { plan, dayLogs }, { onlyDone: true }), [today, plan, dayLogs]);

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

  return {
    today,
    state,
    dayType,
    matchEve,
    target: plan.targets[effectiveDayType(today, plan)],
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
    physioSetup,
    kickoff,
    counts,
    beforeStart,
    planned,
    eaten,
    weekSweets,
    weekAdherence,
  };
}
