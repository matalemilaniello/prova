/**
 * Criteri di fine blocco (docs/FASE2.md § 3.11, § 13.7 test 36 e 63) e rientro guidato dal dolore (§ 3.8, test 36 e 59).
 * Diari inventati.
 */
import { describe, expect, it } from 'vitest';
import type { CheckIn, ExerciseLog, Plan, Program, ReturnPlan, WorkoutLog } from '../../domain/types';
import { defaultPlan } from '../../data/defaults';
import { addDays } from '../dates';
import { buildBlock } from './build';
import { plyoLevel, sessionContacts } from './limits';
import { blockReview, blockSummaryOf, nextBlockPlan, sequenceSuggestion } from './blockReview';
import { activeReturn, impactHoldActive, returnAdvice, returnStageOf, returnStagesFor, returnZone } from './returnStages';

const START = '2026-11-09';
const plan0 = (): Plan => defaultPlan('2026-11-02');
const program = (): Program =>
  buildBlock({ monday: START, plan: { ...plan0(), training: { presetId: 'forte', primary: 'forza', secondary: 'prevenzione' } }, workoutLogs: [], footballLogs: [], checkIns: {}, physio: { exercises: [], prescriptions: [] }, painSites: ['Tibia'], attempt: 0 }).program!;

/** Sedute fatte nei giorni della settimana tipo con palestra non facoltativa, per `weeks` settimane; carico che cresce. */
function logs(share: number, growth: number, weeks = 4): WorkoutLog[] {
  const out: WorkoutLog[] = [];
  const week = plan0().week;
  let n = 0;
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < 7; i++) {
      const day = week.find((d) => d.weekday === i);
      if (!day?.gymSessionId || day.gymOptional) continue;
      n++;
      if ((n % 10) / 10 >= share) continue;
      const date = addDays(START, 7 * w + i);
      const load = 100 * (1 + (w >= 1 ? growth : 0));
      const ex = (id: string, kg: number): ExerciseLog => ({ exerciseId: id, sets: [{ weightKg: kg, reps: 5, done: true }, { weightKg: kg, reps: 5, done: true }] });
      out.push({
        id: `w${date}`,
        date,
        sessionId: day.gymSessionId,
        durationMin: 55,
        rpe: 7,
        pain: {},
        exercises: day.gymSessionId === 'B' ? [ex('stacco-trap-bar', load), ex('nordic-hamstring-curl', 0), ex('polpacci-in-piedi-macchina', 60), ex('tibiale-anteriore-seduto', 5)] : [ex('panca-manubri-presa-neutra', load / 4), ex('copenhagen-leva-corta', 0), ex('polpacci-seduto', 40)],
      });
    }
  }
  return out;
}

const state = (workoutLogs: WorkoutLog[], checkIns: Record<string, CheckIn> = {}) => ({ plan: plan0(), workoutLogs, checkIns, painSites: ['Tibia'] });

