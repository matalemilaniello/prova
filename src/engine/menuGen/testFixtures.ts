/**
 * Stati di prova del menù generato, solo per i test: piani inventati e generici (obiettivi del corpo, fasi della stagione,
 * esclusioni, orario di lavoro), costruiti dai predefiniti dell'app. Nessun dato di una persona vera.
 */
import type { AppData, DayType, Goal, ScheduleDay } from '../../domain/types';
import { DEFAULT_TARGETS, defaultAppData } from '../../data/defaults';
import { addDays } from '../dates';

export const GOALS: Goal[] = ['ricomposizione', 'dimagrimento', 'massa', 'mantenimento'];
/** Differenza di kcal dell'obiettivo del corpo (come GOAL_DELTA_KCAL): basta per spostare gli obiettivi. */
export const GOAL_DELTA: Record<Goal, number> = { ricomposizione: 0, dimagrimento: -350, massa: 250, mantenimento: 0 };
export type Phase = 'stagione' | 'pausa' | 'precampionato';
export const PHASES: Phase[] = ['stagione', 'pausa', 'precampionato'];
/** Insiemi di esclusioni di prova: nessuna, due alimenti comuni, alimenti presenti in molte ricette (§ 13.4, test 13). */
export const EXCLUSION_SETS: string[][] = [[], ['tonno', 'zucchine'], ['pane-integrale'], ['yogurt-greco-2'], ['grana'], ['miele']];

/** Settimana tipo della fase: in pausa niente calcio, nel precampionato gli allenamenti al posto della partita. */
export function phaseWeek(base: readonly ScheduleDay[], phase: Phase): ScheduleDay[] {
  if (phase === 'stagione') return base.map((d) => ({ ...d }));
  return base.map((d) => {
    const { football, ...rest } = d;
    if (phase === 'pausa') return { ...rest, dayType: (d.gymSessionId ? 'palestra' : d.dayType === 'calcio' ? 'leggero' : d.dayType) as DayType };
    if (football?.kind === 'partita') return { ...rest, dayType: 'calcio' as DayType, football: { ...football, kind: 'allenamento' as const } };
    return { ...d };
  });
}

export interface FixtureOptions {
  goal?: Goal;
  phase?: Phase;
  exclusions?: readonly string[];
  /** Blocchi di lavoro per giorno della settimana (0 = lunedì). */
  work?: Partial<Record<number, { from: string; to: string }[]>>;
}

/** Uno stato di prova per il lunedì `monday`: il piano parte tre settimane prima. */
export function fixtureState(monday: string, opts: FixtureOptions = {}): AppData {
  const s = defaultAppData(addDays(monday, -21));
  const goal = opts.goal ?? 'ricomposizione';
  const delta = GOAL_DELTA[goal];
  s.profile = { ...s.profile, goal };
  s.plan.targets = Object.fromEntries(
    Object.entries(DEFAULT_TARGETS).map(([k, t]) => [k, { ...t, kcal: t.kcal + delta, carbG: t.carbG + Math.round(delta / 4) }]),
  ) as AppData['plan']['targets'];
  if (delta) s.plan.goalDeltaKcal = delta;
  s.plan.week = phaseWeek(s.plan.week, opts.phase ?? 'stagione').map((d) => (opts.work?.[d.weekday] ? { ...d, work: opts.work[d.weekday] } : d));
  if (opts.exclusions?.length) {
    s.plan.exclusions = opts.exclusions.map((foodId) => ({ foodId, since: addDays(monday, -30), origin: 'impostazioni' as const }));
  }
  return s;
}

/** I lunedì di un anno, dal primo lunedì del 2026. */
export const MONDAYS_2026: string[] = Array.from({ length: 52 }, (_, i) => addDays('2026-01-05', 7 * i));
