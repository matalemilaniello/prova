import { describe, expect, it } from 'vitest';
import type { AppData, CheckIn, ISODate, Proposal, WeeklyReview, WorkoutLog } from '../domain/types';
import { defaultAppData } from '../data/defaults';
import { buildDemo } from '../demo/seed';
import { addDays, weekDates } from './dates';
import { mealsForDate } from './menu';
import { recipeNutrition } from './nutrition';
import {
  acceptable,
  dayIntake,
  isReviewDay,
  kcalCorrection,
  loadingSince,
  previousReview,
  PROPOSAL_ORDER,
  proposalEffect,
  proposals,
  reviewAvailable,
  reviewFor,
  reviewScore,
  reviewWeekFor,
  skinfoldSum,
  slope,
  targetSleepHours,
  weekStats,
} from './review';

const START = '2026-11-02'; // lunedì
const W1 = START;
const W2 = '2026-11-09';

function base(start: ISODate = START): AppData {
  const d = defaultAppData(start);
  d.onboarded = true;
  d.profile = { ...d.profile, painSites: ['Tibia', 'Gomito'], startWeightKg: 70, heightCm: 178, birthYear: 1996 };
  return d;
}

function checkIn(d: AppData, date: ISODate, patch: Partial<CheckIn>) {
  d.checkIns[date] = { ...d.checkIns[date], date, pain: { ...(d.checkIns[date]?.pain ?? {}) }, ...patch };
}

/** Orari a letto per i giorni della settimana (null = nessun controllo). */
function bedtimes(d: AppData, ws: ISODate, beds: (string | null)[]) {
  weekDates(ws).forEach((date, i) => {
    const b = beds[i];
    if (b) checkIn(d, date, { bedTime: b, wakeTime: '07:15' });
  });
}

function weighIns(d: AppData, ws: ISODate, kg: (number | null)[]) {
  weekDates(ws).forEach((date, i) => {
    const w = kg[i];
    if (w !== null && w !== undefined) checkIn(d, date, { weightKg: w });
  });
}

const byId = (list: Proposal[], id: string) => list.find((p) => p.id === id);

describe('settimana della revisione', () => {
  it('la domenica si rivede la settimana in corso, gli altri giorni quella appena chiusa', () => {
    expect(reviewWeekFor('2026-11-15')).toBe(W2); // domenica
    expect(reviewWeekFor('2026-11-16')).toBe(W2); // lunedì dopo
    expect(reviewWeekFor('2026-11-14')).toBe(W1); // sabato
    expect(isReviewDay('2026-11-15')).toBe(true);
    expect(isReviewDay('2026-11-14')).toBe(false);
  });

  it('attraversa il cambio dell’ora legale senza perdere giorni', () => {
    // Domenica 25 ottobre 2026 finisce l’ora legale.
    expect(reviewWeekFor('2026-10-25')).toBe('2026-10-19');
    expect(reviewWeekFor('2026-10-26')).toBe('2026-10-19');
    const s = weekStats('2026-10-22', base('2026-10-05'));
    expect(s.weekStart).toBe('2026-10-19');
    expect(s.weekEnd).toBe('2026-10-25');
    expect(s.dates).toHaveLength(7);
  });

  it('non propone una revisione prima dell’inizio del piano', () => {
    const d = base();
    expect(reviewAvailable('2026-11-04', d.plan)).toBe(false);
    expect(reviewAvailable('2026-11-08', d.plan)).toBe(true);
    expect(reviewAvailable('2026-11-10', d.plan)).toBe(true);
  });
});

