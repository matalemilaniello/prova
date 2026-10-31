import { describe, expect, it } from 'vitest';
import type { Food, IngredientLine, Recipe } from '../domain/types';
import {
  carbFactor,
  formatPortion,
  lineGrams,
  portionParts,
  portionWords,
  recipeNutrition,
  recipeVegPortions,
  roundGrams,
  roundHalf,
} from './nutrition';

const foods: Record<string, Food> = {
  riso: {
    id: 'riso',
    name: 'Riso cotto',
    category: 'Pane e cereali',
    per100g: { kcal: 130, proteinG: 2.7, carbG: 28, fatG: 0.3, fiberG: 0.4 },
    unitGrams: { pugno: 150 },
    buyFactor: 0.4,
  },
  pollo: {
    id: 'pollo',
    name: 'Petto di pollo',
    category: 'Carne e pesce',
    per100g: { kcal: 110, proteinG: 23, carbG: 0, fatG: 1.5, fiberG: 0 },
    unitGrams: { palmo: 120 },
  },
  olio: {
    id: 'olio',
    name: 'Olio extravergine',
    category: 'Condimenti',
    per100g: { kcal: 899, proteinG: 0, carbG: 0, fatG: 99.9, fiberG: 0 },
    unitGrams: { cucchiaio: 10, cucchiaino: 4, ml: 0.92 },
    pantry: true,
  },
  latte: {
    id: 'latte',
    name: 'Latte',
    category: 'Latticini e uova',
    per100g: { kcal: 46, proteinG: 3.3, carbG: 4.9, fatG: 1.5, fiberG: 0 },
    unitGrams: { tazza: 250 },
  },
  zucchine: {
    id: 'zucchine',
    name: 'Zucchine',
    category: 'Surgelati',
    per100g: { kcal: 17, proteinG: 1.2, carbG: 2.2, fatG: 0.3, fiberG: 1.2 },
    unitGrams: { pugno: 100 },
    vegPortionG: 80,
  },
  pane: {
    id: 'pane',
    name: 'Pane integrale',
    category: 'Pane e cereali',
    per100g: { kcal: 240, proteinG: 9, carbG: 42, fatG: 3, fiberG: 7 },
    unitGrams: { fetta: 40 },
  },
};

const line = (l: Partial<IngredientLine> & Pick<IngredientLine, 'foodId' | 'qty' | 'unit'>): IngredientLine => l;

describe('lineGrams (semantica vincolante)', () => {
  it("unit 'g' → qty grammi", () => {
    expect(lineGrams(line({ foodId: 'pollo', qty: 130, unit: 'g' }), 'palestra', foods)).toBe(130);
  });
  it("unit 'ml' → qty × unitGrams.ml (default 1)", () => {
    expect(lineGrams(line({ foodId: 'olio', qty: 10, unit: 'ml' }), 'palestra', foods)).toBeCloseTo(9.2);
    expect(lineGrams(line({ foodId: 'latte', qty: 200, unit: 'ml' }), 'palestra', foods)).toBe(200);
  });
  it('altre unità → qty × unitGrams[unit]', () => {
    expect(lineGrams(line({ foodId: 'riso', qty: 1.5, unit: 'pugno' }), 'palestra', foods)).toBe(225);
    expect(lineGrams(line({ foodId: 'olio', qty: 2, unit: 'cucchiaio' }), 'palestra', foods)).toBe(20);
  });
  it('unità mancante → 0 senza eccezioni', () => {
    expect(lineGrams(line({ foodId: 'pollo', qty: 1, unit: 'pugno' }), 'palestra', foods)).toBe(0);
    expect(lineGrams(line({ foodId: 'sconosciuto', qty: 1, unit: 'pugno' }), 'palestra', foods)).toBe(0);
  });
  it('carbScaled moltiplica per il fattore del tipo di giorno', () => {
    const l = line({ foodId: 'riso', qty: 1, unit: 'pugno', carbScaled: true });
    expect(lineGrams(l, 'calcio', foods)).toBe(187.5);
    expect(lineGrams(l, 'palestra', foods)).toBe(150);
    expect(lineGrams(l, 'leggero', foods)).toBe(135);
    expect(lineGrams(l, 'riposo', foods)).toBe(112.5);
    const g = line({ foodId: 'riso', qty: 200, unit: 'g', carbScaled: true });
    expect(lineGrams(g, 'riposo', foods)).toBe(150);
  });
  it('fattori dei carboidrati', () => {
    expect(carbFactor('calcio')).toBe(1.25);
    expect(carbFactor('palestra')).toBe(1);
    expect(carbFactor('leggero')).toBe(0.9);
    expect(carbFactor('riposo')).toBe(0.75);
  });
});

