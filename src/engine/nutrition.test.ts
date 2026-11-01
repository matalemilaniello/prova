import { describe, expect, it } from 'vitest';
import type { CheckIn, DayType, Food, IngredientLine, Plan, PortionUnit, Profile, Recipe } from '../domain/types';
import { DEFAULT_PROFILE, defaultPlan } from '../data/defaults';
import { FOODS } from '../data/foods';
import { RECIPES } from '../data/recipes';
import { addDays } from './dates';
import { isMatchDay, isMatchEve } from './menu';
import {
  carbFactor,
  dayCarbScale,
  dayNutrition,
  dayNutritionDetail,
  dayTargetFor,
  fiberRampWeek,
  formatPortion,
  lineQty,
  matchCarbs,
  planCarbScale,
  PORTION_TOLERANCE,
  portionPhrase,
  referenceWeightKg,
  totalCarbFactor,
  lineGrams,
  PIECE_WORDS,
  portionParts,
  portionWithName,
  portionWords,
  recipeNutrition,
  recipeVegPortions,
  roundGrams,
  roundHalf,
  UNIT_WORDS,
  WHOLE_PIECES,
} from './nutrition';
import { MATCH_CARB_G_PER_KG, PROTEIN_G_PER_KG } from './targets';

const foods: Record<string, Food> = {
  riso: {
    id: 'riso',
    name: 'Riso cotto',
    category: 'Pane e cereali',
    per100g: { kcal: 130, proteinG: 2.7, carbG: 28, fatG: 0.3, fiberG: 0.4 },
    unitGrams: { pugno: 150 },
    buyFactor: 0.4,
  },
  pollo: {
    id: 'pollo',
    name: 'Petto di pollo',
    category: 'Carne e pesce',
    per100g: { kcal: 110, proteinG: 23, carbG: 0, fatG: 1.5, fiberG: 0 },
    unitGrams: { palmo: 120 },
  },
  olio: {
    id: 'olio',
    name: 'Olio extravergine',
    category: 'Condimenti',
    per100g: { kcal: 899, proteinG: 0, carbG: 0, fatG: 99.9, fiberG: 0 },
    unitGrams: { cucchiaio: 10, cucchiaino: 4, ml: 0.92 },
    pantry: true,
  },
  latte: {
    id: 'latte',
    name: 'Latte',
    category: 'Latticini e uova',
    per100g: { kcal: 46, proteinG: 3.3, carbG: 4.9, fatG: 1.5, fiberG: 0 },
    unitGrams: { tazza: 250 },
  },
  zucchine: {
    id: 'zucchine',
    name: 'Zucchine',
    category: 'Surgelati',
    per100g: { kcal: 17, proteinG: 1.2, carbG: 2.2, fatG: 0.3, fiberG: 1.2 },
    unitGrams: { pugno: 100 },
    vegPortionG: 80,
  },
  pane: {
    id: 'pane',
    name: 'Pane integrale',
    category: 'Pane e cereali',
    per100g: { kcal: 240, proteinG: 9, carbG: 42, fatG: 3, fiberG: 7 },
    unitGrams: { fetta: 40 },
  },
};

const line = (l: Partial<IngredientLine> & Pick<IngredientLine, 'foodId' | 'qty' | 'unit'>): IngredientLine => l;

