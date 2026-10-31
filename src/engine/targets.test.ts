import { describe, expect, it } from 'vitest';
import type { Profile } from '../domain/types';
import { DEFAULT_PROFILE } from '../data/defaults';
import { ageFrom, bmrMifflin, computeTargets, tdee } from './targets';

const NOW = new Date(2026, 10, 10);
const profile: Profile = { ...DEFAULT_PROFILE, birthYear: 1996, heightCm: 178, startWeightKg: 70 };

describe('obiettivi', () => {
  it('Mifflin-St Jeor', () => {
    expect(bmrMifflin({ sex: 'M', weightKg: 70, heightCm: 178, age: 30 })).toBeCloseTo(1667.5, 1);
    expect(bmrMifflin({ sex: 'F', weightKg: 60, heightCm: 165, age: 30 })).toBeCloseTo(1320.25, 1);
  });

  it('il dispendio cresce con il tipo di giorno', () => {
    const b = 1667.5;
    expect(tdee(b, 'calcio')).toBeGreaterThan(tdee(b, 'palestra'));
    expect(tdee(b, 'palestra')).toBeGreaterThan(tdee(b, 'leggero'));
    expect(tdee(b, 'leggero')).toBeGreaterThan(tdee(b, 'riposo'));
  });

  it('ritrova i valori predefiniti per un profilo tipo', () => {
    const t = computeTargets(profile, 70, NOW);
    expect(t.palestra.kcal).toBe(2600);
    expect(t.calcio.kcal).toBe(2800);
    expect(t.palestra.proteinG).toBe(135);
    expect(t.palestra.fatG).toBe(80);
    expect(t.palestra.carbG).toBe(335);
    expect(t.calcio.carbG).toBe(385);
    expect(t.riposo.fiberG).toBe(30);
  });

  it('i macro tornano con le kcal (±20 kcal di arrotondamento)', () => {
    const t = computeTargets(profile, 74, NOW);
    for (const d of Object.values(t)) {
      expect(Math.abs(d.proteinG * 4 + d.fatG * 9 + d.carbG * 4 - d.kcal)).toBeLessThanOrEqual(20);
    }
  });

  it('profilo incompleto: usa valori di riserva senza NaN', () => {
    const t = computeTargets(DEFAULT_PROFILE, undefined, NOW);
    for (const d of Object.values(t)) {
      expect(Number.isFinite(d.kcal)).toBe(true);
      expect(d.kcal).toBeGreaterThan(1500);
    }
    expect(ageFrom(0, NOW)).toBe(30);
  });

  it('obiettivo dimagrimento riduce le calorie', () => {
    const base = computeTargets(profile, 70, NOW);
    const cut = computeTargets({ ...profile, goal: 'dimagrimento' }, 70, NOW);
    expect(cut.palestra.kcal).toBeLessThan(base.palestra.kcal);
    expect(cut.palestra.proteinG).toBe(base.palestra.proteinG);
  });
});
