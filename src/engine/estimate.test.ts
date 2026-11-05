import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DayLog, EatenMeal, ItemStatus, Recipe } from '../domain/types';
import { FOODS } from '../data/foods';
import { RECIPES } from '../data/recipes';
import { keepsEatenMeal, normalizeBarMeals } from '../state/store';
import {
  DRAFT_ITEMS_MAX,
  FRIED_OIL_SHARE,
  draftItems,
  draftMeal,
  draftValues,
  estimateDetail,
  estimatedItemsValues,
  itemName,
  kcalCheck,
  matchesPlanned,
  nearestOil,
  normalizeEstimatedItem,
  portionHint,
  resolveEstimate,
  roundItemGrams,
  roundKcal10,
  stepGrams,
  validPer100g,
  type EstimateCtx,
  type PhotoReading,
  type PhotoReadingItem,
} from './estimate';
import { eatenMeal } from './nutrition';

const item = (over: Partial<PhotoReadingItem>): PhotoReadingItem => ({
  label: '',
  foodId: null,
  grams: 100,
  confidence: 'alta',
  role: 'alimento',
  per100g: null,
  ...over,
});

const reading = (over: Partial<PhotoReading> = {}): PhotoReading => ({
  outcome: 'piatto',
  items: [item({ foodId: 'pasta', grams: 220 }), item({ foodId: 'ceci', grams: 80 }), item({ foodId: 'passata', grams: 100 })],
  cooking: 'bollito',
  oil: 'cucchiaio',
  matchesPlanned: 'non-so',
  dishName: 'Pasta e ceci',
  note: '',
  ...over,
});

const planned: Recipe = RECIPES['pasta-ceci-rosmarino'];
const oggi: EstimateCtx = { origin: 'oggi', slot: 'pranzo', planned };
const chat: EstimateCtx = { origin: 'chat', slot: 'pranzo', planned };

describe('forma compatta (spostata dallo stato)', () => {
  it('validPer100g: limiti e Atwater', () => {
    const ok = { kcal: 200, proteinG: 10, carbG: 20, fatG: 8, fiberG: 2 };
    expect(validPer100g(ok)).toEqual(ok);
    expect(validPer100g({ ...ok, kcal: 950 })).toBeNull();
    expect(validPer100g({ ...ok, kcal: 400 })).toBeNull();
    expect(validPer100g({ kcal: 400, proteinG: 60, carbG: 40, fatG: 10, fiberG: 0 })).toBeNull();
    expect(validPer100g({ ...ok, proteinG: -1 })).toBeNull();
    expect(validPer100g(null)).toBeNull();
  });

  it('normalizeEstimatedItem: con l’id niente etichetta né valori', () => {
    expect(normalizeEstimatedItem({ foodId: 'pasta', grams: 2000, label: 'Pasta', per100g: { kcal: 1 }, confidence: 'alta' })).toEqual({ foodId: 'pasta', grams: 1500 });
    expect(normalizeEstimatedItem({ grams: 0, label: 'x' })).toBeNull();
  });
});

