/**
 * Verifica dei contenuti alimentari: coerenza dei riferimenti, porzioni, vincoli nutrizionali
 * dei 14 giorni del menù e varietà settimanale. Stampa la tabella dei totali per giorno.
 *
 * Il calcolo replica in locale la semantica di `engine/nutrition.ts` (così il test non dipende da un altro modulo):
 * grammi = qty (g) | qty × unitGrams.ml (ml, default 1) | qty × unitGrams[unit]; × carbFactor se carbScaled;
 * nutrienti = grammi × per100g / 100; porzioni di vegetali = grammi / vegPortionG.
 */
import { describe, expect, it } from 'vitest';
import type { DayType, Food, IngredientLine, MealSlot, Nutrients, Recipe } from '../domain/types';
import { FOODS } from './foods';
import { RECIPES } from './recipes';
import { MENU_ROTATION, PREP_GUIDE } from './menu';
import { BAR_OPTIONS } from './barPlanB';

// ───────────────────────── Riferimenti (settimana tipo e obiettivi predefiniti) ─────────────────────────

const CARB_FACTOR: Record<DayType, number> = { calcio: 1.25, palestra: 1, leggero: 0.9, riposo: 0.75 };
/** Settimana tipo predefinita, dal lunedì alla domenica (tipo previsto, per etichette e colori). */
const WEEK_TYPES: DayType[] = ['calcio', 'palestra', 'calcio', 'calcio', 'palestra', 'leggero', 'riposo'];
/**
 * Tipo di giorno delle porzioni e dell'obiettivo (`effectiveDayType`): la domenica è la vigilia della partita
 * del lunedì e mangia come un giorno di calcio.
 */
const PORTION_TYPES: DayType[] = ['calcio', 'palestra', 'calcio', 'calcio', 'palestra', 'leggero', 'calcio'];
/** Giorni con calcio la sera (partita, calcetto, allenamento): pre-calcio e cena di recupero. */
const FOOTBALL_DAY = [true, false, true, true, false, false, false];
const KCAL_TARGET: Record<DayType, number> = { calcio: 2800, palestra: 2600, leggero: 2450, riposo: 2300 };
/** Obiettivi predefiniti di macronutrienti (DEFAULT_TARGETS). */
const MACRO_TARGET: Record<DayType, { proteinG: number; carbG: number; fatG: number }> = {
  calcio: { proteinG: 135, carbG: 385, fatG: 80 },
  palestra: { proteinG: 135, carbG: 335, fatG: 80 },
  leggero: { proteinG: 132, carbG: 300, fatG: 80 },
  riposo: { proteinG: 130, carbG: 265, fatG: 80 },
};
/** Obiettivo di grassi predefinito, uguale per tutti i tipi di giorno. */
const FAT_TARGET = 80;
/** Scarto ammesso delle macro dall'obiettivo (le proteine possono superarlo di più). */
const MACRO_TOLERANCE = 0.15;
const PROTEIN_MAX_EXCESS = 0.25;
const SLOTS: MealSlot[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];
const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

const KCAL_TOLERANCE = 0.08;
const MIN_PROTEIN = 125;
const MIN_FIBER = 28;
/**
 * Tetti di fibra: chi parte da un consumo basso le aumenta per gradi, e una giornata da 50 g gonfia.
 * Al massimo 45 g al giorno (l'obiettivo è 35 g, il minimo LARN 25 g) e 40 g quando la sera c'è il calcio.
 */
const MAX_FIBER = 45;
const MAX_FIBER_FOOTBALL = 40;
/** Grassi: almeno il 20% dell'energia (intervallo di riferimento LARN 20-35%) e non più di 15 g sotto l'obiettivo. */
const MIN_FAT_SHARE = 0.2;
const FAT_SLACK = 15;
const MIN_VEG = 5;

