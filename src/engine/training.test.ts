import { describe, expect, it } from 'vitest';
import type { CheckIn, ExerciseLog, FootballLog, SessionExercise, WorkoutLog } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import { EXERCISES } from '../data/exercises';
import {
  bestE1rm,
  doneSets,
  e1rm,
  e1rmHistory,
  elbowFriendlyAlternatives,
  gateForExercise,
  lastEntryFor,
  lastLogFor,
  loadAlert,
  loadStatus,
  nextPlannedSession,
  painFlagFor,
  painGate,
  personalRecords,
  plannedLoadRemaining,
  plannedSessionFor,
  sessionLoad,
  suggestNext,
  weeklyLoad,
  weeklyLoadSeries,
  workingWeight,
  workoutSetCount,
  workoutVolume,
} from './training';

// ───────────────────────── Aiuti ─────────────────────────

const bench: SessionExercise = {
  exerciseId: 'panca-manubri-presa-neutra',
  sets: 3,
  repMin: 6,
  repMax: 10,
  unit: 'reps',
  rir: 2,
  restSec: 120,
  progression: 'doppia',
  incrementKg: 2,
};

const exLog = (exerciseId: string, sets: [number, number][], done = true): ExerciseLog => ({
  exerciseId,
  sets: sets.map(([weightKg, reps]) => ({ weightKg, reps, done })),
});

let wid = 0;
const workout = (date: string, exercises: ExerciseLog[], extra: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id: `w${++wid}`,
  date,
  sessionId: 'A',
  durationMin: 55,
  rpe: 7,
  pain: {},
  exercises,
  ...extra,
});

const football = (date: string, durationMin = 90, rpe = 7, kind: FootballLog['kind'] = 'partita'): FootballLog => ({
  id: `f-${date}-${kind}`,
  date,
  kind,
  durationMin,
  rpe,
});

// Lunedì 2 novembre 2026 (piano iniziato lunedì 5 ottobre).
const PLAN = defaultPlan('2026-10-05');

// ───────────────────────── Storico ─────────────────────────

describe('lastLogFor e lastEntryFor', () => {
  const logs = [
    workout('2026-10-20', [exLog(bench.exerciseId, [[20, 8], [20, 8], [20, 7]])]),
    workout('2026-10-27', [exLog(bench.exerciseId, [[20, 9], [20, 9], [20, 8]])]),
    workout('2026-10-30', [exLog(bench.exerciseId, [[22, 6]], false)]),
  ];

  it("trova l'ultima seduta con serie fatte, saltando quelle senza", () => {
    const last = lastEntryFor(bench.exerciseId, logs);
    expect(last?.date).toBe('2026-10-27');
    expect(lastLogFor(bench.exerciseId, logs)?.sets.map((s) => s.reps)).toEqual([9, 9, 8]);
  });

  it('rispetta before ed excludeId', () => {
    expect(lastEntryFor(bench.exerciseId, logs, { before: '2026-10-27' })?.date).toBe('2026-10-20');
    expect(lastEntryFor(bench.exerciseId, logs, { excludeId: logs[1].id })?.date).toBe('2026-10-20');
  });

  it('restituisce null senza storico', () => {
    expect(lastLogFor('inesistente', logs)).toBeNull();
    expect(lastLogFor(bench.exerciseId, [])).toBeNull();
  });

  it('conta le serie fatte e il carico di lavoro', () => {
    const l = exLog(bench.exerciseId, [[18, 10], [22, 6], [22, 0]]);
    expect(doneSets(l)).toHaveLength(2);
    expect(workingWeight(l)).toBe(22);
    expect(workingWeight(null)).toBe(0);
  });
});

// ───────────────────────── Progressione doppia ─────────────────────────

