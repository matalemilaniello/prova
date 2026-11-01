import { describe, expect, it } from 'vitest';
import type { CheckIn, ExerciseLog, FootballLog, SessionExercise, WorkoutLog } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import { EXERCISES } from '../data/exercises';
import { SESSIONS } from '../data/sessions';
import {
  bestE1rm,
  doneSets,
  e1rm,
  e1rmHistory,
  elbowFriendlyAlternatives,
  gateForExercise,
  INTRO_REASON,
  introItem,
  introLevel,
  isImpactExercise,
  lastEntryFor,
  lastLogFor,
  loadAlert,
  loadStatus,
  nextPlannedSession,
  painFlagFor,
  painGate,
  painNoteForExercise,
  personalRecords,
  physioCoverage,
  sessionDuration,
  tissueOf,
  plannedLoadRemaining,
  plannedSessionFor,
  sessionLoad,
  standingRecords,
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

// ───────────────────────── Fase di ingresso ─────────────────────────

describe('fase di ingresso', () => {
  it('conta le prime 2 esecuzioni di ogni seduta', () => {
    expect(introLevel('B', [])).toBe(1);
    const one = [workout('2026-10-23', [], { sessionId: 'B' }), workout('2026-10-20', [], { sessionId: 'A' })];
    expect(introLevel('B', one)).toBe(2);
    expect(introLevel('A', one)).toBe(2);
    const two = [...one, workout('2026-10-30', [], { sessionId: 'B' })];
    expect(introLevel('B', two)).toBeNull();
    // La seduta che stai rivedendo non conta.
    expect(introLevel('B', two, { excludeId: two[2].id })).toBe(2);
    expect(introLevel('B', two, { before: '2026-10-30' })).toBe(2);
    // La seduta C è già leggera (RIR 3): niente fase di ingresso.
    expect(introLevel('C', [])).toBeNull();
  });

  it('una serie in meno (almeno 1) e una ripetizione di riserva in più', () => {
    expect(introItem(bench)).toMatchObject({ sets: 2, rir: 3 });
    const nordic: SessionExercise = { exerciseId: 'nordic-hamstring-curl', sets: 2, repMin: 4, repMax: 6, unit: 'reps', restSec: 120, progression: 'nessuna' };
    expect(introItem(nordic)).toMatchObject({ sets: 1 });
    expect(introItem(nordic).rir).toBeUndefined();
    expect(introItem({ ...nordic, sets: 1 }).sets).toBe(1);
  });

  it('suggestNext riduce il volume e lo spiega', () => {
    const s = suggestNext(bench, null, { intro: true });
    expect(s.sets).toHaveLength(2);
    expect(s.rir).toBe(3);
    expect(s.intro).toBe(INTRO_REASON);
    // Il motivo è la prima esposizione agli esercizi, non la partita (la A cade il giorno dopo).
    expect(INTRO_REASON).toContain('indolenzimento');
    expect(INTRO_REASON).not.toMatch(/partita|fresco/);
    expect(s.reason).toContain('3 ripetizioni di riserva');
    // Seconda esecuzione: progressione normale sulle serie ridotte.
    const second = suggestNext(bench, exLog(bench.exerciseId, [[20, 10], [20, 10]]), { intro: true });
    expect(second.kind).toBe('aumenta');
    expect(second.sets).toHaveLength(2);
    // Dopo la fase di ingresso la dose torna piena e la serie in più non fa saltare il carico.
    const after = suggestNext(bench, exLog(bench.exerciseId, [[22, 8], [22, 7]]));
    expect(after.sets.map((x) => x.reps)).toEqual([9, 8, 8]);
    expect(after.intro).toBeUndefined();
    expect(after.rir).toBe(2);
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

  it('tiene come record imbattuti solo quelli non superati dopo', () => {
    const w3 = workout('2026-11-03', [exLog(bench.exerciseId, [[24, 8]]), exLog('lat-machine-presa-neutra', [[50, 8]])]);
    const all = [w1, w2, w3];
    expect(personalRecords(w2, all).map((r) => r.exerciseId)).toEqual([bench.exerciseId]);
    expect(standingRecords(w2, all)).toEqual([]);
    expect(standingRecords(w3, all).map((r) => r.exerciseId)).toEqual([bench.exerciseId]);
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
    // mar A (55×7) + mer calcetto (60×6) + gio allenamento (90×6) + ven B (59×7); C facoltativa esclusa.
    expect(r.load).toBe(385 + 360 + 540 + 413);
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

  it('il dolore registrato a fine seduta frena la seduta dopo (entro 2 giorni)', () => {
    const logs = [workout('2026-10-31', [], { pain: { Gomito: 5, Tibia: 1 } })];
    const g = painGate({ ...make([ci('2026-11-02', { Gomito: 2, Tibia: 1 })]), workoutLogs: logs }, '2026-11-02');
    expect(g.level).toBe('mantieni');
    expect(g.flagged[0]).toMatchObject({ site: 'Gomito', cause: 'seduta', sessionValue: 5, value: 2 });
    expect(g.title).toBe("Gomito a 5 su 10 nell'ultima seduta");
    expect(g.elbow).toBe(true);
    // Dopo 3 giorni non conta più.
    expect(painGate({ ...make([ci('2026-11-03', { Gomito: 2 })]), workoutLogs: logs }, '2026-11-03').level).toBe('ok');
    // Senza controllo del mattino basta il dolore della seduta.
    expect(painGate({ ...make([]), workoutLogs: logs }, '2026-11-01').level).toBe('mantieni');
  });

  it('il mattino dopo il calcio il dolore non deve salire', () => {
    // Lunedì 2 novembre partita (dal piano), martedì mattina la tibia sale da 1 a 2.
    const g = painGate(make([ci('2026-11-02', { Tibia: 1, Gomito: 1 }), ci('2026-11-03', { Tibia: 2, Gomito: 2 })]), '2026-11-03');
    expect(g.level).toBe('mantieni');
    const tibia = g.sites.find((s) => s.site === 'Tibia');
    expect(tibia).toMatchObject({ cause: 'giorno-dopo', before: 1, after: 'calcio', noImpact: true });
    expect(g.title).toBe('Tibia da 1 a 2 dopo il calcio');
    expect(g.message).toContain('Il giorno dopo il dolore non deve salire');
    // Il gomito (tendine) da 1 a 2 conta; da 0 a 1 no.
    expect(g.sites.find((s) => s.site === 'Gomito')?.cause).toBe('giorno-dopo');
    const light = painGate(make([ci('2026-11-02', { Gomito: 0 }), ci('2026-11-03', { Gomito: 1 })]), '2026-11-03');
    expect(light.level).toBe('ok');
    // Senza attività il giorno prima non si confronta (domenica di riposo).
    expect(painGate(make([ci('2026-11-01', { Tibia: 1 }), ci('2026-11-02', { Tibia: 2 })]), '2026-11-02').level).toBe('ok');
  });

  it('dopo una seduta registrata vale lo stesso confronto', () => {
    const logs = [workout('2026-11-06', [], { sessionId: 'B', pain: {} })];
    const g = painGate({ ...make([ci('2026-11-06', { Tibia: 0 }), ci('2026-11-07', { Tibia: 1 })]), workoutLogs: logs }, '2026-11-07');
    expect(g.flagged[0]).toMatchObject({ site: 'Tibia', cause: 'giorno-dopo', after: 'seduta' });
  });

  it('sotto il ginocchio gli impatti hanno una soglia più bassa', () => {
    // Tibia a 3 con soglia 3: i carichi restano, gli impatti no.
    const g = painGate(make([ci('2026-11-06', { Tibia: 3 })]), '2026-11-06');
    expect(g.level).toBe('ok');
    expect(g.impact).toBe(true);
    expect(g.impactSite).toBe('Tibia');
    expect(g.title).toBe('Tibia a 3 su 10: niente impatti oggi');
    expect(gateForExercise(EXERCISES['affondo-bulgaro-manubri'], g)).toBe('ok');
    const flag = painFlagFor(EXERCISES['balzi-del-pattinatore'], g);
    expect(flag).toMatchObject({ reason: 'Tibia sopra soglia: niente impatti oggi', kind: 'impatto' });
    expect(flag!.alternatives[0]).toBe('passi-laterali-elastico');
    expect(flag!.alternatives.every((id) => !isImpactExercise(EXERCISES[id]))).toBe(true);
    // A 2 su 10 i balzi vanno bene.
    expect(painGate(make([ci('2026-11-06', { Tibia: 2 })]), '2026-11-06').impact).toBe(false);
    // Il gomito non ha la soglia ridotta.
    expect(painGate(make([ci('2026-11-06', { Gomito: 3 })]), '2026-11-06').impact).toBe(false);
  });

  it('con la tibia alta segnala i balzi e non solo il gomito', () => {
    const g = painGate(make([ci('2026-11-06', { Tibia: 8 })]), '2026-11-06');
    expect(g.level).toBe('riduci');
    expect(g.impact).toBe(true);
    expect(g.message).toContain('Niente balzi e salti');
    expect(painFlagFor(EXERCISES['balzi-del-pattinatore'], g)?.reason).toBe('Tibia sopra soglia: niente impatti oggi');
    expect(painFlagFor(EXERCISES['stacco-trap-bar'], g)).toBeNull();
    expect(isImpactExercise(EXERCISES['squat-con-sollevamento-punte'])).toBe(false);
    // Esercizi senza segnalazione (es. del fisioterapista) riconosciuti dal nome.
    expect(isImpactExercise({ id: 'x', name: 'Saltelli sul posto', category: 'fisio', equipment: 'Corpo libero', cues: [] })).toBe(true);
  });

  it('frena solo gli esercizi che caricano la zona dolente', () => {
    const tibia = painGate(make([ci('2026-11-02', { Tibia: 5 })]), '2026-11-02');
    expect(gateForExercise(EXERCISES['affondo-bulgaro-manubri'], tibia)).toBe('mantieni');
    expect(gateForExercise(EXERCISES['panca-manubri-presa-neutra'], tibia)).toBe('ok');
    // Con la tibia segnalata restano al carico dell'ultima volta anche polpacci, soleo e tibiali di prevenzione.
    expect(gateForExercise(EXERCISES['tibiale-anteriore-seduto'], tibia)).toBe('mantieni');
    expect(gateForExercise(EXERCISES['polpacci-seduto'], tibia)).toBe('mantieni');
    expect(gateForExercise(EXERCISES['sollevamenti-punte-pallina'], tibia)).toBe('mantieni');
    expect(gateForExercise(EXERCISES['copenhagen-leva-corta'], tibia)).toBe('ok');
    expect(gateForExercise(EXERCISES['tyler-twist'], tibia)).toBe('ok');

    const elbow = painGate(make([ci('2026-11-02', { Gomito: 7 })]), '2026-11-02');
    expect(gateForExercise(EXERCISES['panca-manubri-presa-neutra'], elbow)).toBe('riduci');
    expect(gateForExercise(EXERCISES['stacco-trap-bar'], elbow)).toBe('riduci');
    expect(gateForExercise(EXERCISES['hip-thrust-bilanciere'], elbow)).toBe('ok');

    const unknown = painGate(make([ci('2026-11-02', { Collo: 4 })], []), '2026-11-02');
    expect(gateForExercise(EXERCISES['squat-goblet'], unknown)).toBe('mantieni');
    expect(gateForExercise(undefined, unknown)).toBe('ok');
  });
});

// ───────────────────────── Regola del dolore: testi per zona ─────────────────────────

describe('painGate: cosa frena e cosa procede', () => {
  const ci = (date: string, pain: Record<string, number>): CheckIn => ({ date, pain });
  const make = (checkIns: CheckIn[], painSites = ['Tibia', 'Gomito']) => ({
    plan: PLAN,
    profile: { painSites } as never,
    checkIns: Object.fromEntries(checkIns.map((c) => [c.date, c])),
  });

  it('la tibia frena gambe e polpacci, la parte superiore procede', () => {
    // Martedì dopo la partita: tibia da 1 a 2.
    const g = painGate(make([ci('2026-11-02', { Tibia: 1, Gomito: 1 }), ci('2026-11-03', { Tibia: 2, Gomito: 1 })]), '2026-11-03');
    expect(g.message).toContain("per gambe e polpacci mantieni i carichi dell'ultima volta");
    expect(g.message).toContain('La parte superiore procede come previsto.');
    expect(g.message).not.toContain('tieni polpacci');
    // La panca progredisce, i polpacci no, e il motivo dice perché.
    expect(gateForExercise(EXERCISES['panca-manubri-presa-neutra'], g)).toBe('ok');
    expect(painNoteForExercise(EXERCISES['panca-manubri-presa-neutra'], g)).toBeUndefined();
    expect(painNoteForExercise(EXERCISES['polpacci-seduto'], g)).toBe('Tibia da 1 a 2 dopo il calcio');
    const calf: SessionExercise = { exerciseId: 'polpacci-seduto', sets: 3, repMin: 8, repMax: 12, unit: 'reps', rir: 2, restSec: 60, progression: 'doppia', incrementKg: 5 };
    const last = exLog('polpacci-seduto', [[40, 12], [40, 12], [40, 12]]);
    const s = suggestNext(calf, last, { gate: gateForExercise(EXERCISES['polpacci-seduto'], g), painNote: painNoteForExercise(EXERCISES['polpacci-seduto'], g) });
    expect(s).toMatchObject({ kind: 'mantieni', weightKg: 40, reason: 'Tibia da 1 a 2 dopo il calcio: niente aumenti di carico oggi' });
  });

  it('il gomito frena spinte e tirate, le gambe procedono', () => {
    const g = painGate(make([ci('2026-11-02', { Gomito: 4, Tibia: 0 })]), '2026-11-02');
    expect(g.message).toMatch(/^Per spinte e tirate mantieni/);
    expect(g.message).toContain('Le gambe procedono come previsto.');
    expect(painNoteForExercise(EXERCISES['panca-manubri-presa-neutra'], g)).toBe('Gomito a 4 su 10');
  });

  it('zone in parti diverse o sconosciute: la regola vale per tutto', () => {
    const both = painGate(make([ci('2026-11-02', { Gomito: 4, Tibia: 4 })]), '2026-11-02');
    expect(both.message).toMatch(/^Mantieni i carichi/);
    expect(both.message).not.toContain('procede');
    const unknown = painGate(make([ci('2026-11-02', { Collo: 4 })], []), '2026-11-02');
    expect(unknown.message).toMatch(/^Mantieni i carichi/);
  });

  it('con il dolore molto alto riduce solo la zona e manda dal fisioterapista', () => {
    const g = painGate(make([ci('2026-11-06', { Tibia: 8 })]), '2026-11-06');
    expect(g.message).toMatch(/^Per gambe e polpacci riduci i carichi del 10%/);
    expect(g.message.endsWith('Scrivi al fisioterapista oggi.')).toBe(true);
  });

  it('senza zona il motivo resta generico', () => {
    const last = exLog(bench.exerciseId, [[20, 10], [20, 10], [20, 10]]);
    expect(suggestNext(bench, last, { gate: 'mantieni' }).reason).toBe('Dolore sopra soglia: niente aumenti di carico oggi');
  });
});

// ───────────────────────── Fisioterapista e doppioni ─────────────────────────

describe('esercizi del fisioterapista e doppioni', () => {
  const physio = {
    exercises: [
      { id: 'f-soleo', name: 'Isometria del soleo al muro', category: 'fisio' as const, equipment: 'Muro', cues: [] },
      { id: 'f-tibiale', name: 'Sollevamento delle punte con la schiena al muro', category: 'fisio' as const, equipment: 'Muro', cues: [] },
      { id: 'f-polso', name: 'Eccentrico degli estensori del polso', category: 'fisio' as const, equipment: 'Manubrio', cues: [] },
      { id: 'f-allungamento', name: 'Allungamento del polpaccio al muro', category: 'fisio' as const, equipment: 'Muro', cues: [] },
    ],
    prescriptions: [
      { exerciseId: 'f-soleo', sets: 4, repMin: 30, repMax: 45, unit: 'secondi' as const, restSec: 60, progression: 'nessuna' as const, perSide: true },
      { exerciseId: 'f-tibiale', sets: 3, repMin: 12, repMax: 15, unit: 'reps' as const, restSec: 45, progression: 'nessuna' as const },
      { exerciseId: 'f-polso', sets: 3, repMin: 12, repMax: 15, unit: 'reps' as const, restSec: 60, progression: 'nessuna' as const, perSide: true },
    ],
  };

  it('riconosce il tessuto dal nome senza confondere tibiale anteriore e polpacci', () => {
    expect(tissueOf(EXERCISES['tyler-twist'])).toBe('gomito');
    expect(tissueOf(EXERCISES['isometria-estensori-polso'])).toBe('gomito');
    expect(tissueOf(EXERCISES['polpacci-seduto'])).toBe('soleo');
    expect(tissueOf(EXERCISES['polpacci-in-piedi-macchina'])).toBe('polpacci');
    expect(tissueOf(EXERCISES['tibiale-anteriore-seduto'])).toBe('tibiale-anteriore');
    expect(tissueOf(EXERCISES['sollevamenti-punte-pallina'])).toBe('tibiale-posteriore');
    expect(tissueOf(physio.exercises[1])).toBe('tibiale-anteriore');
    expect(tissueOf(EXERCISES['copenhagen-leva-corta'])).toBe('adduttori');
    expect(tissueOf(EXERCISES['nordic-hamstring-curl'])).toBe('flessori');
    // Gli allungamenti non caricano il tessuto.
    expect(tissueOf(physio.exercises[3])).toBeNull();
    expect(tissueOf(EXERCISES['panca-manubri-presa-neutra'])).toBeNull();
  });

  it('nella seduta A salta polpacci da seduto e Tyler twist, non il riscaldamento né il tibiale posteriore', () => {
    const cover = physioCoverage(SESSIONS.A, physio);
    const ids = [...cover.values()].map((c) => c.exerciseId).sort();
    expect(ids).toEqual(['polpacci-seduto', 'tyler-twist']);
    expect([...cover.values()].find((c) => c.exerciseId === 'tyler-twist')).toMatchObject({ physioId: 'f-polso', tissue: 'gomito' });
    // L'isometria prima delle spinte resta: prepara il gomito, non è un doppione.
    expect(ids).not.toContain('isometria-estensori-polso');
  });

  it('nella B salta tibiale anteriore e Tyler twist, non i polpacci pesanti in piedi', () => {
    const ids = [...physioCoverage(SESSIONS.B, physio).values()].map((c) => c.exerciseId).sort();
    expect(ids).toEqual(['tibiale-anteriore-seduto', 'tyler-twist']);
    // Un esercizio generico per i polpacci invece li copre.
    const calves = {
      exercises: [{ id: 'f-calf', name: 'Polpacci su una gamba al gradino', category: 'fisio' as const, equipment: 'Gradino', cues: [] }],
      prescriptions: [{ exerciseId: 'f-calf', sets: 3, repMin: 10, repMax: 15, unit: 'reps' as const, restSec: 60, progression: 'nessuna' as const }],
    };
    expect([...physioCoverage(SESSIONS.B, calves).values()].map((c) => c.exerciseId)).toEqual(['polpacci-in-piedi-macchina']);
  });

  it('senza esercizi del fisioterapista non salta niente', () => {
    expect(physioCoverage(SESSIONS.A, { exercises: [], prescriptions: [] }).size).toBe(0);
    expect(physioCoverage(SESSIONS.A, undefined).size).toBe(0);
    // Lo stesso esercizio del catalogo prescritto dal fisioterapista è un doppione.
    const same = physioCoverage(SESSIONS.B, { exercises: [], prescriptions: [{ exerciseId: 'pallof-press', sets: 2, repMin: 8, repMax: 10, unit: 'reps', restSec: 30, progression: 'nessuna' }] });
    expect([...same.values()]).toEqual([{ exerciseId: 'pallof-press', physioId: 'pallof-press', tissue: null }]);
  });

  it('la durata dice quanto pesa il blocco del fisioterapista', () => {
    const plain = sessionDuration(SESSIONS.A);
    expect(plain).toEqual({ own: SESSIONS.A.estMin, physio: 0, total: SESSIONS.A.estMin, covered: 0 });
    const d = sessionDuration(SESSIONS.A, physio);
    expect(d.covered).toBe(2);
    expect(d.own).toBeLessThan(SESSIONS.A.estMin);
    expect(d.physio).toBeGreaterThanOrEqual(20);
    expect(d.physio).toBeLessThanOrEqual(28);
    expect(d.total).toBe(d.own + d.physio);
    // Nella fase di ingresso una serie in meno accorcia la seduta.
    expect(sessionDuration(SESSIONS.A, undefined, { intro: true }).own).toBeLessThan(SESSIONS.A.estMin);
  });
});
