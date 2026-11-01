import { describe, expect, it } from 'vitest';
import type { AppData, Food, MenuWeek } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import { FOODS } from '../data/foods';
import { RECIPES } from '../data/recipes';
import { weekDates } from './dates';
import { emptyDayLog as emptyLog } from '../state/store';
import { effectiveDayType } from './menu';
import { lineGrams } from './nutrition';
import {
  FRESH_LAST_WEEKDAY,
  SHOP_CATEGORIES,
  formatShopWeight,
  freezeNote,
  isPerishable,
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
    // Settimana tipo: 3 giorni di calcio, 2 di palestra, 1 leggero e la domenica, vigilia della partita, da calcio.
    const expected = weekDates('2026-11-02').reduce((a, d) => a + lineGrams(line, effectiveDayType(d, plan)), 0);
    expect(expected).toBeCloseTo(4 * lineGrams(line, 'calcio') + 2 * lineGrams(line, 'palestra') + lineGrams(line, 'leggero'), 5);
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

  it('segue gli obiettivi del piano: più kcal nel piano, più carboidrati da comprare', () => {
    const richer = { ...plan, targets: { ...plan.targets, palestra: { ...plan.targets.palestra, kcal: plan.targets.palestra.kcal + 300 } } };
    const base = shoppingList('2026-11-02', state(), { rotation: oneMeal(pastaId) });
    const more = shoppingList('2026-11-02', { plan: richer, dayLogs: {} }, { rotation: oneMeal(pastaId) });
    const p0 = base.items.find((i) => i.foodId === 'pasta')!;
    const p1 = more.items.find((i) => i.foodId === 'pasta')!;
    expect(p1.eatenG).toBeGreaterThan(p0.eatenG);
    // Cambiano solo i due giorni di palestra.
    const tue = (l: typeof p0) => l.uses.find((u) => u.date === '2026-11-03')!.grams;
    const mon = (l: typeof p0) => l.uses.find((u) => u.date === '2026-11-02')!.grams;
    expect(tue(p1)).toBeGreaterThan(tue(p0));
    expect(mon(p1)).toBeCloseTo(mon(p0), 5);
  });

  it('con fromDate parte da quel giorno', () => {
    const list = shoppingList('2026-11-02', state(), { rotation: oneMeal(pastaId), fromDate: '2026-11-04' });
    expect(list.dates).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(list.mealCount).toBe(5);
    expect(list.items.find((i) => i.foodId === 'pasta')?.days[0]).toBe('2026-11-04');
    const full = shoppingList('2026-11-02', state(), { rotation: oneMeal(pastaId) });
    expect(full.dates).toHaveLength(7);
  });

  it('attraversa il cambio dell’ora legale senza perdere giorni', () => {
    // 29 marzo 2027: la settimana prima contiene il passaggio all'ora legale (domenica 28).
    const list = shoppingList('2027-03-22', { plan: defaultPlan('2027-03-01'), dayLogs: {} }, { rotation: oneMeal(pastaId) });
    expect(list.mealCount).toBe(7);
    expect(list.items.find((i) => i.foodId === 'pasta')?.days).toHaveLength(7);
  });
});