const FISH = new Set(['salmone', 'salmone-affumicato', 'merluzzo', 'gamberi', 'tonno', 'sgombro']);
const LEGUMES = new Set(['ceci', 'cannellini', 'borlotti', 'lenticchie', 'lenticchie-rosse', 'pasta-lenticchie']);
/** Legumi secchi o tostati: per confrontarli con quelli cotti, × 2,4 (resa della cottura). */
const DRY_LEGUMES = new Set(['ceci-tostati']);
const DRY_LEGUME_YIELD = 2.4;
const RED_MEAT = new Set(['manzo']);
/** Grammi di legumi oltre i quali un piatto conta come "piatto di legumi". */
const LEGUME_MEAL_G = 100;
/** Grammi di legumi (equivalenti cotti) oltre i quali un pasto qualsiasi conta come porzione di legumi. */
const LEGUME_SERVING_G = 60;

// ───────────────────────── Calcolo locale ─────────────────────────

function lineGrams(line: IngredientLine, dayType: DayType): number {
  const food: Food | undefined = FOODS[line.foodId];
  let g: number;
  if (line.unit === 'g') g = line.qty;
  else if (line.unit === 'ml') g = line.qty * (food?.unitGrams.ml ?? 1);
  else g = line.qty * (food?.unitGrams[line.unit] ?? 0);
  if (line.carbScaled) g *= CARB_FACTOR[dayType];
  return g;
}

interface Totals extends Nutrients {
  veg: number;
}

const zero = (): Totals => ({ kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0, veg: 0 });

function recipeTotals(recipe: Recipe, dayType: DayType): Totals {
  const t = zero();
  for (const line of recipe.ingredients) {
    const food = FOODS[line.foodId];
    if (!food) continue;
    const g = lineGrams(line, dayType);
    t.kcal += (g * food.per100g.kcal) / 100;
    t.proteinG += (g * food.per100g.proteinG) / 100;
    t.carbG += (g * food.per100g.carbG) / 100;
    t.fatG += (g * food.per100g.fatG) / 100;
    t.fiberG += (g * food.per100g.fiberG) / 100;
    if (food.vegPortionG) t.veg += g / food.vegPortionG;
  }
  return t;
}

function add(a: Totals, b: Totals): Totals {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    carbG: a.carbG + b.carbG,
    fatG: a.fatG + b.fatG,
    fiberG: a.fiberG + b.fiberG,
    veg: a.veg + b.veg,
  };
}

const gramsOf = (recipe: Recipe, ids: Set<string>) =>
  recipe.ingredients.filter((l) => ids.has(l.foodId)).reduce((s, l) => s + lineGrams(l, 'palestra'), 0);
const hasFish = (r: Recipe) => gramsOf(r, FISH) > 0;
const hasRedMeat = (r: Recipe) => gramsOf(r, RED_MEAT) > 0;
const hasWholeEgg = (r: Recipe) => r.ingredients.some((l) => l.foodId === 'uova' && l.qty >= 1);
const isLegumeMeal = (r: Recipe) => gramsOf(r, LEGUMES) >= LEGUME_MEAL_G;
const legumeServing = (r: Recipe) => gramsOf(r, LEGUMES) + gramsOf(r, DRY_LEGUMES) * DRY_LEGUME_YIELD >= LEGUME_SERVING_G;

interface DayRow {
  label: string;
  /** Tipo delle porzioni e dell'obiettivo. */
  dayType: DayType;
  football: boolean;
  /** Vigilia della partita: porzioni e obiettivo da giorno di calcio. */
  eve: boolean;
  totals: Totals;
  deviation: number;
  /** Pasti con una porzione di legumi. */
  legumeServings: number;
}

const DAYS: DayRow[] = MENU_ROTATION.flatMap((week, wi) =>
  week.days.map((day, di) => {
    const dayType = PORTION_TYPES[di];
    let totals = zero();
    let legumeServings = 0;
    for (const slot of SLOTS) {
      const recipe = RECIPES[day.meals[slot] ?? ''];
      if (!recipe) continue;
      totals = add(totals, recipeTotals(recipe, dayType));
      if (legumeServing(recipe)) legumeServings++;
    }
    const target = KCAL_TARGET[dayType];
    return {
      label: `S${wi + 1} ${WEEKDAYS[di]}`,
      dayType,
      football: FOOTBALL_DAY[di],
      eve: PORTION_TYPES[di] !== WEEK_TYPES[di],
      totals,
      deviation: totals.kcal / target - 1,
      legumeServings,
    };
  }),
);

const fmt = (n: number, d = 0) => n.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });

function printTable() {
  const head = ['giorno', 'tipo', 'kcal', 'obiettivo', 'scarto', 'proteine', 'carboidrati', 'grassi', '% grassi', 'fibre', 'g/1000', 'vegetali', 'legumi'];
  const rows = DAYS.map((d) => [
    d.label,
    `${d.dayType}${d.eve ? ' (vigilia)' : ''}`,
    fmt(d.totals.kcal),
    fmt(KCAL_TARGET[d.dayType]),
    `${d.deviation >= 0 ? '+' : ''}${fmt(d.deviation * 100, 1)}%`,
    `${fmt(d.totals.proteinG)} g`,
    `${fmt(d.totals.carbG)} g`,
    `${fmt(d.totals.fatG)} g`,
    `${fmt(((d.totals.fatG * 9) / d.totals.kcal) * 100, 1)}%`,
    `${fmt(d.totals.fiberG)} g`,
    fmt((d.totals.fiberG / d.totals.kcal) * 1000, 1),
    fmt(d.totals.veg, 1),
    String(d.legumeServings),
  ]);
  const widths = head.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)));
  const line = (cells: string[]) => cells.map((cell, c) => (c < 2 ? cell.padEnd(widths[c]) : cell.padStart(widths[c]))).join('  ');
  console.log(['', 'Totali giornalieri del menù (porzioni adattate al tipo di giorno)', line(head), ...rows.map(line), ''].join('\n'));
}

// ───────────────────────── Test ─────────────────────────

describe('alimenti', () => {
  const foods = Object.values(FOODS);

  it('sono 70-100, con id univoci e coerenti con la chiave', () => {
    expect(foods.length).toBeGreaterThanOrEqual(70);
    expect(foods.length).toBeLessThanOrEqual(100);
    for (const [key, f] of Object.entries(FOODS)) expect(f.id).toBe(key);
  });

  it('hanno valori per 100 g plausibili e coerenti con le calorie', () => {
    for (const f of foods) {
      const n = f.per100g;
      for (const v of [n.kcal, n.proteinG, n.carbG, n.fatG, n.fiberG]) expect(v, f.id).toBeGreaterThanOrEqual(0);
      expect(n.proteinG + n.carbG + n.fatG + n.fiberG, f.id).toBeLessThanOrEqual(100);
      // Spezie e miele usano fattori di conversione specifici nelle tabelle: si controllano solo gli altri.
      if (f.pantry || f.id === 'miele' || n.kcal < 30) continue;
      const atwater = 4 * n.proteinG + 4 * n.carbG + 9 * n.fatG + 2 * n.fiberG;
      expect(Math.abs(atwater - n.kcal) / n.kcal, `${f.id}: ${n.kcal} kcal dichiarate, ${atwater.toFixed(0)} calcolate`).toBeLessThan(0.06);
    }
  });

  it('hanno porzioni e fattori di acquisto sensati', () => {
    for (const f of foods) {
      for (const [unit, g] of Object.entries(f.unitGrams)) expect(g, `${f.id} ${unit}`).toBeGreaterThan(0);
      if (f.buyFactor !== undefined) {
        expect(f.buyFactor, f.id).toBeGreaterThan(0.2);
        expect(f.buyFactor, f.id).toBeLessThan(2);
      }
    }
    expect(FOODS.pollo.unitGrams.palmo).toBeGreaterThanOrEqual(110);
    expect(FOODS.pollo.unitGrams.palmo).toBeLessThanOrEqual(120);
    expect(FOODS['riso-basmati'].unitGrams.pugno).toBe(150);
    expect(FOODS['olio-evo'].unitGrams.cucchiaio).toBe(10);
    expect(FOODS['riso-basmati'].buyFactor).toBeCloseTo(0.38, 2);
    expect(FOODS.pasta.buyFactor).toBeCloseTo(0.45, 2);
    for (const id of ['olio-evo', 'sale', 'pepe', 'aceto-balsamico']) expect(FOODS[id].pantry, id).toBe(true);
    for (const id of ['mela', 'banana', 'zucchine', 'broccoli', 'insalata', 'frutti-bosco']) expect(FOODS[id].vegPortionG, id).toBe(80);
  });
});

