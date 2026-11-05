/**
 * Esclusioni e gusti (docs/FASE2.md § 4.9, § 6.2, § 6.3; § 13.5 test 20 e 22). Dati inventati e generici.
 */
import { describe, expect, it } from 'vitest';
import type { DayLog, ISODate, MealSlot, Plan } from '../domain/types';
import { FOODS } from '../data/foods';
import { RECIPES } from '../data/recipes';
import { ESTIMATE_FOOD_FACTS } from '../data/estimateFoods';
import { defaultPlan } from '../data/defaults';
import { addDays } from './dates';
import {
  agreed,
  bannedFoods,
  excludableFoods,
  excludedFoods,
  foodLabel,
  foodWithArticle,
  objectPronoun,
  preventionBan,
  recipeAllowed,
  searchableFoods,
  tasteQuestion,
  tasteSignals,
  TASTE_ASK_COOLDOWN_DAYS,
  userExcludedFoods,
} from './exclusions';
import { mealsForDate, plannedMealsForDate } from './menu';
import { dayNutritionDetail } from './nutrition';
import { shoppingList } from './shopping';

const MON = '2026-11-09';
const plan = (extra: Partial<Plan> = {}): Plan => ({ ...defaultPlan(MON), ...extra });
const log = (date: ISODate, patch: Partial<DayLog> = {}): DayLog => ({
  date,
  status: {},
  notes: {},
  minimal: false,
  waterGlasses: 0,
  sweets: 0,
  recipeSwaps: {},
  ...patch,
});

describe('divieti di prevenzione (A1-A3)', () => {
  it('riso integrale e gallette sono vietati, il riso bianco no', () => {
    expect(preventionBan('riso-integrale')).toBe('A3');
    expect(preventionBan('gallette-riso')).toBe('A3');
    expect(preventionBan('riso-basmati')).toBeNull();
    expect(preventionBan('pollo')).toBeNull();
    expect([...bannedFoods()].sort()).toEqual(['gallette-riso', 'riso-integrale']);
  });

  it('le carni lavorate di sola stima sono vietate per regola', () => {
    for (const [id, f] of Object.entries(ESTIMATE_FOOD_FACTS)) if (f.group === 'carne-lavorata') expect(preventionBan(id), id).toBe('A1');
  });

  it('i divieti valgono sempre e non si vedono tra gli alimenti da togliere', () => {
    const p = plan();
    expect(excludedFoods(p).has('gallette-riso')).toBe(true);
    expect(excludedFoods(p, MON).has('riso-integrale')).toBe(true);
    expect(searchableFoods()).not.toContain('gallette-riso');
    expect(searchableFoods().every((id) => !FOODS[id].pantry)).toBe(true);
  });
});

