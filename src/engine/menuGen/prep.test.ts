/**
 * Preparazione della domenica (docs/FASE2.md § 4.11, § 13.4 test 16): compiti dai componenti, id stabili, giorni in frigo
 * rispettati, e i compiti scritti a mano del seme collegati ai loro componenti.
 */
import { describe, expect, it } from 'vitest';
import type { MenuWeek, PrepTask } from '../../domain/types';
import { MENU_ROTATION, PREP_GUIDE } from '../../data/menu';
import { PREP_COMPONENTS, prepComponentOf } from '../../data/prepComponents';
import { RECIPES } from '../../data/recipes';
import { RECIPE_FACTS, type PrepComponentId } from '../../data/recipeFacts';
import { prepPlan, prepTasksFor, prepYield, sameBatchLayout } from './prep';

const clone = (w: MenuWeek): MenuWeek => JSON.parse(JSON.stringify(w)) as MenuWeek;
const minutes = (tasks: readonly PrepTask[]) => tasks.reduce((s, t) => s + t.minutes, 0);

/** Ricette da preparazione del lunedì-sabato di un menù. */
function batchRecipes(w: MenuWeek): Set<string> {
  const out = new Set<string>();
  w.days.slice(0, 6).forEach((d) => {
    for (const id of Object.values(d.meals)) if (id && RECIPES[id]?.batch) out.add(id);
  });
  return out;
}