describe('sonno', () => {
  it('5 notti entro current + 15 minuti: anticipa di 15 minuti', () => {
    const d = base();
    bedtimes(d, W2, ['00:40', '00:55', '00:30', '01:00', '00:50', '01:30', '01:40']);
    const p = byId(proposals(W2, d), 'sonno')!;
    expect(p.apply).toEqual({ type: 'sleepCurrent', value: '00:30' });
    expect(p.title).toBe('A letto alle 00:30');
    expect(p.reason).toContain('5 notti su 7');
    expect(p.reason).toContain('Coprifuoco del telefono alle 00:00');
  });

  it('4 notti non bastano: resta l’orario attuale, proposta informativa', () => {
    const d = base();
    bedtimes(d, W2, ['00:40', '00:55', '00:30', '01:01', '01:20', '01:30', '00:45']);
    const p = byId(proposals(W2, d), 'sonno')!;
    expect(p.apply).toBeUndefined();
    expect(p.title).toBe('Resta a letto alle 00:45');
    expect(p.reason).toContain('4 notti su 7');
  });

  it('si ferma all’obiettivo, anche con un passo più corto', () => {
    const d = base();
    d.plan.sleep.current = '23:40';
    bedtimes(d, W2, ['23:45', '23:30', '23:50', '23:40', '23:35', null, '23:55']);
    const p = byId(proposals(W2, d), 'sonno')!;
    expect(p.apply).toEqual({ type: 'sleepCurrent', value: '23:30' });
    expect(p.reason).toContain('anticipa di 10 minuti');

    d.plan.sleep.current = '23:30';
    bedtimes(d, W2, ['23:45', '23:30', '23:40', '23:40', '23:35', null, '23:55']);
    const done = byId(proposals(W2, d), 'sonno')!;
    expect(done.apply).toBeUndefined();
    expect(done.title).toContain('Obiettivo raggiunto');
  });

  it('senza orari registrati non inventa niente', () => {
    const p = byId(proposals(W2, base()), 'sonno')!;
    expect(p.apply).toBeUndefined();
    expect(p.reason).toContain('Nessun orario');
  });

  it('conta solo le notti della settimana', () => {
    const d = base();
    bedtimes(d, W1, ['00:30', '00:30', '00:30', '00:30', '00:30', '00:30', '00:30']);
    bedtimes(d, W2, ['02:00', null, null, null, null, null, '00:30']);
    const s = weekStats(W2, d);
    expect(s.nightsWithBedtime).toBe(2);
    expect(s.nightsOnTarget).toBe(1);
  });
});

describe('calorie e peso', () => {
  it('servono almeno 4 pesate', () => {
    const d = base();
    weighIns(d, W1, [70, 70.1, 70, 69.9, null, null, null]);
    weighIns(d, W2, [69, null, 69.1, null, 69, null, null]);
    const list = proposals(W2, d);
    expect(byId(list, 'calorie')).toBeUndefined();
    const p = byId(list, 'peso')!;
    expect(p.reason).toContain('3 pesate');
    expect(p.apply).toEqual({ type: 'none' });
  });

  it('ricomposizione: calo oltre lo 0,5% → +150 kcal', () => {
    const d = base();
    weighIns(d, W1, [70.0, 70.1, 69.9, 70.0, null, null, null]);
    weighIns(d, W2, [69.5, 69.6, 69.4, null, 69.5, null, null]);
    const s = weekStats(W2, d);
    expect(s.weightDeltaSource).toBe('confronto');
    expect(s.weightDelta).toBeCloseTo(-0.5, 2);
    expect(s.weightDeltaPct!).toBeLessThan(-0.005);
    const p = byId(proposals(W2, d), 'calorie')!;
    expect(p.apply).toEqual({ type: 'kcalDelta', value: 150 });
    expect(p.title).toBe('+150 kcal al giorno');
    expect(p.reason).toMatch(/69,5\skg/);
  });

  it('ricomposizione: aumento oltre lo 0,5% → −100 kcal', () => {
    const d = base();
    weighIns(d, W1, [70.0, 70.0, 70.0, null, null, null, null]);
    weighIns(d, W2, [70.5, 70.4, 70.5, 70.4, null, null, null]);
    const p = byId(proposals(W2, d), 'calorie')!;
    expect(p.apply).toEqual({ type: 'kcalDelta', value: -100 });
    expect(p.title).toBe('−100 kcal al giorno');
  });

  it('ricomposizione: peso stabile → calorie invariate, proposta informativa', () => {
    const d = base();
    weighIns(d, W1, [70.0, 70.1, 69.9, 70.0, null, null, null]);
    weighIns(d, W2, [69.9, 70.0, 70.1, 69.8, null, null, null]);
    const p = byId(proposals(W2, d), 'calorie')!;
    expect(p.apply).toBeUndefined();
    expect(p.title).toBe('Calorie invariate');
  });

  it('senza la settimana prima usa la pendenza della settimana', () => {
    const d = base();
    weighIns(d, W2, [70.6, 70.4, 70.3, 70.1, 70.0, 69.8, null]);
    const s = weekStats(W2, d);
    expect(s.weightDeltaSource).toBe('pendenza');
    expect(s.weightDelta!).toBeLessThan(-0.5);
    expect(byId(proposals(W2, d), 'calorie')!.apply).toEqual({ type: 'kcalDelta', value: 150 });
  });

  it('le altre fasi hanno fasce proprie', () => {
    expect(kcalCorrection('ricomposizione', -0.006)).toBe(150);
    expect(kcalCorrection('ricomposizione', 0.006)).toBe(-100);
    expect(kcalCorrection('ricomposizione', 0.004)).toBe(0);
    expect(kcalCorrection('mantenimento', -0.006)).toBe(150);
    expect(kcalCorrection('dimagrimento', -0.001)).toBe(-150);
    expect(kcalCorrection('dimagrimento', -0.007)).toBe(0);
    expect(kcalCorrection('dimagrimento', -0.012)).toBe(150);
    expect(kcalCorrection('massa', 0)).toBe(150);
    expect(kcalCorrection('massa', 0.003)).toBe(0);
    expect(kcalCorrection('massa', 0.007)).toBe(-100);
  });
});

