/**
 * I miei piatti (docs/FASE2.md § 8): piatti nati da una stima confermata, da segnare offline con un tocco.
 *
 * Un piatto tiene gli alimenti della porzione normale; Metà, Normale e Abbondante scalano tutto in proporzione,
 * condimenti compresi (`scaleDish`). Gli usi non si salvano: si contano dal diario (`dishUsage`, P5). I valori li
 * ricalcola sempre il motore dagli alimenti (`estimatedItemsValues`).
 *
 * Funzioni pure: la data di creazione e gli id arrivano da chi chiama.
 */
import type { DayLog, EatenMeal, EstimatedItem, ISODate, MealSlot, MyDish, Nutrients, Portion, Recipe } from '../domain/types';
import { FOODS } from '../data/foods';
import { DISH_LABEL_MAX, ITEM_GRAMS_MAX, ITEM_GRAMS_MIN, MAX_MEAL_ITEMS, estimatedItemsValues, itemKcal, itemResolved, matchesPlanned, normalizeEstimatedItem, oneLine } from './estimate';
import { eatenMeal } from './nutrition';

/** Porzioni del foglio dei piatti, nell'ordine dei pulsanti. */
export const PORTIONS: readonly Portion[] = [0.5, 1, 1.5];
export const PORTION_LABEL: Record<Portion, string> = { 0.5: 'Metà', 1: 'Normale', 1.5: 'Abbondante' };
/** Oltre 8 piatti compare il campo di ricerca. */
export const DISH_SEARCH_FROM = 8;
/** Oltre 60 piatti il foglio suggerisce di togliere quelli mai usati. */
export const DISH_PRUNE_FROM = 60;
/** Un condimento sotto il 5% delle kcal non impedisce al piatto di entrare nel menù più avanti (§ 8.4). */
export const MENU_CONDIMENT_SHARE = 0.05;

const SLOTS = new Set<string>(['colazione', 'spuntino', 'pranzo', 'merenda', 'cena']);

/** Alimenti di un piatto alla porzione scelta: grammi in proporzione, tra 1 e 1.500 g. */
export function scaledItems(items: readonly EstimatedItem[], portion: Portion): EstimatedItem[] {
  return items.map((i) => ({ ...i, grams: Math.min(ITEM_GRAMS_MAX, Math.max(ITEM_GRAMS_MIN, Math.round(i.grams * portion * 10) / 10)) }));
}

/** Alimenti e valori di un piatto alla porzione scelta (lineare: tutto in proporzione, condimenti compresi). */
export function scaleDish(dish: Pick<MyDish, 'items'>, portion: Portion): { items: EstimatedItem[]; nutrients: Nutrients; vegPortions: number } {
  const items = scaledItems(dish.items, portion);
  return { items, ...estimatedItemsValues(items) };
}

/**
 * Un piatto salvato è il pasto previsto: almeno il 60% degli alimenti non di dispensa della ricetta prevista è nel
 * piatto (stesso `foodId`, § 7.5). Offline, senza coach.
 */
export function dishMatchesPlanned(dish: Pick<MyDish, 'items'>, planned: Recipe | undefined): boolean {
  return matchesPlanned(dish.items, planned);
}

/** Il pasto da segnare con un piatto salvato, pronto per `setEatenMeal`. */
export function dishMeal(dish: MyDish, portion: Portion, asPlanned: boolean): EatenMeal {
  const scaled = scaleDish(dish, portion);
  const meal: EatenMeal = {
    label: dish.name,
    nutrients: scaled.nutrients,
    vegPortions: scaled.vegPortions,
    source: 'piatto',
    items: scaled.items,
    dishId: dish.id,
    portion,
  };
  if (asPlanned) meal.asPlanned = true;
  return meal;
}

/**
 * Un piatto nuovo dagli alimenti confermati di una stima (la porzione mangiata diventa quella normale). Null senza
 * alimenti con i valori o senza nome. L'id e la data arrivano da chi chiama.
 */
export function newDish(input: { id: string; name: string; slot: MealSlot; items: readonly EstimatedItem[]; createdAt: string }): MyDish | null {
  const name = oneLine(input.name, DISH_LABEL_MAX);
  const items = input.items
    .map((i) => normalizeEstimatedItem(i))
    .filter((i): i is EstimatedItem => i !== null && itemResolved(i))
    .slice(0, MAX_MEAL_ITEMS);
  if (!input.id || !name || !items.length) return null;
  const values = estimatedItemsValues(items);
  return {
    id: input.id,
    name,
    slots: SLOTS.has(input.slot) ? [input.slot] : [],
    items,
    nutrients: values.nutrients,
    vegPortions: values.vegPortions,
    createdAt: input.createdAt,
    source: 'foto',
  };
}