describe('blockReview: la tabella di decisione, in ordine (§ 3.11)', () => {
  const p = program();

  it('costanza ≥ 80% e carichi +2,5% o più → avanza', () => {
    const r = blockReview(p, state(logs(1, 0.05)));
    expect(r.adherence).toBe(1);
    expect(r.loadChange).toBeGreaterThanOrEqual(0.025);
    expect(r.verdict).toBe('avanza');
  });

  it('costanza ≥ 80% e carichi stabili → consolida, con la variante diversa', () => {
    const r = blockReview(p, state(logs(1, 0)));
    expect(r.verdict).toBe('consolida');
    expect(nextBlockPlan(r, { phase: 'stagione' }).variantChange).toBe(true);
  });

  it('costanza tra 60 e 80% → consolida; sotto 60% → meno ma fatto', () => {
    expect(blockReview(p, state(logs(0.7, 0.1))).verdict).toBe('consolida');
    const low = blockReview(p, state(logs(0.3, 0.1)));
    expect(low.adherence).toBeLessThan(0.6);
    expect(low.verdict).toBe('meno-ma-fatto');
    const next = nextBlockPlan(low, { phase: 'stagione' });
    expect(next.sessionsDelta).toBe(-1);
    expect(next.minutesDelta).toBe(-15);
  });

  it('carichi sotto −2,5% → alleggerisci: volume −20% e una settimana leggera in più', () => {
    const r = blockReview(p, state(logs(1, -0.1)));
    expect(r.verdict).toBe('alleggerisci');
    expect(nextBlockPlan(r, { phase: 'stagione' })).toMatchObject({ volumeFactor: 0.8, extraLightWeek: true });
  });

  it('sonno: tempo a letto medio sotto 6 h 30 → consolida senza aumenti', () => {
    const c: Record<string, CheckIn> = {};
    for (let i = 0; i < 28; i++) c[addDays(START, i)] = { date: addDays(START, i), pain: {}, sleepHours: 6 };
    const r = blockReview(p, state(logs(1, 0.1), c));
    expect(r.verdict).toBe('consolida');
    expect(nextBlockPlan(r, { phase: 'stagione' }).noVolumeIncrease).toBe(true);
  });

  it('dolore: 4 giorni sopra soglia nelle ultime 2 settimane → rientro; 7 giorni → rientro principale', () => {
    const c: Record<string, CheckIn> = {};
    for (let i = 14; i < 28; i++) c[addDays(START, i)] = { date: addDays(START, i), pain: { Tibia: i % 3 === 0 ? 3 : 1 } };
    const r = blockReview(p, state(logs(1, 0.1), c));
    expect(r.verdict).toBe('rientro');
    expect(r.rientro).toEqual({ site: 'Tibia', primary: false });
    const next = nextBlockPlan(r, { phase: 'stagione' });
    expect(next).toMatchObject({ impactLevelDelta: -1, contactsFactor: 0.5 });
    for (let i = 0; i < 28; i++) c[addDays(START, i)] = { date: addDays(START, i), pain: { Tibia: i % 2 === 0 ? 3 : 1 } };
    expect(blockReview(p, state(logs(1, 0.1), c)).rientro?.primary).toBe(true);
  });

  it('una seduta segnata tutta «fatta» senza carico conta per la costanza e per i pavimenti (63)', () => {
    const zero = logs(1, 0).map((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, weightKg: 0 })) })) }));
    const r = blockReview(p, state(zero));
    expect(r.adherence).toBe(1);
    expect(r.floorsShare).toBeGreaterThan(0.6);
  });

  it('riepilogo da salvare con il carico previsto più alto', () => {
    const r = blockReview(p, state(logs(1, 0.05)));
    expect(blockSummaryOf(r, p, 2643.4)).toMatchObject({ blockId: p.blockId, from: START, to: addDays(START, 27), verdict: 'avanza', adherence: 1, peakLoad: 2643 });
  });
});

describe('dopo il riepilogo, il blocco nuovo segue il verdetto (36)', () => {
  const plan = { ...plan0(), training: { presetId: 'forte', primary: 'forza' as const, secondary: 'prevenzione' as const } };
  const p = program();
  const next = '2026-12-07';
  const build = (workoutLogs: WorkoutLog[], checkIns: Record<string, CheckIn> = {}) =>
    buildBlock({ monday: next, plan: { ...plan, program: p }, workoutLogs, footballLogs: [], checkIns, physio: { exercises: [], prescriptions: [] }, painSites: ['Tibia'], attempt: 0 });

  it('costanza sotto il 60%: sedute e durata mai in aumento', () => {
    const res = build(logs(0.3, 0));
    expect(Object.keys(res.program!.sessions).length).toBeLessThanOrEqual(Object.keys(p.sessions).length - 1);
    for (const [slot, s] of Object.entries(res.program!.sessions)) if (p.sessions[slot]) expect(s.estMin).toBeLessThanOrEqual(p.sessions[slot].estMin);
    expect(res.reasons.join(' ')).toMatch(/una seduta in meno/);
  });

  it('dolore in peggioramento: livello d’impatto mai in aumento e contatti ≤ 0,5 × blocco prima', () => {
    const c: Record<string, CheckIn> = {};
    for (let i = 14; i < 28; i++) c[addDays(START, i)] = { date: addDays(START, i), pain: { Tibia: i % 3 === 0 ? 3 : 1 } };
    const res = build(logs(1, 0.1), c);
    expect(res.training?.rientro?.site).toBe('Tibia');
    const contacts = (q: Program) => Math.max(0, ...Object.values(q.sessions).map(sessionContacts));
    expect(contacts(res.program!)).toBeLessThanOrEqual(Math.floor(contacts(p) * 0.5));
    expect(Math.max(0, ...Object.values(res.program!.sessions).map((s) => plyoLevel(s)))).toBeLessThanOrEqual(Math.max(0, ...Object.values(p.sessions).map((s) => plyoLevel(s))));
  });

  it('dopo 2 blocchi con la stessa principale si propone la successiva della sequenza', () => {
    expect(sequenceSuggestion({ primary: 'forza' }, [{ primary: 'forza' }, { primary: 'forza' }], 'stagione')).toEqual({ primary: 'forza', secondary: 'potenza' });
    expect(sequenceSuggestion({ primary: 'forza' }, [{ primary: 'potenza' }, { primary: 'forza' }], 'stagione')).toBeNull();
    expect(sequenceSuggestion({ primary: 'ipertrofia', secondary: 'forza' }, [{ primary: 'ipertrofia' }, { primary: 'ipertrofia' }], 'pausa')).toEqual({ primary: 'forza', secondary: 'potenza' });
    expect(sequenceSuggestion({ primary: 'potenza' }, [{ primary: 'potenza' }, { primary: 'potenza' }], 'precampionato')).toBeNull();
  });
});

