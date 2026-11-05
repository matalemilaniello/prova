/**
 * Piano B e esclusioni (docs/FASE2.md § 6.5; § 13.4 test 13: mai un alimento escluso nel piano B). Dati inventati.
 */
import { describe, expect, it } from 'vitest';
import { BAR_OPTIONS } from '../../data/barPlanB';
import { FOODS } from '../../data/foods';
import { MEAL_SLOTS } from '../../engine/menu';
import { allowedCombo, barCombo, barOptionsFor, COMBO_WITHOUT_EXCLUDED, fitCombo, optionsById } from './barPick';

const ALCOHOL = /\b(vino|birra|spritz|aperitivo|cocktail|liquore|grappa)\b/i;

describe('piano B senza gli esclusi', () => {
  it('gli alimenti di `contains` sono dell’archivio, senza dispensa', () => {
    for (const o of BAR_OPTIONS) {
      for (const id of o.contains ?? []) {
        expect(FOODS[id], `${o.id}: ${id}`).toBeDefined();
        expect(FOODS[id].pantry, `${o.id}: ${id}`).toBeFalsy();
      }
      // Nessuna opzione con alcol (A2).
      expect(ALCOHOL.test(`${o.name} ${o.why}`), o.id).toBe(false);
    }
  });

  it('un’opzione con un alimento escluso non compare', () => {
    const none = barOptionsFor(new Set());
    expect(none).toEqual(BAR_OPTIONS);
    const noTuna = barOptionsFor(new Set(['tonno']));
    expect(noTuna.some((o) => o.id === 'tramezzino')).toBe(false);
    expect(noTuna.some((o) => o.id === 'panino-pollo')).toBe(true);
    for (const food of ['pane-bianco', 'latte', 'yogurt-greco-2', 'pollo', 'arancia']) {
      for (const o of barOptionsFor(new Set([food]))) expect(o.contains ?? [], `${food}: ${o.id}`).not.toContain(food);
    }
  });

  it('la combinazione consigliata perde le voci escluse e lo dice', () => {
    const options = barOptionsFor(new Set(['latte']));
    const base = barCombo('colazione', 'palestra', false);
    expect(base.ids).toContain('cappuccino');
    const c = allowedCombo(base, options);
    expect(c.ids).not.toContain('cappuccino');
    expect(c.why).toBe(COMBO_WITHOUT_EXCLUDED);
    expect(allowedCombo(base, BAR_OPTIONS)).toBe(base);
    for (const slot of MEAL_SLOTS) {
      const fitted = fitCombo(allowedCombo(barCombo(slot, 'calcio', slot === 'merenda'), options), 'calcio', { kcal: 900, carbG: 140 }, slot, options);
      expect(fitted.ids.every((id) => options.some((o) => o.id === id)), slot).toBe(true);
      expect(optionsById(fitted.ids, options).length, slot).toBe(fitted.ids.length);
    }
  });
});
