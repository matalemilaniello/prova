import { describe, expect, it } from 'vitest';
import type { SessionExercise, WorkoutSession } from '../../domain/types';
import { DOSE_PRESETS, SESSIONS } from '../../data/sessions';
import { defaultPlan } from '../../data/defaults';
import { buildPlayerPlan, doseLabel, durationLabel, HOP_TEST_ID, resumeLoad, secondsText } from './lib';

const plain = (s: string) => s.replace(/ /g, ' ');

describe('durationLabel', () => {
  it('senza fisioterapista dà solo i minuti della seduta', () => {
    expect(plain(durationLabel({ own: 55, physio: 0 }))).toBe('55 min');
  });

  it('con il fisioterapista scrive l’unità in entrambe le parti, come Oggi', () => {
    expect(plain(durationLabel({ own: 45, physio: 24 }))).toBe('45 min + 24 min dal fisioterapista');
  });

  it('va a capo solo prima del "+", mai dentro una durata', () => {
    const label = durationLabel({ own: 45, physio: 24 });
    expect(label).toContain('45 min + 24 min');
  });

  it('oltre l’ora usa ore e minuti', () => {
    expect(plain(durationLabel({ own: 65, physio: 20 }))).toBe('1 h 05 + 20 min dal fisioterapista');
  });

  it('la forma breve resta compatta sotto l’ora', () => {
    expect(plain(durationLabel({ own: 45, physio: 24 }, { short: true }))).toBe('45 + 24 min');
    expect(plain(durationLabel({ own: 65, physio: 20 }, { short: true }))).toBe('1 h 05 + 20 min');
  });
});

// ───────────────────────── Fase 2: dosi senza carico, ingresso per esercizio, prova del saltello ─────────────────────────

const dose = (id: string, over: Partial<SessionExercise> = {}): SessionExercise => ({ ...DOSE_PRESETS[id], ...over });

describe('doseLabel delle esercitazioni senza carico (§ 3.7)', () => {
  it('sprint con i metri, intervalli con il lavoro, corsa lunga in minuti', () => {
    expect(plain(doseLabel(dose('accelerazioni-10m')))).toBe('6-8 × 10 m');
    expect(plain(doseLabel(dose('intermittente-15-15')))).toBe('2 × 12-16 × 15 s');
    expect(plain(doseLabel(dose('cyclette-intervalli')))).toBe('4 × 3 min');
    expect(plain(doseLabel(dose('corsa-facile')))).toBe('25-30 min');
  });

  it('le dosi di prima non cambiano', () => {
    expect(doseLabel({ exerciseId: 'x', sets: 3, repMin: 6, repMax: 10, unit: 'reps', restSec: 90, progression: 'doppia' })).toBe('3 × 6-10');
    expect(doseLabel({ exerciseId: 'x', sets: 2, repMin: 30, repMax: 40, unit: 'secondi', restSec: 30, progression: 'nessuna', perSide: true })).toBe('2 × 30-40 s per lato');
    expect(plain(secondsText(45))).toBe('45 s');
    expect(plain(secondsText(120))).toBe('2 min');
  });
});

describe('ripresa dopo una pausa (§ 3.10)', () => {
  const base = dose('squat-macchina');
  const sug = { weightKg: 60, reps: 6, sets: [{ weightKg: 60, reps: 6 }], kind: 'ripetizioni' as const, reason: 'x' };

  it('carico −20% arrotondato all’incremento, solo con il fattore della ripresa', () => {
    const out = resumeLoad(sug, { base, exIntro: { level: 1, loadFactor: 0.8, resume: true } });
    expect(out.weightKg).toBe(50);
    expect(out.sets[0].weightKg).toBe(50);
    expect(out.reason).toContain('−20%');
    expect(resumeLoad(sug, { base, exIntro: { level: 1, loadFactor: 1, resume: false } })).toBe(sug);
    expect(resumeLoad(sug, { base })).toBe(sug);
  });
});

describe('piano del lettore (fase 2)', () => {
  const plan = defaultPlan('2026-11-02');
  const NO_PHYSIO = { exercises: [], prescriptions: [] };
  const withHop: WorkoutSession = {
    ...SESSIONS.A,
    blocks: [...SESSIONS.A.blocks, { title: 'Rientro', items: [dose(HOP_TEST_ID)] }],
  };

  it('la prova del saltello entra nei passi solo dopo il tocco', () => {
    const off = buildPlayerPlan(withHop, NO_PHYSIO, plan, '2026-11-10');
    expect(off.hopTest).toEqual({ present: true, included: false });
    expect(off.items.some((it) => it.item.exerciseId === HOP_TEST_ID)).toBe(false);
    const on = buildPlayerPlan(withHop, NO_PHYSIO, plan, '2026-11-10', { hopTest: true });
    expect(on.hopTest.included).toBe(true);
    expect(on.steps.some((st) => st.kind === 'exercise' && st.item.item.exerciseId === HOP_TEST_ID)).toBe(true);
    // Le chiavi degli altri esercizi non cambiano: una seduta in corso si riprende uguale.
    expect(on.items.filter((it) => !it.hop).map((it) => it.key)).toEqual(off.items.map((it) => it.key));
  });

  it('fase di ingresso per esercizio: una serie in meno solo dove serve', () => {
    const main = SESSIONS.A.blocks.find((b) => /principale/i.test(b.title))!.items;
    const fresh = main[0].exerciseId;
    const p = buildPlayerPlan(SESSIONS.A, NO_PHYSIO, plan, '2026-11-10', {
      introFor: (id) => (id === fresh ? { level: 1, loadFactor: 1, resume: false } : null),
    });
    const first = p.items.find((it) => it.base.exerciseId === fresh)!;
    const other = p.items.find((it) => !it.warmup && it.base.exerciseId === main[1].exerciseId)!;
    expect(first.exIntro?.level).toBe(1);
    expect(first.item.sets).toBe(Math.max(1, first.base.sets - 1));
    expect(p.exIntro).toEqual({ count: 1, resume: false });
    expect(other.item.sets).toBe(other.base.sets);
    expect(p.intro).toBeNull();
  });
});
