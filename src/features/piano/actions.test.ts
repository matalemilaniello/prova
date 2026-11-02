import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MenuWeek, PlanPatch, PlanProposal, Program } from '../../domain/types';
import { MENU_ROTATION } from '../../data/menu';
import { SESSIONS } from '../../data/sessions';
import { planBasis, proposalId } from '../../engine/plan/proposals';
import { useApp, useUi } from '../../state/store';
import {
  abortCoachRun,
  anotherProposal,
  approvedText,
  approveProposal,
  canAskAnother,
  findProposal,
  hasProposalBuilder,
  historyDiff,
  isCoachRunning,
  isReuseProposal,
  keepCurrentPlan,
  monthLabel,
  nextMonday,
  openProposalOf,
  planHistory,
  proposalStateOf,
  refreshProposal,
  registerCoachRun,
  registerProposalBuilder,
  restoreVersion,
  reuseMenu,
  startLabel,
  submitProposal,
  type BuildContext,
} from './actions';

// Domenica della revisione e lunedì del blocco nuovo (settimana predefinita: partita il lunedì, prima seduta martedì).
const SUN = '2026-11-15';
const MON = '2026-11-16';
const TUE = '2026-11-17';

const program = (blockId: string, start = MON): Program => ({
  blockId,
  start,
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
  secondary: 'prevenzione',
  sessions: { A: SESSIONS.A, B: SESSIONS.B },
});

/**
 * Generatore finto di blocchi, con la stessa forma di quello dell'onda 2B: base del piano di oggi, inizio il lunedì
 * dopo, approvabile fino al lunedì (la prima seduta che cambia è martedì).
 */
let built = 0;
function fakeBlockBuilder({ state, today, attempt }: BuildContext): PlanProposal | null {
  built++;
  const monday = nextMonday(today);
  const basis = planBasis('blocco', proposalStateOf(state));
  const patch: PlanPatch = { program: program(`blocco-${monday}-${attempt}`, monday) };
  return {
    id: proposalId('blocco', monday, basis, attempt),
    kind: 'blocco',
    status: 'aperta',
    createdAt: today,
    effectiveFrom: monday,
    approvableUntil: monday,
    basis,
    attempt,
    title: `Nuovo blocco dal ${monday}`,
    subtitle: '4 settimane · forza, poi prevenzione',
    patch,
    diff: [{ area: 'settimana', weight: 6, label: 'Blocco', before: 'sedute fisse', after: '4 settimane · forza, poi prevenzione' }],
    reasons: ['Carichi in salita, costanza buona'],
    source: 'motore',
  };
}

function obiettivi(patch: PlanPatch, effectiveFrom = MON, attempt = 0): PlanProposal {
  const s = useApp.getState();
  const basis = planBasis('obiettivi', proposalStateOf(s));
  return {
    id: proposalId('obiettivi', effectiveFrom, basis, attempt),
    kind: 'obiettivi',
    status: 'aperta',
    createdAt: SUN,
    effectiveFrom,
    basis,
    attempt,
    title: 'Nuovi obiettivi da domani',
    patch,
    diff: [{ area: 'obiettivo', weight: 5, label: 'Allenamento', before: 'Sedute fisse', after: 'Potenza, poi forza' }],
    reasons: [],
    source: 'motore',
  };
}

const lastToast = () => useUi.getState().toasts.at(-1);
let unregister: (() => void) | null = null;

beforeEach(() => {
  useApp.getState().resetAll();
  useUi.setState({ overlay: null, toasts: [] });
  built = 0;
  unregister = registerProposalBuilder('blocco', fakeBlockBuilder);
});

afterEach(() => {
  unregister?.();
  unregister = null;
});

describe('nascita e apertura', () => {
  it('una proposta del motore si salva con l’ora vera, apre il foglio e resta l’unica aperta del suo tipo', () => {
    const p = fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 0 })!;
    const id = submitProposal(p, { open: true });
    expect(useUi.getState().overlay).toEqual({ type: 'planProposal', id });
    const saved = findProposal(id)!;
    expect(saved.status).toBe('aperta');
    expect(saved.createdAt).toMatch(/T\d\d:\d\d/);
    // Rigenerare con la stessa base e lo stesso tentativo non duplica.
    submitProposal(fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 0 })!);
    expect(useApp.getState().planner?.proposals.filter((x) => x.kind === 'blocco')).toHaveLength(1);
    expect(openProposalOf('blocco')?.id).toBe(id);
  });

  it('una pesata, un controllo, una seduta o una spunta nuovi non cambiano id né stato (§ 13.2, test 7)', () => {
    const id = submitProposal(fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 0 })!);
    const a = useApp.getState();
    a.saveCheckIn({ date: SUN, weightKg: 70.4, pain: {}, energy: 7 });
    a.saveWorkout({ id: 'w1', date: SUN, sessionId: 'C', durationMin: 30, rpe: 5, pain: {}, exercises: [] });
    a.toggleShopping(MON, 'pollo');
    a.setItemStatus(SUN, 'pasto:pranzo', 'fatto');
    const builtBefore = built;
    expect(refreshProposal(id, SUN)).toEqual({ id, refreshed: false });
    expect(findProposal(id)?.status).toBe('aperta');
    expect(built).toBe(builtBefore);
  });
});