describe('lineGrams (semantica vincolante)', () => {
  it("unit 'g' → qty grammi", () => {
    expect(lineGrams(line({ foodId: 'pollo', qty: 130, unit: 'g' }), 'palestra', foods)).toBe(130);
  });
  it("unit 'ml' → qty × unitGrams.ml (default 1)", () => {
    expect(lineGrams(line({ foodId: 'olio', qty: 10, unit: 'ml' }), 'palestra', foods)).toBeCloseTo(9.2);
    expect(lineGrams(line({ foodId: 'latte', qty: 200, unit: 'ml' }), 'palestra', foods)).toBe(200);
  });
  it('altre unità → qty × unitGrams[unit]', () => {
    expect(lineGrams(line({ foodId: 'riso', qty: 1.5, unit: 'pugno' }), 'palestra', foods)).toBe(225);
    expect(lineGrams(line({ foodId: 'olio', qty: 2, unit: 'cucchiaio' }), 'palestra', foods)).toBe(20);
  });
  it('unità mancante → 0 senza eccezioni', () => {
    expect(lineGrams(line({ foodId: 'pollo', qty: 1, unit: 'pugno' }), 'palestra', foods)).toBe(0);
    expect(lineGrams(line({ foodId: 'sconosciuto', qty: 1, unit: 'pugno' }), 'palestra', foods)).toBe(0);
  });
  it('carbScaled moltiplica per il fattore del tipo di giorno', () => {
    const l = line({ foodId: 'riso', qty: 1, unit: 'pugno', carbScaled: true });
    expect(lineGrams(l, 'calcio', foods)).toBe(187.5);
    expect(lineGrams(l, 'palestra', foods)).toBe(150);
    expect(lineGrams(l, 'leggero', foods)).toBe(135);
    expect(lineGrams(l, 'riposo', foods)).toBe(112.5);
    const g = line({ foodId: 'riso', qty: 200, unit: 'g', carbScaled: true });
    expect(lineGrams(g, 'riposo', foods)).toBe(150);
  });
  it('fattori dei carboidrati', () => {
    expect(carbFactor('calcio')).toBe(1.25);
    expect(carbFactor('palestra')).toBe(1);
    expect(carbFactor('leggero')).toBe(0.9);
    expect(carbFactor('riposo')).toBe(0.75);
  });
});

describe('valori delle ricette', () => {
  const recipe: Recipe = {
    id: 'r',
    name: 'Riso, pollo e zucchine',
    slots: ['pranzo'],
    ingredients: [
      line({ foodId: 'riso', qty: 1, unit: 'pugno', carbScaled: true }),
      line({ foodId: 'pollo', qty: 1, unit: 'palmo' }),
      line({ foodId: 'zucchine', qty: 2, unit: 'pugno' }),
      line({ foodId: 'olio', qty: 1, unit: 'cucchiaio' }),
    ],
    steps: [],
    prepMin: 10,
    tags: [],
  };

  it('nutrienti = grammi × per100g / 100', () => {
    const n = recipeNutrition(recipe, 'palestra', foods);
    expect(n.kcal).toBeCloseTo(195 + 132 + 34 + 89.9, 1);
    expect(n.proteinG).toBeCloseTo(4.05 + 27.6 + 2.4, 2);
    expect(n.fiberG).toBeCloseTo(0.6 + 2.4, 2);
  });

  it('il giorno di calcio ha più carboidrati, le proteine non cambiano', () => {
    const calcio = recipeNutrition(recipe, 'calcio', foods);
    const riposo = recipeNutrition(recipe, 'riposo', foods);
    expect(calcio.carbG).toBeGreaterThan(riposo.carbG);
    expect(calcio.proteinG - riposo.proteinG).toBeCloseTo(2.7 * (1.875 - 1.125), 3);
  });

  it('porzioni di vegetali = grammi / vegPortionG', () => {
    expect(recipeVegPortions(recipe, 'palestra', foods)).toBeCloseTo(2.5);
  });

  it('ricetta assente → zero', () => {
    expect(recipeNutrition(undefined, 'calcio', foods).kcal).toBe(0);
    expect(recipeVegPortions(undefined, 'calcio', foods)).toBe(0);
  });
});