describe('fibre e proteine dai pasti segnati', () => {
  function markMeals(d: AppData, date: ISODate, st: 'fatto' | 'sostituito' | 'saltato') {
    const status: Record<string, 'fatto' | 'sostituito' | 'saltato'> = {};
    for (const m of mealsForDate(date, d).meals) status[`pasto:${m.slot}`] = st;
    d.dayLogs[date] = { date, status, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {} };
  }

  it('fatto conta tutto, sostituito metà, saltato niente', () => {
    const d = base();
    const date = addDays(W2, 1);
    const meals = mealsForDate(date, d);
    const planned = meals.meals.reduce((s, m) => s + recipeNutrition(m.recipe, meals.dayType).fiberG, 0);
    markMeals(d, date, 'fatto');
    expect(dayIntake(date, d).fiberG).toBeCloseTo(planned, 5);
    markMeals(d, date, 'sostituito');
    expect(dayIntake(date, d).fiberG).toBeCloseTo(planned / 2, 5);
    markMeals(d, date, 'saltato');
    expect(dayIntake(date, d)).toMatchObject({ fiberG: 0, logged: true });
    expect(dayIntake(addDays(W2, 2), d).logged).toBe(false);
  });

  it('pochi pasti segnati per giorni: proposta concreta sulle fibre', () => {
    const d = base();
    for (let i = 0; i < 4; i++) markMeals(d, addDays(W2, i), 'saltato');
    const p = byId(proposals(W2, d), 'fibre')!;
    expect(p).toBeDefined();
    expect(p.reason).toMatch(/vellutata/);
    expect(p.reason).toMatch(/legumi/);
    expect(p.reason).toMatch(/frutto/);
  });

  it('il menù seguito per intero non fa scattare la proposta', () => {
    const d = base();
    for (const date of weekDates(W2)) markMeals(d, date, 'fatto');
    const s = weekStats(W2, d);
    expect(s.nutritionDays).toBe(7);
    expect(s.fiberAvgG!).toBeGreaterThanOrEqual(s.fiberTargetG - 5);
    expect(s.proteinAvgG!).toBeGreaterThan(100);
    expect(byId(proposals(W2, d), 'fibre')).toBeUndefined();
  });

  it('servono almeno 3 giorni di dati, e oggi non conta', () => {
    const d = base();
    markMeals(d, addDays(W2, 0), 'saltato');
    markMeals(d, addDays(W2, 1), 'saltato');
    markMeals(d, addDays(W2, 2), 'saltato');
    expect(byId(proposals(W2, d, { today: addDays(W2, 2) }), 'fibre')).toBeUndefined();
    expect(byId(proposals(W2, d, { today: addDays(W2, 3) }), 'fibre')).toBeDefined();
  });
});