describe('superamento e ricalcolo (§ 5.2)', () => {
  it('con la base cambiata la proposta diventa superata e si ricalcola con lo stesso tentativo', () => {
    const id = submitProposal(fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 2 })!);
    useApp.getState().setScheduleDay(4, { gymTime: '18:30' });
    const r = refreshProposal(id, SUN)!;
    expect(r.refreshed).toBe(true);
    expect(r.id).not.toBe(id);
    expect(findProposal(id)?.status).toBe('superata');
    const next = findProposal(r.id)!;
    expect(next.status).toBe('aperta');
    expect(next.attempt).toBe(2);
    // La nuova non è superata: si apre di nuovo uguale.
    expect(refreshProposal(r.id, SUN)).toEqual({ id: r.id, refreshed: false });
  });

  it('oltre il giorno in cui si poteva approvare: superata, e la nuova parte dal lunedì dopo', () => {
    const id = submitProposal(fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 0 })!);
    // Il lunedì si approva ancora (la prima seduta che cambia è martedì).
    expect(refreshProposal(id, MON)).toEqual({ id, refreshed: false });
    const r = refreshProposal(id, TUE)!;
    expect(r.refreshed).toBe(true);
    expect(findProposal(id)?.status).toBe('superata');
    expect(findProposal(r.id)?.effectiveFrom).toBe('2026-11-23');
  });

  it('senza generatore una proposta superata resta superata; un generatore che lancia non rompe niente', () => {
    unregister?.();
    const id = submitProposal(fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 0 })!);
    useApp.getState().setScheduleDay(4, { gymTime: '18:30' });
    expect(refreshProposal(id, SUN)).toEqual({ id, refreshed: false });
    expect(findProposal(id)?.status).toBe('superata');
    expect(hasProposalBuilder('blocco')).toBe(false);

    unregister = registerProposalBuilder('blocco', () => {
      throw new Error('generatore rotto');
    });
    const p2 = fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 5 })!;
    submitProposal(p2);
    useApp.getState().setScheduleDay(4, { gymTime: '19:00' });
    expect(refreshProposal(p2.id, SUN)).toEqual({ id: p2.id, refreshed: false });
    expect(refreshProposal('nessuna', SUN)).toBeNull();
  });
});