describe('porzioni a occhio', () => {
  it('arrotonda a mezze unità', () => {
    expect(roundHalf(1.25)).toBe(1.5);
    expect(roundHalf(1.2)).toBe(1);
    expect(roundHalf(0.2)).toBe(0.5);
    expect(roundHalf(0)).toBe(0);
  });

  it('parole italiane con genere e plurale', () => {
    expect(portionWords(1.5, 'pugno')).toBe('1 pugno e mezzo');
    expect(portionWords(0.5, 'pugno')).toBe('mezzo pugno');
    expect(portionWords(2, 'cucchiaio')).toBe('2 cucchiai');
    expect(portionWords(1.5, 'fetta')).toBe('1 fetta e mezza');
    expect(portionWords(0.5, 'fetta')).toBe('mezza fetta');
    expect(portionWords(2.5, 'manciata')).toBe('2 manciate e mezza');
    expect(portionWords(1, 'mano a coppa')).toBe('1 mano a coppa');
  });

  it('grammi arrotondati in modo umano', () => {
    expect(roundGrams(187.5)).toBe(190);
    expect(roundGrams(9.2)).toBe(9);
    expect(roundGrams(0)).toBe(0);
  });

  it('formatPortion: "1 pugno e mezzo · ≈ 225 g", "2 cucchiai · ≈ 20 g"', () => {
    expect(formatPortion(line({ foodId: 'riso', qty: 1.5, unit: 'pugno' }), 'palestra', foods)).toBe('1 pugno e mezzo · ≈ 225 g');
    expect(formatPortion(line({ foodId: 'olio', qty: 2, unit: 'cucchiaio' }), 'palestra', foods)).toBe('2 cucchiai · ≈ 20 g');
  });

  it('formatPortion adatta la porzione al tipo di giorno', () => {
    const l = line({ foodId: 'riso', qty: 1, unit: 'pugno', carbScaled: true });
    expect(formatPortion(l, 'calcio', foods)).toBe('1 pugno abbondante · ≈ 190 g');
    expect(formatPortion(l, 'riposo', foods)).toBe('quasi 1 pugno · ≈ 115 g');
    const f = line({ foodId: 'pane', qty: 2, unit: 'fetta', carbScaled: true });
    expect(formatPortion(f, 'calcio', foods)).toBe('2 fette e mezza · ≈ 100 g');
  });

  it('grammi e millilitri restano tali', () => {
    expect(formatPortion(line({ foodId: 'pollo', qty: 130, unit: 'g' }), 'palestra', foods)).toBe('130 g');
    expect(formatPortion(line({ foodId: 'latte', qty: 200, unit: 'ml' }), 'palestra', foods)).toBe('200 ml');
    expect(portionParts(line({ foodId: 'olio', qty: 10, unit: 'ml' }), 'palestra', foods).text).toBe('10 ml · ≈ 9 g');
  });

  it('senza grammi noti mostra solo la porzione', () => {
    expect(formatPortion(line({ foodId: 'pollo', qty: 1, unit: 'pugno' }), 'palestra', foods)).toBe('1 pugno');
  });

  it('porzione a parole con "abbondante" e "quasi" quando la mezza unità non torna con i grammi', () => {
    expect(portionPhrase(1.5, 'fetta')).toBe('1 fetta e mezza');
    expect(portionPhrase(1.05, 'fetta')).toBe('1 fetta');
    expect(portionPhrase(1.25, 'fetta')).toBe('1 fetta abbondante');
    expect(portionPhrase(1.35, 'fetta')).toBe('quasi 1 fetta e mezza');
    expect(portionPhrase(1.8, 'fetta')).toBe('quasi 2 fette');
    expect(portionPhrase(2.25, 'fetta')).toBe('2 fette abbondanti');
    expect(portionPhrase(0.6, 'pugno')).toBe('mezzo pugno abbondante');
    expect(portionPhrase(0.42, 'pugno')).toBe('quasi mezzo pugno');
    expect(portionPhrase(0.2, 'pugno')).toBe('meno di mezzo pugno');
    // Il caso della vigilia: 1,25 fette da 40 g sono 50 g, non "1 fetta e mezza".
    expect(formatPortion(line({ foodId: 'pane', qty: 1, unit: 'fetta', carbScaled: true }), 'calcio', foods)).toBe(
      '1 fetta abbondante · ≈ 50 g',
    );
  });
});