describe('suggestNext · progressione doppia', () => {
  it('senza storico propone repMin e carico da scegliere', () => {
    const s = suggestNext(bench, null);
    expect(s.kind).toBe('nuovo');
    expect(s.weightKg).toBe(0);
    expect(s.reps).toBe(6);
    expect(s.sets).toHaveLength(3);
    expect(s.reason).toContain('2 ripetizioni di riserva');
  });

  it('tutte le serie a repMax → carico + incremento e repMin', () => {
    const s = suggestNext(bench, exLog(bench.exerciseId, [[20, 10], [20, 10], [20, 10]]));
    expect(s.kind).toBe('aumenta');
    expect(s.weightKg).toBe(22);
    expect(s.sets.every((x) => x.reps === 6 && x.weightKg === 22)).toBe(true);
    expect(s.lastWeightKg).toBe(20);
  });

  it('non tutte a repMax → stesso carico, +1 ripetizione per serie fino a repMax', () => {
    const s = suggestNext(bench, exLog(bench.exerciseId, [[20, 10], [20, 9], [20, 7]]));
    expect(s.kind).toBe('ripetizioni');
    expect(s.weightKg).toBe(20);
    expect(s.sets.map((x) => x.reps)).toEqual([10, 10, 8]);
  });

  it('meno serie del previsto non fanno salire il carico', () => {
    const s = suggestNext(bench, exLog(bench.exerciseId, [[20, 10], [20, 10]]));
    expect(s.kind).toBe('ripetizioni');
    expect(s.weightKg).toBe(20);
    expect(s.sets.map((x) => x.reps)).toEqual([10, 10, 10]);
  });

  it('una serie a carico più basso non conta come "tutte a repMax"', () => {
    const s = suggestNext(bench, exLog(bench.exerciseId, [[20, 10], [20, 10], [18, 10]]));
    expect(s.kind).toBe('ripetizioni');
    expect(s.weightKg).toBe(20);
  });

  it("usa l'incremento predefinito quando la seduta non lo indica", () => {
    const item = { ...bench, incrementKg: undefined };
    expect(suggestNext(item, exLog(bench.exerciseId, [[40, 10], [40, 10], [40, 10]])).weightKg).toBe(42.5);
  });

  it('esercizio senza progressione ripete le ripetizioni (o i secondi) di prima', () => {
    const iso: SessionExercise = { exerciseId: 'isometria-estensori-polso', sets: 3, repMin: 30, repMax: 40, unit: 'secondi', restSec: 30, progression: 'nessuna' };
    const s = suggestNext(iso, exLog(iso.exerciseId, [[0, 35], [0, 40], [0, 30]]));
    expect(s.kind).toBe('ripeti');
    expect(s.sets.map((x) => x.reps)).toEqual([35, 40, 30]);
    const fresh = suggestNext(iso, null);
    expect(fresh.reps).toBe(30);
    expect(fresh.reason).toBe('Obiettivo: da 30 a 40 secondi');
  });

  it('a corpo libero con tutte le serie a repMax aggiunge zavorra', () => {
    const item: SessionExercise = { ...bench, exerciseId: 'piegamenti-su-impugnature', incrementKg: 2.5 };
    expect(suggestNext(item, exLog(item.exerciseId, [[0, 10], [0, 10], [0, 10]])).weightKg).toBe(2.5);
  });

  it('la regola del dolore blocca gli aumenti (mantieni) o riduce il carico (riduci)', () => {
    const allMax = exLog(bench.exerciseId, [[20, 10], [20, 10], [20, 10]]);
    const hold = suggestNext(bench, allMax, { gate: 'mantieni' });
    expect(hold.kind).toBe('mantieni');
    expect(hold.weightKg).toBe(20);
    expect(hold.reps).toBe(10);

    const partial = suggestNext(bench, exLog(bench.exerciseId, [[20, 9], [20, 8], [20, 8]]), { gate: 'mantieni' });
    expect(partial.sets.map((x) => x.reps)).toEqual([9, 8, 8]);

    const reduce = suggestNext(bench, allMax, { gate: 'riduci' });
    expect(reduce.kind).toBe('riduci');
    expect(reduce.weightKg).toBe(18);
    expect(reduce.reps).toBe(6);
  });
});

// ───────────────────────── 1RM, record, volume ─────────────────────────

