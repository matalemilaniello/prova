/**
 * Proposta del menù della settimana dopo in Settimana (docs/FASE2.md § 4.10, § 5.2-5.3, § 11.5). Il motore sta in
 * engine/menuGen; qui c'è la regia dell'interfaccia.
 *
 * - **Registrazione.** Al primo import il generatore del menù si registra con `registerProposalBuilder('menu', …)`
 *   (`setupMenuProposals`): il foglio della proposta lo usa per ricalcolare una proposta superata e per «Un’altra
 *   proposta», anche quando lo apre lo storico. Una proposta nata dallo storico («Usalo la prossima settimana») non si
 *   ricalcola con il generatore, che darebbe un altro menù sotto lo stesso titolo: superata, resta superata.
 * - **Quando nasce** (`proposeMenuIfDue`): una volta per settimana, per il lunedì dopo, dal venerdì alle 12:00
 *   (`isMenuProposalTime`), quando si apre Settimana o l'app torna in primo piano, sempre dopo il primo disegno (un
 *   `setTimeout`) e in modo sincrono. Si rigenera solo se cambia la base del menù (la proposta aperta superata si
 *   ricalcola con `refreshProposal`) o con «Un’altra proposta» dal foglio; una proposta già decisa per quel lunedì
 *   («Approva» o «Tieni il piano attuale») chiude la settimana. Niente si applica da solo (P2).
 * - **Cosa mostra** (`menuProposalView`): la proposta aperta del lunedì mostrato, quanti pasti cambiano, i prodotti
 *   della spesa nuova, i pasti cambiati (il punto ambra) e, a spesa già cominciata, quanti prodotti servirebbero in più.
 *
 * Tutto lavora sul piano proiettato (con le approvate in attesa), come i generatori.
 */
import { useEffect, useMemo } from 'react';
import type { AppData, HHMM, ISODate, MealSlot, PlanProposal } from '../../domain/types';
import { useRoute } from '../../app/router';
import { addDays, currentDate, nowHHMM, toISO, weekdayOf } from '../../engine/dates';
import { isStarterDay, MEAL_SLOTS, menuWeekInForce } from '../../engine/menu';
import { buildMenuProposal, isMenuProposalTime, menuProposalMonday, menuProposalShopping } from '../../engine/menuGen';
import { changedMeals } from '../../engine/plan/diff';
import { planBasis } from '../../engine/plan/proposals';
import { planTodayISO } from '../../engine/sleep';
import { useNowHHMM, usePlanDay } from '../../state/hooks';
import { DATA_REPLACED_EVENT, useApp } from '../../state/store';
import {
  isReuseProposal,
  projectedAppData,
  proposalStateOf,
  refreshProposal,
  registerProposalBuilder,
  stamped,
  submitProposal,
  type ProposalBuilder,
} from '../piano/actions';
import { useOpenProposal, useProposalState } from '../piano/useProposals';

/** Lo stato che serve alla proposta del menù: quello dello store, o una sua parte nei test. */
export type MenuProposalAppState = Pick<AppData, 'plan' | 'profile' | 'physio' | 'dayLogs'> &
  Partial<Pick<AppData, 'planner' | 'checkIns' | 'reviews' | 'workoutLogs' | 'footballLogs' | 'shoppingChecked' | 'prepDone'>>;

// ───────────────────────── Generatore registrato ─────────────────────────

/**
 * Il generatore del menù per il foglio della proposta: quello del motore, tranne per una proposta nata dallo storico, che
 * non ha un generatore (il menù viene da una settimana approvata in passato).
 */
export const menuProposalBuilder: ProposalBuilder = (ctx) => (ctx.previous && isReuseProposal(ctx.previous) ? null : buildMenuProposal(ctx));

// ───────────────────────── Quando nasce ─────────────────────────

export type MenuProposalStep =
  /** Niente da fare: non è ancora venerdì alle 12:00, il menù di quel lunedì è approvato, è la settimana di avvio, o la proposta è già decisa. */
  | { kind: 'niente'; reason: 'presto' | 'approvato' | 'avvio' | 'decisa' }
  /** C'è una proposta aperta: si controlla la base (e si ricalcola se è cambiata). */
  | { kind: 'aggiorna'; id: string }
  /** Nessuna proposta per quel lunedì (o solo superate): si genera, con il tentativo dell'ultima superata. */
  | { kind: 'genera'; monday: ISODate; attempt: number };

/** L'orario che conta per «dal venerdì alle 12:00»: dopo mezzanotte la giornata del piano è ancora ieri, a fine giornata. */
export function proposalClock(now: Date, planDay: ISODate): HHMM {
  return toISO(now) === planDay ? nowHHMM(now) : '23:59';
}

