/** La settimana intorno alla partita (docs/FASE2.md § 3.2): distanze, posizione delle sedute, R1-R10. Dati inventati. */
import { describe, expect, it } from 'vitest';
import type { Plan, Program, ScheduleDay, WorkoutSession } from '../../domain/types';
import { DEFAULT_WEEK, defaultPlan } from '../../data/defaults';
import { DOSE_PRESETS, SESSIONS } from '../../data/sessions';
import { BASE_DOSE, DELOAD_DOSE } from './program';
import {
  dayOf,
  matchWeekday,
  mdDistance,
  mdLabel,
  placeSessions,
  plannedLoad,
  sessionRpe,
  timeFor,
  validateWeek,
  type SlotSpec,
} from './week';

const plan0 = (): Plan => defaultPlan('2026-11-02');
const MONDAY = '2026-11-09';

function program(sessions: Record<string, WorkoutSession>, phase: Program['phase'] = 'stagione'): Program {
  return { blockId: 'prova', start: MONDAY, weeks: ['carico', 'scarico'], dose: [BASE_DOSE, DELOAD_DOSE], phase, stage: phase === 'stagione' ? 'stagione' : 'sviluppo', primary: 'forza', sessions };
}

const codes = (vs: { code: string; hard: boolean }[]) => [...new Set(vs.filter((x) => x.hard).map((x) => x.code))].sort();

describe('distanza dalla partita', () => {
  it('con la settimana predefinita', () => {
    const week = DEFAULT_WEEK;
    expect(matchWeekday(week)).toBe(0);
    expect([0, 1, 2, 3, 4, 5, 6].map((wd) => mdLabel(mdDistance(wd, week)))).toEqual(['MD', 'MD+1', 'MD+2', 'MD+3', 'MD−3', 'MD−2', 'MD−1']);
    expect(mdDistance(3, week.map((d) => ({ ...d, football: undefined })))).toBeNull();
  });
});

describe('posizione delle sedute (R1-R7, lavoro)', () => {
  const specs: SlotSpec[] = [
    { slot: 'B', kind: 'gambe', heavyLegs: true, minutes: 65 },
    { slot: 'A', kind: 'alto', minutes: 65 },
    { slot: 'C', kind: 'leggera', optional: true, minutes: 65 },
  ];

  it('la settimana predefinita resta com’è', () => {
    const r = placeSessions(DEFAULT_WEEK, specs, { plan: plan0() });
    expect(r.placements.map((p) => [p.slot, p.weekday, p.time])).toEqual([
      ['B', 4, '17:00'],
      ['A', 1, '17:00'],
      ['C', 5, '11:00'],
    ]);
    expect(r.moved).toEqual([]);
    expect(r.dropped).toEqual([]);
  });

  it('la partita si sposta: le sedute seguono la distanza dalla partita', () => {
    // Partita il sabato: B a MD−3 (mercoledì), A a MD+1 (domenica).
    const week = DEFAULT_WEEK.map((d) => ({ ...d, weekday: ((d.weekday + 5) % 7) as ScheduleDay['weekday'] })).sort((a, b) => a.weekday - b.weekday);
    const r = placeSessions(week, specs, { plan: plan0() });
    const b = r.placements.find((p) => p.slot === 'B')!;
    expect(mdDistance(b.weekday, week)).toBe(4);
    const a = r.placements.find((p) => p.slot === 'A')!;
    expect([1, 2, 3, 4]).toContain(mdDistance(a.weekday, week));
  });

  it('fuori dai blocchi di lavoro: la seduta va dopo il lavoro, con il margine', () => {
    const week = DEFAULT_WEEK.map((d) => (d.weekday === 4 ? { ...d, work: [{ from: '09:00', to: '18:30' }] } : d));
    const r = placeSessions(week, specs, { plan: plan0() });
    const b = r.placements.find((p) => p.slot === 'B')!;
    expect(b.weekday).toBe(4);
    expect(b.time).toBe('19:00');
    expect(r.moved).toContain('B');
  });

  it('un giorno con il calcio: niente gambe; la parte superiore solo 4 ore prima', () => {
    const day: ScheduleDay = { weekday: 2, dayType: 'calcio', football: { kind: 'calcetto', time: '21:00', durationMin: 60 } };
    expect(timeFor(day, undefined, { kind: 'gambe', heavyLegs: true, minutes: 60 }, { plan: plan0() }, [])).toBeNull();
    const t = timeFor(day, undefined, { kind: 'alto', minutes: 60 }, { plan: plan0() }, ['18:00']);
    expect(t).toBe('12:30');
  });

  it('gambe pesanti mai nelle 24 ore prima del calcio', () => {
    const day: ScheduleDay = { weekday: 3, dayType: 'riposo' };
    const next: ScheduleDay = { weekday: 4, dayType: 'calcio', football: { kind: 'allenamento', time: '18:00', durationMin: 90 } };
    // 17:00 + 65 minuti finisce alle 18:05: meno di 24 ore prima delle 18:00 del giorno dopo.
    expect(timeFor(day, next, { kind: 'gambe', heavyLegs: true, minutes: 65 }, { plan: plan0() }, ['17:00'])).toBe('12:30');
    expect(timeFor(day, next, { kind: 'alto', minutes: 65 }, { plan: plan0() }, ['17:00'])).toBe('17:00');
  });

  it('una seduta senza un giorno ammesso si toglie', () => {
    const week = DEFAULT_WEEK.map((d) => (d.weekday === 4 ? { ...d, work: [{ from: '07:00', to: '22:00' }] } : d));
    const r = placeSessions(week, specs, { plan: plan0() });
    expect(r.dropped).toContain('B');
  });
});

