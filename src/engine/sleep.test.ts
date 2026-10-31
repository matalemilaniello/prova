import { describe, expect, it } from 'vitest';
import type { CheckIn } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import {
  atSleepTarget,
  bedtimeFor,
  checkInSleepHours,
  curfewFor,
  isOnTarget,
  minutesUntilNight,
  nextBedtime,
  nightsOnTarget,
  plannedSleepHours,
  sleepHours,
  weeksToTarget,
} from './sleep';

const plan = defaultPlan('2026-11-09');

describe('sonno', () => {
  it('orario a letto e coprifuoco (attraversa la mezzanotte)', () => {
    expect(bedtimeFor('2026-11-10', plan)).toBe('00:45');
    expect(curfewFor('2026-11-10', plan)).toBe('00:15');
    const p2 = { ...plan, sleep: { ...plan.sleep, current: '00:15' } };
    expect(curfewFor('2026-11-10', p2)).toBe('23:45');
  });

  it('ore di sonno', () => {
    expect(sleepHours('23:30', '07:15')).toBeCloseTo(7.75);
    expect(sleepHours('00:45', '07:15')).toBeCloseTo(6.5);
    expect(plannedSleepHours(plan)).toBeCloseTo(6.5);
    expect(checkInSleepHours({ date: '2026-11-10', pain: {}, bedTime: '23:40', wakeTime: '07:10' })).toBeCloseTo(7.5);
    expect(checkInSleepHours({ date: '2026-11-10', pain: {}, sleepHours: 6.8 })).toBe(6.8);
    expect(checkInSleepHours(undefined)).toBeUndefined();
  });

  it('notte in orario con 15 minuti di tolleranza, anche dopo mezzanotte', () => {
    expect(isOnTarget('00:55', plan)).toBe(true);
    expect(isOnTarget('01:01', plan)).toBe(false);
    expect(isOnTarget('23:50', plan)).toBe(true);
  });

  it('conta le notti in orario solo dove c’è il dato', () => {
    const checkIns: Record<string, CheckIn> = {
      '2026-11-10': { date: '2026-11-10', pain: {}, bedTime: '00:30' },
      '2026-11-11': { date: '2026-11-11', pain: {}, bedTime: '01:20' },
      '2026-11-12': { date: '2026-11-12', pain: {} },
      '2026-11-13': { date: '2026-11-13', pain: {}, bedTime: '23:58' },
    };
    expect(nightsOnTarget(checkIns, plan, ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'])).toBe(2);
  });

  it('il passo anticipa di 15 minuti e si ferma all’obiettivo', () => {
    expect(nextBedtime(plan)).toBe('00:30');
    expect(weeksToTarget(plan)).toBe(5);
    const near = { ...plan, sleep: { ...plan.sleep, current: '23:40' } };
    expect(nextBedtime(near)).toBe('23:30');
    const done = { ...plan, sleep: { ...plan.sleep, current: '23:30' } };
    expect(nextBedtime(done)).toBe('23:30');
    expect(atSleepTarget(done)).toBe(true);
    expect(weeksToTarget(done)).toBe(0);
  });

  it('minuti alla scadenza serale', () => {
    expect(minutesUntilNight('22:00', '23:45')).toBe(105);
    expect(minutesUntilNight('23:30', '00:15')).toBe(45);
    expect(minutesUntilNight('00:30', '00:15')).toBe(0);
  });
});
