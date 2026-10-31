import { describe, expect, it } from 'vitest';
import type { AppData, Food, MenuWeek } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import { FOODS } from '../data/foods';
import { RECIPES } from '../data/recipes';
import { lineGrams } from './nutrition';
import {
  SHOP_CATEGORIES,
  formatShopWeight,
  parseBuyLabel,
  roundShopGrams,
  shopName,
  shoppingLine,
  shoppingList,
  shoppingProgress,
  shoppingQuantity,
  shoppingText,
} from './shopping';

const NBSP = ' ';
const sp = (s: string) => s.replace(/ /g, ' ');

/** Piano che inizia lunedì 2 novembre 2026 (settimana tipo predefinita: lun calcio … dom riposo). */
const plan = defaultPlan('2026-11-02');
const state = (dayLogs: AppData['dayLogs'] = {}): Pick<AppData, 'plan' | 'dayLogs'> => ({ plan, dayLogs });

/** Rotazione minima con ricette vere: lo stesso pranzo tutti i giorni. */
const recipeIds = Object.keys(RECIPES);
const pastaId = recipeIds.find((id) => RECIPES[id].ingredients.some((l) => l.foodId === 'pasta' && l.carbScaled)) ?? recipeIds[0];
const oneMeal = (id: string): MenuWeek[] => [{ days: Array.from({ length: 7 }, () => ({ meals: { pranzo: id } })), prep: [] }];

describe('nomi e quantità umane', () => {
  it('toglie lo stato di cottura dal nome', () => {
    expect(shopName({ name: 'Riso basmati, cotto' })).toBe('Riso basmati');
    expect(shopName({ name: 'Ceci in barattolo, sgocciolati' })).toBe('Ceci in barattolo');
    expect(shopName({ name: 'Cous cous integrale, rinvenuto' })).toBe('Cous cous integrale');
    // Una virgola che non indica la cottura resta.
    expect(shopName({ name: 'Fesa di tacchino arrosto, affettata' })).toBe('Fesa di tacchino arrosto, affettata');
    expect(shopName({ name: 'Mela' })).toBe('Mela');
  });

  it('legge le etichette delle confezioni', () => {
    expect(parseBuyLabel('barattolo da 400 g')).toMatchObject({ word: 'barattolo', grams: 400 });
    expect(parseBuyLabel('confezione da 1 kg')).toMatchObject({ word: 'confezione', grams: 1000 });
    expect(parseBuyLabel('bottiglia da 1 l', { unitGrams: { ml: 1.03 } })?.grams).toBeCloseTo(1030);
    expect(parseBuyLabel('confezione da 4')).toMatchObject({ word: 'confezione', pieces: 4 });
    expect(parseBuyLabel('qualcosa di strano')).toBeUndefined();
    expect(parseBuyLabel(undefined)).toBeUndefined();
  });

  it('arrotonda i pesi come in una lista scritta a mano', () => {
    expect(roundShopGrams(3)).toBe(5);
    expect(roundShopGrams(37)).toBe(35);
    expect(roundShopGrams(143)).toBe(140);
    expect(roundShopGrams(612)).toBe(600);
    expect(roundShopGrams(1234)).toBe(1200);
    expect(roundShopGrams(0)).toBe(0);
    expect(sp(formatShopWeight(612))).toBe('≈ 600 g');
    expect(sp(formatShopWeight(1234))).toBe('≈ 1,2 kg');
    expect(sp(formatShopWeight(1000))).toBe('≈ 1 kg');
    expect(sp(formatShopWeight(420, true))).toBe('≈ 400 ml');
    expect(sp(formatShopWeight(1500, true))).toBe('≈ 1,5 l');
    expect(formatShopWeight(600)).toContain(NBSP);
  });

  it('uova e frutta si contano a pezzi, con tolleranza', () => {
    expect(shoppingQuantity(FOODS.uova, 6 * 55).qty).toBe('6 uova');
    expect(shoppingQuantity(FOODS.uova, 55).qty).toBe('1 uovo');
    // 2,1 banane restano 2; 2,5 diventano 3.
    expect(shoppingQuantity(FOODS.banana, 2.1 * 120).qty).toBe('2 banane');
    expect(shoppingQuantity(FOODS.banana, 2.5 * 120).qty).toBe('3 banane');
    expect(shoppingQuantity(FOODS.banana, 120).name).toBe('Banana');
    expect(shoppingQuantity(FOODS.banana, 360).name).toBe('Banane');
  });

  it('le confezioni piccole si comprano intere, le grandi a peso se ne serve poco', () => {
    // Ceci: 1,1 barattoli → 1; 1,5 → 2.
    expect(sp(shoppingQuantity(FOODS.ceci, 440).qty)).toBe('1 barattolo da 400 g');
    expect(sp(shoppingQuantity(FOODS.ceci, 600).qty)).toBe('2 barattoli da 400 g');
    expect(sp(shoppingQuantity(FOODS.ceci, 600).amount)).toBe('2 × 400 g');
    // Riso: 300 g di una confezione da 1 kg → a peso, con la confezione come nota.
    const riso = shoppingQuantity(FOODS['riso-basmati'], 300);
    expect(sp(riso.qty)).toBe('≈ 300 g');
    expect(riso.hint).toContain('peso a crudo');
    expect(sp(riso.hint ?? '')).toContain('confezione da 1 kg');
    // Latte: in bottiglie da un litro.
    expect(sp(shoppingQuantity(FOODS.latte, 2000).qty)).toBe('2 bottiglie da 1 l');
    // Piadine: confezioni da 4 pezzi.
    expect(shoppingQuantity(FOODS['piadina-integrale'], 5 * 80).qty).toBe('2 confezioni da 4');
  });

  it('vasetti senza confezione indicata e prodotti a peso', () => {
    expect(sp(shoppingQuantity(FOODS['yogurt-greco-0'], 3 * 170).qty)).toBe('3 vasetti da 170 g');
    const pollo = shoppingQuantity(FOODS.pollo, 429);
    expect(sp(pollo.qty)).toBe('≈ 450 g');
    expect(pollo.hint).toBe('peso a crudo');
    expect(shoppingQuantity(FOODS.patate, 1031).hint).toBeUndefined();
  });

  it('alimento sconosciuto o zero grammi: niente quantità', () => {
    expect(shoppingQuantity(undefined, 100).qty).toBe('');
    expect(shoppingQuantity(FOODS.pollo, 0).qty).toBe('');
  });
});

