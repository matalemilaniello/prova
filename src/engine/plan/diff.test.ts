import { describe, expect, it } from 'vitest';
import type { MenuWeek, PlanPatch, PlanVersion, Program, ScheduleDay, WorkoutSession } from '../../domain/types';
import { DEFAULT_TARGETS, defaultAppData } from '../../data/defaults';
import { MENU_ROTATION } from '../../data/menu';
import { RECIPES } from '../../data/recipes';
import { SESSIONS } from '../../data/sessions';
import { EXERCISES } from '../../data/exercises';
import { fmtNumber } from '../../lib/format';
import { menuWeekFor } from '../menu';
import {
  changedMeals,
  describeDay,
  describeDose,
  diffMenus,
  diffPatch,
  diffPrograms,
  diffTargets,
  diffTraining,
  diffWeeks,
  editLabel,
  fromDayLabel,
  restoreTo,
  sortDiff,
  topDiff,
} from './diff';
import { applyPatch, beforeOf, isSuperseded, planBasis, type ProposalState } from './proposals';

const TODAY = '2026-11-08';
const MON = '2026-11-09';

function baseState(): ProposalState {
  const d = defaultAppData('2026-11-02');
  return { plan: d.plan, profile: d.profile, physio: d.physio };
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Seduta B con il primo esercizio del blocco principale sostituito, una serie in più sul secondo e un esercizio nuovo. */
function editedB(): WorkoutSession {
  const s = clone(SESSIONS.B);
  const main = s.blocks.find((b) => b.items.length >= 2) ?? s.blocks[0];
  main.items[0] = { ...main.items[0], exerciseId: 'squat-macchina-prova' };
  main.items[1] = { ...main.items[1], sets: main.items[1].sets + 1 };
  s.blocks[s.blocks.length - 1].items.push({ exerciseId: 'nordic-prova', sets: 2, repMin: 4, repMax: 6, unit: 'reps', restSec: 90, progression: 'nessuna' });
  return s;
}

const program = (over: Partial<Program> = {}): Program => ({
  blockId: 'b1',
  start: MON,
  weeks: ['carico', 'carico', 'carico', 'scarico'],
  dose: [
    { mainSetsAdd: 0, setsFactor: 1, rirDelta: 0, impactFactor: 1 },
    { mainSetsAdd: 0, setsFactor: 1, rirDelta: -1, impactFactor: 1.2 },
    { mainSetsAdd: 0, setsFactor: 1, rirDelta: -1, impactFactor: 1.44 },
    { mainSetsAdd: 0, setsFactor: 0.5, rirDelta: 1, impactFactor: 0.5 },
  ],
  phase: 'stagione',
  stage: 'stagione',
  primary: 'forza',
  secondary: 'potenza',
  sessions: { A: SESSIONS.A, B: editedB() },
  ...over,
});

describe('menù', () => {
  const seed = MENU_ROTATION[0];
  it('un pasto cambiato ha l’etichetta del giorno e i nomi delle ricette; pranzi e cene pesano di più', () => {
    const next = clone(seed);
    const lunch = next.days[2].meals.pranzo;
    const other = Object.keys(RECIPES).find((id) => id !== lunch && RECIPES[id].slots.includes('pranzo'))!;
    next.days[2].meals.pranzo = other;
    const snackDay = next.days.findIndex((d) => d.meals.spuntino);
    const snack = next.days[snackDay].meals.spuntino;
    const otherSnack = Object.keys(RECIPES).find((id) => id !== snack && RECIPES[id].slots.includes('spuntino'))!;
    next.days[snackDay].meals.spuntino = otherSnack;
    const diff = diffMenus(seed, next, { products: { before: 35, after: 37 } });
    const lunchItem = diff.find((d) => d.label === 'Mercoledì, pranzo');
    expect(lunchItem).toMatchObject({ area: 'pasto', before: RECIPES[lunch!].name, after: RECIPES[other].name });
    expect(diff.find((d) => d.area === 'spesa')).toMatchObject({ label: 'Spesa', before: '35 prodotti', after: '37 prodotti' });
    expect(changedMeals(diff)).toBe(2);
    expect(topDiff(diff, 1)[0].label).toBe('Mercoledì, pranzo');
    expect(diffMenus(seed, clone(seed))).toEqual([]);
  });

  it('la preparazione della domenica cambiata è una riga sola', () => {
    const next = clone(seed);
    next.prep = next.prep.slice(1);
    const diff = diffMenus(seed, next);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ area: 'pasto', label: 'Preparazione della domenica' });
    expect(diff[0].before).toMatch(/compiti · \d+ min/);
    expect(changedMeals(diff)).toBe(0);
  });

  it('senza menù di partenza ogni pasto è nuovo; un menù tolto lascia «niente»', () => {
    const week: MenuWeek = { days: Array.from({ length: 7 }, () => ({ meals: {} })), prep: [] };
    week.days[0].meals.cena = seed.days[0].meals.cena;
    expect(diffMenus(undefined, week)).toEqual([{ area: 'pasto', weight: 3, label: 'Lunedì, cena', before: 'niente', after: RECIPES[seed.days[0].meals.cena!].name }]);
  });
});

