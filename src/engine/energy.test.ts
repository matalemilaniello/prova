import { describe, expect, it } from 'vitest';
import type { CheckIn, DayType, Plan, Profile, WeeklyReview } from '../domain/types';
import { DEFAULT_PROFILE, DEFAULT_TARGETS, defaultPlan } from '../data/defaults';
import { addDays } from './dates';
import {
  clampKcalCorrection,
  dayAllowedDeficitKcal,
  dayEnergyDelta,
  deficitAtCap,
  goalDeltaOf,
  isPreseason,
  lowerLegGuard,
  maxDeficitKcal,
  type EnergyState,
} from './energy';
import { effectiveDayType } from './menu';
import { dayCarbScale, dayTargetFor, matchCarbs, nutritionStateOf } from './nutrition';
import { GOAL_DELTA_KCAL } from './targets';

// Settimana predefinita: partita il lunedì, quindi la domenica è la vigilia.
const MON = '2026-11-09';
const TUE = '2026-11-10';
const FRI = '2026-11-13';
const SAT = '2026-11-14';
const SUN = '2026-11-15';

/** Obiettivi di oggi per chi è in dimagrimento: quelli predefiniti meno 350 kcal dai carboidrati. */
function cutTargets(delta = GOAL_DELTA_KCAL.dimagrimento): Plan['targets'] {
  const out = {} as Plan['targets'];
  for (const t of Object.keys(DEFAULT_TARGETS) as DayType[]) {
    const b = DEFAULT_TARGETS[t];
    out[t] = { ...b, kcal: b.kcal + delta, carbG: Math.round((b.carbG + delta / 4) / 5) * 5 };
  }
  return out;
}

const profileOf = (goal: Profile['goal']): Profile => ({ ...DEFAULT_PROFILE, goal, startWeightKg: 72, heightCm: 178, birthYear: 1994 });

type TestState = EnergyState & { profile: Profile; reviews: WeeklyReview[]; checkIns?: Record<string, CheckIn> };

function cutState(extra: Partial<TestState> = {}, plan: Partial<Plan> = {}): TestState {
  return {
    plan: { ...defaultPlan('2026-11-02'), targets: cutTargets(), ...plan },
    profile: profileOf('dimagrimento'),
    reviews: [],
    ...extra,
  };
}

const review = (weekStart: string, value: number, accepted = true): WeeklyReview => ({
  weekStart,
  votes: { energia: 7, digestione: 7, umore: 7, campo: 7 },
  acceptedProposals: accepted ? ['calorie'] : [],
  proposals: [{ id: 'calorie', area: 'calorie', title: '', reason: '', apply: { type: 'kcalDelta', value } }],
});

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe('goalDeltaOf', () => {
  it('usa Plan.goalDeltaKcal quando c’è', () => {
    const s = cutState({}, { goalDeltaKcal: -420 });
    expect(goalDeltaOf(s.plan, profileOf('ricomposizione'), [])).toBe(-420);
  });

  it('senza il campo: obiettivo del corpo più le correzioni accettate e registrate', () => {
    const plan = defaultPlan('2026-11-02');
    expect(goalDeltaOf(plan, profileOf('ricomposizione'), [])).toBe(0);
    expect(goalDeltaOf(plan, profileOf('mantenimento'), [])).toBe(0);
    expect(goalDeltaOf(plan, profileOf('massa'), [])).toBe(250);
    expect(goalDeltaOf(plan, profileOf('dimagrimento'), [])).toBe(-350);
    const reviews = [review('2026-10-19', -150), review('2026-10-26', 150, false), review('2026-11-02', -150)];
    expect(goalDeltaOf(plan, profileOf('dimagrimento'), reviews)).toBe(-650);
    // Una revisione senza l'elenco delle proposte non si può contare (limite dichiarato).
    const old: WeeklyReview = { ...review('2026-11-02', -150), proposals: undefined };
    expect(goalDeltaOf(plan, profileOf('ricomposizione'), [old])).toBe(0);
  });
});

