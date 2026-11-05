/**
 * Misure della prevenzione nella revisione (docs/FASE2.md § 4.7; § 13.4 test 19) e scalino dell'alcol. Le prime prove
 * usano fatti iniettati; quelle in fondo i fatti veri degli alimenti di sola stima (`ESTIMATE_FOOD_FACTS`, letti da
 * `factsOf`). Dati inventati.
 */
import { describe, expect, it } from 'vitest';
import type { AppData, DayLog, ISODate, MealSlot } from '../domain/types';
import type { FoodFacts } from '../data/foodFactsTypes';
import { defaultAppData } from '../data/defaults';
import { factsOf } from '../data/foodFacts';
import { ESTIMATE_FOODS } from '../data/estimateFoods';
import { mealPrevention } from './prevention';
import { weekDates } from './dates';
import { mealsForDate } from './menu';
import { alcoholStepOption, measuresOutside, preventionHeadline, preventionMeasures, proposeWeeklyStep, reviewStep, weeklyStepDef } from './review';

const WS = '2026-11-09';
const TODAY = '2026-11-16';

function base(): AppData {
  const d = defaultAppData('2026-11-02');
  d.onboarded = true;
  d.profile = { ...d.profile, sex: 'M', startWeightKg: 76, heightCm: 180, birthYear: 1990 };
  return d;
}

/** Tutti i pasti della settimana segnati «fatto». */
function allDone(d: AppData) {
  for (const date of weekDates(WS)) {
    const status: Record<string, 'fatto'> = {};
    for (const m of mealsForDate(date, d).meals) status[`pasto:${m.slot}`] = 'fatto';
    d.dayLogs[date] = { date, status, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {} };
  }
}

function setMeal(d: AppData, date: ISODate, slot: MealSlot, meal: NonNullable<DayLog['barMeals']>[MealSlot], status: 'sostituito' | 'fatto' = 'sostituito') {
  const log = d.dayLogs[date];
  log.status[`pasto:${slot}`] = status;
  log.barMeals = { ...(log.barMeals ?? {}), [slot]: meal };
}

const SALAME: FoodFacts = { group: 'carne-lavorata' };
const facts = (id: string) => (id === 'salame-di-prova' ? SALAME : factsOf(id));
const byId = (r: ReturnType<typeof preventionMeasures>, id: string) => r.measures.find((m) => m.id === id);

