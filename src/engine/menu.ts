/**
 * Menù: rotazione delle settimane di MENU_ROTATION a partire dall'inizio del piano,
 * più le sostituzioni scelte dall'utente nel diario del giorno.
 *
 * Risolutori della fase 2 (docs/FASE2.md § 6.4, § 12.2), in due strati che si calcolano solo da quello sotto:
 * - `menuWeekInForce(iso, plan)`: la settimana in vigore, cioè il menù approvato di quel lunedì (`Plan.menus`), altrimenti
 *   l'ultima settimana approvata delle 4 prima ripetuta, se è di stagione (§ 4.10), altrimenti la rotazione;
 * - strato 1, `plannedMealsForDate(iso, plan)`: le ricette previste nella data, senza sostituzioni né scambi (nei giorni
 *   di avvio il menù di avvio, che vince su tutto);
 * - strato 2, `weekSubstitutions(monday, plan)`: le ricette che sostituiscono quelle con un alimento escluso o vietato
 *   (`substitutionsForWeek` in engine/similar.ts); una casella senza alternative valide resta vuota;
 * - `mealsForDate(iso, state)`: lo strato 2 con gli scambi dell'utente sopra, e `DayMeals.source` dice da dove viene.
 *   Uno scambio con un alimento escluso in quella data non vale (§ 4.9: l'escluso non ricompare dal giorno dopo) e il
 *   pasto torna allo strato 2; riattivato l'alimento, lo scambio torna.
 * `prepInForce(monday, plan)` dà i compiti della preparazione della domenica prima di quel lunedì.
 * Senza i campi nuovi (`Plan.menus`, esclusioni) tutto coincide con la rotazione di prima.
 */
import type { AppData, DayType, ISODate, MealSlot, MenuDay, MenuWeek, Plan, PrepTask, Recipe } from '../domain/types';
import { factsOf, seasonAllows } from '../data/foodFacts';
import { MENU_ROTATION, STARTER_WEEK } from '../data/menu';
import { RECIPES } from '../data/recipes';
import { addDays, daysBetween, isISODate, weekdayOf, weekIndexSince, weekStart } from './dates';
import { excludedFoods, recipeAllowed } from './exclusions';
import { substitutionsForWeek } from './similar';

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
  /**
   * Ricetta del menù tolta perché contiene un alimento escluso (strato 2, § 6.4): al suo posto `plannedId`. Assente
   * senza esclusioni.
   */
  excludedFrom?: string;
}

/** Da dove vengono i pasti della data: menù di avvio, rotazione, menù approvato o ultima settimana approvata ripetuta. */
export type MenuSource = 'avvio' | 'rotazione' | 'approvato' | 'ripetuto';

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
  /** Provenienza del menù del giorno (`'avvio'` nei giorni di avvio). */
  source: MenuSource;
  /** Pasti in ordine di giornata; mancano gli slot senza ricetta. */
  meals: MealEntry[];
  bySlot: Partial<Record<MealSlot, MealEntry>>;
  /**
   * Pasti rimasti vuoti perché la ricetta prevista contiene un alimento escluso e nessuna alternativa è valida (§ 6.4):
   * pasto → ricetta tolta. In un menù generato (approvato o ripetuto) una casella che il generatore ha lasciato vuota,
   * perché nessuna ricetta era adatta (§ 4.10), vale `EMPTY_MENU_CELL`. Oggi e Menù li mostrano con «Scegli tu». Assente
   * senza pasti vuoti.
   */
  cleared?: Partial<Record<MealSlot, string>>;
}

/**
 * Valore di `DayMeals.cleared` per una casella vuota di un menù generato: nessuna ricetta era adatta (§ 4.10, «una casella
 * senza candidati resta vuota e la scheda lo dice»). Non è l'id di una ricetta.
 */
export const EMPTY_MENU_CELL = 'casella-vuota';

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