describe('porzioni a pezzi: il nome dell’alimento al posto di "pezzo"', () => {
  it('sostantivo, genere e articolo dell’alimento', () => {
    expect(portionWords(1, 'pezzo', 'banana')).toBe('una banana');
    expect(portionWords(0.5, 'pezzo', 'banana')).toBe('mezza banana');
    expect(portionWords(0.5, 'pezzo', 'limone')).toBe('mezzo limone');
    expect(portionWords(0.5, 'pezzo', 'carote')).toBe('mezza carota');
    expect(portionWords(0.5, 'pezzo', 'cipolla-rossa')).toBe('mezza cipolla');
    expect(portionWords(0.5, 'pezzo', 'cetriolo')).toBe('mezzo cetriolo');
    expect(portionWords(2, 'pezzo', 'uova')).toBe('2 uova');
    expect(portionWords(1, 'pezzo', 'uova')).toBe('un uovo');
    expect(portionWords(1, 'pezzo', 'arancia')).toBe('un’arancia');
    expect(portionWords(1, 'pezzo', 'aglio')).toBe('uno spicchio');
    expect(portionWords(2, 'pezzo', 'clementine')).toBe('2 clementine');
    expect(portionWords(1.5, 'pezzo', 'piadina-integrale')).toBe('una piadina e mezza');
    // Senza l'id dell'alimento resta l'unità generica.
    expect(portionWords(1, 'pezzo')).toBe('1 pezzo');
  });

  it('gallette, quadretti e frutta secca si contano a unità intere', () => {
    expect(WHOLE_PIECES.has('gallette-riso')).toBe(true);
    expect(WHOLE_PIECES.has('cioccolato-fondente')).toBe(true);
    expect(portionPhrase(6.5, 'pezzo', 'gallette-riso')).toBe('7 gallette');
    expect(portionPhrase(3.5, 'pezzo', 'gallette-riso')).toBe('quasi 4 gallette');
    expect(portionPhrase(3.4, 'pezzo', 'gallette-riso')).toBe('3 gallette abbondanti');
    expect(portionPhrase(1.2, 'pezzo', 'gallette-riso')).toBe('una galletta abbondante');
    expect(portionPhrase(2, 'pezzo', 'cioccolato-fondente')).toBe('2 quadretti');
    expect(portionPhrase(2.4, 'pezzo', 'datteri')).toBe('2 datteri abbondanti');
    expect(portionPhrase(2.5, 'pezzo', 'datteri')).toBe('quasi 3 datteri');
    expect(portionPhrase(0.3, 'pezzo', 'gallette-riso')).toBe('meno di una galletta');
    expect(portionWords(0.5, 'pezzo', 'gallette-riso')).toBe('una galletta');
  });

  it('la frase con il nome: "7 gallette di riso", "quasi una piadina integrale e mezza", "mezzo limone"', () => {
    const gallette: IngredientLine = { foodId: 'gallette-riso', qty: 4, unit: 'pezzo', carbScaled: true };
    const p = portionParts(gallette, 'calcio', FOODS, 1.3);
    expect(p.portion).toBe('7 gallette');
    expect(p.named).toBe('7 gallette di riso');
    expect(p.text).toBe('7 gallette · ≈ 50 g');
    expect(portionWithName(p, 'gallette di riso')).toBe('7 gallette di riso');
    const piadina = portionParts({ foodId: 'piadina-integrale', qty: 1, unit: 'pezzo', carbScaled: true }, 'calcio', FOODS, 1.04);
    expect(piadina.portion).toBe('quasi una piadina e mezza');
    expect(piadina.named).toBe('quasi una piadina integrale e mezza');
    const limone = portionParts({ foodId: 'limone', qty: 0.5, unit: 'pezzo' }, 'palestra', FOODS);
    expect(limone.portion).toBe('mezzo limone');
    expect(portionWithName(limone, 'limone')).toBe('mezzo limone');
    // "abbondante" e "e mezzo" stanno sulla misura, il complemento chiude: "un cucchiaio abbondante di olio".
    const poche = portionParts({ foodId: 'gallette-riso', qty: 2, unit: 'pezzo', carbScaled: true }, 'calcio', FOODS, 0.96);
    expect(poche.named).toBe('2 gallette abbondanti di riso');
    expect(portionParts({ foodId: 'sgombro', qty: 1.5, unit: 'pezzo' }, 'palestra', FOODS).named).toBe('una scatoletta e mezza di sgombro');
    expect(portionParts({ foodId: 'aglio', qty: 1, unit: 'pezzo' }, 'palestra', FOODS).named).toBe('uno spicchio d’aglio');
    expect(portionParts({ foodId: 'cipolla-rossa', qty: 0.5, unit: 'pezzo' }, 'palestra', FOODS).named).toBe('mezza cipolla rossa');
    // Le altre unità aggiungono il nome dopo "di".
    const pasta = portionParts({ foodId: 'pasta', qty: 2, unit: 'pugno', carbScaled: true }, 'calcio', FOODS, 1);
    expect(pasta.named).toBeUndefined();
    expect(portionWithName(pasta, 'pasta')).toBe(`${pasta.portion} di pasta`);
  });

  it('nessuna porzione di nessuna ricetta dice "pezzo", su nessun tipo di giorno e con ogni scala', () => {
    const types: DayType[] = ['calcio', 'palestra', 'leggero', 'riposo'];
    const scales = [0.6, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.35, 1.45, 1.6];
    const found: string[] = [];
    let checked = 0;
    for (const r of Object.values(RECIPES)) {
      for (const l of r.ingredients) {
        if (l.unit !== 'pezzo') continue;
        for (const t of types) {
          for (const k of l.carbScaled ? scales : [1]) {
            const p = portionParts(l, t, FOODS, k);
            for (const s of [p.portion, p.text, p.named ?? '', portionWithName(p, 'x')]) if (/pezz/i.test(s)) found.push(`${r.id} · ${l.foodId} · ${t} × ${k}: ${s}`);
            // Gli alimenti che si contano a unità intere non hanno mai "mezzo" o "mezza".
            if (WHOLE_PIECES.has(l.foodId)) expect(p.portion, `${r.id} · ${l.foodId}`).not.toMatch(/mezz/);
            checked++;
          }
        }
      }
    }
    expect(found).toEqual([]);
    expect(checked).toBeGreaterThan(200);
  });

  it('ogni alimento contato a pezzi nelle ricette ha le sue parole', () => {
    const missing = new Set<string>();
    for (const r of Object.values(RECIPES)) for (const l of r.ingredients) if (l.unit === 'pezzo' && !PIECE_WORDS[l.foodId]) missing.add(l.foodId);
    expect([...missing]).toEqual([]);
  });
});