describe('misure della prevenzione (test 19)', () => {
  it('un pasto stimato con salumi conta in B2 e precompila la domanda', () => {
    const d = base();
    allDone(d);
    setMeal(d, '2026-11-11', 'pranzo', {
      label: 'Panino con salame',
      nutrients: { kcal: 520, proteinG: 22, carbG: 55, fatG: 22, fiberG: 3 },
      source: 'foto',
      items: [
        { foodId: 'pane-bianco', grams: 100 },
        { foodId: 'salame-di-prova', grams: 50 },
      ],
    });
    const r = preventionMeasures(WS, d, { today: TODAY, facts });
    expect(byId(r, 'carne-lavorata')).toMatchObject({ status: 'fuori', value: '1 volta' });
    expect(r.prefill.processed).toBe(1);
    // La risposta vince se dice di più del diario, mai di meno.
    expect(byId(preventionMeasures(WS, d, { today: TODAY, facts, outside: { processed: 2 } }), 'carne-lavorata')?.value).toBe('2 volte');
    expect(byId(preventionMeasures(WS, d, { today: TODAY, facts, outside: { processed: 0 } }), 'carne-lavorata')?.value).toBe('1 volta');
  });

  it('un ordine del bar senza alimenti non conta', () => {
    const d = base();
    allDone(d);
    setMeal(d, '2026-11-11', 'pranzo', { label: 'Toast al prosciutto', nutrients: { kcal: 300, proteinG: 14, carbG: 30, fatG: 12, fiberG: 1 } });
    const r = preventionMeasures(WS, d, { today: TODAY, facts });
    expect(byId(r, 'carne-lavorata')?.status).toBe('non-indicato');
    expect(r.prefill).toEqual({});
  });

  it('2 porzioni di carne rossa fuori dal menù valgono 300 g cotti e il testo dice «circa»', () => {
    const d = base();
    allDone(d);
    const without = byId(preventionMeasures(WS, d, { today: TODAY }), 'carne-rossa')!;
    const menuG = Number(without.value.match(/circa (\d+)/)![1]);
    expect(without.status).toBe('non-indicato');
    const r = preventionMeasures(WS, d, { today: TODAY, outside: { redMeat: 2 } });
    const m = byId(r, 'carne-rossa')!;
    expect(m.value).toBe(`circa ${menuG + 300} g su 350`);
    expect(m.status).toBe(menuG + 300 > 350 ? 'fuori' : 'dentro');
    expect(byId(preventionMeasures(WS, d, { today: TODAY, outside: { redMeat: 0 } }), 'carne-rossa')?.status).toBe('dentro');
  });

  it('con il menù seguito le misure del menù stanno nei riferimenti', () => {
    const d = base();
    allDone(d);
    const r = preventionMeasures(WS, d, { today: TODAY, outside: { redMeat: 0, processed: 0, alcoholUnits: '0' } });
    expect(r.days).toBe(7);
    expect(measuresOutside(r)).toEqual([]);
    for (const id of ['legumi', 'pesce', 'riso', 'integrali', 'vegetali', 'alcol', 'carne-lavorata', 'carne-rossa'] as const) {
      expect(byId(r, id)?.status, id).toBe('dentro');
    }
  });

  it('«tutto nei limiti» solo con tutte le misure dentro; con domande saltate lo dice (§ 4.7)', () => {
    const d = base();
    allDone(d);
    const full = preventionMeasures(WS, d, { today: TODAY, outside: { redMeat: 0, processed: 0, alcoholUnits: '0' } });
    expect(preventionHeadline(full)).toEqual({ title: 'Prevenzione: tutto nei limiti' });
    // Senza le risposte alcol e salumi sono «non indicato»: niente è fuori, ma non si sa tutto.
    const skipped = preventionMeasures(WS, d, { today: TODAY, outside: { redMeat: 0 } });
    expect(measuresOutside(skipped)).toEqual([]);
    const unknown = skipped.measures.filter((m) => m.status === 'non-indicato').length;
    expect(unknown).toBeGreaterThanOrEqual(2);
    expect(preventionHeadline(skipped)).toEqual({ title: 'Prevenzione: niente fuori dai limiti', summary: `${unknown} non indicate` });
    expect(preventionHeadline(preventionMeasures(WS, d, { today: TODAY, outside: { alcoholUnits: '4-7' } }))).toBeNull();
  });

  it('senza risposte l’alcol è «non indicato»; con l’alcol si propone il suo scalino', () => {
    const d = base();
    allDone(d);
    expect(byId(preventionMeasures(WS, d, { today: TODAY }), 'alcol')).toMatchObject({ status: 'non-indicato', value: 'non indicato' });
    const r = preventionMeasures(WS, d, { today: TODAY, outside: { alcoholUnits: '4-7', binge: true } });
    expect(byId(r, 'alcol')).toMatchObject({ status: 'fuori', value: '4-7 unità, una sera con 5 o più' });
    expect(r.alcohol).toBe(true);
    expect(alcoholStepOption({ alcoholUnits: '0' })).toBeNull();
    const step = proposeWeeklyStep(WS, d, { today: TODAY, outside: { alcoholUnits: '4-7' } });
    expect(step.suggested.id).toBe('alcol');
    expect(proposeWeeklyStep(WS, d, { today: TODAY, outside: { alcoholUnits: '0' } }).options.some((o) => o.id === 'alcol')).toBe(false);
    expect(proposeWeeklyStep(WS, d, { today: TODAY }).options.some((o) => o.id === 'alcol')).toBe(false);
    // Lo scalino salvato si rilegge.
    expect(reviewStep({ weekStart: WS, votes: { energia: 7, digestione: 7, umore: 7, campo: 7 }, acceptedProposals: [], step: { id: 'alcol', title: weeklyStepDef('alcol').title } })?.id).toBe('alcol');
  });

  it('la vita sopra il limite o in aumento esce dal riferimento', () => {
    const d = base();
    allDone(d);
    expect(byId(preventionMeasures(WS, d, { today: TODAY, waistCm: 90 }), 'vita')?.status).toBe('dentro');
    expect(byId(preventionMeasures(WS, d, { today: TODAY, waistCm: 96 }), 'vita')?.status).toBe('fuori');
    d.reviews = [{ weekStart: '2026-10-19', votes: { energia: 7, digestione: 7, umore: 7, campo: 7 }, acceptedProposals: [], waistCm: 86 }];
    const rising = byId(preventionMeasures(WS, d, { today: TODAY, waistCm: 88 }), 'vita')!;
    expect(rising.status).toBe('fuori');
    expect(rising.value).toContain('in 4 settimane');
  });

  it('senza giorni segnati non si inventano misure del menù', () => {
    const d = base();
    const r = preventionMeasures(WS, d, { today: TODAY });
    expect(r.days).toBe(0);
    expect(r.measures.map((m) => m.id).sort()).toEqual(['alcol', 'carne-lavorata']);
    expect(measuresOutside(r)).toEqual([]);
  });
});

