/**
 * La voce della palestra in Oggi con la fase 2 (docs/FASE2.md § 11.2, § 3.8, § 3.9): la seduta e la durata sono quelle
 * della data (`daySession`), il titolo resta quello della seduta, il dettaglio dice la variante quando non è piena o il
 * fermo degli impatti. Senza blocco e senza fermo la voce è quella di prima. Dati inventati.
 */
import { describe, expect, it } from 'vitest';
import type { AppData, CheckIn, Plan } from '../domain/types';
import { defaultAppData, defaultPlan } from '../data/defaults';
import { SESSIONS } from '../data/sessions';
import { addDays } from './dates';
import { buildBlock } from './plan/build';
import { daySession, sessionFor } from './plan/program';
import { GYM_NO_IMPACT_DETAIL, GYM_VARIANT_LABEL, buildTimeline, gymDuration } from './timeline';
import { sessionDuration } from './training';

const START = '2026-11-02';
const MON = '2026-11-09';
const NO_PHYSIO = { exercises: [], prescriptions: [] };

function state(plan: Plan, over: Partial<AppData> = {}): AppData {
  return { ...defaultAppData(START), onboarded: true, plan, ...over };
}

function blockPlan(): Plan {
  const plan: Plan = { ...defaultPlan(START), training: { presetId: 'forte', primary: 'forza', secondary: 'prevenzione' } };
  const res = buildBlock({ monday: MON, plan, workoutLogs: [], footballLogs: [], checkIns: {}, physio: NO_PHYSIO, painSites: [], attempt: 0 });
  if (!res.program) throw new Error('blocco atteso');
  return { ...plan, program: res.program, ...(res.week ? { week: res.week } : {}) };
}

const gymOf = (iso: string, s: AppData) => buildTimeline(iso, s).find((i) => i.kind === 'palestra');
const plain = (x: string | undefined) => (x ?? '').replace(/ /g, ' ');

describe('voce della palestra (fase 2)', () => {
  it('senza blocco né fermo resta quella di prima', () => {
    const s = state(defaultPlan(START));
    const tue = addDays(MON, 1);
    const gym = gymOf(tue, s)!;
    expect(gym.title).toBe(SESSIONS.A.name);
    // Prima volta con la seduta: la durata è quella della fase di ingresso, come prima.
    expect(plain(gym.detail)).toBe(`${SESSIONS.A.subtitle} · ${gymDuration('A', s)!.own} min`);
    expect(gymDuration('A', s, tue)).toEqual(gymDuration('A', s));
  });

  it('con un blocco durata e titolo sono della seduta del blocco nella data', () => {
    const plan = blockPlan();
    const s = state(plan);
    const day = plan.week.find((d) => d.gymSessionId)!;
    const iso = addDays(MON, 7 + day.weekday);
    const id = day.gymSessionId!;
    const gym = gymOf(iso, s)!;
    expect(gym.title).toBe(sessionFor(id, iso, plan)!.name);
    expect(gymDuration(id, s, iso)).toEqual(sessionDuration(daySession(id, iso, s)!.session, s.physio, { intro: true }));
  });

  it('con una notte corta il dettaglio dice la variante, il titolo resta', () => {
    const plan = blockPlan();
    const day = plan.week.find((d) => d.gymSessionId)!;
    const iso = addDays(MON, 7 + day.weekday);
    const bad: CheckIn = { date: iso, sleepHours: 5, sleepQuality: 1, energy: 2, pain: {} };
    const s = state(plan, { checkIns: { [iso]: bad } });
    const gym = gymOf(iso, s)!;
    const variant = daySession(day.gymSessionId!, iso, s)!.variant;
    expect(variant).not.toBe('piena');
    expect(gym.title).toBe(sessionFor(day.gymSessionId!, iso, plan)!.name);
    expect(plain(gym.detail)).toContain(GYM_VARIANT_LABEL[variant as 'ridotta' | 'minima']);
  });

  it('con gli impatti fermi la seduta con i balzi lo dice con la frase di sempre', () => {
    const plan: Plan = { ...defaultPlan(START), impactHold: { site: 'Caviglia', since: MON } };
    const fri = addDays(MON, 4);
    const gym = gymOf(fri, state(plan))!;
    expect(gym.ref).toBe('B');
    expect(plain(gym.detail)).toContain(GYM_NO_IMPACT_DETAIL);
    // Prima del fermo la voce resta com'era.
    const before = gymOf(addDays(MON, -3), state(plan))!;
    expect(plain(before.detail)).toContain(SESSIONS.B.subtitle);
  });
});
