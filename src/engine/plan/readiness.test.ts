/**
 * Giorno adattato al controllo del mattino (docs/FASE2.md § 3.9, § 13.7 test 35), daySession con il fermo degli impatti
 * (test 60), casi particolari (§ 3.10). Controlli del mattino inventati.
 */
import { describe, expect, it } from 'vitest';
import type { CheckIn, Plan, WorkoutLog } from '../../domain/types';
import { defaultPlan } from '../../data/defaults';
import { EXERCISES, impactLevelOf } from '../../data/exercises';
import { estimateItemSec, SESSIONS } from '../../data/sessions';
import { addDays } from '../dates';
import { painGate, sessionDuration, type TrainingState } from '../training';
import { buildBlock } from './build';
import { floorOf, isImpactItem, type FloorId } from './limits';
import { daySession, RECALL_ITEM, sessionFor } from './program';
import { dayReadiness, minimalSession, readinessText, reducedSession } from './readiness';

const MONDAY = '2026-11-09';
const FRIDAY = '2026-11-13';
const TUESDAY = '2026-11-10';

const planWithBlock = (over: Partial<Plan> = {}): Plan => {
  const plan: Plan = { ...defaultPlan('2026-11-02'), training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza', spaces: ['corsia'] }, ...over };
  const p = buildBlock({ monday: MONDAY, plan, workoutLogs: [], footballLogs: [], checkIns: {}, physio: { exercises: [], prescriptions: [] }, painSites: ['Tibia', 'Gomito'], attempt: 0 }).program!;
  return { ...plan, program: p };
};

const state = (plan: Plan, checkIns: Record<string, CheckIn> = {}, extra: Partial<TrainingState> = {}): TrainingState => ({
  plan,
  workoutLogs: [],
  footballLogs: [],
  checkIns,
  profile: { ...defaultProfile(), painSites: ['Tibia', 'Gomito'] },
  ...extra,
});
const defaultProfile = () => ({ sex: 'M' as const, birthYear: 1990, heightCm: 178, startWeightKg: 74, goal: 'ricomposizione' as const, painSites: [] as string[], waterTargetL: 2.5 });
const ci = (date: string, c: Partial<CheckIn>): CheckIn => ({ date, pain: {}, ...c });

describe('dayReadiness: la tabella del § 3.9 caso per caso', () => {
  const plan = planWithBlock();
  it('controllo mancante → piena', () => {
    expect(dayReadiness(FRIDAY, state(plan)).variant).toBe('piena');
  });
  it('sonno: 7 h e qualità 3 → 0; 6 h 30 → 1; meno di 6 h → 2; qualità 1 → 2', () => {
    expect(dayReadiness(FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { sleepHours: 7.2, sleepQuality: 3, energy: 7 }) })).signals.sleep).toBe(0);
    expect(dayReadiness(FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { sleepHours: 6.5, energy: 7 }) })).signals.sleep).toBe(1);
    expect(dayReadiness(FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { sleepHours: 5.8, energy: 7 }) })).signals.sleep).toBe(2);
    expect(dayReadiness(FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { sleepHours: 8, sleepQuality: 1, energy: 7 }) })).signals.sleep).toBe(2);
  });
  it('energia con meno di 14 controlli: 6 → 0, 4-5 → 1, 3 → 2; con 14 controlli conta la media personale', () => {
    expect(dayReadiness(FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { energy: 6 }) })).signals.energy).toBe(0);
    expect(dayReadiness(FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { energy: 5 }) })).signals.energy).toBe(1);
    expect(dayReadiness(FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { energy: 3 }) })).signals.energy).toBe(2);
    const history: Record<string, CheckIn> = {};
    for (let i = 1; i <= 20; i++) history[addDays(FRIDAY, -i)] = ci(addDays(FRIDAY, -i), { energy: 4 });
    expect(dayReadiness(FRIDAY, state(plan, { ...history, [FRIDAY]: ci(FRIDAY, { energy: 4 }) })).signals.energy).toBe(0);
    expect(dayReadiness(FRIDAY, state(plan, { ...history, [FRIDAY]: ci(FRIDAY, { energy: 2 }) })).signals.energy).toBe(1);
    expect(dayReadiness(FRIDAY, state(plan, { ...history, [FRIDAY]: ci(FRIDAY, { energy: 1 }) })).signals.energy).toBe(2);
  });
  it('calcio del giorno prima solo per le sedute con le gambe', () => {
    const c = { [FRIDAY]: ci(FRIDAY, { sleepHours: 8, energy: 7 }) };
    const logs = [{ id: 'f', date: addDays(FRIDAY, -1), kind: 'allenamento' as const, durationMin: 90, rpe: 7 }];
    expect(dayReadiness(FRIDAY, state(plan, c, { footballLogs: logs }), { legs: true }).signals.football).toBe(1);
    expect(dayReadiness(FRIDAY, state(plan, c, { footballLogs: logs }), { legs: false }).signals.football).toBe(0);
  });
  it('somma: 0-1 piena, 2-3 ridotta, 4 o più minima, con i motivi', () => {
    const r = dayReadiness(FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { sleepHours: 5.83, energy: 5 }) }));
    expect(r.points).toBe(3);
    expect(r.variant).toBe('ridotta');
    // Spazi indivisibili nella durata, come in tutta l'app.
    expect(readinessText(r)?.replace(/\u00a0/g, ' ')).toBe('Oggi ridotta: 5 h 50 a letto ed energia bassa');
    expect(dayReadiness(FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { sleepHours: 5, energy: 3 }) })).variant).toBe('minima');
    expect(dayReadiness(FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { sleepHours: 6.8, energy: 8 }) })).variant).toBe('piena');
  });
  it('regola del dolore a «riduci» → mai piena; tibia a soglia degli impatti + 2 → minima senza impatti', () => {
    const c = { [FRIDAY]: ci(FRIDAY, { sleepHours: 8, energy: 8, pain: { Gomito: 7 } }) };
    expect(painGate(state(plan, c), FRIDAY).level).toBe('riduci');
    expect(dayReadiness(FRIDAY, state(plan, c)).variant).toBe('ridotta');
    const t = { [FRIDAY]: ci(FRIDAY, { sleepHours: 8, energy: 8, pain: { Tibia: 4 } }) };
    const r = dayReadiness(FRIDAY, state(plan, t));
    expect(r.variant).toBe('minima');
    expect(r.noImpact).toBe(true);
  });
  it('due notti di fila sotto le 6 ore → almeno ridotta', () => {
    const c = { [FRIDAY]: ci(FRIDAY, { sleepHours: 5.9, energy: 9, sleepQuality: 4 }), [addDays(FRIDAY, -1)]: ci(addDays(FRIDAY, -1), { sleepHours: 5.5 }) };
    expect(dayReadiness(FRIDAY, state(plan, c)).variant).toBe('ridotta');
  });
});

