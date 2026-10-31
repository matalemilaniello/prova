import { describe, expect, it } from 'vitest';
import { daysBetween, weekdayOf } from '../engine/dates';
import { buildDemo } from './seed';

describe('dati di esempio', () => {
  const today = '2026-11-12';
  const demo = buildDemo(today, { nowMin: 13 * 60 });

  it('è deterministico', () => {
    expect(JSON.stringify(buildDemo(today, { nowMin: 13 * 60 }))).toBe(JSON.stringify(demo));
  });

  it('piano iniziato tre settimane fa, di lunedì', () => {
    expect(weekdayOf(demo.plan.startDate)).toBe(0);
    expect(daysBetween(demo.plan.startDate, today)).toBeGreaterThanOrEqual(21);
    expect(demo.onboarded).toBe(true);
    expect(demo.settings.demoData).toBe(true);
  });

  it('diario e controlli credibili', () => {
    const days = Object.keys(demo.dayLogs);
    expect(days.length).toBeGreaterThanOrEqual(21);
    expect(Object.values(demo.dayLogs).some((d) => d.minimal)).toBe(true);
    const weights = Object.values(demo.checkIns)
      .map((c) => c.weightKg)
      .filter((w): w is number => typeof w === 'number');
    expect(weights.length).toBeGreaterThan(15);
    for (const w of weights) expect(w).toBeGreaterThan(68.5);
    for (const w of weights) expect(w).toBeLessThan(71.5);
    const first = demo.checkIns[demo.plan.startDate];
    expect(first?.pain.Tibia).toBeGreaterThanOrEqual(2);
  });

  it('sedute, calcio e revisioni', () => {
    expect(demo.workoutLogs.length).toBeGreaterThanOrEqual(6);
    expect(demo.footballLogs.length).toBeGreaterThanOrEqual(6);
    expect(demo.reviews).toHaveLength(2);
    expect(demo.chat.length).toBeGreaterThan(0);
    for (const w of demo.workoutLogs) expect(w.date < today).toBe(true);
  });

  it('nessun dato personale: profilo generico', () => {
    expect(demo.profile.name).toBeUndefined();
    expect(demo.profile.expertise).toBeUndefined();
  });
});