describe('dalla lettura alla scheda (§ 7.3)', () => {
  it('per gli alimenti dell’archivio valgono i valori di foods.ts, anche se il coach manda per100g (test 24)', () => {
    const fake = { kcal: 10, proteinG: 1, carbG: 1, fatG: 0, fiberG: 0 };
    const d = resolveEstimate(reading({ items: [item({ foodId: 'pasta', grams: 200, per100g: fake })], oil: 'niente' }), oggi);
    expect(d.items).toEqual([{ key: 'i0', foodId: 'pasta', grams: 200, confidence: 'alta' }]);
    const meal = draftMeal(d);
    const p = FOODS.pasta.per100g;
    expect(meal.nutrients.kcal).toBe(Math.round(p.kcal * 2));
    expect(meal.nutrients.proteinG).toBeCloseTo(p.proteinG * 2, 1);
    expect(meal.items).toEqual([{ foodId: 'pasta', grams: 200 }]);
  });

  it('fuori archivio: valori fuori dai limiti o incoerenti scartati, l’alimento resta senza valori (test 25)', () => {
    const bad = { kcal: 400, proteinG: 10, carbG: 20, fatG: 8, fiberG: 2 };
    const good = { kcal: 200, proteinG: 10, carbG: 20, fatG: 8, fiberG: 2 };
    const d = resolveEstimate(
      reading({ items: [item({ label: 'Salsa  della\ncasa', grams: 40, per100g: bad }), item({ label: 'Polpette di verdura', grams: 120, per100g: good })], oil: 'niente' }),
      oggi,
    );
    expect(d.items[0]).toEqual({ key: 'i0', label: 'Salsa della casa', grams: 40, confidence: 'alta' });
    expect(d.items[1].per100g).toEqual(good);
    const v = draftValues(d);
    expect(v.unresolved).toBe(1);
    expect(v.nutrients.kcal).toBe(240);
    // Si salva solo quello che ha valori, in forma compatta.
    expect(draftItems(d)).toEqual([{ label: 'Polpette di verdura', grams: 120, per100g: good }]);
  });

  it('grammi a 5, doppioni sommati con la confidenza più bassa, id sconosciuti fuori archivio', () => {
    const d = resolveEstimate(
      reading({
        items: [
          item({ foodId: 'pasta', grams: 123 }),
          item({ foodId: 'pasta', grams: 31, confidence: 'bassa' }),
          item({ foodId: 'non-esiste', label: 'Gnocchi', grams: 2 }),
          item({ foodId: 'ceci', grams: 0 }),
          item({ label: '', grams: 50 }),
        ],
      }),
      oggi,
    );
    expect(d.items.map((i) => [i.foodId ?? i.label, i.grams, i.confidence])).toEqual([
      ['pasta', 155, 'bassa'],
      ['Gnocchi', 5, 'alta'],
    ]);
    expect(d.dropped).toBe(2);
    expect(roundItemGrams(2000)).toBe(1500);
    expect(roundItemGrams('abc')).toBeNull();
  });

  it('al massimo 11 alimenti nella scheda: il dodicesimo posto è dell’olio', () => {
    const ids = Object.keys(FOODS).filter((id) => !FOODS[id].pantry).slice(0, 14);
    const d = resolveEstimate(reading({ items: ids.map((foodId) => item({ foodId, grams: 50 })), oil: 'due-cucchiai' }), oggi);
    expect(d.items).toHaveLength(DRAFT_ITEMS_MAX);
    expect(d.dropped).toBe(3);
    const saved = draftItems(d);
    expect(saved).toHaveLength(12);
    expect(saved[11]).toEqual({ foodId: 'olio-evo', grams: 20, role: 'condimento' });
  });

  it('olio: la risposta del coach preseleziona; «non so» lascia la scelta; l’olio letto come alimento va alla domanda', () => {
    expect(resolveEstimate(reading({ oil: 'cucchiaio' }), oggi)).toMatchObject({ oil: 'cucchiaio', oilSuggested: 'cucchiaio' });
    expect(resolveEstimate(reading({ oil: 'non-so' }), oggi)).toMatchObject({ oil: null, oilSuggested: null });
    const withOil = resolveEstimate(reading({ oil: 'non-so', items: [item({ foodId: 'pasta', grams: 200 }), item({ foodId: 'olio-evo', grams: 18 })] }), oggi);
    expect(withOil.items.map((i) => i.foodId)).toEqual(['pasta']);
    expect(withOil.oilSuggested).toBe('due-cucchiai');
    expect(nearestOil(0)).toBe('niente');
    expect(nearestOil(6)).toBe('filo');
    expect(nearestOil(12)).toBe('cucchiaio');
  });

  it('fritto: olio assorbito pari all’8% degli alimenti dell’archivio, non di quelli già fritti', () => {
    const d = resolveEstimate(
      reading({ cooking: 'fritto', oil: 'niente', items: [item({ foodId: 'pollo', grams: 150 }), item({ foodId: 'patatine-fritte', grams: 150 })] }),
      oggi,
    );
    expect(d.fried).toBe(true);
    const v = draftValues(d);
    expect(v.friedOilG).toBe(Math.round(150 * FRIED_OIL_SHARE));
    expect(draftItems(d).at(-1)).toEqual({ foodId: 'olio-evo', grams: 12, role: 'condimento' });
  });

  it('intervallo con un alimento incerto che pesa più del 25% delle kcal: «circa 820 (620-1.020)»', () => {
    const sure = draftValues(resolveEstimate(reading(), oggi));
    expect(sure.range).toBeNull();
    const d = resolveEstimate(reading({ items: [item({ foodId: 'pasta', grams: 400, confidence: 'bassa' }), item({ foodId: 'insalata', grams: 50 })] }), oggi);
    const v = draftValues(d);
    expect(v.kcalShown % 10).toBe(0);
    expect(v.range).toEqual({ low: Math.ceil((v.kcalShown * 0.75) / 10) * 10, high: Math.floor((v.kcalShown * 1.25) / 10) * 10 });
    // Un incerto piccolo non allarga i totali.
    const small = resolveEstimate(reading({ items: [item({ foodId: 'pasta', grams: 400 }), item({ foodId: 'insalata', grams: 50, confidence: 'bassa' })] }), oggi);
    expect(draftValues(small).range).toBeNull();
    expect(roundKcal10(825)).toBe(830);
    expect(Math.ceil((820 * 0.75) / 10) * 10).toBe(620);
    expect(Math.floor((820 * 1.25) / 10) * 10).toBe(1020);
  });

  it('kcal: oltre 3.000 non si segna, oltre 1.800 o sotto 100 si controlla', () => {
    expect(kcalCheck(3001)).toBe('oltre');
    expect(kcalCheck(1801)).toBe('alto');
    expect(kcalCheck(99)).toBe('basso');
    expect(kcalCheck(700)).toBe('ok');
  });

  it('passi dei grammi: 10 g sotto i 100, 25 sopra, tra 5 e 1.500', () => {
    expect(stepGrams(35, 1)).toBe(45);
    expect(stepGrams(95, 1)).toBe(105);
    expect(stepGrams(100, 1)).toBe(125);
    expect(stepGrams(100, -1)).toBe(90);
    expect(stepGrams(125, -1)).toBe(100);
    expect(stepGrams(5, -1)).toBe(5);
    expect(stepGrams(1490, 1)).toBe(1500);
  });

  it('porzione a mano per l’archivio, mai «pezzo» senza le parole dell’alimento', () => {
    expect(portionHint({ foodId: 'pasta', grams: 225 })).toBe('1 pugno e mezzo');
    expect(portionHint({ foodId: 'prosciutto-crudo', grams: 45 })).toBe('3 fette');
    expect(portionHint({ foodId: 'pizza-margherita', grams: 300 })).toBeNull();
    expect(portionHint({ grams: 100 })).toBeNull();
    expect(itemName({ foodId: 'pasta' })).toBe(FOODS.pasta.name);
    expect(itemName({ label: 'Gnocchi' })).toBe('Gnocchi');
  });
});

