/**
 * Proposta del menù della settimana dopo in Settimana (docs/FASE2.md § 4.10, § 5.2-5.3; § 13.3, § 13.11 C): nasce dal
 * venerdì alle 12:00, una volta per lunedì, sul piano proiettato; niente si applica da solo; si rigenera solo quando cambia
 * la base; una proposta decisa chiude la settimana. Stati inventati (testFixtures del motore), nessuna rete.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, PlanProposal } from '../../domain/types';
import { addDays } from '../../engine/dates';
import { menuWeekInForce } from '../../engine/menu';
import { buildMenuProposal } from '../../engine/menuGen';
import { fixtureState } from '../../engine/menuGen/testFixtures';
import { changedMeals } from '../../engine/plan/diff';
import { useApp } from '../../state/store';
import { approveProposal, hasProposalBuilder, keepCurrentPlan, REUSE_ATTEMPT, undoApproval } from '../piano/actions';
import {
  afterShoppingText,
  menuProposalBuilder,
  menuProposalStep,
  menuProposalView,
  proposalChanges,
  proposalClock,
  proposalMondayFor,
  proposalSummary,
  proposeMenuIfDue,
} from './useMenuProposal';

const THU = '2026-11-12';
const FRI = '2026-11-13';
const SAT = '2026-11-14';
const NEXT = '2026-11-16';
/** Venerdì alle 18:00, ora locale. */
const friEvening = new Date(2026, 10, 13, 18, 0);

function load(s: AppData = fixtureState(NEXT)): void {
  useApp.getState().resetAll();
  useApp.setState({ ...s, onboarded: true });
}

const menuProposals = (): PlanProposal[] => (useApp.getState().planner?.proposals ?? []).filter((p) => p.kind === 'menu');
const openMenu = () => menuProposals().filter((p) => p.status === 'aperta');

beforeEach(() => load());

describe('quando nasce', () => {
  it('dal venerdì alle 12:00 per il lunedì dopo, mai prima', () => {
    const s = useApp.getState();
    expect(menuProposalStep(s, THU, '20:00')).toEqual({ kind: 'niente', reason: 'presto' });
    expect(menuProposalStep(s, FRI, '11:59')).toEqual({ kind: 'niente', reason: 'presto' });
    expect(menuProposalStep(s, FRI, '12:00')).toEqual({ kind: 'genera', monday: NEXT, attempt: 0 });
    expect(menuProposalStep(s, SAT, '08:00')).toEqual({ kind: 'genera', monday: NEXT, attempt: 0 });
    // Giovedì sera non nasce niente.
    expect(proposeMenuIfDue(new Date(2026, 10, 12, 21, 0))).toBeNull();
    expect(menuProposals()).toHaveLength(0);
  });

  it('dopo mezzanotte la giornata del piano è ancora ieri, a fine giornata', () => {
    expect(proposalClock(new Date(2026, 10, 14, 0, 40), FRI)).toBe('23:59');
    expect(proposalClock(friEvening, FRI)).toBe('18:00');
  });

  it('nasce aperta, una sola, e non si applica da sola (P2)', () => {
    const id = proposeMenuIfDue(friEvening);
    expect(id).not.toBeNull();
    const open = openMenu();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ id, effectiveFrom: NEXT, status: 'aperta' });
    expect(open[0].createdAt).toMatch(/T\d\d:\d\d/);
    expect(useApp.getState().plan.menus).toBeUndefined();
    // Riaprire Settimana o tornare in primo piano non duplica e non ricalcola: la base è la stessa.
    expect(proposeMenuIfDue(new Date(2026, 10, 14, 9, 0))).toBe(id);
    expect(openMenu()).toHaveLength(1);
    expect(menuProposalStep(useApp.getState(), SAT, '09:00')).toEqual({ kind: 'aggiorna', id });
  });

  it('una pesata o una spunta non la cambiano; un’esclusione la supera e la ricalcola, e tolta torna quella di prima', () => {
    const id = proposeMenuIfDue(friEvening)!;
    const a = useApp.getState();
    a.saveCheckIn({ date: FRI, weightKg: 70.4, pain: {}, energy: 7 });
    a.toggleShopping(NEXT, 'kiwi');
    expect(proposeMenuIfDue(friEvening)).toBe(id);

    useApp.getState().addExclusion('tonno', 'impostazioni', SAT);
    const next = proposeMenuIfDue(friEvening);
    expect(next).not.toBeNull();
    expect(next).not.toBe(id);
    expect(menuProposals().find((p) => p.id === id)?.status).toBe('superata');
    expect(openMenu().map((p) => p.id)).toEqual([next]);

    // «Annulla» dell'esclusione: la base torna quella di prima e torna aperta la stessa proposta (stesso id).
    useApp.getState().removeExclusion('tonno');
    expect(proposeMenuIfDue(friEvening)).toBe(id);
    expect(openMenu().map((p) => p.id)).toEqual([id]);
  });

  it('«Tieni il piano attuale» chiude la settimana: niente rinasce fino al lunedì dopo', () => {
    const id = proposeMenuIfDue(friEvening)!;
    keepCurrentPlan(id);
    expect(menuProposalStep(useApp.getState(), SAT, '10:00')).toEqual({ kind: 'niente', reason: 'decisa' });
    expect(proposeMenuIfDue(new Date(2026, 10, 14, 10, 0))).toBeNull();
    expect(openMenu()).toHaveLength(0);
    // Il venerdì dopo nasce quella del lunedì successivo.
    expect(menuProposalStep(useApp.getState(), addDays(FRI, 7), '13:00')).toMatchObject({ kind: 'genera', monday: addDays(NEXT, 7) });
  });

  it('approvata: il menù di quel lunedì è approvato e non nasce altro; «Annulla» la riapre', () => {
    const id = proposeMenuIfDue(friEvening)!;
    expect(approveProposal(id, FRI).status).toBe('approvata');
    expect(useApp.getState().plan.menus?.[NEXT]).toBeDefined();
    expect(menuProposalStep(useApp.getState(), FRI, '19:00')).toEqual({ kind: 'niente', reason: 'approvato' });
    // Oggi e i giorni prima del lunedì non cambiano: il menù in vigore questa settimana è lo stesso.
    expect(menuWeekInForce(FRI, useApp.getState().plan)).toEqual(menuWeekInForce(FRI, fixtureState(NEXT).plan));
    undoApproval(id);
    expect(useApp.getState().plan.menus?.[NEXT]).toBeUndefined();
    expect(menuProposalStep(useApp.getState(), FRI, '19:00')).toEqual({ kind: 'aggiorna', id });
  });

  it('nella settimana di avvio non nasce (vince il menù di avvio)', () => {
    const s = fixtureState(NEXT);
    // Chi comincia di domenica vive la settimana dopo con il menù di avvio (spesa e preparazione non ancora fatte).
    s.plan.startDate = NEXT;
    s.plan.firstUse = { date: addDays(NEXT, -1), time: '10:00' };
    load(s);
    expect(menuProposalStep(useApp.getState(), addDays(NEXT, -1), '20:00')).toEqual({ kind: 'niente', reason: 'avvio' });
  });
});

