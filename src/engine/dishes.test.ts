import { describe, expect, it } from 'vitest';
import type { DayLog, EatenMeal, MyDish } from '../domain/types';
import { RECIPES } from '../data/recipes';
import {
  dishAsRecipe,
  dishMatchesPlanned,
  dishMeal,
  dishReadyForMenu,
  dishUsage,
  newDish,
  scaleDish,
  searchDishes,
  sortDishes,
  unusedDishes,
} from './dishes';
import { estimatedItemsValues } from './estimate';

const dish = (over: Partial<MyDish> = {}): MyDish => {
  const items = over.items ?? [
    { foodId: 'pasta', grams: 220 },
    { foodId: 'ceci', grams: 80 },
    { foodId: 'passata', grams: 100 },
    { foodId: 'olio-evo', grams: 10, role: 'condimento' as const },
  ];
  const v = estimatedItemsValues(items);
  return { id: 'p1', name: 'Pasta e ceci', slots: ['pranzo'], items, nutrients: v.nutrients, vegPortions: v.vegPortions, createdAt: '2026-11-01T12:00:00.000Z', source: 'foto', ...over };
};

const log = (date: string, meals: DayLog['barMeals'], status: DayLog['status']): DayLog => ({
  date,
  status,
  notes: {},
  minimal: false,
  waterGlasses: 0,
  sweets: 0,
  recipeSwaps: {},
  barMeals: meals,
});

describe('porzioni (§ 8.2)', () => {
  it('scaleDish è lineare, condimenti compresi (test 27)', () => {
    const d = dish();
    const one = scaleDish(d, 1);
    const half = scaleDish(d, 0.5);
    const big = scaleDish(d, 1.5);
    expect(one.nutrients).toEqual(d.nutrients);
    expect(half.items.map((i) => i.grams)).toEqual([110, 40, 50, 5]);
    expect(big.items.map((i) => i.grams)).toEqual([330, 120, 150, 15]);
    for (const k of ['kcal', 'proteinG', 'carbG', 'fatG', 'fiberG'] as const) {
      expect(half.nutrients[k]).toBeCloseTo(one.nutrients[k] * 0.5, 0);
      expect(big.nutrients[k]).toBeCloseTo(one.nutrients[k] * 1.5, 0);
    }
    expect(Math.abs(big.vegPortions - one.vegPortions * 1.5)).toBeLessThanOrEqual(0.1);
  });

  it('il pasto di un piatto: provenienza, id, porzione; «previsto» con il 60% della ricetta', () => {
    const d = dish();
    const planned = RECIPES['pasta-ceci-rosmarino'];
    expect(dishMatchesPlanned(d, planned)).toBe(true);
    expect(dishMatchesPlanned(dish({ items: [{ foodId: 'pasta', grams: 200 }] }), planned)).toBe(false);
    const meal = dishMeal(d, 1.5, true);
    expect(meal).toMatchObject({ label: 'Pasta e ceci', source: 'piatto', dishId: 'p1', portion: 1.5, asPlanned: true });
    expect(meal.nutrients).toEqual(scaleDish(d, 1.5).nutrients);
    expect(dishMeal(d, 1, false).asPlanned).toBeUndefined();
  });

  it('un piatto nuovo: id e data da chi chiama, solo alimenti con i valori, nome su una riga', () => {
    const d = newDish({
      id: 'p9',
      name: '  Pasta\n e ceci  ',
      slot: 'cena',
      items: [{ foodId: 'pasta', grams: 200 }, { label: 'Senza valori', grams: 20 }],
      createdAt: '2026-11-05T20:00:00.000Z',
    });
    expect(d).toMatchObject({ id: 'p9', name: 'Pasta e ceci', slots: ['cena'], items: [{ foodId: 'pasta', grams: 200 }], source: 'foto' });
    expect(newDish({ id: 'x', name: '', slot: 'cena', items: [{ foodId: 'pasta', grams: 1 }], createdAt: '' })).toBeNull();
    expect(newDish({ id: 'x', name: 'Niente', slot: 'cena', items: [{ label: 'Senza valori', grams: 20 }], createdAt: '' })).toBeNull();
  });
});

