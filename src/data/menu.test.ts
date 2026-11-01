/**
 * Verifica dei contenuti alimentari: coerenza dei riferimenti, porzioni, vincoli nutrizionali
 * dei 14 giorni del menù e varietà settimanale. Stampa la tabella dei totali per giorno.
 *
 * Il calcolo replica in locale la semantica di `engine/nutrition.ts` (così il test non dipende da un altro modulo):
 * grammi = qty (g) | qty × unitGrams.ml (ml, default 1) | qty × unitGrams[unit]; × carbFactor se carbScaled;
 * nutrienti = grammi × per100g / 100; porzioni di vegetali = grammi / vegPortionG.
 */
import { describe, expect, it } from 'vitest';
import type { DayType, Food, IngredientLine, MealSlot, MenuWeek, Nutrients, Recipe } from '../domain/types';
import { FOODS } from './foods';
import { RECIPES } from './recipes';
import { MENU_ROTATION, PREP_GUIDE, STARTER_FIBER_SHARE, STARTER_PRODUCTS, STARTER_WEEK } from './menu';
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
 * Al massimo 45 g al giorno (l'obiettivo è 35 g, il minimo LARN 25 g) e 40 g quando la sera c'è il calcio o il
 * giorno dopo c'è la partita (vigilia).
 */
const MAX_FIBER = 45;
const MAX_FIBER_FOOTBALL = 40;
/**
 * Settimana di avvio: le fibre salgono per gradi. Chi mangiava poca frutta e verdura non passa da un giorno
 * all'altro a 40 g: nei giorni di avvio 22-32 g (circa 11 g ogni 1.000 kcal), poi la rotazione.
 */
const MIN_FIBER_STARTER = 22;
/** Obiettivo di fibre predefinito (DEFAULT_TARGETS), uguale per tutti i tipi di giorno. */
const FIBER_TARGET = 35;
const MAX_FIBER_STARTER = 32;
/** Scarto minimo tra la media delle fibre della rotazione e quella della settimana di avvio. */
const FIBER_STEP = 6;
/** Grassi: almeno il 20% dell'energia (intervallo di riferimento LARN 20-35%) e non più di 15 g sotto l'obiettivo. */
const MIN_FAT_SHARE = 0.2;
const FAT_SLACK = 15;
const MIN_VEG = 5;
/**
 * Minimo di carboidrati il giorno della partita e alla vigilia (`MATCH_CARB_G_PER_KG` in engine/targets): 6 g/kg
 * del peso su cui sono costruite le proteine del piano (1,9 g/kg), arrotondato a 5 g. Il menù lo raggiunge
 * alzando le righe di carboidrati (`dayCarbScale`): anche così le fibre devono restare sotto il tetto.
 */
const MATCH_CARB_G_PER_KG = 6;
const REF_WEIGHT_KG = MACRO_TARGET.calcio.proteinG / 1.9;
const MATCH_FLOOR_G = Math.round((MATCH_CARB_G_PER_KG * REF_WEIGHT_KG) / 5) * 5;
/** Giorno della partita (lunedì) e vigilia (domenica), 0 = lunedì. */
const MATCH_DAYS = [0, 6];
const MATCH_EVE = 6;

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

function dayRows(weeks: MenuWeek[], prefix: string): DayRow[] {
  return weeks.flatMap((week, wi) =>
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
      label: `${prefix}${weeks.length > 1 ? wi + 1 : ''} ${WEEKDAYS[di]}`,
      dayType,
      football: FOOTBALL_DAY[di],
      eve: PORTION_TYPES[di] !== WEEK_TYPES[di],
      totals,
      deviation: totals.kcal / target - 1,
      legumeServings,
    };
  }),
  );
}

const DAYS: DayRow[] = dayRows(MENU_ROTATION, 'S');
/** Settimana di avvio: i giorni dal primo avvio al lunedì che trova fatte spesa e preparazione. */
const STARTER_DAYS: DayRow[] = dayRows([STARTER_WEEK], 'Avvio');

