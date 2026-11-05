/**
 * «Da comprare in più» (docs/FASE2.md § 5.3; § 13.10 test 54, sabato con la spesa già spuntata): un menù approvato a
 * spesa cominciata annota le spunte di quel momento; il gruppo ha i prodotti nuovi e quelli che salgono di una confezione
 * solo se erano già nel carrello; «Annulla» lo toglie. Stati inventati, nessuna rete.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, PlanProposal } from '../../domain/types';
import { buildMenuProposal } from '../../engine/menuGen';
import { fixtureState } from '../../engine/menuGen/testFixtures';
import { nutritionStateOf } from '../../engine/nutrition';
import { shoppingList } from '../../engine/shopping';
import { useApp } from '../../state/store';
import { approveProposal, submitProposal, undoApproval } from '../piano/actions';
import { approvedMenuOf, EXTRA_CHECK_PREFIX, extraShoppingMarks, extraShoppingRows, nextMarks } from './extraShopping';

const FRI = '2026-11-13';
const NEXT = '2026-11-16';

function load(s: AppData = fixtureState(NEXT)): void {
  useApp.getState().resetAll();
  useApp.setState({ ...s, onboarded: true });
  extraShoppingMarks.clear();
}

/** Proposta del motore per il lunedì dopo, salvata aperta. */
function proposal(): PlanProposal {
  const p = buildMenuProposal({ state: useApp.getState(), today: FRI, attempt: 0 })!;
  submitProposal(p);
  return p;
}

const before = (s: AppData) => shoppingList(NEXT, nutritionStateOf(s));

beforeEach(() => load());

describe('nota dell’approvazione a spesa cominciata', () => {
  it('approvare con spunte annota le spunte di quel momento; senza spunte niente; «Annulla» la toglie', () => {
    const p = proposal();
    const keys = before(useApp.getState()).items.slice(0, 3).map((i) => i.key);
    for (const k of keys) useApp.getState().toggleShopping(NEXT, k);
    expect(approveProposal(p.id, FRI).status).toBe('approvata');
    expect(extraShoppingMarks.get()[NEXT]).toEqual({ proposalId: p.id, checked: keys });
    undoApproval(p.id);
    expect(extraShoppingMarks.get()[NEXT]).toBeUndefined();

    // Senza spunte: si compra direttamente la lista nuova, niente gruppo.
    load();
    const q = proposal();
    approveProposal(q.id, FRI);
    expect(extraShoppingMarks.get()[NEXT]).toBeUndefined();
  });

  it('nextMarks è pura: solo il passaggio da aperta ad approvata conta, e le settimane vecchie escono', () => {
    const p: PlanProposal = { ...buildMenuProposal({ state: useApp.getState(), today: FRI, attempt: 0 })!, createdAt: '2026-11-13T18:00:00.000Z' };
    const prev = { planner: { proposals: [p] }, shoppingChecked: { [NEXT]: ['kiwi'] } };
    const approved = { planner: { proposals: [{ ...p, status: 'approvata' as const }] } };
    expect(nextMarks(prev, approved, {})).toEqual({ [NEXT]: { proposalId: p.id, checked: ['kiwi'] } });
    expect(nextMarks(prev, prev, {})).toBeNull();
    // Scartata: niente nota.
    expect(nextMarks(prev, { planner: { proposals: [{ ...p, status: 'scartata' as const }] } }, {})).toBeNull();
    // Una nota di un mese fa esce.
    const old = { '2026-10-05': { proposalId: 'x', checked: ['kiwi'] } };
    expect(nextMarks(prev, approved, old, FRI)).toEqual({ [NEXT]: { proposalId: p.id, checked: ['kiwi'] } });
  });
});

describe('righe del gruppo', () => {
  it('prodotti nuovi con la loro spunta; quelli che salgono solo se erano nel carrello, con una spunta a parte', () => {
    const p = proposal();
    const old = before(useApp.getState());
    const all = old.items.map((i) => i.key);
    for (const k of all) useApp.getState().toggleShopping(NEXT, k);
    approveProposal(p.id, FRI);
    const s = useApp.getState();
    const mark = extraShoppingMarks.get()[NEXT]!;
    expect(mark.checked).toEqual(all);
    const approved = approvedMenuOf(mark, s.planner?.proposals)!;
    expect(approved.id).toBe(p.id);
    const state = nutritionStateOf(s);
    const list = shoppingList(NEXT, state);
    const rows = extraShoppingRows(list, state, {}, approved, mark);
    const oldBy = new Map(old.items.map((i) => [i.key, i]));
    for (const r of rows) {
      if (r.before) {
        expect(r.key).toBe(`${EXTRA_CHECK_PREFIX}${r.item.key}`);
        expect(oldBy.has(r.item.key)).toBe(true);
        expect(r.item.buyG).toBeGreaterThan(r.before.buyG);
      } else {
        expect(r.key).toBe(r.item.key);
        expect(oldBy.has(r.item.key)).toBe(false);
      }
    }
    // Con il carrello vuoto all'approvazione restano solo i prodotti nuovi.
    const none = extraShoppingRows(list, state, {}, approved, { ...mark, checked: [] });
    expect(none.every((r) => !r.before)).toBe(true);
    expect(none.length).toBe(rows.filter((r) => !r.before).length);
  });

  it('dopo «Annulla» la proposta non è più approvata e il gruppo non c’è', () => {
    const p = proposal();
    useApp.getState().toggleShopping(NEXT, before(useApp.getState()).items[0].key);
    approveProposal(p.id, FRI);
    const mark = { proposalId: p.id, checked: ['kiwi'] };
    expect(approvedMenuOf(mark, useApp.getState().planner?.proposals)?.id).toBe(p.id);
    undoApproval(p.id);
    expect(approvedMenuOf(mark, useApp.getState().planner?.proposals)).toBeNull();
    expect(approvedMenuOf(undefined, useApp.getState().planner?.proposals)).toBeNull();
  });
});