describe('varianti della seduta', () => {
  it('ridotta: serie del blocco principale × 0,67 all’intero più vicino, RIR +1, contatti −50%, prevenzione invariata', () => {
    const base = SESSIONS.B;
    const r = reducedSession(base);
    const main = base.blocks.find((b) => /principale/i.test(b.title))!;
    const rmain = r.blocks.find((b) => /principale/i.test(b.title))!;
    main.items.forEach((it, i) => {
      expect(rmain.items[i].sets).toBe(Math.max(1, Math.round(it.sets * 0.67)));
      if (it.rir !== undefined) expect(rmain.items[i].rir).toBe(it.rir + 1);
    });
    const prev = base.blocks.find((b) => /prevenzione/i.test(b.title))!;
    expect(r.blocks.find((b) => /prevenzione/i.test(b.title))!.items).toEqual(prev.items);
    const balzi = r.blocks[0].items.find((it) => it.exerciseId === 'balzi-del-pattinatore')!;
    expect(balzi.repMax).toBe(4);
    const cut = 1 - r.estMin / base.estMin;
    expect(cut).toBeGreaterThan(0.15);
  });

  it('minima: solo i pavimenti non ancora fatti e la mobilità, 15-20 minuti al massimo', () => {
    const m = minimalSession(SESSIONS.B, new Set(['polpacci']));
    expect(m.blocks.some((b) => /principale/i.test(b.title))).toBe(false);
    const ids = m.blocks.flatMap((b) => b.items.map((it) => it.exerciseId));
    expect(ids).not.toContain('polpacci-in-piedi-macchina');
    expect(ids).toContain('tibiale-anteriore-seduto');
    for (const it of m.blocks.flatMap((b) => b.items)) expect(floorOf(it) !== 'forza-gambe').toBe(true);
    expect(sessionDuration(m).total).toBeLessThanOrEqual(20);
  });

  it('minima con i pavimenti già fatti: si completa con mobilità, riscaldamento e cyclette facile senza impatto, 15-20 minuti', () => {
    const all = new Set<FloorId>(['nordic', 'copenhagen', 'polpacci', 'tibiale', 'polso', 'forza-gambe']);
    for (const slot of ['A', 'B', 'C'] as const) {
      const m = minimalSession(SESSIONS[slot], all);
      const items = m.blocks.flatMap((b) => b.items);
      for (const it of items) expect(isImpactItem(it.exerciseId)).toBe(false);
      const own = items.reduce((t, it) => t + estimateItemSec(it), 0) / 60;
      expect(own).toBeLessThanOrEqual(20);
      // Con mobilità e cyclette facile si arriva ai 15 minuti anche senza pavimenti da fare.
      expect(own).toBeGreaterThanOrEqual(15);
    }
  });
});