describe('programmi', () => {
  it('dalle sedute fisse a un blocco: il blocco, la sostituzione, la serie in più, l’esercizio nuovo', () => {
    const p = program();
    const diff = diffPrograms(undefined, p, { exerciseName: (id) => (id.endsWith('-prova') ? `Prova ${id}` : undefined) });
    expect(diff[0]).toEqual({ area: 'settimana', weight: 6, label: 'Blocco', before: 'sedute fisse', after: '4 settimane · forza, poi potenza' });
    const main = SESSIONS.B.blocks.find((b) => b.items.length >= 2) ?? SESSIONS.B.blocks[0];
    const swap = diff.find((d) => d.area === 'esercizio' && d.label === `Seduta B · ${main.title}`);
    expect(swap).toMatchObject({ before: EXERCISES[main.items[0].exerciseId]?.name ?? main.items[0].exerciseId, after: 'Prova squat-macchina-prova' });
    const added = diff.find((d) => d.label === 'Seduta B · Prova nordic-prova');
    expect(added).toMatchObject({ area: 'esercizio', after: 'nuovo · 2 × 4-6' });
    expect(added?.before).toBeUndefined();
    const sets = diff.find((d) => d.area === 'carico');
    expect(sets?.label).toContain('Seduta B · ');
    expect(sets?.before).toMatch(new RegExp(`^${main.items[1].sets} × `));
    expect(sets?.after).toMatch(new RegExp(`^${main.items[1].sets + 1} × `));
    // La seduta A è identica a quella fissa: nessuna riga.
    expect(diff.some((d) => d.label.startsWith('Seduta A'))).toBe(false);
  });

  it('una seduta nuova o tolta, un blocco che finisce, nessun blocco: niente differenze', () => {
    const k: WorkoutSession = { ...clone(SESSIONS.C), id: 'K', name: 'Seduta K', subtitle: 'Corsa intermittente' };
    const a = program();
    const b = program({ blockId: 'b2', sessions: { ...a.sessions, K: k } });
    const diff = diffPrograms(a, b);
    expect(diff.find((d) => d.label === 'Seduta K')).toEqual({ area: 'seduta', weight: 4, label: 'Seduta K', before: 'nessuna', after: 'Corsa intermittente' });
    const gone = diffPrograms(b, null);
    expect(gone[0]).toMatchObject({ label: 'Blocco', after: 'sedute fisse' });
    expect(diffPrograms(undefined, undefined)).toEqual([]);
    expect(diffPrograms(a, clone(a))).toEqual([]);
  });

  it('dosi a parole', () => {
    expect(describeDose({ exerciseId: 'x', sets: 3, repMin: 6, repMax: 10, unit: 'reps', rir: 2, restSec: 90, progression: 'doppia' })).toBe('3 × 6-10 · RIR 2');
    expect(describeDose({ exerciseId: 'x', sets: 2, repMin: 30, repMax: 30, unit: 'secondi', restSec: 30, progression: 'nessuna', perSide: true })).toBe('2 × 30 s per lato');
    expect(describeDose({ exerciseId: 'x', sets: 1, repMin: 6, repMax: 6, unit: 'reps', restSec: 120, progression: 'nessuna', distanceM: 20, effort: 'forte ma sciolto' })).toBe(
      '1 × 6 da 20 m · forte ma sciolto',
    );
  });
});

describe('settimana tipo', () => {
  it('un orario della palestra spostato e il calcio cambiato, con i pesi giusti', () => {
    const before = baseState().plan.week;
    const after: ScheduleDay[] = clone(before);
    after[4] = { ...after[4], gymTime: '18:30' };
    after[2] = { ...after[2], football: undefined, dayType: 'riposo', physio: false };
    const diff = diffWeeks(before, after);
    expect(diff.map((d) => d.label)).toEqual(['Mercoledì', 'Venerdì']);
    expect(describeDay(before[4])).toBe(`Palestra · Seduta B alle ${before[4].gymTime}`);
    // La parte uguale in testa («Palestra») non si ripete.
    expect(diff.find((d) => d.label === 'Venerdì')).toMatchObject({ weight: 3, before: `Seduta B alle ${before[4].gymTime}`, after: 'Seduta B alle 18:30' });
    expect(diff.find((d) => d.label === 'Mercoledì')).toMatchObject({ before: describeDay(before[2]), after: 'Riposo' });
    expect(diff.find((d) => d.label === 'Mercoledì')?.weight).toBe(4);
    expect(describeDay(before[0])).toMatch(/^Calcio · Partita alle \d\d:\d\d/);
    expect(describeDay(after[2])).toBe('Riposo');
    expect(diffWeeks(before, clone(before))).toEqual([]);
  });
});