describe('lista della settimana', () => {
  it('somma la settimana, applica buyFactor e adatta i carboidrati al tipo di giorno', () => {
    const list = shoppingList('2026-11-02', state(), { rotation: oneMeal(pastaId) });
    expect(list.weekStart).toBe('2026-11-02');
    expect(list.mealCount).toBe(7);
    const pasta = list.items.find((i) => i.foodId === 'pasta');
    expect(pasta).toBeDefined();
    const line = RECIPES[pastaId].ingredients.find((l) => l.foodId === 'pasta')!;
    // Settimana tipo: 3 giorni di calcio, 2 di palestra, 1 leggero, 1 di riposo.
    const expected =
      3 * lineGrams(line, 'calcio') + 2 * lineGrams(line, 'palestra') + lineGrams(line, 'leggero') + lineGrams(line, 'riposo');
    expect(pasta!.eatenG).toBeCloseTo(expected, 5);
    expect(pasta!.buyG).toBeCloseTo(expected * (FOODS.pasta.buyFactor ?? 1), 5);
    expect(pasta!.days).toHaveLength(7);
    expect(pasta!.uses).toHaveLength(7);
    expect(pasta!.name).toBe('Pasta di semola');
  });

  it('si allinea al lunedì da qualunque giorno della settimana', () => {
    const a = shoppingList('2026-11-05', state(), { rotation: oneMeal(pastaId) });
    expect(a.weekStart).toBe('2026-11-02');
  });

  it('conta le sostituzioni di ricetta del diario', () => {
    const other = recipeIds.find((id) => RECIPES[id].slots.includes('pranzo') && !RECIPES[id].ingredients.some((l) => l.foodId === 'pasta'));
    expect(other).toBeDefined();
    const logs: AppData['dayLogs'] = {
      '2026-11-03': { date: '2026-11-03', status: {}, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: { pranzo: other! } },
    };
    const base = shoppingList('2026-11-02', state(), { rotation: oneMeal(pastaId) });
    const swapped = shoppingList('2026-11-02', state(logs), { rotation: oneMeal(pastaId) });
    const p0 = base.items.find((i) => i.foodId === 'pasta')!;
    const p1 = swapped.items.find((i) => i.foodId === 'pasta')!;
    expect(p1.uses).toHaveLength(6);
    expect(p1.eatenG).toBeLessThan(p0.eatenG);
    // Gli ingredienti della ricetta scelta entrano in lista.
    for (const l of RECIPES[other!].ingredients) {
      if (FOODS[l.foodId]?.pantry) continue;
      expect(swapped.items.some((i) => i.foodId === l.foodId)).toBe(true);
    }
  });

  it('raggruppa per reparto nell’ordine del supermercato e separa la dispensa', () => {
    const list = shoppingList('2026-11-02', state());
    expect(list.groups.length).toBeGreaterThan(3);
    const order = list.groups.map((g) => SHOP_CATEGORIES.indexOf(g.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(list.items.every((i) => !i.pantry)).toBe(true);
    expect(list.pantry.every((i) => i.pantry)).toBe(true);
    expect(list.pantry.some((i) => i.foodId === 'olio-evo')).toBe(true);
    // Ogni voce ha una quantità leggibile e una chiave unica.
    const keys = new Set(list.items.map((i) => i.key));
    expect(keys.size).toBe(list.items.length);
    expect(list.items.every((i) => i.qty.length > 0 && i.amount.length > 0)).toBe(true);
    // In ogni reparto le voci sono in ordine alfabetico.
    for (const g of list.groups) {
      const names = g.items.map((i) => i.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'it')));
    }
  });

  it('menù vuoto o alimenti mancanti: lista vuota senza errori', () => {
    const empty = shoppingList('2026-11-02', state(), { rotation: [] });
    expect(empty.items).toEqual([]);
    expect(empty.pantry).toEqual([]);
    expect(empty.mealCount).toBe(0);
    const noFoods = shoppingList('2026-11-02', state(), { rotation: oneMeal(pastaId), foods: {} as Record<string, Food> });
    expect(noFoods.items).toEqual([]);
    expect(shoppingProgress(empty, ['pasta'])).toEqual({ done: 0, total: 0, ratio: 0 });
  });

  it('attraversa il cambio dell’ora legale senza perdere giorni', () => {
    // 29 marzo 2027: la settimana prima contiene il passaggio all'ora legale (domenica 28).
    const list = shoppingList('2027-03-22', { plan: defaultPlan('2027-03-01'), dayLogs: {} }, { rotation: oneMeal(pastaId) });
    expect(list.mealCount).toBe(7);
    expect(list.items.find((i) => i.foodId === 'pasta')?.days).toHaveLength(7);
  });
});

