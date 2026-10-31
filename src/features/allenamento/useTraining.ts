/**
 * Dati della schermata Allenamento, calcolati una volta per render dai motori.
 */
import { useMemo } from 'react';
import type { DayType, FootballEvent, FootballLog, ISODate, Weekday, WorkoutLog } from '../../domain/types';
import { SESSION_LIST } from '../../data/sessions';
import { addDays, daysBetween, formatDayLong, formatWeekday, weekDates, weekStart, weekdayOf } from '../../engine/dates';
import {
  e1rmHistory,
  loadStatus,
  nextPlannedSession,
  painGate,
  plannedLoadRemaining,
  sessionLoad,
  type E1rmPoint,
  type LoadStatus,
  type PainGate,
  type PlannedSession,
} from '../../engine/training';
import { useApp } from '../../state/store';
import { strengthRecords } from './lib';

export interface WeekDayInfo {
  iso: ISODate;
  weekday: Weekday;
  dayType: DayType;
  isToday: boolean;
  isPast: boolean;
  gym?: { sessionId: string; time?: string; optional: boolean; log: WorkoutLog | null };
  football?: FootballEvent & { log: FootballLog | null };
  /** Sedute registrate in quel giorno fuori dal programma. */
  extra: WorkoutLog[];
  physio: boolean;
  load: number;
}

export interface StrengthRow {
  exerciseId: string;
  points: E1rmPoint[];
  latest: number;
  /** Variazione rispetto al primo valore delle ultime 4 settimane. */
  delta: number;
}

export interface TrainingData {
  weekStart: ISODate;
  days: WeekDayInfo[];
  status: LoadStatus;
  planned: number;
  next: PlannedSession | null;
  /** Prossima seduta non facoltativa dopo `next` (per il "poi"). */
  after: PlannedSession | null;
  gate: PainGate;
  todayLogs: WorkoutLog[];
  history: WorkoutLog[];
  /** Record per id di seduta registrata. */
  recordsById: Record<string, number>;
  strength: StrengthRow[];
  nextMatch: { date: ISODate; event: FootballEvent } | null;
}

/** Esercizi principali per la forza stimata: quelli con progressione doppia dei blocchi principali. */
const KEY_LIFTS: string[] = (() => {
  const ids: string[] = [];
  for (const s of SESSION_LIST) {
    for (const b of s.blocks) {
      if (!/principale/i.test(b.title)) continue;
      for (const it of b.items) if (it.progression === 'doppia' && !ids.includes(it.exerciseId)) ids.push(it.exerciseId);
    }
  }
  return ids;
})();

export function useTraining(today: ISODate): TrainingData {
  const plan = useApp((s) => s.plan);
  const workoutLogs = useApp((s) => s.workoutLogs);
  const footballLogs = useApp((s) => s.footballLogs);
  const checkIns = useApp((s) => s.checkIns);
  const profile = useApp((s) => s.profile);
  const physio = useApp((s) => s.physio);

  return useMemo(() => {
    const ws = weekStart(today);
    const state = { plan, workoutLogs, footballLogs };
    const days: WeekDayInfo[] = weekDates(ws).map((iso) => {
      const wd = weekdayOf(iso);
      const sched = plan.week.find((d) => d.weekday === wd);
      const dayLogs = workoutLogs.filter((w) => w.date === iso);
      const gymLog = sched?.gymSessionId ? (dayLogs.find((w) => w.sessionId === sched.gymSessionId) ?? dayLogs[0] ?? null) : null;
      const fLog = footballLogs.find((f) => f.date === iso) ?? null;
      const load =
        dayLogs.reduce((s, w) => s + sessionLoad(w.durationMin, w.rpe), 0) +
        footballLogs.filter((f) => f.date === iso).reduce((s, f) => s + sessionLoad(f.durationMin, f.rpe), 0);
      return {
        iso,
        weekday: wd,
        dayType: sched?.dayType ?? 'riposo',
        isToday: iso === today,
        isPast: iso < today,
        gym: sched?.gymSessionId ? { sessionId: sched.gymSessionId, time: sched.gymTime, optional: Boolean(sched.gymOptional), log: gymLog } : undefined,
        football: sched?.football ? { ...sched.football, log: fLog } : undefined,
        extra: dayLogs.filter((w) => w !== gymLog),
        physio: Boolean(sched?.physio),
        load,
      };
    });
    const status = loadStatus(ws, state);
    const planned = plannedLoadRemaining(ws, state, today).load;
    const next = nextPlannedSession(today, state);
    const after = next ? nextPlannedSession(today, state, { after: next.date, skipOptional: true }) : null;
    const gate = painGate({ plan, checkIns, profile }, today);
    const history = workoutLogs.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const recordsById: Record<string, number> = {};
    for (const w of history) recordsById[w.id] = strengthRecords(w, workoutLogs, physio).length;

    const since = addDays(today, -28);
    const strength: StrengthRow[] = KEY_LIFTS.map((id) => {
      const points = e1rmHistory(id, workoutLogs);
      const latest = points[points.length - 1]?.e1rm ?? 0;
      const base = points.find((p) => p.date >= since) ?? points[0];
      return { exerciseId: id, points, latest, delta: base ? latest - base.e1rm : 0 };
    })
      .filter((r) => r.points.length > 0)
      .sort((a, b) => b.latest - a.latest);

    let nextMatch: TrainingData['nextMatch'] = null;
    for (let i = 0; i < 8 && !nextMatch; i++) {
      const iso = addDays(today, i);
      const ev = plan.week.find((d) => d.weekday === weekdayOf(iso))?.football;
      if (ev?.kind === 'partita' && !(i === 0 && footballLogs.some((f) => f.date === iso))) nextMatch = { date: iso, event: ev };
    }

    return {
      weekStart: ws,
      days,
      status,
      planned,
      next,
      after,
      gate,
      todayLogs: workoutLogs.filter((w) => w.date === today),
      history,
      recordsById,
      strength,
      nextMatch,
    };
  }, [today, plan, workoutLogs, footballLogs, checkIns, profile, physio]);
}

/** "oggi", "domani", "martedì", "martedì 10 novembre" (oltre la settimana). */
export function relativeDayShort(iso: ISODate, today: ISODate): string {
  const d = daysBetween(today, iso);
  if (d === 0) return 'oggi';
  if (d === 1) return 'domani';
  if (d === -1) return 'ieri';
  if (d > 1 && d < 7) return formatWeekday(iso);
  return formatDayLong(iso);
}

/** "4 giorni fa", "ieri", "oggi". */
export function agoLabel(iso: ISODate, today: ISODate): string {
  const d = daysBetween(iso, today);
  if (d <= 0) return 'oggi';
  if (d === 1) return 'ieri';
  if (d < 14) return `${d} giorni fa`;
  const w = Math.round(d / 7);
  return `${w} settimane fa`;
}