describe('e1rm (Epley) e record personali', () => {
  it('calcola Epley e gestisce i casi limite', () => {
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 2);
    expect(e1rm(60, 1)).toBe(60);
    expect(e1rm(0, 10)).toBe(0);
    expect(e1rm(50, 0)).toBe(0);
    expect(e1rm(Number.NaN, 5)).toBe(0);
  });

  const w1 = workout('2026-10-20', [exLog(bench.exerciseId, [[20, 8], [20, 8]]), exLog('lat-machine-presa-neutra', [[50, 10]])]);
  const w2 = workout('2026-10-27', [exLog(bench.exerciseId, [[22, 8], [22, 7]]), exLog('lat-machine-presa-neutra', [[50, 9]]), exLog('stacco-trap-bar', [[80, 5]])]);

  it('trova i record rispetto alle sedute precedenti, esclusa la prima volta', () => {
    const prs = personalRecords(w2, [w1, w2]);
    expect(prs.map((p) => p.exerciseId)).toEqual([bench.exerciseId]);
    expect(prs[0].e1rm).toBeCloseTo(22 * (1 + 8 / 30), 5);
    expect(prs[0].previous).toBeCloseTo(20 * (1 + 8 / 30), 5);
    expect(prs[0].weightKg).toBe(22);
  });

  it('non conta le sedute successive come storico', () => {
    expect(personalRecords(w1, [w1, w2])).toEqual([]);
    expect(bestE1rm(bench.exerciseId, [w1, w2], { before: '2026-10-27' })).toBeCloseTo(20 * (1 + 8 / 30), 5);
  });

  it('ricostruisce la serie storica del 1RM stimato', () => {
    const h = e1rmHistory(bench.exerciseId, [w2, w1]);
    expect(h.map((p) => p.date)).toEqual(['2026-10-20', '2026-10-27']);
    expect(h[1].e1rm).toBe(27.9);
  });

  it('somma volume e serie fatte', () => {
    expect(workoutVolume(w1)).toBe(20 * 8 * 2 + 50 * 10);
    expect(workoutSetCount(w2)).toBe(4);
  });
});

// ───────────────────────── Carico ─────────────────────────

describe('carico session-RPE e allarme', () => {
  it('sessionLoad = minuti × RPE', () => {
    expect(sessionLoad(55, 7)).toBe(385);
    expect(sessionLoad(0, 7)).toBe(0);
    expect(sessionLoad(60, 0)).toBe(0);
    expect(sessionLoad(60, 12)).toBe(600);
  });

  it('somma palestra e calcio nella settimana, da lunedì a domenica compresi', () => {
    const state = {
      workoutLogs: [workout('2026-10-27', [], { durationMin: 50, rpe: 7 }), workout('2026-11-02', [], { durationMin: 40, rpe: 6 })],
      footballLogs: [football('2026-10-26'), football('2026-11-01', 60, 5, 'calcetto')],
    };
    // Settimana 26 ottobre - 1 novembre (attraversa il cambio dell'ora del 25 ottobre: nessun effetto).
    expect(weeklyLoad('2026-10-26', state)).toBe(350 + 630 + 300);
    // Qualunque giorno della settimana individua lo stesso lunedì.
    expect(weeklyLoad('2026-10-29', state)).toBe(1280);
    expect(weeklyLoad('2026-11-02', state)).toBe(240);
  });

  // Settimane di storico: 5, 12, 19, 26 ottobre, poi la settimana del 2 novembre.
  const base = (load: number, date: string) => workout(date, [], { durationMin: load / 10, rpe: 10 });
  const history = [base(1000, '2026-10-06'), base(1000, '2026-10-13'), base(1200, '2026-10-20'), base(800, '2026-10-27')];

  it('non scatta senza almeno 2 settimane di storico', () => {
    const state = { workoutLogs: [base(1000, '2026-10-27'), base(3000, '2026-11-03')], footballLogs: [] };
    expect(loadStatus('2026-11-02', state).enoughHistory).toBe(false);
    expect(loadAlert('2026-11-02', state)).toBeNull();
  });

  it('scatta oltre il 120% della media delle 4 settimane precedenti', () => {
    const ok = { workoutLogs: [...history, base(1200, '2026-11-03')], footballLogs: [] };
    const st = loadStatus('2026-11-02', ok);
    expect(st.average).toBe(1000);
    expect(st.threshold).toBe(1200);
    expect(st.ratio).toBeCloseTo(1.2);
    expect(loadAlert('2026-11-02', ok)).toBeNull();

    const spike = { workoutLogs: [...history, base(1300, '2026-11-03')], footballLogs: [] };
    const alert = loadAlert('2026-11-02', spike);
    expect(alert?.alert).toBe(true);
    expect(alert?.ratio).toBeCloseTo(1.3);
  });

  it('usa al massimo 4 settimane e conta come zero le settimane vuote nello storico', () => {
    const state = { workoutLogs: [base(4000, '2026-09-29'), base(1000, '2026-10-13'), base(1000, '2026-10-20'), base(1000, '2026-10-27'), base(1000, '2026-11-02')], footballLogs: [] };
    const st = loadStatus('2026-11-02', state);
    expect(st.previous.map((p) => p.weekStart)).toEqual(['2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05']);
    expect(st.average).toBe(750);
    expect(st.alert).toBe(true);
  });

  it('da una media nulla qualunque ripresa è un picco', () => {
    const state = { workoutLogs: [base(500, '2026-09-29'), base(400, '2026-11-02')], footballLogs: [] };
    const st = loadStatus('2026-11-02', state);
    expect(st.average).toBe(0);
    expect(st.ratio).toBeNull();
    expect(st.alert).toBe(true);
  });

  it('costruisce la serie settimanale segnando lo storico', () => {
    const series = weeklyLoadSeries('2026-11-02', { workoutLogs: history, footballLogs: [] }, 6);
    expect(series).toHaveLength(6);
    expect(series[0]).toEqual({ weekStart: '2026-09-28', load: 0, inHistory: false });
    expect(series[1].inHistory).toBe(true);
    expect(series[5].load).toBe(0);
  });
});