type Promise = { ref: number; side: 'eq' | 'su' | 'giu' | 'sotto' };

/** Quantità e scarto ammesso che una porzione a parole promette ("quasi 1 fetta e mezza" → 1,5, sotto, 0,25). */
function promised(text: string, unit: Exclude<PortionUnit, 'g' | 'ml'>, foodId?: string): Promise {
  const piece = unit === 'pezzo' && foodId ? PIECE_WORDS[foodId] : undefined;
  const w = piece ?? UNIT_WORDS[unit];
  let t = text;
  let side: Promise['side'] = 'eq';
  if (t.startsWith('quasi ')) [side, t] = ['giu', t.slice(6)];
  else if (t.startsWith('meno di ')) [side, t] = ['sotto', t.slice(8)];
  if (/ abbondant[ei]$/.test(t)) [side, t] = ['su', t.replace(/ abbondant[ei]$/, '')];
  const mezzo = w.fem ? 'mezza' : 'mezzo';
  if (t === `${mezzo} ${w.one}`) return { ref: 0.5, side };
  const one = piece ? `(?:${piece.art ?? (piece.fem ? 'una' : 'un')}\\s?${piece.one})` : '';
  if (piece) {
    const single = t.match(new RegExp(`^${one}( e ${mezzo})?$`));
    if (single) return { ref: 1 + (single[1] ? 0.5 : 0), side };
  }
  const m = t.match(new RegExp(`^(\\d+) (?:${w.one}|${w.many})( e ${mezzo})?$`));
  if (!m) throw new Error(`porzione non riconosciuta: ${text}`);
  return { ref: Number(m[1]) + (m[2] ? 0.5 : 0), side };
}

