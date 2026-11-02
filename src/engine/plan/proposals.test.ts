import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MenuWeek, PlanPatch, PlanProposal, Program, ScheduleDay, TrainingGoal } from '../../domain/types';
import { DEFAULT_TARGETS, defaultAppData } from '../../data/defaults';
import { SESSIONS } from '../../data/sessions';
import { applyPatch, beforeOf, isSuperseded, planBasis, proposalId, stableStringify, type ProposalState } from './proposals';

const MON = '2026-11-09';
const SUN = '2026-11-08';
const NEXT_MON = '2026-11-16';

function baseState(): ProposalState {
  const d = defaultAppData('2026-11-02');
  return { plan: d.plan, profile: d.profile, physio: d.physio };
}

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
  secondary: 'prevenzione',
  sessions: { A: SESSIONS.A, B: SESSIONS.B },
};

const menuWeek: MenuWeek = {
  days: Array.from({ length: 7 }, (_, i) => ({ meals: { pranzo: `r${i}`, cena: `c${i}` } })),
  prep: [{ id: 'riso', title: 'Riso', minutes: 20, yields: 'riso per 3 pranzi' }],
};

const training: TrainingGoal = { presetId: 'sicuro', primary: 'prevenzione', secondary: 'forza', sessionMin: 60 };

