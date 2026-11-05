/**
 * Proposta del menù della settimana dopo (docs/FASE2.md § 4.10, § 5): una funzione pura che parte dal contesto dei
 * generatori (`BuildContext` di features/piano/actions.ts, con lo stato già proiettato) e restituisce una `PlanProposal`
 * aperta, oppure null quando non serve. L'interfaccia la registra con `registerProposalBuilder('menu', buildMenuProposal)`
 * senza scrivere logica: quando chiamarla (dal venerdì alle 12:00, `isMenuProposalTime`), la spesa prima e dopo
 * (`menuProposalShopping`) e i testi della scheda vengono da qui.
 *
 * Niente si applica da solo (P2): la toppa è `{ menus: { [lunedì]: settimana } }` e diventa il menù in vigore solo con
 * «Approva». Senza approvazione vale il ripiego di `menuWeekInForce` (l'ultima approvata ripetuta, o la rotazione), ed è
 * rispetto a quello che si contano le differenze.
 */
import type { AppData, DiffItem, HHMM, ISODate, PlanProposal } from '../../domain/types';
import { fmtNumber, listIt, plural } from '../../lib/format';
import { addDays, formatWeekRange, hhmmToMin, isISODate, weekdayOf, weekStart } from '../dates';
import { foodLabel } from '../exclusions';
import { inSeason, factsOf, NEW_SEASONAL_FOODS } from '../../data/foodFacts';
import { RECIPES } from '../../data/recipes';
import { isStarterDay, MEAL_SLOTS } from '../menu';
import { changedMeals, diffMenus, sortDiff } from '../plan/diff';
import { planBasis, proposalId } from '../plan/proposals';
import { shoppingExtra, shoppingList, type ShoppingExtra, type ShoppingList } from '../shopping';
import { menuGenInput, type MenuGenResult, type MenuGenState } from './context';
import { generateMenuWeek } from './generate';
import { menuWeekSummary } from './validate';

/** Il contesto che il builder legge: è un sottoinsieme di `BuildContext` (features/piano/actions.ts). */
export interface MenuBuildContext {
  state: MenuGenState & Pick<AppData, 'profile'> & Partial<Pick<AppData, 'physio'>>;
  today: ISODate;
  attempt: number;
  previous?: PlanProposal;
}

/** Dal venerdì alle 12:00 alla domenica si propone il menù del lunedì dopo (§ 4.10). */
export const MENU_PROPOSAL_FROM: { weekday: number; time: HHMM } = { weekday: 4, time: '12:00' };

/** È il momento di proporre il menù della settimana dopo: venerdì dalle 12:00, sabato, domenica. */
export function isMenuProposalTime(today: ISODate, time: HHMM): boolean {
  if (!isISODate(today)) return false;
  const wd = weekdayOf(today);
  if (wd > MENU_PROPOSAL_FROM.weekday) return true;
  return wd === MENU_PROPOSAL_FROM.weekday && hhmmToMin(time) >= hhmmToMin(MENU_PROPOSAL_FROM.time);
}

/** Lunedì della proposta: quello della proposta di partenza se è ancora davanti, altrimenti il lunedì dopo oggi. */
export function menuProposalMonday(today: ISODate, previous?: Pick<PlanProposal, 'kind' | 'effectiveFrom'>): ISODate {
  if (previous?.kind === 'menu' && isISODate(previous.effectiveFrom) && previous.effectiveFrom > today) return weekStart(previous.effectiveFrom);
  return addDays(weekStart(today), 7);
}

const nutritionStateOf = (s: MenuGenState) => ({
  plan: s.plan,
  dayLogs: s.dayLogs,
  ...(s.checkIns ? { checkIns: s.checkIns } : {}),
  ...(s.profile ? { profile: s.profile } : {}),
});

/** Spesa del lunedì con il menù in vigore e con quello proposto, e i prodotti da comprare in più (§ 5.3). */
export interface MenuProposalShopping {
  before: ShoppingList;
  after: ShoppingList;
  extra: ShoppingExtra[];
  /** Per quel lunedì ci sono già spunte: la proposta dice «Dopo la spesa: servono 3 prodotti in più». */
  shopped: boolean;
}

/** La spesa della settimana della proposta, prima e dopo l'approvazione. Null se la toppa non ha il menù. */
export function menuProposalShopping(state: MenuGenState, proposal: Pick<PlanProposal, 'effectiveFrom' | 'patch'>): MenuProposalShopping | null {
  const monday = proposal.effectiveFrom;
  const week = proposal.patch.menus?.[monday];
  if (!week) return null;
  const base = nutritionStateOf(state);
  const before = shoppingList(monday, base);
  const after = shoppingList(monday, { ...base, plan: { ...state.plan, menus: { ...(state.plan.menus ?? {}), [monday]: week } } });
  return { before, after, extra: shoppingExtra(before, after), shopped: (state.shoppingChecked?.[monday]?.length ?? 0) > 0 };
}

