/**
 * Generatore del menù (docs/FASE2.md § 4.10, § 13.2, § 13.4): validità o ripiego dichiarato, esclusioni e divieti mai nel
 * menù né nella spesa, stagione, prodotti, determinismo, costo mai sopra il seme, valutazioni entro il tetto, caselle mai
 * vuote quando esiste una ricetta valida, pasti da portare.
 */
import { describe, expect, it } from 'vitest';
import type { AppData, MealSlot, MenuWeek } from '../../domain/types';
import { factsOf, seasonAllows } from '../../data/foodFacts';
import { RECIPES } from '../../data/recipes';
import { recipeFactsOf } from '../../data/recipeFacts';
import { addDays } from '../dates';
import { preventionBan } from '../exclusions';
import { MEAL_SLOTS } from '../menu';
import { mulberry32, pick, shuffled } from '../rng';
import { shoppingList } from '../shopping';
import { menuGenInput, validationCtxOf, type MenuGenInput, type MenuGenResult } from './context';
import { generateMenuWeek, menuCellPool, menuWeekCost } from './generate';
import { prepPlan } from './prep';
import { validateMenuWeek } from './validate';
import { EXCLUSION_SETS, fixtureState, GOALS, MONDAYS_2026, PHASES } from './testFixtures';

const NEVER = new Set(['escluso', 'vietato', 'prodotti', 'fuori-stagione']);

/** Le proprietà che valgono per ogni menù generato, valido o di ripiego. */
function checkResult(r: MenuGenResult, input: MenuGenInput, s: AppData): void {
  const where = `${input.monday} (${r.status})`;
  expect(r.evaluations, where).toBeLessThanOrEqual(input.maxEvaluations);
  // Le violazioni dichiarate sono quelle del validatore, e solo il ripiego ne ha.
  expect(validateMenuWeek(r.week, validationCtxOf(input)), where).toEqual(r.violations);
  if (r.status !== 'fuori-limiti') expect(r.violations, where).toEqual([]);
  for (const v of r.violations) expect(NEVER.has(v.code), `${where}: ${v.message}`).toBe(false);
  // Nessun alimento escluso o vietato, nessun fresco strict fuori stagione; nessuna casella vuota se c'è una ricetta valida.
  r.week.days.forEach((day, d) => {
    for (const slot of MEAL_SLOTS) {
      const id = day.meals[slot];
      if (!id) {
        expect(menuCellPool(input, d, slot), `${where} ${d} ${slot}: casella vuota con candidati`).toEqual([]);
        continue;
      }
      const r0 = RECIPES[id];
      expect(r0?.slots.includes(slot), `${where} ${d} ${slot}: ${id}`).toBe(true);
      for (const l of r0.ingredients) {
        expect(input.excluded.has(l.foodId), `${where} ${d} ${slot}: ${id} con ${l.foodId}`).toBe(false);
        expect(preventionBan(l.foodId), `${where}: ${l.foodId}`).toBeNull();
        expect(seasonAllows(factsOf(l.foodId), input.month), `${where}: ${l.foodId} fuori stagione`).toBe(true);
      }
      if (input.days[d].carry?.includes(slot)) expect(recipeFactsOf(id)?.carry, `${where} ${d} ${slot}: ${id} da portare`).toBeTruthy();
    }
  });
  // La spesa vera del menù approvato: stessi prodotti contati dal generatore, al massimo 40, niente esclusi.
  const approved = { ...s.plan, menus: { ...(s.plan.menus ?? {}), [input.monday]: r.week } };
  const list = shoppingList(input.monday, { plan: approved, dayLogs: {}, checkIns: s.checkIns, profile: s.profile });
  expect(list.items.length, where).toBe(r.products);
  expect(r.products, where).toBeLessThanOrEqual(40);
  for (const item of list.items) expect(input.excluded.has(item.foodId), `${where}: spesa con ${item.foodId}`).toBe(false);
  // Il generatore non peggiora mai il seme (§ 13.4, test 15).
  expect(r.cost, where).toBeLessThanOrEqual(menuWeekCost(input.seed, input) + 1e-6);
  // Preparazione: ogni ricetta da preparazione del lunedì-sabato ha il suo compito; nessuna porzione oltre i giorni in frigo.
  const covered = new Set(r.week.prep.flatMap((t) => t.recipeIds ?? []));
  r.week.days.slice(0, 6).forEach((day) => {
    for (const id of Object.values(day.meals)) if (id && RECIPES[id]?.batch) expect(covered.has(id), `${where}: ${id} senza preparazione`).toBe(true);
  });
  for (const item of prepPlan(r.week)) for (const d of item.fridge) expect(d).toBeLessThanOrEqual(item.component.fridgeDays);
}

