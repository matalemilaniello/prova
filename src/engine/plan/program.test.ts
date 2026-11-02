import { beforeEach, describe, expect, it } from 'vitest';
import type { AppData, Plan, Program, SessionExercise, WorkoutSession } from '../../domain/types';
import { DEFAULT_WEEK, defaultAppData, defaultPlan } from '../../data/defaults';
import { EXERCISES } from '../../data/exercises';
import { SESSIONS } from '../../data/sessions';
import { useApp } from '../../state/store';
import { addDays } from '../dates';
import { proposals } from '../review';
import { buildTimeline, gymDuration } from '../timeline';
import { nextPlannedSession, plannedLoadRemaining, plannedSessionFor } from '../training';
import {
  BASE_DOSE,
  DELOAD_DOSE,
  LIGHT_WEEK_MIN_RIR,
  daySession,
  deriveItem,
  deriveSession,
  droppedByOverride,
  programWeekDose,
  sessionFor,
  weekOverrideFor,
} from './program';

// Settimana predefinita: partita lunedì, A martedì, B venerdì, C facoltativa sabato.
const MON = '2026-11-16';
const TUE = '2026-11-17';
const FRI = '2026-11-20';
const SAT = '2026-11-21';
const NEXT_MON = '2026-11-23';

const items = (s: WorkoutSession): SessionExercise[] => s.blocks.flatMap((b) => b.items);
const isImpact = (id: string) => Boolean((EXERCISES[id] as { impact?: boolean } | undefined)?.impact) || /balz|salt|pliometr|hop/i.test(id);

function plan(over: Partial<Plan> = {}): Plan {
  return { ...defaultPlan('2026-10-05'), week: DEFAULT_WEEK, ...over };
}

/** Stato con due sedute B già registrate: niente fase di ingresso, la durata è quella a regime. */
function state(over: Partial<Plan> = {}): AppData {
  const s = defaultAppData('2026-11-15');
  s.plan = plan(over);
  s.workoutLogs = ['2026-10-30', '2026-11-06'].map((date) => ({ id: `w-${date}`, date, sessionId: 'B', durationMin: 50, rpe: 7, pain: {}, exercises: [] }));
  return s;
}

describe('sessionFor senza campi nuovi', () => {
  it('è la seduta fissa dello slot, lo stesso oggetto', () => {
    for (const slot of Object.keys(SESSIONS)) {
      expect(sessionFor(slot, TUE, plan())).toBe(SESSIONS[slot]);
      expect(sessionFor(slot, TUE, { program: undefined, weekOverrides: {} })).toBe(SESSIONS[slot]);
    }
    expect(sessionFor('Z', TUE, plan())).toBeUndefined();
  });

  it('daySession è la seduta piena, senza motivi', () => {
    const s = state();
    expect(daySession('B', FRI, s)).toEqual({ session: SESSIONS.B, variant: 'piena', reasons: [] });
    expect(daySession('Z', FRI, s)).toBeNull();
  });
});

