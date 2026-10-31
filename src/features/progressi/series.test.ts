import { describe, expect, it } from 'vitest';
import type { AppData, ISODate } from '../../domain/types';
import { defaultAppData } from '../../data/defaults';
import { buildDemo } from '../../demo/seed';
import { addDays } from '../../engine/dates';
import {
  calendarSummary,
  chartRange,
  loadWeekCount,
  loadWeeks,
  painSeries,
  painSitesIn,
  sleepSeries,
  successCalendar,
  trailingMean,
  weightSeries,
  type CalendarDay,
} from './series';

function state(start = '2026-11-02'): AppData {
  const d = defaultAppData(start);
  d.profile = { ...d.profile, painSites: ['Tibia'] };
  return d;
}

const ci = (d: AppData, date: ISODate, patch: Partial<AppData['checkIns'][string]>) => {
  d.checkIns[date] = { ...d.checkIns[date], ...patch, date, pain: { ...(d.checkIns[date]?.pain ?? {}), ...(patch.pain ?? {}) } };
};

describe('serie dei grafici', () => {
  it('media mobile sui soli valori presenti', () => {
    expect(trailingMean([1, null, 3, null, 5], 3)).toEqual([1, 1, 2, 3, 4]);
    expect(trailingMean([null, null, 2], 7)).toEqual([null, null, 2]);
    expect(trailingMean([1, 2, 3], 2, 2)).toEqual([null, 1.5, 2.5]);
  });

  it('peso con media di 7 giorni che usa anche i giorni prima dell’intervallo', () => {
    const d = state();
    ci(d, '2026-11-01', { weightKg: 71 });
    ci(d, '2026-11-03', { weightKg: 70 });
    ci(d, '2026-11-05', { weightKg: 69 });
    const s = weightSeries(d, '2026-11-03', '2026-11-06');
    expect(s.map((p) => p.date)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(s[0]).toEqual({ date: '2026-11-03', weight: 70, trend: 70.5 });
    expect(s[1].weight).toBeNull();
    expect(s[2].trend).toBeCloseTo(70);
  });

  it('niente media prima di due pesate', () => {
    const d = state();
    ci(d, '2026-11-05', { weightKg: 69 });
    ci(d, '2026-11-06', { weightKg: 69.4 });
    const s = weightSeries(d, '2026-11-03', '2026-11-06');
    expect(s[0].trend).toBeNull();
    expect(s[2].trend).toBeNull();
    expect(s[3].trend).toBeCloseTo(69.2);
  });

  it('sonno e dolore per giorno, con i buchi', () => {
    const d = state();
    ci(d, '2026-11-03', { sleepHours: 7.2, pain: { Tibia: 3 } });
    ci(d, '2026-11-05', { bedTime: '00:15', wakeTime: '07:15', pain: { Tibia: 1, Gomito: 2 } });
    const sl = sleepSeries(d, '2026-11-03', '2026-11-05');
    expect(sl.map((p) => p.hours)).toEqual([7.2, null, 7]);
    expect(sl[2]).toMatchObject({ bed: '00:15', wake: '07:15' });
    const pn = painSeries(d, 'Tibia', '2026-11-03', '2026-11-05');
    expect(pn.map((p) => p.value)).toEqual([3, null, 1]);
    expect(pn[2].smooth).toBe(2);
    expect(painSitesIn(d, '2026-11-03', '2026-11-05')).toEqual(['Tibia', 'Gomito']);
    expect(painSitesIn(d, '2026-11-06', '2026-11-08')).toEqual([]);
  });

  it('intervallo: al massimo 28 giorni, almeno 14, dall’inizio dei dati', () => {
    const d = state('2026-10-05');
    expect(chartRange('2026-11-30', d)).toEqual({ from: '2026-11-03', to: '2026-11-30' });
    ci(d, '2026-11-20', { weightKg: 70 });
    expect(chartRange('2026-11-30', d)).toEqual({ from: '2026-11-17', to: '2026-11-30' });
    ci(d, '2026-11-10', { weightKg: 70 });
    expect(chartRange('2026-11-30', d)).toEqual({ from: '2026-11-10', to: '2026-11-30' });
  });

  it('calendario: settimane intere, fuori piano e futuro distinti', () => {
    const d = state('2026-11-02');
    const days = successCalendar(d, '2026-11-11', 3);
    expect(days).toHaveLength(21);
    expect(days[0].date).toBe('2026-10-26');
    expect(days[0].kind).toBe('fuori');
    expect(days.find((x) => x.date === '2026-11-12')?.kind).toBe('futuro');
    expect(days.find((x) => x.date === '2026-11-11')?.today).toBe(true);
    expect(days.find((x) => x.date === '2026-11-03')?.kind).toBe('vuota');
  });

  it('serie attuale e migliore, oggi conta solo se già riuscito', () => {
    const mk = (kinds: CalendarDay['kind'][], todayIdx = -1): CalendarDay[] =>
      kinds.map((kind, i) => ({ date: addDays('2026-11-02', i), kind, score: kind === 'riuscita' ? 0.8 : 0.3, minimal: false, today: i === todayIdx }));
    expect(calendarSummary(mk(['riuscita', 'riuscita', 'parziale', 'riuscita', 'riuscita', 'riuscita']))).toEqual({
      successful: 5,
      counted: 6,
      streak: 3,
      best: 3,
    });
    const s = calendarSummary(mk(['fuori', 'riuscita', 'riuscita', 'parziale', 'futuro'], 3));
    expect(s).toEqual({ successful: 2, counted: 2, streak: 2, best: 2 });
  });

  it('dati di esempio: calendario e carico credibili', () => {
    const today = '2026-10-31';
    const demo = buildDemo(today);
    const days = successCalendar(demo, today, 12);
    expect(days).toHaveLength(84);
    const sum = calendarSummary(days);
    expect(sum.counted).toBeGreaterThan(20);
    expect(sum.successful / sum.counted).toBeGreaterThan(0.4);
    expect(loadWeekCount(demo, today)).toBe(4);
    expect(loadWeekCount(defaultAppData(today), today)).toBe(4);
    const weeks = loadWeeks(demo, today, 8);
    expect(weeks).toHaveLength(8);
    expect(weeks[7].current).toBe(true);
    expect(weeks.slice(4).every((w) => w.total > 0)).toBe(true);
    expect(weeks[7].threshold).not.toBeNull();
    for (const w of weeks) expect(w.total).toBe(w.gym + w.football);
  });
});