describe('valori delle ricette', () => {
  const recipe: Recipe = {
    id: 'r',
    name: 'Riso, pollo e zucchine',
    slots: ['pranzo'],
    ingredients: [
      line({ foodId: 'riso', qty: 1, unit: 'pugno', carbScaled: true }),
      line({ foodId: 'pollo', qty: 1, unit: 'palmo' }),
      line({ foodId: 'zucchine', qty: 2, unit: 'pugno' }),
      line({ foodId: 'olio', qty: 1, unit: 'cucchiaio' }),
    ],
    steps: [],
    prepMin: 10,
    tags: [],
  };

  it('nutrienti = grammi × per100g / 100', () => {
    const n = recipeNutrition(recipe, 'palestra', foods);
    expect(n.kcal).toBeCloseTo(195 + 132 + 34 + 89.9, 1);
    expect(n.proteinG).toBeCloseTo(4.05 + 27.6 + 2.4, 2);
    expect(n.fiberG).toBeCloseTo(0.6 + 2.4, 2);
  });

  it('il giorno di calcio ha più carboidrati, le proteine non cambiano', () => {
    const calcio = recipeNutrition(recipe, 'calcio', foods);
    const riposo = recipeNutrition(recipe, 'riposo', foods);
    expect(calcio.carbG).toBeGreaterThan(riposo.carbG);
    expect(calcio.proteinG - riposo.proteinG).toBeCloseTo(2.7 * (1.875 - 1.125), 3);
  });

  it('porzioni di vegetali = grammi / vegPortionG', () => {
    expect(recipeVegPortions(recipe, 'palestra', foods)).toBeCloseTo(2.5);
  });

  it('ricetta assente → zero', () => {
    expect(recipeNutrition(undefined, 'calcio', foods).kcal).toBe(0);
    expect(recipeVegPortions(undefined, 'calcio', foods)).toBe(0);
  });
});

describe('porzioni a occhio', () => {
  it('arrotonda a mezze unità', () => {
    expect(roundHalf(1.25)).toBe(1.5);
    expect(roundHalf(1.2)).toBe(1);
    expect(roundHalf(0.2)).toBe(0.5);
    expect(roundHalf(0)).toBe(0);
  });

  it('parole italiane con genere e plurale', () => {
    expect(portionWords(1.5, 'pugno')).toBe('1 pugno e mezzo');
    expect(portionWords(0.5, 'pugno')).toBe('mezzo pugno');
    expect(portionWords(2, 'cucchiaio')).toBe('2 cucchiai');
    expect(portionWords(1.5, 'fetta')).toBe('1 fetta e mezza');
    expect(portionWords(0.5, 'fetta')).toBe('mezza fetta');
    expect(portionWords(2.5, 'manciata')).toBe('2 manciate e mezza');
    expect(portionWords(1, 'mano a coppa')).toBe('1 mano a coppa');
  });

  it('grammi arrotondati in modo umano', () => {
    expect(roundGrams(187.5)).toBe(190);
    expect(roundGrams(9.2)).toBe(9);
    expect(roundGrams(0)).toBe(0);
  });

  it('formatPortion: "1 pugno e mezzo · ≈ 225 g", "2 cucchiai · ≈ 20 g"', () => {
    expect(formatPortion(line({ foodId: 'riso', qty: 1.5, unit: 'pugno' }), 'palestra', foods)).toBe('1 pugno e mezzo · ≈ 225 g');
    expect(formatPortion(line({ foodId: 'olio', qty: 2, unit: 'cucchiaio' }), 'palestra', foods)).toBe('2 cucchiai · ≈ 20 g');
  });

  it('formatPortion adatta la porzione al tipo di giorno', () => {
    const l = line({ foodId: 'riso', qty: 1, unit: 'pugno', carbScaled: true });
    expect(formatPortion(l, 'calcio', foods)).toBe('1 pugno e mezzo · ≈ 190 g');
    expect(formatPortion(l, 'riposo', foods)).toBe('1 pugno · ≈ 115 g');
    const f = line({ foodId: 'pane', qty: 2, unit: 'fetta', carbScaled: true });
    expect(formatPortion(f, 'calcio', foods)).toBe('2 fette e mezza · ≈ 100 g');
  });

  it('grammi e millilitri restano tali', () => {
    expect(formatPortion(line({ foodId: 'pollo', qty: 130, unit: 'g' }), 'palestra', foods)).toBe('130 g');
    expect(formatPortion(line({ foodId: 'latte', qty: 200, unit: 'ml' }), 'palestra', foods)).toBe('200 ml');
    expect(portionParts(line({ foodId: 'olio', qty: 10, unit: 'ml' }), 'palestra', foods).text).toBe('10 ml · ≈ 9 g');
  });

  it('senza grammi noti mostra solo la porzione', () => {
    expect(formatPortion(line({ foodId: 'pollo', qty: 1, unit: 'pugno' }), 'palestra', foods)).toBe('1 pugno');
  });
});