describe('pasto previsto (§ 7.5)', () => {
  it('il motore: almeno il 60% degli alimenti non di dispensa della ricetta', () => {
    // pasta, ceci, passata, grana: 3 su 4 sì, 2 su 4 no.
    expect(matchesPlanned([{ foodId: 'pasta' }, { foodId: 'ceci' }, { foodId: 'passata' }], planned)).toBe(true);
    expect(matchesPlanned([{ foodId: 'pasta' }, { foodId: 'ceci' }], planned)).toBe(false);
    expect(matchesPlanned([{ foodId: 'pasta' }], undefined)).toBe(false);
  });

  it('dal pasto di Oggi basta il coach o il motore; dalla chat servono entrambi', () => {
    const coachYes = reading({ matchesPlanned: 'si', items: [item({ foodId: 'pollo', grams: 120 })] });
    expect(resolveEstimate(coachYes, oggi).asPlanned).toBe(true);
    expect(resolveEstimate(coachYes, chat).asPlanned).toBe(false);
    expect(resolveEstimate(reading(), oggi)).toMatchObject({ asPlanned: true, engineMatch: true });
    expect(resolveEstimate(reading(), chat).asPlanned).toBe(false);
    expect(resolveEstimate(reading({ matchesPlanned: 'si' }), chat).asPlanned).toBe(true);
    expect(resolveEstimate(reading({ matchesPlanned: 'si' }), { origin: 'oggi', slot: 'pranzo' }).asPlanned).toBe(false);
  });

  it('per ogni stato e `asPlanned`, eatenMeal e normalizeBarMeals concordano (test 26)', () => {
    const base = draftMeal(resolveEstimate(reading(), oggi));
    const statuses: (ItemStatus | undefined)[] = ['fatto', 'sostituito', 'saltato', undefined];
    for (const st of statuses) {
      for (const asPlanned of [true, undefined]) {
        const meal: EatenMeal = { ...base, asPlanned };
        const status: Record<string, ItemStatus> = st ? { 'pasto:pranzo': st } : {};
        const log: DayLog = { date: '2026-11-10', status, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {}, barMeals: { pranzo: meal } };
        const kept = normalizeBarMeals(log.barMeals, status)?.pranzo !== undefined;
        const counts = eatenMeal(log, 'pranzo') !== null;
        expect(kept, `${st} ${asPlanned}`).toBe(counts);
        expect(keepsEatenMeal(st, meal)).toBe(counts);
        expect(counts).toBe(st === 'sostituito' || (st === 'fatto' && asPlanned === true));
      }
    }
  });

  it('il pasto da salvare: provenienza foto, alimenti compatti, valori del motore', () => {
    const d = resolveEstimate(reading({ matchesPlanned: 'si' }), oggi);
    const meal = draftMeal(d);
    expect(meal).toMatchObject({ label: 'Pasta e ceci', source: 'foto', oil: 'cucchiaio', asPlanned: true });
    expect(meal.items?.every((i) => !('key' in i) && !('confidence' in i) && !i.label && !i.per100g)).toBe(true);
    expect(meal.nutrients).toEqual(estimatedItemsValues(meal.items ?? []).nutrients);
    expect(meal.items?.at(-1)).toEqual({ foodId: 'olio-evo', grams: 10, role: 'condimento' });
  });
});

