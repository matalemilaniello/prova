/**
 * Misure della prevenzione nella revisione (docs/FASE2.md § 4.7; § 13.4 test 19) e scalino dell'alcol. Gli alimenti di
 * sola stima si provano con fatti iniettati: i fatti veri arrivano con l'integrazione dell'onda. Dati inventati.
 */
import { describe, expect, it } from 'vitest';
import type { AppData, DayLog, ISODate, MealSlot } from '../domain/types';
import type { FoodFacts } from '../data/foodFactsTypes';
import { defaultAppData } from '../data/defaults';
import { factsOf } from '../data/foodFacts';
import { weekDates } from './dates';
import { mealsForDate } from './menu';
import { alcoholStepOption, measuresOutside, preventionMeasures, proposeWeeklyStep, reviewStep, weeklyStepDef } from './review';

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