describe('validateWeek: la rete dopo il generatore', () => {
  const fixed = { A: SESSIONS.A, B: SESSIONS.B, C: SESSIONS.C };

  it('le sedute fisse nella settimana predefinita: solo R9 (il Nordic delle sedute fisse sta a metà della B)', () => {
    const p = program(fixed);
    const plan = { ...plan0(), program: p };
    expect(codes(validateWeek(plan, p, 1, { painSites: ['Tibia', 'Gomito'] })).filter((c) => /^R\d$/.test(c))).toEqual(['R9']);
  });

  it('R1, R4, R5, R6, R2: sedute nei giorni sbagliati', () => {
    const p = program(fixed);
    const week = DEFAULT_WEEK.map((d) => {
      if (d.weekday === 0) return { ...d, gymSessionId: 'A', gymTime: '10:00' };
      if (d.weekday === 1) return { ...d, gymSessionId: 'B' };
      if (d.weekday === 2) return { ...d, gymSessionId: 'C', gymTime: '18:00' };
      if (d.weekday === 6) return { ...d, gymSessionId: 'A', gymTime: '10:00' };
      return { ...d, gymSessionId: undefined, gymTime: undefined };
    });
    const got = codes(validateWeek({ ...plan0(), week, program: p }, p, 1));
    expect(got).toEqual(expect.arrayContaining(['R1', 'R2', 'R4', 'R5', 'R6']));
  });

  it('R3: alla vigilia della vigilia solo una seduta leggera; R7: niente gambe pesanti prima del calcio', () => {
    const heavy: WorkoutSession = { ...SESSIONS.B, blocks: SESSIONS.B.blocks.map((b) => ({ ...b })) };
    const p = program({ B: heavy });
    const week = DEFAULT_WEEK.map((d) => (d.weekday === 5 ? { ...d, gymSessionId: 'B', gymOptional: undefined } : { ...d, gymSessionId: undefined, gymTime: undefined }));
    expect(codes(validateWeek({ ...plan0(), week, program: p }, p, 1))).toEqual(expect.arrayContaining(['R2', 'R3']));
    const week2 = DEFAULT_WEEK.map((d) => (d.weekday === 2 ? { ...d, football: undefined, gymSessionId: 'B', gymTime: '21:00' } : { ...d, gymSessionId: undefined, gymTime: undefined }));
    expect(codes(validateWeek({ ...plan0(), week: week2, program: p }, p, 1))).toContain('R7');
  });

  it('R8: dopo due giorni di fila con impatti, niente impatti', () => {
    const p = program(fixed);
    const plan = { ...plan0(), program: p };
    // Il venerdì segue mercoledì e giovedì con il calcio: la B ha i balzi del riscaldamento.
    expect(codes(validateWeek(plan, p, 1, { r8: true }))).toContain('R8');
    expect(codes(validateWeek(plan, p, 1, {}))).not.toContain('R8');
  });

  it('R9: sprint e salti prima della forza, Nordic e Copenhagen in fondo', () => {
    const bad: WorkoutSession = {
      ...SESSIONS.B,
      blocks: [
        { title: 'Blocco principale', items: [{ ...DOSE_PRESETS['stacco-trap-bar'], rir: 2 }, DOSE_PRESETS['nordic-hamstring-curl'], DOSE_PRESETS['polpacci-in-piedi-macchina']] },
        { title: 'Salti e lanci', items: [DOSE_PRESETS['salto-sul-box']] },
      ],
    };
    const p = program({ B: bad });
    const week = DEFAULT_WEEK.map((d) => (d.weekday === 4 ? d : { ...d, gymSessionId: undefined, gymTime: undefined }));
    const got = validateWeek({ ...plan0(), week, program: p }, p, 1).filter((v) => v.code === 'R9');
    expect(got.length).toBe(2);
  });

  it('livello, contatti, spazio, lavoro, pavimenti e R10 come avviso', () => {
    const jumps: WorkoutSession = { ...SESSIONS.B, blocks: [...SESSIONS.B.blocks, { title: 'Salti', items: [{ ...DOSE_PRESETS['salti-ostacolini'], sets: 6, repMax: 8 }, DOSE_PRESETS['allunghi']] }] };
    const p = program({ B: jumps });
    const week = DEFAULT_WEEK.map((d) => (d.weekday === 4 ? { ...d, work: [{ from: '16:00', to: '20:00' }] } : { ...d, gymSessionId: undefined, gymTime: undefined }));
    const vs = validateWeek({ ...plan0(), week, program: p }, p, 1, { reference: 500 });
    expect(codes(vs)).toEqual(expect.arrayContaining(['contatti-seduta', 'contatti-settimana', 'livello', 'spazio', 'lavoro', 'pavimento']));
    const r10 = vs.find((x) => x.code === 'R10')!;
    expect(r10.hard).toBe(false);
    expect(validateWeek({ ...plan0(), week, program: p }, p, 1, { reference: 500, floorsOnly: true }).some((x) => x.code === 'R10')).toBe(false);
  });
});

describe('plannedLoad (R10, previsto)', () => {
  it('la settimana leggera toglie la facoltativa, lo scarico accorcia le sedute', () => {
    const plan = plan0();
    const base = plannedLoad(MONDAY, plan);
    const light = plannedLoad(MONDAY, { ...plan, weekOverrides: { [MONDAY]: 'leggera' } });
    expect(light.controllable).toBe(base.controllable - SESSIONS.C.estMin * 7);
    const deload = plannedLoad(MONDAY, { ...plan, weekOverrides: { [MONDAY]: 'scarico' } });
    expect(deload.controllable).toBeLessThan(base.controllable);
    expect(deload.football).toBe(base.football);
  });

  it('la RPE scritta negli esercizi vale per corsa e condizionamento', () => {
    const run: WorkoutSession = { id: 'R', name: 'Uscita facile', subtitle: '', estMin: 30, focus: '', blocks: [{ title: 'Corsa', items: [DOSE_PRESETS['corsa-facile']] }] };
    expect(sessionRpe(run)).toBe(5);
    expect(sessionRpe(SESSIONS.A)).toBe(7);
    expect(dayOf(DEFAULT_WEEK, 4)?.gymSessionId).toBe('B');
  });
});