const fmt = (n: number, d = 0) => n.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
/** Nome da lista della spesa: senza lo stato di cottura ("Riso basmati, cotto" → "Riso basmati"). */
const shopNameOf = (f: Food) => f.name.replace(/,\s*(cott[oaie]|sgocciolat[oaie]|rinvenut[oa])$/u, '');

function printTable(days: DayRow[] = DAYS, title = 'Totali giornalieri del menù (porzioni adattate al tipo di giorno)') {
  const head = ['giorno', 'tipo', 'kcal', 'obiettivo', 'scarto', 'proteine', 'carboidrati', 'grassi', '% grassi', 'fibre', 'g/1000', 'vegetali', 'legumi'];
  const rows = days.map((d) => [
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
  console.log(['', title, line(head), ...rows.map(line), ''].join('\n'));
}

// ───────────────────────── Vincoli giornalieri (rotazione e avvio) ─────────────────────────

function checkNutrition(days: DayRow[], minFiber = MIN_FIBER) {
  for (const d of days) {
    const where = `${d.label} (${d.dayType})`;
    expect(Math.abs(d.deviation), `${where}: ${fmt(d.totals.kcal)} kcal`).toBeLessThanOrEqual(KCAL_TOLERANCE);
    expect(d.totals.proteinG, `${where}: proteine`).toBeGreaterThanOrEqual(MIN_PROTEIN);
    expect(d.totals.fiberG, `${where}: fibre`).toBeGreaterThanOrEqual(minFiber);
    expect(d.totals.veg, `${where}: porzioni di frutta e verdura`).toBeGreaterThanOrEqual(MIN_VEG);
  }
}

function checkFiberCap(days: DayRow[]) {
  for (const d of days) {
    const where = `${d.label} (${d.dayType}${d.eve ? ', vigilia' : ''}): ${fmt(d.totals.fiberG, 1)} g di fibre`;
    expect(d.totals.fiberG, where).toBeLessThanOrEqual(d.football || d.eve ? MAX_FIBER_FOOTBALL : MAX_FIBER);
  }
}

/**
 * Legumi intorno al calcio: nei giorni di calcio solo le lenticchie rosse decorticate e solo a pranzo (la sera
 * c'è il campo); alla vigilia della partita niente legumi a cena, perché fermentano nella notte prima della gara.
 */
function checkLegumesAroundFootball(week: MenuWeek, label: string) {
  week.days.forEach((day, di) => {
    const eve = PORTION_TYPES[di] !== WEEK_TYPES[di];
    for (const slot of SLOTS) {
      const r = RECIPES[day.meals[slot] ?? ''];
      if (!r) continue;
      const legumes = r.ingredients.filter((l) => LEGUMES.has(l.foodId) || DRY_LEGUMES.has(l.foodId));
      if (!legumes.length) continue;
      const where = `${label} ${WEEKDAYS[di]} ${slot}: ${r.id}`;
      if (FOOTBALL_DAY[di]) {
        expect(slot === 'pranzo', `${where}, legumi fuori dal pranzo in un giorno di calcio`).toBe(true);
        expect(legumes.every((l) => l.foodId === 'lenticchie-rosse'), `${where}, solo lenticchie rosse nei giorni di calcio`).toBe(true);
      }
      if (eve) expect(slot === 'cena', `${where}, legumi a cena alla vigilia`).toBe(false);
    }
  });
}

function checkFat(days: DayRow[]) {
  for (const d of days) {
    const where = `${d.label} (${d.dayType}): ${fmt(d.totals.fatG)} g di grassi`;
    expect((d.totals.fatG * 9) / d.totals.kcal, where).toBeGreaterThanOrEqual(MIN_FAT_SHARE);
    expect(d.totals.fatG, where).toBeGreaterThanOrEqual(FAT_TARGET - FAT_SLACK);
  }
}

function checkMacros(days: DayRow[]) {
  for (const d of days) {
    const t = MACRO_TARGET[d.dayType];
    const dev = (v: number, target: number) => v / target - 1;
    const where = (name: string, v: number, target: number) => `${d.label} (${d.dayType}): ${name} ${fmt(v)} su ${target} g`;
    expect(Math.abs(dev(d.totals.carbG, t.carbG)), where('carboidrati', d.totals.carbG, t.carbG)).toBeLessThanOrEqual(MACRO_TOLERANCE);
    expect(Math.abs(dev(d.totals.fatG, t.fatG)), where('grassi', d.totals.fatG, t.fatG)).toBeLessThanOrEqual(MACRO_TOLERANCE);
    expect(dev(d.totals.proteinG, t.proteinG), where('proteine', d.totals.proteinG, t.proteinG)).toBeGreaterThanOrEqual(-MACRO_TOLERANCE);
    expect(dev(d.totals.proteinG, t.proteinG), where('proteine', d.totals.proteinG, t.proteinG)).toBeLessThanOrEqual(PROTEIN_MAX_EXCESS);
  }
}

/** Pre-calcio e cena di recupero nei giorni di calcio (negli altri no), pranzo non troppo ricco di fibra. */
function checkFootballMeals(week: MenuWeek, label: string) {
  week.days.forEach((day, di) => {
    const calcio = FOOTBALL_DAY[di];
    const where = `${label} ${WEEKDAYS[di]}`;
    const pre = RECIPES[day.meals.merenda ?? '']?.tags.includes('pre-calcio');
    // Alla vigilia della partita la merenda può essere un pre-calcio: carboidrati facili e poca fibra servono anche lì.
    if (!(di === MATCH_EVE && pre)) expect(pre, `${where} merenda`).toBe(calcio);
    expect(RECIPES[day.meals.cena ?? '']?.tags.includes('recupero'), `${where} cena`).toBe(calcio);
    if (calcio) expect(recipeTotals(RECIPES[day.meals.pranzo ?? ''], 'calcio').fiberG, `${where} pranzo`).toBeLessThanOrEqual(20);
  });
}


// ───────────────────────── Spesa: pochi prodotti, confezioni usate ─────────────────────────

/** Prodotti da comprare in una settimana (olio, sale e spezie esclusi): oltre i 40 la spesa diventa un lavoro. */
const MAX_WEEK_PRODUCTS = 40;
/** Quota minima di una confezione da usare: sotto la metà il resto finisce buttato o dimenticato. */
const MIN_PACK_SHARE = 0.5;

/**
 * Surgelati, dispensa, cereali e legumi secchi aspettano la settimana dopo senza rovinarsi. Gli altri, una volta
 * aperti (legumi in barattolo, latticini, insalate in busta), vanno finiti in pochi giorni.
 */
const isLongLife = (f: Food) =>
  f.category === 'Surgelati' ||
  f.category === 'Dispensa' ||
  f.category === 'Pane e cereali' ||
  (f.category === 'Legumi' && (f.buyFactor ?? 1) < 1);

/** Grammi della confezione indicata in `buyLabel` ("barattolo da 400 g", "confezione da 6" uova). */
function packGrams(f: Food): number | undefined {
  const m = /^\s*\p{L}+\s+da\s+(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)?\s*$/u.exec(f.buyLabel ?? '');
  if (!m) return undefined;
  const n = Number(m[1].replace(',', '.'));
  const unit = m[2];
  if (!unit) return f.unitGrams.pezzo ? n * f.unitGrams.pezzo : undefined;
  const density = f.unitGrams.ml ?? 1;
  return unit === 'kg' ? n * 1000 : unit === 'g' ? n : unit === 'l' ? n * 1000 * density : n * density;
}

interface Purchase {
  food: Food;
  /** Grammi da comprare (mangiati × buyFactor), porzioni del tipo di giorno. */
  buyG: number;
  /** Pasti della settimana che lo usano. */
  meals: number;
}

/** Prodotti da comprare per una settimana del menù (niente dispensa di base: olio, sale, spezie). */
function purchases(week: MenuWeek): Map<string, Purchase> {
  const out = new Map<string, Purchase>();
  week.days.forEach((day, di) => {
    for (const slot of SLOTS) {
      const recipe = RECIPES[day.meals[slot] ?? ''];
      if (!recipe) continue;
      const seen = new Set<string>();
      for (const line of recipe.ingredients) {
        const food = FOODS[line.foodId];
        if (!food || food.pantry) continue;
        const p = out.get(food.id) ?? { food, buyG: 0, meals: 0 };
        p.buyG += lineGrams(line, PORTION_TYPES[di]) * (food.buyFactor ?? 1);
        if (!seen.has(food.id)) p.meals++;
        seen.add(food.id);
        out.set(food.id, p);
      }
    }
  });
  return out;
}

/** Grammi comprati in tutta la rotazione, per alimento: la confezione a lunga conservazione può finire la settimana dopo. */
const ROTATION_BUY = new Map<string, number>();
for (const week of MENU_ROTATION) for (const [id, p] of purchases(week)) ROTATION_BUY.set(id, (ROTATION_BUY.get(id) ?? 0) + p.buyG);

/**
 * Confezioni usate davvero: di un prodotto fresco si usa almeno metà confezione nella settimana; uno a lunga
 * conservazione torna in almeno due pasti della settimana, oppure la rotazione ne usa almeno metà confezione.
 */
function checkPacks(week: MenuWeek, label: string, stored: ReadonlySet<string> = new Set()) {
  for (const p of purchases(week).values()) {
    const pack = packGrams(p.food);
    if (!pack || stored.has(p.food.id)) continue;
    const share = p.buyG / pack;
    if (share >= MIN_PACK_SHARE) continue;
    const where = `${label}: ${p.food.name}, ${fmt(p.buyG)} g di ${p.food.buyLabel} in ${p.meals} ${p.meals === 1 ? 'pasto' : 'pasti'}`;
    expect(isLongLife(p.food), `${where}: un prodotto fresco aperto va usato almeno per metà`).toBe(true);
    const later = (ROTATION_BUY.get(p.food.id) ?? 0) / pack >= MIN_PACK_SHARE;
    expect(p.meals >= 2 || later, `${where}: deve tornare in un secondo pasto`).toBe(true);
  }
}

// ───────────────────────── Passaggi senza quantità degli ingredienti che si adattano ─────────────────────────

/** Parole con cui i passaggi nominano un alimento, oltre alla prima del nome ("Pane integrale" → "pane"). */
const STEP_WORDS: Record<string, string[]> = {
  pasta: ['ditalini', 'rigatoni', 'spaghetti'],
  'pasta-integrale': ['spaghetti', 'pasta'],
  avena: ['avena'],
  couscous: ['cous'],
  'couscous-integrale': ['cous'],
};
const QTY_WORD = String.raw`(?:\d+(?:[.,]\d+)?|un|uno|una|un’|mezzo|mezza|due|tre|quattro|cinque|sei)`;
const UNIT_WORD = String.raw`(?:fett[ae]|pugn[oi]|cucchia[io]|cucchiai|manciat[ae]|tazz[ae]|pezz[oi]|porzion[ei]|pacchett[oi])`;

/** Alimenti `carbScaled` di una ricetta citati nei passaggi con una quantità ("una fetta di pane", "due gallette"). */
function scaledQuantitiesInSteps(recipe: Recipe): string[] {
  const out: string[] = [];
  for (const line of recipe.ingredients) {
    if (!line.carbScaled) continue;
    const food = FOODS[line.foodId];
    if (!food) continue;
    const words = [food.name.split(/[\s,]/)[0].toLowerCase(), ...(STEP_WORDS[food.id] ?? [])];
    for (const w of words) {
      const re = new RegExp(String.raw`(?:^|[^\p{L}])${QTY_WORD}\s*(?:${UNIT_WORD}\s+(?:di\s+|d’)?)?${w}(?![\p{L}])`, 'iu');
      for (const step of recipe.steps) {
        const m = re.exec(step);
        if (m) out.push(`${food.id}: «${m[0].trim()}» in "${step}"`);
      }
    }
  }
  return out;
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

  it('nei passaggi non danno quantità per gli ingredienti che si adattano al tipo di giorno', () => {
    // Le porzioni di pane, pasta, riso e patate cambiano con il giorno: i passaggi rimandano agli ingredienti.
    const found = Object.values(RECIPES).flatMap((r) => scaledQuantitiesInSteps(r).map((x) => `${r.id} ${x}`));
    expect(found).toEqual([]);
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
    // Prima del calcio niente pranzi molto ricchi di fibra.
    MENU_ROTATION.forEach((week, wi) => checkFootballMeals(week, `S${wi + 1}`));
  });

  it('rispetta calorie, proteine, fibre e vegetali in ognuno dei 14 giorni', () => {
    printTable();
    expect(DAYS.length).toBe(14);
    checkNutrition(DAYS);
  });

  it('non eccede con le fibre, soprattutto quando la sera c’è il calcio', () => checkFiberCap(DAYS));

  it('ha grassi sufficienti: almeno il 20% delle kcal e non oltre 15 g sotto l’obiettivo', () => checkFat(DAYS));

  it('resta vicino all’obiettivo anche nelle macro: carboidrati e grassi entro il 15%, proteine tra −15% e +25%', () => checkMacros(DAYS));

  it('prevede al massimo una porzione di legumi al giorno', () => {
    for (const d of DAYS) expect(d.legumeServings, d.label).toBeLessThanOrEqual(1);
  });

  it('la domenica cucina sul momento: nessuna ricetta da preparazione', () => {
    // La preparazione della domenica serve i pasti da lunedì a sabato; la domenica stessa non ne ha una.
    MENU_ROTATION.forEach((week, wi) => {
      for (const slot of SLOTS) expect(RECIPES[week.days[6].meals[slot] ?? '']?.batch, `S${wi + 1} dom ${slot}`).toBeFalsy();
    });
  });

  it('con il minimo di carboidrati di partita e vigilia resta sotto i 40 g di fibre e vicino alle kcal', () => {
    MENU_ROTATION.forEach((week, wi) => {
      for (const di of MATCH_DAYS) {
        const day = week.days[di];
        let fixedC = 0;
        let scaled = zero();
        let base = zero();
        for (const slot of SLOTS) {
          const r = RECIPES[day.meals[slot] ?? ''];
          if (!r) continue;
          base = add(base, recipeTotals(r, 'calcio'));
          scaled = add(scaled, recipeTotals({ ...r, ingredients: r.ingredients.filter((l) => l.carbScaled) }, 'calcio'));
          fixedC += recipeTotals({ ...r, ingredients: r.ingredients.filter((l) => !l.carbScaled) }, 'calcio').carbG;
        }
        const k = Math.max(1, (MATCH_FLOOR_G - fixedC) / scaled.carbG);
        const fiber = base.fiberG + scaled.fiberG * (k - 1);
        const kcal = base.kcal + scaled.kcal * (k - 1);
        const target = KCAL_TARGET.calcio + Math.round((Math.max(0, MATCH_FLOOR_G - MACRO_TARGET.calcio.carbG) * 4) / 10) * 10;
        const where = `S${wi + 1} ${WEEKDAYS[di]}: carboidrati × ${fmt(k, 2)}, ${fmt(fiber, 1)} g di fibre, ${fmt(kcal)} kcal su ${fmt(target)}`;
        expect(fiber, where).toBeLessThanOrEqual(MAX_FIBER_FOOTBALL);
        expect(Math.abs(kcal / target - 1), where).toBeLessThanOrEqual(KCAL_TOLERANCE);
      }
    });
  });

  it('nei giorni di calcio ha solo lenticchie rosse a pranzo, e alla vigilia niente legumi a cena', () => {
    MENU_ROTATION.forEach((week, wi) => checkLegumesAroundFootball(week, `S${wi + 1}`));
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

describe('spesa della rotazione', () => {
  it(`chiede al massimo ${MAX_WEEK_PRODUCTS} prodotti a settimana`, () => {
    MENU_ROTATION.forEach((week, wi) => {
      const bought = [...purchases(week).values()];
      console.log(`\nSpesa della settimana ${wi + 1}: ${bought.length} prodotti (${bought.map((p) => shopNameOf(p.food)).join(', ')})\n`);
      expect(bought.length, `settimana ${wi + 1}`).toBeLessThanOrEqual(MAX_WEEK_PRODUCTS);
    });
  });

  it('usa almeno metà di ogni confezione fresca e fa tornare quelle a lunga conservazione', () => {
    MENU_ROTATION.forEach((week, wi) => checkPacks(week, `settimana ${wi + 1}`));
    // Avvio: i ceci entrano a piccole dosi (40 g, due volte); la ricetta dice di congelare quelli avanzati.
    expect(RECIPES['merluzzo-ceci-couscous'].steps.some((x) => x.includes('freezer'))).toBe(true);
    checkPacks(STARTER_WEEK, 'avvio', new Set(['ceci']));
  });

  it('non compra doppioni: un solo yogurt, un solo cereale da colazione, una sola fesa, un solo salmone', () => {
    const all = new Set(MENU_ROTATION.flatMap((w) => [...purchases(w).keys()]));
    const groups: string[][] = [
      ['yogurt-greco-0', 'yogurt-greco-2', 'skyr'],
      ['avena', 'muesli', 'fiocchi-mais', 'fette-biscottate', 'crackers-integrali'],
      ['tacchino', 'tacchino-affettato'],
      ['salmone', 'salmone-affumicato'],
      ['riso-basmati', 'riso-integrale'],
    ];
    for (const g of groups) expect(g.filter((id) => all.has(id)).length, g.join(', ')).toBeLessThanOrEqual(1);
  });
});

describe('settimana di avvio', () => {
  /** Prodotti da comprare (niente olio, sale, aglio ed erbe): la spesa del primo giorno deve restare piccola. */
  const STARTER_MAX_PRODUCTS = 17;
  const starterRecipes = () =>
    STARTER_WEEK.days.flatMap((day, di) => SLOTS.map((slot) => ({ slot, di, id: day.meals[slot] ?? '', recipe: RECIPES[day.meals[slot] ?? ''] })));

  it('copre i 7 giorni con tutti e 5 i pasti, ricette esistenti nel pasto giusto, senza preparazione', () => {
    expect(STARTER_WEEK.days.length).toBe(7);
    expect(STARTER_WEEK.prep).toEqual([]);
    for (const { slot, di, id, recipe } of starterRecipes()) {
      const where = `avvio ${WEEKDAYS[di]} ${slot}: ${id}`;
      expect(recipe, where).toBeDefined();
      expect(recipe?.slots.includes(slot), `${where} non è una ricetta da ${slot}`).toBe(true);
      // Niente preparazione della domenica e niente avena della sera prima: tutto sul momento.
      expect(recipe?.batch, `${where} è da preparazione`).toBeFalsy();
      expect(recipe?.tags.includes('la sera prima'), `${where} va preparata la sera prima`).toBe(false);
      expect(recipe?.prepMin, where).toBeLessThanOrEqual(15);
    }
  });

  it('ha una spesa piccola: i prodotti dichiarati, non uno di più', () => {
    const bought = new Set<string>();
    for (const { recipe } of starterRecipes()) for (const l of recipe?.ingredients ?? []) if (!FOODS[l.foodId]?.pantry) bought.add(l.foodId);
    console.log(`\nSpesa di avvio: ${bought.size} prodotti (${[...bought].map((id) => FOODS[id].name).join(', ')})\n`);
    expect([...bought].sort()).toEqual([...STARTER_PRODUCTS].sort());
    expect(bought.size).toBeLessThanOrEqual(STARTER_MAX_PRODUCTS);
  });

  it('nei giorni di calcio prevede il pre-calcio e la cena di recupero, negli altri no', () => {
    checkFootballMeals(STARTER_WEEK, 'avvio');
  });

  it('rispetta gli stessi vincoli della rotazione in ogni giorno, tranne le fibre', () => {
    printTable(STARTER_DAYS, 'Totali giornalieri della settimana di avvio');
    checkNutrition(STARTER_DAYS, MIN_FIBER_STARTER);
    checkFiberCap(STARTER_DAYS);
    checkFat(STARTER_DAYS);
    checkMacros(STARTER_DAYS);
    for (const d of STARTER_DAYS) expect(d.legumeServings, d.label).toBeLessThanOrEqual(1);
  });

  it('fa salire le fibre per gradi: 22-32 g al giorno, ben sotto la rotazione', () => {
    for (const d of STARTER_DAYS) {
      const where = `${d.label}: ${fmt(d.totals.fiberG, 1)} g di fibre`;
      expect(d.totals.fiberG, where).toBeGreaterThanOrEqual(MIN_FIBER_STARTER);
      expect(d.totals.fiberG, where).toBeLessThanOrEqual(MAX_FIBER_STARTER);
    }
    const avg = (days: DayRow[]) => days.reduce((s, d) => s + d.totals.fiberG, 0) / days.length;
    expect(avg(DAYS) - avg(STARTER_DAYS), 'scarto tra rotazione e avvio').toBeGreaterThanOrEqual(FIBER_STEP);
    // Il Menù dice "per ora circa 28 g" (35 g × STARTER_FIBER_SHARE): la media dei giorni di avvio ci sta vicino.
    expect(Math.abs(avg(STARTER_DAYS) - FIBER_TARGET * STARTER_FIBER_SHARE), `media ${fmt(avg(STARTER_DAYS), 1)} g`).toBeLessThanOrEqual(3);
  });

  it('introduce i legumi a piccole dosi: ceci in almeno 2 pasti, mai un piatto di legumi intero', () => {
    const withLegumes = starterRecipes().filter((m) => m.recipe && gramsOf(m.recipe, LEGUMES) > 0);
    expect(withLegumes.length, 'pasti con legumi').toBeGreaterThanOrEqual(2);
    for (const m of withLegumes) {
      const g = gramsOf(m.recipe, LEGUMES);
      expect(g, `avvio ${WEEKDAYS[m.di]} ${m.slot}: ${fmt(g)} g di legumi`).toBeLessThan(LEGUME_SERVING_G);
    }
  });

  it('resta varia anche ripetendosi: pesce e uova con misura, niente carne rossa', () => {
    const meals = starterRecipes().filter((m) => m.slot === 'pranzo' || m.slot === 'cena');
    const count = (pred: (r: Recipe) => boolean) => meals.filter((m) => m.recipe && pred(m.recipe)).length;
    const tuna = meals.filter((m) => m.recipe?.ingredients.some((l) => l.foodId === 'tonno')).length;
    expect(count(hasWholeEgg), 'uova').toBeLessThanOrEqual(3);
    expect(count(hasRedMeat), 'carne rossa').toBe(0);
    // Il tonno in scatola al massimo 3 volte a settimana.
    expect(tuna, 'tonno').toBeLessThanOrEqual(3);
    expect(count(hasFish), 'pesce').toBeGreaterThanOrEqual(2);
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

  it('a pezzi la nota non ripete la porzione: la conta già, con il nome dell’alimento', () => {
    // "2 cubetti · due cubetti", "un tocchetto · un pezzo da 25 g": la porzione dice già quanti e cosa.
    const COUNT = /^(un|uno|una|un’|mezz[oa]|due|tre|quattro|cinque|\d)/i;
    for (const r of Object.values(RECIPES)) {
      for (const l of r.ingredients) {
        if (l.unit !== 'pezzo' || !l.note) continue;
        expect(COUNT.test(l.note), `${r.id}/${l.foodId}: "${l.note}"`).toBe(false);
        expect(/pezz[oi]/i.test(l.note), `${r.id}/${l.foodId}: "${l.note}"`).toBe(false);
      }
    }
  });
});