describe('ricomposizione e mantenimento senza correzioni: niente cambia', () => {
  it('nessuna kcal rimessa in 28 giorni, anche con la tibia sopra soglia e nel precampionato', () => {
    const pain: Record<string, CheckIn> = Object.fromEntries(days('2026-11-01', 28).map((d) => [d, { date: d, pain: { Tibia: 6 } }]));
    for (const goal of ['ricomposizione', 'mantenimento'] as const) {
      const plan = { ...defaultPlan('2026-11-02'), season: { firstMatch: '2026-12-20', preseasonWeeks: 8 } };
      const state = { plan, profile: profileOf(goal), reviews: [], checkIns: pain, dayLogs: {} };
      for (const d of days('2026-11-02', 28)) {
        expect(dayEnergyDelta(d, state)).toBe(0);
        const base = plan.targets[effectiveDayType(d, plan)];
        const m = matchCarbs(d, state);
        expect(dayTargetFor(d, state)).toEqual(m?.extraG ? { ...base, carbG: base.carbG + m.extraG, kcal: base.kcal + m.extraKcal } : base);
      }
    }
  });
});

describe('chi è già in dimagrimento senza goalDeltaKcal (i piani di oggi)', () => {
  it('nessun deficit a partita e vigilia: le 350 kcal tornano dai carboidrati', () => {
    const s = { ...cutState(), dayLogs: {} };
    expect(dayEnergyDelta(MON, s)).toBe(350);
    expect(dayEnergyDelta(SUN, s)).toBe(350);
    const t = dayTargetFor(MON, s);
    const m = matchCarbs(MON, s);
    expect(t.kcal).toBe(s.plan.targets.calcio.kcal + 350 + (m?.extraKcal ?? 0));
    expect(t.proteinG).toBe(s.plan.targets.calcio.proteinG);
    expect(t.fatG).toBe(s.plan.targets.calcio.fatG);
    // Il minimo di 6 g/kg resta un vincolo duro.
    expect(t.carbG).toBeGreaterThanOrEqual(m?.floorG ?? 0);
    // Negli altri giorni le −350 sono dentro i limiti (500 kcal, 20% del dispendio).
    for (const d of [TUE, FRI, SAT]) expect(dayEnergyDelta(d, s)).toBe(0);
    expect(dayTargetFor(TUE, s)).toEqual(s.plan.targets.palestra);
  });

  it('la scala dei carboidrati porta nel piatto le kcal rimesse', () => {
    const cut = { ...cutState(), dayLogs: {} };
    const noProfile = { plan: cut.plan, dayLogs: {} };
    // Senza profilo il deficit non si ricava: la scala resta quella di prima.
    expect(dayCarbScale(SUN, cut)).toBeGreaterThan(dayCarbScale(SUN, noProfile));
    expect(dayCarbScale(TUE, cut)).toBe(dayCarbScale(TUE, noProfile));
  });

  it('una zona sotto il ginocchio sopra la soglia degli impatti negli ultimi 14 giorni porta il deficit a 250', () => {
    const checkIns = { [addDays(TUE, -13)]: { date: addDays(TUE, -13), pain: { Tibia: 3 } } };
    const s = cutState({ checkIns });
    expect(lowerLegGuard(TUE, s)).toBe(true);
    expect(dayAllowedDeficitKcal(TUE, s)).toBe(250);
    expect(dayEnergyDelta(TUE, s)).toBe(100);
    // Un giorno dopo il controllo esce dalla finestra; un dolore entro la soglia o al gomito non conta.
    expect(dayEnergyDelta(addDays(TUE, 1), s)).toBe(0);
    expect(dayEnergyDelta(TUE, cutState({ checkIns: { [TUE]: { date: TUE, pain: { Tibia: 2, Gomito: 7 } } } }))).toBe(0);
    // La soglia degli impatti scelta con il fisioterapista vale anche qui.
    expect(dayEnergyDelta(TUE, cutState({ checkIns: { [TUE]: { date: TUE, pain: { Tibia: 3 } } } }, { impactThreshold: 3 }))).toBe(0);
  });

  it('rientro di una zona sotto il ginocchio, fermo degli impatti e precampionato: deficit massimo 250', () => {
    const rientro = cutState({}, { training: { primary: 'rientro', rientro: { site: 'Tibia', stage: 1, since: MON } } });
    expect(dayEnergyDelta(TUE, rientro)).toBe(100);
    const hold = cutState({}, { impactHold: { site: 'Tibia', since: MON } });
    expect(dayEnergyDelta(TUE, hold)).toBe(100);
    const elbow = cutState({}, { training: { primary: 'rientro', rientro: { site: 'Gomito', stage: 1, since: MON } } });
    expect(dayEnergyDelta(TUE, elbow)).toBe(0);
    const pre = cutState({}, { season: { lastMatch: '2026-10-01', firstMatch: '2026-12-01', preseasonWeeks: 5 } });
    expect(isPreseason(TUE, pre.plan.season)).toBe(true);
    expect(dayEnergyDelta(TUE, pre)).toBe(100);
  });

  it('tetto del 20% del dispendio del tipo di giorno', () => {
    // Riposo a 1.500 kcal con −500: dispendio 2.000, deficit ammesso 400.
    const targets = { ...cutTargets(-500), riposo: { ...DEFAULT_TARGETS.riposo, kcal: 1500 } };
    const s = cutState({}, { targets, goalDeltaKcal: -500 });
    // Con la settimana predefinita la domenica è la vigilia: senza partita resta un giorno di riposo.
    const noMatch = { ...s, plan: { ...s.plan, week: s.plan.week.map((d) => ({ ...d, football: undefined })) } };
    expect(dayAllowedDeficitKcal(SUN, noMatch)).toBe(400);
    expect(dayEnergyDelta(SUN, noMatch)).toBe(100);
    expect(maxDeficitKcal(s.plan, -500)).toBe(400);
  });
});

