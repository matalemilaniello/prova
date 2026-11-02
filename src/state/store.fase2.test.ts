import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData, EatenMeal, ItemStatus, MyDish, PlanPatch, PlanProposal, PlanVersion, Program, Proposal, Supplement } from '../domain/types';
import { DEFAULT_TARGETS, STORAGE_KEY, defaultAppData } from '../data/defaults';
import { FOODS } from '../data/foods';
import { SESSIONS } from '../data/sessions';
import { addDays, weekdayOf } from '../engine/dates';
import { maxDeficitKcal } from '../engine/energy';
import { menuWeekInForce } from '../engine/menu';
import { dayCarbScale, dayTargetFor } from '../engine/nutrition';
import { restoreTo } from '../engine/plan/diff';
import { sessionFor } from '../engine/plan/program';
import { planBasis, projectedState, proposalId } from '../engine/plan/proposals';
import {
  ARCHIVE_KEY,
  COACH_INTERRUPTED,
  archiveInfo,
  estimatedItemsValues,
  keepsEatenMeal,
  normalizeBarMeals,
  normalizeData,
  normalizeEatenMeal,
  normalizeEstimatedItem,
  normalizeProgram,
  normalizeTraining,
  persistedData,
  pickData,
  safeStorage,
  useApp,
  validPer100g,
} from './store';

const D = '2026-11-10';
const MON = '2026-11-16';
const TUE = '2026-11-17';
const SUN = '2026-11-15';
const THUMB = `data:image/jpeg;base64,${'A'.repeat(200)}`;

const meal = (over: Partial<EatenMeal> = {}): EatenMeal => ({
  label: 'Pasta al pomodoro',
  nutrients: { kcal: 640, proteinG: 22, carbG: 98, fatG: 16, fiberG: 7 },
  source: 'foto',
  items: [{ foodId: 'pasta', grams: 120 }, { foodId: 'olio-evo', grams: 10, role: 'condimento' }],
  oil: 'cucchiaio',
  ...over,
});

const dish = (over: Partial<MyDish> = {}): MyDish => ({
  id: 'piatto-1',
  name: 'Pollo e zucchine',
  slots: ['cena'],
  items: [{ foodId: 'pollo', grams: 150 }, { foodId: 'zucchine', grams: 200 }, { foodId: 'olio-evo', grams: 10, role: 'condimento' }],
  nutrients: { kcal: 1, proteinG: 1, carbG: 1, fatG: 1, fiberG: 1 },
  vegPortions: 0,
  createdAt: '2026-11-10T13:00:00.000Z',
  source: 'foto',
  ...over,
});

const program: Program = {
  blockId: 'b1',
  start: MON,
  weeks: ['carico', 'carico', 'carico', 'scarico'],
  dose: [
    { mainSetsAdd: 0, setsFactor: 1, rirDelta: 0, impactFactor: 1 },
    { mainSetsAdd: 0, setsFactor: 1, rirDelta: -1, impactFactor: 1.2 },
    { mainSetsAdd: 0, setsFactor: 1, rirDelta: -1, impactFactor: 1.44 },
    { mainSetsAdd: 0, setsFactor: 0.5, rirDelta: 1, impactFactor: 0.5 },
  ],
  phase: 'stagione',
  stage: 'stagione',
  primary: 'forza',
  sessions: { A: SESSIONS.A, B: SESSIONS.B },
};

/** Proposta nata come la fanno i generatori: base del piano proiettato (con le approvate in attesa). */
function proposalFor(kind: PlanProposal['kind'], patch: PlanPatch, over: Partial<PlanProposal> = {}): PlanProposal {
  const s = useApp.getState();
  const state = projectedState({ plan: s.plan, profile: s.profile, physio: s.physio, patch }, s.planner?.proposals);
  const basis = planBasis(kind, state);
  const effectiveFrom = over.effectiveFrom ?? MON;
  return {
    id: proposalId(kind, effectiveFrom, basis, over.attempt ?? 0),
    kind,
    status: 'aperta',
    createdAt: '2026-11-13T12:00:00.000Z',
    effectiveFrom,
    basis,
    title: 'Proposta',
    patch,
    diff: [{ area: 'seduta', weight: 3, label: 'Seduta B', before: 'fissa', after: 'blocco' }],
    reasons: ['Carichi in salita'],
    source: 'motore',
    ...over,
  };
}

