/**
 * Validatore del menù (docs/FASE2.md § 4.2, § 4.10, § 13.4 test 12 e 14): ogni classe di regole si accende sul menù
 * giusto, la rotazione passa, il validatore non lancia mai eccezioni.
 */
import { describe, expect, it } from 'vitest';
import type { MealSlot, MenuWeek } from '../../domain/types';
import { MENU_ROTATION, STARTER_WEEK } from '../../data/menu';
import { RECIPES } from '../../data/recipes';
import { defaultAppData } from '../../data/defaults';
import { excludedFoods } from '../exclusions';
import { menuDaysFor, type MenuDayCtx, type MenuValidationCtx } from './context';
import { menuWeekSummary, validateMenuWeek } from './validate';
import { scaleOfDay, recipeStats } from './stats';
import { carbScaleForMeals } from '../nutrition';

const MON = '2026-11-09';
const state = defaultAppData(MON);
const days = menuDaysFor(MON, state);
const ctx = (over: Partial<MenuValidationCtx> = {}): MenuValidationCtx => ({ days, month: 11, excluded: excludedFoods(state.plan), previous: MENU_ROTATION[1], ...over });
const clone = (w: MenuWeek): MenuWeek => JSON.parse(JSON.stringify(w)) as MenuWeek;
const S1 = MENU_ROTATION[0];
const codes = (w: MenuWeek, c: MenuValidationCtx = ctx()) => validateMenuWeek(w, c).map((v) => v.code);
const withMeal = (w: MenuWeek, day: number, slot: MealSlot, id: string): MenuWeek => {
  const out = clone(w);
  out.days[day].meals[slot] = id;
  return out;
};

