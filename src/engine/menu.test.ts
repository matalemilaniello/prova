import { describe, expect, it } from 'vitest';
import type { AppData, MenuWeek } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import { dayTypeFor, effectiveDayType, isMatchEve, mealsForDate, menuDayFor, menuWeekFor, rotationIndexFor } from './menu';
import { dayNutrition, dayNutritionDetail } from './nutrition';

const week = (tag: string): MenuWeek => ({
  days: Array.from({ length: 7 }, (_, i) => ({
    meals: { colazione: `${tag}-col-${i}`, pranzo: `${tag}-pra-${i}`, cena: `${tag}-cen-${i}` },
  })),
  prep: [],
});

const rotation = [week('A'), week('B')];
const plan = defaultPlan('2026-11-09');
const state: Pick<AppData, 'plan' | 'dayLogs'> = { plan, dayLogs: {} };

describe('rotazione del menù', () => {
  it('alterna le settimane dall’inizio del piano', () => {
    expect(rotationIndexFor('2026-11-09', plan.startDate, rotation)).toBe(0);
    expect(rotationIndexFor('2026-11-15', plan.startDate, rotation)).toBe(0);
    expect(rotationIndexFor('2026-11-16', plan.startDate, rotation)).toBe(1);
    expect(rotationIndexFor('2026-11-23', plan.startDate, rotation)).toBe(0);
    // Prima dell'inizio del piano non si rompe.
    expect(rotationIndexFor('2026-11-02', plan.startDate, rotation)).toBe(1);
  });

  it('sceglie il giorno della settimana giusto', () => {
    expect(menuDayFor('2026-11-11', plan.startDate, rotation)?.meals.pranzo).toBe('A-pra-2');
    expect(menuDayFor('2026-11-22', plan.startDate, rotation)?.meals.cena).toBe('B-cen-6');
  });

  it('rotazione vuota: nessun errore e nessun pasto', () => {
    expect(menuWeekFor('2026-11-11', plan.startDate, [])).toBeUndefined();
    const m = mealsForDate('2026-11-11', state, []);
    expect(m.meals).toEqual([]);
    expect(m.dayType).toBe('calcio');
    expect(dayNutrition('2026-11-11', state).kcal).toBeGreaterThanOrEqual(0);
  });

  it('applica le sostituzioni del diario', () => {
    const s: Pick<AppData, 'plan' | 'dayLogs'> = {
      plan,
      dayLogs: {
        '2026-11-10': {
          date: '2026-11-10',
          status: {},
          notes: {},
          minimal: false,
          waterGlasses: 0,
          sweets: 0,
          recipeSwaps: { pranzo: 'altra-ricetta' },
        },
      },
    };
    const m = mealsForDate('2026-11-10', s, rotation);
    expect(m.bySlot.pranzo?.recipeId).toBe('altra-ricetta');
    expect(m.bySlot.pranzo?.plannedId).toBe('A-pra-1');
    expect(m.bySlot.pranzo?.swapped).toBe(true);
    expect(m.bySlot.cena?.swapped).toBe(false);
    expect(m.meals.map((x) => x.slot)).toEqual(['colazione', 'pranzo', 'cena']);
  });

  it('tipo di giorno dal piano', () => {
    expect(dayTypeFor('2026-11-09', plan)).toBe('calcio');
    expect(dayTypeFor('2026-11-10', plan)).toBe('palestra');
    expect(dayTypeFor('2026-11-14', plan)).toBe('leggero');
    expect(dayTypeFor('2026-11-15', plan)).toBe('riposo');
  });

  it('dettaglio della giornata coerente con il totale', () => {
    const d = dayNutritionDetail('2026-11-10', state);
    expect(d.dayType).toBe('palestra');
    expect(d.total.kcal).toBeCloseTo(dayNutrition('2026-11-10', state).kcal, 6);
    expect(dayNutrition('2026-11-10', state, { onlyDone: true }).kcal).toBe(0);
  });
});

describe('vigilia della partita', () => {
  it('la domenica prima della partita del lunedì mangia come un giorno di calcio', () => {
    // 2026-11-15 è domenica (riposo nella settimana tipo), lunedì 16 c'è la partita.
    expect(dayTypeFor('2026-11-15', plan)).toBe('riposo');
    expect(isMatchEve('2026-11-15', plan)).toBe(true);
    expect(effectiveDayType('2026-11-15', plan)).toBe('calcio');
    const m = mealsForDate('2026-11-15', state, rotation);
    expect(m.dayType).toBe('calcio');
    expect(m.scheduledDayType).toBe('riposo');
    expect(m.matchEve).toBe(true);
  });

  it('negli altri giorni il tipo resta quello del piano', () => {
    expect(effectiveDayType('2026-11-14', plan)).toBe('leggero');
    expect(isMatchEve('2026-11-14', plan)).toBe(false);
    expect(effectiveDayType('2026-11-16', plan)).toBe('calcio');
    expect(isMatchEve('', plan)).toBe(false);
    // Senza partita il lunedì, la domenica torna di riposo.
    const noMatch = { ...plan, week: plan.week.map((d) => (d.weekday === 0 ? { ...d, football: undefined } : d)) };
    expect(effectiveDayType('2026-11-15', noMatch)).toBe('riposo');
  });
});
