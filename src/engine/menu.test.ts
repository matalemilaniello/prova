import { describe, expect, it } from 'vitest';
import type { AppData, MenuWeek } from '../domain/types';
import { defaultPlan, planStartFor } from '../data/defaults';
import { MENU_ROTATION } from '../data/menu';
import { RECIPES } from '../data/recipes';
import {
  dayTypeFor,
  effectiveDayType,
  isMatchEve,
  isStarterDay,
  mealsForDate,
  menuDayFor,
  menuWeekFor,
  rotationIndexFor,
  starterEnd,
  starterRecipeFor,
} from './menu';
import { dayNutrition, dayNutritionDetail } from './nutrition';

const week = (tag: string): MenuWeek => ({
  days: Array.from({ length: 7 }, (_, i) => ({
    meals: { colazione: `${tag}-col-${i}`, pranzo: `${tag}-pra-${i}`, cena: `${tag}-cen-${i}` },
  })),
  prep: [],
});

const rotation = [week('A'), week('B')];
const plan = defaultPlan('2026-11-09');
const state: Pick<AppData, 'plan' | 'dayLogs'> = { plan, dayLogs: {} };

describe('rotazione del menù', () => {
  it('alterna le settimane dall’inizio del piano', () => {
    expect(rotationIndexFor('2026-11-09', plan.startDate, rotation)).toBe(0);
    expect(rotationIndexFor('2026-11-15', plan.startDate, rotation)).toBe(0);
    expect(rotationIndexFor('2026-11-16', plan.startDate, rotation)).toBe(1);
    expect(rotationIndexFor('2026-11-23', plan.startDate, rotation)).toBe(0);
    // Prima dell'inizio del piano non si rompe.
    expect(rotationIndexFor('2026-11-02', plan.startDate, rotation)).toBe(1);
  });

  it('sceglie il giorno della settimana giusto', () => {
    expect(menuDayFor('2026-11-11', plan.startDate, rotation)?.meals.pranzo).toBe('A-pra-2');
    expect(menuDayFor('2026-11-22', plan.startDate, rotation)?.meals.cena).toBe('B-cen-6');
  });

  it('rotazione vuota: nessun errore e nessun pasto', () => {
    expect(menuWeekFor('2026-11-11', plan.startDate, [])).toBeUndefined();
    const m = mealsForDate('2026-11-11', state, []);
    expect(m.meals).toEqual([]);
    expect(m.dayType).toBe('calcio');
    expect(dayNutrition('2026-11-11', state).kcal).toBeGreaterThanOrEqual(0);
  });

  it('applica le sostituzioni del diario', () => {
    const s: Pick<AppData, 'plan' | 'dayLogs'> = {
      plan,
      dayLogs: {
        '2026-11-10': {
          date: '2026-11-10',
          status: {},
          notes: {},
          minimal: false,
          waterGlasses: 0,
          sweets: 0,
          recipeSwaps: { pranzo: 'altra-ricetta' },
        },
      },
    };
    const m = mealsForDate('2026-11-10', s, rotation);
    expect(m.bySlot.pranzo?.recipeId).toBe('altra-ricetta');
    expect(m.bySlot.pranzo?.plannedId).toBe('A-pra-1');
    expect(m.bySlot.pranzo?.swapped).toBe(true);
    expect(m.bySlot.cena?.swapped).toBe(false);
    expect(m.meals.map((x) => x.slot)).toEqual(['colazione', 'pranzo', 'cena']);
  });

  it('tipo di giorno dal piano', () => {
    expect(dayTypeFor('2026-11-09', plan)).toBe('calcio');
    expect(dayTypeFor('2026-11-10', plan)).toBe('palestra');
    expect(dayTypeFor('2026-11-14', plan)).toBe('leggero');
    expect(dayTypeFor('2026-11-15', plan)).toBe('riposo');
  });

  it('dettaglio della giornata coerente con il totale', () => {
    const d = dayNutritionDetail('2026-11-10', state);
    expect(d.dayType).toBe('palestra');
    expect(d.total.kcal).toBeCloseTo(dayNutrition('2026-11-10', state).kcal, 6);
    expect(dayNutrition('2026-11-10', state, { onlyDone: true }).kcal).toBe(0);
  });

  it('già mangiato: il pasto preso con il piano B al bar vale l’ordine, un sostituito senza ordine non conta', () => {
    const order = { kcal: 520, proteinG: 34, carbG: 60, fatG: 14, fiberG: 6 };
    const s: Pick<AppData, 'plan' | 'dayLogs'> = {
      plan,
      dayLogs: {
        '2026-11-10': {
          date: '2026-11-10',
          status: { 'pasto:colazione': 'fatto', 'pasto:pranzo': 'sostituito', 'pasto:cena': 'sostituito' },
          notes: {},
          minimal: false,
          waterGlasses: 0,
          sweets: 0,
          recipeSwaps: {},
          barMeals: { pranzo: { label: 'Piadina con pollo', nutrients: order, vegPortions: 1 } },
        },
      },
    };
    const planned = dayNutritionDetail('2026-11-10', s);
    const eaten = dayNutritionDetail('2026-11-10', s, { onlyDone: true });
    expect(eaten.bySlot.pranzo).toEqual(order);
    expect(eaten.bySlot.cena).toBeUndefined();
    expect(eaten.total.kcal).toBeCloseTo((planned.bySlot.colazione?.kcal ?? 0) + order.kcal, 6);
    expect(eaten.total.proteinG).toBeCloseTo((planned.bySlot.colazione?.proteinG ?? 0) + order.proteinG, 6);
  });
});

