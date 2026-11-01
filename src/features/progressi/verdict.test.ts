import { describe, expect, it } from 'vitest';
import type { WeekStats } from '../../engine/review';
import { verdict } from './ReviewSheet';

const week = (patch: Partial<WeekStats>): WeekStats =>
  ({ firstWeek: false, adherence: 0.77, prevAdherence: 0.7, adherenceDays: 6, successfulDays: 5, sleepAvgH: null, prevSleepAvgH: null, pain: [], ...patch }) as WeekStats;

describe('verdetto della revisione', () => {
  it('titolo e riga dicono la stessa cosa: 5 giornate su 6 sono una settimana solida', () => {
    const v = verdict(week({}));
    expect(v.title).toBe('Settimana solida');
    expect(v.line).toBe('5 giornate riuscite su 6.');
  });

  it('con poche giornate riuscite conta anche l’aderenza media', () => {
    expect(verdict(week({ successfulDays: 3, adherence: 0.75 })).title).toBe('Settimana buona');
    expect(verdict(week({ successfulDays: 2, adherence: 0.5, prevAdherence: 0.35 })).title).toBe('Settimana in ripresa');
    expect(verdict(week({ successfulDays: 1, adherence: 0.4, prevAdherence: 0.45 })).title).toBe('Settimana da riprendere');
  });

  it('senza giorni chiusi non giudica', () => {
    expect(verdict(week({ adherence: null, adherenceDays: 0, successfulDays: 0 })).title).toBe('Settimana senza voci');
  });
});