describe('generatore registrato', () => {
  it('il menù ha il suo generatore; una proposta nata dallo storico non si ricalcola con il generatore', () => {
    expect(hasProposalBuilder('menu')).toBe(true);
    const s = useApp.getState();
    const p = buildMenuProposal({ state: s, today: FRI, attempt: 0 })!;
    expect(menuProposalBuilder({ state: s, today: FRI, attempt: 0 })).toEqual(p);
    expect(menuProposalBuilder({ state: s, today: FRI, attempt: REUSE_ATTEMPT + 3, previous: { ...p, attempt: REUSE_ATTEMPT + 3 } })).toBeNull();
  });
});

describe('cosa mostra', () => {
  it('pasti cambiati rispetto al menù in vigore, spesa nuova e testi della card', () => {
    const id = proposeMenuIfDue(friEvening)!;
    const p = menuProposals().find((x) => x.id === id)!;
    const s = useApp.getState();
    const v = menuProposalView(s, p);
    expect(v.monday).toBe(NEXT);
    expect(v.meals).toBe(changedMeals(p.diff));
    expect(v.products).toBeGreaterThan(10);
    expect(v.products).toBeLessThanOrEqual(40);
    expect(v.shopped).toBe(false);
    // Ogni pasto segnato cambia davvero, e sono tutti quelli che cambiano.
    const now = menuWeekInForce(NEXT, s.plan)!;
    const week = p.patch.menus![NEXT]!;
    let count = 0;
    for (let d = 0; d < 7; d++) {
      for (const [slot, rid] of Object.entries(week.days[d].meals)) {
        const marked = proposalChanges(p, s.plan)[addDays(NEXT, d)]?.[slot as 'pranzo'];
        if (rid !== now.days[d].meals[slot as 'pranzo']) {
          count++;
          expect(marked).toBe(rid);
        } else expect(marked).toBeUndefined();
      }
    }
    expect(count).toBe(v.meals);
    const plain = (t: string) => t.replace(/\u00a0/g, ' ');
    expect(plain(proposalSummary({ meals: 4, products: 37 }))).toBe('cambiano 4 pasti, 37 prodotti');
    expect(plain(proposalSummary({ meals: 1, products: 1 }))).toBe('cambia un pasto, un prodotto');
    expect(plain(afterShoppingText(3))).toBe('Dopo la spesa: servono 3 prodotti in più');
    expect(plain(afterShoppingText(1))).toBe('Dopo la spesa: serve un prodotto in più');
    expect(afterShoppingText(0)).toBe('Dopo la spesa: niente da comprare in più');
  });

  it('a spesa cominciata dice quanti prodotti servirebbero in più, con la regola del gruppo «Da comprare in più»', () => {
    const id = proposeMenuIfDue(friEvening)!;
    const p = menuProposalView(useApp.getState(), menuProposals().find((x) => x.id === id)!);
    expect(p.shopped).toBe(false);
    useApp.getState().toggleShopping(NEXT, 'kiwi');
    const after = menuProposalView(useApp.getState(), menuProposals().find((x) => x.id === id)!);
    expect(after.shopped).toBe(true);
    expect(after.extra).toBeGreaterThanOrEqual(0);
  });

  it('la Spesa di questa settimana mostra dal venerdì la proposta del lunedì dopo', () => {
    const thisMonday = '2026-11-09';
    expect(proposalMondayFor(thisMonday, thisMonday, FRI)).toBe(NEXT);
    expect(proposalMondayFor(thisMonday, thisMonday, THU)).toBe(thisMonday);
    expect(proposalMondayFor(NEXT, thisMonday, SAT)).toBe(NEXT);
  });
});