describe('decisioni (§ 5.4)', () => {
  it('«Approva» applica la toppa e crea la versione; l’avviso ha «Annulla», che rimette tutto', () => {
    const planBefore = useApp.getState().plan;
    const p = fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 0 })!;
    submitProposal(p);
    const out = approveProposal(p.id, SUN);
    expect(out).toEqual({ status: 'approvata', versionId: `v-${p.id}` });
    const s = useApp.getState();
    expect(s.plan.program?.blockId).toBe(`blocco-${MON}-0`);
    expect(s.planVersions?.map((v) => v.proposalId)).toEqual([p.id]);
    const t = lastToast()!;
    expect(t).toMatchObject({ message: 'Nuovo blocco da domani', tone: 'good', actionLabel: 'Annulla', durationMs: 5000 });
    t.onAction?.();
    const u = useApp.getState();
    expect(u.plan).toEqual(planBefore);
    expect(u.planVersions).toBeUndefined();
    expect(findProposal(p.id)?.status).toBe('aperta');
    expect(lastToast()?.message).toBe('Torna il piano di prima');
  });

  it('approvare una proposta superata non cambia il piano: si mostra quella ricalcolata', () => {
    const p = fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 0 })!;
    submitProposal(p);
    useApp.getState().setScheduleDay(4, { gymTime: '18:30' });
    const before = useApp.getState().plan.program;
    const out = approveProposal(p.id, SUN);
    expect(out.status).toBe('superata');
    if (out.status !== 'superata') return;
    expect(out.refreshed).toBe(true);
    expect(out.id).not.toBe(p.id);
    expect(useApp.getState().plan.program).toEqual(before);
    expect(approveProposal('nessuna', SUN)).toEqual({ status: 'assente' });
  });

  it('decidere interrompe la rifinitura del coach, e la sua risposta tardiva si ignora', () => {
    const p = fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 0 })!;
    submitProposal(p);
    const ctrl = new AbortController();
    const off = registerCoachRun(p.id, ctrl);
    expect(isCoachRunning(p.id)).toBe(true);
    keepCurrentPlan(p.id);
    expect(ctrl.signal.aborted).toBe(true);
    expect(isCoachRunning(p.id)).toBe(false);
    expect(findProposal(p.id)?.status).toBe('scartata');
    useApp.getState().updateCoachPass(p.id, { status: 'fatto', at: 'x', applied: [], rejected: [] });
    expect(findProposal(p.id)?.coach).toBeUndefined();
    off();

    // Una seconda rifinitura sulla stessa proposta ferma la prima.
    const q = fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 1 })!;
    submitProposal(q);
    const c1 = new AbortController();
    const c2 = new AbortController();
    registerCoachRun(q.id, c1);
    registerCoachRun(q.id, c2);
    expect(c1.signal.aborted).toBe(true);
    approveProposal(q.id, SUN);
    expect(c2.signal.aborted).toBe(true);
    abortCoachRun('nessuna');
  });

  it('«Un’altra proposta»: tentativo + 1, la nuova supera la vecchia; solo per blocchi e menù con un generatore', () => {
    const p = fakeBlockBuilder({ state: useApp.getState(), today: SUN, attempt: 0 })!;
    submitProposal(p);
    expect(canAskAnother(p)).toBe(true);
    const id = anotherProposal(p.id, SUN)!;
    expect(id).not.toBe(p.id);
    expect(findProposal(id)?.attempt).toBe(1);
    expect(findProposal(p.id)?.status).toBe('superata');
    expect(useApp.getState().planner?.proposals.filter((x) => x.status === 'aperta')).toHaveLength(1);
    const g = obiettivi({ training: { primary: 'potenza', secondary: 'forza' } });
    submitProposal(g);
    expect(canAskAnother(g)).toBe(false);
    expect(anotherProposal(g.id, SUN)).toBeNull();
    unregister?.();
    expect(canAskAnother(findProposal(id)!)).toBe(false);
  });

  it('testi degli avvisi e del giorno d’inizio', () => {
    expect(startLabel(MON, SUN)).toBe('da domani');
    expect(startLabel(MON, '2026-11-13')).toBe('da lunedì');
    expect(startLabel('2026-11-23', SUN)).toBe('dal 23 novembre');
    expect(startLabel('2026-12-01', SUN)).toBe('dal 1º dicembre');
    expect(approvedText({ kind: 'menu', effectiveFrom: MON }, '2026-11-14')).toBe('Menù nuovo da lunedì');
    expect(approvedText({ kind: 'obiettivi', effectiveFrom: MON }, SUN)).toBe('Nuovi obiettivi da domani');
    expect(approvedText({ kind: 'ritorno', effectiveFrom: MON }, SUN)).toBe('Versione di prima da domani');
    expect(monthLabel(MON)).toBe('Novembre 2026');
  });
});