describe('esclusioni dell’utente', () => {
  const p = plan({ exclusions: [{ foodId: 'tonno', since: '2026-11-11', origin: 'non-mi-piace' }] });

  it('valgono da `since` e mai prima (§ 13.5, test 20)', () => {
    expect(excludedFoods(p, '2026-11-10').has('tonno')).toBe(false);
    expect(excludedFoods(p, '2026-11-11').has('tonno')).toBe(true);
    expect(excludedFoods(p).has('tonno')).toBe(true);
    expect([...userExcludedFoods(p, '2026-11-10')]).toEqual([]);
  });

  it('oggi e i giorni passati non cambiano: pasti, valori e spesa', () => {
    const base = plan();
    for (let i = 0; i < 2; i++) {
      const iso = addDays(MON, i);
      expect(mealsForDate(iso, { plan: p, dayLogs: {} })).toEqual(mealsForDate(iso, { plan: base, dayLogs: {} }));
      expect(dayNutritionDetail(iso, { plan: p, dayLogs: {} })).toEqual(dayNutritionDetail(iso, { plan: base, dayLogs: {} }));
    }
    // Dal giorno dopo l'alimento non compare più in nessun pasto, e la spesa della settimana dopo non lo compra.
    for (let i = 2; i < 21; i++) {
      const m = mealsForDate(addDays(MON, i), { plan: p, dayLogs: {} });
      for (const e of m.meals) expect(e.recipe?.ingredients.some((l) => l.foodId === 'tonno'), `${addDays(MON, i)} ${e.slot}`).toBeFalsy();
    }
    const list = shoppingList('2026-11-16', { plan: p, dayLogs: {} });
    expect(list.items.some((it) => it.foodId === 'tonno')).toBe(false);
  });

  it('una ricetta con un alimento escluso non è ammessa, la dispensa compresa', () => {
    const ex = new Set(['tonno']);
    expect(recipeAllowed(RECIPES['pasta-tonno-pomodoro'], ex)).toBe(false);
    expect(recipeAllowed(RECIPES['pasta-pollo-spinaci'], ex)).toBe(true);
    expect(recipeAllowed(RECIPES['pasta-pollo-spinaci'], new Set(['olio-evo']))).toBe(false);
    expect(recipeAllowed(RECIPES['pasta-pollo-spinaci'], new Set())).toBe(true);
  });

  it('nel foglio della ricetta si tolgono solo gli alimenti veri, senza dispensa', () => {
    const ids = excludableFoods(RECIPES['pasta-tonno-pomodoro']);
    expect(ids).toContain('tonno');
    expect(ids).not.toContain('olio-evo');
    expect(ids).not.toContain('aglio');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('nomi per i testi dei gusti', () => {
  it('ogni alimento che si può togliere ha un nome breve in minuscolo', () => {
    for (const id of searchableFoods()) {
      const name = foodLabel(id);
      expect(name.length, id).toBeGreaterThan(1);
      expect(name, id).toBe(name.toLowerCase().replace('%', '%'));
    }
  });

  it('articoli, accordi e pronomi', () => {
    expect(foodWithArticle('tonno')).toBe('il tonno');
    expect(foodWithArticle('orzo')).toBe('l’orzo');
    expect(foodWithArticle('zucchine')).toBe('le zucchine');
    expect(foodWithArticle('spinaci')).toBe('gli spinaci surgelati');
    expect(agreed('tonno', 'Tolt')).toBe('Tolto');
    expect(agreed('mela', 'Tolt')).toBe('Tolta');
    expect(agreed('ceci', 'Tolt')).toBe('Tolti');
    expect(agreed('zucchine', 'Tolt')).toBe('Tolte');
    expect(objectPronoun('tonno')).toBe('lo');
    expect(objectPronoun('arancia')).toBe('la');
    expect(objectPronoun('gamberi')).toBe('li');
    expect(objectPronoun('carote')).toBe('le');
  });
});

describe('cambi ripetuti (§ 6.3, § 13.5 test 22)', () => {
  // Il tonno nella rotazione: pranzo del lunedì e cena del venerdì nella settimana 1, cena del venerdì nella 2:
  // 6 volte nelle 4 settimane dal 9 novembre al 6 dicembre.
  const TODAY = '2026-12-06';
  const swap = (date: ISODate, slot: MealSlot, to: string) => [date, log(date, { recipeSwaps: { [slot]: to } })] as const;
  const fourSwaps = Object.fromEntries([
    swap('2026-11-09', 'pranzo', 'pasta-pollo-spinaci'),
    swap('2026-11-13', 'cena', 'frittata-zucchine'),
    swap('2026-11-20', 'cena', 'frittata-zucchine'),
    swap('2026-11-23', 'pranzo', 'pasta-pollo-spinaci'),
  ]);

  it('i pasti con il tonno previsti sono quelli della rotazione', () => {
    let n = 0;
    for (let i = 0; i < 28; i++) {
      for (const m of plannedMealsForDate(addDays(MON, i), plan()).meals) if (m.recipe?.ingredients.some((l) => l.foodId === 'tonno')) n++;
    }
    expect(n).toBe(6);
  });

  it('conta i cambi per gli alimenti che la ricetta scelta non ha', () => {
    const s = tasteSignals({ plan: plan(), dayLogs: fourSwaps }, TODAY);
    const tonno = s.find((x) => x.foodId === 'tonno')!;
    expect(tonno).toEqual({ foodId: 'tonno', swaps: 4, planned: 6 });
    // La pasta resta nel pasto scelto: non è un cambio della pasta.
    expect(s.find((x) => x.foodId === 'pasta')).toBeUndefined();
    expect(tasteSignals({ plan: plan(), dayLogs: fourSwaps }, TODAY)).toEqual(s);
  });

  it('chiede solo con 3 cambi in 28 giorni e almeno il 60% delle volte', () => {
    const state = { plan: plan(), dayLogs: fourSwaps };
    expect(tasteQuestion(state, TODAY)?.foodId).toBe('tonno');
    expect(tasteQuestion(state, TODAY, RECIPES['pasta-tonno-pomodoro'])?.foodId).toBe('tonno');
    // In testa alle alternative di un pasto senza tonno non compare.
    expect(tasteQuestion(state, TODAY, RECIPES['porridge-cacao-banana'])).toBeNull();
    // 3 cambi su 6: il 50%, non basta.
    const three = { ...fourSwaps };
    delete three['2026-11-23'];
    expect(tasteQuestion({ plan: plan(), dayLogs: three }, TODAY)).toBeNull();
    // Fuori dalla finestra di 28 giorni i cambi vecchi non contano.
    expect(tasteQuestion(state, addDays(TODAY, 21))).toBeNull();
  });

  it('mai entro 56 giorni da un «Tienilo», mai per un alimento già escluso', () => {
    const asked = (days: number) => ({ plan: plan({ tasteAsked: { tonno: addDays(TODAY, -days) } }), dayLogs: fourSwaps });
    expect(tasteQuestion(asked(10), TODAY)).toBeNull();
    expect(tasteQuestion(asked(TASTE_ASK_COOLDOWN_DAYS - 1), TODAY)).toBeNull();
    expect(tasteQuestion(asked(TASTE_ASK_COOLDOWN_DAYS), TODAY)?.foodId).toBe('tonno');
    const excluded = { plan: plan({ exclusions: [{ foodId: 'tonno', since: '2026-12-07', origin: 'impostazioni' }] }), dayLogs: fourSwaps };
    expect(tasteQuestion(excluded, TODAY)).toBeNull();
  });

  it('la ricetta prevista al momento del cambio vince sul menù di oggi', () => {
    const d = '2026-11-10';
    const logs = { [d]: log(d, { recipeSwaps: { pranzo: 'pasta-pollo-spinaci' }, swapPlanned: { pranzo: 'pasta-tonno-pomodoro' } }) };
    const s = tasteSignals({ plan: plan(), dayLogs: logs }, '2026-11-12');
    expect(s.find((x) => x.foodId === 'tonno')?.swaps).toBe(1);
  });
});
