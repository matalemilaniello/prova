/**
 * «Da comprare in più» (docs/FASE2.md § 5.3): un menù approvato quando per quel lunedì c'erano già spunte nella spesa
 * cambia la lista, e non tutto è in casa. In cima alla Spesa compare il gruppo con i prodotti che prima non c'erano e
 * quelli che salgono di almeno una confezione (`shoppingExtra`, engine/shopping.ts); sparisce quando è tutto spuntato o con
 * «Annulla» (la proposta torna aperta).
 *
 * Il momento dell'approvazione non si ricava dallo stato (le spunte non hanno un orario): al passaggio di una proposta di
 * menù da aperta ad approvata, se la spesa di quel lunedì aveva spunte, si annotano le spunte di quel momento
 * (`recordMenuApprovals`, chiamata da un ascoltatore dello store). La nota sta in un archivio piccolo a parte, sul
 * telefono e fuori dal backup, come la seduta in corso: vale solo per la settimana della spesa. I dati sostituiti (esempio,
 * importazione, azzeramento) la cancellano.
 *
 * Spunte: un prodotto nuovo si spunta con il suo id, come nel resto della lista; un prodotto che sale ha la sua spunta a
 * parte (`in-piu:<id>`), perché la quantità di prima è già nel carrello.
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { AppData, ISODate, PlanProposal } from '../../domain/types';
import { addDays, isISODate } from '../../engine/dates';
import { shoppingExtra, shoppingList, type ShoppingItem, type ShoppingList, type ShoppingOptions } from '../../engine/shopping';
import type { NutritionState } from '../../engine/nutrition';
import { planTodayISO } from '../../engine/sleep';
import { DATA_REPLACED_EVENT, safeStorage, useApp } from '../../state/store';

/** Chiave dell'archivio delle note (fuori dallo stato e dal backup, come la seduta in corso). */
export const EXTRA_SHOPPING_KEY = 'ritmo:spesa-in-piu';
/** Prefisso della spunta di un prodotto che sale di quantità. */
export const EXTRA_CHECK_PREFIX = 'in-piu:';
/** Settimane tenute: la nota serve solo alla spesa di quel lunedì. */
const KEEP_DAYS = 14;

/** Nota di un'approvazione a spesa cominciata. */
export interface ExtraShoppingMark {
  proposalId: string;
  /** Spunte della spesa di quel lunedì al momento dell'approvazione. */
  checked: string[];
}

export type ExtraShoppingMarks = Record<ISODate, ExtraShoppingMark>;

function readMarks(): ExtraShoppingMarks {
  try {
    const stored = safeStorage.getItem(EXTRA_SHOPPING_KEY);
    const raw: unknown = typeof stored === 'string' ? JSON.parse(stored) : null;
    if (!raw || typeof raw !== 'object') return {};
    const out: ExtraShoppingMarks = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const m = v as Partial<ExtraShoppingMark> | null;
      if (!isISODate(k) || !m || typeof m.proposalId !== 'string' || !Array.isArray(m.checked)) continue;
      out[k] = { proposalId: m.proposalId, checked: m.checked.filter((x): x is string => typeof x === 'string') };
    }
    return out;
  } catch {
    return {};
  }
}

let marks: ExtraShoppingMarks | null = null;
const listeners = new Set<() => void>();

function current(): ExtraShoppingMarks {
  marks ??= readMarks();
  return marks;
}

function write(next: ExtraShoppingMarks): void {
  marks = next;
  try {
    if (Object.keys(next).length) safeStorage.setItem(EXTRA_SHOPPING_KEY, JSON.stringify(next));
    else safeStorage.removeItem(EXTRA_SHOPPING_KEY);
  } catch {
    /* spazio finito: la nota resta in memoria */
  }
  for (const l of listeners) l();
}

export const extraShoppingMarks = {
  get: current,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Svuota l'archivio (dati sostituiti, test). */
  clear(): void {
    write({});
  },
};

/**
 * Note da aggiornare dopo un cambio dello store (pura): una proposta di menù appena approvata con la spesa di quel lunedì
 * già cominciata aggiunge la sua nota; una tornata aperta («Annulla») la toglie. `today` serve a tenere solo le settimane
 * recenti. Null se non cambia niente.
 */
export function nextMarks(
  prev: Pick<AppData, 'planner' | 'shoppingChecked'>,
  next: Pick<AppData, 'planner'>,
  marksNow: ExtraShoppingMarks,
  today?: ISODate,
): ExtraShoppingMarks | null {
  if (prev.planner === next.planner) return null;
  const before = new Map((prev.planner?.proposals ?? []).map((p) => [p.id, p]));
  let out: ExtraShoppingMarks | null = null;
  const edit = () => (out ??= { ...marksNow });
  for (const p of next.planner?.proposals ?? []) {
    if (p.kind !== 'menu') continue;
    const old = before.get(p.id);
    if (!old) continue;
    const monday = p.effectiveFrom;
    if (p.status === 'approvata' && old.status === 'aperta') {
      const checked = prev.shoppingChecked?.[monday] ?? [];
      if (checked.length) edit()[monday] = { proposalId: p.id, checked: [...checked] };
      else if (marksNow[monday]) delete edit()[monday];
    } else if (p.status === 'aperta' && old.status === 'approvata' && marksNow[monday]?.proposalId === p.id) {
      delete edit()[monday];
    }
  }
  if (today && isISODate(today)) {
    const from = addDays(today, -KEEP_DAYS);
    for (const k of Object.keys(out ?? marksNow)) if (k < from) delete edit()[k];
  }
  return out;
}

