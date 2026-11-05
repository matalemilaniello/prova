/**
 * Testi e dati della Settimana per il menù generato (docs/FASE2.md § 4.10-4.11, § 6.4), puri e testati:
 * - `menuSourceInfo`: da dove viene il menù del giorno (avvio, base, approvato, ripetuto) e, per quello ripetuto, da
 *   quale settimana;
 * - `clearedReason`: perché una casella è vuota («Senza il tonno …») per la card «Scegli tu»;
 * - `prepStorage` e `freezerNote`: giorni dal frigo e dal freezer dei compiti generati per componente, e la riga delle
 *   porzioni che vanno in freezer.
 */
import type { ISODate, MealSlot, MenuWeek, Plan, PrepTask } from '../../domain/types';
import { RECIPES } from '../../data/recipes';
import { addDays, formatWeekRange, isISODate, weekDates, weekdayOf, weekStart } from '../../engine/dates';
import { excludedFoods, foodWithArticle } from '../../engine/exclusions';
import { MEAL_SLOTS, mealsForDate, REPEAT_LOOKBACK_WEEKS, type MenuSource } from '../../engine/menu';
import { prepPlan } from '../../engine/menuGen';
import { listIt, WEEKDAY_LONG } from '../../lib/format';
import { lowerFirst } from './helpers';

// ───────────────────────── Provenienza ─────────────────────────

export interface MenuSourceInfo {
  source: MenuSource;
  /** Testo breve della pillola: «Menù approvato». */
  label: string;
  /** Per il menù ripetuto: la riga che dice da dove viene. */
  note?: string;
}

/**
 * Lunedì della settimana approvata che si ripete in quello dato: la più recente delle 4 prima, la stessa regola di
 * `repeatedMenuWeek` (engine/menu.ts). Null senza menù approvati.
 */
export function repeatedFromMonday(monday: ISODate, plan: Pick<Plan, 'menus'>): ISODate | null {
  if (!plan.menus || !isISODate(monday)) return null;
  const ws = weekStart(monday);
  for (let k = 1; k <= REPEAT_LOOKBACK_WEEKS; k++) {
    const m = addDays(ws, -7 * k);
    if (plan.menus[m]?.days) return m;
  }
  return null;
}

const SOURCE_LABEL: Record<MenuSource, string> = {
  avvio: 'Menù di avvio',
  rotazione: 'Menù di base',
  approvato: 'Menù approvato',
  ripetuto: 'Menù ripetuto',
};

/** Provenienza del menù di una data, per la pillola accanto a «Pasti del giorno». */
export function menuSourceInfo(source: MenuSource, date: ISODate, plan: Pick<Plan, 'menus'>): MenuSourceInfo {
  const info: MenuSourceInfo = { source, label: SOURCE_LABEL[source] };
  if (source === 'ripetuto') {
    const from = repeatedFromMonday(weekStart(date), plan);
    if (from) info.note = `Per questa settimana non c’è un menù nuovo approvato: si ripete quello del ${formatWeekRange(from)}.`;
  }
  return info;
}

// ───────────────────────── Casella vuota ─────────────────────────

/**
 * Perché il pasto è vuoto: gli alimenti esclusi della ricetta tolta, con l'articolo («Senza il tonno e la feta il menù
 * non ha un piatto simile.»). Senza alimenti esclusi riconoscibili, una frase generica.
 */
export function clearedReason(removedId: string | undefined, plan: Pick<Plan, 'exclusions'>, date: ISODate): string {
  const r = removedId ? RECIPES[removedId] : undefined;
  const excluded = excludedFoods(plan, date);
  const foods = [...new Set((r?.ingredients ?? []).map((l) => l.foodId).filter((id) => excluded.has(id)))];
  if (!foods.length) return 'Il menù non ha un piatto simile per questo pasto.';
  return `Senza ${listIt(foods.slice(0, 2).map(foodWithArticle))} il menù non ha un piatto simile.`;
}

// ───────────────────────── Preparazione ─────────────────────────

/** Giorni di un compito generato: dal frigo e dal freezer (le porzioni oltre i giorni in frigo del componente). */
export interface PrepStorage {
  /** Nome di ciò che si prepara («Riso basmati»). */
  what: string;
  fridge: ISODate[];
  freezer: ISODate[];
}

/**
 * La settimana in vigore di quel lunedì con le sostituzioni delle esclusioni (lo strato 2, senza gli scambi del diario):
 * la stessa da cui `prepInForce` prende i compiti.
 */
function weekInForceOf(monday: ISODate, plan: Plan): MenuWeek {
  const days = weekDates(monday).map((d) => {
    const meals: Partial<Record<MealSlot, string>> = {};
    for (const m of mealsForDate(d, { plan, dayLogs: {} }).meals) if (MEAL_SLOTS.includes(m.slot)) meals[m.slot] = m.recipeId;
    return { meals };
  });
  return { days, prep: [] };
}

/**
 * Conservazione dei compiti generati per componente (§ 4.11), per id del compito: i giorni in cui si mangia dal frigo e
 * quelli dal freezer. Solo per i componenti cotti; i compiti scritti a mano del seme lo dicono già nella loro guida.
 */
export function prepStorage(monday: ISODate, plan: Plan, tasks: readonly PrepTask[]): Record<string, PrepStorage> {
  if (!isISODate(monday) || !tasks.length) return {};
  const ids = new Set(tasks.map((t) => t.id));
  const out: Record<string, PrepStorage> = {};
  const ws = weekStart(monday);
  for (const item of prepPlan(weekInForceOf(ws, plan))) {
    if (!ids.has(item.component.id) || !item.component.cooked) continue;
    const iso = (d: number) => addDays(ws, d - 1);
    out[item.component.id] = { what: item.component.what, fridge: item.fridge.map(iso), freezer: item.freezer.map(iso) };
  }
  return out;
}

/** «lunedì», «mercoledì e giovedì». */
export function dayNames(dates: readonly ISODate[]): string {
  return listIt(dates.map((d) => WEEKDAY_LONG[weekdayOf(d)]));
}

/**
 * Una riga per la preparazione: le porzioni che vanno in freezer, per componente, e la regola della sera prima. Null senza
 * porzioni in freezer. «In freezer: riso basmati per mercoledì e giovedì; ragù di lenticchie per giovedì. La sera prima
 * passale in frigo.»
 */
export function freezerNote(storage: Record<string, PrepStorage>): string | null {
  const parts = Object.values(storage)
    .filter((s) => s.freezer.length)
    .sort((a, b) => (a.freezer[0] < b.freezer[0] ? -1 : a.freezer[0] > b.freezer[0] ? 1 : a.what.localeCompare(b.what)))
    .map((s) => `${lowerFirst(s.what)} per ${dayNames(s.freezer)}`);
  return parts.length ? `In freezer: ${parts.join('; ')}. La sera prima passale in frigo.` : null;
}