describe('rientro guidato dal dolore (§ 3.8)', () => {
  const tibia = (stage: ReturnPlan['stage'], physioOk?: boolean): ReturnPlan => ({ site: 'Tibia', stage, since: '2026-10-01', ...(physioOk ? { physioOk } : {}) });
  const rplan = (r: ReturnPlan) => ({ ...plan0(), training: { primary: 'rientro' as const, rientro: r } });

  it('stadi della zona sotto il ginocchio con livello e eccezioni', () => {
    const st = returnStagesFor('Tibia');
    expect(st.map((s) => s.maxImpactLevel)).toEqual([0, 1, 1, 2, 3]);
    expect(st[2].allowed).toEqual(['cammino-corsa', 'prova-saltello']);
    expect(st[3].allowed).toEqual(['corsa-facile']);
    expect(st.filter((s) => s.needsPhysio).map((s) => s.stage)).toEqual([2, 3, 4]);
    expect(returnZone('Flessori')).toBe('flessori');
    expect(returnZone('Gomito')).toBe('gomito');
    expect(returnZone('Adduttori')).toBe('adduttori');
    expect(returnStagesFor('Flessori')[4].speed).toBe(true);
  });

  it('si scende da soli; si sale con il criterio e, negli stadi con impatti o corsa, solo con il via libera', () => {
    const c: Record<string, CheckIn> = {};
    for (let i = 1; i <= 8; i++) c[addDays(START, -i)] = { date: addDays(START, -i), pain: { Tibia: 1 } };
    // Stadio 0 → 1: 7 mattine entro la soglia, senza via libera (lo stadio 1 non chiede il fisioterapista).
    expect(returnAdvice(tibia(0), START, { plan: rplan(tibia(0)), checkIns: c }).stage).toBe(1);
    // Stadio 1 → 2 chiede il via libera.
    const sessions: WorkoutLog[] = [3, 5].map((d) => ({ id: `w${d}`, date: addDays(START, -d), sessionId: 'B', durationMin: 50, rpe: 6, pain: { Tibia: 1 }, exercises: [] }));
    const wait = returnAdvice(tibia(1), START, { plan: rplan(tibia(1)), checkIns: c, workoutLogs: sessions });
    expect(wait).toMatchObject({ stage: 1, waitingPhysio: true });
    expect(returnAdvice(tibia(1, true), START, { plan: rplan(tibia(1, true)), checkIns: c, workoutLogs: sessions }).stage).toBe(2);
    // Dolore sopra la soglia degli impatti in 2 mattine: un passo indietro.
    const hurt = { ...c, [addDays(START, -1)]: { date: addDays(START, -1), pain: { Tibia: 3 } }, [addDays(START, -2)]: { date: addDays(START, -2), pain: { Tibia: 4 } } };
    expect(returnAdvice(tibia(3, true), START, { plan: rplan(tibia(3, true)), checkIns: hurt }).stage).toBe(2);
    // Senza physioOk mai uno stadio con impatti o corsa.
    for (const s of [1, 2, 3] as const) {
      const a = returnAdvice(tibia(s), START, { plan: rplan(tibia(s)), checkIns: c, workoutLogs: sessions });
      if (a.stage > s) expect(returnStagesFor('Tibia')[a.stage].needsPhysio).toBe(false);
    }
  });

  it('segnali d’allarme: il fermo riporta il rientro a 0 e vale da subito', () => {
    const plan = { ...rplan(tibia(3, true)), impactHold: { site: 'Tibia', since: START } };
    expect(impactHoldActive(plan, START)).toBe(true);
    expect(impactHoldActive(plan, addDays(START, -1))).toBe(false);
    expect(returnAdvice(tibia(3, true), START, { plan }).stage).toBe(0);
    expect(impactHoldActive({ impactHold: { site: 'Tibia', since: 'non è una data' } }, START)).toBe(true);
    expect(activeReturn(plan)?.site).toBe('Tibia');
    expect(returnStageOf(tibia(9 as ReturnPlan['stage'])).stage).toBe(4);
  });
});
