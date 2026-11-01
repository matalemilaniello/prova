import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, weekdayOf } from '../engine/dates';
import { isOnTargetFor, sleepHours } from '../engine/sleep';
import { adherenceSummary, isSuccessful } from '../engine/timeline';
import { buildDemo } from './seed';

describe('dati di esempio', () => {
  const today = '2026-11-12';
  const demo = buildDemo(today, { nowMin: 13 * 60 });

  it('è deterministico', () => {
    expect(JSON.stringify(buildDemo(today, { nowMin: 13 * 60 }))).toBe(JSON.stringify(demo));
  });

  it('lo storico dei giorni passati non dipende dall’ora', () => {
    for (const day of ['2026-11-03', '2026-11-12', '2026-11-15']) {
      const noon = buildDemo(day, { nowMin: 12 * 60 + 30 });
      const evening = buildDemo(day, { nowMin: 17 * 60 });
      const late = buildDemo(day, { nowMin: 22 * 60 + 40 });
      for (const other of [evening, late]) {
        expect(other.workoutLogs).toEqual(noon.workoutLogs);
        expect(other.footballLogs).toEqual(noon.footballLogs);
        expect(other.checkIns).toEqual(noon.checkIns);
        for (const d of Object.keys(noon.dayLogs)) {
          if (d < day) expect(other.dayLogs[d]).toEqual(noon.dayLogs[d]);
        }
      }
    }
  });

  it('l’ora decide solo quali voci di oggi sono già segnate', () => {
    const morning = buildDemo(today, { nowMin: 9 * 60 });
    const evening = buildDemo(today, { nowMin: 20 * 60 });
    const marked = (d: typeof demo) => Object.keys(d.dayLogs[today].status).length;
    expect(marked(evening)).toBeGreaterThan(marked(morning));
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

  it('sonno: tempo a letto uguale agli orari, 4-5 notti in orario su 7', () => {
    for (const c of Object.values(demo.checkIns)) {
      if (c.bedTime && c.wakeTime) expect(c.sleepHours).toBe(sleepHours(c.bedTime, c.wakeTime));
    }
    for (let w = 0; w < 3; w++) {
      const dates = Array.from({ length: 7 }, (_, i) => addDays(demo.plan.startDate, w * 7 + i));
      const on = dates.filter((d) => demo.checkIns[d]?.bedTime && isOnTargetFor(demo.checkIns[d].bedTime!, d, demo.plan)).length;
      expect(on).toBeGreaterThanOrEqual(3);
      expect(on).toBeLessThanOrEqual(5);
    }
  });

  it('settimane credibili: aderenza 65-88%, giornate minime e giornate storte', () => {
    for (let w = 0; w < 3; w++) {
      const sums = Array.from({ length: 7 }, (_, i) => adherenceSummary(addDays(demo.plan.startDate, w * 7 + i), demo));
      const avg = sums.reduce((a, s) => a + s.score, 0) / sums.length;
      expect(avg).toBeGreaterThanOrEqual(0.65);
      expect(avg).toBeLessThanOrEqual(0.88);
      expect(sums.some((s) => s.minimal)).toBe(true);
      expect(sums.some((s) => !isSuccessful(s))).toBe(true);
    }
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