describe('ricette', () => {
  const recipes = Object.values(RECIPES);
  const bySlot = (slot: MealSlot) => recipes.filter((r) => r.slots.includes(slot));

  it('sono 45-60, divise per pasto come da specifica', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(45);
    expect(recipes.length).toBeLessThanOrEqual(60);
    for (const [key, r] of Object.entries(RECIPES)) expect(r.id).toBe(key);
    expect(bySlot('colazione').length).toBeGreaterThanOrEqual(7);
    expect(bySlot('spuntino').length).toBeGreaterThanOrEqual(7);
    expect(bySlot('pranzo').length).toBeGreaterThanOrEqual(12);
    expect(bySlot('merenda').length).toBeGreaterThanOrEqual(6);
    expect(bySlot('cena').length).toBeGreaterThanOrEqual(12);
    expect(recipes.filter((r) => r.tags.includes('pre-calcio')).length).toBeGreaterThanOrEqual(3);
    expect(recipes.filter((r) => r.tags.includes('recupero')).length).toBeGreaterThanOrEqual(4);
  });

  it('usano solo alimenti esistenti, con unità presenti in unitGrams', () => {
    for (const r of recipes) {
      expect(r.ingredients.length, r.id).toBeGreaterThan(0);
      expect(r.slots.length, r.id).toBeGreaterThan(0);
      for (const line of r.ingredients) {
        const food = FOODS[line.foodId];
        expect(food, `${r.id}: alimento ${line.foodId}`).toBeDefined();
        expect(line.qty, `${r.id}: ${line.foodId}`).toBeGreaterThan(0);
        if (line.unit !== 'g') {
          expect(food?.unitGrams[line.unit], `${r.id}: ${line.foodId} senza unitGrams['${line.unit}']`).toBeGreaterThan(0);
          // Le porzioni a occhio si leggono a mezze unità.
          expect(Number.isInteger(line.qty * 2), `${r.id}: ${line.foodId} ${line.qty}`).toBe(true);
        }
      }
    }
  });

  it('hanno 1-3 alternative valide dello stesso pasto', () => {
    for (const r of recipes) {
      const swaps = r.swaps ?? [];
      expect(swaps.length, r.id).toBeGreaterThanOrEqual(1);
      expect(swaps.length, r.id).toBeLessThanOrEqual(3);
      expect(new Set(swaps).size, r.id).toBe(swaps.length);
      for (const id of swaps) {
        expect(id, r.id).not.toBe(r.id);
        const alt = RECIPES[id];
        expect(alt, `${r.id}: alternativa ${id}`).toBeDefined();
        expect(alt?.slots.some((s) => r.slots.includes(s)), `${r.id} → ${id}: pasto diverso`).toBe(true);
        // Un pre-calcio si sostituisce con un pre-calcio, una cena di recupero con una cena di recupero.
        for (const tag of ['pre-calcio', 'recupero']) {
          if (r.tags.includes(tag)) expect(alt?.tags.includes(tag), `${r.id} → ${id}: ${tag}`).toBe(true);
        }
      }
    }
  });

  it('sono veloci o da preparazione, con passaggi brevi', () => {
    for (const r of recipes) {
      if (!r.batch) expect(r.prepMin, r.id).toBeLessThanOrEqual(15);
      expect(r.steps.length, r.id).toBeGreaterThanOrEqual(1);
      expect(r.steps.length, r.id).toBeLessThanOrEqual(5);
      for (const s of r.steps) expect(s.length, `${r.id}: ${s}`).toBeLessThanOrEqual(170);
    }
  });

  it('hanno proteine 30-45 g nei pasti principali (porzione di riferimento)', () => {
    for (const r of recipes) {
      if (!r.slots.some((s) => s === 'pranzo' || s === 'cena')) continue;
      const p = recipeTotals(r, 'palestra').proteinG;
      expect(p, `${r.id}: ${p.toFixed(1)} g`).toBeGreaterThanOrEqual(30);
      expect(p, `${r.id}: ${p.toFixed(1)} g`).toBeLessThanOrEqual(45);
    }
  });

  it('hanno etichette coerenti con gli ingredienti', () => {
    for (const r of recipes) {
      expect(r.tags.includes('pesce'), `${r.id}: pesce`).toBe(hasFish(r));
      expect(r.tags.includes('carne rossa'), `${r.id}: carne rossa`).toBe(hasRedMeat(r));
      expect(r.tags.includes('uova'), `${r.id}: uova`).toBe(hasWholeEgg(r));
      if (r.slots.includes('pranzo') || r.slots.includes('cena')) {
        expect(r.tags.includes('legumi'), `${r.id}: legumi`).toBe(isLegumeMeal(r));
      }
      if (r.slots.includes('spuntino') && !r.slots.includes('merenda')) {
        expect(r.tags.includes('da portare'), `${r.id}: spuntino da portare`).toBe(true);
      }
    }
  });
});

