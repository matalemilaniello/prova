/**
 * Pasto rimasto senza ricetta per un'esclusione (docs/FASE2.md § 6.4): Oggi lo mostra con «Scegli tu» e senza ricetta da
 * aprire; uno scambio dell'utente o una stima da foto vincono. Dati inventati.
 */
import { describe, expect, it } from 'vitest';
import type { AppData, DayLog } from '../domain/types';
import { defaultAppData } from '../data/defaults';
import { RECIPES } from '../data/recipes';
import { mealsForDate } from './menu';
import { buildTimeline, CLEARED_MEAL_DETAIL } from './timeline';

const MON = '2026-11-09';
/** Mercoledì con il calcio la sera: la merenda pre-calcio della rotazione ha la banana. */
const WED = '2026-11-11';

function state(log?: Partial<DayLog>): AppData {
  const s = defaultAppData(MON);
  const plan = { ...s.plan, startDate: MON, exclusions: [{ foodId: 'banana', since: MON, origin: 'non-mi-piace' as const }] };
  const dayLogs: Record<string, DayLog> = log ? { [WED]: { date: WED, status: {}, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {}, ...log } } : {};
  return { ...s, plan, dayLogs };
}

const snack = (s: AppData) => buildTimeline(WED, s).find((i) => i.id === 'pasto:merenda');

describe('pasto senza alternative in Oggi (§ 6.4)', () => {
  it('dice «Scegli tu» e non ha una ricetta da aprire', () => {
    const s = state();
    expect(mealsForDate(WED, s).cleared?.merenda).toBeDefined();
    const item = snack(s)!;
    expect(item.detail).toBe(CLEARED_MEAL_DETAIL);
    expect(item.ref).toBeUndefined();
  });

  it('senza esclusioni il dettaglio resta il nome della ricetta', () => {
    const s = state();
    s.plan = { ...s.plan, exclusions: [] };
    const item = snack(s)!;
    expect(item.detail).toBe(mealsForDate(WED, s).bySlot.merenda?.recipe?.name);
    expect(item.detail).not.toBe(CLEARED_MEAL_DETAIL);
  });

  it('uno scambio dell’utente o una stima da foto vincono sul pasto vuoto', () => {
    const swapId = Object.values(RECIPES).find((r) => r.slots.includes('merenda') && !r.ingredients.some((l) => l.foodId === 'banana'))!.id;
    expect(snack(state({ recipeSwaps: { merenda: swapId } }))?.detail).toBe(RECIPES[swapId].name);
    const photo = state({
      status: { 'pasto:merenda': 'sostituito' },
      barMeals: { merenda: { label: 'Yogurt e frutta', nutrients: { kcal: 250, proteinG: 15, carbG: 30, fatG: 6, fiberG: 3 }, source: 'foto', items: [{ foodId: 'yogurt-greco-0', grams: 170 }] } },
    });
    expect(snack(photo)?.detail).toMatch(/^Dalla foto · /);
  });
});
