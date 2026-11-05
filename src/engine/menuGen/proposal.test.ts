/**
 * Proposta del menù della settimana dopo (docs/FASE2.md § 5, § 13.2 test 7, § 13.3): pura, con la base del piano e l'id
 * dell'impronta, mai applicata da sola, con le differenze rispetto al menù che varrebbe senza approvazione.
 */
import { describe, expect, it } from 'vitest';
import type { ProposalBuilder } from '../../features/piano/actions';
import { addDays } from '../dates';
import { menuWeekInForce } from '../menu';
import { planBasis, proposalId } from '../plan/proposals';
import { menuGenInput, validationCtxOf } from './context';
import { buildMenuProposal, isMenuProposalTime, menuProposalMonday, menuProposalShopping, proposalMeals } from './proposal';
import { validateMenuWeek } from './validate';
import { fixtureState } from './testFixtures';

const FRI = '2026-11-13';
const NEXT = '2026-11-16';

// Il builder si registra così com'è con `registerProposalBuilder('menu', …)`: il tipo lo controlla il compilatore.
const asBuilder: ProposalBuilder = buildMenuProposal;

describe('buildMenuProposal', () => {
  it('nasce aperta per il lunedì dopo, con base, id, toppa del solo menù e scadenza la domenica prima', () => {
    const s = fixtureState(NEXT);
    const p = asBuilder({ state: s, today: FRI, attempt: 0 })!;
    expect(p).not.toBeNull();
    expect(p).toMatchObject({ kind: 'menu', status: 'aperta', effectiveFrom: NEXT, approvableUntil: addDays(NEXT, -1), attempt: 0, source: 'motore' });
    const basis = planBasis('menu', { plan: s.plan, profile: s.profile, physio: s.physio });
    expect(p.basis).toBe(basis);
    expect(p.id).toBe(proposalId('menu', NEXT, basis, 0));
    expect(Object.keys(p.patch)).toEqual(['menus']);
    expect(Object.keys(p.patch.menus ?? {})).toEqual([NEXT]);
    expect(p.title).toBe('Menù 16-22 novembre');
    expect(p.subtitle).toMatch(/^(Cambia un pasto|Cambiano \d+ pasti|Stessi pasti) · \d+ prodotti$/);
    expect(p.reasons.length).toBeGreaterThan(0);
    expect(p.reasons.length).toBeLessThanOrEqual(3);
    // Il menù della toppa è valido nel contesto della settimana; niente si applica da solo.
    const input = menuGenInput(NEXT, s, { today: FRI });
    expect(validateMenuWeek(p.patch.menus![NEXT]!, validationCtxOf(input))).toEqual([]);
    expect(s.plan.menus).toBeUndefined();
    expect(menuWeekInForce(NEXT, s.plan)).toEqual(input.fallback);
    expect(proposalMeals(p).length).toBe(35);
  });

  it('stessa base, stesso id; un altro tentativo, un altro id; una pesata non cambia niente (§ 13.2, test 7)', () => {
    const s = fixtureState(NEXT);
    const a = buildMenuProposal({ state: s, today: FRI, attempt: 0 })!;
    expect(buildMenuProposal({ state: fixtureState(NEXT), today: FRI, attempt: 0 })).toEqual(a);
    const weighed = fixtureState(NEXT);
    weighed.checkIns[FRI] = { date: FRI, weightKg: 71.2 } as (typeof weighed.checkIns)[string];
    expect(buildMenuProposal({ state: weighed, today: FRI, attempt: 0 })?.id).toBe(a.id);
    const b = buildMenuProposal({ state: s, today: FRI, attempt: 1, previous: a });
    if (b) {
      expect(b.id).not.toBe(a.id);
      expect(b.effectiveFrom).toBe(NEXT);
    }
    // Un'esclusione nuova cambia la base del menù.
    const excl = fixtureState(NEXT, { exclusions: ['tonno'] });
    expect(buildMenuProposal({ state: excl, today: FRI, attempt: 0 })?.basis).not.toBe(a.basis);
  });

  it('non nasce con un menù già approvato per quel lunedì né nei giorni di avvio', () => {
    const s = fixtureState(NEXT);
    const p = buildMenuProposal({ state: s, today: FRI, attempt: 0 })!;
    const approved = { ...s, plan: { ...s.plan, menus: { [NEXT]: p.patch.menus![NEXT]! } } };
    expect(buildMenuProposal({ state: approved, today: FRI, attempt: 0 })).toBeNull();
    const starter = fixtureState(NEXT);
    starter.plan.firstUse = { date: addDays(NEXT, -1), time: '19:00' };
    expect(buildMenuProposal({ state: starter, today: FRI, attempt: 0 })).toBeNull();
  });

  it('il ricalcolo tiene il lunedì della proposta finché è davanti', () => {
    expect(menuProposalMonday(FRI)).toBe(NEXT);
    expect(menuProposalMonday('2026-11-15', { kind: 'menu', effectiveFrom: NEXT })).toBe(NEXT);
    expect(menuProposalMonday(NEXT, { kind: 'menu', effectiveFrom: NEXT })).toBe('2026-11-23');
  });

  it('dal venerdì alle 12:00 alla domenica è il momento di proporre il menù', () => {
    expect(isMenuProposalTime('2026-11-12', '20:00')).toBe(false);
    expect(isMenuProposalTime(FRI, '11:59')).toBe(false);
    expect(isMenuProposalTime(FRI, '12:00')).toBe(true);
    expect(isMenuProposalTime('2026-11-14', '08:00')).toBe(true);
    expect(isMenuProposalTime('2026-11-15', '23:00')).toBe(true);
    expect(isMenuProposalTime(NEXT, '09:00')).toBe(false);
  });

  it('spesa prima e dopo: i prodotti da comprare in più se la spesa è già fatta (§ 5.3)', () => {
    const s = fixtureState(NEXT);
    const p = buildMenuProposal({ state: s, today: FRI, attempt: 0 })!;
    const shop = menuProposalShopping(s, p)!;
    expect(shop.shopped).toBe(false);
    expect(shop.after.items.length).toBe(Number(/· (\d+) prodotti/.exec(p.subtitle ?? '')?.[1]));
    const before = new Map(shop.before.items.map((i) => [i.key, i]));
    for (const e of shop.extra) {
      const prev = before.get(e.item.key);
      if (!prev) expect(e.before).toBeUndefined();
      else expect(e.item.buyG).toBeGreaterThan(prev.buyG);
    }
    const shopped = { ...s, shoppingChecked: { [NEXT]: [shop.before.items[0].key] } };
    expect(menuProposalShopping(shopped, p)?.shopped).toBe(true);
  });
});
