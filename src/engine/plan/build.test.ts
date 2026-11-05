/**
 * Generatore dei blocchi (docs/FASE2.md § 3, § 13.7): proposta sempre nata, regole R1-R10, pavimenti, contatti,
 * arrotondamenti, durata, catalogo, energia del blocco, obiettivi pronti, rientro, fermo degli impatti, blocco ripetuto,
 * R8, determinismo e un test a proprietà su molti profili. Dati inventati e generici.
 */
import { describe, expect, it } from 'vitest';
import type { AppData, CheckIn, FootballLog, Plan, Program, ScheduleDay, SeasonCalendar, TrainingGoal, Weekday, WorkoutLog, WorkoutSession } from '../../domain/types';
import { DEFAULT_PROFILE, DEFAULT_WEEK, defaultAppData, defaultPlan } from '../../data/defaults';
import { EXERCISES, impactLevelOf } from '../../data/exercises';
import { normalizeTraining } from '../../state/store';
import { addDays } from '../dates';
import { mulberry32, intBelow, pick } from '../rng';
import { isImpactExercise, sessionDuration } from '../training';
import { hhmmToMin } from '../dates';
import { workSpans, overlapsWork } from '../work';
import {
  FLOORS_ONLY_TEXT,
  NO_GYM_DAY_TEXT,
  blockShape,
  blockTrigger,
  buildBlock,
  buildBlockProposal,
  buildGoalsProposal,
  goalsProposal,
  r8Active,
  type TrainingBuildInput,
} from './build';
import { contactLimitsFor, floorsDone, isStrengthLegs, itemContacts, itemMeters, plyoLevel, requiredFloors, sessionContacts, stepAllowed } from './limits';
import { programWeekDose, sessionFor } from './program';
import { planBasis } from './proposals';
import { TRAINING_PRESETS, seasonOn } from './season';
import { dayOf, matchWeekday, mdDistance, plannedLoad, programSession, validateWeek } from './week';

const MONDAY = '2026-11-09';
const NO_PHYSIO = { exercises: [], prescriptions: [] };
const SITES = ['Tibia', 'Gomito'];

const basePlan = (over: Partial<Plan> = {}): Plan => ({ ...defaultPlan('2026-11-02'), ...over });
const input = (plan: Plan, over: Partial<TrainingBuildInput> = {}): TrainingBuildInput => ({
  monday: MONDAY,
  plan,
  workoutLogs: [],
  footballLogs: [],
  checkIns: {},
  physio: NO_PHYSIO,
  painSites: SITES,
  attempt: 0,
  ...over,
});

const items = (s: WorkoutSession) => s.blocks.flatMap((b) => b.items);

/** Settimana tipo con la partita nel giorno `md` e il resto della settimana predefinita ruotato. */
function rotatedWeek(md: number, variant = 0): ScheduleDay[] {
  return DEFAULT_WEEK.map((d, i) => {
    const wd = ((i + md) % 7) as Weekday;
    const out: ScheduleDay = { ...d, weekday: wd };
    // Varianti: senza calcetto, allenamento in un altro giorno, palestra a un'altra ora.
    if (variant % 4 === 1 && d.football?.kind === 'calcetto') {
      delete out.football;
      out.dayType = 'leggero';
    }
    if (variant % 4 === 2 && out.gymTime) out.gymTime = '07:30';
    if (variant % 4 === 3 && d.football?.kind === 'allenamento') out.football = { ...d.football, time: '19:00' };
    return out;
  }).sort((a, b) => a.weekday - b.weekday);
}

/** Lavoro inventato: dalle 9 alle 13 e dalle 14 alle 18 nei giorni feriali. */
function withWork(week: ScheduleDay[], pattern: number): ScheduleDay[] {
  return week.map((d) => {
    if (pattern === 0 || d.weekday > 4) return d;
    if (pattern === 1) return { ...d, work: [{ from: '09:00', to: '13:00' }, { from: '14:00', to: '18:00' }] };
    if (pattern === 2) return { ...d, work: [{ from: '13:00', to: '21:00' }] };
    return d.weekday % 2 === 0 ? { ...d, work: [{ from: '06:00', to: '14:00' }] } : d;
  });
}

function allWeeks(p: Program): number[] {
  return p.weeks.map((_, k) => k + 1);
}