/** True se nella data il piano prevede la partita (non calcetto né allenamento). */
export function isMatchDay(iso: ISODate, plan: AppData['plan']): boolean {
  if (!isISODate(iso)) return false;
  const wd = weekdayOf(iso);
  const day = plan.week.find((d) => d.weekday === wd) ?? plan.week[wd];
  return day?.football?.kind === 'partita';
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
 * (carboidrati × 1,25, obiettivo del giorno di calcio): il giorno prima della gara servono più carboidrati, non
 * meno. In più, il giorno della partita e la vigilia hanno un minimo di carboidrati di 6 g/kg (UEFA expert group
 * statement on nutrition in elite football, 2021: 6-8 g/kg), che `matchCarbs` in `engine/nutrition.ts` aggiunge
 * alle righe di carboidrati e all'obiettivo della data (`dayTargetFor`). Proteine e grassi sono uguali in tutti i
 * tipi di giorno: la vigilia aggiunge solo carboidrati. La revisione corregge le kcal dal peso.
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

// ───────────────────────── Menù in vigore e strati (fase 2) ─────────────────────────

type MenuPlan = Pick<Plan, 'startDate' | 'menus'>;

/** Settimane prima in cui si cerca l'ultima approvata da ripetere (§ 4.10). */
export const REPEAT_LOOKBACK_WEEKS = 4;

/** Mese (1-12) del mercoledì della settimana che parte da `monday`: quello della stagionalità (§ 4.10). */
export function menuMonthOf(monday: ISODate): number {
  return Number(addDays(weekStart(monday), 2).slice(5, 7));
}

/** Tutti i freschi `strict` del menù sono di stagione nel mese (H5): solo così una settimana approvata si ripete. */
export function menuWeekInSeason(week: MenuWeek, month: number): boolean {
  for (const day of week.days ?? []) {
    for (const id of Object.values(day?.meals ?? {})) {
      const r = id ? RECIPES[id] : undefined;
      if (r && !r.ingredients.every((l) => seasonAllows(factsOf(l.foodId), month))) return false;
    }
  }
  return true;
}

const repeatCache = new WeakMap<object, Map<ISODate, MenuWeek | null>>();

/**
 * Settimana approvata da ripetere nel lunedì `monday` senza un menù approvato (§ 4.10): l'ultima approvata delle 4
 * settimane prima, cercata solo tra i lunedì già iniziati (mai una con decorrenza futura), purché nessun suo fresco
 * `strict` sia fuori stagione nel mese nuovo. Null altrimenti: vale la rotazione.
 */
export function repeatedMenuWeek(monday: ISODate, plan: Pick<Plan, 'menus'>): MenuWeek | null {
  const menus = plan.menus;
  if (!menus || !isISODate(monday)) return null;
  const ws = weekStart(monday);
  let byWeek = repeatCache.get(menus);
  if (!byWeek) {
    byWeek = new Map();
    repeatCache.set(menus, byWeek);
  }
  const hit = byWeek.get(ws);
  if (hit !== undefined) return hit;
  let out: MenuWeek | null = null;
  for (let k = 1; k <= REPEAT_LOOKBACK_WEEKS; k++) {
    const week = menus[addDays(ws, -7 * k)];
    if (!week || !Array.isArray(week.days)) continue;
    out = menuWeekInSeason(week, menuMonthOf(ws)) ? week : null;
    break;
  }
  byWeek.set(ws, out);
  return out;
}

/** Settimana in vigore con la sua provenienza: il menù approvato del lunedì, l'ultima approvata ripetuta o la rotazione. */
function weekInForce(iso: ISODate, plan: MenuPlan, rotation: MenuWeek[]): { week: MenuWeek | undefined; source: MenuSource } {
  if (isISODate(iso)) {
    const monday = weekStart(iso);
    const approved = plan.menus?.[monday];
    if (approved && Array.isArray(approved.days)) return { week: approved, source: 'approvato' };
    const repeated = repeatedMenuWeek(monday, plan);
    if (repeated) return { week: repeated, source: 'ripetuto' };
  }
  return { week: menuWeekFor(iso, plan.startDate, rotation), source: 'rotazione' };
}

/**
 * Settimana di menù in vigore nella data: Plan.menus del suo lunedì; altrimenti l'ultima approvata delle 4 settimane prima,
 * se nessun fresco strict è fuori stagione nel mese (§ 4.10, `repeatedMenuWeek`); altrimenti la rotazione. Senza menù
 * approvati è la rotazione, come prima.
 */
export function menuWeekInForce(iso: ISODate, plan: Pick<Plan, 'startDate' | 'menus'>): MenuWeek | undefined {
  return weekInForce(iso, plan, MENU_ROTATION).week;
}

/** Strato 1 con una rotazione data (le funzioni pubbliche usano MENU_ROTATION; i test ne passano una scritta a mano). */
function plannedMeals(iso: ISODate, plan: AppData['plan'], rotation: MenuWeek[]): DayMeals {
  const scheduledDayType = dayTypeFor(iso, plan);
  const dayType = effectiveDayType(iso, plan);
  const { week, source } = weekInForce(iso, plan, rotation);
  const day = isISODate(iso) ? week?.days?.[weekdayOf(iso)] : undefined;
  const starter = isStarterDay(iso, plan);
  const meals: MealEntry[] = [];
  const bySlot: Partial<Record<MealSlot, MealEntry>> = {};
  for (const slot of MEAL_SLOTS) {
    const menuId = day?.meals?.[slot] ?? '';
    // Giorni di avvio: il menù di avvio (STARTER_WEEK, 17 prodotti, niente preparazione); se manca quel pasto,
    // l'alternativa veloce alla ricetta della settimana in vigore.
    const starterId = starter ? STARTER_WEEK.days[weekdayOf(iso)]?.meals?.[slot] : undefined;
    const plannedId = starter
      ? starterId && RECIPES[starterId]
        ? starterId
        : menuId
          ? starterRecipeFor(menuId, slot)
          : ''
      : menuId;
    if (!plannedId) continue;
    const entry: MealEntry = {
      slot,
      recipeId: plannedId,
      recipe: RECIPES[plannedId],
      plannedId,
      swapped: false,
      ...(plannedId !== menuId && RECIPES[menuId]?.batch ? { starterOf: menuId } : {}),
    };
    meals.push(entry);
    bySlot[slot] = entry;
  }
  return {
    date: iso,
    dayType,
    scheduledDayType,
    matchEve: isMatchEve(iso, plan),
    rotationIndex: rotationIndexFor(iso, plan.startDate, rotation),
    starter,
    source: starter ? 'avvio' : source,
    meals,
    bySlot,
  };
}

/** Strato 1 del § 6.4: le ricette previste nella data, senza sostituzioni né scambi. */
export function plannedMealsForDate(iso: ISODate, plan: Plan): DayMeals {
  return plannedMeals(iso, plan, MENU_ROTATION);
}

/**
 * Strato 2 del § 6.4: sostituzioni delle esclusioni di una settimana, memorizzate per (lunedì, piano). Le chiavi sono le
 * date della settimana, i valori le ricette che prendono il posto di quelle previste dallo strato 1: la prima delle
 * alternative con valori simili (`mealAlternatives`), calcolata con la scala dello strato 1, giorno per giorno dal lunedì
 * e pasto per pasto. `''` = casella vuota, senza alternative valide; un altro valore che non è una ricetta nota non
 * sostituisce niente. Senza esclusioni (e con un menù senza alimenti vietati) è vuoto.
 */
export function weekSubstitutions(monday: ISODate, plan: Plan): Partial<Record<ISODate, Partial<Record<MealSlot, string>>>> {
  return substitutionsForWeek(monday, plan);
}

/** Pasti effettivi della data: strato 2 (menù in vigore con le sostituzioni delle esclusioni) più gli scambi del diario. */
export function mealsForDate(iso: ISODate, state: MenuState, rotation: MenuWeek[] = MENU_ROTATION): DayMeals {
  const planned = plannedMeals(iso, state.plan, rotation);
  // Le sostituzioni si calcolano sul menù vero: una rotazione scritta a mano dai test non ne ha.
  const subs = rotation === MENU_ROTATION && isISODate(iso) ? weekSubstitutions(weekStart(iso), state.plan)[iso] : undefined;
  const swaps = state.dayLogs[iso]?.recipeSwaps ?? {};
  // Esclusi della data, calcolati solo se c'è uno scambio da controllare (il diario può averlo salvato prima dell'esclusione).
  let excluded: ReadonlySet<string> | undefined;
  const swapAllowed = (id: string): boolean => {
    const r = RECIPES[id];
    if (!r || !isISODate(iso)) return true;
    excluded ??= excludedFoods(state.plan, iso);
    return recipeAllowed(r, excluded);
  };
  const meals: MealEntry[] = [];
  const bySlot: Partial<Record<MealSlot, MealEntry>> = {};
  const cleared: Partial<Record<MealSlot, string>> = {};
  // Un menù generato può avere una casella vuota (nessuna ricetta adatta): la scheda lo dice, non sparisce.
  const generated = planned.source === 'approvato' || planned.source === 'ripetuto';
  for (const slot of MEAL_SLOTS) {
    const base = planned.bySlot[slot];
    if (!base && generated) cleared[slot] = EMPTY_MENU_CELL;
    const sub = subs?.[slot];
    // '' = nessuna alternativa valida: la casella resta vuota (resta lo scambio dell'utente, se c'è).
    const emptied = Boolean(base && sub === '');
    const substituted = Boolean(sub && RECIPES[sub] && base && sub !== base.plannedId);
    const plannedId = emptied ? '' : substituted ? (sub as string) : base?.plannedId ?? '';
    if (emptied && base) cleared[slot] = base.plannedId;
    const rawSwap = swaps[slot];
    const swapId = rawSwap && swapAllowed(rawSwap) ? rawSwap : undefined;
    const recipeId = swapId || plannedId;
    if (!recipeId) continue;
    const entry: MealEntry = {
      slot,
      recipeId,
      recipe: RECIPES[recipeId],
      plannedId,
      swapped: Boolean(swapId && swapId !== plannedId),
      ...(base?.starterOf ? { starterOf: base.starterOf } : {}),
      ...((substituted || emptied) && base ? { excludedFrom: base.plannedId } : {}),
    };
    meals.push(entry);
    bySlot[slot] = entry;
  }
  return { ...planned, meals, bySlot, ...(Object.keys(cleared).length ? { cleared } : {}) };
}

/**
 * Compiti della preparazione della domenica prima di `monday`, con le esclusioni applicate: un compito che serviva solo
 * a ricette tolte dalle sostituzioni sparisce, uno condiviso resta (§ 4.11). Senza sostituzioni sono i compiti della
 * settimana in vigore.
 */
export function prepInForce(monday: ISODate, plan: Plan): PrepTask[] {
  const tasks = menuWeekInForce(monday, plan)?.prep ?? [];
  if (!tasks.length || !isISODate(monday)) return tasks;
  const ws = weekStart(monday);
  const subs = weekSubstitutions(ws, plan);
  if (!Object.keys(subs).length) return tasks;
  const removed = new Set<string>();
  const kept = new Set<string>();
  for (let i = 0; i < 7; i++) {
    const day = mealsForDate(addDays(ws, i), { plan, dayLogs: {} });
    for (const m of day.meals) {
      if (m.excludedFrom) removed.add(m.excludedFrom);
      kept.add(m.plannedId);
    }
    for (const id of Object.values(day.cleared ?? {})) if (id) removed.add(id);
  }
  return tasks.filter((t) => {
    const ids = t.recipeIds ?? [];
    return !ids.length || !ids.every((id) => removed.has(id) && !kept.has(id));
  });
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