describe('menù a rotazione', () => {
  it('copre 2 settimane da 7 giorni con tutti e 5 i pasti', () => {
    expect(MENU_ROTATION.length).toBe(2);
    for (const week of MENU_ROTATION) {
      expect(week.days.length).toBe(7);
      for (const day of week.days) for (const slot of SLOTS) expect(day.meals[slot]).toBeTruthy();
    }
  });

  it('usa solo ricette esistenti nel pasto giusto', () => {
    MENU_ROTATION.forEach((week, wi) =>
      week.days.forEach((day, di) => {
        for (const slot of SLOTS) {
          const id = day.meals[slot] ?? '';
          const recipe = RECIPES[id];
          const where = `S${wi + 1} ${WEEKDAYS[di]} ${slot}: ${id}`;
          expect(recipe, where).toBeDefined();
          expect(recipe?.slots.includes(slot), `${where} non è una ricetta da ${slot}`).toBe(true);
        }
      }),
    );
  });

  it('nei giorni di calcio prevede il pre-calcio e la cena di recupero, negli altri no', () => {
    MENU_ROTATION.forEach((week, wi) =>
      week.days.forEach((day, di) => {
        const calcio = FOOTBALL_DAY[di];
        const where = `S${wi + 1} ${WEEKDAYS[di]}`;
        expect(RECIPES[day.meals.merenda ?? '']?.tags.includes('pre-calcio'), `${where} merenda`).toBe(calcio);
        expect(RECIPES[day.meals.cena ?? '']?.tags.includes('recupero'), `${where} cena`).toBe(calcio);
        // Prima del calcio niente pranzi molto ricchi di fibra.
        if (calcio) expect(recipeTotals(RECIPES[day.meals.pranzo ?? ''], 'calcio').fiberG, `${where} pranzo`).toBeLessThanOrEqual(20);
      }),
    );
  });

  it('rispetta calorie, proteine, fibre e vegetali in ognuno dei 14 giorni', () => {
    printTable();
    expect(DAYS.length).toBe(14);
    for (const d of DAYS) {
      const where = `${d.label} (${d.dayType})`;
      expect(Math.abs(d.deviation), `${where}: ${fmt(d.totals.kcal)} kcal`).toBeLessThanOrEqual(KCAL_TOLERANCE);
      expect(d.totals.proteinG, `${where}: proteine`).toBeGreaterThanOrEqual(MIN_PROTEIN);
      expect(d.totals.fiberG, `${where}: fibre`).toBeGreaterThanOrEqual(MIN_FIBER);
      expect(d.totals.veg, `${where}: porzioni di frutta e verdura`).toBeGreaterThanOrEqual(MIN_VEG);
    }
  });

  it('non eccede con le fibre, soprattutto quando la sera c’è il calcio', () => {
    for (const d of DAYS) {
      const where = `${d.label} (${d.dayType}): ${fmt(d.totals.fiberG, 1)} g di fibre`;
      expect(d.totals.fiberG, where).toBeLessThanOrEqual(d.football ? MAX_FIBER_FOOTBALL : MAX_FIBER);
    }
  });

  it('ha grassi sufficienti: almeno il 20% delle kcal e non oltre 15 g sotto l’obiettivo', () => {
    for (const d of DAYS) {
      const where = `${d.label} (${d.dayType}): ${fmt(d.totals.fatG)} g di grassi`;
      expect((d.totals.fatG * 9) / d.totals.kcal, where).toBeGreaterThanOrEqual(MIN_FAT_SHARE);
      expect(d.totals.fatG, where).toBeGreaterThanOrEqual(FAT_TARGET - FAT_SLACK);
    }
  });

  it('resta vicino all’obiettivo anche nelle macro: carboidrati e grassi entro il 15%, proteine tra −15% e +25%', () => {
    for (const d of DAYS) {
      const t = MACRO_TARGET[d.dayType];
      const dev = (v: number, target: number) => v / target - 1;
      const where = (name: string, v: number, target: number) => `${d.label} (${d.dayType}): ${name} ${fmt(v)} su ${target} g`;
      expect(Math.abs(dev(d.totals.carbG, t.carbG)), where('carboidrati', d.totals.carbG, t.carbG)).toBeLessThanOrEqual(MACRO_TOLERANCE);
      expect(Math.abs(dev(d.totals.fatG, t.fatG)), where('grassi', d.totals.fatG, t.fatG)).toBeLessThanOrEqual(MACRO_TOLERANCE);
      expect(dev(d.totals.proteinG, t.proteinG), where('proteine', d.totals.proteinG, t.proteinG)).toBeGreaterThanOrEqual(-MACRO_TOLERANCE);
      expect(dev(d.totals.proteinG, t.proteinG), where('proteine', d.totals.proteinG, t.proteinG)).toBeLessThanOrEqual(PROTEIN_MAX_EXCESS);
    }
  });

  it('prevede al massimo una porzione di legumi al giorno', () => {
    for (const d of DAYS) expect(d.legumeServings, d.label).toBeLessThanOrEqual(1);
  });

  it('è vario: pesce 2-3 volte, legumi 4+, uova 2-3, carne rossa al massimo 1 a settimana', () => {
    MENU_ROTATION.forEach((week, wi) => {
      const meals = week.days.flatMap((day) => SLOTS.map((slot) => ({ slot, recipe: RECIPES[day.meals[slot] ?? ''] })));
      const count = (pred: (r: Recipe) => boolean, slots: MealSlot[] = SLOTS) =>
        meals.filter((m) => m.recipe && slots.includes(m.slot) && pred(m.recipe)).length;
      const fish = count(hasFish);
      const legumes = count(isLegumeMeal, ['pranzo', 'cena']);
      const eggs = count(hasWholeEgg);
      const redMeat = count(hasRedMeat);
      const where = `settimana ${wi + 1}`;
      expect(fish, `${where}: pesce`).toBeGreaterThanOrEqual(2);
      expect(fish, `${where}: pesce`).toBeLessThanOrEqual(3);
      expect(legumes, `${where}: legumi`).toBeGreaterThanOrEqual(4);
      expect(eggs, `${where}: uova`).toBeGreaterThanOrEqual(2);
      expect(eggs, `${where}: uova`).toBeLessThanOrEqual(3);
      expect(redMeat, `${where}: carne rossa`).toBeLessThanOrEqual(1);
    });
  });

  it('ha 4-6 attività di preparazione domenicale (60-90 minuti) che coprono le ricette da preparazione', () => {
    const taskIds = new Set<string>();
    MENU_ROTATION.forEach((week, wi) => {
      const where = `settimana ${wi + 1}`;
      expect(week.prep.length, where).toBeGreaterThanOrEqual(4);
      expect(week.prep.length, where).toBeLessThanOrEqual(6);
      const minutes = week.prep.reduce((s, t) => s + t.minutes, 0);
      expect(minutes, `${where}: minuti`).toBeGreaterThanOrEqual(60);
      expect(minutes, `${where}: minuti`).toBeLessThanOrEqual(90);
      const covered = new Set<string>();
      for (const task of week.prep) {
        expect(taskIds.has(task.id), `id ripetuto ${task.id}`).toBe(false);
        taskIds.add(task.id);
        expect(task.minutes, task.id).toBeGreaterThan(0);
        expect(task.title.length, task.id).toBeGreaterThan(0);
        expect(task.yields.length, task.id).toBeGreaterThan(0);
        for (const id of task.recipeIds ?? []) {
          expect(RECIPES[id], `${task.id}: ricetta ${id}`).toBeDefined();
          covered.add(id);
        }
      }
      // Da lunedì a sabato le ricette da preparazione arrivano dalla domenica precedente.
      week.days.slice(0, 6).forEach((day, di) => {
        for (const slot of SLOTS) {
          const r = RECIPES[day.meals[slot] ?? ''];
          if (r?.batch) expect(covered.has(r.id), `${where} ${WEEKDAYS[di]}: ${r.id} non è nella preparazione`).toBe(true);
        }
      });
    });
  });
});