describe('daySession (§ 3.9, § 3.10, § 13.7 test 35 e 60)', () => {
  it('senza blocco e senza fermo: la seduta fissa, piena, lo stesso oggetto', () => {
    const plan = defaultPlan('2026-11-02');
    const d = daySession('B', FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { sleepHours: 4, energy: 2 }) }))!;
    expect(d.session).toBe(SESSIONS.B);
    expect(d.variant).toBe('piena');
    expect(d.reasons).toEqual([]);
  });

  it('con un blocco: la variante del giorno con i motivi; la minima tiene i pavimenti non fatti', () => {
    const plan = planWithBlock();
    const bad = { [FRIDAY]: ci(FRIDAY, { sleepHours: 5, energy: 2 }) };
    const d = daySession('B', FRIDAY, state(plan, bad))!;
    expect(d.variant).toBe('minima');
    expect(d.reasons.length).toBeGreaterThan(0);
    const floors = d.session.blocks.flatMap((b) => b.items).map(floorOf).filter(Boolean);
    expect(floors.length).toBeGreaterThan(0);
    // Stessi ingressi, stesso oggetto.
    expect(daySession('B', FRIDAY, state(plan, bad))!.session).toBe(d.session);
    const ok = daySession('B', FRIDAY, state(plan, { [FRIDAY]: ci(FRIDAY, { sleepHours: 8, energy: 8 }) }))!;
    expect(ok.variant).toBe('piena');
    expect(ok.session).toBe(sessionFor('B', FRIDAY, plan));
  });

  it('fermo degli impatti: livello 0 da subito, oggi compreso, anche nelle sedute fisse', () => {
    const plan = { ...defaultPlan('2026-11-02'), impactHold: { site: 'Tibia', since: FRIDAY } };
    const d = daySession('B', FRIDAY, state(plan))!;
    for (const it of d.session.blocks.flatMap((b) => b.items)) expect(impactLevelOf(EXERCISES[it.exerciseId])).toBe(0);
    expect(d.reasons).toContain('impatti fermi');
    // Il giorno prima del fermo niente cambia.
    expect(daySession('B', addDays(FRIDAY, -7), state(plan))!.session).toBe(SESSIONS.B);
    // La regola del dolore dice «niente impatti» con la frase di sempre nel lettore.
    const gate = painGate(state(plan), FRIDAY, { sessionId: 'B' });
    expect(gate.impact).toBe(true);
    expect(gate.impactSite).toBe('Tibia');
    expect(gate.message).toMatch(/Niente balzi e salti oggi/);
    // Con un blocco generato e il fermo.
    const withBlock = { ...planWithBlock(), impactHold: { site: 'Tibia', since: MONDAY } };
    for (const slot of Object.keys(withBlock.program!.sessions)) {
      const s = daySession(slot, addDays(MONDAY, slot === 'A' ? 1 : slot === 'B' ? 4 : 5), state(withBlock));
      for (const it of s?.session.blocks.flatMap((b) => b.items) ?? []) expect(impactLevelOf(EXERCISES[it.exerciseId]), it.exerciseId).toBe(0);
    }
  });

  it('partita giocata poco: richiamo in cyclette in coda alla seduta del giorno dopo', () => {
    const plan = planWithBlock();
    const logs = [{ id: 'm', date: MONDAY, kind: 'partita' as const, durationMin: 30, rpe: 7 }];
    const d = daySession('A', TUESDAY, state(plan, {}, { footballLogs: logs }))!;
    expect(d.session.blocks[d.session.blocks.length - 1].items).toContain(RECALL_ITEM);
    const full = daySession('A', TUESDAY, state(plan, {}, { footballLogs: [{ ...logs[0], durationMin: 90 }] }))!;
    expect(full.session.blocks.flatMap((b) => b.items)).not.toContain(RECALL_ITEM);
  });

  it('la prova del saltello compare una volta sola: fatta, sparisce dalle sedute dopo', () => {
    const training = { primary: 'rientro' as const, secondary: 'prevenzione' as const, rientro: { site: 'Tibia', stage: 2 as const, since: '2026-11-01', physioOk: true } };
    const plan = planWithBlock({ training });
    const slot = Object.keys(plan.program!.sessions).find((k) => plan.program!.sessions[k].blocks.some((b) => b.items.some((it) => it.exerciseId === 'prova-saltello')))!;
    expect(slot).toBeDefined();
    const before = daySession(slot, FRIDAY, state(plan))!;
    expect(before.session.blocks.some((b) => b.items.some((it) => it.exerciseId === 'prova-saltello'))).toBe(true);
    const done: WorkoutLog = { id: 'w', date: MONDAY, sessionId: slot, durationMin: 50, rpe: 5, pain: {}, exercises: [{ exerciseId: 'prova-saltello', sets: [{ weightKg: 0, reps: 10, done: true }] }] };
    const after = daySession(slot, FRIDAY, state(plan, {}, { workoutLogs: [done] }))!;
    expect(after.session.blocks.some((b) => b.items.some((it) => it.exerciseId === 'prova-saltello'))).toBe(false);
  });
});
