/**
 * Alternative con valori simili e sostituzioni delle esclusioni (docs/FASE2.md § 6.1, § 6.4; § 13.5 test 21 e 23;
 * § 13.2 test 5 e 6). Dati inventati e generici.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MealSlot, Plan } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import { FOODS } from '../data/foods';
import { factsOf } from '../data/foodFacts';
import { RECIPES } from '../data/recipes';
import { addDays, weekStart } from './dates';
import { excludedFoods } from './exclusions';
import { isEveningFootball, scheduleDayOf } from './mealTimes';
import { effectiveDayType, isMatchEve, MEAL_SLOTS, mealsForDate, plannedMealsForDate, prepInForce, weekSubstitutions } from './menu';
import { recipeNutrition } from './nutrition';
import { mealFromRecipe, weekPreventionStats, RED_MEAT_MAX_G, RICE_MAX_MEALS } from './prevention';
import { alternativesFor, BAND, baseCarbScale, clearedMeals, exclusionImpact, mealAlternatives, recipeInSeason, WIDE_BAND, weekMealsFor } from './similar';

const MON = '2026-11-09';
const plan = (extra: Partial<Plan> = {}): Plan => ({ ...defaultPlan(MON), ...extra });
const exclude = (foodId: string, since = MON, p = plan()): Plan => ({ ...p, exclusions: [...(p.exclusions ?? []), { foodId, since, origin: 'non-mi-piace' }] });

describe('alternative con valori simili (§ 6.1, test 21)', () => {
  const p = plan();

  it('tutte nel pasto, nel contesto del giorno, nella banda, senza preparazione né esclusi né tetti superati', () => {
    for (let i = 0; i < 14; i++) {
      const date = addDays(MON, i);
      const day = mealsForDate(date, { plan: p, dayLogs: {} });
      const sd = scheduleDayOf(date, p);
      const evening = isEveningFootball(sd);
      const eve = isMatchEve(date, p);
      const dayType = effectiveDayType(date, p);
      const scale = baseCarbScale(date, p);
      for (const entry of day.meals) {
        const res = alternativesFor(entry, { date, plan: p });
        const ref = recipeNutrition(RECIPES[entry.plannedId], dayType, FOODS, scale);
        const band = res.widened ? WIDE_BAND : BAND;
        const excluded = excludedFoods(p, date);
        for (const r of res.recipes) {
          const where = `${date} ${entry.slot}: ${r.id}`;
          expect(r.slots, where).toContain(entry.slot);
          expect(r.batch, where).toBeFalsy();
          expect(r.id, where).not.toBe(entry.plannedId);
          expect(r.ingredients.some((l) => excluded.has(l.foodId)), where).toBe(false);
          expect(recipeInSeason(r, Number(date.slice(5, 7))), where).toBe(true);
          if (entry.slot === 'merenda' && evening) expect(r.tags, where).toContain('pre-calcio');
          if (entry.slot === 'merenda' && !evening && !eve) expect(r.tags, where).not.toContain('pre-calcio');
          if (entry.slot === 'cena') expect(r.tags.includes('recupero'), where).toBe(evening);
          const legumes = r.ingredients.filter((l) => factsOf(l.foodId)?.group === 'legumi');
          if (eve && entry.slot === 'cena') expect(legumes, where).toEqual([]);
          if (sd?.football && legumes.length) {
            expect(entry.slot, where).toBe('pranzo');
            expect(legumes.every((l) => l.foodId === 'lenticchie-rosse'), where).toBe(true);
          }
          const n = recipeNutrition(r, dayType, FOODS, scale);
          if (entry.slot === 'pranzo' && sd?.football) expect(n.fiberG, where).toBeLessThanOrEqual(20 + 1e-9);
          expect(Math.abs(n.kcal - ref.kcal), where).toBeLessThanOrEqual(ref.kcal * band.kcal + 1e-6);
          expect(n.proteinG, where).toBeGreaterThanOrEqual(ref.proteinG * (1 - band.protein) - 1e-6);
          expect(n.fiberG, where).toBeGreaterThanOrEqual(ref.fiberG * (1 - band.fiber) - 1e-6);
          // La settimana con l'alternativa al posto del pasto resta nei tetti di H3.
          const week = weekMealsFor(weekStart(date), { plan: p, dayLogs: {} });
          week[date] = { ...week[date], [entry.slot]: r.id };
          const meals = Object.entries(week).flatMap(([d, slots]) =>
            MEAL_SLOTS.filter((s) => slots?.[s]).map((s) => mealFromRecipe(RECIPES[slots![s]!], effectiveDayType(d, p), 1, d, s)),
          );
          const st = weekPreventionStats(meals);
          if (r.ingredients.some((l) => factsOf(l.foodId)?.group === 'carne-rossa')) {
            expect(st.redMeatMeals, where).toBeLessThanOrEqual(1);
            expect(st.redMeatG, where).toBeLessThanOrEqual(RED_MEAT_MAX_G + 1e-6);
          }
          if (r.ingredients.some((l) => factsOf(l.foodId)?.rice)) expect(st.riceMeals, where).toBeLessThanOrEqual(RICE_MAX_MEALS);
        }
      }
    }
  });

  it('sono deterministiche e in ordine (spesa, poi distanza dei valori)', () => {
    const date = '2026-11-10';
    const entry = mealsForDate(date, { plan: p, dayLogs: {} }).bySlot.cena!;
    const a = alternativesFor(entry, { date, plan: p });
    const b = alternativesFor(entry, { date, plan: p });
    expect(a).toEqual(b);
    expect(mealAlternatives(entry, { date, plan: p })).toEqual(a.recipes.slice(0, 3));
    expect(mealAlternatives(entry, { date, plan: p }, 1)).toEqual(a.recipes.slice(0, 1));
    // Gli alimenti già spuntati portano in cima le ricette che li usano.
    const last = a.recipes[a.recipes.length - 1];
    if (a.recipes.length > 1) {
      const checked = new Set(last.ingredients.filter((l) => !FOODS[l.foodId]?.pantry).map((l) => l.foodId));
      const c = alternativesFor(entry, { date, plan: p, checked });
      expect(c.recipes.indexOf(last)).toBeLessThanOrEqual(a.recipes.indexOf(last));
    }
  });

  it('niente seconda carne rossa nella settimana (H3)', () => {
    // La rotazione ha già una porzione di manzo: nessuna alternativa ne aggiunge un'altra.
    for (let i = 0; i < 7; i++) {
      const date = addDays(MON, i);
      for (const entry of mealsForDate(date, { plan: p, dayLogs: {} }).meals) {
        if (RECIPES[entry.plannedId]?.tags.includes('carne rossa')) continue;
        for (const r of alternativesFor(entry, { date, plan: p }).recipes) expect(r.tags, `${date} ${entry.slot}`).not.toContain('carne rossa');
      }
    }
  });

  it('con gli esclusi le alternative non li propongono mai', () => {
    const px = exclude('pollo');
    for (let i = 0; i < 7; i++) {
      const date = addDays(MON, i);
      for (const entry of mealsForDate(date, { plan: px, dayLogs: {} }).meals) {
        for (const r of alternativesFor(entry, { date, plan: px }).recipes) expect(r.ingredients.some((l) => l.foodId === 'pollo')).toBe(false);
      }
    }
  });
});

describe('sostituzioni nel menù in vigore (§ 6.4, test 23)', () => {
  it('senza esclusioni non sostituiscono niente', () => {
    for (let w = 0; w < 4; w++) expect(weekSubstitutions(addDays(MON, 7 * w), plan())).toEqual({});
  });

  it('una ricetta con l’alimento escluso diventa la prima alternativa, dal giorno di `since`', () => {
    const p = exclude('tonno', '2026-11-11');
    const subs = weekSubstitutions(MON, p);
    for (let i = 0; i < 7; i++) {
      const date = addDays(MON, i);
      const before = plannedMealsForDate(date, p);
      const after = mealsForDate(date, { plan: p, dayLogs: {} });
      for (const slot of MEAL_SLOTS) {
        const b = before.bySlot[slot];
        const a = after.bySlot[slot];
        const hasTuna = b?.recipe?.ingredients.some((l) => l.foodId === 'tonno');
        if (date < '2026-11-11' || !hasTuna) {
          expect(a?.plannedId, `${date} ${slot}`).toBe(b?.plannedId);
          expect(a?.excludedFrom, `${date} ${slot}`).toBeUndefined();
          continue;
        }
        const sub = subs[date]?.[slot];
        expect(sub, `${date} ${slot}`).toBeDefined();
        if (sub) {
          expect(a).toMatchObject({ plannedId: sub, recipeId: sub, excludedFrom: b!.plannedId, swapped: false });
          expect(RECIPES[sub].slots).toContain(slot);
          expect(RECIPES[sub].ingredients.some((l) => l.foodId === 'tonno')).toBe(false);
        }
      }
    }
  });

  it('gli scambi dell’utente restano sopra le sostituzioni', () => {
    const p = exclude('tonno');
    const date = '2026-11-13';
    const sub = mealsForDate(date, { plan: p, dayLogs: {} }).bySlot.cena!;
    expect(sub.excludedFrom).toBe('insalata-ceci-tonno');
    const logs = { [date]: { date, status: {}, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: { cena: 'frittata-zucchine' } } };
    const m = mealsForDate(date, { plan: p, dayLogs: logs }).bySlot.cena!;
    expect(m).toMatchObject({ recipeId: 'frittata-zucchine', plannedId: sub.plannedId, swapped: true, excludedFrom: 'insalata-ceci-tonno' });
  });

  it('sono memorizzate per piano e deterministiche', () => {
    const p = exclude('pane-integrale');
    const a = weekSubstitutions(MON, p);
    expect(weekSubstitutions(MON, p)).toBe(a);
    const copy = JSON.parse(JSON.stringify(p)) as Plan;
    expect(weekSubstitutions(MON, copy)).toEqual(a);
    expect(weekSubstitutions('2026-11-11', p)).toBe(a);
  });

  it('con un’esclusione che tocca più giorni rispettano i tetti di H3 della settimana', () => {
    for (const food of ['pane-integrale', 'pollo', 'pasta', 'yogurt-greco-2', 'banana', 'tonno', 'ceci']) {
      for (let w = 0; w < 2; w++) {
        const monday = addDays(MON, 7 * w);
        const p = exclude(food);
        const week = weekMealsFor(monday, { plan: p, dayLogs: {} });
        const meals = Object.entries(week).flatMap(([d, slots]) =>
          MEAL_SLOTS.filter((s) => slots?.[s]).map((s) => mealFromRecipe(RECIPES[slots![s]!], effectiveDayType(d, p), 1, d, s)),
        );
        const st = weekPreventionStats(meals);
        const where = `${food} settimana ${w + 1}`;
        expect(st.redMeatMeals, where).toBeLessThanOrEqual(1);
        expect(st.redMeatG, where).toBeLessThanOrEqual(RED_MEAT_MAX_G + 1e-6);
        expect(st.riceMeals, where).toBeLessThanOrEqual(RICE_MAX_MEALS);
        expect(st.maxLegumeServingsPerDay, where).toBeLessThanOrEqual(1);
        expect(st.freeSugarShare ?? 0, where).toBeLessThan(0.05);
        for (const slots of Object.values(week)) for (const id of Object.values(slots ?? {})) expect(RECIPES[id!].ingredients.some((l) => l.foodId === food), `${where}: ${id}`).toBe(false);
      }
    }
  });

  it('una casella senza alternative valide resta vuota, e lo si sa', () => {
    // Le merende pre-calcio della rotazione hanno tutte la banana.
    const p = exclude('banana');
    const date = '2026-11-11';
    const m = mealsForDate(date, { plan: p, dayLogs: {} });
    expect(m.bySlot.merenda).toBeUndefined();
    expect(m.cleared?.merenda).toBe('pre-frullato-banana');
    expect(weekSubstitutions(MON, p)[date]?.merenda).toBe('');
    expect(clearedMeals(p, MON, 7).map((c) => `${c.date} ${c.slot}`)).toContain(`${date} merenda`);
    // Senza esclusioni nessun pasto vuoto.
    expect(clearedMeals(plan(), MON, 14)).toEqual([]);
    expect(mealsForDate(date, { plan: plan(), dayLogs: {} }).cleared).toBeUndefined();
  });

  it('la preparazione perde i compiti che servivano solo alle ricette tolte', () => {
    const p = exclude('lenticchie-rosse');
    const tasks = prepInForce('2026-11-16', p);
    expect(tasks.some((t) => t.id === 's2-ragu')).toBe(false);
    expect(tasks.some((t) => t.id === 's2-pollo-riso')).toBe(true);
    expect(prepInForce('2026-11-16', plan()).some((t) => t.id === 's2-ragu')).toBe(true);
  });

  it('l’avviso dell’esclusione conta i pasti che cambiano', () => {
    const p = plan();
    expect(exclusionImpact(p, 'tonno', '2026-11-10', 7)).toBeGreaterThan(0);
    expect(exclusionImpact(p, 'semi-chia', '2026-11-10', 7)).toBe(0);
  });
});

describe('purezza (§ 13.2, test 6)', () => {
  it('similar, exclusions e prevention non leggono l’orologio e non usano Math.random', () => {
    for (const f of ['similar.ts', 'exclusions.ts', 'prevention.ts']) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/Date\.now|new Date\(\s*\)|Math\.random/);
    }
  });

  it('la stessa domanda dà la stessa risposta', () => {
    const p = exclude('pollo');
    const slots: MealSlot[] = ['pranzo', 'cena'];
    for (const slot of slots) {
      const entry = plannedMealsForDate('2026-11-12', p).bySlot[slot]!;
      expect(alternativesFor(entry, { date: '2026-11-12', plan: p })).toEqual(alternativesFor(entry, { date: '2026-11-12', plan: JSON.parse(JSON.stringify(p)) }));
    }
  });
});