describe('settimane della revisione (§ 3.9)', () => {
  it('scarico: fattori della settimana 4 su tutte le sedute fisse, solo in quella settimana', () => {
    const p = plan({ weekOverrides: { [MON]: 'scarico' } });
    expect(weekOverrideFor(FRI, p)).toBe('scarico');
    expect(weekOverrideFor(NEXT_MON, p)).toBeUndefined();
    for (const slot of ['A', 'B', 'C']) {
      const fixed = SESSIONS[slot];
      const light = sessionFor(slot, addDays(MON, 3), p)!;
      expect(light).not.toBe(fixed);
      const before = items(fixed);
      const after = items(light);
      expect(after.map((i) => i.exerciseId)).toEqual(before.map((i) => i.exerciseId));
      after.forEach((it, i) => {
        const b = before[i];
        // Arrotondamenti del § 3.4, come uguaglianze.
        expect(it.sets).toBe(Math.max(1, Math.ceil(0.5 * b.sets)));
        if (b.rir !== undefined) expect(it.rir).toBe(Math.min(5, b.rir + 1));
        if (isImpact(b.exerciseId) && b.unit === 'reps') expect(it.repMin).toBe(Math.max(1, Math.floor(0.5 * b.repMin)));
        else expect([it.repMin, it.repMax]).toEqual([b.repMin, b.repMax]);
      });
      // La settimana dopo torna la seduta fissa.
      expect(sessionFor(slot, NEXT_MON, p)).toBe(fixed);
    }
  });

  it('leggera: la facoltativa non c’è, le altre almeno a RIR 3 con le stesse serie', () => {
    const p = plan({ weekOverrides: { [MON]: 'leggera' } });
    const sat = p.week.find((d) => d.weekday === 5)!;
    const fri = p.week.find((d) => d.weekday === 4)!;
    expect(droppedByOverride(SAT, sat, p)).toBe(true);
    expect(droppedByOverride(FRI, fri, p)).toBe(false);
    expect(droppedByOverride(addDays(SAT, 7), sat, p)).toBe(false);
    const b = sessionFor('B', FRI, p)!;
    items(b).forEach((it, i) => {
      const base = items(SESSIONS.B)[i];
      expect(it.sets).toBe(base.sets);
      if (base.rir !== undefined) expect(it.rir).toBe(Math.max(LIGHT_WEEK_MIN_RIR, base.rir));
    });
    expect(plannedSessionFor(SAT, p)).toBeNull();
    expect(plannedSessionFor(FRI, p)?.sessionId).toBe('B');
    expect(plannedSessionFor(addDays(SAT, 7), p)?.sessionId).toBe('C');
  });

  it('Oggi e Allenamento seguono la settimana: niente facoltativa nella leggera, seduta più corta nello scarico', () => {
    const lightWeek = state({ weekOverrides: { [MON]: 'leggera' } });
    expect(buildTimeline(SAT, lightWeek).some((i) => i.kind === 'palestra')).toBe(false);
    expect(buildTimeline(addDays(SAT, 7), lightWeek).some((i) => i.kind === 'palestra')).toBe(true);
    expect(nextPlannedSession(SAT, lightWeek)?.date).not.toBe(SAT);
    expect(plannedLoadRemaining(MON, lightWeek, MON).items.some((i) => i.date === SAT)).toBe(false);

    const deload = state({ weekOverrides: { [MON]: 'scarico' } });
    const plain = state();
    const short = gymDuration('B', deload, FRI)!;
    const full = gymDuration('B', plain, FRI)!;
    expect(short.own).toBeLessThan(full.own);
    expect(gymDuration('B', deload)).toEqual(full);
    const item = buildTimeline(FRI, deload).find((i) => i.kind === 'palestra')!;
    expect(item.detail).toContain(`${short.own}`);
  });

  it('uno scarico accettato dalla revisione cambia davvero le sedute di quella settimana, anche senza blocco (§ 13.7, 37)', () => {
    useApp.getState().resetAll();
    const start = '2026-09-28';
    useApp.setState({ plan: { ...defaultPlan(start), week: DEFAULT_WEEK } });
    const s = useApp.getState();
    const reviewed = '2026-11-09';
    const deload = proposals(reviewed, s, { today: '2026-11-15' }).find((p) => p.area === 'scarico');
    expect(deload?.apply).toEqual({ type: 'weekKind', weekStart: MON, kind: 'scarico' });
    s.applyProposal(deload!);
    const after = useApp.getState().plan;
    expect(after.weekOverrides).toEqual({ [MON]: 'scarico' });
    expect(after.program).toBeUndefined();
    expect(sessionFor('B', FRI, after)).toEqual(deriveSession(SESSIONS.B, DELOAD_DOSE));
    expect(sessionFor('B', addDays(FRI, -7), after)).toBe(SESSIONS.B);
  });
});

