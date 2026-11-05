import { describe, expect, it } from 'vitest';
import type { Profile } from '../domain/types';
import { DEFAULT_PROFILE } from '../data/defaults';
import { PROTEIN_G_PER_KG_BY_GOAL, ageFrom, bmrMifflin, computeTargets, targetsForGoal, tdee } from './targets';

const NOW = new Date(2026, 10, 10);
// Profilo di prova generico (36 anni nel 2026, 178 cm, 74 kg): nessun dato reale.
const profile: Profile = { ...DEFAULT_PROFILE, birthYear: 1990, heightCm: 178, startWeightKg: 74 };

describe('obiettivi', () => {
  it('Mifflin-St Jeor', () => {
    expect(bmrMifflin({ sex: 'M', weightKg: 74, heightCm: 178, age: 36 })).toBeCloseTo(1677.5, 1);
    expect(bmrMifflin({ sex: 'F', weightKg: 60, heightCm: 165, age: 30 })).toBeCloseTo(1320.25, 1);
  });

  it('il dispendio cresce con il tipo di giorno', () => {
    const b = 1677.5;
    expect(tdee(b, 'calcio')).toBeGreaterThan(tdee(b, 'palestra'));
    expect(tdee(b, 'palestra')).toBeGreaterThan(tdee(b, 'leggero'));
    expect(tdee(b, 'leggero')).toBeGreaterThan(tdee(b, 'riposo'));
  });

  it('calcola kcal e macro per un profilo tipo', () => {
    // BMR 1.677,5 kcal: palestra × 1,56 = 2.617 → 2.600; calcio × 1,68 = 2.818 → 2.800.
    const t = computeTargets(profile, 74, NOW);
    expect(t.palestra.kcal).toBe(2600);
    expect(t.calcio.kcal).toBe(2800);
    expect(t.leggero.kcal).toBe(2450);
    expect(t.riposo.kcal).toBe(2300);
    // Proteine 1,9 g/kg × 74 = 140,6 → 140 g; grassi 28% di 2.600 kcal = 80 g; carboidrati il resto.
    expect(t.palestra.proteinG).toBe(140);
    expect(t.palestra.fatG).toBe(80);
    expect(t.palestra.carbG).toBe(330);
    expect(t.calcio.carbG).toBe(380);
    expect(t.riposo.fiberG).toBe(35);
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
    expect(ageFrom(0, NOW)).toBe(32);
  });

  it('obiettivo dimagrimento riduce le calorie e porta le proteine a 2,2 g/kg (§ 2.1), come la proposta di obiettivi', () => {
    const base = computeTargets(profile, 74, NOW);
    const cut = computeTargets({ ...profile, goal: 'dimagrimento' }, 74, NOW);
    expect(cut.palestra.kcal).toBeLessThan(base.palestra.kcal);
    expect(base.palestra.proteinG).toBe(Math.round((1.9 * 74) / 5) * 5);
    expect(cut.palestra.proteinG).toBe(Math.round((2.2 * 74) / 5) * 5);
    expect(cut.palestra.proteinG).toBe(targetsForGoal(base, 0, 'dimagrimento', { weightKg: 74 }).targets.palestra.proteinG);
    for (const goal of ['ricomposizione', 'mantenimento', 'massa'] as const) {
      expect(computeTargets({ ...profile, goal }, 74, NOW).palestra.proteinG).toBe(base.palestra.proteinG);
    }
  });
});

describe('obiettivi delle proposte (fase 2, § 2.1)', () => {
  const targets = computeTargets(profile, 74, NOW);

  it('dimagrimento: −350 kcal dal dispendio, proteine 2,2 g/kg, grassi e fibre come oggi', () => {
    const t = targetsForGoal(targets, 0, 'dimagrimento', { weightKg: 74, maxDeficitKcal: 500 });
    expect(t.goalDeltaKcal).toBe(-350);
    expect(t.capped).toBe(false);
    expect(t.targets.palestra.kcal).toBe(targets.palestra.kcal - 350);
    expect(t.targets.palestra.proteinG).toBe(Math.round((PROTEIN_G_PER_KG_BY_GOAL.dimagrimento * 74) / 5) * 5);
    expect(t.targets.palestra.fatG).toBe(targets.palestra.fatG);
    expect(t.targets.riposo.fiberG).toBe(targets.riposo.fiberG);
    for (const d of Object.values(t.targets)) expect(Math.abs(d.proteinG * 4 + d.fatG * 9 + d.carbG * 4 - d.kcal)).toBeLessThanOrEqual(20);
  });

  it('dal dimagrimento alla ricomposizione si torna al dispendio; il deficit non supera il tetto dato', () => {
    const cut = targetsForGoal(targets, 0, 'dimagrimento', { weightKg: 74 }).targets;
    const back = targetsForGoal(cut, -350, 'ricomposizione', { weightKg: 74 });
    expect(back.goalDeltaKcal).toBe(0);
    expect(back.targets.palestra.kcal).toBe(targets.palestra.kcal);
    expect(back.targets.palestra.proteinG).toBe(targets.palestra.proteinG);
    const capped = targetsForGoal(targets, 0, 'dimagrimento', { maxDeficitKcal: 300 });
    expect(capped).toMatchObject({ goalDeltaKcal: -300, capped: true });
    expect(targetsForGoal(targets, 0, 'massa').goalDeltaKcal).toBe(250);
  });

  it('senza peso le proteine restano quelle di oggi', () => {
    expect(targetsForGoal(targets, 0, 'dimagrimento').targets.calcio.proteinG).toBe(targets.calcio.proteinG);
  });
});