function proposal(over: Partial<PlanProposal> & Pick<PlanProposal, 'kind' | 'basis'>): PlanProposal {
  return {
    id: proposalId(over.kind, over.effectiveFrom ?? MON, over.basis, over.attempt ?? 0),
    status: 'aperta',
    createdAt: '2026-11-08T10:00:00.000Z',
    effectiveFrom: MON,
    title: 'Prova',
    patch: {},
    diff: [],
    reasons: [],
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

describe('planBasis e proposalId', () => {
  it('la base non dipende dall’ordine delle chiavi né da pesate, diari e controlli', () => {
    const s = baseState();
    const reordered: ProposalState = {
      ...s,
      plan: Object.fromEntries(Object.entries(s.plan).reverse()) as unknown as ProposalState['plan'],
    };
    for (const kind of ['blocco', 'menu', 'obiettivi', 'ritorno'] as const) {
      expect(planBasis(kind, reordered)).toBe(planBasis(kind, s));
    }
    // Una pesata o un diario nuovi non sono nello stato delle proposte: la base resta.
    const withLogs = { ...s, checkIns: { [MON]: { date: MON, pain: {}, weightKg: 70 } }, dayLogs: {} } as ProposalState;
    expect(planBasis('menu', withLogs)).toBe(planBasis('menu', s));
    expect(stableStringify({ b: 1, a: [1, undefined, { d: undefined, c: 2 }] })).toBe('{"a":[1,null,{"c":2}],"b":1}');
  });

  it('un’esclusione nuova cambia la base del menù ma non quella del blocco', () => {
    const s = baseState();
    const excl: ProposalState = { ...s, plan: { ...s.plan, exclusions: [{ foodId: 'tonno', since: MON, origin: 'non-mi-piace' }] } };
    expect(planBasis('menu', excl)).not.toBe(planBasis('menu', s));
    expect(planBasis('blocco', excl)).toBe(planBasis('blocco', s));
  });

  it('ogni tipo legge le sue parti del piano', () => {
    const s = baseState();
    const hold: ProposalState = { ...s, plan: { ...s.plan, impactHold: { site: 'Tibia', since: MON } } };
    expect(planBasis('blocco', hold)).not.toBe(planBasis('blocco', s));
    expect(planBasis('menu', hold)).toBe(planBasis('menu', s));
    const goal: ProposalState = { ...s, profile: { ...s.profile, goal: 'dimagrimento' } };
    expect(planBasis('obiettivi', goal)).not.toBe(planBasis('obiettivi', s));
    expect(planBasis('blocco', goal)).toBe(planBasis('blocco', s));
    const sites: ProposalState = { ...s, profile: { ...s.profile, painSites: ['Tibia'] } };
    expect(planBasis('blocco', sites)).not.toBe(planBasis('blocco', s));
    const physio: ProposalState = {
      ...s,
      physio: { exercises: [], prescriptions: [{ exerciseId: 'x', sets: 3, repMin: 10, repMax: 12, unit: 'reps', restSec: 45, progression: 'nessuna' }] },
    };
    expect(planBasis('blocco', physio)).not.toBe(planBasis('blocco', s));
    const delta: ProposalState = { ...s, plan: { ...s.plan, goalDeltaKcal: -350 } };
    expect(planBasis('menu', delta)).not.toBe(planBasis('menu', s));
    expect(planBasis('obiettivi', delta)).not.toBe(planBasis('obiettivi', s));
  });

  it('stessa base e tentativo → stesso id; un altro tentativo → un altro id', () => {
    const b = planBasis('blocco', baseState());
    expect(proposalId('blocco', MON, b, 0)).toBe(proposalId('blocco', MON, b, 0));
    expect(proposalId('blocco', MON, b, 1)).not.toBe(proposalId('blocco', MON, b, 0));
    expect(proposalId('menu', MON, b, 0)).not.toBe(proposalId('blocco', MON, b, 0));
    expect(proposalId('blocco', NEXT_MON, b, 0)).not.toBe(proposalId('blocco', MON, b, 0));
    expect(proposalId('blocco', MON, b, 0)).toMatch(/^blocco-2026-11-09-[0-9a-z]+$/);
  });

  it('ritorno: la base comprende la versione di partenza e i valori attuali dei campi che tocca', () => {
    const s = baseState();
    const a: PlanPatch = { training };
    const b: PlanPatch = { training: { ...training, primary: 'forza', secondary: 'potenza' } };
    expect(planBasis('ritorno', { ...s, patch: a })).not.toBe(planBasis('ritorno', { ...s, patch: b }));
    // Un campo che la toppa non tocca non cambia la base; uno che tocca sì.
    const other: ProposalState = { ...s, plan: { ...s.plan, sweetsPerWeek: 5 } };
    expect(planBasis('ritorno', { ...other, patch: a })).toBe(planBasis('ritorno', { ...s, patch: a }));
    const changed: ProposalState = { ...s, plan: { ...s.plan, training: b.training ?? undefined } };
    expect(planBasis('ritorno', { ...changed, patch: a })).not.toBe(planBasis('ritorno', { ...s, patch: a }));
  });
});

describe('applyPatch e beforeOf', () => {
  it('applica solo i campi nominati; null toglie; i menù si fondono per lunedì', () => {
    const s = baseState();
    const week: ScheduleDay[] = s.plan.week.map((d) => (d.weekday === 6 ? { ...d, dayType: 'leggero' } : d));
    const withMenu = { ...s.plan, menus: { [MON]: menuWeek } };
    const { plan, profile } = applyPatch(withMenu, s.profile, {
      week,
      program,
      menus: { [MON]: null, [NEXT_MON]: menuWeek },
      goal: 'dimagrimento',
      goalDeltaKcal: -350,
    });
    expect(plan.week[6].dayType).toBe('leggero');
    expect(plan.program?.blockId).toBe('b1');
    expect(Object.keys(plan.menus ?? {})).toEqual([NEXT_MON]);
    expect(profile.goal).toBe('dimagrimento');
    expect(plan.goalDeltaKcal).toBe(-350);
    expect(plan.supplements).toBe(withMenu.supplements);
    // Gli argomenti non cambiano.
    expect(withMenu.menus[MON]).toBe(menuWeek);
    expect(s.profile.goal).toBe('ricomposizione');
    const back = applyPatch(plan, profile, { program: null, menus: { [NEXT_MON]: null }, goalDeltaKcal: null });
    expect('program' in back.plan).toBe(false);
    expect('menus' in back.plan).toBe(false);
    expect('goalDeltaKcal' in back.plan).toBe(false);
  });

  it('applyPatch(applyPatch(p, x), beforeOf(p, x)) = p, per ogni toppa (proprietà)', () => {
    const r = rng(20261109);
    const s = baseState();
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    const plans = [
      s.plan,
      { ...s.plan, program, menus: { [MON]: menuWeek }, training, goalDeltaKcal: -200, seasonWeek: s.plan.week },
      { ...s.plan, menus: { [NEXT_MON]: menuWeek } },
    ];
    for (let i = 0; i < 300; i++) {
      const plan = pick(plans);
      const profile = { ...s.profile, goal: pick(['ricomposizione', 'dimagrimento', 'massa', 'mantenimento'] as const) };
      const patch: PlanPatch = {};
      if (r() < 0.4) patch.week = plan.week.map((d) => ({ ...d, gymTime: r() < 0.5 ? '18:00' : d.gymTime }));
      if (r() < 0.4) patch.seasonWeek = r() < 0.5 ? null : s.plan.week;
      if (r() < 0.4) patch.program = r() < 0.4 ? null : { ...program, blockId: `b${i}` };
      if (r() < 0.4) patch.menus = Object.fromEntries([MON, NEXT_MON].filter(() => r() < 0.6).map((d) => [d, r() < 0.4 ? null : menuWeek]));
      if (r() < 0.4) patch.training = r() < 0.3 ? null : { ...training, sessionMin: 30 + Math.floor(r() * 60) };
      if (r() < 0.4) patch.targets = { ...DEFAULT_TARGETS, riposo: { ...DEFAULT_TARGETS.riposo, kcal: 2000 + Math.floor(r() * 500) } };
      if (r() < 0.4) patch.goal = pick(['ricomposizione', 'dimagrimento', 'massa', 'mantenimento'] as const);
      if (r() < 0.4) patch.goalDeltaKcal = r() < 0.3 ? null : -Math.floor(r() * 500);
      const once = applyPatch(plan, profile, patch);
      const back = applyPatch(once.plan, once.profile, beforeOf(plan, profile, patch));
      expect(back.plan).toEqual(plan);
      expect(back.profile).toEqual(profile);
    }
  });

  it('beforeOf nomina solo i campi della toppa', () => {
    const s = baseState();
    const before = beforeOf(s.plan, s.profile, { program, menus: { [MON]: menuWeek }, goal: 'massa' });
    expect(before).toEqual({ program: null, menus: { [MON]: null }, goal: 'ricomposizione' });
  });
});

describe('isSuperseded', () => {
  it('aperta con la stessa base: valida fino all’ultimo giorno approvabile', () => {
    const s = baseState();
    const p = proposal({ kind: 'menu', basis: planBasis('menu', s), effectiveFrom: MON });
    // Un menù si approva fino alla domenica prima dell'inizio.
    expect(isSuperseded(p, s, SUN)).toBe(false);
    expect(isSuperseded(p, s, MON)).toBe(true);
    // Un blocco con approvableUntil il lunedì si approva ancora il lunedì, il martedì no.
    const b = proposal({ kind: 'blocco', basis: planBasis('blocco', s), effectiveFrom: MON, approvableUntil: MON });
    expect(isSuperseded(b, s, MON)).toBe(false);
    expect(isSuperseded(b, s, '2026-11-10')).toBe(true);
  });

  it('la base cambiata la supera; approvata e scartata non sono superate', () => {
    const s = baseState();
    const p = proposal({ kind: 'menu', basis: planBasis('menu', s) });
    const changed: ProposalState = { ...s, plan: { ...s.plan, exclusions: [{ foodId: 'tonno', since: MON, origin: 'impostazioni' }] } };
    expect(isSuperseded(p, changed, SUN)).toBe(true);
    expect(isSuperseded({ ...p, status: 'approvata' }, changed, SUN)).toBe(false);
    expect(isSuperseded({ ...p, status: 'scartata' }, changed, SUN)).toBe(false);
    expect(isSuperseded({ ...p, status: 'superata' }, s, SUN)).toBe(true);
  });

  it('ritorno: usa la toppa della proposta per la base', () => {
    const s = baseState();
    const patch: PlanPatch = { training };
    const p = proposal({ kind: 'ritorno', basis: planBasis('ritorno', { ...s, patch }), patch });
    expect(isSuperseded(p, s, SUN)).toBe(false);
    const moved: ProposalState = { ...s, plan: { ...s.plan, training: { ...training, primary: 'potenza' } } };
    expect(isSuperseded(p, moved, SUN)).toBe(true);
  });
});

describe('motori puri (§ 13.2)', () => {
  it('engine/plan ed engine/energy.ts non leggono l’orologio e non usano Math.random', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => `${dir}/${f}`);
    files.push(fileURLToPath(new URL('../energy.ts', import.meta.url)));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
      // Commenti tolti: la regola vale per il codice.
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Date\.now\s*\(/);
      expect(src, f).not.toMatch(/new Date\s*\(\s*\)/);
      expect(src, f).not.toMatch(/Math\.random/);
    }
  });

  it('stessi ingressi, stessi risultati', () => {
    const s = baseState();
    const patch: PlanPatch = { program, training, menus: { [MON]: menuWeek } };
    expect(planBasis('blocco', s)).toBe(planBasis('blocco', baseState()));
    expect(applyPatch(s.plan, s.profile, patch)).toEqual(applyPatch(baseState().plan, baseState().profile, patch));
    expect(beforeOf(s.plan, s.profile, patch)).toEqual(beforeOf(baseState().plan, baseState().profile, patch));
  });
});
