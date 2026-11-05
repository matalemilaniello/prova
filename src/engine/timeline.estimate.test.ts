import { describe, expect, it } from 'vitest';
import type { AppData, DayLog, EatenMeal, ItemStatus } from '../domain/types';
import { defaultAppData } from '../data/defaults';
import { mealsForDate } from './menu';
import { buildTimeline } from './timeline';

const MON = '2026-11-09';

function withMeal(meal: EatenMeal | null, status?: ItemStatus): AppData {
  const s = defaultAppData(MON);
  const log: DayLog = {
    date: MON,
    status: status ? { 'pasto:pranzo': status } : {},
    notes: {},
    minimal: false,
    waterGlasses: 0,
    sweets: 0,
    recipeSwaps: {},
    ...(meal ? { barMeals: { pranzo: meal } } : {}),
  };
  return { ...s, plan: { ...s.plan, startDate: MON }, dayLogs: { [MON]: log } };
}

const nutrients = { kcal: 718, proteinG: 35, carbG: 80, fatG: 22, fiberG: 9 };
const lunch = (s: AppData) => buildTimeline(MON, s).find((i) => i.id === 'pasto:pranzo');

describe('dettaglio dei pasti stimati in Oggi (§ 11.2)', () => {
  it('senza stime il dettaglio è il nome della ricetta, come prima', () => {
    const s = withMeal(null);
    expect(lunch(s)?.detail).toBe(mealsForDate(MON, s).bySlot.pranzo?.recipe?.name);
  });

  it('una foto dice la provenienza e le kcal arrotondate a 10', () => {
    const s = withMeal({ label: 'Pasta e ceci', nutrients, source: 'foto', asPlanned: true }, 'fatto');
    expect(lunch(s)?.detail).toBe('Dalla foto · 720 kcal');
  });

  it('un piatto salvato dice il suo nome', () => {
    const s = withMeal({ label: 'Pasta al pesto', nutrients: { ...nutrients, kcal: 642 }, source: 'piatto', dishId: 'p1', portion: 1 }, 'sostituito');
    expect(lunch(s)?.detail).toBe('Il mio piatto: pasta al pesto · 640 kcal');
  });

  it('il bar resta com’è; una stima che non vale per la voce non cambia niente', () => {
    const recipe = mealsForDate(MON, withMeal(null)).bySlot.pranzo?.recipe?.name;
    expect(lunch(withMeal({ label: 'Al bar', nutrients }, 'sostituito'))?.detail).toBe(recipe);
    expect(lunch(withMeal({ label: 'Pasta e ceci', nutrients, source: 'foto' }, 'fatto'))?.detail).toBe(recipe);
    expect(lunch(withMeal({ label: 'Pasta e ceci', nutrients, source: 'foto', asPlanned: true }, 'saltato'))?.detail).toBe(recipe);
  });
});