describe('conservazione di carne e pesce freschi', () => {
  /** Un piatto con pollo crudo cucinato sul momento, ogni giorno a cena. */
  const fresh = Object.values(RECIPES).find((r) => !r.batch && r.slots.includes('cena') && r.ingredients.some((l) => l.foodId === 'pollo'))!;
  const batch = Object.values(RECIPES).find((r) => r.batch && r.ingredients.some((l) => l.foodId === 'pollo'))!;
  const dinner = (id: string): MenuWeek[] => [{ days: Array.from({ length: 7 }, () => ({ meals: { cena: id } })), prep: [] }];

  it('riconosce i freschi deperibili', () => {
    expect(isPerishable(FOODS.pollo)).toBe(true);
    expect(isPerishable(FOODS.salmone)).toBe(true);
    expect(isPerishable(FOODS.manzo)).toBe(true);
    expect(isPerishable(FOODS.gamberi)).toBe(false);
    expect(isPerishable(FOODS['salmone-affumicato'])).toBe(false);
    expect(isPerishable(FOODS.tonno)).toBe(false);
  });

  it('dice di congelare le porzioni cucinate da mercoledì in poi', () => {
    expect(fresh).toBeDefined();
    const list = shoppingList('2026-11-02', state(), { rotation: dinner(fresh.id) });
    const pollo = list.items.find((i) => i.foodId === 'pollo')!;
    expect(FRESH_LAST_WEEKDAY).toBe(1);
    expect(pollo.freezeDates).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(pollo.note).toBe('Congela le porzioni per mercoledì, giovedì, venerdì, sabato e domenica, separate, e passale in frigo la sera prima');
  });

  it('una porzione sola: giorno e peso da congelare', () => {
    const rotation: MenuWeek[] = [
      { days: Array.from({ length: 7 }, (_, i) => ({ meals: i === 4 ? { cena: fresh.id } : {} })), prep: [] },
    ];
    const pollo = shoppingList('2026-11-02', state(), { rotation }).items.find((i) => i.foodId === 'pollo')!;
    expect(pollo.freezeDates).toEqual(['2026-11-06']);
    expect(sp(pollo.note ?? '')).toMatch(/^Congela la porzione per venerdì \(≈ \d+ g\) e passala in frigo la sera prima$/);
    expect(sp(freezeNote(['2026-11-06'], 143))).toBe('Congela la porzione per venerdì (≈ 140 g) e passala in frigo la sera prima');
  });

  it('ciò che si cuoce nella preparazione della domenica non va congelato da crudo', () => {
    expect(batch).toBeDefined();
    const pollo = shoppingList('2026-11-02', state(), { rotation: dinner(batch.id) }).items.find((i) => i.foodId === 'pollo')!;
    expect(pollo.uses.every((u) => u.ahead)).toBe(true);
    expect(pollo.note).toBeUndefined();
  });

  it('i surgelati e la dispensa non hanno note', () => {
    const list = shoppingList('2026-11-02', state());
    for (const i of list.items) if (!isPerishable(FOODS[i.foodId])) expect(i.note, i.foodId).toBeUndefined();
    for (const i of list.pantry) expect(i.note, i.foodId).toBeUndefined();
  });

  it('il testo da copiare ricorda cosa congelare appena a casa', () => {
    const list = shoppingList('2026-11-02', state(), { rotation: dinner(fresh.id) });
    const text = shoppingText(list);
    expect(text).toContain('APPENA A CASA');
    expect(text).toContain('- Petto di pollo: congela le porzioni per mercoledì');
    expect(shoppingText(list, { includeFreezer: false })).not.toContain('APPENA A CASA');
  });
});

describe('giorni di avvio', () => {
  /** Primo avvio domenica 1º novembre alle 21: tutta la settimana dal 2 è di avvio (vedi `isStarterDay`). */
  const starterPlan = { ...plan, firstUse: { date: '2026-11-01', time: '21:00' } } as AppData['plan'];
  const batch = Object.values(RECIPES).find((r) => r.batch && r.ingredients.some((l) => l.foodId === 'pollo'))!;

  it('riconosce la spesa di avvio e i suoi giorni', () => {
    const list = shoppingList('2026-11-02', { plan: starterPlan, dayLogs: {} });
    expect(list.starter).toBe(true);
    expect(list.starterDates).toEqual(weekDates('2026-11-02'));
    // Nei giorni di avvio il menù non ha ricette da preparazione.
    expect(list.items.every((i) => i.uses.every((u) => !RECIPES[u.recipeId]?.batch))).toBe(true);
    // La settimana dopo è una spesa normale.
    const next = shoppingList('2026-11-09', { plan: starterPlan, dayLogs: {} });
    expect(next.starter).toBe(false);
    expect(next.starterDates).toEqual([]);
  });

  it('senza preparazione niente è cucinato in anticipo: la carne di metà settimana va congelata da cruda', () => {
    // Anche scegliendo a mano una ricetta da preparazione, nei giorni di avvio si cucina sul momento.
    const dayLogs: AppData['dayLogs'] = {};
    for (const d of weekDates('2026-11-02')) dayLogs[d] = { ...emptyLog(d), recipeSwaps: { cena: batch.id } };
    const pollo = shoppingList('2026-11-02', { plan: starterPlan, dayLogs }).items.find((i) => i.foodId === 'pollo')!;
    expect(pollo.uses.some((u) => u.ahead)).toBe(false);
    expect(pollo.freezeDates?.[0]).toBe('2026-11-04');
  });

  it('senza primo avvio (dati di esempio) non ci sono giorni di avvio', () => {
    const list = shoppingList('2026-11-02', state());
    expect(list.starter).toBe(false);
    expect(list.starterDates).toEqual([]);
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