describe('blocco in vigore', () => {
  const program: Program = {
    blockId: 'b1',
    start: MON,
    weeks: ['carico', 'carico', 'carico', 'scarico'],
    dose: [
      BASE_DOSE,
      { mainSetsAdd: 0, setsFactor: 1, rirDelta: -1, impactFactor: 1.2 },
      { mainSetsAdd: 1, setsFactor: 1, rirDelta: -2, impactFactor: 1.44 },
      DELOAD_DOSE,
    ],
    phase: 'stagione',
    stage: 'stagione',
    primary: 'forza',
    sessions: { A: SESSIONS.A, B: SESSIONS.B },
  };

  it('prima dell’inizio e per gli slot che il blocco non ha vale la seduta fissa', () => {
    const p = plan({ program });
    expect(sessionFor('B', addDays(MON, -3), p)).toBe(SESSIONS.B);
    expect(sessionFor('C', SAT, p)).toBe(SESSIONS.C);
    expect(sessionFor('B', FRI, p)).toBe(SESSIONS.B);
  });

  it('le settimane 2-4 si derivano dai fattori, con le gambe mai sotto RIR 2 in stagione', () => {
    const p = plan({ program });
    const w3 = sessionFor('B', addDays(FRI, 14), p)!;
    items(w3).forEach((it, i) => {
      const b = items(SESSIONS.B)[i];
      if (b.rir === undefined) return;
      const legs = EXERCISES[b.exerciseId]?.category === 'gambe';
      expect(it.rir).toBe(legs ? Math.max(Math.min(b.rir, 2), b.rir - 2) : Math.max(0, b.rir - 2));
    });
    // Serie in più solo sui principali.
    const main = SESSIONS.B.blocks.find((bl) => /principale/i.test(bl.title))!.items[0];
    expect(items(w3).find((x) => x.exerciseId === main.exerciseId)!.sets).toBe(main.sets + 1);
    expect(sessionFor('B', addDays(FRI, 21), p)).toEqual(deriveSession(SESSIONS.B, DELOAD_DOSE, { legsRirFloor: 2 }));
  });

  it('a fine blocco si ripete senza progressione: tre settimane alla dose della 2, poi lo scarico (§ 3.1)', () => {
    for (let w = 4; w < 16; w++) {
      const d = programWeekDose(program, w)!;
      if ((w - 4) % 4 === 3) expect(d).toEqual({ dose: DELOAD_DOSE, deload: true });
      else expect(d).toEqual({ dose: program.dose[1], deload: false });
    }
    // Mai la settimana 3 ripetuta: i contatti non superano quelli della settimana 2.
    for (let w = 4; w < 16; w++) expect(programWeekDose(program, w)!.dose.impactFactor).toBeLessThanOrEqual(1.2);
    // In 6 settimane senza approvare c'è almeno uno scarico.
    expect([4, 5, 6, 7, 8, 9].some((w) => programWeekDose(program, w)!.deload)).toBe(true);
    // Un blocco senza progressione si ripete com'è.
    const flat: Program = { ...program, weeks: ['carico', 'carico'], dose: [BASE_DOSE, BASE_DOSE] };
    expect(programWeekDose(flat, 5)).toEqual({ dose: BASE_DOSE, deload: false });
    expect(programWeekDose(program, -1)).toBeNull();
  });

  it('stessi ingressi, stesso oggetto; la settimana leggera sopra il blocco porta il RIR ad almeno 3', () => {
    const p = plan({ program, weekOverrides: { [addDays(MON, 7)]: 'leggera' } });
    expect(sessionFor('B', addDays(FRI, 7), p)).toBe(sessionFor('B', addDays(FRI, 7), { ...p }));
    for (const it of items(sessionFor('B', addDays(FRI, 7), p)!)) if (it.rir !== undefined) expect(it.rir).toBeGreaterThanOrEqual(LIGHT_WEEK_MIN_RIR);
  });
});

describe('deriveItem', () => {
  it('serie per eccesso, contatti e metri per difetto, mai sotto 1', () => {
    const item: SessionExercise = { exerciseId: 'balzi-del-pattinatore', sets: 3, repMin: 6, repMax: 8, unit: 'reps', restSec: 30, progression: 'nessuna', distanceM: 25 };
    expect(deriveItem(item, DELOAD_DOSE)).toMatchObject({ sets: 2, repMin: 3, repMax: 4, distanceM: 12 });
    expect(deriveItem({ ...item, sets: 1, repMin: 1, repMax: 1, distanceM: 1 }, DELOAD_DOSE)).toMatchObject({ sets: 1, repMin: 1, repMax: 1, distanceM: 1 });
    const rifinitura = { mainSetsAdd: 0, setsFactor: 0.6, rirDelta: 0, impactFactor: 0.6 };
    expect(deriveItem(item, rifinitura)).toMatchObject({ sets: 2, repMin: 3, repMax: 4, distanceM: 15 });
    // Un esercizio senza impatto tiene le ripetizioni.
    expect(deriveItem({ ...item, exerciseId: 'stacco-trap-bar' }, DELOAD_DOSE)).toMatchObject({ repMin: 6, repMax: 8 });
    expect(deriveSession(SESSIONS.A, BASE_DOSE)).toBe(SESSIONS.A);
  });
});

beforeEach(() => {
  useApp.getState().resetAll();
});
