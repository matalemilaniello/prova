/**
 * Menù: rotazione delle settimane di MENU_ROTATION a partire dall'inizio del piano,
 * più le sostituzioni scelte dall'utente nel diario del giorno.
 */
import type { AppData, DayType, ISODate, MealSlot, MenuDay, MenuWeek, Recipe } from '../domain/types';
import { MENU_ROTATION } from '../data/menu';
import { RECIPES } from '../data/recipes';
import { addDays, daysBetween, isISODate, weekdayOf, weekIndexSince } from './dates';

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
  /**
   * Tipo di giorno per le porzioni e gli obiettivi (vedi `effectiveDayType`): uguale a quello del piano,
   * tranne la vigilia della partita, che mangia come un giorno di calcio.
   */
  dayType: DayType;
  /** Tipo di giorno previsto dalla settimana (per etichette e colori). */
  scheduledDayType: DayType;
  /** True se domani c'è la partita (le porzioni sono quelle di un giorno di calcio). */
  matchEve: boolean;
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

/** True se il giorno dopo `iso` il piano prevede una partita. */
export function isMatchEve(iso: ISODate, plan: AppData['plan']): boolean {
  if (!isISODate(iso)) return false;
  const next = addDays(iso, 1);
  const wd = weekdayOf(next);
  const day = plan.week.find((d) => d.weekday === wd) ?? plan.week[wd];
  return day?.football?.kind === 'partita';
}

/**
 * Tipo di giorno che decide porzioni e obiettivi. La vigilia della partita mangia come un giorno di calcio
 * (carboidrati × 1,25, obiettivo del giorno di calcio): il giorno prima della gara servono glicogeno pieno e
 * più carboidrati, non meno (UEFA expert group statement on nutrition in elite football, 2021: 6-8 g/kg
 * per i professionisti; per un amatore il carico del giorno di calcio, circa 5,5 g/kg, è il compromesso).
 * Negli altri giorni coincide con `dayTypeFor`.
 */
export function effectiveDayType(iso: ISODate, plan: AppData['plan']): DayType {
  const planned = dayTypeFor(iso, plan);
  if (planned !== 'calcio' && isMatchEve(iso, plan)) return 'calcio';
  return planned;
}

/** Pasti effettivi della data: ricetta del menù o sostituzione del diario, con il tipo di giorno. */
export function mealsForDate(iso: ISODate, state: MenuState, rotation: MenuWeek[] = MENU_ROTATION): DayMeals {
  const scheduledDayType = dayTypeFor(iso, state.plan);
  const dayType = effectiveDayType(iso, state.plan);
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
  return {
    date: iso,
    dayType,
    scheduledDayType,
    matchEve: isMatchEve(iso, state.plan),
    rotationIndex: rotationIndexFor(iso, state.plan.startDate, rotation),
    meals,
    bySlot,
  };
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