describe('guida della preparazione', () => {
  it('ha passaggi e timer sensati per ogni attività della domenica', () => {
    const ids = MENU_ROTATION.flatMap((w) => w.prep.map((t) => t));
    for (const task of ids) {
      const guide = PREP_GUIDE[task.id];
      expect(guide, task.id).toBeDefined();
      expect(guide.steps.length, task.id).toBeGreaterThanOrEqual(1);
      expect(guide.steps.length, task.id).toBeLessThanOrEqual(5);
      for (const step of guide.steps) {
        expect(step.length, `${task.id}: ${step}`).toBeLessThanOrEqual(170);
        expect(step.includes('—'), step).toBe(false);
        expect(step[0], step).toBe(step[0].toLocaleUpperCase('it-IT'));
      }
      for (const t of guide.timers ?? []) {
        expect(t.minutes, `${task.id}: ${t.label}`).toBeGreaterThan(0);
        // Un timer non dura più dell'attività.
        expect(t.minutes, `${task.id}: ${t.label}`).toBeLessThanOrEqual(task.minutes);
      }
    }
    // Nessuna guida per attività che non esistono.
    for (const id of Object.keys(PREP_GUIDE)) expect(ids.some((t) => t.id === id), id).toBe(true);
  });
});

describe('piano B al bar', () => {
  it('ha 15-20 opzioni con verdetto, motivo e stima', () => {
    expect(BAR_OPTIONS.length).toBeGreaterThanOrEqual(15);
    expect(BAR_OPTIONS.length).toBeLessThanOrEqual(20);
    expect(new Set(BAR_OPTIONS.map((o) => o.id)).size).toBe(BAR_OPTIONS.length);
    for (const verdict of ['si', 'meglio', 'programmato'] as const) {
      expect(BAR_OPTIONS.some((o) => o.verdict === verdict), verdict).toBe(true);
    }
    for (const o of BAR_OPTIONS) {
      expect(o.why.length, o.id).toBeGreaterThan(20);
      expect(o.approx.kcal, o.id).toBeGreaterThan(0);
      if (o.approx.kcal < 30) continue;
      const a = o.approx;
      const atwater = 4 * a.proteinG + 4 * a.carbG + 9 * a.fatG + 2 * a.fiberG;
      expect(Math.abs(atwater - a.kcal) / a.kcal, o.id).toBeLessThan(0.08);
    }
  });
});