/** Generatore deterministico per i test a proprietà (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeEach(() => {
  useApp.getState().resetAll();
});

describe('pasti stimati (§ 7.5)', () => {
  it('la regola del pasto stimato: sostituito, oppure fatto con asPlanned; normalizzazione e setItemStatus concordano', () => {
    const statuses: (ItemStatus | undefined)[] = ['fatto', 'sostituito', 'saltato', undefined];
    for (const st of statuses) {
      for (const asPlanned of [true, false]) {
        const m = meal(asPlanned ? { asPlanned: true } : {});
        const expected = st === 'sostituito' || (st === 'fatto' && asPlanned);
        expect(keepsEatenMeal(st, m)).toBe(expected);
        const status: Record<string, ItemStatus> = st ? { 'pasto:pranzo': st } : {};
        expect(Boolean(normalizeBarMeals({ pranzo: m }, status)?.pranzo)).toBe(expected);
        // Lo store: il pasto c'è (sostituito), poi la voce prende lo stato.
        const a = useApp.getState();
        a.setItemStatus(D, 'pasto:pranzo', 'sostituito');
        a.setBarMeal(D, 'pranzo', null);
        useApp.setState((s) => ({ dayLogs: { ...s.dayLogs, [D]: { ...s.dayLogs[D], barMeals: { pranzo: m } } } }));
        a.setItemStatus(D, 'pasto:pranzo', st ?? null);
        expect(Boolean(useApp.getState().dayLogs[D].barMeals?.pranzo)).toBe(expected);
      }
    }
  });

  it('setEatenMeal scrive stima e stato insieme; «Annulla» rimette tutto com’era', () => {
    const a = useApp.getState();
    a.setItemStatus(D, 'pasto:cena', 'sostituito', 'Pizza con gli amici');
    a.setBarMeal(D, 'cena', { label: 'Pizza margherita', nutrients: { kcal: 850, proteinG: 30, carbG: 110, fatG: 28, fiberG: 5 } });
    a.swapRecipe(D, 'cena', 'r2', 'r1');
    const snap = a.mealSnapshot(D, 'cena');
    expect(snap).toMatchObject({ status: 'sostituito', note: 'Pizza con gli amici', swap: 'r2', meal: { label: 'Pizza margherita' } });
    a.setEatenMeal(D, 'cena', meal({ asPlanned: true }), { note: '' });
    let log = useApp.getState().dayLogs[D];
    expect(log.status['pasto:cena']).toBe('fatto');
    expect(log.barMeals?.cena?.asPlanned).toBe(true);
    expect(log.notes['pasto:cena']).toBeUndefined();
    a.setEatenMeal(D, 'cena', meal({ source: 'piatto', dishId: 'piatto-1', portion: 1.5 }));
    expect(useApp.getState().dayLogs[D].status['pasto:cena']).toBe('sostituito');
    a.restoreMeal(D, 'cena', snap);
    log = useApp.getState().dayLogs[D];
    expect(log.status['pasto:cena']).toBe('sostituito');
    expect(log.notes['pasto:cena']).toBe('Pizza con gli amici');
    expect(log.barMeals?.cena?.label).toBe('Pizza margherita');
    expect(log.recipeSwaps.cena).toBe('r2');
    // Un'istantanea vuota toglie tutto, cambio compreso.
    a.restoreMeal(D, 'cena', {});
    log = useApp.getState().dayLogs[D];
    expect(log.status['pasto:cena']).toBeUndefined();
    expect(log.barMeals).toBeUndefined();
    expect(log.recipeSwaps.cena).toBeUndefined();
    expect(log.swapPlanned).toBeUndefined();
  });

  it('setBarMeal resta l’alias del bar: senza provenienza, come nella fase 1', () => {
    useApp.getState().setBarMeal(D, 'spuntino', meal({ source: 'foto' }));
    expect(useApp.getState().dayLogs[D].barMeals?.spuntino?.source).toBeUndefined();
  });

  it('swapRecipe con la ricetta prevista scrive swapPlanned; tornare al menù lo toglie', () => {
    const a = useApp.getState();
    a.swapRecipe(D, 'pranzo', 'r2', 'r1');
    expect(useApp.getState().dayLogs[D].swapPlanned).toEqual({ pranzo: 'r1' });
    a.swapRecipe(D, 'pranzo', 'r3');
    expect(useApp.getState().dayLogs[D].swapPlanned).toEqual({ pranzo: 'r1' });
    a.swapRecipe(D, 'pranzo', null);
    expect(useApp.getState().dayLogs[D].swapPlanned).toBeUndefined();
  });

  it('alimenti in forma compatta, con i limiti del § 7.3', () => {
    expect(normalizeEstimatedItem({ foodId: 'pasta', grams: 2000, label: 'Pasta', per100g: { kcal: 1 }, confidence: 'alta' })).toEqual({
      foodId: 'pasta',
      grams: 1500,
    });
    expect(normalizeEstimatedItem({ grams: 0, label: 'x' })).toBeNull();
    expect(normalizeEstimatedItem({ grams: 50 })).toBeNull();
    expect(normalizeEstimatedItem({ grams: 0.4, label: '  Salsa\n della casa  ' })).toEqual({ grams: 1, label: 'Salsa della casa' });
    // Atwater: 4·10 + 4·20 + 9·5 + 2·2 = 169 contro 170 kcal → valido; con 400 kcal no.
    const ok = { kcal: 170, proteinG: 10, carbG: 20, fatG: 5, fiberG: 2 };
    expect(validPer100g(ok)).toEqual(ok);
    expect(validPer100g({ ...ok, kcal: 400 })).toBeNull();
    expect(validPer100g({ ...ok, kcal: 950 })).toBeNull();
    expect(validPer100g({ kcal: 400, proteinG: 60, carbG: 40, fatG: 10, fiberG: 0 })).toBeNull();
    expect(normalizeEstimatedItem({ grams: 100, label: 'Salsa', per100g: { ...ok, kcal: 400 } })).toEqual({ grams: 100, label: 'Salsa' });
    const many = normalizeEatenMeal(meal({ items: Array.from({ length: 20 }, () => ({ foodId: 'pasta', grams: 10 })) }));
    expect(many?.items).toHaveLength(12);
    const bad = normalizeEatenMeal({ ...meal(), source: 'cassetto', oil: 'tanto', portion: 2, asPlanned: 'sì', dishId: '' });
    expect(bad).not.toHaveProperty('source');
    expect(bad).not.toHaveProperty('oil');
    expect(bad).not.toHaveProperty('portion');
    expect(bad).not.toHaveProperty('asPlanned');
    expect(bad).not.toHaveProperty('dishId');
  });
});

describe('i miei piatti', () => {
  it('i valori si ricalcolano dagli alimenti dell’archivio; la miniatura va nell’archivio freddo', () => {
    const a = useApp.getState();
    a.saveDish(dish(), THUMB);
    const saved = useApp.getState().dishes?.[0];
    const expected = estimatedItemsValues(dish().items);
    expect(saved?.nutrients).toEqual(expected.nutrients);
    expect(saved?.nutrients.kcal).toBeCloseTo((FOODS.pollo.per100g.kcal * 150 + FOODS.zucchine.per100g.kcal * 200 + FOODS['olio-evo'].per100g.kcal * 10) / 100, 0);
    expect(saved?.vegPortions).toBe(2.5);
    expect(useApp.getState().dishThumbs).toEqual({ 'piatto-1': THUMB });
    a.updateDish('piatto-1', { name: 'Pollo, zucchine e pane', items: [...dish().items, { foodId: 'pane-integrale', grams: 50 }], lastPortion: 1.5 });
    const upd = useApp.getState().dishes?.[0];
    expect(upd?.name).toBe('Pollo, zucchine e pane');
    expect(upd?.nutrients.kcal).toBeGreaterThan(saved?.nutrients.kcal ?? 0);
    expect(upd?.lastPortion).toBe(1.5);
    a.deleteDish('piatto-1');
    expect(useApp.getState().dishes).toBeUndefined();
    expect(useApp.getState().dishThumbs).toBeUndefined();
  });

  it('miniature solo JPEG, al massimo 12 KB, solo per piatti esistenti', () => {
    const base = pickData(defaultAppData('2026-11-09'));
    const n = normalizeData({
      ...base,
      dishes: [dish(), dish({ id: 'piatto-1', name: 'Doppione' }), dish({ id: 'vuoto', items: [{ foodId: 'inesistente', grams: 100 }] })],
      dishThumbs: { 'piatto-1': THUMB, altro: THUMB },
    });
    expect(n.dishes?.map((d) => d.name)).toEqual(['Pollo e zucchine']);
    expect(n.dishThumbs).toEqual({ 'piatto-1': THUMB });
    for (const bad of ['data:image/png;base64,AAAA', `data:image/jpeg;base64,${'A'.repeat(13 * 1024)}`, 3]) {
      expect(normalizeData({ ...base, dishes: [dish()], dishThumbs: { 'piatto-1': bad } }).dishThumbs).toBeUndefined();
    }
  });
});

describe('proposte del piano', () => {
  it('una sola aperta per tipo e inizio; una decisa con lo stesso id non si riapre', () => {
    const a = useApp.getState();
    const p1 = proposalFor('blocco', { program });
    a.saveProposal(p1);
    const p2 = proposalFor('blocco', { program: { ...program, blockId: 'b2' } }, { attempt: 1, createdAt: '2026-11-13T13:00:00.000Z' });
    a.saveProposal(p2);
    const list = useApp.getState().planner?.proposals ?? [];
    expect(list.find((p) => p.id === p1.id)?.status).toBe('superata');
    expect(list.find((p) => p.id === p2.id)?.status).toBe('aperta');
    a.rejectProposal(p2.id);
    a.saveProposal({ ...p2, title: 'Rigenerata' });
    const again = useApp.getState().planner?.proposals.find((p) => p.id === p2.id);
    expect(again?.status).toBe('scartata');
    expect(again?.title).toBe('Proposta');
  });

  it('approvare un blocco da lunedì: la toppa entra il suo primo giorno con before; versione con before e after; «Annulla» rimette tutto', () => {
    const a = useApp.getState();
    const planBefore = useApp.getState().plan;
    const p = proposalFor('blocco', { program, training: { primary: 'forza', secondary: 'prevenzione' } });
    a.saveProposal(p);
    const res = a.approveProposal(p.id, SUN);
    expect(res?.versionId).toBe(`v-${p.id}`);
    let s = useApp.getState();
    // Domenica il piano resta quello di oggi: la proposta è approvata in attesa, senza before.
    expect(s.plan).toEqual(planBefore);
    let approved = s.planner?.proposals.find((x) => x.id === p.id);
    expect(approved?.status).toBe('approvata');
    expect(approved?.before).toBeUndefined();
    expect(s.planVersions).toHaveLength(1);
    expect(s.planVersions?.[0]).toMatchObject({ kind: 'blocco', before: { program: null, training: null }, after: p.patch, proposalId: p.id });
    // Approvare di nuovo non fa niente; la domenica non entra niente.
    expect(a.approveProposal(p.id, SUN)).toBeNull();
    expect(a.applyDueProposals(SUN)).toBe(0);
    expect(useApp.getState().plan).toBe(s.plan);
    // Lunedì entra.
    expect(a.applyDueProposals(MON)).toBe(1);
    s = useApp.getState();
    expect(s.plan.program?.blockId).toBe('b1');
    expect(s.plan.training?.primary).toBe('forza');
    approved = s.planner?.proposals.find((x) => x.id === p.id);
    expect(approved?.before).toEqual({ program: null, training: null });
    expect(s.planVersions?.[0].before).toEqual({ program: null, training: null });
    expect(a.applyDueProposals(MON)).toBe(0);
    a.undoApproval(p.id);
    const u = useApp.getState();
    expect(u.plan).toEqual(planBefore);
    expect(u.planVersions).toBeUndefined();
    expect(u.planner?.proposals.find((x) => x.id === p.id)?.status).toBe('aperta');
  });

  it('«Annulla» su un’approvata in attesa: il piano non cambia, la versione esce, la proposta torna aperta', () => {
    const a = useApp.getState();
    const planBefore = useApp.getState().plan;
    const p = proposalFor('obiettivi', { goal: 'dimagrimento', goalDeltaKcal: -350 });
    a.saveProposal(p);
    a.approveProposal(p.id, SUN);
    a.undoApproval(p.id);
    const u = useApp.getState();
    expect(u.plan).toBe(planBefore);
    expect(u.profile.goal).toBe('ricomposizione');
    expect(u.planVersions).toBeUndefined();
    expect(u.planner?.proposals.find((x) => x.id === p.id)).toMatchObject({ status: 'aperta' });
    // Lunedì non entra niente.
    expect(a.applyDueProposals(MON)).toBe(0);
    expect(useApp.getState().profile.goal).toBe('ricomposizione');
  });

  it('una base diversa o il giorno oltre il limite non si approvano; il menù non crea versioni', () => {
    const a = useApp.getState();
    const p = proposalFor('menu', { goalDeltaKcal: -200 });
    a.saveProposal(p);
    // Un'esclusione nuova cambia la base del menù.
    a.addExclusion('tonno', 'non-mi-piace', MON);
    expect(a.approveProposal(p.id, SUN)).toBeNull();
    expect(useApp.getState().planner?.proposals.find((x) => x.id === p.id)?.status).toBe('superata');
    const q = proposalFor('menu', { goalDeltaKcal: -200 }, { attempt: 2 });
    a.saveProposal(q);
    // Un menù si approva fino alla domenica prima: il lunedì no.
    expect(a.approveProposal(q.id, MON)).toBeNull();
    const r = proposalFor('menu', { goalDeltaKcal: -200 }, { attempt: 3 });
    a.saveProposal(r);
    expect(a.approveProposal(r.id, SUN)).toEqual({});
    // Un campo senza data aspetta il lunedì.
    expect('goalDeltaKcal' in useApp.getState().plan).toBe(false);
    a.applyDueProposals(MON);
    expect(useApp.getState().plan.goalDeltaKcal).toBe(-200);
    expect(useApp.getState().planVersions).toBeUndefined();
  });

  it('un menù della settimana dopo entra subito: la settimana di oggi non cambia, quella dopo sì', () => {
    const a = useApp.getState();
    const today = menuWeekInForce(SUN, useApp.getState().plan);
    const week = JSON.parse(JSON.stringify(menuWeekInForce(MON, useApp.getState().plan))) as NonNullable<typeof today>;
    week.days[2].meals.cena = week.days[3].meals.cena;
    const p = proposalFor('menu', { menus: { [MON]: week } });
    a.saveProposal(p);
    expect(a.approveProposal(p.id, SUN)).toEqual({});
    const s = useApp.getState();
    expect(s.plan.menus?.[MON]).toEqual(week);
    expect(menuWeekInForce(SUN, s.plan)).toEqual(today);
    expect(menuWeekInForce(MON, s.plan)).toEqual(week);
    expect(s.planner?.proposals.find((x) => x.id === p.id)?.before).toEqual({ menus: { [MON]: null } });
  });

  it('approvare un blocco che cambia la settimana supera la proposta di menù aperta', () => {
    const a = useApp.getState();
    const menu = proposalFor('menu', { goalDeltaKcal: -100 });
    a.saveProposal(menu);
    const week = useApp.getState().plan.week.map((d) => (d.weekday === 5 ? { ...d, gymTime: '10:00' } : d));
    const block = proposalFor('blocco', { program, week });
    a.saveProposal(block);
    a.approveProposal(block.id, SUN);
    expect(useApp.getState().planner?.proposals.find((x) => x.id === menu.id)?.status).toBe('superata');
  });

  it('approva A, poi B; «Annulla» su B riapplica il before di B e lascia A', () => {
    const a = useApp.getState();
    const pa = proposalFor('obiettivi', { training: { primary: 'potenza', secondary: 'forza', presetId: 'calcio' } });
    a.saveProposal(pa);
    a.approveProposal(pa.id, SUN);
    a.applyDueProposals(MON);
    const pb = proposalFor('obiettivi', { training: { primary: 'forza', secondary: 'prevenzione', presetId: 'forte' }, goal: 'dimagrimento', goalDeltaKcal: -350 }, { effectiveFrom: TUE });
    a.saveProposal(pb);
    a.approveProposal(pb.id, MON);
    expect(useApp.getState().profile.goal).toBe('ricomposizione');
    a.applyDueProposals(TUE);
    expect(useApp.getState().profile.goal).toBe('dimagrimento');
    expect(useApp.getState().planVersions).toHaveLength(2);
    a.undoApproval(pb.id);
    const s = useApp.getState();
    expect(s.plan.training?.presetId).toBe('calcio');
    expect(s.profile.goal).toBe('ricomposizione');
    expect('goalDeltaKcal' in s.plan).toBe(false);
    expect(s.planVersions?.map((v) => v.proposalId)).toEqual([pa.id]);
  });

  it('passaggio del coach: solo sulle proposte aperte; con la toppa la fonte diventa motore+coach', () => {
    const a = useApp.getState();
    const p = proposalFor('blocco', { program });
    a.saveProposal(p);
    a.updateCoachPass(p.id, { status: 'fatto', at: 'x', applied: [], rejected: [] }, { program: { ...program, blockId: 'b1c' } });
    const got = useApp.getState().planner?.proposals.find((x) => x.id === p.id);
    expect(got?.source).toBe('motore+coach');
    expect(got?.patch.program?.blockId).toBe('b1c');
    a.rejectProposal(p.id);
    a.updateCoachPass(p.id, { status: 'errore', at: 'y', applied: [], rejected: [], message: 'no' });
    expect(useApp.getState().planner?.proposals.find((x) => x.id === p.id)?.coach?.status).toBe('fatto');
  });

  it('riepiloghi dei blocchi: uno per blocco, gli ultimi 12, carico di picco valido', () => {
    const a = useApp.getState();
    for (let i = 0; i < 15; i++) {
      a.recordBlockSummary({
        blockId: `b${i}`,
        from: `2026-${String(1 + (i % 12)).padStart(2, '0')}-0${1 + Math.floor(i / 12)}`,
        to: '2026-12-31',
        primary: 'forza',
        verdict: 'consolida',
        adherence: 0.8,
        peakLoad: i === 3 ? -5 : 1800,
      });
    }
    a.recordBlockSummary({ blockId: 'b14', from: '2026-03-02', to: '2026-03-29', primary: 'forza', verdict: 'avanza', adherence: 0.9 });
    const blocks = useApp.getState().planner?.blocks ?? [];
    expect(blocks).toHaveLength(12);
    expect(blocks.filter((b) => b.blockId === 'b14')).toHaveLength(1);
    expect(blocks.find((b) => b.blockId === 'b14')?.verdict).toBe('avanza');
    expect(blocks.every((b, i) => i === 0 || blocks[i - 1].from <= b.from)).toBe(true);
  });
});

describe('decorrenza: approvare non cambia oggi né i giorni passati (§ 5.4, § 13.3 test 11)', () => {
  /** Obiettivo, scala dei carboidrati e seduta prevista di ogni giorno: quello che Oggi, Progressi e la revisione rileggono. */
  function days(from: string, to: string) {
    const s = useApp.getState();
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const slot = s.plan.week[weekdayOf(d)]?.gymSessionId;
      out.push({ d, target: dayTargetFor(d, s), scale: dayCarbScale(d, s), session: slot ? sessionFor(slot, d, s.plan) : null });
    }
    return out;
  }
  const cut = (delta: number): AppData['plan']['targets'] =>
    Object.fromEntries(Object.entries(DEFAULT_TARGETS).map(([t, v]) => [t, { ...v, kcal: v.kcal + delta, carbG: v.carbG + delta / 4 }])) as AppData['plan']['targets'];

  it('obiettivi approvati la domenica da lunedì: oggi e i giorni prima restano uguali; lunedì entrano', () => {
    const a = useApp.getState();
    const p = proposalFor('obiettivi', { targets: cut(-350), goal: 'dimagrimento', goalDeltaKcal: -350, training: { primary: 'forza', secondary: 'prevenzione' } });
    a.saveProposal(p);
    const before = days('2026-11-02', SUN);
    const tue = dayTargetFor(TUE, useApp.getState());
    expect(a.approveProposal(p.id, SUN)).toEqual({ versionId: `v-${p.id}` });
    expect(days('2026-11-02', SUN)).toEqual(before);
    expect(useApp.getState().profile.goal).toBe('ricomposizione');
    expect(a.applyDueProposals(SUN)).toBe(0);
    expect(days('2026-11-02', SUN)).toEqual(before);
    expect(a.applyDueProposals(MON)).toBe(1);
    const s = useApp.getState();
    expect(s.profile.goal).toBe('dimagrimento');
    expect(s.plan.goalDeltaKcal).toBe(-350);
    // Da lunedì il deficit vale (martedì, palestra: −350 dentro i limiti).
    expect(dayTargetFor(TUE, s).kcal).toBe(tue.kcal - 350);
  });

  it('un blocco nuovo al posto di quello in vigore: fino alla domenica restano le sedute del blocco di prima', () => {
    const a = useApp.getState();
    // Blocco in vigore dal 12 ottobre: dalla quinta settimana si ripete senza progressione (dose della settimana 2).
    a.updatePlan({ program: { ...program, blockId: 'b0', start: '2026-10-12' } });
    const thu = '2026-11-12';
    const p = proposalFor('blocco', { program: { ...program, blockId: 'b2' } }, { approvableUntil: MON });
    a.saveProposal(p);
    const before = days('2026-10-26', TUE);
    expect(before.find((x) => x.d === '2026-11-13')?.session).not.toBe(SESSIONS.B);
    expect(a.approveProposal(p.id, thu)?.versionId).toBe(`v-${p.id}`);
    // Giovedì: niente cambia, né oggi né prima, e fino a lunedì restano le sedute del blocco in vigore.
    expect(days('2026-10-26', TUE)).toEqual(before);
    for (const d of [thu, '2026-11-13', '2026-11-14', SUN]) expect(a.applyDueProposals(d)).toBe(0);
    expect(days('2026-10-26', TUE)).toEqual(before);
    expect(a.applyDueProposals(MON)).toBe(1);
    const s = useApp.getState();
    expect(s.plan.program?.blockId).toBe('b2');
    expect(sessionFor('A', TUE, s.plan)).toEqual(SESSIONS.A);
  });

  it('ritorno a un blocco iniziato il 12 ottobre, approvato il 12 novembre: riparte lunedì, la seduta di oggi non cambia', () => {
    const a = useApp.getState();
    a.updatePlan({ program: { ...program, blockId: 'b1', start: '2026-11-09' } });
    const thu = '2026-11-12';
    const old: Program = { ...program, blockId: 'b0', start: '2026-10-12', sessions: { A: SESSIONS.B, B: SESSIONS.A } };
    const version: PlanVersion = { id: 'v-b0', at: '2026-10-11T10:00:00.000Z', effectiveFrom: '2026-10-12', kind: 'blocco', title: 'Blocco di ottobre', before: { program: null }, after: { program: old } };
    useApp.setState({ planVersions: [version] });
    const s0 = useApp.getState();
    const r = restoreTo(version, projectedState({ plan: s0.plan, profile: s0.profile, physio: s0.physio }, s0.planner?.proposals), thu);
    expect(r.effectiveFrom).toBe(MON);
    expect(r.patch.program).toMatchObject({ start: MON, blockId: `b0@${MON}` });
    a.saveProposal(r);
    const before = days('2026-11-02', SUN);
    expect(a.approveProposal(r.id, thu)).not.toBeNull();
    expect(days('2026-11-02', SUN)).toEqual(before);
    expect(sessionFor('A', thu, useApp.getState().plan)).toBe(before.find((x) => x.d === '2026-11-10')?.session);
    a.applyDueProposals(MON);
    // Da martedì la seduta A è quella del blocco di allora, alla sua prima settimana.
    expect(sessionFor('A', TUE, useApp.getState().plan)).toEqual(SESSIONS.B);
  });

  it('un blocco approvato il lunedì da cui vale entra subito: il lunedì non cambia niente, il martedì non si approva più', () => {
    const a = useApp.getState();
    const p = proposalFor('blocco', { program: { ...program, sessions: { A: SESSIONS.B, B: SESSIONS.B } } }, { approvableUntil: MON });
    a.saveProposal(p);
    const monday = days(MON, MON);
    expect(a.approveProposal(p.id, MON)).not.toBeNull();
    expect(days(MON, MON)).toEqual(monday);
    expect(useApp.getState().plan.program?.blockId).toBe('b1');
    expect(useApp.getState().planner?.proposals.find((x) => x.id === p.id)?.before).toEqual({ program: null });
    const q = proposalFor('blocco', { program: { ...program, blockId: 'b3' } }, { approvableUntil: MON, attempt: 1 });
    a.saveProposal(q);
    expect(a.approveProposal(q.id, TUE)).toBeNull();
  });

  it('chi tocca gli stessi campi di un’approvata in attesa entra dopo di lei; le approvate in attesa non escono dall’elenco', () => {
    const a = useApp.getState();
    const first = proposalFor('obiettivi', { training: { primary: 'potenza', secondary: 'forza' } }, { effectiveFrom: TUE });
    a.saveProposal(first);
    a.approveProposal(first.id, SUN);
    const block = proposalFor('blocco', { program, training: { primary: 'forza', secondary: 'prevenzione' } }, { approvableUntil: MON });
    a.saveProposal(block);
    // Approvato il lunedì da cui vale, ma `training` è in attesa: aspetta martedì.
    a.approveProposal(block.id, MON);
    expect(useApp.getState().plan.program).toBeUndefined();
    expect(a.applyDueProposals(MON)).toBe(0);
    // Tre proposte di obiettivi decise dopo non tolgono quella in attesa.
    for (let i = 1; i <= 3; i++) {
      const x = proposalFor('obiettivi', { training: { primary: 'rapidita' } }, { attempt: i, effectiveFrom: '2026-11-20' });
      a.saveProposal(x);
      a.rejectProposal(x.id);
    }
    const n = normalizeData(pickData(useApp.getState()));
    expect(n.planner?.proposals.find((x) => x.id === first.id)).toMatchObject({ status: 'approvata' });
    expect(n.planner?.proposals.find((x) => x.id === first.id)?.before).toBeUndefined();
    expect(a.applyDueProposals(TUE)).toBe(2);
    const s = useApp.getState();
    expect(s.plan.program?.blockId).toBe('b1');
    expect(s.plan.training?.primary).toBe('forza');
    expect(s.planner?.proposals.find((x) => x.id === block.id)?.before).toEqual({ program: null, training: { primary: 'potenza', secondary: 'forza' } });
  });
});

