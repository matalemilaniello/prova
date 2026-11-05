import { describe, expect, it } from 'vitest';
import type { AppData, DayType, ISODate, MacroTarget } from '../../domain/types';
import { defaultAppData, defaultPlan } from '../../data/defaults';
import { FOODS } from '../../data/foods';
import { RECIPES } from '../../data/recipes';
import { effectiveDayType, isMatchEve } from '../../engine/menu';
import { dayCarbScale, dayNutritionDetail, recipeNutrition } from '../../engine/nutrition';
import { buildDay, type DayItem } from '../../engine/timeline';
import { fmtKcal, fmtMinutes } from '../../lib/format';
import { CARRY_META, MINIMAL_GYM_HEADLINE, eyebrowKicker, mealNutrientsFor, nowContent, stateLabel } from './nowContent';

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

describe('card Adesso: occhiello', () => {
  it('la categoria è breve e non ripete il titolo', () => {
    expect(eyebrowKicker('Merenda pre-partita', 'Pane, ricotta e miele')).toBe('Merenda pre-partita');
    expect(eyebrowKicker('Cena di recupero, veloce e digeribile', 'Cous cous con pollo e spinaci')).toBe('Cena di recupero');
    expect(eyebrowKicker('Mattino', 'Controllo del mattino')).toBeNull();
    expect(eyebrowKicker('Primi giorni', 'Spesa di avvio')).toBe('Primi giorni');
  });

  it('le pillole del pasto sono valori, la categoria va nell’occhiello', () => {
    const state = recalculated();
    const meal = buildDay(MON, state).find((i) => i.kind === 'pasto' && i.slot === 'pranzo' && i.ref)!;
    const c = nowContent(meal, ctxFor(MON, state));
    expect(c.kicker).toBe(meal.title);
    expect(c.meta.some((m) => m.includes(meal.title))).toBe(false);
  });
});

describe('card Adesso: seduta', () => {
  it('la durata della seduta e il blocco del fisioterapista si leggono senza spiegazioni', () => {
    const state = recalculated();
    const gym = buildDay('2026-11-03', state).find((i) => i.kind === 'palestra')!;
    const c = nowContent(gym, { ...ctxFor('2026-11-03', state), gym: { own: 45, physio: 24 } });
    expect(c.meta.map((m) => m.replace(/\u00a0/g, ' '))).toEqual(['45 min', '+ 24 min dal fisioterapista']);
    expect(nowContent(gym, { ...ctxFor('2026-11-03', state), gym: { own: 50, physio: 0 } }).meta.map((m) => m.replace(/\u00a0/g, ' '))).toContain('50 min');
  });
});

describe('pasti da portare al lavoro', () => {
  const ctx = { mealValues: {}, curfewIn: 600, bed: '23:15', timeShown: false };

  it('la card Adesso lo dice per primo; gli integratori del pasto vanno con lui', () => {
    const meal: DayItem = { id: 'pasto:pranzo', time: '14:15', kind: 'pasto', title: 'Pranzo', slot: 'pranzo', carry: true };
    expect(nowContent(meal, ctx).meta[0]).toBe(CARRY_META);
    expect(nowContent({ ...meal, carry: undefined }, ctx).meta).not.toContain(CARRY_META);
    const supp: DayItem = { id: 'integratori:pranzo', time: '14:15', kind: 'integratori', title: 'Integratori a pranzo', detail: 'Magnesio', carry: true };
    expect(nowContent(supp, ctx).meta).toEqual(['Da portare con il pasto']);
    expect(nowContent({ ...supp, carry: undefined }, ctx).meta).toEqual(['Con il pasto']);
  });
});

describe('card Adesso: seduta del giorno adattata (fase 2, § 11.2)', () => {
  const gym: DayItem = { id: 'palestra:B', time: '18:00', kind: 'palestra', title: 'Seduta B', detail: 'Ridotta · 40 min', ref: 'B' };
  const session = { id: 'B', name: 'Seduta B', subtitle: 'Forza gambe, Nordic e polpacci', estMin: 40, focus: '', blocks: [] };
  const ctx = { mealValues: {}, curfewIn: 600, bed: '23:15' as const, timeShown: false, gym: { own: 40, physio: 0 }, session };

  it('la variante non piena sta tra i dettagli, la piena no', () => {
    expect(nowContent(gym, { ...ctx, variant: 'ridotta' }).meta).toContain('Ridotta');
    expect(nowContent(gym, { ...ctx, variant: 'piena' }).meta).not.toContain('Piena');
    expect(nowContent(gym, { ...ctx, variant: 'ridotta' }).headline).toBe(session.subtitle);
  });

  it('con la minima il titolo dice cosa resta', () => {
    const c = nowContent(gym, { ...ctx, variant: 'minima' });
    expect(c.headline).toBe(MINIMAL_GYM_HEADLINE);
    expect(c.meta).toContain('Minima');
  });

  it('senza la seduta del giorno non si indovina dallo slot: resta il titolo della voce', () => {
    expect(nowContent(gym, { mealValues: {}, curfewIn: 600, bed: '23:15', timeShown: false }).headline).toBe('Seduta B');
  });
});
