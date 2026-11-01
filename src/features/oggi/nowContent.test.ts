import { describe, expect, it } from 'vitest';
import type { AppData, DayType, ISODate, MacroTarget } from '../../domain/types';
import { defaultAppData, defaultPlan } from '../../data/defaults';
import { FOODS } from '../../data/foods';
import { RECIPES } from '../../data/recipes';
import { effectiveDayType, isMatchEve } from '../../engine/menu';
import { dayCarbScale, dayNutritionDetail, recipeNutrition } from '../../engine/nutrition';
import { buildDay, type DayItem } from '../../engine/timeline';
import { fmtKcal, fmtMinutes } from '../../lib/format';
import { mealNutrientsFor, nowContent, stateLabel } from './nowContent';

const MON: ISODate = '2026-11-02';
const SUN: ISODate = '2026-11-01';

/** Obiettivi ricalcolati nel benvenuto: 100 kcal in meno, tolte dai carboidrati. */
function recalculated(): AppData {
  const base = defaultAppData(SUN);
  const plan = defaultPlan('2026-10-26');
  const targets = Object.fromEntries(
    Object.entries(plan.targets).map(([k, t]) => [k, { ...t, kcal: t.kcal - 100, carbG: t.carbG - 25 }]),
  ) as Record<DayType, MacroTarget>;
  return { ...base, onboarded: true, plan: { ...plan, targets } };
}

/** Quello che mostra Settimana > Menù per uno slot (MenuTab: tipo effettivo e scala del giorno). */
function menuKcal(date: ISODate, state: AppData, item: DayItem): string {
  const recipe = RECIPES[item.ref!];
  const k = dayCarbScale(date, state);
  return fmtKcal(recipeNutrition(recipe, effectiveDayType(date, state.plan), FOODS, k).kcal);
}

function ctxFor(date: ISODate, state: AppData) {
  return { mealValues: dayNutritionDetail(date, state).bySlot, curfewIn: 120, bed: '00:45' as const, timeShown: false };
}

describe('card Adesso: valori dei pasti', () => {
  it('con obiettivi ricalcolati le kcal di ogni pasto coincidono con quelle di Settimana', () => {
    const state = recalculated();
    expect(dayCarbScale(MON, state)).not.toBe(1);
    const meals = buildDay(MON, state).filter((i) => i.kind === 'pasto' && i.ref);
    expect(meals.length).toBe(5);
    for (const item of meals) {
      const meta = nowContent(item, ctxFor(MON, state)).meta;
      expect(meta[0]).toBe(menuKcal(MON, state, item));
    }
  });

  it('alla vigilia della partita usa le porzioni del giorno di calcio, come il menù', () => {
    const state = recalculated();
    expect(isMatchEve(SUN, state.plan)).toBe(true);
    const cena = buildDay(SUN, state).find((i) => i.id === 'pasto:cena')!;
    expect(nowContent(cena, ctxFor(SUN, state)).meta[0]).toBe(menuKcal(SUN, state, cena));
  });

  it('le proteine sono quelle del dettaglio del giorno', () => {
    const state = recalculated();
    const colazione = buildDay(MON, state).find((i) => i.id === 'pasto:colazione')!;
    const n = mealNutrientsFor(colazione, dayNutritionDetail(MON, state).bySlot)!;
    expect(nowContent(colazione, ctxFor(MON, state)).meta[1]).toBe(`${Math.round(n.proteinG)} g proteine`);
  });
});

describe('card Adesso: testi', () => {
  it('la revisione ha un solo nome', () => {
    const state = recalculated();
    const rev = buildDay(SUN, state).find((i) => i.kind === 'revisione')!;
    const c = nowContent(rev, ctxFor(SUN, state));
    expect(c.headline).toBe(rev.title);
    expect(c.kicker).toBe('Rito della domenica');
  });

  it('il coprifuoco non ripete il conto alla rovescia già scritto in alto', () => {
    const state = recalculated();
    const item = buildDay(MON, state).find((i) => i.kind === 'coprifuoco')!;
    const base = ctxFor(MON, state);
    expect(nowContent(item, { ...base, timeShown: true }).meta.some((m) => m.startsWith('Tra'))).toBe(false);
    expect(nowContent(item, base).meta.some((m) => m.startsWith('Tra'))).toBe(true);
  });

  it('l’etichetta separa la durata, che resta in minuscolo', () => {
    const state = recalculated();
    const item = buildDay(MON, state).find((i) => i.kind === 'coprifuoco')!;
    expect(stateLabel({ item, state: 'prossima', deltaMin: 215 })).toEqual({ label: 'Prossima', time: `tra ${fmtMinutes(215)}` });
    expect(stateLabel({ item, state: 'prossima', deltaMin: 300 })).toEqual({ label: 'Prossima' });
    expect(stateLabel({ item, state: 'adesso', deltaMin: -10 }).time).toBe(`da ${fmtMinutes(10)}`);
  });
});
