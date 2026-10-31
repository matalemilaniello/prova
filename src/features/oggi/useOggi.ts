/**
 * Dati della schermata Oggi, calcolati una volta per render dai pezzi di stato che servono.
 */
import { useMemo } from 'react';
import type { DayType, ISODate, ItemStatus, MacroTarget, TimelineItem } from '../../domain/types';
import { weekDates, weekStart } from '../../engine/dates';
import { dayTypeFor } from '../../engine/menu';
import { dayNutritionDetail, type DayNutritionDetail } from '../../engine/nutrition';
import {
  adherenceSummary,
  buildTimeline,
  effectiveStatus,
  overdueItems,
  pickNow,
  streakInfo,
  type AdherenceSummary,
  type NowPick,
  type StreakInfo,
  type TimelineState,
} from '../../engine/timeline';
import { useApp } from '../../state/store';

export interface OggiData {
  today: ISODate;
  state: TimelineState;
  dayType: DayType;
  target: MacroTarget;
  items: TimelineItem[];
  status: Record<string, ItemStatus>;
  summary: AdherenceSummary;
  streak: StreakInfo;
  now: NowPick | null;
  overdue: TimelineItem[];
  minimal: boolean;
  checkInDone: boolean;
  planned: DayNutritionDetail;
  eaten: DayNutritionDetail;
  /** Dolci mangiati questa settimana (da lunedì a oggi compreso). */
  weekSweets: number;
}

export function useOggi(today: ISODate, nowHHMM: string): OggiData {
  const plan = useApp((s) => s.plan);
  const dayLogs = useApp((s) => s.dayLogs);
  const physio = useApp((s) => s.physio);
  const checkIns = useApp((s) => s.checkIns);
  const workoutLogs = useApp((s) => s.workoutLogs);
  const footballLogs = useApp((s) => s.footballLogs);

  const state = useMemo<TimelineState>(
    () => ({ plan, dayLogs, physio, checkIns, workoutLogs, footballLogs }),
    [plan, dayLogs, physio, checkIns, workoutLogs, footballLogs],
  );

  const items = useMemo(() => buildTimeline(today, state), [today, state]);
  const status = useMemo(() => effectiveStatus(today, state, items), [today, state, items]);
  const summary = useMemo(() => adherenceSummary(today, state, items, status), [today, state, items, status]);
  const streak = useMemo(() => streakInfo(state, today), [state, today]);
  const checkInDone = Boolean(checkIns[today]);
  const minimal = Boolean(dayLogs[today]?.minimal);

  const now = useMemo(
    () => pickNow(items, status, nowHHMM, plan, { skip: checkInDone ? [] : ['controllo'] }),
    [items, status, nowHHMM, plan, checkInDone],
  );
  const overdue = useMemo(() => overdueItems(items, status, nowHHMM, plan), [items, status, nowHHMM, plan]);

  const dayType = dayTypeFor(today, plan);
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

  return {
    today,
    state,
    dayType,
    target: plan.targets[dayType],
    items,
    status,
    summary,
    streak,
    now,
    overdue,
    minimal,
    checkInDone,
    planned,
    eaten,
    weekSweets,
  };
}
