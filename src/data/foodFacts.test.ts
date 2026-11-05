/**
 * Copertura dei fatti degli alimenti e delle ricette (docs/FASE2.md § 4.8, § 13.4 test 18): ogni alimento ha i suoi
 * `FOOD_FACTS`, ogni ricetta i suoi `RECIPE_FACTS`, nessuna ricetta di riso usa l'assorbimento. I gruppi coincidono con
 * gli elenchi che il test del menù usa oggi (pesce, legumi, carne rossa, cereali integrali).
 */
import { describe, expect, it } from 'vitest';
import type { FoodGroup } from './foodFactsTypes';
import { FOODS } from './foods';
import { RECIPES } from './recipes';
import { ESTIMATE_FOOD_FACTS } from './estimateFoods';
import { FOOD_FACTS, factsOf, inSeason, seasonAllows } from './foodFacts';
import { RECIPE_FACTS, recipeFactsOf } from './recipeFacts';

const GROUPS: FoodGroup[] = [
  'carne-rossa',
  'carne-lavorata',
  'pollame',
  'pesce',
  'pesce-grasso',
  'uova',
  'legumi',
  'cereale-integrale',
  'cereale-raffinato',
  'patate',
  'verdura',
  'frutta',
  'frutta-essiccata',
  'frutta-guscio',
  'latticini',
  'condimento',
  'dolce',
];

describe('fatti degli alimenti', () => {
  it('ogni alimento dell’archivio ha i suoi fatti, e solo quelli', () => {
    expect(Object.keys(FOOD_FACTS).sort()).toEqual(Object.keys(FOODS).sort());
    for (const [id, f] of Object.entries(FOOD_FACTS)) expect(GROUPS, id).toContain(f.group);
  });

  it('factsOf legge l’archivio e le sole stime, e niente altro', () => {
    for (const id of Object.keys(FOODS)) expect(factsOf(id)).toBe(FOOD_FACTS[id]);
    for (const id of Object.keys(ESTIMATE_FOOD_FACTS)) if (!(id in FOOD_FACTS)) expect(factsOf(id)).toBe(ESTIMATE_FOOD_FACTS[id]);
    expect(factsOf('non-esiste')).toBeUndefined();
    expect(factsOf('constructor')).toBeUndefined();
    expect(factsOf('toString')).toBeUndefined();
  });

  it('i gruppi coincidono con gli elenchi del test del menù', () => {
    const ids = (pred: (g: FoodGroup) => boolean) =>
      Object.keys(FOOD_FACTS)
        .filter((id) => pred(FOOD_FACTS[id].group))
        .sort();
    expect(ids((g) => g === 'pesce' || g === 'pesce-grasso')).toEqual(['gamberi', 'merluzzo', 'salmone', 'salmone-affumicato', 'sgombro', 'tonno']);
    for (const id of ['ceci', 'cannellini', 'borlotti', 'lenticchie', 'lenticchie-rosse', 'pasta-lenticchie', 'ceci-tostati']) {
      expect(FOOD_FACTS[id].group, id).toBe('legumi');
    }
    expect(ids((g) => g === 'carne-rossa')).toEqual(['manzo']);
    expect(ids((g) => g === 'carne-lavorata')).toEqual([]);
    expect(Object.fromEntries(Object.entries(FOOD_FACTS).filter(([, f]) => f.wholeGrainDry).map(([id, f]) => [id, f.wholeGrainDry]))).toEqual({
      'pane-integrale': 1,
      avena: 1,
      muesli: 1,
      'fette-biscottate': 1,
      'crackers-integrali': 1,
      'piadina-integrale': 1,
      'pasta-integrale': 0.45,
      'riso-integrale': 0.4,
      'couscous-integrale': 0.4,
    });
    expect(ids(() => true).filter((id) => FOOD_FACTS[id].rice)).toEqual(['gallette-riso', 'riso-basmati', 'riso-integrale']);
  });

  it('farro e orzo perlati non sono integrali; le patate non sono verdura', () => {
    expect(FOOD_FACTS.farro.wholeGrainDry).toBeUndefined();
    expect(FOOD_FACTS.orzo.wholeGrainDry).toBeUndefined();
    expect(FOOD_FACTS.patate.group).toBe('patate');
  });

  it('gli zuccheri liberi sono per 100 g e non superano i carboidrati', () => {
    for (const [id, f] of Object.entries(FOOD_FACTS)) {
      if (f.freeSugarG === undefined) continue;
      expect(f.freeSugarG, id).toBeGreaterThan(0);
      expect(f.freeSugarG, id).toBeLessThanOrEqual(FOODS[id].per100g.carbG + 1e-9);
    }
    // Latte, yogurt e frutta intera, anche essiccata: zuccheri non liberi (OMS 2015).
    for (const id of ['latte', 'yogurt-greco-2', 'mela', 'banana', 'datteri']) expect(FOOD_FACTS[id].freeSugarG, id).toBeUndefined();
    expect(FOOD_FACTS.miele.freeSugarG).toBe(80);
  });

  it('stagionalità: mesi validi, `strict` solo con almeno un mese escluso', () => {
    for (const [id, f] of Object.entries(FOOD_FACTS)) {
      if (!f.season) continue;
      const m = f.season.months;
      expect(m.length, id).toBeGreaterThan(0);
      expect(new Set(m).size, id).toBe(m.length);
      expect(m.every((x) => Number.isInteger(x) && x >= 1 && x <= 12), id).toBe(true);
      expect([...m].sort((a, b) => a - b), id).toEqual(m);
      if (f.season.strict) expect(m.length, id).toBeLessThan(12);
    }
    expect(seasonAllows(FOOD_FACTS.arancia, 7)).toBe(false);
    expect(seasonAllows(FOOD_FACTS.arancia, 12)).toBe(true);
    // Fuori stagione ma ammessa: paga un costo nel generatore, non sparisce.
    expect(seasonAllows(FOOD_FACTS.zucchine, 1)).toBe(true);
    expect(inSeason(FOOD_FACTS.zucchine, 1)).toBe(false);
    expect(seasonAllows(FOOD_FACTS.mela, 7)).toBe(true);
  });

  it('nessun alimento con alcol nell’archivio (A2)', () => {
    const ALCOHOL = /\b(vino|birra|liquore|rum|marsala|grappa|vodka|whisky|gin|spumante|prosecco|brandy)\b/i;
    for (const f of Object.values(FOODS)) expect(ALCOHOL.test(f.name), f.id).toBe(false);
  });
});