describe('obiettivi', () => {
  it('calorie e macro per tipo di giorno', () => {
    const after = clone(DEFAULT_TARGETS);
    after.palestra = { ...after.palestra, kcal: after.palestra.kcal - 350, carbG: after.palestra.carbG - 88 };
    after.riposo = { ...after.riposo, proteinG: after.riposo.proteinG + 10 };
    const diff = diffTargets(DEFAULT_TARGETS, after);
    expect(diff).toHaveLength(2);
    const gym = diff.find((d) => d.label === 'Giorno di palestra');
    expect(gym?.weight).toBe(3);
    expect(gym?.before).toBe(`${fmtNumber(DEFAULT_TARGETS.palestra.kcal)} kcal · C ${DEFAULT_TARGETS.palestra.carbG} g`);
    expect(diff.find((d) => d.label === 'Giorno di riposo')?.weight).toBe(1.5);
  });

  it('qualità, rientro, tempo e spazi', () => {
    const diff = diffTraining(undefined, { primary: 'rapidita', secondary: 'potenza', sessionMin: 45, spaces: ['corsia'], rientro: { site: 'Zona di prova', stage: 1, since: MON } });
    expect(diff.map((d) => d.label)).toEqual(['Allenamento', 'Rientro', 'Minuti per seduta', 'Spazi']);
    expect(diff[0]).toMatchObject({ before: 'Sedute fisse', after: 'Rapidità, poi potenza' });
    expect(diff[3]).toMatchObject({ before: 'Solo palestra', after: 'Palestra e corsia' });
  });

  it('diffPatch: solo le parti che la toppa nomina, confrontate con oggi', () => {
    const s = baseState();
    const patch: PlanPatch = { goal: 'dimagrimento', goalDeltaKcal: -350, training: { primary: 'forza', secondary: 'prevenzione' } };
    const diff = diffPatch(s.plan, s.profile, patch);
    expect(diff.map((d) => d.label)).toEqual(['Allenamento', 'Obiettivo del corpo', 'Calorie rispetto al dispendio']);
    expect(diff[1]).toMatchObject({ before: 'Ricomposizione', after: 'Dimagrimento' });
    expect(diff[2]).toMatchObject({ before: 'come da obiettivo', after: '−350 kcal al giorno' });
    // Con il deficit in vigore ricavato (goalDeltaOf) il «prima» è un numero.
    expect(diffPatch(s.plan, s.profile, patch, { deltaInForce: 0 })[2]).toMatchObject({ before: 'nessuna', after: '−350 kcal al giorno' });
    // Nessuna differenza quando la toppa rimette i valori di oggi.
    expect(diffPatch(s.plan, s.profile, beforeOf(s.plan, s.profile, patch))).toEqual([]);
  });

  it('diffPatch con i menù: un menù tolto torna alla rotazione', () => {
    const s = baseState();
    const rotation = menuWeekFor(MON, s.plan.startDate)!;
    const approved = clone(MENU_ROTATION.find((w) => w !== rotation)!);
    const plan = { ...s.plan, menus: { [MON]: approved } };
    const back = diffPatch(plan, s.profile, { menus: { [MON]: null } });
    expect(back.length).toBeGreaterThan(0);
    expect(back).toEqual(diffMenus(approved, rotation));
    expect(diffPatch(plan, s.profile, { menus: { [MON]: approved } })).toEqual([]);
    // Con un risolutore del menù in vigore (menuWeekInForce) vale quello.
    const viaResolver = diffPatch(s.plan, s.profile, { menus: { [MON]: approved } }, { menuInForce: () => approved });
    expect(viaResolver).toEqual([]);
  });
});