/** Annota le approvazioni a spesa cominciata (lo chiama l'ascoltatore dello store, qui sotto; i test lo chiamano a mano). */
export function recordMenuApprovals(prev: Pick<AppData, 'planner' | 'shoppingChecked'>, next: Pick<AppData, 'planner'>, today?: ISODate): void {
  const updated = nextMarks(prev, next, current(), today);
  if (updated) write(updated);
}

let listening = false;

/** Ascolta lo store una volta sola (al primo import: Settimana lo carica dopo il primo disegno dell'app). */
export function setupExtraShopping(): void {
  if (listening) return;
  listening = true;
  useApp.subscribe((s, prev) => {
    if (s.planner !== prev.planner) recordMenuApprovals(prev, s, planTodayISO(s.plan));
  });
  if (typeof window !== 'undefined') window.addEventListener(DATA_REPLACED_EVENT, () => extraShoppingMarks.clear());
}

setupExtraShopping();

// ───────────────────────── Righe del gruppo ─────────────────────────

export interface ExtraShoppingRow {
  /** Spunta della riga: l'id del prodotto, o `in-piu:<id>` per un prodotto che sale. */
  key: string;
  item: ShoppingItem;
  /** La voce di prima, per un prodotto che sale («Prima 1 confezione»). */
  before?: ShoppingItem;
}

/** La proposta approvata della nota, con la toppa già entrata nel piano (con `before`); null altrimenti. */
export function approvedMenuOf(mark: ExtraShoppingMark | undefined, proposals: readonly PlanProposal[] | undefined): PlanProposal | null {
  if (!mark) return null;
  const p = proposals?.find((x) => x.id === mark.proposalId);
  return p && p.kind === 'menu' && p.status === 'approvata' && p.before ? p : null;
}

/** Il piano con il menù di quel lunedì di prima dell'approvazione (`before` della proposta). */
function planBefore(plan: AppData['plan'], p: PlanProposal): AppData['plan'] {
  const monday = p.effectiveFrom;
  const prev = p.before?.menus?.[monday];
  const menus = { ...(plan.menus ?? {}) };
  if (prev) menus[monday] = prev;
  else delete menus[monday];
  return { ...plan, menus };
}

/**
 * Righe di «Da comprare in più» per la lista mostrata (pura): i prodotti nuovi rispetto alla spesa del menù di prima e
 * quelli che salgono di almeno una confezione, ma solo se erano già spuntati quando si è approvato (la quantità di prima è
 * in casa). Le righe già spuntate restano, con `done`; il gruppo si nasconde quando lo sono tutte.
 */
export function extraShoppingRows(
  list: ShoppingList,
  state: NutritionState,
  opts: ShoppingOptions,
  p: PlanProposal,
  mark: ExtraShoppingMark,
): ExtraShoppingRow[] {
  const before = shoppingList(list.weekStart, { ...state, plan: planBefore(state.plan, p) }, opts);
  const had = new Set(mark.checked);
  const rows: ExtraShoppingRow[] = [];
  for (const e of shoppingExtra(before, list)) {
    if (!e.before) rows.push({ key: e.item.key, item: e.item });
    else if (had.has(e.item.key)) rows.push({ key: `${EXTRA_CHECK_PREFIX}${e.item.key}`, item: e.item, before: e.before });
  }
  return rows;
}

/**
 * Le righe ancora da prendere di «Da comprare in più» per la lista mostrata, o null quando il gruppo non serve: nessuna
 * approvazione a spesa cominciata per quel lunedì, «Annulla» dopo l'approvazione, tutto spuntato. Un prodotto che sale non
 * conta più se la sua spunta di prima è stata tolta (si compra tutto, è già nel suo reparto).
 */
export function useExtraShopping(list: ShoppingList, state: NutritionState, opts: ShoppingOptions, checked: ReadonlySet<string>): ExtraShoppingRow[] | null {
  const all = useSyncExternalStore(extraShoppingMarks.subscribe, extraShoppingMarks.get, extraShoppingMarks.get);
  const mark = all[list.weekStart];
  const proposals = useApp((s) => s.planner?.proposals);
  const p = useMemo(() => approvedMenuOf(mark, proposals), [mark, proposals]);
  const rows = useMemo(() => (p && mark ? extraShoppingRows(list, state, opts, p, mark) : null), [p, mark, list, state, opts]);
  if (!rows) return null;
  const todo = rows.filter((r) => !checked.has(r.key) && (!r.before || checked.has(r.item.key)));
  return todo.length ? todo : null;
}