describe('prepTasksFor', () => {
  it('per la rotazione: 4-6 compiti, 60-90 minuti, ogni ricetta da preparazione coperta, id dei componenti', () => {
    for (const week of MENU_ROTATION) {
      const tasks = prepTasksFor(week);
      expect(tasks.length).toBeGreaterThanOrEqual(4);
      expect(tasks.length).toBeLessThanOrEqual(6);
      expect(minutes(tasks)).toBeGreaterThanOrEqual(60);
      expect(minutes(tasks)).toBeLessThanOrEqual(90);
      const covered = new Set(tasks.flatMap((t) => t.recipeIds ?? []));
      for (const id of batchRecipes(week)) expect(covered.has(id), id).toBe(true);
      for (const t of tasks) {
        expect(t.id in PREP_COMPONENTS, t.id).toBe(true);
        expect(PREP_GUIDE[t.id], t.id).toBeDefined();
        expect(t.title).toBe(PREP_COMPONENTS[t.id as PrepComponentId].title);
      }
    }
  });

  it('id stabili: due rigenerazioni dello stesso menù danno gli stessi compiti', () => {
    for (const week of MENU_ROTATION) expect(prepTasksFor(clone(week))).toEqual(prepTasksFor(week));
  });

  it('nessuna porzione si mangia dal frigo oltre i giorni del suo componente: il resto va in freezer e la resa lo dice', () => {
    const week = clone(MENU_ROTATION[0]);
    // Il riso saltato del giovedì: il riso cotto regge un giorno, quindi giovedì viene dal freezer.
    const plan = prepPlan(week);
    const rice = plan.find((p) => p.component.id === 'riso-cotto');
    expect(rice?.fridge).toEqual([1]);
    expect(rice?.freezer).toEqual([4]);
    expect(prepYield(rice!)).toBe('Riso basmati per lunedì in frigo; giovedì dal freezer');
    for (const w of MENU_ROTATION) {
      for (const item of prepPlan(w)) {
        for (const d of item.fridge) expect(d, item.component.id).toBeLessThanOrEqual(item.component.fridgeDays);
        for (const d of item.freezer) expect(d, item.component.id).toBeGreaterThan(item.component.fridgeDays);
        expect([...item.fridge, ...item.freezer].sort()).toEqual(item.days);
        if (item.freezer.length && item.component.cooked) expect(prepYield(item)).toMatch(/dal freezer/);
      }
    }
  });

  it('prima le cotture lunghe, poi quello che si monta con le cose pronte', () => {
    const orders = prepPlan(MENU_ROTATION[0]).map((p) => p.component.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('un menù senza ricette da preparazione non ha compiti di cottura', () => {
    const week = clone(MENU_ROTATION[0]);
    for (const d of week.days) for (const [slot, id] of Object.entries(d.meals)) if (id && RECIPES[id]?.batch) delete d.meals[slot as keyof typeof d.meals];
    expect(prepTasksFor(week).every((t) => !PREP_COMPONENTS[t.id as PrepComponentId].cooked)).toBe(true);
  });

  it('stesse ricette da preparazione negli stessi giorni: si tengono i compiti scritti a mano del seme', () => {
    const a = MENU_ROTATION[0];
    const b = clone(a);
    b.days[0].meals.colazione = 'porridge-pera-cannella';
    expect(sameBatchLayout(a, b)).toBe(true);
    b.days[1].meals.pranzo = 'farro-salmone-zucchine';
    expect(sameBatchLayout(a, b)).toBe(false);
  });
});

describe('componenti e compiti scritti a mano', () => {
  /** Ogni compito scritto a mano del seme con i componenti che prepara (§ 13.4, test 16). */
  const SEED_COMPONENTS: Record<string, PrepComponentId[]> = {
    's1-riso': ['riso-cotto'],
    's1-pollo': ['pollo-cotto'],
    's1-ragu': ['ragu-lenticchie'],
    's1-box': ['vaschetta-recupero'],
    's1-sacchetti': ['sacchetti-frutta-secca'],
    's2-frittatine': ['frittatine'],
    's2-pollo-riso': ['pollo-cotto', 'riso-cotto'],
    's2-ragu': ['ragu-lenticchie'],
    's2-box': ['vaschetta-recupero'],
    's2-sacchetti': ['sacchetti-frutta-secca'],
  };
  /** Giorni (1 = lunedì) che la resa del compito serve dal frigo; gli altri dal freezer. */
  const FROM_FRIDGE: Record<string, number[]> = {
    's1-riso': [1],
    's1-pollo': [1],
    's1-ragu': [],
    's1-box': [1],
    's1-sacchetti': [1, 2, 3, 4, 5, 6],
    's2-frittatine': [1, 2],
    's2-pollo-riso': [1],
    's2-ragu': [],
    's2-box': [1],
    's2-sacchetti': [1, 2, 3, 4, 5, 6],
  };

  it('nessun compito del seme serve dal frigo un componente oltre i suoi giorni in frigo', () => {
    for (const week of MENU_ROTATION) {
      for (const task of week.prep) {
        const comps = SEED_COMPONENTS[task.id];
        expect(comps, task.id).toBeDefined();
        const fridgeDays = Math.min(...comps.map((c) => PREP_COMPONENTS[c].fridgeDays));
        for (const d of FROM_FRIDGE[task.id]) expect(d, task.id).toBeLessThanOrEqual(fridgeDays);
        // I componenti del compito sono quelli delle sue ricette da preparazione.
        for (const id of task.recipeIds ?? []) {
          const prep = RECIPE_FACTS[id]?.prep ?? [];
          if (RECIPES[id]?.batch) expect(prep.some((c) => comps.includes(c)), `${task.id}: ${id}`).toBe(true);
        }
      }
    }
  });

  it('ogni componente delle ricette esiste, con i giorni in frigo del § 4.11', () => {
    for (const [id, f] of Object.entries(RECIPE_FACTS)) for (const c of f.prep ?? []) expect(prepComponentOf(c), `${id}: ${c}`).toBeDefined();
    expect(PREP_COMPONENTS['riso-cotto'].fridgeDays).toBe(1);
    expect(PREP_COMPONENTS['farro-cotto'].fridgeDays).toBe(1);
    expect(PREP_COMPONENTS['orzo-cotto'].fridgeDays).toBe(1);
    expect(PREP_COMPONENTS['salmone-forno'].fridgeDays).toBe(2);
    for (const c of ['pollo-cotto', 'ragu-lenticchie', 'frittatine', 'vellutata-zucca', 'zuppa-cavolo-nero', 'patate-lesse'] as const) expect(PREP_COMPONENTS[c].fridgeDays, c).toBe(3);
    expect(PREP_COMPONENTS.barrette.fridgeDays).toBe(7);
    expect(prepComponentOf('constructor')).toBeUndefined();
  });
});