describe('lo stato delle schermate comprende le revisioni (nutritionStateOf)', () => {
  it('dimagrimento senza goalDeltaKcal, −150 accettata e tibia sopra soglia: deficit ammesso 250 come nello stato completo', () => {
    // Piano di oggi: le −350 dell'obiettivo e la correzione da −150 già dentro i targets, il campo non scritto.
    const checkIns = { [addDays(TUE, -13)]: { date: addDays(TUE, -13), pain: { Tibia: 3 } } };
    const app = { ...cutState({ reviews: [review('2026-11-02', -150)] }, { targets: cutTargets(-500) }), checkIns, dayLogs: {} };
    const screen = nutritionStateOf(app);
    // Senza le revisioni il deficit ricavato resta −350 e il limite di 250 rimette solo 100 kcal invece di 250.
    const withoutReviews = { plan: app.plan, dayLogs: app.dayLogs, checkIns: app.checkIns, profile: app.profile };
    expect(goalDeltaOf(app.plan, app.profile, app.reviews)).toBe(-500);
    expect(dayEnergyDelta(TUE, screen)).toBe(250);
    expect(dayEnergyDelta(TUE, withoutReviews)).toBe(100);
    for (const d of days(MON, 7)) {
      expect(dayTargetFor(d, screen), d).toEqual(dayTargetFor(d, app));
      expect(dayCarbScale(d, screen), d).toBe(dayCarbScale(d, app));
    }
    expect(dayTargetFor(TUE, screen).kcal).toBe(app.plan.targets.palestra.kcal + 250);
    expect(dayTargetFor(TUE, withoutReviews).kcal).toBe(app.plan.targets.palestra.kcal + 100);
  });
});