describe('buildBlock: la proposta nasce sempre e rispetta R1-R10 (§ 13.7, 29)', () => {
  it('per ogni posizione della partita e 20 settimane tipo, nessuna violazione dura', () => {
    let count = 0;
    for (let md = 0; md < 7; md++) {
      for (let v = 0; v < 20; v++) {
        const week = withWork(rotatedWeek(md, v), v % 4);
        const plan = basePlan({ week, training: TRAINING_PRESETS[v % 4 === 0 ? 0 : 6], ...(v % 5 === 0 ? { training: { primary: 'rapidita', secondary: 'potenza', spaces: ['corsia', 'campo'] } } : {}) });
        const res = buildBlock(input(plan));
        expect(res.program, `md ${md} v ${v}`).not.toBeNull();
        expect(res.violations, `md ${md} v ${v}: ${res.violations.map((x) => x.message).join('; ')}`).toEqual([]);
        // R10: dentro il 110% del riferimento, o con l'avviso.
        for (const l of res.weekLoads) {
          if (l.reference > 0 && l.football + l.controllable > l.reference * 1.1 + 1e-6) expect(res.warnings).toContain(FLOORS_ONLY_TEXT);
        }
        count++;
      }
    }
    expect(count).toBe(140);
  });

  it('senza un giorno per la palestra la proposta non nasce e lo dice', () => {
    const week = DEFAULT_WEEK.map((d) => ({ ...d, dayType: 'calcio' as const, football: d.football ?? { kind: 'allenamento' as const, time: '19:00', durationMin: 90 } }));
    const res = buildBlock(input(basePlan({ week })));
    expect(res.program).toBeNull();
    expect(res.reasons).toEqual([NO_GYM_DAY_TEXT]);
  });

  it('con la settimana predefinita: A il martedì, B il venerdì (MD−3), C facoltativa il sabato', () => {
    const res = buildBlock(input(basePlan()));
    expect(res.week).toBeUndefined();
    const week = basePlan().week;
    expect(dayOf(week, 1)?.gymSessionId).toBe('A');
    expect(dayOf(week, 4)?.gymSessionId).toBe('B');
    expect(mdDistance(4, week)).toBe(4);
    expect(Object.keys(res.program!.sessions).sort()).toEqual(['A', 'B', 'C']);
  });

  it('una settimana che viola R1-R7 viene corretta in patch.week e lo dice', () => {
    // Palestra B il giorno dopo la partita e A alla vigilia: vanno spostate.
    const week = DEFAULT_WEEK.map((d) => {
      if (d.weekday === 1) return { ...d, gymSessionId: 'B' };
      if (d.weekday === 4) return { ...d, gymSessionId: undefined, gymTime: undefined };
      if (d.weekday === 6) return { ...d, gymSessionId: 'A', gymTime: '10:00', dayType: 'palestra' as const };
      return d;
    });
    const res = buildBlock(input(basePlan({ week })));
    expect(res.week).toBeDefined();
    expect(res.violations).toEqual([]);
    expect(dayOf(res.week!, 6)?.gymSessionId).toBeUndefined();
    expect(dayOf(res.week!, 1)?.gymSessionId).not.toBe('B');
  });
});