describe('revisione: correzioni, scarico e proposte del piano', () => {
  const kcal = (value: number): Proposal => ({ id: 'calorie', area: 'calorie', title: '', reason: '', apply: { type: 'kcalDelta', value } });

  it('dimagrimento senza goalDeltaKcal: la correzione si taglia al tetto e il deficit si scrive', () => {
    const a = useApp.getState();
    a.updateProfile({ goal: 'dimagrimento' });
    // Obiettivi di oggi per chi è in dimagrimento: −350 dentro i targets.
    const targets = Object.fromEntries(Object.entries(DEFAULT_TARGETS).map(([t, v]) => [t, { ...v, kcal: v.kcal - 350, carbG: v.carbG - 90 }]));
    a.updatePlan({ targets: targets as AppData['plan']['targets'] });
    const cap = maxDeficitKcal(useApp.getState().plan, -350);
    expect(cap).toBe(460);
    a.applyProposal(kcal(-150));
    let s = useApp.getState();
    expect(s.plan.goalDeltaKcal).toBe(-460);
    expect(s.plan.targets.riposo.kcal).toBe(DEFAULT_TARGETS.riposo.kcal - 460);
    a.applyProposal(kcal(-150));
    s = useApp.getState();
    expect(s.plan.goalDeltaKcal).toBe(-460);
    expect(s.plan.targets.riposo.kcal).toBe(DEFAULT_TARGETS.riposo.kcal - 460);
    a.applyProposal(kcal(150));
    expect(useApp.getState().plan.goalDeltaKcal).toBe(-310);
  });

  it('scarico e settimana più leggera scrivono Plan.weekOverrides; planProposal approva', () => {
    const a = useApp.getState();
    a.applyProposal({ id: 'scarico', area: 'scarico', title: '', reason: '', apply: { type: 'weekKind', weekStart: MON, kind: 'scarico' } });
    a.applyProposal({ id: 'carico', area: 'allenamento', title: '', reason: '', apply: { type: 'weekKind', weekStart: '2026-11-18', kind: 'leggera' } });
    expect(useApp.getState().plan.weekOverrides).toEqual({ [MON]: 'scarico' });
    const p = proposalFor('blocco', { program });
    a.saveProposal(p);
    a.applyProposal({ id: 'piano', area: 'piano', title: '', reason: '', apply: { type: 'planProposal', id: p.id } }, SUN);
    expect(useApp.getState().planner?.proposals.find((x) => x.id === p.id)?.status).toBe('approvata');
  });
});