describe('porzioni coerenti con i grammi in tutte le ricette', () => {
  const types: DayType[] = ['calcio', 'palestra', 'leggero', 'riposo'];
  // Scale del piano tipiche: obiettivi più bassi o più alti di quelli predefiniti, partita e vigilia.
  const scales = [0.8, 0.9, 1, 1.1, 1.2, 1.35];

  it('la porzione detta a parole sta entro il 10% dei grammi, o lo dice con "abbondante" o "quasi"', () => {
    let checked = 0;
    for (const r of Object.values(RECIPES)) {
      for (const l of r.ingredients) {
        if (l.unit === 'g' || l.unit === 'ml') continue;
        const per = FOODS[l.foodId]?.unitGrams[l.unit];
        if (!per) continue;
        for (const t of types) {
          for (const k of l.carbScaled ? scales : [1]) {
            const q = lineQty(l, t, k);
            const grams = lineGrams(l, t, FOODS, k);
            expect(q * per).toBeCloseTo(grams, 6);
            const { portion } = portionParts(l, t, FOODS, k);
            const { ref, side } = promised(portion, l.unit, l.foodId);
            // A unità intere (una galletta non si divide) lo scarto arriva a mezza unità.
            const gap = l.unit === 'pezzo' && WHOLE_PIECES.has(l.foodId) ? 0.5 : 0.25;
            const where = `${r.id} · ${l.foodId} · ${t} × ${k}: ${portion} per ${q.toFixed(2)}`;
            if (side === 'eq') expect(Math.abs(ref - q) / q, where).toBeLessThanOrEqual(PORTION_TOLERANCE + 1e-9);
            else if (side === 'su') expect(q > ref && q - ref <= gap, where).toBe(true);
            else if (side === 'giu') expect(q < ref && ref - q <= gap, where).toBe(true);
            else expect(q < ref, where).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('le porzioni seguono gli obiettivi del piano', () => {
  const start = '2026-11-09';
  const base = defaultPlan(start);
  const withDelta = (delta: number): Plan => ({
    ...base,
    targets: Object.fromEntries(
      (Object.keys(base.targets) as DayType[]).map((t) => [t, { ...base.targets[t], kcal: base.targets[t].kcal + delta }]),
    ) as Plan['targets'],
  });
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));

  const match = (d: string) => isMatchDay(d, base) || isMatchEve(d, base);

  it('con gli obiettivi predefiniti la scala è 1 (partita e vigilia a parte)', () => {
    for (const d of days) {
      if (match(d)) expect(dayCarbScale(d, { plan: base, dayLogs: {} })).toBeGreaterThan(1);
      else expect(dayCarbScale(d, { plan: base, dayLogs: {} })).toBe(1);
    }
    expect(planCarbScale('palestra', base)).toBe(1);
  });

  it('+150 kcal nel piano → circa +150 kcal nel piatto, ogni giorno delle due settimane', () => {
    const plus = withDelta(150);
    for (const d of days) {
      // Partita e vigilia restano al minimo di carboidrati, che è già sopra l'obiettivo +150 kcal.
      if (match(d)) continue;
      const before = dayNutrition(d, { plan: base, dayLogs: {} }).kcal;
      const after = dayNutrition(d, { plan: plus, dayLogs: {} }).kcal;
      expect(after - before).toBeGreaterThan(120);
      expect(after - before).toBeLessThan(180);
    }
  });

  it('−100 kcal riducono solo i carboidrati: proteine e grassi restano', () => {
    const minus = withDelta(-100);
    const d = days[1];
    const a = dayNutrition(d, { plan: base, dayLogs: {} });
    const b = dayNutrition(d, { plan: minus, dayLogs: {} });
    expect(a.kcal - b.kcal).toBeGreaterThan(70);
    expect(a.kcal - b.kcal).toBeLessThan(130);
    expect(b.carbG).toBeLessThan(a.carbG);
    expect(Math.abs(a.proteinG - b.proteinG)).toBeLessThan(4);
  });

  it('la scala è limitata e accetta un numero o il piano', () => {
    expect(planCarbScale('riposo', withDelta(5000))).toBe(1.6);
    expect(planCarbScale('riposo', withDelta(-1500))).toBe(0.6);
    const l = line({ foodId: 'riso', qty: 1, unit: 'pugno', carbScaled: true });
    expect(lineGrams(l, 'palestra', foods, 1.2)).toBeCloseTo(180);
    expect(lineGrams(l, 'palestra', foods, base)).toBeCloseTo(150);
    expect(totalCarbFactor('calcio', 1.2)).toBeCloseTo(1.5);
  });

  it('la vigilia della partita mangia come un giorno di calcio', () => {
    // 2026-11-15 è domenica, il giorno prima della partita del lunedì.
    const d = dayNutritionDetail('2026-11-15', { plan: base, dayLogs: {} });
    expect(d.dayType).toBe('calcio');
    expect(d.total.kcal).toBeGreaterThan(base.targets.calcio.kcal * 0.92);
  });

  it('avvio graduale delle fibre nelle prime due settimane', () => {
    expect(fiberRampWeek(start, base)).toBe(1);
    expect(fiberRampWeek(addDays(start, 6), base)).toBe(1);
    expect(fiberRampWeek(addDays(start, 7), base)).toBe(2);
    expect(fiberRampWeek(addDays(start, 14), base)).toBeNull();
    // I giorni di avvio prima del lunedì di inizio sono già nella prima settimana; prima ancora, niente avvio.
    expect(fiberRampWeek(addDays(start, -1), base)).toBe(1);
    expect(fiberRampWeek(addDays(start, -8), base)).toBeNull();
  });
});

describe('partita e vigilia: almeno 6 g/kg di carboidrati', () => {
  const start = '2026-11-09'; // lunedì: partita (settimana predefinita)
  const monday = start;
  const sunday = addDays(start, 6); // vigilia della partita del lunedì dopo
  const wednesday = addDays(start, 2); // calcetto
  const thursday = addDays(start, 3); // allenamento
  // Obiettivi di un profilo generico da 72 kg, come li calcola il benvenuto: calcio 2.700 kcal, 360 g di carboidrati.
  const plan: Plan = {
    ...defaultPlan(start),
    targets: {
      calcio: { kcal: 2700, proteinG: 135, fatG: 75, carbG: 360, fiberG: 35 },
      palestra: { kcal: 2500, proteinG: 135, fatG: 75, carbG: 310, fiberG: 35 },
      leggero: { kcal: 2350, proteinG: 135, fatG: 75, carbG: 275, fiberG: 35 },
      riposo: { kcal: 2200, proteinG: 135, fatG: 75, carbG: 235, fiberG: 35 },
    },
  };
  const weighIn = (date: string, weightKg: number): CheckIn => ({ date, weightKg, pain: {} });
  const profile: Profile = { ...DEFAULT_PROFILE, startWeightKg: 74 };
  const state = { plan, dayLogs: {}, profile, checkIns: { '2026-11-07': weighIn('2026-11-07', 72) } };

  it('il minimo vale il giorno della partita e la vigilia, non per calcetto e allenamento', () => {
    expect(matchCarbs(monday, state)?.when).toBe('partita');
    expect(matchCarbs(sunday, state)?.when).toBe('vigilia');
    expect(matchCarbs(wednesday, state)).toBeNull();
    expect(matchCarbs(thursday, state)).toBeNull();
    expect(dayTargetFor(wednesday, state)).toEqual(plan.targets.calcio);
    expect(dayTargetFor(thursday, state)).toEqual(plan.targets.calcio);
    expect(dayCarbScale(wednesday, state)).toBe(dayCarbScale(wednesday, { plan, dayLogs: {} }));
  });

  it('obiettivo della data: 6 g/kg di carboidrati, la differenza in kcal', () => {
    const m = matchCarbs(monday, state)!;
    expect(m.gPerKg).toBe(MATCH_CARB_G_PER_KG);
    expect(m.floorG).toBe(430); // 6 × 72 = 432, arrotondato a 5 g
    expect(m.extraG).toBe(70);
    expect(m.extraKcal).toBe(280);
    const t = dayTargetFor(monday, state);
    expect(t.carbG).toBe(430);
    expect(t.kcal).toBe(2980);
    expect(t.proteinG).toBe(plan.targets.calcio.proteinG);
    expect(t.fatG).toBe(plan.targets.calcio.fatG);
    expect(dayTargetFor(sunday, state).carbG).toBe(430);
  });

  it('nel piatto ci sono davvero 6 g/kg: i carboidrati del menù previsto arrivano al minimo', () => {
    for (const d of [monday, sunday]) {
      const det = dayNutritionDetail(d, state);
      expect(det.target.carbG).toBe(430);
      expect(det.matchCarbs?.floorG).toBe(430);
      expect(det.total.carbG).toBeGreaterThanOrEqual(429);
      expect(det.total.carbG).toBeLessThan(436);
      // Le kcal restano vicine all'obiettivo della data.
      expect(Math.abs(det.total.kcal - det.target.kcal) / det.target.kcal).toBeLessThan(0.1);
    }
  });

  it('nei giorni di avvio il minimo si misura sul menù di avvio, quello che c’è nel piatto', () => {
    // Primo avvio di mercoledì: la domenica è un giorno di avvio e la vigilia della partita del lunedì.
    const starter: Plan = { ...plan, firstUse: { date: '2026-11-04', time: '15:30' } };
    const s = { ...state, plan: starter };
    for (const d of ['2026-11-08', '2026-11-09']) {
      const det = dayNutritionDetail(d, s);
      expect(det.total.carbG, d).toBeGreaterThanOrEqual(429);
      expect(det.total.carbG, d).toBeLessThan(436);
    }
    // Le sostituzioni del diario non cambiano la scala: vale il menù previsto.
    const swapped = { ...s, dayLogs: { '2026-11-08': { date: '2026-11-08', status: {}, recipeSwaps: { merenda: 'pre-gallette-banana' } } } };
    expect(dayCarbScale('2026-11-08', swapped as typeof s)).toBe(dayCarbScale('2026-11-08', s));
  });

  it('peso di riferimento: media dei 7 giorni fino all’ultima pesata, poi profilo, poi proteine del piano', () => {
    const checkIns = {
      '2026-10-20': weighIn('2026-10-20', 80),
      '2026-11-02': weighIn('2026-11-02', 71),
      '2026-11-06': weighIn('2026-11-06', 73),
      '2026-11-20': weighIn('2026-11-20', 60),
    };
    expect(referenceWeightKg(monday, { plan, dayLogs: {}, checkIns })).toBeCloseTo(72, 6);
    expect(referenceWeightKg(monday, { plan, dayLogs: {}, checkIns: {}, profile })).toBe(74);
    expect(referenceWeightKg(monday, { plan, dayLogs: {} })).toBeCloseTo(135 / PROTEIN_G_PER_KG, 6);
  });

  it('il menù previsto resta vicino all’obiettivo: kcal entro il 5%, proteine non oltre il 20%', () => {
    // Pasta, riso e gallette alzati fino al minimo portano anche proteine: il menù di partita e vigilia le tiene a bada.
    const KCAL_TOLERANCE = 0.05;
    const PROTEIN_MAX = 1.2;
    const check = (p: Plan, dates: string[]) => {
      for (const d of dates) {
        const det = dayNutritionDetail(d, { plan: p, dayLogs: {} });
        const where = `${d}: ${Math.round(det.total.kcal)} kcal su ${det.target.kcal}, ${Math.round(det.total.proteinG)} g di proteine`;
        expect(det.matchCarbs, where).not.toBeNull();
        expect(Math.abs(det.total.kcal / det.target.kcal - 1), where).toBeLessThanOrEqual(KCAL_TOLERANCE);
        expect(det.total.proteinG / det.target.proteinG, where).toBeLessThanOrEqual(PROTEIN_MAX);
      }
    };
    // Rotazione: le due partite e le due vigilie delle due settimane.
    const rotation = defaultPlan(start);
    check(rotation, [0, 6, 7, 13].map((n) => addDays(start, n)));
    // Giorni di avvio: primo avvio in ogni giorno della settimana prima, piano dal lunedì di inizio.
    for (let n = 0; n < 7; n++) {
      const first = addDays('2026-11-02', n);
      const p: Plan = { ...defaultPlan(n < 4 ? '2026-11-02' : '2026-11-09'), firstUse: { date: first, time: '15:30' } };
      const dates = Array.from({ length: 14 }, (_, i) => addDays(first, i)).filter((d) => isMatchDay(d, p) || isMatchEve(d, p));
      check(p, dates);
    }
  });

  it('un obiettivo già sopra il minimo non cambia', () => {
    const high: Plan = { ...plan, targets: { ...plan.targets, calcio: { ...plan.targets.calcio, carbG: 450, kcal: 3060 } } };
    const s = { ...state, plan: high };
    expect(matchCarbs(monday, s)?.extraG).toBe(0);
    expect(dayTargetFor(monday, s)).toEqual(high.targets.calcio);
  });
});
