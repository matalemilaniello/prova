/**
 * Numeri della prevenzione (docs/FASE2.md § 4.2, § 4.7; § 13.4 test 14 sulla rotazione). Gli alimenti di sola stima si
 * provano con fatti iniettati.
 */
import { describe, expect, it } from 'vitest';
import type { DayType, MealSlot } from '../domain/types';
import type { FoodFacts } from '../data/foodFactsTypes';
import { factsOf } from '../data/foodFacts';
import { MENU_ROTATION, STARTER_WEEK } from '../data/menu';
import { RECIPES } from '../data/recipes';
import {
  FREE_SUGAR_MAX_SHARE,
  LEGUME_SERVINGS_MAX_PER_DAY,
  MIN_LEGUME_MEALS,
  MIN_WHOLE_GRAIN_G,
  RED_MEAT_MAX_G,
  RED_MEAT_MAX_MEALS,
  RICE_MAX_MEALS,
  mealFromEaten,
  mealFromRecipe,
  mealPrevention,
  weekPreventionStats,
  type PlannedMeal,
} from './prevention';

/** Tipo di giorno delle porzioni con la settimana predefinita (la domenica è la vigilia della partita del lunedì). */
const PORTION_TYPES: DayType[] = ['calcio', 'palestra', 'calcio', 'calcio', 'palestra', 'leggero', 'calcio'];

function weekMeals(week: (typeof MENU_ROTATION)[number]): PlannedMeal[] {
  return week.days.flatMap((d, di) =>
    (Object.entries(d.meals) as [MealSlot, string][]).map(([slot, id]) => mealFromRecipe(RECIPES[id], PORTION_TYPES[di], 1, di, slot)),
  );
}

describe('la rotazione rispetta A1-A10 (test 14)', () => {
  MENU_ROTATION.forEach((week, wi) => {
    it(`settimana ${wi + 1}`, () => {
      const s = weekPreventionStats(weekMeals(week));
      expect(s.processedMeals).toBe(0);
      expect(s.redMeatMeals).toBeLessThanOrEqual(RED_MEAT_MAX_MEALS);
      expect(s.redMeatG).toBeLessThanOrEqual(RED_MEAT_MAX_G);
      expect(s.riceMeals).toBeLessThanOrEqual(RICE_MAX_MEALS);
      expect(s.legumeMeals).toBeGreaterThanOrEqual(MIN_LEGUME_MEALS);
      expect(s.maxLegumeServingsPerDay).toBeLessThanOrEqual(LEGUME_SERVINGS_MAX_PER_DAY);
      expect(s.wholeGrainDryG / 7).toBeGreaterThanOrEqual(MIN_WHOLE_GRAIN_G);
      expect(s.freeSugarShare!).toBeLessThan(FREE_SUGAR_MAX_SHARE);
      expect(s.vegPortions / 7).toBeGreaterThanOrEqual(5);
      expect(s.fishMeals).toBeGreaterThanOrEqual(2);
      expect(s.days).toBe(7);
      expect(s.meals).toBe(35);
    });
  });

  it('il menù di avvio non ha carni lavorate, alcol né prodotti di riso', () => {
    const s = weekPreventionStats(weekMeals(STARTER_WEEK));
    expect(s.processedMeals).toBe(0);
    expect(s.riceMeals).toBe(0);
  });
});

describe('pasti stimati', () => {
  const salame: FoodFacts = { group: 'carne-lavorata' };
  const facts = (id: string) => (id === 'salame-di-prova' ? salame : factsOf(id));

  it('un pasto stimato conta per i suoi alimenti; un ordine del bar senza alimenti non conta', () => {
    expect(mealFromEaten({ nutrients: { kcal: 400, proteinG: 20, carbG: 50, fatG: 10, fiberG: 3 } }, '2026-11-10', 'pranzo')).toBeNull();
    const m = mealFromEaten(
      {
        nutrients: { kcal: 620, proteinG: 30, carbG: 60, fatG: 25, fiberG: 4 },
        items: [
          { foodId: 'pane-bianco', grams: 100 },
          { foodId: 'salame-di-prova', grams: 50 },
          { grams: 30, label: 'salsa', per100g: { kcal: 300, proteinG: 0, carbG: 10, fatG: 30, fiberG: 0 } },
        ],
      },
      '2026-11-10',
      'pranzo',
    )!;
    expect(m.items).toEqual([
      { foodId: 'pane-bianco', grams: 100 },
      { foodId: 'salame-di-prova', grams: 50 },
    ]);
    expect(m.kcal).toBe(620);
    const p = mealPrevention(m, { facts });
    expect(p.processedG).toBe(50);
    expect(p.kcal).toBe(620);
    expect(weekPreventionStats([m], { facts }).processedMeals).toBe(1);
    // Senza i fatti iniettati l'alimento sconosciuto non conta.
    expect(mealPrevention(m).processedG).toBe(0);
  });

  it('le porzioni di vegetali e le kcal si ricavano dagli alimenti quando mancano', () => {
    const m: PlannedMeal = { day: 0, slot: 'cena', items: [{ foodId: 'zucchine', grams: 160 }, { foodId: 'patate', grams: 200 }] };
    const p = mealPrevention(m);
    expect(p.vegPortions).toBeCloseTo(2, 6);
    expect(p.kcal).toBeCloseTo((160 * 18 + 200 * 85) / 100, 6);
  });

  it('legumi: piatto di legumi solo a pranzo e cena oltre 100 g, porzione oltre 60 g equivalenti', () => {
    expect(mealPrevention({ day: 0, slot: 'cena', items: [{ foodId: 'ceci', grams: 120 }] }).legumeMeal).toBe(true);
    expect(mealPrevention({ day: 0, slot: 'spuntino', items: [{ foodId: 'ceci', grams: 120 }] }).legumeMeal).toBe(false);
    expect(mealPrevention({ day: 0, slot: 'spuntino', items: [{ foodId: 'ceci-tostati', grams: 30 }] }).legumeServing).toBe(true);
    expect(mealPrevention({ day: 0, slot: 'pranzo', items: [{ foodId: 'ceci', grams: 40 }] }).legumeServing).toBe(false);
  });

  it('è deterministica', () => {
    const meals = weekMeals(MENU_ROTATION[0]);
    expect(weekPreventionStats(meals)).toEqual(weekPreventionStats(JSON.parse(JSON.stringify(meals))));
  });
});