/** Cosa fare per la proposta del menù della settimana dopo (pura: legge lo stato, non scrive). */
export function menuProposalStep(s: MenuProposalAppState, today: ISODate, time: HHMM): MenuProposalStep {
  if (!isMenuProposalTime(today, time)) return { kind: 'niente', reason: 'presto' };
  const monday = menuProposalMonday(today);
  const projected = proposalStateOf(s).plan;
  if (projected.menus?.[monday]) return { kind: 'niente', reason: 'approvato' };
  for (let i = 0; i < 7; i++) if (isStarterDay(addDays(monday, i), projected)) return { kind: 'niente', reason: 'avvio' };
  const mine = (s.planner?.proposals ?? []).filter((p) => p.kind === 'menu' && p.effectiveFrom === monday);
  const open = mine
    .filter((p) => p.status === 'aperta')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
  if (open) return { kind: 'aggiorna', id: open.id };
  if (mine.some((p) => p.status === 'approvata' || p.status === 'scartata')) return { kind: 'niente', reason: 'decisa' };
  const attempts = mine.filter((p) => p.status === 'superata' && !isReuseProposal(p)).map((p) => p.attempt ?? 0);
  return { kind: 'genera', monday, attempt: attempts.length ? Math.max(...attempts) : 0 };
}

/** Basi per cui il generatore non ha dato niente (nessuna differenza dal menù che varrebbe comunque): non si ricalcola. */
const emptyBuilds = new Set<string>();

/**
 * Una proposta superata con lo stesso id torna aperta: la base è tornata quella di prima (un'esclusione tolta con
 * «Annulla»). `saveProposal` non riapre una proposta con un id già deciso, e «superata» non è una decisione dell'utente.
 */
function reopenSuperseded(p: PlanProposal): string {
  const fresh = stamped(p);
  useApp.setState((s) => {
    const list = s.planner?.proposals ?? [];
    return { planner: { ...(s.planner ?? { proposals: [] }), proposals: list.map((x) => (x.id === p.id && x.status === 'superata' ? fresh : x)) } };
  });
  return p.id;
}

/**
 * Fa nascere la proposta del menù del lunedì dopo, se è il momento (dal venerdì alle 12:00) e se serve; con una proposta
 * aperta controlla solo la base. Restituisce l'id della proposta aperta, oppure null. Sincrona: chi la chiama la lancia
 * dopo il disegno (`scheduleMenuProposal`).
 */
export function proposeMenuIfDue(now: Date = currentDate()): string | null {
  for (let round = 0; round < 2; round++) {
    const s = useApp.getState();
    if (!s.onboarded) return null;
    const today = planTodayISO(s.plan, now);
    const step = menuProposalStep(s, today, proposalClock(now, today));
    if (step.kind === 'niente') return null;
    if (step.kind === 'aggiorna') {
      const r = refreshProposal(step.id, today);
      const after = useApp.getState().planner?.proposals.find((p) => p.id === (r?.id ?? step.id));
      if (after?.status === 'aperta') return after.id;
      // Ricalcolo senza esito (stesso id di una superata, o nessuna differenza): si riprova come una nascita.
      continue;
    }
    const projected = projectedAppData(s);
    const key = `${step.monday}|${planBasis('menu', proposalStateOf(s))}|${step.attempt}`;
    if (emptyBuilds.has(key)) return null;
    let p: PlanProposal | null = null;
    try {
      p = menuProposalBuilder({ state: projected, today, attempt: step.attempt });
    } catch {
      p = null;
    }
    if (!p) {
      emptyBuilds.add(key);
      return null;
    }
    const known = s.planner?.proposals.find((x) => x.id === p.id);
    if (known?.status === 'superata') return reopenSuperseded(p);
    if (known && known.status !== 'aperta') return null;
    return submitProposal(p);
  }
  return null;
}

let pending: ReturnType<typeof setTimeout> | null = null;

/** Lancia `proposeMenuIfDue` dopo il disegno (mai durante il primo disegno dopo un avvio a freddo, § 4.10). */
export function scheduleMenuProposal(delayMs = 0): void {
  if (typeof window === 'undefined' || pending !== null) return;
  pending = setTimeout(() => {
    pending = null;
    proposeMenuIfDue();
  }, delayMs);
}

let setUp = false;

/**
 * Registra il generatore del menù e il ritorno in primo piano (una volta sola). Parte da sé al primo import di questo
 * modulo, che Settimana carica dopo il primo disegno dell'app; `app/boot.ts` può chiamarla prima.
 */
export function setupMenuProposals(): void {
  if (setUp) return;
  setUp = true;
  registerProposalBuilder('menu', menuProposalBuilder);
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  // Dati sostituiti (esempio, importazione, azzeramento): le basi senza proposta di prima non valgono più.
  window.addEventListener(DATA_REPLACED_EVENT, () => emptyBuilds.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleMenuProposal(400);
  });
}

setupMenuProposals();

/** In Settimana: quando la schermata si apre, quando arriva il venerdì alle 12:00 e quando cambia la base del menù. */
export function useMenuProposalTrigger(): void {
  const route = useRoute();
  const today = usePlanDay();
  const hhmm = useNowHHMM();
  const calendar = toISO(currentDate());
  const due = isMenuProposalTime(today, calendar === today ? hhmm : '23:59');
  const state = useProposalState();
  const basis = useMemo(() => planBasis('menu', state), [state]);
  useEffect(() => {
    if (route !== 'settimana' || !due) return;
    scheduleMenuProposal(0);
  }, [route, due, today, basis]);
}