describe('usi e ordine (§ 8.2)', () => {
  const meal = (dishId: string): EatenMeal => ({ label: 'x', nutrients: { kcal: 500, proteinG: 20, carbG: 50, fatG: 10, fiberG: 5 }, source: 'piatto', dishId, portion: 1 });

  it('dishUsage conta solo i pasti che valgono e i piatti che esistono (test 27)', () => {
    const logs: Record<string, DayLog> = {
      '2026-11-02': log('2026-11-02', { pranzo: meal('a'), cena: meal('b') }, { 'pasto:pranzo': 'sostituito', 'pasto:cena': 'sostituito' }),
      '2026-11-03': log('2026-11-03', { pranzo: { ...meal('a'), asPlanned: true } }, { 'pasto:pranzo': 'fatto' }),
      // Fatto senza asPlanned: la stima non vale e non conta.
      '2026-11-04': log('2026-11-04', { pranzo: meal('b') }, { 'pasto:pranzo': 'fatto' }),
      // Un piatto eliminato non conta.
      '2026-11-05': log('2026-11-05', { cena: meal('tolto') }, { 'pasto:cena': 'sostituito' }),
      // Un ordine del bar non è un piatto.
      '2026-11-06': log('2026-11-06', { cena: { ...meal('a'), source: 'bar' } }, { 'pasto:cena': 'sostituito' }),
    };
    expect(dishUsage(logs, [{ id: 'a' }, { id: 'b' }])).toEqual({ a: { count: 2, last: '2026-11-03' }, b: { count: 1, last: '2026-11-02' } });
  });

  it('prima quelli nati nello stesso pasto, poi i più usati, poi i più recenti', () => {
    const a = dish({ id: 'a', name: 'Alfa', slots: ['pranzo'], createdAt: '2026-10-01T10:00:00.000Z' });
    const b = dish({ id: 'b', name: 'Beta', slots: ['pranzo'], createdAt: '2026-10-20T10:00:00.000Z' });
    const c = dish({ id: 'c', name: 'Gamma', slots: ['cena'], createdAt: '2026-10-25T10:00:00.000Z' });
    const d = dish({ id: 'd', name: 'Delta', slots: ['pranzo'], createdAt: '2026-10-30T10:00:00.000Z' });
    const usage = { a: { count: 3, last: '2026-10-28' }, c: { count: 9, last: '2026-11-01' }, b: { count: 3, last: '2026-11-02' } };
    expect(sortDishes([a, b, c, d], usage, 'pranzo').map((x) => x.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(sortDishes([a, b, c, d], usage).map((x) => x.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(sortDishes([a, b, c, d], usage, 'pranzo')).toEqual(sortDishes([d, c, b, a], usage, 'pranzo'));
    expect(unusedDishes([a, b, c, d], usage).map((x) => x.id)).toEqual(['d']);
  });

  it('ricerca senza accenti né maiuscole', () => {
    const list = [dish({ id: 'a', name: 'Insalata di farro' }), dish({ id: 'b', name: 'Caffè e cornetto' })];
    expect(searchDishes(list, 'FARRO').map((d) => d.id)).toEqual(['a']);
    expect(searchDishes(list, 'caffe corn').map((d) => d.id)).toEqual(['b']);
    expect(searchDishes(list, '  ')).toHaveLength(2);
  });
});

describe('pronti per il menù (§ 8.4)', () => {
  it('tutti gli alimenti dell’archivio, tranne condimenti sotto il 5% delle kcal', () => {
    expect(dishReadyForMenu(dish())).toBe(true);
    const withEstimate = dish({ items: [{ foodId: 'pizza-margherita', grams: 300 }] });
    expect(dishReadyForMenu(withEstimate)).toBe(false);
    const smallSauce = dish({ items: [{ foodId: 'pasta', grams: 250 }, { foodId: 'pesto', grams: 3, role: 'condimento' }] });
    expect(dishReadyForMenu(smallSauce)).toBe(true);
    const bigSauce = dish({ items: [{ foodId: 'pasta', grams: 250 }, { foodId: 'pesto', grams: 40, role: 'condimento' }] });
    expect(dishReadyForMenu(bigSauce)).toBe(false);
  });

  it('dishAsRecipe: una ricetta in grammi con gli alimenti dell’archivio', () => {
    const r = dishAsRecipe(dish());
    expect(r).toMatchObject({ id: 'piatto:p1', name: 'Pasta e ceci', slots: ['pranzo'], prepMin: 0 });
    expect(r?.ingredients).toEqual([
      { foodId: 'pasta', qty: 220, unit: 'g' },
      { foodId: 'ceci', qty: 80, unit: 'g' },
      { foodId: 'passata', qty: 100, unit: 'g' },
      { foodId: 'olio-evo', qty: 10, unit: 'g' },
    ]);
    expect(dishAsRecipe(dish({ items: [{ foodId: 'pizza-margherita', grams: 300 }] }))).toBeNull();
  });
});