describe('dolore', () => {
  function pains(d: AppData, ws: ISODate, site: string, values: (number | null)[]) {
    weekDates(ws).forEach((date, i) => {
      const v = values[i];
      if (v === null || v === undefined) return;
      checkIn(d, date, { pain: { ...(d.checkIns[date]?.pain ?? {}), [site]: v } });
    });
  }

  it('media sopra soglia: riduci il carico e senti il fisioterapista', () => {
    const d = base();
    pains(d, W2, 'Tibia', [4, 4, 3, 4, 4, 3, 4]);
    const s = weekStats(W2, d);
    const tibia = s.pain.find((p) => p.site === 'Tibia')!;
    expect(tibia.avg).toBeCloseTo(3.7, 1);
    expect(tibia.overThreshold).toBe(true);
    const p = byId(proposals(W2, d), 'dolore')!;
    expect(p.title).toBe('Tibia: riduci il carico');
    expect(p.reason).toContain('sopra la soglia di 3');
    expect(p.reason).toContain('fisioterapista');
  });

  it('in aumento rispetto alla settimana prima, con il consiglio per il gomito', () => {
    const d = base();
    pains(d, W1, 'Gomito', [1, 1, 2, 1, 1, 2, 1]);
    pains(d, W2, 'Gomito', [2, 2, 3, 2, 2, 3, 2]);
    const g = weekStats(W2, d).pain.find((p) => p.site === 'Gomito')!;
    expect(g.trend).toBe('su');
    expect(g.overThreshold).toBe(false);
    const p = byId(proposals(W2, d), 'dolore')!;
    expect(p.reason).toContain('Gomito in aumento da 1,3 a 2,3');
    expect(p.reason).toContain('presa neutra');
  });

  it('dolore basso e in calo: nessuna proposta', () => {
    const d = base();
    pains(d, W1, 'Tibia', [3, 3, 2, 3, 2, 2, 2]);
    pains(d, W2, 'Tibia', [2, 1, 2, 1, 1, 1, 1]);
    const t = weekStats(W2, d).pain.find((p) => p.site === 'Tibia')!;
    expect(t.trend).toBe('giu');
    expect(byId(proposals(W2, d), 'dolore')).toBeUndefined();
  });

  it('senza la settimana prima guarda l’andamento dentro la settimana', () => {
    const d = base();
    pains(d, W2, 'Tibia', [0, 1, 1, 2, 2, 3, 3]);
    const t = weekStats(W2, d).pain.find((p) => p.site === 'Tibia')!;
    expect(t.prevAvg).toBeNull();
    expect(t.trend).toBe('su');
  });
});