describe('sicurezza, gusti, integratori, coach', () => {
  it('segnali d’allarme: fermo, rientro allo stadio 0 senza via libera, via libera esplicito', () => {
    const a = useApp.getState();
    a.updatePlan({ training: { primary: 'rientro', secondary: 'prevenzione', rientro: { site: 'Tibia', stage: 3, since: '2026-10-01', physioOk: true } } });
    a.setImpactHold('Tibia', D);
    let s = useApp.getState();
    expect(s.plan.impactHold).toEqual({ site: 'Tibia', since: D });
    expect(s.plan.training?.rientro).toEqual({ site: 'Tibia', stage: 0, since: D });
    a.clearImpactHold();
    s = useApp.getState();
    expect(s.plan.impactHold).toBeUndefined();
    expect(s.plan.training?.rientro?.stage).toBe(0);
    // Un fermo con una data non valida resta, dall'inizio del piano.
    const base = pickData(defaultAppData('2026-11-09'));
    const n = normalizeData({ ...base, plan: { ...base.plan, impactHold: { site: 'Tibia', since: 'ieri' } } });
    expect(n.plan.impactHold).toEqual({ site: 'Tibia', since: base.plan.startDate });
    expect(normalizeData({ ...base, plan: { ...base.plan, impactHold: { site: ' ' } } }).plan.impactHold).toBeUndefined();
  });

  it('esclusioni per alimento: una sola, si tolgono; «Tienilo» si segna', () => {
    const a = useApp.getState();
    a.addExclusion('tonno', 'non-mi-piace', MON);
    a.addExclusion('tonno', 'impostazioni', '2026-11-20');
    a.addExclusion('', 'impostazioni', MON);
    expect(useApp.getState().plan.exclusions).toEqual([{ foodId: 'tonno', since: MON, origin: 'non-mi-piace' }]);
    a.markTasteAsked('finocchi', D);
    expect(useApp.getState().plan.tasteAsked).toEqual({ finocchi: D });
    a.removeExclusion('tonno');
    expect(useApp.getState().plan.exclusions).toBeUndefined();
  });

  it('controlli confermati degli integratori e uso del coach per mese', () => {
    const a = useApp.getState();
    a.acknowledgeSupplementCheck('creatina', 'ul:creatina');
    a.acknowledgeSupplementCheck('creatina', 'ul:creatina');
    expect(useApp.getState().plan.supplements.find((x) => x.id === 'creatina')?.acknowledged).toEqual(['ul:creatina']);
    a.recordCoachUsage('2026-11', { calls: 1, input: 4000, output: 1500, cacheRead: 0, cacheWrite: 2500 });
    a.recordCoachUsage('2026-11', { calls: 1, input: 1000, output: -5, cacheRead: 2500, cacheWrite: 0 });
    a.recordCoachUsage('novembre', { calls: 1, input: 1, output: 1, cacheRead: 1, cacheWrite: 1 });
    expect(useApp.getState().settings.coachUsage).toEqual({ '2026-11': { calls: 2, input: 5000, output: 1500, cacheRead: 2500, cacheWrite: 2500 } });
  });

  it('integratori: i campi del catalogo restano solo se validi; senza voce valida è scritto a mano', () => {
    const base = pickData(defaultAppData('2026-11-09'));
    const sup = (over: Record<string, unknown>) => ({ id: 'x', name: 'Prodotto', dose: '1', timing: 'colazione', active: true, ...over });
    const n = normalizeData({
      ...base,
      plan: {
        ...base.plan,
        supplements: [
          sup({ id: 'a', catalogId: 'omega-3', amount: { amount: 600, unit: 'mg' }, schedule: 'giornaliero', acknowledged: ['x', 'x'] }),
          sup({ id: 'b', catalogId: 'omega3', amount: { amount: -1, unit: 'mg' }, schedule: 'a volte', catalogVersion: 0 }),
          sup({
            id: 'c',
            catalogId: 'complesso-b',
            product: { source: 'etichetta', readAt: D, components: [{ name: 'B6', amount: 10, unit: 'mg', catalogId: 'vitamina-b6' }, { name: '', amount: 1, unit: 'mg' }] },
          }),
          sup({ id: 'd', product: { source: 'etichetta', readAt: D, components: [{ name: 'B6', amount: 0, unit: 'mg' }] } }),
        ],
      },
    });
    const [a, b, c, d] = n.plan.supplements as Supplement[];
    expect(a).toMatchObject({ catalogId: 'omega-3', amount: { amount: 600, unit: 'mg' }, schedule: 'giornaliero', acknowledged: ['x'] });
    expect(b).not.toHaveProperty('catalogId');
    expect(b).not.toHaveProperty('amount');
    expect(b).not.toHaveProperty('schedule');
    expect(b).not.toHaveProperty('catalogVersion');
    expect(c.product?.components).toEqual([{ name: 'B6', amount: 10, unit: 'mg', catalogId: 'vitamina-b6' }]);
    expect(d).not.toHaveProperty('product');
  });
});

