/**
 * Preparazione della domenica di un menù generato (docs/FASE2.md § 4.11). `prepTasksFor(week)` costruisce i compiti dai
 * componenti (`PREP_COMPONENTS`, data/prepComponents.ts) delle ricette da preparazione del lunedì-sabato e degli spuntini
 * da portare con la frutta secca: un compito per componente, con l'id del componente (le spunte di `prepDone` sopravvivono
 * a una rigenerazione), i minuti del componente e una resa che dice quali giorni si mangiano dal frigo e quali dal
 * freezer: ogni porzione oltre i giorni in frigo del componente va in freezer.
 *
 * Il generatore tiene i compiti scritti a mano del seme quando le ricette da preparazione sono le stesse negli stessi
 * giorni (`sameBatchLayout`); altrimenti usa questi.
 */
import type { MenuWeek, PrepTask, Weekday } from '../../domain/types';
import { prepComponentOf, type PrepComponent } from '../../data/prepComponents';
import { listIt, WEEKDAY_LONG } from '../../lib/format';
import { MEAL_SLOTS } from '../menu';
import { batchLayout, componentsOf, gridOf, SLOT_COUNT } from './stats';
import { RECIPES } from '../../data/recipes';
import { recipeFactsOf } from '../../data/recipeFacts';

/** Un componente della settimana con i giorni in cui si mangia (1 = lunedì … 6 = sabato). */
export interface PrepPlanItem {
  component: PrepComponent;
  recipeIds: string[];
  /** Giorni con una porzione, dal lunedì (1) al sabato (6). */
  days: number[];
  /** Giorni serviti dal frigo: entro `fridgeDays`. */
  fridge: number[];
  /** Giorni serviti dal freezer: oltre `fridgeDays`. */
  freezer: number[];
}

const dayName = (d: number) => WEEKDAY_LONG[(d - 1) as Weekday];

/** Componenti della settimana con i giorni, nell'ordine della domenica (prima le cotture lunghe). */
export function prepPlan(week: MenuWeek): PrepPlanItem[] {
  const grid = gridOf(week);
  const ids = componentsOf(grid);
  const items: PrepPlanItem[] = [];
  for (const id of ids) {
    const component = prepComponentOf(id);
    if (!component) continue;
    const recipes = new Set<string>();
    const days = new Set<number>();
    for (let d = 0; d < 6; d++) {
      for (let s = 0; s < SLOT_COUNT; s++) {
        const rid = grid[d * SLOT_COUNT + s];
        const r = rid ? RECIPES[rid] : undefined;
        if (!r) continue;
        const rf = recipeFactsOf(rid);
        const uses = r.batch ? (rf?.prep ?? []).includes(id) : Boolean(rf?.carry && component.portionsOf?.some((f) => r.ingredients.some((l) => l.foodId === f)));
        if (!uses) continue;
        recipes.add(rid);
        days.add(d + 1);
      }
    }
    const sorted = [...days].sort((a, b) => a - b);
    items.push({
      component,
      recipeIds: [...recipes].sort(),
      days: sorted,
      fridge: sorted.filter((d) => d <= component.fridgeDays),
      freezer: sorted.filter((d) => d > component.fridgeDays),
    });
  }
  return items.sort((a, b) => a.component.order - b.component.order);
}

/** Resa del compito: «Riso basmati per lunedì in frigo; mercoledì e giovedì dal freezer». */
export function prepYield(item: PrepPlanItem): string {
  const c = item.component;
  const names = (days: number[]) => listIt(days.map(dayName));
  if (!c.cooked) return `${c.what} per ${names(item.days)}`;
  if (item.fridge.length && item.freezer.length) return `${c.what} per ${names(item.fridge)} in frigo; ${names(item.freezer)} dal freezer`;
  if (item.freezer.length) return `${c.what} per ${names(item.freezer)}, dal freezer: la sera prima passa in frigo`;
  return `${c.what} per ${names(item.fridge)}, in frigo`;
}

/** Compiti della domenica di un menù, dai componenti delle sue ricette (lunedì-sabato). */
export function prepTasksFor(week: MenuWeek): PrepTask[] {
  return prepPlan(week).map((item) => ({
    id: item.component.id,
    title: item.component.title,
    minutes: item.component.minutes,
    yields: prepYield(item),
    recipeIds: item.recipeIds,
  }));
}

/** Le ricette da preparazione sono le stesse negli stessi giorni (si tengono i compiti scritti a mano del seme). */
export function sameBatchLayout(a: MenuWeek, b: MenuWeek): boolean {
  const x = batchLayout(gridOf(a));
  const y = batchLayout(gridOf(b));
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Pasti della settimana in ordine, per i test e le schermate: [giorno, pasto, ricetta]. */
export function weekMeals(week: MenuWeek): [number, (typeof MEAL_SLOTS)[number], string][] {
  const grid = gridOf(week);
  const out: [number, (typeof MEAL_SLOTS)[number], string][] = [];
  for (let d = 0; d < 7; d++) for (let s = 0; s < SLOT_COUNT; s++) if (grid[d * SLOT_COUNT + s]) out.push([d, MEAL_SLOTS[s], grid[d * SLOT_COUNT + s]]);
  return out;
}