describe('vigilia della partita', () => {
  it('la domenica prima della partita del lunedì mangia come un giorno di calcio', () => {
    // 2026-11-15 è domenica (riposo nella settimana tipo), lunedì 16 c'è la partita.
    expect(dayTypeFor('2026-11-15', plan)).toBe('riposo');
    expect(isMatchEve('2026-11-15', plan)).toBe(true);
    expect(effectiveDayType('2026-11-15', plan)).toBe('calcio');
    const m = mealsForDate('2026-11-15', state, rotation);
    expect(m.dayType).toBe('calcio');
    expect(m.scheduledDayType).toBe('riposo');
    expect(m.matchEve).toBe(true);
  });

  it('negli altri giorni il tipo resta quello del piano', () => {
    expect(effectiveDayType('2026-11-14', plan)).toBe('leggero');
    expect(isMatchEve('2026-11-14', plan)).toBe(false);
    expect(effectiveDayType('2026-11-16', plan)).toBe('calcio');
    expect(isMatchEve('', plan)).toBe(false);
    // Senza partita il lunedì, la domenica torna di riposo.
    const noMatch = { ...plan, week: plan.week.map((d) => (d.weekday === 0 ? { ...d, football: undefined } : d)) };
    expect(effectiveDayType('2026-11-15', noMatch)).toBe('riposo');
  });
});

describe('primo avvio', () => {
  it('il piano parte di lunedì: questa settimana fino al giovedì, poi la prossima', () => {
    expect(planStartFor('2026-11-09')).toBe('2026-11-09'); // lunedì
    expect(planStartFor('2026-11-12')).toBe('2026-11-09'); // giovedì
    expect(planStartFor('2026-11-13')).toBe('2026-11-16'); // venerdì
    expect(planStartFor('2026-11-15')).toBe('2026-11-16'); // domenica sera: lunedì è la settimana 1
  });

  it('giorni di avvio dal primo avvio al lunedì che trova fatta la preparazione', () => {
    const withFirst = (date: string) => ({ ...plan, firstUse: { date, time: '21:30' } }) as AppData['plan'];
    // Mercoledì: fino a domenica compresa, poi c'è la domenica per preparare.
    expect(starterEnd(withFirst('2026-11-11'))).toBe('2026-11-16');
    expect(isStarterDay('2026-11-10', withFirst('2026-11-11'))).toBe(false);
    expect(isStarterDay('2026-11-11', withFirst('2026-11-11'))).toBe(true);
    expect(isStarterDay('2026-11-15', withFirst('2026-11-11'))).toBe(true);
    expect(isStarterDay('2026-11-16', withFirst('2026-11-11'))).toBe(false);
    // Domenica sera: niente preparazione possibile, l'avvio copre anche la settimana dopo.
    expect(starterEnd(withFirst('2026-11-15'))).toBe('2026-11-23');
    expect(isStarterDay('2026-11-20', withFirst('2026-11-15'))).toBe(true);
    // Senza primo avvio (dati di esempio, piani vecchi): nessun giorno di avvio.
    expect(starterEnd(plan)).toBeNull();
    expect(isStarterDay('2026-11-11', plan)).toBe(false);
  });

  it('nei giorni di avvio le ricette da preparazione lasciano il posto a un’alternativa veloce', () => {
    const batch = Object.values(RECIPES).filter((r) => r.batch);
    expect(batch.length).toBeGreaterThan(0);
    for (const r of batch) {
      for (const slot of r.slots) {
        const alt = RECIPES[starterRecipeFor(r.id, slot)];
        expect(alt.batch).toBeFalsy();
        expect(alt.slots).toContain(slot);
      }
    }
    const quick = Object.values(RECIPES).find((r) => !r.batch)!;
    expect(starterRecipeFor(quick.id, quick.slots[0])).toBe(quick.id);

    // Sul menù vero: dal primo avvio nessun pasto richiede la preparazione della domenica.
    const start = planStartFor('2026-11-15');
    const p = { ...defaultPlan(start), startDate: start, firstUse: { date: '2026-11-15', time: '21:00' } } as AppData['plan'];
    const s = { plan: p, dayLogs: {} };
    let replaced = 0;
    for (let i = 0; i < 8; i++) {
      const d = new Date(2026, 10, 15 + i, 12);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const m = mealsForDate(iso, s);
      expect(m.starter).toBe(true);
      for (const e of m.meals) {
        expect(e.recipe?.batch).toBeFalsy();
        if (e.starterOf) {
          replaced++;
          expect(RECIPES[e.starterOf]?.batch).toBe(true);
          expect(e.swapped).toBe(false);
        }
      }
    }
    if (MENU_ROTATION.some((w) => w.days.some((d) => Object.values(d.meals).some((id) => id && RECIPES[id]?.batch)))) {
      expect(replaced).toBeGreaterThan(0);
    }
    // Dal lunedì dopo torna il menù con la preparazione.
    expect(mealsForDate('2026-11-23', s).starter).toBe(false);
  });
});