// ───────────────────────── Cosa mostra ─────────────────────────

export interface MenuProposalView {
  proposal: PlanProposal;
  monday: ISODate;
  /** Pasti che cambiano rispetto al menù che varrebbe senza approvazione. */
  meals: number;
  /** Prodotti della spesa con il menù nuovo. */
  products: number;
  /** Per quel lunedì ci sono già spunte nella spesa. */
  shopped: boolean;
  /** Prodotti da comprare in più se si approva adesso (con la spesa già cominciata). */
  extra: number;
  /** Pasti cambiati: data → pasto → ricetta del menù nuovo. */
  changed: Record<ISODate, Partial<Record<MealSlot, string>>>;
}

/** Pasti in cui la proposta cambia la ricetta rispetto al menù in vigore quel lunedì (ripetuto o rotazione). */
export function proposalChanges(
  p: Pick<PlanProposal, 'effectiveFrom' | 'patch'>,
  plan: AppData['plan'],
): Record<ISODate, Partial<Record<MealSlot, string>>> {
  const monday = p.effectiveFrom;
  const next = p.patch.menus?.[monday];
  const out: Record<ISODate, Partial<Record<MealSlot, string>>> = {};
  if (!next) return out;
  const now = menuWeekInForce(monday, plan);
  for (let d = 0; d < 7; d++) {
    for (const slot of MEAL_SLOTS) {
      const after = next.days?.[d]?.meals?.[slot];
      if (!after || after === now?.days?.[d]?.meals?.[slot]) continue;
      const iso = addDays(monday, d);
      (out[iso] ??= {})[slot] = after;
    }
  }
  return out;
}

/** Quello che la card della proposta e il menù della settimana dopo mostrano. */
export function menuProposalView(s: MenuProposalAppState, p: PlanProposal): MenuProposalView {
  const projected = projectedAppData(s);
  const shopping = menuProposalShopping(projected, p);
  // Come il gruppo «Da comprare in più» dopo l'approvazione: i prodotti nuovi, e quelli che salgono solo se già spuntati.
  const checked = new Set(s.shoppingChecked?.[p.effectiveFrom] ?? []);
  const extra = (shopping?.extra ?? []).filter((e) => !e.before || checked.has(e.item.key)).length;
  return {
    proposal: p,
    monday: p.effectiveFrom,
    meals: changedMeals(p.diff),
    products: shopping?.after.items.length ?? 0,
    shopped: shopping?.shopped ?? false,
    extra,
    changed: proposalChanges(p, projected.plan),
  };
}

/** La proposta aperta del menù del lunedì dato (mai per la settimana in corso), con quello che serve per mostrarla. */
export function useMenuProposalView(monday: ISODate): MenuProposalView | null {
  const p = useOpenProposal('menu', monday);
  const plan = useApp((s) => s.plan);
  const profile = useApp((s) => s.profile);
  const physio = useApp((s) => s.physio);
  const planner = useApp((s) => s.planner);
  const dayLogs = useApp((s) => s.dayLogs);
  const checkIns = useApp((s) => s.checkIns);
  const reviews = useApp((s) => s.reviews);
  const checked = useApp((s) => s.shoppingChecked[monday]);
  return useMemo(() => {
    if (!p) return null;
    const shoppingChecked = checked ? { [monday]: checked } : {};
    return menuProposalView({ plan, profile, physio, planner, dayLogs, checkIns, reviews, shoppingChecked }, p);
  }, [p, monday, plan, profile, physio, planner, dayLogs, checkIns, reviews, checked]);
}

/** «cambiano 4 pasti, 37 prodotti». */
export function proposalSummary(v: Pick<MenuProposalView, 'meals' | 'products'>): string {
  // Spazi indivisibili tra numero e parola: a capo non resta un numero da solo.
  const meals = v.meals === 0 ? 'stessi pasti' : v.meals === 1 ? 'cambia un\u00a0pasto' : `cambiano ${v.meals}\u00a0pasti`;
  return `${meals}, ${v.products === 1 ? 'un\u00a0prodotto' : `${v.products}\u00a0prodotti`}`;
}

/** «Dopo la spesa: servono 3 prodotti in più». */
export function afterShoppingText(extra: number): string {
  if (extra <= 0) return 'Dopo la spesa: niente da comprare in più';
  return `Dopo la spesa: ${extra === 1 ? 'serve un\u00a0prodotto' : `servono ${extra}\u00a0prodotti`} in più`;
}

/** Lunedì in cui la Spesa mostra la card: quello della settimana mostrata, o quello dopo se la lista è di questa settimana. */
export function proposalMondayFor(shownMonday: ISODate, thisMonday: ISODate, today: ISODate): ISODate {
  return shownMonday === thisMonday && weekdayOf(today) >= 4 ? addDays(thisMonday, 7) : shownMonday;
}