// ───────────────────────── Programma ─────────────────────────

describe('programma della settimana', () => {
  it('legge la seduta prevista dal piano', () => {
    expect(plannedSessionFor('2026-11-03', PLAN)).toMatchObject({ sessionId: 'A', time: '17:00', optional: false });
    expect(plannedSessionFor('2026-11-07', PLAN)).toMatchObject({ sessionId: 'C', optional: true });
    expect(plannedSessionFor('2026-11-02', PLAN)).toBeNull();
  });

  it('trova la prossima seduta saltando quelle già fatte e, se richiesto, le facoltative', () => {
    const state = { plan: PLAN, workoutLogs: [workout('2026-11-03', [])] };
    expect(nextPlannedSession('2026-11-02', state)).toMatchObject({ date: '2026-11-06', sessionId: 'B', daysAway: 4 });
    expect(nextPlannedSession('2026-11-07', state)).toMatchObject({ sessionId: 'C', daysAway: 0 });
    expect(nextPlannedSession('2026-11-07', state, { skipOptional: true })).toMatchObject({ date: '2026-11-10', sessionId: 'A' });
  });

  it('stima il carico che resta in programma, senza le facoltative', () => {
    const state = { plan: PLAN, workoutLogs: [], footballLogs: [football('2026-11-02')] };
    const r = plannedLoadRemaining('2026-11-02', state, '2026-11-02');
    // mar A (55×7) + mer calcetto (60×6) + gio allenamento (90×6) + ven B (58×7); C facoltativa esclusa.
    expect(r.load).toBe(385 + 360 + 540 + 406);
    expect(r.items.find((i) => i.sessionId === 'C')?.optional).toBe(true);
    expect(plannedLoadRemaining('2026-11-02', state, '2026-11-09').items).toEqual([]);
  });
});

// ───────────────────────── Regola del dolore ─────────────────────────