describe('avanzamento e testo da copiare', () => {
  const list = shoppingList('2026-11-02', state());

  it('conta solo le spunte delle voci in lista', () => {
    const first = list.items.slice(0, 3).map((i) => i.key);
    const p = shoppingProgress(list, [...first, 'non-esiste', list.pantry[0]?.key ?? 'x']);
    expect(p.done).toBe(3);
    expect(p.total).toBe(list.items.length);
    expect(p.ratio).toBeCloseTo(3 / list.items.length);
  });

  it('scrive una voce per riga, reparti in maiuscolo, senza le voci spuntate', () => {
    const checked = [list.items[0].key];
    const text = shoppingText(list, { checked, title: 'Spesa · 2-8 novembre' });
    const lines = text.split('\n');
    expect(lines[0]).toBe('Spesa · 2-8 novembre');
    expect(text).toContain(list.groups[0].category.toUpperCase());
    expect(text).not.toContain(`- ${shoppingLine(list.items[0])}`);
    expect(text).toContain(`- ${sp(shoppingLine(list.items[1]))}`);
    expect(text).toContain('DA CONTROLLARE IN DISPENSA');
    expect(text).not.toContain(' ');
    expect(text).not.toContain('—');
    expect(shoppingText(list, { includePantry: false })).not.toContain('DISPENSA\n- Aceto');
  });

  it('le quantità a pezzi non ripetono il nome', () => {
    const uova = list.items.find((i) => i.foodId === 'uova');
    if (uova) expect(shoppingLine(uova)).toMatch(/^\d+ uov[oa]$/);
    const pollo = list.items.find((i) => i.foodId === 'pollo');
    if (pollo) expect(sp(shoppingLine(pollo))).toMatch(/^Petto di pollo: ≈ \d+ g$/);
  });
});