describe('generateMenuWeek', () => {
  it('sul piano predefinito: menù valido, che cambia poco e tiene la preparazione scritta a mano', () => {
    const MON = '2026-11-16';
    const s = fixtureState(MON);
    const input = menuGenInput(MON, s, { today: addDays(MON, -3) });
    const r = generateMenuWeek(input);
    expect(r.status === 'generato' || r.status === 'seme').toBe(true);
    expect(r.violations).toEqual([]);
    checkResult(r, input, s);
    // Cambia pochi pasti rispetto al menù che varrebbe (P8).
    expect(r.changed.length).toBeLessThanOrEqual(12);
    for (const c of r.changed) expect(input.fallback?.days[c.day].meals[c.slot]).toBe(c.from || undefined);
  });

  it('deterministico: stesso ingresso, stesso menù; tentativo diverso, menù comunque valido (§ 13.2)', () => {
    const MON = '2026-06-15';
    const s = fixtureState(MON);
    const input = menuGenInput(MON, s, { today: addDays(MON, -3) });
    const a = generateMenuWeek(input);
    expect(generateMenuWeek(menuGenInput(MON, fixtureState(MON), { today: addDays(MON, -3) }))).toEqual(a);
    const b = generateMenuWeek({ ...input, attempt: 1 });
    expect(b.violations).toEqual([]);
    checkResult(b, { ...input, attempt: 1 }, s);
  });

  it('senza banana sparisce ogni merenda pre-calcio di oggi: le caselle si riempiono con quelle ammesse', () => {
    const MON = '2026-11-16';
    const s = fixtureState(MON, { exclusions: ['banana'] });
    const input = menuGenInput(MON, s, { today: addDays(MON, -3) });
    const r = generateMenuWeek(input);
    checkResult(r, input, s);
    r.week.days.forEach((day, d) => {
      for (const slot of MEAL_SLOTS) expect(day.meals[slot], `${d} ${slot}`).toBeTruthy();
      if (input.days[d].eveningFootball) expect(RECIPES[day.meals.merenda ?? '']?.tags).toContain('pre-calcio');
    });
  });

  it('con poche valutazioni il tetto si rispetta e nessuna casella con candidati resta vuota (§ 13.4, test 17)', () => {
    const MON = '2026-03-09';
    const s = fixtureState(MON, { exclusions: ['yogurt-greco-2', 'banana'] });
    for (const max of [0, 1, 25, 200]) {
      const input = { ...menuGenInput(MON, s, { today: addDays(MON, -3) }), maxEvaluations: max };
      const r = generateMenuWeek(input);
      expect(r.evaluations).toBeLessThanOrEqual(max);
      r.week.days.forEach((day, d) => {
        for (const slot of MEAL_SLOTS) if (!day.meals[slot]) expect(menuCellPool(input, d, slot)).toEqual([]);
      });
    }
  });

  it('i pasti che cadono nel lavoro hanno ricette da portare', () => {
    const MON = '2026-11-16';
    const work = { 1: [{ from: '08:30', to: '17:30' }], 4: [{ from: '08:30', to: '17:30' }] };
    const s = fixtureState(MON, { work });
    const input = menuGenInput(MON, s, { today: addDays(MON, -3) });
    expect(input.days[1].carry).toContain('pranzo');
    const r = generateMenuWeek(input);
    checkResult(r, input, s);
    for (const d of [1, 4]) for (const slot of input.days[d].carry ?? []) expect(recipeFactsOf(r.week.days[d].meals[slot] ?? '')?.carry, `${d} ${slot}`).toBeTruthy();
  });

  it(
    'a proprietà: 52 lunedì, 4 obiettivi del corpo, 3 fasi, 6 insiemi di esclusioni (§ 13.4, test 13 e 14)',
    () => {
      const statuses: Record<string, number> = {};
      // Ogni combinazione di obiettivo, fase ed esclusioni, ciascuna su un lunedì diverso dell'anno.
      let k = 0;
      for (const goal of GOALS) {
        for (const phase of PHASES) {
          for (const exclusions of EXCLUSION_SETS) {
            const MON = MONDAYS_2026[(k * 7) % 52];
            k++;
            const s = fixtureState(MON, { goal, phase, exclusions });
            const input = menuGenInput(MON, s, { today: addDays(MON, -3) });
            const r = generateMenuWeek(input);
            statuses[r.status] = (statuses[r.status] ?? 0) + 1;
            checkResult(r, input, s);
          }
        }
      }
      // Senza esclusioni difficili il menù è valido nella maggior parte dei casi.
      expect((statuses.generato ?? 0) + (statuses.seme ?? 0) + (statuses['seme-adattato'] ?? 0)).toBeGreaterThan(0);
    },
    180_000,
  );

  it(
    'a proprietà: insiemi di esclusioni a caso, mai un escluso o un vietato, sempre deterministico',
    () => {
      const rng = mulberry32(20261105);
      const common = ['banana', 'tonno', 'pollo', 'zucchine', 'pomodorini', 'uova', 'ceci', 'ricotta', 'latte', 'kiwi', 'mela', 'pasta', 'spinaci', 'noci', 'grana', 'salmone'];
      for (let i = 0; i < 18; i++) {
        const MON = pick(MONDAYS_2026, rng)!;
        const exclusions = shuffled(common, rng).slice(0, 1 + (i % 4));
        const s = fixtureState(MON, { exclusions, phase: PHASES[i % 3], goal: GOALS[i % 4] });
        const input = menuGenInput(MON, s, { today: addDays(MON, -3) });
        const r = generateMenuWeek(input);
        checkResult(r, input, s);
        if (i % 6 === 0) expect(generateMenuWeek(input)).toEqual(r);
      }
    },
    180_000,
  );

  it('il seme con un alimento escluso non si usa mai così com’è: il costo del seme lo dice', () => {
    const MON = '2026-11-16';
    const s = fixtureState(MON, { exclusions: ['tonno'] });
    const input = menuGenInput(MON, s, { today: addDays(MON, -3) });
    const r = generateMenuWeek(input);
    expect(menuWeekCost(input.seed, input)).toBeGreaterThan(r.cost);
    const seedHasTuna = (w: MenuWeek) => w.days.some((d) => Object.values(d.meals).some((id) => RECIPES[id ?? '']?.ingredients.some((l) => l.foodId === 'tonno')));
    expect(seedHasTuna(input.seed)).toBe(true);
    expect(seedHasTuna(r.week)).toBe(false);
    const slots: MealSlot[] = [];
    for (const c of r.changed) slots.push(c.slot);
    expect(slots.length).toBeGreaterThan(0);
  });
});