describe('testi', () => {
  const texts: [string, string][] = [
    ...Object.values(FOODS).map((f): [string, string] => [f.id, f.name]),
    ...Object.values(RECIPES).flatMap((r): [string, string][] => [
      [r.id, r.name],
      ...r.steps.map((s): [string, string] => [r.id, s]),
      ...r.tags.map((t): [string, string] => [r.id, t]),
      ...r.ingredients.flatMap((l): [string, string][] => (l.note ? [[r.id, l.note]] : [])),
    ]),
    ...MENU_ROTATION.flatMap((w) => w.prep.flatMap((t): [string, string][] => [[t.id, t.title], [t.id, t.yields]])),
    ...BAR_OPTIONS.flatMap((o): [string, string][] => [[o.id, o.name], [o.id, o.why]]),
  ];

  it('sono in italiano pulito: niente trattino lungo, niente emoji, maiuscola iniziale nei titoli', () => {
    for (const [id, text] of texts) {
      expect(text.includes('—'), `${id}: trattino lungo in "${text}"`).toBe(false);
      expect(/\p{Extended_Pictographic}/u.test(text), `${id}: emoji in "${text}"`).toBe(false);
      expect(text.trim(), id).toBe(text);
    }
    const titles = [
      ...Object.values(FOODS).map((f) => f.name),
      ...Object.values(RECIPES).map((r) => r.name),
      ...BAR_OPTIONS.map((o) => o.name),
      ...MENU_ROTATION.flatMap((w) => w.prep.map((t) => t.title)),
    ];
    for (const t of titles) expect(t[0], t).toBe(t[0].toLocaleUpperCase('it-IT'));
  });
});