describe('normalizzazione del piano (fase 2)', () => {
  const base = () => pickData(defaultAppData('2026-11-09'));

  it('obiettivo di allenamento: qualità ammesse, coppie vietate tolte, il rientro resta', () => {
    expect(normalizeTraining({ primary: 'boh' })).toBeUndefined();
    expect(normalizeTraining({ primary: 'forza', secondary: 'forza', sessionMin: 200, gymPerWeek: 0, spaces: ['casa', 'luna', 'casa'] })).toEqual({
      primary: 'forza',
      sessionMin: 90,
      gymPerWeek: 1,
      spaces: ['casa'],
    });
    const tibia = { site: 'Tibia', stage: 2, since: D, physioOk: true };
    expect(normalizeTraining({ primary: 'rientro', secondary: 'potenza', rientro: tibia, presetId: 'x' })).toEqual({ primary: 'rientro', rientro: tibia });
    expect(normalizeTraining({ primary: 'velocita', secondary: 'rientro', rientro: { ...tibia, site: 'Flessori' } })).toEqual({
      primary: 'rientro',
      rientro: { ...tibia, site: 'Flessori' },
    });
    // Con il gomito la coppia è ammessa.
    expect(normalizeTraining({ primary: 'rientro', secondary: 'potenza', rientro: { ...tibia, site: 'Gomito' } })?.secondary).toBe('potenza');
    // Gli obiettivi pronti restano com'erano.
    for (const [primary, secondary] of [['potenza', 'forza'], ['potenza', 'prevenzione'], ['rapidita', 'potenza'], ['forza', 'prevenzione'], ['ipertrofia', 'forza'], ['resistenza', 'velocita'], ['prevenzione', 'forza']]) {
      expect(normalizeTraining({ primary, secondary, presetId: 'p' })).toEqual({ primary, secondary, presetId: 'p' });
    }
  });

  it('programma: forma delle sedute, settimane e dosi della stessa lunghezza; altrimenti sparisce', () => {
    expect(normalizeProgram(program)).toEqual(program);
    expect(normalizeProgram({ ...program, dose: program.dose.slice(1) })).toBeUndefined();
    expect(normalizeProgram({ ...program, weeks: Array(9).fill('carico'), dose: Array(9).fill(program.dose[0]) })).toBeUndefined();
    expect(normalizeProgram({ ...program, sessions: { A: { id: 'A', name: 'A', blocks: [{ title: 'x', items: [{ exerciseId: 'p' }] }] } } })).toBeUndefined();
    const n = normalizeData({ ...base(), plan: { ...base().plan, program: { ...program, phase: 'estate' } } });
    expect('program' in n.plan).toBe(false);
  });

  it('menù solo per lunedì (52 al massimo), settimane alleggerite solo per lunedì, deficit tra −500 e +500', () => {
    const week = { days: Array.from({ length: 7 }, () => ({ meals: { pranzo: 'r1', brunch: 'r2' } })), prep: [{ id: 'riso', title: 'Riso', minutes: 20, yields: 'x' }, { id: '' }] };
    const menus: Record<string, unknown> = { '2026-11-17': week, [MON]: week, '2026-11-23': { days: [] } };
    for (let i = 0; i < 60; i++) {
      const d = new Date(2024, 0, 1 + 7 * i);
      menus[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = week;
    }
    const n = normalizeData({
      ...base(),
      plan: { ...base().plan, menus, weekOverrides: { [MON]: 'scarico', '2026-11-18': 'leggera', '2026-11-23': 'boh' }, goalDeltaKcal: -900 },
    });
    expect(Object.keys(n.plan.menus ?? {})).toHaveLength(52);
    expect(n.plan.menus?.[MON]?.days[0].meals).toEqual({ pranzo: 'r1' });
    expect(n.plan.menus?.[MON]?.prep).toHaveLength(1);
    expect(n.plan.menus?.['2026-11-17']).toBeUndefined();
    expect(n.plan.weekOverrides).toEqual({ [MON]: 'scarico' });
    expect(n.plan.goalDeltaKcal).toBe(-500);
  });

  it('proposte: stati sconosciuti scartati, coach in corso diventa errore, al massimo 3 decise per tipo', () => {
    const p = (i: number, over: Partial<PlanProposal> = {}): PlanProposal => ({
      id: `p${i}`,
      kind: 'menu',
      status: 'scartata',
      createdAt: `2026-11-0${i}T10:00:00.000Z`,
      decidedAt: `2026-11-0${i}T11:00:00.000Z`,
      effectiveFrom: MON,
      basis: 'b',
      title: 't',
      patch: {},
      diff: [],
      reasons: [],
      source: 'motore',
      ...over,
    });
    const n = normalizeData({
      ...base(),
      planner: {
        proposals: [
          p(1),
          p(2),
          p(3),
          p(4),
          p(5, { status: 'boh' as PlanProposal['status'] }),
          p(6, { status: 'aperta', decidedAt: undefined, coach: { status: 'in-corso', at: 'x', applied: [], rejected: [] } }),
          p(7, { status: 'aperta', decidedAt: undefined }),
          p(8, { kind: 'blocco' }),
        ],
      },
    });
    const list = n.planner?.proposals ?? [];
    // p6 e p7 sono aperte con lo stesso tipo e inizio: resta l'ultima creata, p6 diventa superata (e conta tra le decise).
    // Delle decise del menù restano le 3 più recenti: p6, p4, p3.
    expect(list.map((x) => [x.id, x.status])).toEqual([
      ['p3', 'scartata'],
      ['p4', 'scartata'],
      ['p6', 'superata'],
      ['p7', 'aperta'],
      ['p8', 'scartata'],
    ]);
    expect(list.find((x) => x.id === 'p6')?.coach?.status).toBe('errore');
    const only6 = normalizeData({ ...base(), planner: { proposals: [p(6, { status: 'aperta', coach: { status: 'in-corso', at: 'x', applied: [], rejected: [] } })] } });
    expect(only6.planner?.proposals[0].coach).toEqual({ status: 'errore', at: 'x', applied: [], rejected: [], message: COACH_INTERRUPTED });
  });

  it('versioni: al massimo 24, in ordine di data; senza after valido si scartano', () => {
    const v = (i: number, over: Partial<PlanVersion> = {}): PlanVersion => ({
      id: `v${i}`,
      at: `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + Math.floor(i / 12)).padStart(2, '0')}T10:00:00.000Z`,
      effectiveFrom: MON,
      kind: 'blocco',
      title: 't',
      before: {},
      after: { goal: 'massa' },
      ...over,
    });
    const versions = [...Array.from({ length: 30 }, (_, i) => v(i)), v(99, { after: 'x' as unknown as PlanPatch }), v(98, { kind: 'menu' as PlanVersion['kind'] })];
    const n = normalizeData({ ...base(), planVersions: versions });
    expect(n.planVersions).toHaveLength(24);
    expect(n.planVersions?.every((x, i, a) => i === 0 || a[i - 1].at <= x.at)).toBe(true);
    expect(n.planVersions?.some((x) => x.id === 'v99' || x.id === 'v98')).toBe(false);
  });
});

describe('stato caldo, archivio freddo e andata e ritorno', () => {
  /** Stato con tutte le sezioni nuove, dalle azioni. */
  function fullState(): AppData {
    const a = useApp.getState();
    a.saveDish(dish(), THUMB);
    a.setEatenMeal(D, 'pranzo', meal({ asPlanned: true }));
    a.addExclusion('tonno', 'non-mi-piace', MON);
    const p = proposalFor('blocco', { program, training: { primary: 'forza', secondary: 'prevenzione' } });
    a.saveProposal(p);
    a.approveProposal(p.id, SUN);
    a.recordBlockSummary({ blockId: 'b0', from: '2026-10-12', to: '2026-11-08', primary: 'forza', verdict: 'consolida', adherence: 0.8, peakLoad: 1900 });
    return pickData(useApp.getState());
  }

  it('lo stato caldo non contiene mai miniature né versioni', () => {
    const s = fullState();
    expect(s.dishThumbs).toBeDefined();
    expect(s.planVersions).toBeDefined();
    const hot = persistedData(s);
    expect('dishThumbs' in hot).toBe(false);
    expect('planVersions' in hot).toBe(false);
    expect(hot.dishes).toBeDefined();
    const stored = JSON.parse(safeStorage.getItem(STORAGE_KEY) as string) as { state: Record<string, unknown> };
    expect('dishThumbs' in stored.state).toBe(false);
    expect('planVersions' in stored.state).toBe(false);
    const archive = JSON.parse(safeStorage.getItem(ARCHIVE_KEY) as string) as Record<string, unknown>;
    expect(archive.version).toBe(1);
    expect(archive.dishThumbs).toEqual({ 'piatto-1': THUMB });
    expect(archive.planVersions).toHaveLength(1);
  });

  it('normalizeData(pickData(s)) = s, anche dopo JSON, per stati generati a caso (proprietà)', () => {
    const r = rng(41);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    const s0 = fullState();
    for (let i = 0; i < 60; i++) {
      const raw: Record<string, unknown> = {
        ...s0,
        dishes: Array.from({ length: Math.floor(r() * 4) }, (_, k) =>
          dish({ id: `d${k}`, name: pick(['Pasta', ' Riso\n e piselli ', 'x'.repeat(60)]), items: [{ foodId: pick(['pasta', 'pollo', 'mela']), grams: Math.floor(r() * 400) }] }),
        ),
        dishThumbs: { d0: THUMB, d1: pick([THUMB, 'no']) },
        planner: {
          proposals: Array.from({ length: Math.floor(r() * 6) }, (_, k) => ({
            ...proposalFor(pick(['blocco', 'menu', 'obiettivi', 'ritorno'] as const), pick([{ program }, { goal: 'massa' as const }, { menus: { [MON]: null } }]), { attempt: k }),
            status: pick(['aperta', 'approvata', 'scartata', 'superata'] as const),
            createdAt: `2026-11-1${k}T10:00:00.000Z`,
          })),
          blocks: [{ blockId: 'b0', from: '2026-10-12', to: '2026-11-08', primary: 'forza', verdict: 'consolida', adherence: r() }],
        },
        plan: {
          ...s0.plan,
          goalDeltaKcal: Math.round(-600 + r() * 1200),
          coffeePerDay: Math.floor(r() * 5),
          season: pick([undefined, { firstMatch: '2026-09-06', preseasonWeeks: 6 }]),
          weekOverrides: pick([undefined, { [MON]: 'leggera' }]),
          impactHold: pick([undefined, { site: 'Tibia', since: D }]),
        },
      };
      const s = normalizeData(raw);
      expect(normalizeData(pickData(s))).toEqual(s);
      expect(normalizeData(JSON.parse(JSON.stringify(pickData(s))))).toEqual(s);
    }
  });

  it('andata e ritorno del backup completo, archivio freddo compreso', () => {
    const s = fullState();
    const text = JSON.stringify(s);
    useApp.getState().resetAll();
    expect(useApp.getState().dishes).toBeUndefined();
    expect(safeStorage.getItem(ARCHIVE_KEY)).toBeNull();
    expect(useApp.getState().importData(JSON.parse(text))).toBe(true);
    const back = pickData(useApp.getState());
    expect(back.dishes).toEqual(s.dishes);
    expect(back.dishThumbs).toEqual(s.dishThumbs);
    expect(back.planner).toEqual(s.planner);
    expect(back.planVersions).toEqual(s.planVersions);
    expect(JSON.parse(safeStorage.getItem(ARCHIVE_KEY) as string).dishThumbs).toEqual(s.dishThumbs);
  });

  it('un backup della versione 3 importato non perde niente', () => {
    useApp.getState().loadDemo('2026-11-12');
    const demo = pickData(useApp.getState());
    const v3 = JSON.parse(JSON.stringify({ ...demo, version: 3 })) as Record<string, unknown>;
    useApp.getState().resetAll();
    expect(useApp.getState().importData(v3)).toBe(true);
    const back = pickData(useApp.getState());
    expect(back.version).toBe(4);
    expect({ ...back, version: 3 }).toEqual({ ...demo, version: 3 });
  });

  it('avvio con un archivio pieno: nessuna scrittura prima della fusione, tutto intatto dopo due ricariche', async () => {
    const s = fullState();
    const archiveBefore = safeStorage.getItem(ARCHIVE_KEY) as string;
    const hotBefore = safeStorage.getItem(STORAGE_KEY) as string;
    for (let i = 0; i < 2; i++) {
      // Lo stato in memoria si svuota, come in un'app appena aperta; il blob caldo resta quello salvato.
      useApp.setState({ dishThumbs: undefined, planVersions: undefined, dishes: undefined, planner: undefined });
      safeStorage.setItem(STORAGE_KEY, hotBefore);
      expect(safeStorage.getItem(ARCHIVE_KEY)).toBe(archiveBefore);
      const spy = vi.spyOn(safeStorage, 'setItem');
      await useApp.persist.rehydrate();
      const archiveWrites = spy.mock.calls.filter(([k]) => k === ARCHIVE_KEY);
      spy.mockRestore();
      expect(archiveWrites).toHaveLength(0);
      const now = useApp.getState();
      expect(now.dishThumbs).toEqual(s.dishThumbs);
      expect(now.planVersions).toEqual(s.planVersions);
      expect(now.dishes).toEqual(s.dishes);
      expect(now.planner).toEqual(s.planner);
      expect(safeStorage.getItem(ARCHIVE_KEY)).toBe(archiveBefore);
    }
    expect(archiveInfo()).toEqual({ loaded: true, status: 'letto' });
  });

  it('una sezione undefined nello stato non cancella mai quella salvata', () => {
    const s = fullState();
    // Cambia solo le versioni, con le miniature assenti nello stato: l'archivio le tiene.
    useApp.setState({ dishThumbs: undefined, planVersions: [...(s.planVersions ?? []), { ...(s.planVersions?.[0] as PlanVersion), id: 'v-altra', at: '2027-01-01T00:00:00.000Z' }] });
    const archive = JSON.parse(safeStorage.getItem(ARCHIVE_KEY) as string) as Record<string, unknown>;
    expect(archive.dishThumbs).toEqual(s.dishThumbs);
    expect(archive.planVersions).toHaveLength(2);
  });

  it('un archivio con una versione sconosciuta non si sovrascrive', async () => {
    const s = fullState();
    const foreign = JSON.stringify({ version: 2, dishThumbs: { x: 'y' } });
    safeStorage.setItem(STORAGE_KEY, JSON.stringify({ state: persistedData(s), version: 4 }));
    safeStorage.setItem(ARCHIVE_KEY, foreign);
    await useApp.persist.rehydrate();
    expect(archiveInfo().status).toBe('illeggibile');
    expect(useApp.getState().dishThumbs).toBeUndefined();
    expect(useApp.getState().planVersions).toBeUndefined();
    // Le azioni di ogni giorno non toccano l'archivio illeggibile.
    useApp.getState().saveDish(dish({ id: 'nuovo' }), THUMB);
    useApp.getState().deleteDish('piatto-1');
    expect(safeStorage.getItem(ARCHIVE_KEY)).toBe(foreign);
    // L'azzeramento esplicito sì.
    useApp.getState().resetAll();
    expect(safeStorage.getItem(ARCHIVE_KEY)).toBeNull();
  });
});