describe('carico, dolci e scarico', () => {
  const workout = (date: ISODate, durationMin = 60, rpe = 7): WorkoutLog => ({
    id: `w-${date}-${durationMin}`,
    date,
    sessionId: 'A',
    durationMin,
    rpe,
    pain: {},
    exercises: [],
  });

  it('allarme del carico: settimana più leggera, seduta C saltata', () => {
    const d = base('2026-10-05');
    for (let k = 1; k <= 4; k++) {
      const ws = addDays(W2, -7 * k);
      d.workoutLogs.push(workout(addDays(ws, 1)), workout(addDays(ws, 4)));
    }
    d.workoutLogs.push(workout(addDays(W2, 1)), workout(addDays(W2, 4)), workout(addDays(W2, 5), 70, 8));
    const s = weekStats(W2, d);
    expect(s.loadStatus.alert).toBe(true);
    expect(s.gymSessions).toBe(3);
    const p = byId(proposals(W2, d), 'allenamento')!;
    expect(p.title).toBe('Settimana più leggera');
    expect(p.reason).toContain('Salta la seduta C facoltativa');
    expect(p.reason).toContain('soglia 120%');
  });

  it('dolci oltre quelli previsti: merenda proteica e dolce dopo cena', () => {
    const d = base();
    weekDates(W2).forEach((date, i) => {
      d.dayLogs[date] = { date, status: {}, notes: {}, minimal: false, waterGlasses: 0, sweets: i < 5 ? 1 : 0, recipeSwaps: {} };
    });
    const s = weekStats(W2, d);
    expect(s.sweets).toBe(5);
    expect(s.sweetsExtra).toBe(2);
    const p = byId(proposals(W2, d), 'dolci')!;
    expect(p.reason).toContain('5 dolci su 3 previsti');
    expect(p.reason).toContain('16:30');
    expect(p.reason).toContain('dopo cena');

    d.dayLogs[addDays(W2, 4)].sweets = 0;
    d.dayLogs[addDays(W2, 3)].sweets = 0;
    expect(byId(proposals(W2, d), 'dolci')).toBeUndefined();
  });

  it('scarico dopo 6 settimane di lavoro dall’inizio del piano', () => {
    const d = base('2026-10-05');
    expect(weekStats('2026-11-02', d).weekNumber).toBe(5);
    expect(byId(proposals('2026-11-02', d), 'scarico')).toBeUndefined();
    const p = byId(proposals(W2, d), 'scarico')!;
    expect(p.reason).toContain('6 settimane di lavoro dall’inizio del piano');
  });

  it('dopo uno scarico accettato si riparte a contare', () => {
    const d = base('2026-09-07');
    d.reviews = [{ weekStart: '2026-10-12', votes: { energia: 7, digestione: 7, umore: 7, campo: 7 }, acceptedProposals: ['scarico'] }];
    expect(loadingSince(W2, d)).toBe('2026-10-26');
    expect(byId(proposals(W2, d), 'scarico')).toBeUndefined();
    expect(byId(proposals('2026-11-30', d), 'scarico')).toBeDefined();
  });

  it('scarico anticipato: 3 notti sotto le 6 ore e dolore in aumento', () => {
    const d = base();
    weekDates(W1).forEach((date) => checkIn(d, date, { pain: { Tibia: 1 } }));
    weekDates(W2).forEach((date, i) =>
      checkIn(d, date, { sleepHours: i < 3 ? 5.4 : 7, pain: { Tibia: 2 } }),
    );
    const p = byId(proposals(W2, d), 'scarico')!;
    expect(p.reason).toContain('3 notti sotto le 6 ore');
    expect(p.reason).toContain('tibia in aumento');
  });
});

describe('numeri della settimana', () => {
  it('aderenza solo sui giorni passati e dentro il piano', () => {
    const d = base();
    const s = weekStats(W1, d, { today: addDays(W1, 3) });
    expect(s.adherenceDays).toBe(3);
    expect(s.complete).toBe(false);
    expect(s.adherence).toBe(0);
    const before = weekStats('2026-10-26', d);
    expect(before.adherenceDays).toBe(0);
    expect(before.adherence).toBeNull();
  });

  it('sonno medio, notti corte ed energia', () => {
    const d = base();
    weekDates(W2).forEach((date, i) => checkIn(d, date, { sleepHours: i < 2 ? 5.5 : 7.5, energy: 7 }));
    const s = weekStats(W2, d);
    expect(s.sleepNights).toBe(7);
    expect(s.sleepAvgH).toBeCloseTo((2 * 5.5 + 5 * 7.5) / 7, 5);
    expect(s.shortNights).toBe(2);
    expect(s.energyAvg).toBe(7);
  });

  it('pendenza ai minimi quadrati', () => {
    expect(slope([{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }])).toBeCloseTo(1);
    expect(slope([{ x: 0, y: 1 }])).toBeNull();
  });
});

