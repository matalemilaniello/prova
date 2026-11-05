/**
 * Ricette da portare e freschi nuovi (docs/FASE2.md § 4.10): un pasto che cade nel lavoro prende solo ricette che si
 * portano via; i freschi nuovi hanno la loro stagione.
 */
import { describe, expect, it } from 'vitest';
import { FOODS } from './foods';
import { FOOD_FACTS, NEW_SEASONAL_FOODS } from './foodFacts';
import { RECIPES } from './recipes';
import { RECIPE_FACTS } from './recipeFacts';

/** Alimenti deperibili: fuori dal freddo al massimo poche ore, nella borsa termica. */
const PERISHABLE_GROUPS = new Set(['pollame', 'carne-rossa', 'pesce', 'pesce-grasso', 'uova']);
const FRESH_DAIRY = new Set(['yogurt-greco-0', 'yogurt-greco-2', 'skyr', 'latte', 'kefir', 'fiocchi-latte', 'ricotta', 'feta']);

describe('ricette da portare', () => {
  it('ogni spuntino «da portare» si porta via', () => {
    for (const r of Object.values(RECIPES)) if (r.tags.includes('da portare')) expect(RECIPE_FACTS[r.id].carry, r.id).toBeDefined();
  });

  it('con alimenti deperibili o cereali cotti viaggiano nella borsa termica', () => {
    for (const r of Object.values(RECIPES)) {
      const carry = RECIPE_FACTS[r.id].carry;
      // Le ricette «senza frigo» lo dichiarano: pane, formaggio stagionato, frutta, frutta secca, barrette cotte in forno.
      if (!carry || r.tags.includes('senza frigo')) continue;
      const perishable = r.ingredients.some((l) => PERISHABLE_GROUPS.has(FOOD_FACTS[l.foodId]?.group ?? '') || FRESH_DAIRY.has(l.foodId) || /cott|rinvenut/.test(FOODS[l.foodId]?.name ?? ''));
      if (perishable) expect(carry, r.id).toBe('borsa-termica');
    }
  });

  it('ci sono ricette da portare per ogni pasto, anche il pre-calcio e la cena di recupero', () => {
    for (const slot of ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'] as const) {
      expect(Object.values(RECIPES).some((r) => r.slots.includes(slot) && RECIPE_FACTS[r.id].carry), slot).toBe(true);
    }
    expect(Object.values(RECIPES).some((r) => r.tags.includes('pre-calcio') && RECIPE_FACTS[r.id].carry)).toBe(true);
    expect(Object.values(RECIPES).some((r) => r.tags.includes('recupero') && RECIPE_FACTS[r.id].carry)).toBe(true);
  });
});

describe('freschi nuovi del menù generato', () => {
  it('sono nell’archivio, con una stagione `strict` e una ricetta che li usa', () => {
    for (const id of NEW_SEASONAL_FOODS) {
      expect(FOODS[id], id).toBeDefined();
      expect(FOOD_FACTS[id].season?.strict, id).toBe(true);
      expect(Object.values(RECIPES).some((r) => r.ingredients.some((l) => l.foodId === id)), id).toBe(true);
    }
  });

  it('due pre-calcio senza banana né miele, così le esclusioni più comuni lasciano una merenda', () => {
    const pre = Object.values(RECIPES).filter((r) => r.tags.includes('pre-calcio') && !r.ingredients.some((l) => l.foodId === 'banana' || l.foodId === 'miele'));
    expect(pre.length).toBeGreaterThanOrEqual(2);
  });
});