describe('misure della prevenzione con i fatti veri delle sole stime', () => {
  const DAY = '2026-11-11';
  const KCAL = { kcal: 600, proteinG: 30, carbG: 60, fatG: 25, fiberG: 4 };

  /** Un solo giorno chiuso nel diario: il menù non basta per le misure (pochi giorni) e contano solo le stime. */
  function oneDay(meal: NonNullable<DayLog['barMeals']>[MealSlot], status: 'sostituito' | 'fatto' = 'sostituito'): AppData {
    const d = base();
    d.dayLogs[DAY] = { date: DAY, status: {}, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {} };
    setMeal(d, DAY, 'pranzo', meal, status);
    return d;
  }

  it('i salumi di sola stima e quelli di un piatto salvato contano in B2', () => {
    const photo = oneDay({ label: 'Panino', nutrients: KCAL, source: 'foto', items: [{ foodId: 'pane-bianco', grams: 80 }, { foodId: 'salame', grams: 40 }] });
    const r = preventionMeasures(WS, photo, { today: TODAY });
    expect(byId(r, 'carne-lavorata')).toMatchObject({ status: 'fuori', value: '1 volta' });
    expect(r.prefill.processed).toBe(1);
    const dish = oneDay({ label: 'Il mio piatto', nutrients: KCAL, source: 'piatto', dishId: 'p1', portion: 1, items: [{ foodId: 'prosciutto-crudo', grams: 50 }, { foodId: 'mozzarella', grams: 100 }] });
    expect(byId(preventionMeasures(WS, dish, { today: TODAY }), 'carne-lavorata')?.status).toBe('fuori');
  });

  it('un piatto composto conta solo la sua carne: 220 g di hamburger nel panino non sono 220 g di carne rossa', () => {
    const d = oneDay({ label: 'Hamburger', nutrients: KCAL, source: 'foto', items: [{ foodId: 'hamburger', grams: 220 }, { foodId: 'patatine-fritte', grams: 100 }] });
    const r = preventionMeasures(WS, d, { today: TODAY });
    // 220 × 0,4 = 88 g, arrotondati a 10.
    expect(byId(r, 'carne-rossa')).toMatchObject({ value: 'circa 90 g dal diario, fuori dal menù non indicato', status: 'non-indicato' });
    expect(r.prefill.redMeat).toBe(1);
    // La risposta precompilata comprende la foto: nessuna porzione in più; una porzione in più vale 150 g.
    expect(byId(preventionMeasures(WS, d, { today: TODAY, outside: { redMeat: 1 } }), 'carne-rossa')).toMatchObject({ value: 'circa 90 g su 350', status: 'dentro' });
    expect(byId(preventionMeasures(WS, d, { today: TODAY, outside: { redMeat: 2 } }), 'carne-rossa')?.value).toBe('circa 240 g su 350');
    expect(byId(preventionMeasures(WS, d, { today: TODAY, outside: { redMeat: 3 } }), 'carne-rossa')).toMatchObject({ value: 'circa 390 g su 350', status: 'fuori' });
    // Una lasagna al ragù è carne rossa per la sua quota, non per il peso intero.
    const lasagna = oneDay({ label: 'Lasagna', nutrients: KCAL, source: 'foto', items: [{ foodId: 'lasagna', grams: 400 }] });
    expect(byId(preventionMeasures(WS, lasagna, { today: TODAY, outside: { redMeat: 1 } }), 'carne-rossa')?.value).toBe('circa 60 g su 350');
  });

  it('una foto del pasto previsto conta i suoi grammi ma non precompila la carne rossa fuori dal menù', () => {
    const d = oneDay({ label: 'Manzo e patate', nutrients: KCAL, source: 'foto', asPlanned: true, items: [{ foodId: 'manzo', grams: 200 }, { foodId: 'patate', grams: 200 }] }, 'fatto');
    const r = preventionMeasures(WS, d, { today: TODAY });
    expect(r.prefill.redMeat).toBeUndefined();
    expect(byId(r, 'carne-rossa')?.value).toBe('circa 200 g dal diario, fuori dal menù non indicato');
    // Una porzione fuori dal menù è un pasto diverso: si somma.
    expect(byId(preventionMeasures(WS, d, { today: TODAY, outside: { redMeat: 1 } }), 'carne-rossa')).toMatchObject({ value: 'circa 350 g su 350', status: 'dentro' });
  });

  it('ogni alimento di sola stima di carne ha una quota tra 0 e 1 e non conta mai più del suo peso', () => {
    for (const f of ESTIMATE_FOODS) {
      const facts = factsOf(f.id)!;
      expect(facts, f.id).toBeDefined();
      if (facts.group !== 'carne-rossa' && facts.group !== 'carne-lavorata') {
        expect(facts.meatShare, f.id).toBeUndefined();
        continue;
      }
      const p = mealPrevention({ day: DAY, slot: 'pranzo', items: [{ foodId: f.id, grams: 100 }] });
      const g = facts.group === 'carne-rossa' ? p.redMeatG : p.processedG;
      expect(g, f.id).toBeGreaterThan(0);
      expect(g, f.id).toBeLessThanOrEqual(100);
    }
  });
});