/** Freschi di stagione che il menù nuovo porta e quello di prima no. */
function seasonalNews(result: MenuGenResult, month: number): string[] {
  const now = new Set<string>();
  const before = new Set<string>();
  for (const c of result.changed) {
    for (const [id, set] of [
      [c.to, now],
      [c.from, before],
    ] as const) {
      for (const l of RECIPES[id]?.ingredients ?? []) {
        const f = factsOf(l.foodId);
        if (f?.season && inSeason(f, month)) set.add(l.foodId);
      }
    }
  }
  return [...now].filter((id) => !before.has(id) && (NEW_SEASONAL_FOODS.has(id) || factsOf(id)?.group === 'frutta')).sort();
}

/** Motivi della proposta, dai numeri: al massimo tre frasi brevi. */
function reasonsOf(result: MenuGenResult, month: number, products: { before: number; after: number }): string[] {
  const out: string[] = [];
  const season = seasonalNews(result, month);
  if (season.length) out.push(`Di stagione: ${listIt(season.slice(0, 3).map(foodLabel))}.`);
  const s = menuWeekSummary(result.week);
  out.push(`Pesce in ${plural(s.fishMeals, 'pasto', 'pasti')}, legumi in ${plural(s.legumeMeals, 'pasto', 'pasti')}, riso in ${plural(s.riceMeals, 'pasto', 'pasti')}.`);
  const diff = products.after - products.before;
  out.push(
    diff === 0
      ? `La spesa resta di ${fmtNumber(products.after)} prodotti.`
      : diff > 0
        ? `Spesa: ${fmtNumber(products.after)} prodotti, ${diff === 1 ? 'uno' : fmtNumber(diff)} in più.`
        : `Spesa: ${fmtNumber(products.after)} prodotti, ${-diff === 1 ? 'uno' : fmtNumber(-diff)} in meno.`,
  );
  return out.slice(0, 3);
}

const CLASS_ORDER = ['escluso', 'vietato', 'pasto-vuoto'];

/**
 * Proposta del menù del lunedì dopo, dal contesto dei generatori. Null quando non serve: menù già approvato per quel
 * lunedì, settimana di avvio (il menù di avvio vince su tutto) o nessuna differenza dal menù che varrebbe comunque.
 */
export function buildMenuProposal(ctx: MenuBuildContext): PlanProposal | null {
  const s = ctx.state;
  const plan = s.plan;
  if (!isISODate(ctx.today)) return null;
  const monday = menuProposalMonday(ctx.today, ctx.previous);
  if (plan.menus?.[monday]) return null;
  for (let i = 0; i < 7; i++) if (isStarterDay(addDays(monday, i), plan)) return null;
  const attempt = Math.max(0, Math.trunc(ctx.attempt) || 0);
  const input = menuGenInput(monday, s, { attempt, today: ctx.today });
  const result = generateMenuWeek(input);
  const base = nutritionStateOf(s);
  const before = shoppingList(monday, base).items.length;
  const after = shoppingList(monday, { ...base, plan: { ...plan, menus: { ...(plan.menus ?? {}), [monday]: result.week } } }).items.length;
  const diff: DiffItem[] = sortDiff(diffMenus(input.fallback, result.week, { products: { before, after } }));
  const meals = changedMeals(diff);
  if (!diff.length) return null;
  const basis = planBasis('menu', { plan, profile: s.profile, physio: s.physio ?? { exercises: [], prescriptions: [] } });
  const warnings =
    result.status === 'fuori-limiti'
      ? [...result.violations]
          .sort((a, b) => (CLASS_ORDER.includes(b.code) ? 1 : 0) - (CLASS_ORDER.includes(a.code) ? 1 : 0))
          .slice(0, 3)
          .map((v) => v.message)
      : [];
  return {
    id: proposalId('menu', monday, basis, attempt),
    kind: 'menu',
    status: 'aperta',
    createdAt: ctx.today,
    effectiveFrom: monday,
    approvableUntil: addDays(monday, -1),
    basis,
    attempt,
    title: `Menù ${formatWeekRange(monday)}`,
    subtitle: `${meals === 0 ? 'Stessi pasti' : meals === 1 ? 'Cambia un pasto' : `Cambiano ${fmtNumber(meals)} pasti`} · ${plural(after, 'prodotto', 'prodotti')}`,
    patch: { menus: { [monday]: result.week } },
    diff,
    reasons: reasonsOf(result, input.month, { before, after }),
    ...(warnings.length ? { warnings } : {}),
    source: 'motore',
  };
}

/** Pasti della proposta per giorno e pasto, nell'ordine della giornata (per la striscia del menù della settimana dopo). */
export function proposalMeals(p: Pick<PlanProposal, 'effectiveFrom' | 'patch'>): { day: number; slot: (typeof MEAL_SLOTS)[number]; recipeId: string }[] {
  const week = p.patch.menus?.[p.effectiveFrom];
  const out: { day: number; slot: (typeof MEAL_SLOTS)[number]; recipeId: string }[] = [];
  week?.days.forEach((d, day) => {
    for (const slot of MEAL_SLOTS) if (d.meals[slot]) out.push({ day, slot, recipeId: d.meals[slot] as string });
  });
  return out;
}