describe('painGate', () => {
  const ci = (date: string, pain: Record<string, number>): CheckIn => ({ date, pain });
  const make = (checkIns: CheckIn[], painSites = ['Tibia', 'Gomito']) => ({
    plan: PLAN,
    profile: { painSites } as never,
    checkIns: Object.fromEntries(checkIns.map((c) => [c.date, c])),
  });

  it('dolore entro la soglia → ok', () => {
    const g = painGate(make([ci('2026-11-02', { Tibia: 2, Gomito: 3 })]), '2026-11-02');
    expect(g.level).toBe('ok');
    expect(g.flagged).toEqual([]);
    expect(g.date).toBe('2026-11-02');
  });

  it('sopra soglia → mantieni, con il gomito propone varianti adatte', () => {
    const g = painGate(make([ci('2026-11-02', { Tibia: 1, Gomito: 4 })]), '2026-11-02');
    expect(g.level).toBe('mantieni');
    expect(g.elbow).toBe(true);
    expect(g.lowerLeg).toBe(false);
    expect(g.title).toBe('Gomito a 4 su 10, sopra soglia');
    expect(g.message).toContain('presa neutra');
  });

  it('in peggioramento anche sotto soglia → mantieni', () => {
    const g = painGate(make([ci('2026-10-30', { Tibia: 1 }), ci('2026-10-31', { Tibia: 1 }), ci('2026-11-01', { Tibia: 3 })]), '2026-11-01');
    expect(g.level).toBe('mantieni');
    expect(g.flagged[0]).toMatchObject({ site: 'Tibia', over: false, worsening: true, previous: 1 });
    expect(g.lowerLeg).toBe(true);
    expect(g.title).toBe('Tibia in aumento');
  });

  it('molto alto → riduci', () => {
    const g = painGate(make([ci('2026-11-02', { Tibia: 6 })]), '2026-11-02');
    expect(g.level).toBe('riduci');
    expect(g.message).toContain('10%');
  });

  it('usa un controllo fino a 3 giorni prima, poi non giudica', () => {
    const c = [ci('2026-10-29', { Gomito: 5 })];
    expect(painGate(make(c), '2026-11-01').level).toBe('mantieni');
    const old = painGate(make(c), '2026-11-02');
    expect(old.level).toBe('ok');
    expect(old.date).toBeNull();
  });

  it('ignora le zone non più monitorate', () => {
    expect(painGate(make([ci('2026-11-02', { Spalla: 7 })]), '2026-11-02').level).toBe('ok');
    // Senza zone scelte valgono tutte quelle registrate.
    expect(painGate(make([ci('2026-11-02', { Spalla: 7 })], []), '2026-11-02').level).toBe('riduci');
  });

  it('segnala gli esercizi da sostituire e le alternative adatte', () => {
    const gate = painGate(make([ci('2026-11-02', { Gomito: 5, Tibia: 5 })]), '2026-11-02');
    const trap = painFlagFor(EXERCISES['stacco-trap-bar'], gate);
    expect(trap).not.toBeNull();
    expect(trap!.alternatives.every((id) => EXERCISES[id].elbowFriendly)).toBe(true);
    expect(painFlagFor(EXERCISES['panca-manubri-presa-neutra'], gate)).toBeNull();
    const jumps = painFlagFor(EXERCISES['balzi-del-pattinatore'], gate);
    expect(jumps?.alternatives).toContain('equilibrio-su-una-gamba-a-stella');
    expect(painFlagFor(EXERCISES['stacco-trap-bar'], painGate(make([]), '2026-11-02'))).toBeNull();
  });

  it('elenca solo le alternative adatte al gomito presenti nel catalogo', () => {
    for (const ex of Object.values(EXERCISES)) {
      for (const alt of elbowFriendlyAlternatives(ex.id)) {
        expect(alt.elbowFriendly).toBe(true);
        expect(ex.alternatives).toContain(alt.id);
      }
    }
  });

  it('frena solo gli esercizi che caricano la zona dolente', () => {
    const tibia = painGate(make([ci('2026-11-02', { Tibia: 5 })]), '2026-11-02');
    expect(gateForExercise(EXERCISES['affondo-bulgaro-manubri'], tibia)).toBe('mantieni');
    expect(gateForExercise(EXERCISES['panca-manubri-presa-neutra'], tibia)).toBe('ok');
    expect(gateForExercise(EXERCISES['tibiale-anteriore-seduto'], tibia)).toBe('ok');

    const elbow = painGate(make([ci('2026-11-02', { Gomito: 7 })]), '2026-11-02');
    expect(gateForExercise(EXERCISES['panca-manubri-presa-neutra'], elbow)).toBe('riduci');
    expect(gateForExercise(EXERCISES['stacco-trap-bar'], elbow)).toBe('riduci');
    expect(gateForExercise(EXERCISES['hip-thrust-bilanciere'], elbow)).toBe('ok');

    const unknown = painGate(make([ci('2026-11-02', { Collo: 4 })], []), '2026-11-02');
    expect(gateForExercise(EXERCISES['squat-goblet'], unknown)).toBe('mantieni');
    expect(gateForExercise(undefined, unknown)).toBe('ok');
  });
});
