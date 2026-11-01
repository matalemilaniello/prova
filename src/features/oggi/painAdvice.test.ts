import { describe, expect, it } from 'vitest';
import type { AppData, CheckIn, ISODate, WorkoutLog } from '../../domain/types';
import { defaultAppData, defaultPlan } from '../../data/defaults';
import { IMPACT_PAIN_THRESHOLD, painGate } from '../../engine/training';
import { footballPainAdvice } from './painAdvice';
import { testGesture, testSafety } from './painTests';

// Lunedì 9 novembre 2026: partita alle 21:00.
const MON: ISODate = '2026-11-09';

function state(pain: Record<string, number>, workoutLogs: WorkoutLog[] = []): AppData {
  const base = defaultAppData(MON);
  const checkIn: CheckIn = { date: MON, pain };
  return {
    ...base,
    onboarded: true,
    plan: defaultPlan('2026-10-19'),
    profile: { ...base.profile, painSites: ['Tibia'] },
    checkIns: { [MON]: checkIn },
    workoutLogs,
  };
}

function advice(s: AppData) {
  const gate = painGate(s, MON);
  const t = Math.min(s.plan.painThreshold, IMPACT_PAIN_THRESHOLD);
  return { gate, ...footballPainAdvice(gate, 'partita', s.checkIns[MON]?.pain, t) };
}

describe('avviso del dolore nel giorno di partita', () => {
  it('tibia a 3 al controllo di oggi: oltre la soglia degli impatti, stasera niente partita', () => {
    const a = advice(state({ Tibia: 3 }));
    expect(a.gate.level).toBe('ok');
    expect(a.gate.impact).toBe(true);
    expect(a.skip).toBe(true);
    expect(a.footballText).toMatch(/^Stasera niente partita/);
    // Nessun test da rifare: è già stato fatto stamattina.
    expect(a.footballText).not.toMatch(/saltell|rifai/);
  });

  it('tibia a 4: niente partita, non "se giochi"', () => {
    const a = advice(state({ Tibia: 4 }));
    expect(a.gate.level).toBe('mantieni');
    expect(a.skip).toBe(true);
    expect(a.footballText).toMatch(/^Stasera niente partita/);
    expect(a.footballText).not.toMatch(/se giochi/i);
    // La palestra vieta i balzi: la partita non può avere una regola più larga.
    expect(a.painText).toMatch(/balzi/);
  });

  it('dolore forte: niente partita e messaggio al fisioterapista una volta sola', () => {
    const a = advice(state({ Tibia: 6 }));
    expect(a.gate.level).toBe('riduci');
    expect(a.skip).toBe(true);
    expect(`${a.painText} ${a.footballText}`.match(/fisioterapista/g)).toHaveLength(1);
  });

  it('blocco dal dolore di fine seduta, oggi entro la soglia: si rifà il test prima di uscire', () => {
    const w: WorkoutLog = { id: 'w1', date: '2026-11-07', sessionId: 'C', durationMin: 40, rpe: 5, pain: { Tibia: 3 }, exercises: [] };
    const a = advice(state({ Tibia: 1 }, [w]));
    expect(a.gate.impact).toBe(true);
    expect(a.skip).toBe(false);
    expect(a.footballText).toBe(`Prima di uscire rifai il test, ${testGesture('Tibia')}: se il dolore supera 2, salta la partita.`);
  });

  it('partita senza palestra: niente consigli sui carichi, il fisioterapista una volta sola', () => {
    const s = state({ Tibia: 4 });
    const gate = painGate(s, MON);
    const withGym = footballPainAdvice(gate, 'partita', s.checkIns[MON].pain, 2);
    expect(`${withGym.painText} ${withGym.footballText}`.match(/fisioterapista/g)).toHaveLength(1);
    expect(withGym.painText).not.toMatch(/se domani è ancora sopra soglia/i);
    const noGym = footballPainAdvice(gate, 'partita', s.checkIns[MON].pain, 2, undefined, false);
    expect(noGym.painText).toBe('');
    expect(noGym.footballText).toMatch(/^Stasera niente partita/);
    expect(noGym.skip).toBe(true);
    // Senza una lettura di oggi sopra soglia il rinvio al fisioterapista della palestra resta l'unico: non si toglie.
    const w: WorkoutLog = { id: 'w1', date: '2026-11-07', sessionId: 'C', durationMin: 40, rpe: 5, pain: { Tibia: 3 }, exercises: [] };
    const later = state({ Tibia: 1 }, [w]);
    const g2 = painGate(later, MON);
    expect(footballPainAdvice(g2, 'partita', later.checkIns[MON].pain, 2).painText).toBe(g2.level === 'ok' ? 'Negli impatti la soglia è più bassa, 2 su 10: niente balzi in palestra.' : g2.message);
  });

  it('senza calcio o senza blocco degli impatti il testo è quello della palestra', () => {
    const s = state({ Tibia: 1 });
    const gate = painGate(s, MON);
    expect(footballPainAdvice(gate, 'partita', s.checkIns[MON].pain, 2)).toEqual({ painText: gate.message, footballText: null, skip: false });
    const s3 = state({ Tibia: 3 });
    expect(footballPainAdvice(painGate(s3, MON), null, s3.checkIns[MON].pain, 2).footballText).toBeNull();
  });
});

describe('gesti di prova', () => {
  it('la tibia ha una regola di sicurezza: se camminare fa male non si salta', () => {
    expect(testGesture('Tibia')).toBe('10 saltelli su una gamba');
    expect(testSafety('Tibia')).toMatch(/non saltare/);
    expect(testSafety('Gomito')).toBeUndefined();
  });

  it('il gesto indicato dal fisioterapista vince su quello predefinito', () => {
    const custom = { Tibia: '20 secondi in appoggio monopodalico' };
    expect(testGesture('Tibia', custom)).toBe('20 secondi in appoggio monopodalico');
    expect(testSafety('Tibia', custom)).toBeUndefined();
    expect(testGesture('Gomito', custom)).toBe(testGesture('Gomito'));
  });
});