describe('storico e ritorno (§ 5.5, test 9)', () => {
  it('approvo A, poi B, poi torno ad A dallo storico: tornano i campi di A, gli altri restano; lo storico si accoda', () => {
    const a = obiettivi({ training: { primary: 'potenza', secondary: 'forza', presetId: 'calcio' } });
    submitProposal(a);
    expect(approveProposal(a.id, SUN).status).toBe('approvata');
    const b = obiettivi({ training: { primary: 'forza', secondary: 'prevenzione', presetId: 'forte' }, goal: 'dimagrimento', goalDeltaKcal: -350 }, '2026-11-17');
    submitProposal(b);
    expect(approveProposal(b.id, SUN).status).toBe('approvata');
    const vA = useApp.getState().planVersions!.find((v) => v.proposalId === a.id)!;

    let hist = planHistory(useApp.getState(), SUN);
    expect(hist.find((h) => h.version?.id === vA.id)?.status).toBe('passata');
    expect(hist.find((h) => h.version?.proposalId === b.id)?.status).toBe('in-arrivo');
    expect(historyDiff(hist.find((h) => h.version?.id === vA.id)!, useApp.getState(), SUN).map((d) => d.label)).toEqual(['Allenamento']);

    const res = restoreVersion(vA.id, SUN);
    expect(res).not.toBe('uguale');
    if (!res || res === 'uguale') return;
    const r = findProposal(res.id)!;
    expect(useUi.getState().overlay).toEqual({ type: 'planProposal', id: r.id });
    expect(r).toMatchObject({ kind: 'ritorno', status: 'aperta', effectiveFrom: MON, patch: vA.after });
    expect(r.createdAt).toMatch(/T/);
    // Appena nata non è superata (§ 14.2: la base comprende la toppa della versione).
    expect(refreshProposal(r.id, SUN)).toEqual({ id: r.id, refreshed: false });

    expect(approveProposal(r.id, SUN).status).toBe('approvata');
    const s = useApp.getState();
    expect(s.plan.training?.presetId).toBe('calcio');
    expect(s.profile.goal).toBe('dimagrimento');
    expect(s.plan.goalDeltaKcal).toBe(-350);
    expect(s.planVersions?.map((v) => v.kind)).toEqual(['obiettivi', 'obiettivi', 'ritorno']);
    hist = planHistory(s, SUN);
    // I campi di A valgono di nuovo come li aveva messi A (da domani: «in arrivo»), quelli di B no.
    expect(hist.find((h) => h.version?.id === vA.id)?.status).toBe('in-arrivo');
    expect(hist.find((h) => h.version?.proposalId === b.id)?.status).toBe('passata');
    expect(hist.find((h) => h.version?.kind === 'ritorno')?.status).toBe('in-arrivo');
    expect(planHistory(s, '2026-11-20').find((h) => h.version?.id === vA.id)?.status).toBe('in-vigore');

    // Tornare a una versione già in vigore non crea niente.
    const n = useApp.getState().planner?.proposals.length;
    expect(restoreVersion(vA.id, SUN)).toBe('uguale');
    expect(useApp.getState().planner?.proposals.length).toBe(n);
    expect(lastToast()?.message).toBe('Il piano è già così');
    expect(restoreVersion('nessuna', SUN)).toBeNull();
  });

  it('un ritorno superato si ricalcola dalla sua versione', () => {
    const a = obiettivi({ training: { primary: 'potenza', secondary: 'forza' } });
    submitProposal(a);
    approveProposal(a.id, SUN);
    const b = obiettivi({ training: { primary: 'forza' } }, '2026-11-17');
    submitProposal(b);
    approveProposal(b.id, SUN);
    const vA = useApp.getState().planVersions!.find((v) => v.proposalId === a.id)!;
    const res = restoreVersion(vA.id, SUN);
    if (!res || res === 'uguale') throw new Error('ritorno atteso');
    // Il piano cambia in un campo che il ritorno tocca: la proposta non vale più e si ricalcola.
    const c = obiettivi({ training: { primary: 'rapidita', secondary: 'potenza' } }, '2026-11-18');
    submitProposal(c);
    approveProposal(c.id, SUN);
    const r = refreshProposal(res.id, SUN)!;
    expect(r.refreshed).toBe(true);
    expect(findProposal(res.id)?.status).toBe('superata');
    const next = findProposal(r.id)!;
    expect(next.kind).toBe('ritorno');
    expect(next.patch).toEqual(vA.after);
    expect(next.diff[0]).toMatchObject({ label: 'Allenamento', before: 'Rapidità, poi potenza', after: 'Potenza, poi forza' });
  });

  it('«Usalo la prossima settimana»: un menù approvato torna come proposta per il lunedì dopo, senza versioni', () => {
    const past = '2026-11-02';
    const week: MenuWeek = JSON.parse(JSON.stringify(MENU_ROTATION[0]));
    week.days[0].meals.cena = MENU_ROTATION[1].days[3].meals.cena;
    useApp.setState((s) => ({ plan: { ...s.plan, menus: { [past]: week } } }));
    const hist = planHistory(useApp.getState(), SUN);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ kind: 'menu', status: 'passata', title: 'Menù 2-8 novembre', month: 'Novembre 2026' });

    const res = reuseMenu(past, SUN);
    if (!res || res === 'uguale') throw new Error('proposta attesa');
    const p = findProposal(res.id)!;
    expect(p).toMatchObject({ kind: 'menu', effectiveFrom: MON, title: 'Menù 16-22 novembre' });
    expect(isReuseProposal(p)).toBe(true);
    expect(canAskAnother(p)).toBe(false);
    expect(p.subtitle).toMatch(/^Come la settimana 2-8 novembre · /);
    // Si approva fino alla domenica prima del lunedì.
    expect(approveProposal(p.id, SUN).status).toBe('approvata');
    const s = useApp.getState();
    expect(s.plan.menus?.[MON]).toEqual(week);
    expect(s.planVersions).toBeUndefined();
    expect(lastToast()?.message).toBe('Menù nuovo da domani');
    const after = planHistory(s, SUN);
    expect(after.map((h) => h.monday)).toEqual([MON, past]);
    expect(after[0].status).toBe('in-arrivo');
    // Lo stesso menù una seconda volta: la settimana dopo ce l'ha già.
    expect(reuseMenu(MON, '2026-11-09')).toBe('uguale');
    expect(reuseMenu('2026-10-05', SUN)).toBeNull();
  });

  it('senza versioni né menù lo storico è vuoto', () => {
    expect(planHistory(useApp.getState(), SUN)).toEqual([]);
  });
});
