import { describe, expect, it } from 'vitest';
import type { AppData, CheckIn, ISODate, Proposal, WeeklyReview, WorkoutLog } from '../domain/types';
import { defaultAppData } from '../data/defaults';
import { buildDemo } from '../demo/seed';
import { addDays, weekDates } from './dates';
import { mealsForDate } from './menu';
import { buildDay } from './timeline';
import { dayNutrition, recipeNutrition } from './nutrition';
import {
  acceptable,
  appliesToPlan,
  changesPlan,
  creatineLoading,
  DEFICIT_AT_CAP_TEXT,
  firstReviewDate,
  firstReviewWeek,
  isReviewableWeek,
  periodStats,
  planOnEvening,
  planWeekNumber,
  sleepPhaseOn,
  dayIntake,
  fiberAdditions,
  proposeWeeklyStep,
  reviewStart,
  STEP_ITEM_ID,
  stepProgress,
  weeklyStepStatus,
  isReviewDay,
  kcalCorrection,
  loadingSince,
  needsDecision,
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
  d.profile = { ...d.profile, painSites: ['Ginocchio', 'Spalla'], startWeightKg: 76, heightCm: 180, birthYear: 1988 };
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
    d.plan.sleep.target = '23:30';
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
    weighIns(d, W1, [76, 76.1, 76, 75.9, null, null, null]);
    weighIns(d, W2, [75, null, 75.1, null, 75, null, null]);
    const list = proposals(W2, d);
    expect(byId(list, 'calorie')).toBeUndefined();
    const p = byId(list, 'peso')!;
    expect(p.reason).toContain('3 pesate');
    expect(p.apply).toEqual({ type: 'none' });
  });

  it('ricomposizione: calo oltre lo 0,5% → +150 kcal', () => {
    const d = base();
    weighIns(d, W1, [76.0, 76.1, 75.9, 76.0, null, null, null]);
    weighIns(d, W2, [75.5, 75.6, 75.4, null, 75.5, null, null]);
    const s = weekStats(W2, d);
    expect(s.weightDeltaSource).toBe('confronto');
    expect(s.weightDelta).toBeCloseTo(-0.5, 2);
    expect(s.weightDeltaPct!).toBeLessThan(-0.005);
    const p = byId(proposals(W2, d), 'calorie')!;
    expect(p.apply).toEqual({ type: 'kcalDelta', value: 150 });
    expect(p.title).toBe('+150 kcal al giorno');
    expect(p.reason).toMatch(/75,5\skg/);
  });

  it('ricomposizione: aumento oltre lo 0,5% → −100 kcal (dopo le prime settimane di creatina)', () => {
    const d = base('2026-10-05');
    weighIns(d, W1, [76.0, 76.0, 76.0, null, null, null, null]);
    weighIns(d, W2, [76.5, 76.4, 76.5, 76.4, null, null, null]);
    const p = byId(proposals(W2, d), 'calorie')!;
    expect(p.apply).toEqual({ type: 'kcalDelta', value: -100 });
    expect(p.title).toBe('−100 kcal al giorno');
  });

  it('creatina nelle prime 4 settimane: il peso in salita è acqua, calorie invariate', () => {
    const d = base();
    expect(creatineLoading(W2, d.plan)).toBe(true);
    weighIns(d, W1, [76.0, 76.0, 76.0, null, null, null, null]);
    weighIns(d, W2, [76.5, 76.4, 76.5, 76.4, null, null, null]);
    const p = byId(proposals(W2, d), 'calorie')!;
    expect(p.apply).toBeUndefined();
    expect(p.title).toBe('Calorie invariate');
    expect(p.reason).toContain('creatina');
    expect(p.reason).toContain('acqua');
    expect(p.reason).toContain('ricontrolliamo tra una settimana');
    // Senza creatina attiva la correzione torna.
    d.plan.supplements = d.plan.supplements.map((x) => (x.id === 'creatina' ? { ...x, active: false } : x));
    expect(creatineLoading(W2, d.plan)).toBe(false);
    expect(byId(proposals(W2, d), 'calorie')!.apply).toEqual({ type: 'kcalDelta', value: -100 });
  });

  it('creatina: un calo resta un calo, la regola vale solo per il peso in salita', () => {
    const d = base();
    weighIns(d, W1, [76.0, 76.1, 75.9, 76.0, null, null, null]);
    weighIns(d, W2, [75.5, 75.6, 75.4, null, 75.5, null, null]);
    expect(byId(proposals(W2, d), 'calorie')!.apply).toEqual({ type: 'kcalDelta', value: 150 });
    expect(creatineLoading('2026-11-30', d.plan)).toBe(false);
  });

  it('ricomposizione: peso stabile → calorie invariate, proposta informativa', () => {
    const d = base();
    weighIns(d, W1, [76.0, 76.1, 75.9, 76.0, null, null, null]);
    weighIns(d, W2, [75.9, 76.0, 76.1, 75.8, null, null, null]);
    const p = byId(proposals(W2, d), 'calorie')!;
    expect(p.apply).toBeUndefined();
    expect(p.title).toBe('Calorie invariate');
  });

  it('senza la settimana prima usa la pendenza della settimana', () => {
    const d = base();
    weighIns(d, W2, [76.6, 76.4, 76.3, 76.1, 76.0, 75.8, null]);
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
  type MealStatus = 'fatto' | 'sostituito' | 'saltato';
  /** Segna i pasti del giorno: uno stato per tutti, oppure uno per pasto (undefined = non segnato). */
  function markMeals(d: AppData, date: ISODate, st: MealStatus | Partial<Record<string, MealStatus>>) {
    const status: Record<string, MealStatus> = {};
    for (const m of mealsForDate(date, d).meals) {
      const v = typeof st === 'string' ? st : st[m.slot];
      if (v) status[`pasto:${m.slot}`] = v;
    }
    d.dayLogs[date] = { date, status, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {} };
  }
  const plannedFiber = (d: AppData, date: ISODate) => dayNutrition(date, d).fiberG;

  it('fatto conta tutto, sostituito metà, saltato niente', () => {
    const d = base();
    const date = addDays(W2, 1);
    const meals = mealsForDate(date, d);
    const planned = meals.meals.reduce((s, m) => s + recipeNutrition(m.recipe, meals.dayType).fiberG, 0);
    markMeals(d, date, 'fatto');
    expect(dayIntake(date, d).fiberG).toBeCloseTo(planned, 5);
    expect(dayIntake(date, d).planned.fiberG).toBeCloseTo(plannedFiber(d, date), 5);
    markMeals(d, date, 'sostituito');
    expect(dayIntake(date, d).fiberG).toBeCloseTo(planned / 2, 5);
    markMeals(d, date, 'saltato');
    expect(dayIntake(date, d)).toMatchObject({ fiberG: 0, logged: true, mealsLogged: 5 });
    expect(dayIntake(addDays(W2, 2), d).logged).toBe(false);
  });

  it('i pasti non segnati non contano come saltati', () => {
    const d = base();
    // Solo colazione, pranzo e cena segnati, tutti fatti: la stima è il menù intero, non tre quinti.
    for (const date of weekDates(W2)) markMeals(d, date, { colazione: 'fatto', pranzo: 'fatto', cena: 'fatto' });
    const s = weekStats(W2, d);
    const menu = weekDates(W2).reduce((sum, date) => sum + plannedFiber(d, date), 0) / 7;
    expect(s.fiberPlannedG!).toBeCloseTo(menu, 0);
    expect(s.fiberAvgG!).toBeCloseTo(menu, 0);
    expect(s.mealsLogged).toBe(21);
    expect(s.mealsCounted).toBe(35);
    expect(s.fiberLow).toBe(false);
    expect(byId(proposals(W2, d), 'fibre')).toBeUndefined();
  });

  it('menù sufficiente e pasti saltati: dice quale pasto tenere, senza aggiungere cibo', () => {
    const d = base();
    for (let i = 0; i < 5; i++) markMeals(d, addDays(W2, i), { colazione: 'fatto', spuntino: 'fatto', pranzo: 'sostituito', merenda: 'fatto', cena: 'saltato' });
    const s = weekStats(W2, d);
    expect(s.fiberPlannedG!).toBeGreaterThanOrEqual(s.fiberTargetG - 2);
    expect(s.fiberLow).toBe(true);
    expect(s.mealsReplaced).toBe(5);
    expect(s.mealsSkipped).toBe(5);
    const p = byId(proposals(W2, d), 'fibre')!;
    expect(p.title).toBe('Le fibre si perdono fuori menù');
    expect(p.reason).toMatch(new RegExp(`Il menù ne porta circa ${Math.round(s.fiberPlannedG!)}\\sg`));
    expect(p.reason).toMatch(/nei 10\spasti sostituiti o saltati, soprattutto la cena/);
    expect(p.reason).toContain('verdure surgelate');
    expect(p.reason).not.toMatch(/vellutata|legumi in barattolo|in più/);
  });

  it('un solo pasto fuori menù: lo nomina, con l’articolo giusto', () => {
    const d = base();
    // Tre pasti segnati al giorno (il minimo perché il giorno conti), la cena è quello che pesa di più.
    markMeals(d, addDays(W2, 0), { spuntino: 'fatto', merenda: 'fatto', cena: 'fatto' });
    markMeals(d, addDays(W2, 1), { spuntino: 'fatto', merenda: 'fatto', cena: 'saltato' });
    markMeals(d, addDays(W2, 2), { spuntino: 'fatto', merenda: 'fatto', cena: 'fatto' });
    // Obiettivo appena sopra il menù: il menù basta, la cena saltata porta la stima sotto il margine.
    const menu = [0, 1, 2].reduce((sum, i) => sum + plannedFiber(d, addDays(W2, i)), 0) / 3;
    for (const t of Object.values(d.plan.targets)) t.fiberG = Math.round(menu) + 1;
    const p = byId(proposals(W2, d, { today: addDays(W2, 3) }), 'fibre')!;
    expect(p.reason).toContain('mancano nella cena saltata');
    // Davanti a "otto" l'articolo è "gli".
    for (let i = 0; i < 4; i++) markMeals(d, addDays(W2, i), { colazione: 'fatto', spuntino: 'fatto', pranzo: 'saltato', merenda: 'fatto', cena: i < 3 ? 'saltato' : 'sostituito' });
    expect(byId(proposals(W2, d, { today: addDays(W2, 4) }), 'fibre')!.reason).toMatch(/negli 8\spasti sostituiti o saltati/);
  });

  it('il piano B al bar conta con i valori dell’ordine, non come mezzo pasto', () => {
    const d = base();
    const date = addDays(W2, 1);
    markMeals(d, date, { colazione: 'fatto', spuntino: 'fatto', pranzo: 'fatto', merenda: 'fatto', cena: 'saltato' });
    const skipped = dayIntake(date, d);
    // Stessa cena sostituita con un ordine al bar da 39 g di proteine e 5 g di fibre.
    d.dayLogs[date].status['pasto:cena'] = 'sostituito';
    d.dayLogs[date].barMeals = { cena: { label: 'Panino con pollo e yogurt con frutta', nutrients: { kcal: 555, proteinG: 39, carbG: 74, fatG: 12, fiberG: 5 }, vegPortions: 1 } };
    const bar = dayIntake(date, d);
    expect(bar.proteinG - skipped.proteinG).toBeCloseTo(39, 6);
    expect(bar.fiberG - skipped.fiberG).toBeCloseTo(5, 6);
    expect(bar.vegPortions - skipped.vegPortions).toBeCloseTo(1, 6);
    expect(bar.bar).toEqual(['cena']);
    expect(bar.replaced).toEqual(['cena']);
    // Le fibre perse sono quelle che mancano davvero rispetto alla cena del menù.
    expect(bar.fiberLost.cena ?? 0).toBeCloseTo(Math.max(0, (skipped.fiberLost.cena ?? 0) - 5), 6);
    // Senza l'ordine, sostituito vale metà della cena prevista.
    delete d.dayLogs[date].barMeals;
    expect(dayIntake(date, d).bar).toEqual([]);
    // Un ordine rimasto su un pasto fatto non conta: vale la ricetta.
    d.dayLogs[date].status['pasto:cena'] = 'fatto';
    d.dayLogs[date].barMeals = { cena: { label: 'Ordine', nutrients: { kcal: 300, proteinG: 1, carbG: 1, fatG: 1, fiberG: 0 } } };
    expect(dayIntake(date, d).bar).toEqual([]);
    const s = weekStats(W2, d, { today: addDays(W2, 2) });
    expect(s.mealsAtBar).toBe(0);
  });

  it('il giorno del primo avvio con la sola merenda non entra nella stima', () => {
    const start = '2026-11-04'; // mercoledì, primo avvio alle 14:20
    const d = base(start);
    d.plan.firstUse = { date: start, time: '14:20' };
    markMeals(d, start, { merenda: 'fatto' });
    const day = dayIntake(start, d);
    expect(day.logged).toBe(true);
    expect(day.complete).toBe(false);
    const s = periodStats([start], [], d, { today: addDays(start, 1) });
    expect(s.fiberAvgG).toBeNull();
    expect(s.proteinAvgG).toBeNull();
    expect(s.nutritionDays).toBe(0);
    // Due pasti segnati su cinque non bastano; tre sì.
    const next = addDays(start, 1);
    markMeals(d, next, { colazione: 'fatto', pranzo: 'fatto' });
    expect(dayIntake(next, d).complete).toBe(false);
    markMeals(d, next, { colazione: 'fatto', pranzo: 'fatto', cena: 'fatto' });
    expect(dayIntake(next, d).complete).toBe(true);
  });

  it('menù sotto l’obiettivo: aggiunte su misura, con le calorie', () => {
    const d = base();
    for (const t of Object.values(d.plan.targets)) t.fiberG = 52;
    for (let i = 0; i < 5; i++) markMeals(d, addDays(W2, i), 'fatto');
    const s = weekStats(W2, d);
    expect(s.fiberPlannedG!).toBeLessThan(s.fiberTargetG - 2);
    const p = byId(proposals(W2, d), 'fibre')!;
    expect(p.title).toBe('Più fibre nel menù');
    expect(p.reason).toMatch(/l’obiettivo è 52\sg/);
    expect(p.reason).toMatch(/frutto/);
    expect(p.reason).toMatch(/kcal in più/);
    // Le aggiunte crescono con quello che manca, non sono sempre tre.
    expect(fiberAdditions(3).items.map((a) => a.id)).toEqual(['frutto']);
    expect(fiberAdditions(8).items.map((a) => a.id)).toEqual(['frutto', 'legumi']);
    expect(fiberAdditions(20).items).toHaveLength(3);
    expect(fiberAdditions(20).fiberG).toBeGreaterThan(11);
    expect(fiberAdditions(20).fiberG).toBeLessThan(15);
  });

  it('il menù seguito per intero non fa scattare la proposta', () => {
    const d = base();
    for (const date of weekDates(W2)) markMeals(d, date, 'fatto');
    const s = weekStats(W2, d);
    expect(s.nutritionDays).toBe(7);
    expect(s.fiberAvgG!).toBeGreaterThanOrEqual(s.fiberTargetG - 5);
    expect(s.proteinAvgG!).toBeGreaterThan(100);
    expect(s.proteinAvgG).toBe(s.proteinPlannedG);
    expect(byId(proposals(W2, d), 'fibre')).toBeUndefined();
  });

  it('servono almeno 3 giorni di dati, e oggi non conta', () => {
    const d = base();
    markMeals(d, addDays(W2, 0), 'saltato');
    markMeals(d, addDays(W2, 1), 'saltato');
    markMeals(d, addDays(W2, 2), 'saltato');
    expect(byId(proposals(W2, d, { today: addDays(W2, 2) }), 'fibre')).toBeUndefined();
    expect(byId(proposals(W2, d, { today: addDays(W2, 3) }), 'fibre')!.reason).toMatch(/nei 15\spasti saltati/);
  });

  it('nei giorni di avvio il riferimento è il menù di avvio, che sale per gradi', () => {
    const d = base();
    const wed = addDays(W1, 2);
    (d.plan as AppData['plan'] & { firstUse?: { date: string; time: string } }).firstUse = { date: wed, time: '15:30' };
    for (let i = 3; i < 6; i++) markMeals(d, addDays(W1, i), 'fatto');
    const s = weekStats(W1, d, { today: addDays(W1, 6) });
    expect(s.fiberStarter).toBe(true);
    expect(s.fiberPlannedG!).toBeLessThan(s.fiberTargetG - 5);
    expect(s.fiberLow).toBe(false);
    expect(byId(proposals(W1, d, { today: addDays(W1, 6) }), 'fibre')).toBeUndefined();
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

  it('in aumento rispetto alla settimana prima: niente cambio di esercizio sotto soglia', () => {
    const d = base();
    pains(d, W1, 'Gomito', [1, 1, 2, 1, 1, 2, 1]);
    pains(d, W2, 'Gomito', [2, 2, 3, 2, 2, 3, 2]);
    const g = weekStats(W2, d).pain.find((p) => p.site === 'Gomito')!;
    expect(g.trend).toBe('su');
    expect(g.overThreshold).toBe(false);
    const p = byId(proposals(W2, d), 'dolore')!;
    expect(p.reason).toContain('Gomito in aumento da 1,3 a 2,3');
    expect(p.reason).not.toContain('presa neutra');
    expect(p.reason).not.toContain('chest press');
  });

  it('gomito sopra soglia: la panca con i manubri passa alla chest press e ai cavi', () => {
    const d = base();
    pains(d, W2, 'Gomito', [4, 4, 5, 4, 4, 5, 4]);
    const p = byId(proposals(W2, d), 'dolore')!;
    expect(p.reason).toContain('sopra la soglia di 3');
    expect(p.reason).toContain('la panca con i manubri passa alla chest press e ai cavi');
    expect(p.reason).not.toContain('presa neutra');
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
    weighIns(d, W1, [76.0, 76.1, 75.9, 76.0, null, null, null]);
    weighIns(d, W2, [75.5, 75.6, 75.4, null, 75.5, null, null]);
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
    // Si decide solo su quello che cambia la settimana dopo; i dolci sono un consiglio da sapere.
    expect(list.filter(needsDecision).map((p) => p.id)).toEqual(list.filter((p) => p.id === 'sonno' || p.id === 'calorie').filter((p) => p.apply).map((p) => p.id));
  });

  it('da decidere: piano, scarico e settimana più leggera; il resto si legge soltanto', () => {
    const p = (area: Proposal['area'], apply?: Proposal['apply']): Proposal => ({ id: area, area, title: '', reason: '', apply });
    expect(needsDecision(p('sonno', { type: 'sleepCurrent', value: '00:30' }))).toBe(true);
    expect(needsDecision(p('calorie', { type: 'kcalDelta', value: 150 }))).toBe(true);
    expect(needsDecision(p('scarico', { type: 'none' }))).toBe(true);
    expect(needsDecision(p('allenamento', { type: 'none' }))).toBe(true);
    for (const area of ['peso', 'dolore', 'fibre', 'dolci'] as const) expect(needsDecision(p(area, { type: 'none' }))).toBe(false);
    expect(needsDecision(p('sonno'))).toBe(false);
    expect(needsDecision(p('calorie'))).toBe(false);
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
    // Obiettivo predefinito 23:15 con la sveglia delle 07:15: 8 ore a letto.
    expect(targetSleepHours(base().plan)).toBeCloseTo(8);
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

describe('prima settimana', () => {
  // Benvenuto mercoledì 4 novembre alle 15:30: il piano parte lunedì 2.
  const WED = addDays(W1, 2);
  function firstWeek(): AppData {
    const d = base();
    (d.plan as AppData['plan'] & { firstUse?: { date: string; time: string } }).firstUse = { date: WED, time: '15:30' };
    return d;
  }

  it('i giorni prima del primo avvio non contano', () => {
    const d = firstWeek();
    expect(reviewStart(d)).toBe(WED);
    const s = weekStats(W1, d, { today: addDays(W1, 6) });
    // Mercoledì, giovedì, venerdì e sabato chiusi; domenica è oggi.
    expect(s.adherenceDays).toBe(4);
    expect(s.countedNights).toBe(5);
    expect(s.firstWeek).toBe(true);
    expect(s.daysWithRitmo).toBe(5);
  });

  it('notti in orario con lo stesso denominatore nelle card e nella proposta', () => {
    const d = firstWeek();
    bedtimes(d, W1, [null, null, null, '00:40', '01:30', null, null]);
    const s = weekStats(W1, d, { today: addDays(W1, 6) });
    expect(s.nightsWithBedtime).toBe(2);
    expect(s.nightsOnTarget).toBe(1);
    const p = byId(proposals(W1, d, { today: addDays(W1, 6) }), 'sonno')!;
    expect(p.reason).toContain('1 notte su 5');
    expect(p.reason).toContain('Prima settimana');
    expect(p.reason).not.toContain('su 7');
  });

  it('senza primo avvio salvato conta dal primo giorno con qualcosa di segnato', () => {
    const d = base();
    const thu = addDays(W1, 3);
    d.dayLogs[thu] = { date: thu, status: { 'pasto:pranzo': 'fatto' }, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {} };
    expect(reviewStart(d)).toBe(thu);
    const s = weekStats(W1, d, { today: addDays(W1, 6) });
    expect(s.adherenceDays).toBe(3);
    expect(s.itemsMarked).toBe(1);
  });

  it('dalla seconda settimana contano tutti i giorni', () => {
    const d = firstWeek();
    const s = weekStats(W2, d);
    expect(s.firstWeek).toBe(false);
    expect(s.adherenceDays).toBe(7);
    expect(s.countedNights).toBe(7);
  });
});

describe('prima revisione dopo il benvenuto', () => {
  /** Benvenuto in `date` alle `time`; il piano parte dal lunedì di quella settimana. */
  function startedOn(date: ISODate, time = '21:30'): AppData {
    const d = base(date);
    d.plan.startDate = weekDates(date)[0] ?? date;
    (d.plan as AppData['plan'] & { firstUse?: { date: string; time: string } }).firstUse = { date, time };
    return d;
  }
  const SUN = addDays(W1, 6); // domenica 8 novembre

  it('chi comincia domenica sera non rivede una settimana mai vissuta', () => {
    const d = startedOn(SUN);
    expect(firstReviewWeek(d.plan)).toBe(W2);
    expect(firstReviewDate(d.plan)).toBe(addDays(W2, 6));
    // Domenica stessa e il lunedì dopo: nessuna revisione da fare, nessuna proposta.
    expect(reviewAvailable(SUN, d.plan)).toBe(false);
    expect(reviewAvailable(W2, d.plan)).toBe(false);
    expect(isReviewableWeek(W1, d.plan)).toBe(false);
    expect(proposals(W1, d, { today: W2 })).toEqual([]);
    // La domenica dopo si rivede la prima settimana vera, come prima settimana.
    expect(reviewAvailable(addDays(W2, 6), d.plan)).toBe(true);
    const s = weekStats(W2, d, { today: addDays(W2, 6) });
    expect(s.firstWeek).toBe(true);
    expect(s.weekNumber).toBe(1);
    expect(proposals(W2, d, { today: addDays(W2, 6) }).length).toBeGreaterThan(0);
  });

  it('la prima sera senza nulla di segnato non è una giornata a zero', () => {
    const d = startedOn(SUN);
    const days = weekDates(W1);
    const s = periodStats(days, weekDates(addDays(W1, -7)), d, { today: W2 });
    expect(s.adherenceDays).toBe(0);
    expect(s.adherence).toBeNull();
    // Se la sera qualcosa è segnato, conta.
    const curfew = buildDay(SUN, d).find((it) => it.kind === 'coprifuoco');
    expect(curfew).toBeDefined();
    d.dayLogs[SUN] = { date: SUN, status: { [curfew!.id]: 'fatto' }, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {} };
    expect(periodStats(days, [], d, { today: W2 }).adherenceDays).toBe(1);
  });

  it('il sabato vale come la domenica: due giorni non bastano', () => {
    const d = startedOn(addDays(W1, 5), '10:00');
    expect(firstReviewWeek(d.plan)).toBe(W2);
    expect(planWeekNumber(SUN, d.plan)).toBe(0);
    expect(planWeekNumber(W2, d.plan)).toBe(1);
  });

  it('dal venerdì in poi la prima settimana si rivede, con quei giorni', () => {
    const d = startedOn(addDays(W1, 4), '18:00');
    expect(firstReviewWeek(d.plan)).toBe(W1);
    expect(reviewAvailable(SUN, d.plan)).toBe(true);
    expect(weekStats(W1, d, { today: SUN }).weekNumber).toBe(1);
  });

  it('se il piano parte il lunedì dopo, conta l’inizio del piano', () => {
    const d = startedOn(addDays(W1, 3));
    d.plan.startDate = W2;
    expect(firstReviewWeek(d.plan)).toBe(W2);
    expect(reviewAvailable(SUN, d.plan)).toBe(false);
  });

  it('senza primo avvio (dati di esempio) vale l’inizio del piano', () => {
    const d = base('2026-10-05');
    expect(firstReviewWeek(d.plan)).toBe('2026-10-05');
    expect(planWeekNumber('2026-11-02', d.plan)).toBe(5);
  });
});

describe('scalino della settimana', () => {
  function log(d: AppData, date: ISODate, patch: Partial<AppData['dayLogs'][string]>) {
    const empty = { date, status: {}, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {} };
    d.dayLogs[date] = { ...empty, ...d.dayLogs[date], ...patch };
  }

  it('sceglie il punto più debole: poca acqua', () => {
    const d = base();
    weekDates(W2).forEach((date) => log(d, date, { waterGlasses: 3 }));
    const s = proposeWeeklyStep(W2, d);
    expect(s.suggested.id).toBe('acqua');
    expect(s.suggested.reason).toContain('In media 3 bicchieri');
    expect(s.options).toHaveLength(5);
    expect(new Set(s.options.map((o) => o.id)).size).toBe(5);
  });

  it('dolci oltre il previsto: niente dolci fuori programma', () => {
    const d = base();
    weekDates(W2).forEach((date) => log(d, date, { waterGlasses: 9, sweets: 1 }));
    expect(proposeWeeklyStep(W2, d).suggested.id).toBe('dolci');
  });

  it('cene fuori menù: verdura a ogni cena', () => {
    const d = base();
    weekDates(W2).forEach((date, i) =>
      log(d, date, { waterGlasses: 9, status: { 'pasto:colazione': 'fatto', 'pasto:spuntino': 'fatto', 'pasto:pranzo': 'fatto', 'pasto:merenda': 'fatto', 'pasto:cena': i % 2 ? 'fatto' : 'sostituito' } }),
    );
    expect(proposeWeeklyStep(W2, d).suggested.id).toBe('verdura-cena');
  });

  it('si salva nella revisione e vale la settimana dopo: Oggi conta i giorni', () => {
    const d = base();
    d.reviews = [{ weekStart: W1, votes: { energia: 7, digestione: 7, umore: 7, campo: 7 }, acceptedProposals: [], step: { id: 'frutta-spuntino', title: 'Un frutto allo spuntino' } } as AppData['reviews'][number]];
    log(d, W2, { status: { [STEP_ITEM_ID]: 'fatto' } });
    log(d, addDays(W2, 1), { status: { [STEP_ITEM_ID]: 'fatto' } });
    const st = weeklyStepStatus(addDays(W2, 2), d)!;
    expect(st.step.id).toBe('frutta-spuntino');
    expect(st.manual).toBe(true);
    expect(st.done).toBe(2);
    expect(st.todayState).toBe('in-corso');
    expect(st.days.map((x) => x.state)).toEqual(['fatto', 'fatto', 'in-corso', 'futuro', 'futuro', 'futuro', 'futuro']);
    // La voce dello scalino non conta nell'aderenza né tra le voci segnate.
    expect(weekStats(W2, d, { today: addDays(W2, 2) }).itemsMarked).toBe(0);
    expect(weeklyStepStatus(addDays(W1, 3), d)).toBeNull();
  });

  it('acqua e dolci si contano dal diario', () => {
    const d = base();
    log(d, W2, { waterGlasses: 8 });
    log(d, addDays(W2, 1), { waterGlasses: 5 });
    const water = stepProgress('acqua', W2, d, addDays(W2, 2));
    expect(water.days.slice(0, 3).map((x) => x.state)).toEqual(['fatto', 'mancato', 'in-corso']);
    weekDates(W2).forEach((date) => log(d, date, { sweets: 1 }));
    const sweets = stepProgress('dolci', W2, d, addDays(W2, 6));
    // 3 previsti: lunedì, martedì e mercoledì vanno bene, poi sono fuori programma.
    expect(sweets.days.map((x) => x.state)).toEqual(['fatto', 'fatto', 'fatto', 'mancato', 'mancato', 'mancato', 'mancato']);
  });

  it('scalino non riuscito: si ripete; riuscito: si sale al prossimo', () => {
    const d = base();
    d.reviews = [{ weekStart: W1, votes: { energia: 7, digestione: 7, umore: 7, campo: 7 }, acceptedProposals: [], step: { id: 'acqua', title: '' } } as AppData['reviews'][number]];
    weekDates(W2).forEach((date, i) => log(d, date, { waterGlasses: i < 3 ? 8 : 4 }));
    const again = proposeWeeklyStep(W2, d);
    expect(again.previous).toMatchObject({ id: 'acqua', done: 3, consolidated: false });
    expect(again.suggested.id).toBe('acqua');
    expect(again.suggested.reason).toContain('3 giorni su 7');

    weekDates(W2).forEach((date) => log(d, date, { waterGlasses: 8 }));
    const next = proposeWeeklyStep(W2, d);
    expect(next.previous?.consolidated).toBe(true);
    expect(next.suggested.id).not.toBe('acqua');
  });

  it('i testi non hanno trattini lunghi né valori mancanti', () => {
    const s = proposeWeeklyStep(reviewWeekFor('2026-11-01'), buildDemo('2026-11-01'), { today: '2026-11-01' });
    for (const o of s.options) {
      expect(o.title + o.reason).not.toMatch(/—|NaN|undefined/);
    }
  });
});

describe('scala del sonno nel tempo', () => {
  const votes = { energia: 7, digestione: 7, umore: 7, campo: 7 };
  const W3 = addDays(W2, 7);

  it('ricostruisce l’orario a letto di ogni settimana dalle revisioni accettate', () => {
    const d = base();
    d.plan.sleep = { ...d.plan.sleep, current: '00:15', stepMin: 15 };
    expect(sleepPhaseOn(W1, d)).toBe('00:15');
    d.reviews = [
      // Revisione senza istantanea delle proposte: un passo.
      { weekStart: W1, votes, acceptedProposals: ['sonno'] },
      {
        weekStart: W2,
        votes,
        acceptedProposals: ['sonno'],
        proposals: [{ id: 'sonno', area: 'sonno', title: 'A letto alle 00:15', reason: '', apply: { type: 'sleepCurrent', value: '00:15' } }],
      },
      // Una revisione senza la proposta del sonno accettata non sposta nulla.
      { weekStart: W3, votes, acceptedProposals: ['peso'] },
    ];
    expect(sleepPhaseOn(W3, d)).toBe('00:15');
    expect(sleepPhaseOn(addDays(W3, 10), d)).toBe('00:15');
    expect(sleepPhaseOn(addDays(W2, 6), d)).toBe('00:30');
    expect(sleepPhaseOn(W2, d)).toBe('00:30');
    expect(sleepPhaseOn(addDays(W1, 6), d)).toBe('00:45');
    expect(planOnEvening(W3, d)).toBe(d.plan);
    expect(planOnEvening(W1, d).sleep.current).toBe('00:45');
  });

  it('le notti di una settimana passata si contano con l’orario di allora', () => {
    const d = base();
    d.plan.sleep = { ...d.plan.sleep, current: '00:15', stepMin: 15 };
    bedtimes(d, W1, ['00:40', '00:40', '00:40', '00:40', '00:40', '00:40', '00:40']);
    // Senza revisioni l'orario è 00:15 anche per la prima settimana: 00:40 è tardi.
    expect(weekStats(W1, d, { today: addDays(W1, 6) }).nightsOnTarget).toBe(0);
    // Con due passi accettati dopo, la prima settimana valeva 00:45.
    d.reviews = [
      { weekStart: W1, votes, acceptedProposals: ['sonno'] },
      { weekStart: W2, votes, acceptedProposals: ['sonno'] },
    ];
    const s = weekStats(W1, d, { today: addDays(W1, 6) });
    expect(s.nightsOnTarget).toBe(s.nightsWithBedtime);
    expect(s.nightsOnTarget).toBeGreaterThan(0);
  });
});

// ───────────────────────── Fase 2: limiti dell'energia e settimane della revisione (§ 2.1, § 3.9) ─────────────────────────

describe('correzione delle calorie entro i limiti dell’energia (§ 2.1, § 13.7, 38)', () => {
  /** Dimagrimento senza `goalDeltaKcal` (i piani di oggi), calo troppo lento: la regola chiede −150. */
  function slowLoss(reviews: WeeklyReview[] = [], targetsScale = 1): { state: AppData; stats: ReturnType<typeof weekStats> } {
    const d = base();
    d.profile = { ...d.profile, goal: 'dimagrimento' };
    if (targetsScale !== 1) {
      for (const t of Object.keys(d.plan.targets) as (keyof typeof d.plan.targets)[]) d.plan.targets[t] = { ...d.plan.targets[t], kcal: Math.round(d.plan.targets[t].kcal * targetsScale) };
    }
    d.reviews = reviews;
    const stats = { ...weekStats(W2, d), weighIns: 5, weightAvg: 80, weightDelta: -0.08, weightDeltaPct: -0.001, weightDeltaSource: 'confronto' as const };
    return { state: d, stats };
  }
  const accepted = (weekStart: ISODate, value: number): WeeklyReview => ({
    weekStart,
    votes: { energia: 7, digestione: 7, umore: 7, campo: 7 },
    acceptedProposals: ['calorie'],
    proposals: [{ id: 'calorie', area: 'calorie', title: `${value} kcal al giorno`, reason: '', apply: { type: 'kcalDelta', value } }],
  });
  const calories = (s: { state: AppData; stats: ReturnType<typeof weekStats> }) => proposals(W2, s.state, { stats: s.stats }).find((p) => p.area === 'calorie')!;

  it('sotto il tetto la correzione resta −150', () => {
    expect(kcalCorrection('dimagrimento', -0.001)).toBe(-150);
    expect(calories(slowLoss()).apply).toEqual({ type: 'kcalDelta', value: -150 });
  });

  it('con una correzione da −150 già accettata il deficit è al tetto: nessun altro taglio', () => {
    const p = calories(slowLoss([accepted(W1, -150)]));
    expect(p.apply).toBeUndefined();
    expect(p.title).toBe('Calorie invariate');
    expect(p.reason).toContain(DEFICIT_AT_CAP_TEXT);
    expect(needsDecision(p)).toBe(false);
  });

  it('con obiettivi bassi il tetto del 20% taglia la correzione', () => {
    // Riposo a 1.840 kcal: dispendio 2.190, il 20% è 438 (meno di 500): da −350 si scende di 88 al massimo.
    const s = slowLoss([], 0.8);
    const p = calories(s);
    const cap = Math.min(...Object.values(s.state.plan.targets).map((t) => Math.min(500, Math.floor((t.kcal + 350) * 0.2))));
    expect(p.apply).toEqual({ type: 'kcalDelta', value: -(cap - 350) });
    expect(p.title).toBe(`−${cap - 350} kcal al giorno`);
  });

  it('una revisione già salvata non conta la sua stessa correzione', () => {
    const p = calories(slowLoss([accepted(W2, -150)]));
    expect(p.apply).toEqual({ type: 'kcalDelta', value: -150 });
  });
});

describe('scarico e settimana più leggera scrivono la settimana dopo (§ 3.9)', () => {
  it('lo scarico dopo 6 settimane ha apply weekKind sul lunedì dopo, e si passa ad applyProposal', () => {
    const d = base('2026-09-28');
    const p = proposals(W2, d, { today: '2026-11-15' }).find((x) => x.area === 'scarico')!;
    expect(p.apply).toEqual({ type: 'weekKind', weekStart: '2026-11-16', kind: 'scarico' });
    expect(changesPlan(p)).toBe(false);
    expect(appliesToPlan(p)).toBe(true);
    expect(needsDecision(p)).toBe(true);
    expect(acceptable([p])).toEqual([p]);
  });

  it('la settimana più leggera ha apply weekKind «leggera»', () => {
    const d = base();
    const loadStatus = { weekStart: W2, load: 3000, average: 2000, ratio: 1.5, threshold: 2400, previous: [], enoughHistory: true, alert: true };
    const stats = { ...weekStats(W2, d), loadStatus };
    const p = proposals(W2, d, { stats }).find((x) => x.area === 'allenamento')!;
    expect(p.apply).toEqual({ type: 'weekKind', weekStart: '2026-11-16', kind: 'leggera' });
    expect(appliesToPlan(p)).toBe(true);
    expect(changesPlan(p)).toBe(false);
  });

  it('le proposte che cambiano il piano restano quelle di prima; quelle del piano si passano ad applyProposal', () => {
    expect(appliesToPlan({ id: 'x', area: 'piano', title: '', reason: '', apply: { type: 'planProposal', id: 'p1' } })).toBe(true);
    expect(appliesToPlan({ id: 'x', area: 'fibre', title: '', reason: '', apply: { type: 'none' } })).toBe(false);
    expect(appliesToPlan({ id: 'x', area: 'sonno', title: '', reason: '', apply: { type: 'sleepCurrent', value: '00:00' } })).toBe(true);
  });
});

describe('dayIntake con i pasti stimati (§ 7.5)', () => {
  it('una foto del pasto previsto vale la stima; una foto al posto del pasto non conta come bar', () => {
    const d = base();
    const day = W2;
    const n = { kcal: 500, proteinG: 40, carbG: 50, fatG: 10, fiberG: 2 };
    d.dayLogs[day] = {
      date: day,
      status: { 'pasto:pranzo': 'fatto', 'pasto:cena': 'sostituito', 'pasto:merenda': 'sostituito' },
      notes: {},
      minimal: false,
      waterGlasses: 0,
      sweets: 0,
      recipeSwaps: {},
      barMeals: {
        pranzo: { label: 'Pranzo fotografato', nutrients: n, vegPortions: 2, source: 'foto', asPlanned: true },
        cena: { label: 'Pizza', nutrients: { ...n, fiberG: 4 }, source: 'foto' },
        merenda: { label: 'Toast al formaggio', nutrients: { ...n, fiberG: 1 } },
      },
    };
    const x = dayIntake(day, d);
    const planned = dayIntake(day, { ...d, dayLogs: {} }).planned;
    expect(x.fiberG).toBeCloseTo(2 + 4 + 1, 9);
    expect(x.proteinG).toBeCloseTo(120, 9);
    expect(x.bar).toEqual(['merenda']);
    expect(x.replaced.sort()).toEqual(['cena', 'merenda']);
    expect(x.planned).toEqual(planned);
  });
});
