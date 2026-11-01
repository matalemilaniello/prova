/**
 * Menù: rotazione delle settimane di MENU_ROTATION a partire dall'inizio del piano,
 * più le sostituzioni scelte dall'utente nel diario del giorno.
 */
import type { AppData, DayType, ISODate, MealSlot, MenuDay, MenuWeek, Recipe } from '../domain/types';
import { MENU_ROTATION, STARTER_WEEK } from '../data/menu';
import { RECIPES } from '../data/recipes';
import { addDays, daysBetween, isISODate, weekdayOf, weekIndexSince, weekStart } from './dates';

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
  /**
   * Nei giorni di avvio (`isStarterDay`): la ricetta da preparazione della domenica (`batch`) che la rotazione
   * prevedeva per quel pasto, al cui posto c'è il pasto del menù di avvio o un'alternativa veloce (`plannedId`).
   * Assente negli altri casi, anche quando la ricetta della rotazione non era da preparazione.
   */
  starterOf?: string;
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
  /** Giorno di avvio: spesa e preparazione della domenica non ancora fatte, niente ricette da preparazione. */
  starter: boolean;
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

// ───────────────────────── Giorni di avvio ─────────────────────────

function firstUseDate(plan: AppData['plan']): ISODate | null {
  const f = (plan as { firstUse?: { date?: unknown } }).firstUse;
  return f && isISODate(f.date) ? f.date : null;
}

/**
 * Fine dei giorni di avvio (esclusa): il lunedì in cui il menù trova fatte la spesa e la preparazione della
 * domenica. Chi parte dal lunedì al sabato ha davanti una domenica per prepararsi: l'avvio dura fino al lunedì
 * dopo. Chi parte di domenica (di solito la sera) prepara la domenica seguente: l'avvio copre anche la prima
 * settimana. Null senza `Plan.firstUse` (dati di esempio, piani salvati prima del campo).
 */
export function starterEnd(plan: AppData['plan']): ISODate | null {
  const first = firstUseDate(plan);
  if (!first) return null;
  return addDays(weekStart(first), weekdayOf(first) === 6 ? 14 : 7);
}

/**
 * Giorno di avvio: dal primo avvio dell'app (`Plan.firstUse`) a `starterEnd`. I pasti vengono dal menù di
 * avvio (`STARTER_WEEK` in data/menu: ricette da 15 minuti, nessuna preparazione, una spesa di 17 prodotti),
 * e la spesa (che segue `mealsForDate`) compra quelli. Se il menù di avvio non prevede un pasto, le ricette
 * da preparazione della rotazione lasciano il posto a un'alternativa veloce (`starterRecipeFor`).
 */
export function isStarterDay(iso: ISODate, plan: AppData['plan']): boolean {
  const first = firstUseDate(plan);
  const end = starterEnd(plan);
  return Boolean(first && end && isISODate(iso) && iso >= first && iso < end);
}

/**
 * Alternativa veloce a una ricetta da preparazione per lo stesso pasto: la prima delle sue `swaps` che non
 * richiede la preparazione della domenica, altrimenti la ricetta senza preparazione più rapida di quel pasto.
 * Le ricette che non sono `batch` restano quelle.
 */
export function starterRecipeFor(recipeId: string, slot: MealSlot): string {
  const r = RECIPES[recipeId];
  if (!r?.batch) return recipeId;
  const ok = (x: Recipe | undefined): x is Recipe => Boolean(x && !x.batch && x.slots.includes(slot));
  const fromSwaps = (r.swaps ?? []).map((id) => RECIPES[id]).find(ok);
  if (fromSwaps) return fromSwaps.id;
  const quick = Object.values(RECIPES)
    .filter(ok)
    .sort((a, b) => a.prepMin - b.prepMin || a.id.localeCompare(b.id))[0];
  return quick?.id ?? recipeId;
}

/** Pasti effettivi della data: ricetta del menù o sostituzione del diario, con il tipo di giorno. */
export function mealsForDate(iso: ISODate, state: MenuState, rotation: MenuWeek[] = MENU_ROTATION): DayMeals {
  const scheduledDayType = dayTypeFor(iso, state.plan);
  const dayType = effectiveDayType(iso, state.plan);
  const day = menuDayFor(iso, state.plan.startDate, rotation);
  const swaps = state.dayLogs[iso]?.recipeSwaps ?? {};
  const starter = isStarterDay(iso, state.plan);
  const meals: MealEntry[] = [];
  const bySlot: Partial<Record<MealSlot, MealEntry>> = {};
  for (const slot of MEAL_SLOTS) {
    const menuId = day?.meals?.[slot] ?? '';
    // Giorni di avvio: il menù di avvio (STARTER_WEEK, 17 prodotti, niente preparazione); se manca quel pasto,
    // l'alternativa veloce alla ricetta della rotazione.
    const starterId = starter ? STARTER_WEEK.days[weekdayOf(iso)]?.meals?.[slot] : undefined;
    const plannedId = starter
      ? starterId && RECIPES[starterId]
        ? starterId
        : menuId
          ? starterRecipeFor(menuId, slot)
          : ''
      : menuId;
    const swapId = swaps[slot];
    const recipeId = swapId || plannedId;
    if (!recipeId) continue;
    const entry: MealEntry = {
      slot,
      recipeId,
      recipe: RECIPES[recipeId],
      plannedId,
      swapped: Boolean(swapId && swapId !== plannedId),
      ...(plannedId !== menuId && RECIPES[menuId]?.batch ? { starterOf: menuId } : {}),
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
    starter,
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