describe('dettaglio della voce (§ 11.2)', () => {
  it('foto e piatto dicono la provenienza; il bar resta com’è', () => {
    const n = { kcal: 723, proteinG: 30, carbG: 80, fatG: 20, fiberG: 8 };
    expect(estimateDetail({ source: 'foto', label: 'Pasta e ceci', nutrients: n })).toBe('Dalla foto · 720 kcal');
    expect(estimateDetail({ source: 'piatto', label: 'Pasta al pesto', nutrients: { ...n, kcal: 642 } })).toBe('Il mio piatto: pasta al pesto · 640 kcal');
    expect(estimateDetail({ source: 'piatto', label: 'BLT', nutrients: n })).toBe('Il mio piatto: BLT · 720 kcal');
    expect(estimateDetail({ label: 'Al bar', nutrients: n })).toBeNull();
    expect(estimateDetail({ source: 'bar', label: 'Al bar', nutrients: n })).toBeNull();
  });
});

describe('motori puri (§ 13.2)', () => {
  it('stessi ingressi, stessi risultati', () => {
    const a = resolveEstimate(reading(), oggi);
    const b = resolveEstimate(reading(), oggi);
    expect(a).toEqual(b);
    expect(draftValues(a)).toEqual(draftValues(b));
  });

  it('estimate.ts e dishes.ts non leggono l’orologio e non usano Math.random', () => {
    for (const file of ['./estimate.ts', './dishes.ts']) {
      const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src, file).not.toMatch(/Date\.now\s*\(/);
      expect(src, file).not.toMatch(/new Date\s*\(\s*\)/);
      expect(src, file).not.toMatch(/Math\.random/);
    }
  });
});