describe('pavimenti, forza, contatti, arrotondamenti, durata (§ 13.7, 30-33)', () => {
  const cases: { label: string; plan: Plan; monday?: string }[] = [
    { label: 'stagione, senza infortuni', plan: basePlan() },
    { label: 'stagione, calcio', plan: basePlan({ training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza', spaces: ['corsia', 'campo'] } }) },
    { label: 'stagione, rapido', plan: basePlan({ training: { presetId: 'rapido', primary: 'rapidita', secondary: 'potenza', spaces: ['corsia'] } }) },
    {
      label: 'pausa, più forte',
      plan: basePlan({ season: { lastMatch: '2026-05-31', firstMatch: '2026-09-06' }, training: { presetId: 'forte', primary: 'forza', secondary: 'prevenzione', spaces: ['campo'] } }),
      monday: '2026-06-22',
    },
    {
      label: 'precampionato, calcio',
      plan: basePlan({ season: { lastMatch: '2026-05-31', firstMatch: '2026-09-06' }, training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza', spaces: ['corsia', 'campo'] } }),
      monday: '2026-08-03',
    },
  ];
  for (const c of cases) {
    it(c.label, () => {
      const res = buildBlock(input(c.plan, c.monday ? { monday: c.monday } : {}));
      const p = res.program!;
      expect(p).not.toBeNull();
      expect(res.violations).toEqual([]);
      const week = res.week ?? c.plan.week;
      const limits = (k: number) => contactLimitsFor(p.phase, p.weeks[k - 1] === 'rifinitura' ? 'rifinitura' : p.stage);
      const levels = new Set<number>();
      let lastLoading = -1;
      for (const k of allWeeks(p)) {
        const sessions = Object.keys(p.sessions).map((slot) => programSession(p, slot, k)!);
        // 30. Pavimenti della fase (meno il fisioterapista) e, in stagione, la forza di gambe.
        const req = requiredFloors(p.phase, { elbow: true });
        const done = floorsDone(sessions);
        const gym = sessions.filter((s) => !['K', 'R'].includes(s.id)).length;
        for (const [f, n] of Object.entries(req)) expect(done[f as keyof typeof done] ?? 0, `${c.label} settimana ${k} ${f}`).toBeGreaterThanOrEqual(Math.min(n!, gym));
        if (p.phase === 'stagione') expect(sessions.some((s) => items(s).some(isStrengthLegs))).toBe(true);
        // 31. Contatti per seduta e a settimana, livello costante.
        let weekContacts = 0;
        for (const s of sessions) {
          const ct = sessionContacts(s);
          expect(ct, `${c.label} ${s.id} settimana ${k}`).toBeLessThanOrEqual(limits(k).session);
          weekContacts += ct;
          levels.add(plyoLevel(s));
          // 33. Durata, catalogo, spazi, impatti riconosciuti.
          expect(sessionDuration(s).total, `${c.label} ${s.id} settimana ${k}`).toBeLessThanOrEqual((c.plan.training?.sessionMin ?? 60) + 5);
          for (const it of items(s)) {
            const ex = EXERCISES[it.exerciseId];
            expect(ex, it.exerciseId).toBeDefined();
            if (['pliometria', 'sprint'].includes(ex.category) && impactLevelOf(ex) > 0) expect(isImpactExercise(ex), ex.id).toBe(true);
            if (ex.pattern === 'aerobico' || ex.pattern === 'velocita-massima' || ex.pattern === 'accelerazione') {
              if (impactLevelOf(ex) > 0) expect(isImpactExercise(ex), ex.id).toBe(true);
            }
          }
        }
        expect(weekContacts).toBeLessThanOrEqual(limits(k).week);
        // Aumento tra due settimane di carico entro +20% (o +10 sotto i 50).
        if (p.weeks[k - 1] === 'carico') {
          if (lastLoading >= 0) expect(stepAllowed(lastLoading, weekContacts), `${c.label} settimana ${k}`).toBe(true);
          lastLoading = weekContacts;
        }
        // 34. Gambe multiarticolari mai sotto RIR 2 in stagione.
        if (p.phase === 'stagione') for (const s of sessions) for (const it of items(s)) if (isStrengthLegs(it) && it.rir !== undefined) expect(it.rir).toBeGreaterThanOrEqual(2);
        void week;
      }
      // Livello della pliometria mai cambiato dentro il blocco.
      expect(levels.size <= 2 && [...levels].filter((l) => l > 0).length <= 1).toBe(true);
    });
  }

  it('arrotondamenti del § 3.4 come uguaglianze (32)', () => {
    const p = buildBlock(input(basePlan({ training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza', spaces: ['corsia', 'campo'] } }))).program!;
    const deload = p.weeks.indexOf('scarico') + 1;
    expect(deload).toBe(4);
    for (const slot of Object.keys(p.sessions)) {
      const w1 = items(p.sessions[slot]);
      const w3 = items(programSession(p, slot, 3)!);
      const w4 = items(programSession(p, slot, deload)!);
      w1.forEach((it, i) => {
        expect(w4[i].sets).toBe(Math.max(1, Math.ceil(0.5 * it.sets)));
        if ((it.distanceM ?? 0) > 0) expect(w4[i].distanceM).toBe(Math.max(1, Math.floor(0.5 * it.distanceM!)));
        else if (itemContacts(it) > 0) expect(w4[i].repMax).toBe(Math.max(1, Math.floor(0.5 * it.repMax)));
        expect(w4[i].sets).toBeLessThanOrEqual(0.5 * w3[i].sets + 1);
      });
    }
    // Rifinitura del precampionato: serie × 0,6 per eccesso, contatti e metri × 0,6 per difetto.
    const plan = basePlan({ season: { lastMatch: '2026-05-31', firstMatch: '2026-09-06' }, training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza', spaces: ['corsia'] } });
    const pre = buildBlock(input(plan, { monday: '2026-08-03' })).program!;
    const last = pre.weeks.length;
    expect(pre.weeks[last - 1]).toBe('rifinitura');
    for (const slot of Object.keys(pre.sessions)) {
      const w1 = items(pre.sessions[slot]);
      const wl = items(programSession(pre, slot, last)!);
      w1.forEach((it, i) => {
        expect(wl[i].sets).toBe(Math.max(1, Math.ceil(0.6 * it.sets - 1e-9)));
        if (itemContacts(it) > 0 && !(it.distanceM ?? 0)) expect(wl[i].repMax).toBe(Math.max(1, Math.floor(0.6 * it.repMax + 1e-9)));
      });
    }
  });

  it('ogni esercizio del catalogo ha uno schema di movimento (33)', () => {
    for (const ex of Object.values(EXERCISES)) expect(ex.pattern, ex.id).toBeDefined();
  });
});

describe('R10, previsto contro previsto (§ 13.7, 34)', () => {
  it('in stagione senza nessun calcio registrato la proposta è uguale a quella con il calcio registrato', () => {
    const logs: FootballLog[] = Array.from({ length: 12 }, (_, i) => ({ id: `f${i}`, date: addDays('2026-10-12', i * 2), kind: 'partita', durationMin: 90, rpe: 8 }));
    const a = buildBlock(input(basePlan()));
    const b = buildBlock(input(basePlan(), { footballLogs: logs }));
    expect(b.program).toEqual(a.program);
    expect(b.weekLoads).toEqual(a.weekLoads);
  });

  const season: SeasonCalendar = { lastMatch: '2026-05-03', firstMatch: '2026-08-30', preseasonWeeks: 5 };
  /** Sei settimane di pausa con il blocco di sviluppo, poi il precampionato con 4 allenamenti di squadra. */
  function preseasonAfterBreak(withLogs: boolean) {
    const breakMonday = '2026-06-15';
    const breakPlan = basePlan({ season, training: { presetId: 'forte', primary: 'forza', secondary: 'prevenzione' } });
    const dev = buildBlock(input(breakPlan, { monday: breakMonday }));
    expect(dev.season.stage).toBe('sviluppo');
    const preMonday = '2026-07-27';
    const team: ScheduleDay[] = DEFAULT_WEEK.map((d) =>
      [1, 2, 3, 4].includes(d.weekday) ? { ...d, dayType: 'calcio' as const, gymSessionId: undefined, gymTime: undefined, gymOptional: undefined, football: { kind: 'allenamento' as const, time: '19:00', durationMin: 100 } } : d,
    );
    const plan: Plan = { ...breakPlan, week: dev.week!, program: dev.program!, seasonWeek: team };
    const logs: FootballLog[] = withLogs ? Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, date: addDays('2026-07-20', i), kind: 'allenamento', durationMin: 100, rpe: 7 })) : [];
    // Le sedute della pausa fatte tutte (la costanza conta per il blocco dopo).
    const workoutLogs: WorkoutLog[] = [];
    for (let i = 0; i < 42; i++) {
      const date = addDays(breakMonday, i);
      const day = dayOf(dev.week!, i % 7);
      if (day?.gymSessionId) workoutLogs.push({ id: `w${i}`, date, sessionId: day.gymSessionId, durationMin: 50, rpe: 6, pain: {}, exercises: [{ exerciseId: 'tyler-twist', sets: [{ weightKg: 0, reps: 15, done: true }] }] });
    }
    return { res: buildBlock(input(plan, { monday: preMonday, footballLogs: logs, workoutLogs })), plan };
  }

  it('il precampionato dopo 6 settimane di pausa nasce sempre: palestra ai pavimenti la prima settimana, poi in crescita', () => {
    for (const withLogs of [false, true]) {
      const { res } = preseasonAfterBreak(withLogs);
      expect(res.season.phase).toBe('precampionato');
      expect(res.program).not.toBeNull();
      expect(res.violations).toEqual([]);
      const l = res.weekLoads;
      // La prima settimana è stata tagliata (o tiene solo il minimo), le settimane di carico dopo crescono.
      expect(l[0].football + l[0].controllable <= l[0].reference * 1.1 + 1e-6 || res.warnings.includes(FLOORS_ONLY_TEXT)).toBe(true);
      expect(l[1].controllable).toBeGreaterThan(l[0].controllable);
      expect(res.reasons.join(' ')).toMatch(/riparte da poco/);
    }
    expect(preseasonAfterBreak(true).res.program).toEqual(preseasonAfterBreak(false).res.program);
  });

  it('lo sviluppo dopo la transizione nasce con 3 sedute di palestra e 2 di corsa', () => {
    const plan = basePlan({ season, training: { presetId: 'forte', primary: 'forza', secondary: 'prevenzione' } });
    const tr = buildBlock(input(plan, { monday: '2026-05-04' }));
    expect(tr.season.stage).toBe('transizione');
    expect(tr.program!.weeks).toEqual(['carico', 'carico']);
    const after: Plan = { ...plan, week: tr.week!, program: tr.program!, seasonWeek: tr.seasonWeek ?? undefined };
    const dev = buildBlock(input(after, { monday: '2026-05-18' }));
    expect(dev.season.stage).toBe('sviluppo');
    const slots = Object.keys(dev.program!.sessions).sort();
    expect(slots).toEqual(['A', 'B', 'C', 'K', 'R']);
    expect(dev.violations).toEqual([]);
  });

  it('plannedLoad somma il calcio previsto e la quota controllabile della settimana', () => {
    const plan = basePlan();
    const l = plannedLoad(MONDAY, plan);
    expect(l.football).toBe(90 * 7 + 60 * 6 + 90 * 6);
    expect(l.controllable).toBe((55 + 59 + 37) * 7);
  });
});

describe('obiettivi pronti e cambio di fase (§ 13.7, 58)', () => {
  const season: SeasonCalendar = { lastMatch: '2026-05-31', firstMatch: '2026-09-06', preseasonWeeks: 5 };
  const mondays: Record<string, string> = { stagione: '2026-11-09', pausa: '2026-06-22', precampionato: '2026-08-10' };
  for (const preset of TRAINING_PRESETS) {
    for (const phase of preset.phases) {
      it(`${preset.label} · ${phase}`, () => {
        const training: TrainingGoal = {
          presetId: preset.id,
          primary: preset.primary,
          secondary: preset.secondary,
          ...(preset.primary === 'rientro' ? { rientro: { site: 'Gomito', stage: 1 as const, since: '2026-06-01' } } : {}),
        };
        expect(normalizeTraining(training)).toEqual(training);
        const res = buildBlock(input(basePlan({ season, training }), { monday: mondays[phase] }));
        expect(res.season.phase).toBe(phase);
        expect(res.violations).toEqual([]);
        expect(res.training?.presetId ?? preset.id).toBe(preset.id);
      });
    }
  }

  it('«Pronto per la stagione» vale anche nelle ultime 4 settimane della pausa', () => {
    const training: TrainingGoal = { presetId: 'pronto', primary: 'resistenza', secondary: 'velocita' };
    const res = buildBlock(input(basePlan({ season, training }), { monday: '2026-07-13' }));
    expect(res.season.lateBreak).toBe(true);
    expect(res.training).toBeUndefined();
  });

  it('al cambio di fase un obiettivo non ammesso è sostituito e la differenza lo dice', () => {
    const training: TrainingGoal = { presetId: 'forte', primary: 'forza', secondary: 'prevenzione' };
    const state = appState(basePlan({ season, training }));
    const p = buildBlockProposal({ state, today: '2026-08-02', attempt: 0 })!;
    expect(p.patch.training?.presetId).toBe('calcio');
    expect(p.warnings?.join(' ')).toMatch(/Più forte/);
    expect(p.diff.some((d) => d.area === 'obiettivo')).toBe(true);
  });

  it('nel precampionato nessuna coppia ipertrofia più resistenza', () => {
    const training: TrainingGoal = { primary: 'resistenza', secondary: 'ipertrofia' };
    const res = buildBlock(input(basePlan({ season, training }), { monday: '2026-08-10' }));
    expect(res.training).toBeDefined();
    expect([res.training!.primary, res.training!.secondary]).not.toEqual(expect.arrayContaining(['ipertrofia', 'resistenza']));
  });
});

describe('rientro e fermo degli impatti (§ 13.7, 59, 60)', () => {
  const lowerStages = [0, 1, 2, 3, 4] as const;
  for (const stage of lowerStages) {
    for (const physioOk of [false, true]) {
      it(`zona sotto il ginocchio, stadio ${stage}${physioOk ? ' con il via libera' : ''}: nessun esercizio sopra il livello, tranne gli ammessi`, () => {
        const training: TrainingGoal = { primary: 'rientro', secondary: 'prevenzione', rientro: { site: 'Tibia', stage, since: '2026-11-01', ...(physioOk ? { physioOk } : {}) } };
        const res = buildBlock(input(basePlan({ training })));
        const p = res.program!;
        expect(res.violations).toEqual([]);
        const st = [0, 1, 1, 2, 3][stage];
        const allowed = [[], [], ['cammino-corsa', 'prova-saltello'], ['corsa-facile'], []][stage] as string[];
        let hops = 0;
        for (const s of Object.values(p.sessions)) {
          for (const it of items(s)) {
            if (it.exerciseId === 'prova-saltello') hops++;
            if (allowed.includes(it.exerciseId)) continue;
            expect(impactLevelOf(EXERCISES[it.exerciseId]), `${s.id} ${it.exerciseId}`).toBeLessThanOrEqual(st);
          }
        }
        // La prova del saltello solo nello stadio 2 con il via libera, una volta, fuori dai contatti.
        expect(hops).toBe(stage === 2 && physioOk ? 1 : 0);
      });
    }
  }

  it('con il fermo degli impatti: livello 0 in ogni seduta del blocco e rientro proposto', () => {
    const plan = basePlan({ impactHold: { site: 'Tibia', since: '2026-11-05' }, training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza', spaces: ['corsia', 'campo'] } });
    const res = buildBlock(input(plan));
    for (const s of Object.values(res.program!.sessions)) for (const it of items(s)) expect(impactLevelOf(EXERCISES[it.exerciseId]), it.exerciseId).toBe(0);
    expect(res.training?.rientro?.site).toBe('Tibia');
    expect(res.training?.rientro?.stage).toBe(0);
    expect(res.violations).toEqual([]);
  });
});

describe('R8 con la settimana predefinita (§ 13.7, 64)', () => {
  it('tibia sopra soglia negli ultimi 14 giorni: venerdì senza impatti, varianti di livello 0', () => {
    const checkIns: Record<string, CheckIn> = { '2026-11-03': { date: '2026-11-03', pain: { Tibia: 4 } } };
    const plan = basePlan({ training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza', spaces: ['corsia', 'campo'] } });
    expect(r8Active(plan, checkIns, '2026-11-08')).toBe(true);
    const res = buildBlock(input(plan, { checkIns }));
    expect(res.program).not.toBeNull();
    expect(res.violations).toEqual([]);
    const friday = dayOf(res.week ?? plan.week, 4)!;
    const b = res.program!.sessions[friday.gymSessionId!];
    for (const it of items(b)) expect(impactLevelOf(EXERCISES[it.exerciseId]), it.exerciseId).toBe(0);
    expect(res.reasons.join(' ')).toMatch(/senza impatto/);
    // Il validatore con R8 non trova impatti dopo due giorni di fila con impatti.
    for (const k of allWeeks(res.program!)) {
      expect(validateWeek({ ...plan, program: res.program! }, res.program!, k, { r8: true, painSites: SITES }).filter((x) => x.code === 'R8')).toEqual([]);
    }
  });
});

describe('blocco ripetuto senza approvazione (§ 13.7, 61)', () => {
  it('dopo 6 settimane senza approvare c’è almeno uno scarico e i contatti non superano quelli della settimana 2', () => {
    const p = buildBlock(input(basePlan({ training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza', spaces: ['corsia'] } }))).program!;
    const plan = basePlan({ program: p });
    const contacts = (k: number) => Object.keys(p.sessions).reduce((t, slot) => t + sessionContacts(sessionFor(slot, addDays(MONDAY, 7 * k + 4), plan)!), 0);
    const w2 = contacts(1);
    let deloads = 0;
    for (let k = 4; k < 10; k++) {
      expect(contacts(k)).toBeLessThanOrEqual(w2);
      if (programWeekDose(p, k)!.deload) deloads++;
    }
    expect(deloads).toBeGreaterThanOrEqual(1);
  });

  it('a un cambio di fase senza approvazione valgono le sedute fisse', () => {
    const season: SeasonCalendar = { lastMatch: '2026-12-13', firstMatch: '2027-02-28' };
    const p = buildBlock(input(basePlan({ season }), { monday: '2026-11-23' })).program!;
    expect(p.phase).toBe('stagione');
    const plan = basePlan({ season, program: p });
    expect(sessionFor('B', '2026-12-04', plan)).not.toBe(sessionFor('B', '2026-12-04', basePlan({ season })));
    expect(seasonOn('2026-12-18', season).phase).toBe('pausa');
    expect(sessionFor('B', '2026-12-18', plan)).toBe(sessionFor('B', '2026-12-18', basePlan({ season })));
  });
});

describe('forma del blocco (§ 3.1, § 3.4)', () => {
  it('4 settimane in stagione e nella pausa, 2 nella transizione, fino alla prima partita nel precampionato', () => {
    const season: SeasonCalendar = { lastMatch: '2026-05-31', firstMatch: '2026-09-06', preseasonWeeks: 5 };
    expect(blockShape(MONDAY, seasonOn(MONDAY, undefined), undefined).weeks).toEqual(['carico', 'carico', 'carico', 'scarico']);
    expect(blockShape('2026-06-01', seasonOn('2026-06-01', season), season).weeks).toEqual(['carico', 'carico']);
    expect(blockShape('2026-08-03', seasonOn('2026-08-03', season), season).weeks).toEqual(['carico', 'carico', 'carico', 'carico', 'rifinitura']);
    // Un blocco della pausa non scavalca il precampionato.
    expect(blockShape('2026-07-20', seasonOn('2026-07-20', season), season).weeks.length).toBe(2);
  });
});

// ───────────────────────── Proposte ─────────────────────────

function appState(plan: Plan, over: Partial<AppData> = {}): AppData {
  const base = defaultAppData('2026-11-02');
  return { ...base, onboarded: true, profile: { ...DEFAULT_PROFILE, birthYear: 1990, heightCm: 178, startWeightKg: 74, painSites: SITES }, plan, ...over };
}

describe('proposta del blocco (§ 5, § 13.3)', () => {
  it('nasce dal lunedì dopo, con effectiveFrom = program.start e approvabile fino al lunedì della partita', () => {
    const state = appState(basePlan({ training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza' } }));
    const p = buildBlockProposal({ state, today: '2026-11-08', attempt: 0 })!;
    expect(p.kind).toBe('blocco');
    expect(p.effectiveFrom).toBe('2026-11-09');
    expect(p.patch.program!.start).toBe(p.effectiveFrom);
    expect(p.approvableUntil).toBe('2026-11-09');
    expect(p.basis).toBe(planBasis('blocco', state));
    expect(p.title).toBe('Nuovo blocco dal 9 novembre');
    expect(p.reasons.length).toBeLessThanOrEqual(3);
    expect(p.diff.length).toBeGreaterThan(0);
  });

  it('stessa base, stesso id; un altro tentativo cambia l’id e resta valido; pesate e sedute non cambiano niente', () => {
    const state = appState(basePlan({ training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza', spaces: ['corsia'] } }));
    const a = buildBlockProposal({ state, today: '2026-11-08', attempt: 0 })!;
    const b = buildBlockProposal({ state, today: '2026-11-08', attempt: 0 })!;
    expect(b).toEqual(a);
    const c = buildBlockProposal({ state, today: '2026-11-08', attempt: 1 })!;
    expect(c.id).not.toBe(a.id);
    const res = buildBlock({ ...input(state.plan), attempt: 1 });
    expect(res.violations).toEqual([]);
    const weighed = appState(state.plan, { checkIns: { '2026-11-07': { date: '2026-11-07', weightKg: 73.5, pain: {} } } });
    expect(buildBlockProposal({ state: weighed, today: '2026-11-08', attempt: 0 })!.id).toBe(a.id);
  });

  it('obiettivo cambiato a metà blocco: la costanza conta le sedute fino a ieri, non quelle ancora da fare', () => {
    const program = buildBlock(input(basePlan({ training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza' } }))).program!;
    expect(program.start).toBe(MONDAY);
    // Seduta A di martedì fatta; mercoledì l'obiettivo cambia: la B di venerdì non è ancora mancata.
    const a = sessionFor('A', '2026-11-10', { program })!;
    const log: WorkoutLog = {
      id: 'w-prova',
      date: '2026-11-10',
      sessionId: 'A',
      durationMin: 50,
      rpe: 7,
      pain: {},
      exercises: items(a).map((it) => ({ exerciseId: it.exerciseId, sets: [{ weightKg: 10, reps: it.repMin, done: true }] })),
    };
    const plan = basePlan({ program, training: { presetId: 'forte', primary: 'forza', secondary: 'prevenzione' } });
    const midWeek = buildBlock(input(plan, { monday: '2026-11-16', workoutLogs: [log], today: '2026-11-11' }));
    expect(midWeek.review?.adherence).toBe(1);
    // Senza la giornata vale la fine del blocco prima del lunedì nuovo: la B di venerdì conta come mancata.
    const atEnd = buildBlock(input(plan, { monday: '2026-11-16', workoutLogs: [log] }));
    expect(atEnd.review?.adherence).toBeLessThan(1);
  });

  it('quando serve: fine del blocco, cambio di fase, obiettivo cambiato', () => {
    const p = buildBlock(input(basePlan())).program!;
    expect(blockTrigger({ program: p }, '2026-11-20')).toBeNull();
    expect(blockTrigger({ program: p }, '2026-12-06')).toBe('fine-blocco');
    expect(blockTrigger({ program: p, training: { primary: 'forza' } }, '2026-11-20')).toBe('obiettivo');
    expect(blockTrigger({ program: p, season: { lastMatch: '2026-11-15', firstMatch: '2027-03-01' } }, '2026-11-14')).toBe('fase');
    expect(blockTrigger({}, '2026-11-14')).toBeNull();
  });
});

describe('proposta degli obiettivi (§ 2.1, § 5)', () => {
  it('dimagrimento: −350 kcal, proteine 2,2 g/kg, da domani; il generatore registrabile la rifà dalla bozza', () => {
    const state = appState(basePlan(), { checkIns: { '2026-11-07': { date: '2026-11-07', weightKg: 74, pain: {} } } });
    const p = goalsProposal(state, '2026-11-08', { goal: 'dimagrimento' })!;
    expect(p.kind).toBe('obiettivi');
    expect(p.effectiveFrom).toBe('2026-11-09');
    expect(p.patch.goal).toBe('dimagrimento');
    expect(p.patch.goalDeltaKcal).toBe(-350);
    expect(p.patch.targets!.palestra.kcal).toBe(state.plan.targets.palestra.kcal - 350);
    expect(p.patch.targets!.palestra.proteinG).toBe(165);
    expect(p.subtitle).toBe('Dimagrimento: −350 kcal, mai a partita e vigilia');
    const again = buildGoalsProposal({ state, today: '2026-11-08', attempt: 0, previous: p });
    expect(again).toEqual(p);
  });

  it('senza cambi non nasce niente; un obiettivo di allenamento non ammesso nella fase è sostituito', () => {
    const state = appState(basePlan());
    expect(goalsProposal(state, '2026-11-08', { goal: state.profile.goal })).toBeNull();
    const pre = appState(basePlan({ season: { lastMatch: '2026-05-31', firstMatch: '2026-09-06' } }));
    const p = goalsProposal(pre, '2026-08-10', { training: { presetId: 'muscolo', primary: 'ipertrofia', secondary: 'forza' } })!;
    expect(p.patch.training?.presetId).not.toBe('muscolo');
  });
});

// ───────────────────────── Proprietà e determinismo ─────────────────────────

describe('a proprietà: molti profili, fasi, partite, lavoro e dolore (§ 13.2, § 13.7)', () => {
  it('nessuna violazione, contatti nei tetti, niente palestra nel lavoro, niente impatti oltre la soglia, determinismo', () => {
    const rng = mulberry32(20261109);
    const seasons: (SeasonCalendar | undefined)[] = [undefined, { lastMatch: '2026-05-31', firstMatch: '2026-09-06' }, { lastMatch: '2026-05-31', firstMatch: '2026-09-06', preseasonWeeks: 3 }];
    const mondays = ['2026-11-09', '2026-06-01', '2026-06-22', '2026-07-27', '2026-08-17', '2026-08-31'];
    const trainings: TrainingGoal[] = [
      ...TRAINING_PRESETS.filter((p) => p.primary !== 'rientro').map((p) => ({ presetId: p.id, primary: p.primary, secondary: p.secondary })),
      { primary: 'rientro', secondary: 'prevenzione', rientro: { site: 'Tibia', stage: 2, since: '2026-05-01', physioOk: true } },
      { primary: 'rientro', secondary: 'prevenzione', rientro: { site: 'Flessori', stage: 1, since: '2026-05-01' } },
    ];
    for (let n = 0; n < 300; n++) {
      const md = intBelow(rng, 7);
      const week = withWork(rotatedWeek(md, intBelow(rng, 20)), intBelow(rng, 4));
      const t = pick(trainings, rng)!;
      const training: TrainingGoal = {
        ...t,
        sessionMin: pick([30, 45, 60, 75, 90], rng),
        gymPerWeek: pick([1, 2, 3], rng),
        spaces: pick([[], ['corsia'], ['campo'], ['corsia', 'campo', 'casa']] as TrainingGoal['spaces'][], rng),
      };
      const season = pick(seasons, rng);
      const monday = season ? pick(mondays, rng)! : MONDAY;
      const pain = pick([0, 1, 2, 3, 5], rng)!;
      const checkIns: Record<string, CheckIn> = {};
      for (let i = 1; i <= 10; i++) {
        const d = addDays(monday, -i);
        checkIns[d] = { date: d, pain: { Tibia: i === 3 ? pain : Math.min(pain, 1) }, sleepHours: 7.5, energy: 7 };
      }
      const physio = n % 5 === 0 ? { exercises: [{ id: 'f-1', name: 'Nordic assistito del fisioterapista', category: 'fisio' as const, equipment: 'Elastico', cues: ['Lento', 'Controllato'] }], prescriptions: [{ exerciseId: 'f-1', sets: 2, repMin: 5, repMax: 5, unit: 'reps' as const, restSec: 60, progression: 'nessuna' as const }] } : NO_PHYSIO;
      const plan = basePlan({ week, training, ...(season ? { season } : {}), ...(n % 9 === 0 ? { impactHold: { site: 'Tibia', since: addDays(monday, -2) } } : {}) });
      const inp = input(plan, { monday, checkIns, physio, attempt: n % 3 });
      const res = buildBlock(inp);
      const label = `caso ${n} (md ${md}, ${training.presetId ?? training.primary}, ${seasonOn(monday, season).stage}, dolore ${pain})`;
      // Determinismo.
      expect(buildBlock(inp), label).toEqual(res);
      if (!res.program) {
        expect(res.reasons, label).toEqual([NO_GYM_DAY_TEXT]);
        continue;
      }
      expect(res.violations, `${label}: ${res.violations.map((x) => x.message).join('; ')}`).toEqual([]);
      const p = res.program;
      const finalWeek = res.week ?? plan.week;
      const r8 = r8Active(plan, checkIns, addDays(monday, -1)) || Boolean(plan.impactHold);
      for (const k of allWeeks(p)) {
        const limits = contactLimitsFor(p.phase, p.weeks[k - 1] === 'rifinitura' ? 'rifinitura' : p.stage);
        let weekContacts = 0;
        for (let wd = 0; wd < 7; wd++) {
          const day = dayOf(finalWeek, wd);
          if (!day?.gymSessionId) continue;
          const s = programSession(p, day.gymSessionId, k)!;
          const ct = sessionContacts(s);
          expect(ct, label).toBeLessThanOrEqual(limits.session);
          weekContacts += ct;
          // Mai nei blocchi di lavoro.
          const start = hhmmToMin(day.gymTime!);
          expect(overlapsWork(start, start + sessionDuration(s, physio).total, workSpans(day.work, plan)), `${label} giorno ${wd}`).toBe(false);
          // Nessun impatto con il dolore sotto il ginocchio oltre la soglia degli impatti (R8 e fermo).
          if (r8) for (const it of items(s)) expect(impactLevelOf(EXERCISES[it.exerciseId]), `${label} ${it.exerciseId}`).toBe(0);
          for (const it of items(s)) expect(itemMeters(it)).toBeGreaterThanOrEqual(0);
        }
        expect(weekContacts, label).toBeLessThanOrEqual(limits.week);
      }
      if (seasonOn(monday, season).phase === 'stagione' && matchWeekday(finalWeek) !== null) {
        expect(validateWeek({ ...plan, week: finalWeek, program: p }, p, 1, { painSites: SITES, physio, sessionMin: training.sessionMin, spaces: training.spaces }).filter((v) => v.hard && /^R[1-7]$/.test(v.code))).toEqual([]);
      }
    }
  });
});
