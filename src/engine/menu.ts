/**
 * Menù: rotazione delle settimane di MENU_ROTATION a partire dall'inizio del piano,
 * più le sostituzioni scelte dall'utente nel diario del giorno.
 */
import type { AppData, DayType, ISODate, MealSlot, MenuDay, MenuWeek, Recipe } from '../domain/types';
import { MENU_ROTATION } from '../data/menu';
import { RECIPES } from '../data/recipes';
import { daysBetween, weekdayOf, weekIndexSince } from './dates';

/** Ordine dei pasti nella giornata. */
export const MEAL_SLOTS: MealSlot[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];

/** Lo stato minimo che serve ai motori del menù. */
export type MenuState = Pick<AppData, 'plan' | 'dayLogs'>;

export interface MealEntry {
  slot: MealSlot;
  /** Ricetta effettiva (sostituzione compresa). */
  recipeId: string;
  /** Undefined se l'id non esiste in RECIPES. */
  recipe: Recipe | undefined;
  /** Ricetta prevista dal menù (stringa vuota se il menù non prevede quel pasto). */
  plannedId: string;
  /** True se l'utente ha scelto un'altra ricetta. */
  swapped: boolean;
}

export interface DayMeals {
  date: ISODate;
  dayType: DayType;
  /** Indice della settimana nella rotazione (0 se la rotazione è vuota). */
  rotationIndex: number;
  /** Pasti in ordine di giornata; mancano gli slot senza ricetta. */
  meals: MealEntry[];
  bySlot: Partial<Record<MealSlot, MealEntry>>;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Indice della settimana di rotazione per la data (0 se la rotazione è vuota). */
export function rotationIndexFor(iso: ISODate, planStart: ISODate, rotation: MenuWeek[] = MENU_ROTATION): number {
  if (!rotation.length) return 0;
  return mod(weekIndexSince(planStart, iso), rotation.length);
}

/** Settimana di menù in vigore nella data, o undefined se la rotazione è vuota. */
export function menuWeekFor(
  iso: ISODate,
  planStart: ISODate,
  rotation: MenuWeek[] = MENU_ROTATION,
): MenuWeek | undefined {
  if (!rotation.length) return undefined;
  return rotation[rotationIndexFor(iso, planStart, rotation)];
}

/** Giorno del menù previsto (senza sostituzioni). */
export function menuDayFor(iso: ISODate, planStart: ISODate, rotation: MenuWeek[] = MENU_ROTATION): MenuDay | undefined {
  const week = menuWeekFor(iso, planStart, rotation);
  return week?.days?.[weekdayOf(iso)];
}

/** Tipo di giorno previsto dal piano per la data. */
export function dayTypeFor(iso: ISODate, plan: AppData['plan']): DayType {
  const wd = weekdayOf(iso);
  return plan.week.find((d) => d.weekday === wd)?.dayType ?? plan.week[wd]?.dayType ?? 'riposo';
}

/** Pasti effettivi della data: ricetta del menù o sostituzione del diario, con il tipo di giorno. */
export function mealsForDate(iso: ISODate, state: MenuState, rotation: MenuWeek[] = MENU_ROTATION): DayMeals {
  const dayType = dayTypeFor(iso, state.plan);
  const day = menuDayFor(iso, state.plan.startDate, rotation);
  const swaps = state.dayLogs[iso]?.recipeSwaps ?? {};
  const meals: MealEntry[] = [];
  const bySlot: Partial<Record<MealSlot, MealEntry>> = {};
  for (const slot of MEAL_SLOTS) {
    const plannedId = day?.meals?.[slot] ?? '';
    const swapId = swaps[slot];
    const recipeId = swapId || plannedId;
    if (!recipeId) continue;
    const entry: MealEntry = {
      slot,
      recipeId,
      recipe: RECIPES[recipeId],
      plannedId,
      swapped: Boolean(swapId && swapId !== plannedId),
    };
    meals.push(entry);
    bySlot[slot] = entry;
  }
  return { date: iso, dayType, rotationIndex: rotationIndexFor(iso, state.plan.startDate, rotation), meals, bySlot };
}

/** Alternative valide per una ricetta (dalle sue `swaps` e dalle ricette dello stesso pasto). */
export function swapOptions(recipeId: string, slot?: MealSlot, limit = 6): Recipe[] {
  const base = RECIPES[recipeId];
  const out: Recipe[] = [];
  const seen = new Set<string>([recipeId]);
  for (const id of base?.swaps ?? []) {
    const r = RECIPES[id];
    if (r && !seen.has(id)) {
      out.push(r);
      seen.add(id);
    }
  }
  const s = slot ?? base?.slots[0];
  if (s) {
    for (const r of Object.values(RECIPES)) {
      if (out.length >= limit) break;
      if (!seen.has(r.id) && r.slots.includes(s)) {
        out.push(r);
        seen.add(r.id);
      }
    }
  }
  return out.slice(0, limit);
}

/** True se la data è dentro il piano (dal lunedì di inizio in poi). */
export function isInPlan(iso: ISODate, planStart: ISODate): boolean {
  return daysBetween(planStart, iso) >= 0;
}