describe('proposte e revisioni', () => {
  it('ordine stabile, un id per area, sonno e calorie sempre presenti', () => {
    const d = base();
    bedtimes(d, W2, ['00:40', '00:55', '00:30', '01:00', '00:50', '01:30', '01:40']);
    weighIns(d, W1, [70.0, 70.1, 69.9, 70.0, null, null, null]);
    weighIns(d, W2, [69.5, 69.6, 69.4, null, 69.5, null, null]);
    weekDates(W2).forEach((date) => {
      d.dayLogs[date] = { date, status: {}, notes: {}, minimal: false, waterGlasses: 0, sweets: 1, recipeSwaps: {} };
    });
    const list = proposals(W2, d);
    const ids = list.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 2)).toEqual(['sonno', 'calorie']);
    const order = list.map((p) => PROPOSAL_ORDER.indexOf(p.area));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(acceptable(list).map((p) => p.id)).toEqual(expect.arrayContaining(['sonno', 'calorie', 'dolci']));
    expect(list.every((p) => !/—/.test(p.title + p.reason))).toBe(true);
  });

  it('effetti, voto medio, pliche e revisione precedente', () => {
    expect(proposalEffect({ id: 's', area: 'sonno', title: '', reason: '', apply: { type: 'sleepCurrent', value: '00:30' } })).toBe('a letto alle 00:30');
    expect(proposalEffect({ id: 'c', area: 'calorie', title: '', reason: '', apply: { type: 'kcalDelta', value: 150 } })).toBe('+150 kcal');
    expect(proposalEffect({ id: 'c', area: 'calorie', title: '', reason: '', apply: { type: 'kcalDelta', value: -100 } })).toBe('−100 kcal');
    expect(proposalEffect({ id: 'f', area: 'fibre', title: '', reason: '', apply: { type: 'none' } })).toBeNull();
    const r1: WeeklyReview = { weekStart: W1, votes: { energia: 6, digestione: 7, umore: 8, campo: 7 }, acceptedProposals: [], skinfolds: { Addome: 18, Coscia: 12.5 } };
    const r2: WeeklyReview = { weekStart: W2, votes: { energia: 8, digestione: 8, umore: 8, campo: 9 }, acceptedProposals: [] };
    expect(reviewScore(r1)).toBe(7);
    expect(skinfoldSum(r1)).toBe(30.5);
    expect(skinfoldSum(r2)).toBeNull();
    expect(previousReview('2026-11-16', [r2, r1])?.weekStart).toBe(W2);
    expect(previousReview(W2, [r2, r1])?.weekStart).toBe(W1);
    expect(reviewFor('2026-11-12', [r1, r2])?.weekStart).toBe(W2);
    expect(targetSleepHours(base().plan)).toBeCloseTo(7.75);
  });

  it('dati di esempio: numeri sensati e proposte valide', () => {
    for (const today of ['2026-10-31', '2026-11-01', '2026-11-10']) {
      const demo = buildDemo(today);
      const ws = reviewWeekFor(today);
      const s = weekStats(ws, demo, { today });
      expect(s.weighIns).toBeGreaterThanOrEqual(4);
      expect(s.weightAvg!).toBeGreaterThan(68);
      expect(s.weightAvg!).toBeLessThan(72);
      expect(s.adherence!).toBeGreaterThan(0.3);
      expect(s.sleepAvgH!).toBeGreaterThan(5.5);
      expect(s.pain.map((p) => p.site)).toEqual(expect.arrayContaining(['Tibia', 'Gomito']));
      const list = proposals(ws, demo, { today });
      expect(list.length).toBeGreaterThanOrEqual(2);
      for (const p of list) {
        expect(p.title.length).toBeGreaterThan(4);
        expect(p.reason).not.toMatch(/NaN|undefined|—/);
      }
    }
  });
});
