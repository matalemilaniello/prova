import { describe, expect, it } from 'vitest';
import type { DayType, Food, IngredientLine, Plan, Recipe } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import { addDays } from './dates';
import {
  carbFactor,
  dayCarbScale,
  dayNutrition,
  dayNutritionDetail,
  fiberRampFactor,
  fiberRampWeek,
  formatPortion,
  planCarbScale,
  totalCarbFactor,
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

describe('le porzioni seguono gli obiettivi del piano', () => {
  const start = '2026-11-09';
  const base = defaultPlan(start);
  const withDelta = (delta: number): Plan => ({
    ...base,
    targets: Object.fromEntries(
      (Object.keys(base.targets) as DayType[]).map((t) => [t, { ...base.targets[t], kcal: base.targets[t].kcal + delta }]),
    ) as Plan['targets'],
  });
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));

  it('con gli obiettivi predefiniti la scala è 1', () => {
    for (const d of days) expect(dayCarbScale(d, { plan: base, dayLogs: {} })).toBe(1);
    expect(planCarbScale('palestra', base)).toBe(1);
  });

  it('+150 kcal nel piano → circa +150 kcal nel piatto, ogni giorno delle due settimane', () => {
    const plus = withDelta(150);
    for (const d of days) {
      const before = dayNutrition(d, { plan: base, dayLogs: {} }).kcal;
      const after = dayNutrition(d, { plan: plus, dayLogs: {} }).kcal;
      expect(after - before).toBeGreaterThan(120);
      expect(after - before).toBeLessThan(180);
    }
  });

  it('−100 kcal riducono solo i carboidrati: proteine e grassi restano', () => {
    const minus = withDelta(-100);
    const d = days[1];
    const a = dayNutrition(d, { plan: base, dayLogs: {} });
    const b = dayNutrition(d, { plan: minus, dayLogs: {} });
    expect(a.kcal - b.kcal).toBeGreaterThan(70);
    expect(a.kcal - b.kcal).toBeLessThan(130);
    expect(b.carbG).toBeLessThan(a.carbG);
    expect(Math.abs(a.proteinG - b.proteinG)).toBeLessThan(4);
  });

  it('la scala è limitata e accetta un numero o il piano', () => {
    expect(planCarbScale('riposo', withDelta(5000))).toBe(1.6);
    expect(planCarbScale('riposo', withDelta(-1500))).toBe(0.6);
    const l = line({ foodId: 'riso', qty: 1, unit: 'pugno', carbScaled: true });
    expect(lineGrams(l, 'palestra', foods, 1.2)).toBeCloseTo(180);
    expect(lineGrams(l, 'palestra', foods, base)).toBeCloseTo(150);
    expect(totalCarbFactor('calcio', 1.2)).toBeCloseTo(1.5);
  });

  it('la vigilia della partita mangia come un giorno di calcio', () => {
    // 2026-11-15 è domenica, il giorno prima della partita del lunedì.
    const d = dayNutritionDetail('2026-11-15', { plan: base, dayLogs: {} });
    expect(d.dayType).toBe('calcio');
    expect(d.total.kcal).toBeGreaterThan(base.targets.calcio.kcal * 0.92);
  });

  it('avvio graduale delle fibre nelle prime due settimane', () => {
    expect(fiberRampWeek(start, base)).toBe(1);
    expect(fiberRampFactor(addDays(start, 6), base)).toBe(0.6);
    expect(fiberRampFactor(addDays(start, 7), base)).toBe(0.8);
    expect(fiberRampFactor(addDays(start, 14), base)).toBe(1);
    expect(fiberRampWeek(addDays(start, -1), base)).toBeNull();
  });
});