export interface DishUse {
  count: number;
  /** Ultimo giorno in cui è stato segnato. */
  last: ISODate;
}

/**
 * Usi di ogni piatto contati dal diario: i pasti stimati con `source: 'piatto'` che valgono per la voce (`eatenMeal`) e
 * con un `dishId` di un piatto che esiste ancora. Niente si salva (P5).
 */
export function dishUsage(dayLogs: Readonly<Record<ISODate, DayLog>>, dishes: readonly Pick<MyDish, 'id'>[]): Record<string, DishUse> {
  const ids = new Set(dishes.map((d) => d.id));
  const out: Record<string, DishUse> = {};
  for (const [date, log] of Object.entries(dayLogs)) {
    const meals = log?.barMeals;
    if (!meals) continue;
    for (const slot of Object.keys(meals) as MealSlot[]) {
      const meal = eatenMeal(log, slot);
      if (!meal || meal.source !== 'piatto' || !meal.dishId || !ids.has(meal.dishId)) continue;
      const cur = out[meal.dishId];
      if (cur) {
        cur.count += 1;
        if (date > cur.last) cur.last = date;
      } else out[meal.dishId] = { count: 1, last: date };
    }
  }
  return out;
}

/**
 * Ordine dell'elenco dei piatti (§ 8.2): prima quelli nati nello stesso pasto, poi i più usati, poi i più recenti (ultimo
 * uso o, mai usati, la creazione), poi per nome. Deterministico.
 */
export function sortDishes(dishes: readonly MyDish[], usage: Readonly<Record<string, DishUse>>, slot?: MealSlot): MyDish[] {
  const recent = (d: MyDish) => usage[d.id]?.last ?? d.createdAt.slice(0, 10);
  return [...dishes].sort((a, b) => {
    if (slot) {
      const sa = a.slots.includes(slot) ? 0 : 1;
      const sb = b.slots.includes(slot) ? 0 : 1;
      if (sa !== sb) return sa - sb;
    }
    const ua = usage[a.id]?.count ?? 0;
    const ub = usage[b.id]?.count ?? 0;
    if (ua !== ub) return ub - ua;
    const ra = recent(a);
    const rb = recent(b);
    if (ra !== rb) return ra < rb ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.name.localeCompare(b.name, 'it') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

/** Ricerca per nome, senza accenti né maiuscole. */
export function searchDishes(dishes: readonly MyDish[], query: string): MyDish[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const q = fold(query);
  if (!q) return [...dishes];
  const words = q.split(/\s+/);
  return dishes.filter((d) => {
    const name = fold(d.name);
    return words.every((w) => name.includes(w));
  });
}

/** Piatti mai segnati: quelli da proporre per primi quando sono più di `DISH_PRUNE_FROM`. */
export function unusedDishes(dishes: readonly MyDish[], usage: Readonly<Record<string, DishUse>>): MyDish[] {
  return dishes.filter((d) => !usage[d.id]);
}

/**
 * Il piatto è pronto per il menù (§ 8.4): tutti gli alimenti collegati all'archivio (`FOODS`), tranne i condimenti che
 * pesano meno del 5% delle kcal.
 */
export function dishReadyForMenu(dish: Pick<MyDish, 'items'>): boolean {
  if (!dish.items.length) return false;
  const total = dish.items.reduce((s, i) => s + itemKcal(i), 0);
  return dish.items.every((i) => {
    if (i.foodId && FOODS[i.foodId]) return true;
    return i.role === 'condimento' && total > 0 && itemKcal(i) < MENU_CONDIMENT_SHARE * total;
  });
}

/**
 * Il piatto come ricetta in grammi (unità `g`), con gli alimenti dell'archivio (§ 8.4). Null se il piatto non è pronto
 * per il menù. Il collegamento al menù e alla spesa resta fuori da questa fase: la forma è già quella giusta.
 */
export function dishAsRecipe(dish: MyDish): Recipe | null {
  if (!dishReadyForMenu(dish)) return null;
  return {
    id: `piatto:${dish.id}`,
    name: dish.name,
    slots: [...dish.slots],
    ingredients: dish.items
      .filter((i) => i.foodId && FOODS[i.foodId])
      .map((i) => ({ foodId: i.foodId as string, qty: Math.round(i.grams), unit: 'g' as const })),
    steps: [],
    prepMin: 0,
    tags: ['piatto'],
  };
}