describe('validateMenuWeek', () => {
  it('la rotazione è valida: è il seme e il ripiego sempre valido (§ 4.10)', () => {
    expect(validateMenuWeek(S1, ctx())).toEqual([]);
    expect(validateMenuWeek(MENU_ROTATION[1], ctx({ days: menuDaysFor('2026-11-16', state), previous: S1 }))).toEqual([]);
  });

  it('H0: un alimento escluso nella settimana è una violazione dura, con il pasto e l’alimento', () => {
    const v = validateMenuWeek(S1, ctx({ excluded: new Set([...excludedFoods(state.plan), 'tonno']) }));
    const hit = v.filter((x) => x.code === 'escluso');
    expect(hit.length).toBeGreaterThan(0);
    expect(hit.every((x) => x.hard && x.where?.key === 'tonno' && x.where.day !== undefined && x.where.slot)).toBe(true);
    expect(hit[0].message).toMatch(/hai tolto dal piano/);
  });

  it('H1: pre-calcio, cena di recupero, legumi alla vigilia, preparazione la domenica, pasto vuoto', () => {
    // Lunedì sera c'è la partita: la merenda deve essere un pre-calcio e la cena di recupero.
    expect(codes(withMeal(S1, 0, 'merenda', 'yogurt-cacao-pera'))).toContain('pre-calcio');
    expect(codes(withMeal(S1, 0, 'cena', 'salmone-patate-broccoli'))).toContain('recupero');
    // Martedì non c'è calcio: niente pre-calcio né cena di recupero.
    expect(codes(withMeal(S1, 1, 'merenda', 'pre-pane-banana'))).toContain('pre-calcio');
    expect(codes(withMeal(S1, 1, 'cena', 'couscous-pollo-spinaci'))).toContain('recupero');
    // Domenica è la vigilia della partita: niente legumi a cena e niente ricette da preparazione.
    expect(codes(withMeal(S1, 6, 'cena', 'fagioli-tonno-cipolla'))).toContain('legumi-vigilia');
    expect(codes(withMeal(S1, 6, 'cena', 'vellutata-zucca-lenticchie'))).toContain('preparazione-domenica');
    // Nei giorni di calcio legumi solo a pranzo e solo lenticchie rosse.
    expect(codes(withMeal(S1, 2, 'pranzo', 'pasta-ceci-rosmarino'))).toContain('legumi-calcio');
    const empty = clone(S1);
    delete empty.days[3].meals.spuntino;
    expect(codes(empty)).toContain('pasto-vuoto');
    expect(codes(withMeal(S1, 3, 'spuntino', 'non-esiste'))).toContain('pasto-vuoto');
    expect(codes(withMeal(S1, 3, 'spuntino', 'pasta-tonno-pomodoro'))).toContain('pasto-sbagliato');
  });

  it('H1: una ricetta da preparazione senza il suo compito della domenica', () => {
    const w = withMeal(S1, 1, 'pranzo', 'farro-salmone-zucchine');
    expect(codes(w)).toContain('preparazione');
  });

  it('H1: un pasto che cade nel lavoro vuole una ricetta da portare', () => {
    const carryDays: MenuDayCtx[] = days.map((d, i) => (i === 1 ? { ...d, carry: ['pranzo'] } : d));
    expect(codes(S1, ctx({ days: carryDays }))).toContain('da-portare');
    const portable = withMeal(S1, 1, 'pranzo', 'insalata-ceci-tonno');
    expect(codes(portable, ctx({ days: carryDays }))).not.toContain('da-portare');
  });

  it('H2: calorie, proteine e fibre del giorno lontane dall’obiettivo', () => {
    // L'obiettivo sale ma la scala dei carboidrati resta quella di prima: le porzioni non lo seguono.
    const low: MenuDayCtx[] = days.map((d, i) => (i === 1 ? { ...d, target: { ...d.target, kcal: d.target.kcal + 600 } } : d));
    expect(codes(S1, ctx({ days: low }))).toContain('kcal-giorno');
    const protein: MenuDayCtx[] = days.map((d, i) => (i === 1 ? { ...d, target: { ...d.target, proteinG: 200 } } : d));
    expect(codes(S1, ctx({ days: protein }))).toContain('proteine-giorno');
    // Due pasti di legumi ricchi di fibra lo stesso martedì: fibre oltre il tetto e due porzioni di legumi.
    const fiber = withMeal(withMeal(S1, 1, 'cena', 'vellutata-pronta-lenticchie'), 1, 'pranzo', 'orzo-sgombro-cannellini');
    const c = codes(fiber);
    expect(c).toContain('legumi-giorno');
  });

  it('H3: carne rossa, riso, legumi, zuccheri liberi della settimana', () => {
    expect(codes(withMeal(S1, 1, 'cena', 'straccetti-manzo-rucola'))).toContain('carne-rossa-settimana');
    const rice = withMeal(withMeal(S1, 1, 'cena', 'tacchino-riso-carote'), 4, 'cena', 'pollo-paprika-peperoni');
    expect(codes(rice)).toContain('riso-settimana');
    const noLegumes = clone(S1);
    noLegumes.days[1].meals.pranzo = 'pasta-pollo-spinaci';
    noLegumes.days[3].meals.pranzo = 'pasta-tonno-pomodoro';
    noLegumes.days[5].meals.cena = 'frittata-zucchine';
    expect(codes(noLegumes)).toContain('legumi-settimana');
  });

  it('H4 e H5: doppioni nella spesa, freschi nuovi e fuori stagione', () => {
    // Salmone fresco e affumicato nella stessa settimana.
    const dup = withMeal(S1, 6, 'cena', 'patate-salmone-affumicato');
    expect(codes(dup)).toContain('doppione');
    // A novembre le pesche e le fragole non ci sono.
    expect(codes(withMeal(S1, 1, 'merenda', 'yogurt-pesca-mandorle'))).toContain('fuori-stagione');
    expect(codes(withMeal(S1, 1, 'merenda', 'yogurt-pesca-mandorle'), ctx({ month: 7 }))).not.toContain('fuori-stagione');
    // Tre freschi nuovi nella stessa settimana: al massimo due.
    const many = withMeal(withMeal(withMeal(S1, 1, 'merenda', 'yogurt-cachi-mandorle'), 4, 'cena', 'pollo-finocchi-arance'), 5, 'pranzo', 'pasta-cavolfiore-ceci');
    expect(codes(many)).toContain('prodotti-nuovi');
  });

  it('H6: varietà delle colazioni e preparazione della domenica', () => {
    const same = clone(S1);
    for (const d of [0, 1, 2, 3]) same.days[d].meals.colazione = 'porridge-cacao-banana';
    expect(codes(same)).toContain('varieta');
    const noPrep = { ...clone(S1), prep: [] };
    expect(codes(noPrep)).toContain('preparazione-tempo');
  });

  it('il menù di avvio passa con le regole dell’avvio, e senza no: fibre basse e varietà di proposito', () => {
    expect(validateMenuWeek(STARTER_WEEK, ctx({ rules: 'avvio', previous: undefined }))).toEqual([]);
    const strict = codes(STARTER_WEEK, ctx({ previous: undefined }));
    expect(strict).toContain('fibre-giorno');
    expect(strict).toContain('varieta');
  });

  it('non lancia mai eccezioni e non accetta menù rotti', () => {
    const broken = [
      { days: [], prep: [] },
      { days: Array.from({ length: 7 }, () => ({ meals: { colazione: 'constructor', pranzo: '__proto__' } })), prep: [] },
      { days: Array.from({ length: 7 }, () => ({})), prep: [{ id: 'x', title: '', minutes: Number.NaN, yields: '' }] },
      null,
    ] as unknown as MenuWeek[];
    for (const w of broken) {
      const v = validateMenuWeek(w, ctx());
      expect(v.length).toBeGreaterThan(0);
      expect(v.every((x) => x.hard && typeof x.message === 'string' && x.message.length > 0)).toBe(true);
    }
  });

  it('la scala del giorno è quella di carbScaleForMeals (la stessa delle schermate)', () => {
    for (let d = 0; d < 7; d++) {
      const day = days[d];
      const ids = Object.values(S1.days[d].meals) as string[];
      const fast = scaleOfDay(ids.map((id) => recipeStats(id, day.dayType)), day).scale;
      const target = { ...day.target, kcal: day.scaleKcal ?? day.target.kcal };
      expect(fast).toBeCloseTo(carbScaleForMeals(ids.map((id) => RECIPES[id]), day.dayType, target, day.carbFloorG), 9);
    }
  });

  it('riassume pesce, legumi e riso della settimana', () => {
    expect(menuWeekSummary(S1)).toMatchObject({ fishMeals: 3, riceMeals: 3, redMeatMeals: 1 });
    expect(menuWeekSummary(S1).legumeMeals).toBeGreaterThanOrEqual(4);
  });
});