describe('ordine e ritocchi', () => {
  it('topDiff: peso più alto prima, a parità l’ordine di partenza', () => {
    const items = [
      { area: 'pasto', weight: 1, label: 'a' },
      { area: 'pasto', weight: 3, label: 'b' },
      { area: 'pasto', weight: 3, label: 'c' },
      { area: 'pasto', weight: 2, label: 'd' },
    ] as const;
    expect(topDiff(items.map((x) => ({ ...x })), 3).map((d) => d.label)).toEqual(['b', 'c', 'd']);
    expect(sortDiff(items.map((x) => ({ ...x }))).map((d) => d.label)).toEqual(['b', 'c', 'd', 'a']);
    expect(topDiff([], 5)).toEqual([]);
  });

  it('righe dei ritocchi del coach', () => {
    expect(editLabel({ op: 'serie', slot: 'B', exerciseId: 'x', sets: 3, reason: 'r' }, { exerciseName: () => 'Trap bar' })).toBe('Seduta B: Trap bar, 3 serie');
    expect(editLabel({ op: 'ordine', slot: 'A', order: [], reason: 'r' })).toBe('Seduta A: ordine degli esercizi');
    const r = MENU_ROTATION[0].days[2].meals.cena!;
    expect(editLabel({ day: 2, slot: 'cena', recipeId: r, reason: 'r' })).toBe(`Mercoledì, cena: ${RECIPES[r].name}`);
  });

  it('dal giorno, con l’elisione davanti a 8 e 11', () => {
    expect(fromDayLabel('2026-11-09')).toBe('dal 9 novembre');
    expect(fromDayLabel('2026-11-08')).toBe('dall’8 novembre');
    expect(fromDayLabel('2026-11-11')).toBe('dall’11 novembre');
    expect(fromDayLabel('2026-12-01')).toBe('dal 1º dicembre');
  });
});

describe('ritorno a una versione (§ 5.5, test 9)', () => {
  const version = (id: string, after: PlanPatch, before: PlanPatch, at: string): PlanVersion => ({
    id,
    at,
    effectiveFrom: MON,
    kind: 'obiettivi',
    title: `Obiettivi ${id}`,
    before,
    after,
  });

  it('approvo A, poi B, poi torno ad A: i campi di A tornano come li aveva messi A, gli altri restano', () => {
    const s0 = baseState();
    const patchA: PlanPatch = { training: { primary: 'potenza', secondary: 'forza', presetId: 'calcio' } };
    const a = applyPatch(s0.plan, s0.profile, patchA);
    const vA = version('A', patchA, beforeOf(s0.plan, s0.profile, patchA), '2026-11-01T10:00:00.000Z');
    const patchB: PlanPatch = { training: { primary: 'forza', secondary: 'prevenzione', presetId: 'forte' }, goal: 'dimagrimento', goalDeltaKcal: -350 };
    const b = applyPatch(a.plan, a.profile, patchB);
    const state: ProposalState = { ...s0, plan: b.plan, profile: b.profile };

    const p = restoreTo(vA, state, TODAY);
    expect(p).toMatchObject({ kind: 'ritorno', status: 'aperta', effectiveFrom: MON, attempt: 0, source: 'motore', createdAt: TODAY });
    expect(p.patch).toEqual(patchA);
    expect(p.basis).toBe(planBasis('ritorno', { ...state, patch: patchA }));
    // Appena nata non è superata (la base comprende la toppa) e si approva fino a oggi.
    expect(isSuperseded(p, state, TODAY)).toBe(false);
    expect(isSuperseded(p, state, MON)).toBe(true);
    expect(p.diff).toEqual([{ area: 'obiettivo', weight: 5, label: 'Allenamento', before: 'Forza, poi prevenzione', after: 'Potenza, poi forza' }]);
    expect(p.title).toBe('Ritorno alla versione del 9 novembre');
    expect(p.subtitle).toBe('Obiettivi A · da domani cambia una voce');

    const r = applyPatch(state.plan, state.profile, p.patch);
    expect(r.plan.training).toEqual(patchA.training);
    // Le parti che A non toccava restano quelle di B.
    expect(r.profile.goal).toBe('dimagrimento');
    expect(r.plan.goalDeltaKcal).toBe(-350);
  });

  it('stessa versione e stesso piano, stessa proposta; con il piano già uguale nessuna differenza', () => {
    const s = baseState();
    const patch: PlanPatch = { training: { primary: 'prevenzione', secondary: 'forza' } };
    const v = version('V', patch, { training: null }, '2026-11-01T10:00:00.000Z');
    expect(restoreTo(v, s, TODAY)).toEqual(restoreTo(v, baseState(), TODAY));
    const same = applyPatch(s.plan, s.profile, patch);
    const p = restoreTo(v, { ...s, plan: same.plan, profile: same.profile }, TODAY);
    expect(p.diff).toEqual([]);
    expect(p.subtitle).toBe('Obiettivi V · nessuna differenza con il piano di oggi');
    // La toppa è una copia: cambiare la proposta non tocca la versione.
    p.patch.training!.primary = 'forza';
    expect(v.after.training?.primary).toBe('prevenzione');
  });
});
