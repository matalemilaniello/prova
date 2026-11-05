import { describe, expect, it } from 'vitest';
import { ESTIMATE_FOOD_FACTS, ESTIMATE_FOODS } from './estimateFoods';
import { FOODS } from './foods';
import { RECIPES } from './recipes';
import { validPer100g } from '../engine/estimate';

const GROUPS = new Set([
  'carne-rossa', 'carne-lavorata', 'pollame', 'pesce', 'pesce-grasso', 'uova', 'legumi', 'cereale-integrale', 'cereale-raffinato',
  'patate', 'verdura', 'frutta', 'frutta-essiccata', 'frutta-guscio', 'latticini', 'condimento', 'dolce',
]);

describe('alimenti di sola stima (§ 7.3)', () => {
  it('sono tra 25 e 35, con id unici che non coincidono con l’archivio', () => {
    expect(ESTIMATE_FOODS.length).toBeGreaterThanOrEqual(25);
    expect(ESTIMATE_FOODS.length).toBeLessThanOrEqual(35);
    const ids = ESTIMATE_FOODS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(FOODS[id], id).toBeUndefined();
  });

  it('copertura dei fatti: ogni alimento ha i suoi, e solo quelli', () => {
    const ids = new Set(ESTIMATE_FOODS.map((f) => f.id));
    for (const id of ids) {
      const facts = ESTIMATE_FOOD_FACTS[id];
      expect(facts, id).toBeDefined();
      expect(GROUPS.has(facts.group), id).toBe(true);
      if (facts.freeSugarG !== undefined) expect(facts.freeSugarG).toBeGreaterThanOrEqual(0);
    }
    for (const id of Object.keys(ESTIMATE_FOOD_FACTS)) expect(ids.has(id), id).toBe(true);
  });

  it('i valori per 100 g passano gli stessi controlli dei valori del coach (Atwater compreso)', () => {
    for (const f of ESTIMATE_FOODS) {
      expect(validPer100g(f.per100g), f.id).toEqual(f.per100g);
      // Zuccheri liberi mai oltre i carboidrati disponibili.
      const sugar = ESTIMATE_FOOD_FACTS[f.id].freeSugarG ?? 0;
      expect(sugar, f.id).toBeLessThanOrEqual(f.per100g.carbG);
      for (const g of Object.values(f.unitGrams)) expect(g, f.id).toBeGreaterThan(0);
    }
  });

  it('i salumi sono carne lavorata: la revisione li conta (B2)', () => {
    for (const id of ['prosciutto-crudo', 'prosciutto-cotto', 'salame', 'mortadella', 'bresaola', 'wurstel']) {
      expect(ESTIMATE_FOOD_FACTS[id].group, id).toBe('carne-lavorata');
    }
    expect(ESTIMATE_FOOD_FACTS.sushi.rice).toBe(true);
    expect(ESTIMATE_FOOD_FACTS.risotto.rice).toBe(true);
  });

  it('non entrano mai nel menù: nessuna ricetta li usa', () => {
    const ids = new Set(ESTIMATE_FOODS.map((f) => f.id));
    for (const r of Object.values(RECIPES)) for (const l of r.ingredients) expect(ids.has(l.foodId), `${r.id}: ${l.foodId}`).toBe(false);
  });
});
