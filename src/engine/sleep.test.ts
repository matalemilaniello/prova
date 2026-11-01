import { describe, expect, it } from 'vitest';
import type { CheckIn } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import {
  atSleepTarget,
  bedtimeFor,
  checkInSleepHours,
  curfewFor,
  dayCutoffMin,
  footballBedtimeFloor,
  isOnTarget,
  isOnTargetFor,
  minutesUntilNight,
  nextBedtime,
  nightsOnTarget,
  planDayISO,
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

  it('nelle sere di calcio il letto non arriva prima della cena di recupero', () => {
    const p = { ...plan, sleep: { ...plan.sleep, current: '23:30' } };
    // 2026-11-09 è lunedì: partita 21:00-22:30, cena alle 23:00, letto 00:15.
    expect(footballBedtimeFloor('2026-11-09', p)).toBe('00:15');
    expect(bedtimeFor('2026-11-09', p)).toBe('00:15');
    expect(curfewFor('2026-11-09', p)).toBe('23:45');
    // Mercoledì calcetto 21:00-22:00 e giovedì allenamento 20:30-22:00: letto 23:45.
    expect(bedtimeFor('2026-11-11', p)).toBe('23:45');
    expect(bedtimeFor('2026-11-12', p)).toBe('23:45');
    // Martedì senza calcio: la fase del piano.
    expect(bedtimeFor('2026-11-10', p)).toBe('23:30');
    // Se la fase è già più tardi, resta la fase.
    expect(bedtimeFor('2026-11-09', plan)).toBe('00:45');
    // Data non valida (usata per l'orario generico): la fase.
    expect(bedtimeFor('', p)).toBe('23:30');
    expect(curfewFor('', p)).toBe('23:00');
  });

  it('il controllo del mattino si confronta con la sera prima', () => {
    const p = { ...plan, sleep: { ...plan.sleep, current: '23:30' } };
    // Martedì mattina: la notte è quella della partita del lunedì.
    expect(isOnTargetFor('00:25', '2026-11-10', p)).toBe(true);
    expect(isOnTargetFor('00:35', '2026-11-10', p)).toBe(false);
    // Mercoledì mattina: la notte di martedì, senza calcio.
    expect(isOnTargetFor('00:25', '2026-11-11', p)).toBe(false);
    const checkIns: Record<string, CheckIn> = {
      '2026-11-10': { date: '2026-11-10', pain: {}, bedTime: '00:20' },
      '2026-11-11': { date: '2026-11-11', pain: {}, bedTime: '23:40' },
      '2026-11-12': { date: '2026-11-12', pain: {}, bedTime: '23:55' },
    };
    expect(nightsOnTarget(checkIns, p, ['2026-11-10', '2026-11-11', '2026-11-12'])).toBe(3);
  });

  it('la giornata del piano cambia 90 minuti prima della sveglia', () => {
    expect(dayCutoffMin(plan)).toBe(7 * 60 + 15 - 90);
    // Giovedì 12 alle 00:40: è ancora mercoledì 11.
    expect(planDayISO(new Date(2026, 10, 12, 0, 40), plan)).toBe('2026-11-11');
    expect(planDayISO(new Date(2026, 10, 12, 5, 44), plan)).toBe('2026-11-11');
    expect(planDayISO(new Date(2026, 10, 12, 5, 45), plan)).toBe('2026-11-12');
    expect(planDayISO(new Date(2026, 10, 12, 23, 59), plan)).toBe('2026-11-12');
    // Cambio di mese e d'anno.
    expect(planDayISO(new Date(2027, 0, 1, 1, 0), plan)).toBe('2026-12-31');
    // Sveglia molto presto o molto tardi: il confine resta tra le 03:00 e le 10:00.
    expect(dayCutoffMin({ sleep: { ...plan.sleep, wake: '04:00' } })).toBe(180);
    expect(dayCutoffMin({ sleep: { ...plan.sleep, wake: '12:00' } })).toBe(600);
  });
});