describe('fatti delle ricette', () => {
  it('ogni ricetta ha i suoi fatti, e solo quelle', () => {
    expect(Object.keys(RECIPE_FACTS).sort()).toEqual(Object.keys(RECIPES).sort());
    for (const r of Object.values(RECIPES)) {
      const f = recipeFactsOf(r.id)!;
      expect(f.cooking.length, r.id).toBeGreaterThan(0);
      expect(new Set(f.cooking).size, r.id).toBe(f.cooking.length);
    }
    expect(recipeFactsOf('constructor')).toBeUndefined();
  });

  it('nessuna ricetta di riso usa l’assorbimento: il riso si lessa in molta acqua e si scola (A5)', () => {
    for (const r of Object.values(RECIPES)) {
      const rice = r.ingredients.some((l) => FOOD_FACTS[l.foodId]?.rice);
      const f = RECIPE_FACTS[r.id];
      expect(Boolean(f.riceMethod), r.id).toBe(rice);
      if (!rice) continue;
      expect(['scolato', 'due-acque'], r.id).toContain(f.riceMethod);
      // Il riso della preparazione segue la guida della domenica (controllata nel test del menù); gli altri lo scrivono.
      if (!f.prep?.includes('riso-cotto')) expect(/scol/i.test(r.steps.join(' ')), r.id).toBe(true);
    }
  });

  it('le ricette da preparazione dichiarano i componenti, le altre no', () => {
    for (const r of Object.values(RECIPES)) {
      const prep = RECIPE_FACTS[r.id].prep ?? [];
      expect(prep.length > 0, r.id).toBe(Boolean(r.batch));
      expect(new Set(prep).size, r.id).toBe(prep.length);
    }
  });

  it('nessuna carne alla griglia nelle ricette di oggi', () => {
    for (const r of Object.values(RECIPES)) {
      const meat = r.ingredients.some((l) => ['carne-rossa', 'pollame'].includes(FOOD_FACTS[l.foodId]?.group ?? ''));
      if (meat) expect(RECIPE_FACTS[r.id].cooking, r.id).not.toContain('griglia');
    }
  });
});