describe('clampKcalCorrection', () => {
  it('con −150 sopra le −350 il deficit arriva al tetto di 500; la correzione dopo non lo supera', () => {
    // Obiettivi alti (dispendio di almeno 2.600 kcal in ogni tipo di giorno): il tetto è 500.
    const targets = Object.fromEntries(
      Object.entries(DEFAULT_TARGETS).map(([t, v]) => [t, { ...v, kcal: v.kcal + 300 - 350 }]),
    ) as Plan['targets'];
    const plan0: Plan = { ...cutState().plan, targets };
    const profile = profileOf('dimagrimento');
    expect(maxDeficitKcal(plan0, -350)).toBe(500);
    expect(clampKcalCorrection(-150, plan0, profile, [])).toBe(-150);
    // Accettata e registrata nella revisione: −500, al tetto. Un'altra correzione da −150 non toglie più niente.
    const reviews = [review('2026-11-02', -150)];
    expect(goalDeltaOf(plan0, profile, reviews)).toBe(-500);
    expect(deficitAtCap(plan0, profile, reviews)).toBe(true);
    expect(clampKcalCorrection(-150, plan0, profile, reviews)).toBe(0);
    expect(deficitAtCap(plan0, profile, [])).toBe(false);
    // Due correzioni di fila, come le applica lo store: il totale non supera mai il tetto.
    let plan = plan0;
    for (let i = 0; i < 2; i++) {
      const c = clampKcalCorrection(-150, plan, profile, []);
      plan = { ...plan, goalDeltaKcal: goalDeltaOf(plan, profile, []) + c };
    }
    expect(plan.goalDeltaKcal).toBe(-500);
  });

  it('con gli obiettivi predefiniti il tetto è il 20% del giorno di riposo (460 kcal)', () => {
    const s = cutState();
    expect(maxDeficitKcal(s.plan, -350)).toBe(460);
    expect(clampKcalCorrection(-150, s.plan, s.profile!, [])).toBe(-110);
    // Applicata dallo store: −110 negli obiettivi e −460 nel deficit salvato.
    const at = { ...s.plan, targets: cutTargets(-460), goalDeltaKcal: -460 };
    expect(deficitAtCap(at, s.profile!, [])).toBe(true);
    expect(clampKcalCorrection(-150, at, s.profile!, [])).toBe(0);
    // Al tetto nessun giorno normale rimette kcal: −460 sta dentro i limiti di ogni tipo di giorno.
    expect(dayEnergyDelta('2026-11-12', { ...s, plan: at })).toBe(0);
  });

  it('col 20% più stretto di 500 il tetto è il 20%', () => {
    // Riposo a 1.650 kcal con −350: dispendio 2.000, tetto 400.
    const targets = { ...cutTargets(), riposo: { ...DEFAULT_TARGETS.riposo, kcal: 1650 } };
    const s = cutState({}, { targets });
    expect(clampKcalCorrection(-150, s.plan, s.profile!, [])).toBe(-50);
  });

  it('un deficit già oltre i limiti torna al tetto; il surplus resta entro +500; valori illeggibili non cambiano niente', () => {
    const s = cutState({}, { goalDeltaKcal: -650 });
    expect(clampKcalCorrection(-150, s.plan, s.profile!, [])).toBe(150);
    const massa = { ...defaultPlan('2026-11-02'), goalDeltaKcal: 450 };
    expect(clampKcalCorrection(150, massa, profileOf('massa'), [])).toBe(50);
    expect(clampKcalCorrection(Number.NaN, massa, profileOf('massa'), [])).toBe(0);
    // Ricomposizione: le correzioni di oggi passano intere.
    const rec = defaultPlan('2026-11-02');
    expect(clampKcalCorrection(150, rec, profileOf('ricomposizione'), [])).toBe(150);
    expect(clampKcalCorrection(-100, rec, profileOf('ricomposizione'), [])).toBe(-100);
  });
});

describe('isPreseason', () => {
  it('le settimane prima della prima partita, dopo l’ultima della stagione', () => {
    const season = { lastMatch: '2026-06-01', firstMatch: '2026-09-06', preseasonWeeks: 5 };
    expect(isPreseason('2026-09-05', season)).toBe(true);
    expect(isPreseason('2026-08-02', season)).toBe(true);
    expect(isPreseason('2026-08-01', season)).toBe(false);
    expect(isPreseason('2026-09-06', season)).toBe(false);
    expect(isPreseason('2026-08-10', undefined)).toBe(false);
    expect(isPreseason('2026-08-10', { firstMatch: '2026-09-06', preseasonWeeks: 20 })).toBe(true);
    expect(isPreseason('2026-06-01', { lastMatch: '2026-06-01', firstMatch: '2026-06-20' })).toBe(false);
  });
});
