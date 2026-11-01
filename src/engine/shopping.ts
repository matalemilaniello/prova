/**
 * Spesa della settimana.
 *
 * `shoppingList(weekStartIso, state)` somma i grammi di tutti gli ingredienti dei pasti della settimana
 * (dal lunedì alla domenica, porzioni del tipo di giorno e sostituzioni di ricetta comprese), applica
 * `buyFactor` (cotto → crudo, sgocciolato → barattolo), raggruppa per reparto e arrotonda in modo umano:
 *
 * - frutta e verdura che si conta, e le uova: "6 uova", "4 banane";
 * - prodotti confezionati: "2 barattoli da 400 g", "1 busta da 125 g"; se della confezione grande serve
 *   meno della metà abbondante, si indica il peso ("≈ 250 g", con "confezione da 1 kg" come nota);
 * - vasetti senza confezione indicata: "3 vasetti da 170 g";
 * - tutto il resto a peso: "≈ 650 g", "≈ 1,2 kg"; i liquidi in ml o litri.
 *
 * I prodotti da dispensa (olio, sale, spezie) restano in un elenco separato: di solito ci sono già.
 * Le chiavi delle voci sono gli id degli alimenti: restano stabili anche se il menù cambia.
 *
 * Le porzioni sono quelle che l'utente vede nel menù: tipo di giorno effettivo (la vigilia della partita
 * mangia come un giorno di calcio) e scala del piano (`dayCarbScale`). Con `checkIns` e `profile` nello stato il
 * minimo di carboidrati di partita e vigilia usa il peso recente, come nelle altre schermate.
 *
 * Conservazione: la spesa si fa nel fine settimana. Carne e pesce freschi da crudi reggono in frigo
 * 1-2 giorni; se un pasto cucinato sul momento li usa da mercoledì in poi, la voce porta una nota che dice
 * di congelare quelle porzioni (`note`, `freezeDates`). Ciò che si cuoce nella preparazione della domenica
 * non conta: lì si cucina subito e si conserva cotto.
 *
 * Con `fromDate` la lista parte da quel giorno (la prima settimana di chi inizia a metà settimana).
 * Con `lead` comprende anche i giorni del fine settimana prima del lunedì: chi comincia il venerdì sera o il
 * sabato non ha la spesa di avvio, e la spesa del sabato porta anche i pasti di avvio di sabato e domenica.
 *
 * Giorni di avvio (`isStarterDay`): la preparazione della domenica non c'è stata, quindi niente si considera
 * cucinato in anticipo e la carne fresca di metà settimana va congelata da cruda. `starter` dice se tutta la
 * lista è di avvio: è la spesa di avvio, quella del primo pomeriggio libero.
 */
import type { Food, ISODate, MealSlot, MenuWeek, ShopCategory } from '../domain/types';
import { FOODS } from '../data/foods';
import { MENU_ROTATION } from '../data/menu';
import { WEEKDAY_LONG, listIt } from '../lib/format';
import { addDays, weekDates, weekStart, weekdayOf } from './dates';
import { mealsForDate, menuWeekFor } from './menu';
import { dayCarbScale, lineGrams, type NutritionState } from './nutrition';

const NBSP = ' ';

/** Ordine dei reparti, come si incontrano in un supermercato. */
export const SHOP_CATEGORIES: ShopCategory[] = [
  'Frutta e verdura',
  'Surgelati',
  'Carne e pesce',
  'Latticini e uova',
  'Pane e cereali',
  'Legumi',
  'Dispensa',
  'Condimenti',
];

export interface ShoppingUse {
  date: ISODate;
  slot: MealSlot;
  recipeId: string;
  /** Grammi mangiati in questo pasto. */
  grams: number;
  /** True se l'alimento si cucina nella preparazione della domenica (ricetta da preparazione). */
  ahead?: boolean;
}

export interface ShoppingItem {
  /** Chiave stabile per le spunte (id dell'alimento). */
  key: string;
  foodId: string;
  /** Nome da lista della spesa, senza lo stato di cottura ("Riso basmati", "Banane"). */
  name: string;
  category: ShopCategory;
  /** Grammi mangiati nella settimana. */
  eatenG: number;
  /** Grammi da comprare (mangiati × buyFactor). */
  buyG: number;
  /** Quantità per esteso: "≈ 600 g", "6 uova", "2 barattoli da 400 g". */
  qty: string;
  /** Quantità compatta per la colonna a destra: "≈ 600 g", "6", "2 × 400 g". */
  amount: string;
  /** Nota facoltativa: "peso a crudo", "confezione da 1 kg". */
  hint?: string;
  /**
   * Avviso di conservazione per carne e pesce freschi usati a metà settimana o dopo:
   * "Congela la porzione per venerdì (≈ 150 g) e passala in frigo la sera prima".
   */
  note?: string;
  /** Giorni dei pasti per cui l'alimento va congelato appena comprato. */
  freezeDates?: ISODate[];
  pantry: boolean;
  uses: ShoppingUse[];
  /** Giorni in cui serve, in ordine. */
  days: ISODate[];
}

export interface ShoppingGroup {
  category: ShopCategory;
  items: ShoppingItem[];
}

export interface ShoppingList {
  weekStart: ISODate;
  /** Reparti con almeno una voce da comprare, nell'ordine di SHOP_CATEGORIES. */
  groups: ShoppingGroup[];
  /** Prodotti da dispensa (da controllare, non da comprare). */
  pantry: ShoppingItem[];
  /** Tutte le voci da comprare, nell'ordine dei reparti. */
  items: ShoppingItem[];
  /** Pasti del menù considerati. */
  mealCount: number;
  /** Giorni considerati, in ordine (tutta la settimana, oppure da `fromDate`). */
  dates: ISODate[];
  /** Giorni di avvio tra quelli considerati (niente preparazione della domenica). */
  starterDates: ISODate[];
  /** Giorni del fine settimana prima del lunedì compresi con `lead` (vuoto senza). */
  leadDates: ISODate[];
  /** True se tutti i giorni con pasti sono di avvio: è la spesa di avvio. */
  starter: boolean;
}

export interface ShoppingOptions {
  foods?: Record<string, Food>;
  rotation?: MenuWeek[];
  /** Primo giorno da considerare (incluso): i giorni prima restano fuori dalla lista. */
  fromDate?: ISODate;
  /**
   * Pasti del fine settimana prima del lunedì da comprare insieme alla settimana: da `date` (il sabato della
   * prima spesa) alla domenica, tranne i pasti `skipSlots` di quel giorno (vengono prima della spesa).
   */
  lead?: ShoppingLead;
}

export interface ShoppingLead {
  date: ISODate;
  skipSlots?: readonly MealSlot[];
}

// ───────────────────────── Nomi ─────────────────────────

const STATE_WORDS = new Set([
  'cotto',
  'cotta',
  'cotti',
  'cotte',
  'sgocciolato',
  'sgocciolata',
  'sgocciolati',
  'sgocciolate',
  'rinvenuto',
  'rinvenuta',
]);

/** Nome da lista della spesa: toglie lo stato di cottura ("Riso basmati, cotto" → "Riso basmati"). */
export function shopName(food: Pick<Food, 'name'>): string {
  const m = /^(.*),\s*([\p{L}]+)$/u.exec(food.name);
  if (m && STATE_WORDS.has(m[2].toLowerCase())) return m[1].trim();
  return food.name;
}

/** Stato in cui sono pesati i grammi della ricetta ("cotta", "sgocciolati"), se indicato nel nome. */
export function foodState(food: Pick<Food, 'name'>): string | undefined {
  const m = /,\s*([\p{L}]+)$/u.exec(food.name);
  return m && STATE_WORDS.has(m[1].toLowerCase()) ? m[1].toLowerCase() : undefined;
}

/** Alimenti che si comprano a pezzi, con il nome singolare e plurale. */
const COUNT_NOUNS: Record<string, [string, string]> = {
  uova: ['uovo', 'uova'],
  mela: ['mela', 'mele'],
  pera: ['pera', 'pere'],
  banana: ['banana', 'banane'],
  arancia: ['arancia', 'arance'],
  clementine: ['clementina', 'clementine'],
  kiwi: ['kiwi', 'kiwi'],
  zucchine: ['zucchina', 'zucchine'],
  peperoni: ['peperone', 'peperoni'],
  cetriolo: ['cetriolo', 'cetrioli'],
  limone: ['limone', 'limoni'],
  carote: ['carota', 'carote'],
  'cipolla-rossa': ['cipolla rossa', 'cipolle rosse'],
};

const PACK_PLURAL: Record<string, string> = {
  confezione: 'confezioni',
  barattolo: 'barattoli',
  busta: 'buste',
  pacco: 'pacchi',
  bottiglia: 'bottiglie',
  vasetto: 'vasetti',
  vaschetta: 'vaschette',
  scatoletta: 'scatolette',
  tavoletta: 'tavolette',
  brick: 'brick',
};

/** Confezioni che si comprano sempre intere, anche se ne serve una parte. */
const ALWAYS_WHOLE = new Set(['barattolo', 'scatoletta', 'vaschetta', 'vasetto', 'tavoletta']);

function packPlural(word: string): string {
  if (PACK_PLURAL[word]) return PACK_PLURAL[word];
  if (word.endsWith('o')) return `${word.slice(0, -1)}i`;
  if (word.endsWith('a')) return `${word.slice(0, -1)}e`;
  if (word.endsWith('e')) return `${word.slice(0, -1)}i`;
  return word;
}

interface PackInfo {
  word: string;
  /** Testo della misura come scritto ("400 g", "1 kg", "1 l"). */
  sizeText: string;
  /** Grammi della confezione (per i liquidi: ml × densità). */
  grams?: number;
  /** Pezzi per confezione ("confezione da 4"). */
  pieces?: number;
}

/** "barattolo da 400 g" → { word: 'barattolo', grams: 400 }; "confezione da 4" → { pieces: 4 }. */
export function parseBuyLabel(label: string | undefined, food?: Pick<Food, 'unitGrams'>): PackInfo | undefined {
  if (!label) return undefined;
  const m = /^\s*(\p{L}+)\s+da\s+(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)?\s*$/u.exec(label);
  if (!m) return undefined;
  const word = m[1].toLowerCase();
  const n = Number(m[2].replace(',', '.'));
  const unit = m[3];
  if (!(n > 0)) return undefined;
  if (!unit) return { word, sizeText: String(n), pieces: n };
  const density = food?.unitGrams.ml ?? 1;
  const grams = unit === 'kg' ? n * 1000 : unit === 'g' ? n : unit === 'l' ? n * 1000 * density : n * density;
  return { word, sizeText: `${m[2]}${NBSP}${unit}`, grams };
}

// ───────────────────────── Arrotondamenti umani ─────────────────────────

const nf1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

/** Arrotonda un peso a una cifra "da lista": 5 g sotto i 50, 10 g sotto i 250, 50 g sotto il chilo, poi 100 g. */
export function roundShopGrams(g: number): number {
  if (!(g > 0)) return 0;
  if (g < 50) return Math.max(5, Math.round(g / 5) * 5);
  if (g < 250) return Math.round(g / 10) * 10;
  if (g < 1000) return Math.round(g / 50) * 50;
  return Math.round(g / 100) * 100;
}

/** "≈ 650 g", "≈ 1,2 kg" (o "≈ 400 ml", "≈ 1,5 l" per i liquidi). */
export function formatShopWeight(g: number, liquid = false): string {
  const r = roundShopGrams(g);
  if (r >= 1000) return `≈${NBSP}${nf1.format(r / 1000)}${NBSP}${liquid ? 'l' : 'kg'}`;
  return `≈${NBSP}${r}${NBSP}${liquid ? 'ml' : 'g'}`;
}

/** Conta le unità arrotondando per eccesso, ma con tolleranza: 2,1 confezioni restano 2. */
function countUp(n: number, tolerance: number): number {
  if (!(n > 0)) return 0;
  return Math.max(1, Math.ceil(n - tolerance));
}

export interface ShopQuantity {
  qty: string;
  amount: string;
  hint?: string;
  /** Nome da usare quando la quantità è a pezzi (plurale se più di uno). */
  name?: string;
}

/**
 * "peso a crudo" quando i grammi da comprare non sono quelli che si mangiano: cereali e pasta secchi,
 * carne e pesce da cuocere. Non per le patate (lo scarto è la buccia) né per le confezioni intere.
 */
function rawWeightHint(food: Food): string | undefined {
  const f = food.buyFactor;
  if (f === undefined || f === 1) return undefined;
  if (f < 1) return 'peso a crudo';
  return food.category === 'Carne e pesce' || food.category === 'Surgelati' ? 'peso a crudo' : undefined;
}

/** Quantità leggibile da comprare per un alimento, dato il peso da comprare. */
export function shoppingQuantity(food: Food | undefined, buyG: number): ShopQuantity {
  if (!food || !(buyG > 0)) return { qty: '', amount: '' };
  const rawHint = rawWeightHint(food);

  // 1. A pezzi: frutta e verdura che si conta, uova.
  const noun = COUNT_NOUNS[food.id];
  const pieceG = food.unitGrams.pezzo;
  if (noun && pieceG) {
    const n = countUp(buyG / pieceG, 0.2);
    const word = n === 1 ? noun[0] : noun[1];
    return { qty: `${n} ${word}`, amount: String(n), name: word.charAt(0).toUpperCase() + word.slice(1) };
  }

  // 2. Confezioni.
  const pack = parseBuyLabel(food.buyLabel, food);
  if (pack?.pieces && pieceG) {
    const pieces = buyG / pieceG;
    const n = countUp(pieces / pack.pieces, 0.15);
    const word = n === 1 ? pack.word : packPlural(pack.word);
    const qty = `${n} ${word} da ${pack.sizeText}`;
    return { qty, amount: qty };
  }
  if (pack?.grams) {
    const ratio = buyG / pack.grams;
    const whole = ALWAYS_WHOLE.has(pack.word) || pack.grams <= 200 || ratio >= 0.6;
    if (whole) {
      const n = countUp(ratio, 0.12);
      const word = n === 1 ? pack.word : packPlural(pack.word);
      return { qty: `${n} ${word} da ${pack.sizeText}`, amount: `${n}${NBSP}×${NBSP}${pack.sizeText}` };
    }
    const liquid = food.unitGrams.ml !== undefined;
    const w = formatShopWeight(liquid ? buyG / (food.unitGrams.ml ?? 1) : buyG, liquid);
    return { qty: w, amount: w, hint: [rawHint, `${pack.word} da ${pack.sizeText}`].filter(Boolean).join(' · ') };
  }

  // 3. Vasetti senza confezione indicata (yogurt, skyr, fiocchi di latte).
  const jarG = food.unitGrams.vasetto;
  if (jarG) {
    const n = countUp(buyG / jarG, 0.15);
    const size = `${jarG}${NBSP}g`;
    return { qty: `${n} ${n === 1 ? 'vasetto' : 'vasetti'} da ${size}`, amount: `${n}${NBSP}×${NBSP}${size}` };
  }

  // 4. A peso (o a volume).
  const liquid = food.unitGrams.ml !== undefined && food.unitGrams.ml !== 1 && !food.unitGrams.pezzo;
  const w = formatShopWeight(liquid ? buyG / (food.unitGrams.ml ?? 1) : buyG, liquid);
  return { qty: w, amount: w, hint: rawHint };
}

// ───────────────────────── Conservazione ─────────────────────────

/** Carne e pesce freschi, al banco o in vaschetta: da crudi 1-2 giorni in frigo. */
const PERISHABLE = new Set(['pollo', 'tacchino', 'manzo', 'salmone']);

/** Ultimo giorno della settimana (0 = lunedì) in cui il fresco comprato nel weekend si cucina senza congelarlo. */
export const FRESH_LAST_WEEKDAY = 1;

/** True per carne e pesce freschi (non confezionati a lunga conservazione, non surgelati). */
export function isPerishable(food: Pick<Food, 'id' | 'category' | 'buyLabel' | 'pantry'>): boolean {
  if (PERISHABLE.has(food.id)) return true;
  return food.category === 'Carne e pesce' && !food.buyLabel && !food.pantry;
}

/** Testo della nota di conservazione per i giorni da congelare. */
export function freezeNote(dates: ISODate[], buyG?: number): string {
  const days = listIt(dates.map((d) => WEEKDAY_LONG[weekdayOf(d)]));
  if (dates.length === 1) {
    const g = buyG && buyG > 0 ? ` (${formatShopWeight(buyG)})` : '';
    return `Congela la porzione per ${days}${g} e passala in frigo la sera prima`;
  }
  return `Congela le porzioni per ${days}, separate, e passale in frigo la sera prima`;
}

/** True se la preparazione della settimana cucina quell'alimento per quella ricetta. */
function preparedAhead(foodId: string, recipeId: string, batch: boolean | undefined, week: MenuWeek | undefined): boolean {
  if (batch) return true;
  const word = foodId.split('-')[0];
  return Boolean(week?.prep?.some((t) => (t.recipeIds ?? []).includes(recipeId) && t.title.toLowerCase().includes(word)));
}

// ───────────────────────── Lista della settimana ─────────────────────────

const collator = new Intl.Collator('it-IT', { sensitivity: 'base' });

/** Lista della spesa della settimana che contiene `weekStartIso` (si allinea al lunedì). */
export function shoppingList(weekStartIso: ISODate, state: NutritionState, opts: ShoppingOptions = {}): ShoppingList {
  const foods = opts.foods ?? FOODS;
  const rotation = opts.rotation ?? MENU_ROTATION;
  const monday = weekStart(weekStartIso);
  const acc = new Map<string, { eaten: number; uses: ShoppingUse[] }>();
  const week = rotation.length ? menuWeekFor(monday, state.plan.startDate, rotation) : undefined;
  const lead = opts.lead;
  const leadDates: ISODate[] = [];
  if (lead && lead.date < monday) for (let d = lead.date; d < monday && leadDates.length < 3; d = addDays(d, 1)) leadDates.push(d);
  const dates = [...leadDates, ...weekDates(monday).filter((d) => !opts.fromDate || d >= opts.fromDate)];
  const starterDates: ISODate[] = [];
  let mealDays = 0;
  let mealCount = 0;

  for (const date of dates) {
    const { dayType, meals, starter } = mealsForDate(date, state, rotation);
    if (starter) starterDates.push(date);
    if (meals.length) mealDays++;
    const scale = dayCarbScale(date, state);
    const skip = lead && date === lead.date ? new Set(lead.skipSlots ?? []) : null;
    for (const meal of meals) {
      if (!meal.recipe || skip?.has(meal.slot)) continue;
      mealCount++;
      for (const line of meal.recipe.ingredients) {
        if (!foods[line.foodId]) continue;
        const grams = lineGrams(line, dayType, foods, scale);
        if (!(grams > 0)) continue;
        const cur = acc.get(line.foodId) ?? { eaten: 0, uses: [] };
        cur.eaten += grams;
        const use: ShoppingUse = { date, slot: meal.slot, recipeId: meal.recipeId, grams };
        // Nei giorni di avvio la preparazione non c'è stata: anche una ricetta da preparazione si cucina sul momento.
        if (!starter && preparedAhead(line.foodId, meal.recipeId, meal.recipe.batch, week)) use.ahead = true;
        cur.uses.push(use);
        acc.set(line.foodId, cur);
      }
    }
  }

  const all: ShoppingItem[] = [];
  for (const [foodId, { eaten, uses }] of acc) {
    const food = foods[foodId];
    const buyG = eaten * (food.buyFactor ?? 1);
    const q = shoppingQuantity(food, buyG);
    const item: ShoppingItem = {
      key: foodId,
      foodId,
      name: q.name ?? shopName(food),
      category: food.category,
      eatenG: eaten,
      buyG,
      qty: q.qty,
      amount: q.amount,
      hint: q.hint,
      pantry: Boolean(food.pantry),
      uses,
      days: [...new Set(uses.map((u) => u.date))].sort(),
    };
    if (isPerishable(food)) {
      // I giorni del fine settimana prima del lunedì seguono la spesa: niente da congelare.
      const late = uses.filter((u) => !u.ahead && u.date >= monday && weekdayOf(u.date) > FRESH_LAST_WEEKDAY);
      const lateDates = [...new Set(late.map((u) => u.date))].sort();
      if (lateDates.length) {
        const lateBuyG = late.reduce((a, u) => a + u.grams, 0) * (food.buyFactor ?? 1);
        item.freezeDates = lateDates;
        item.note = freezeNote(lateDates, lateBuyG);
      }
    }
    all.push(item);
  }

  const byName = (a: ShoppingItem, b: ShoppingItem) => collator.compare(a.name, b.name);
  const toBuy = all.filter((i) => !i.pantry);
  const groups: ShoppingGroup[] = [];
  for (const category of SHOP_CATEGORIES) {
    const items = toBuy.filter((i) => i.category === category).sort(byName);
    if (items.length) groups.push({ category, items });
  }
  // Reparti non previsti (dati futuri): in fondo, senza perderli.
  const known = new Set<string>(SHOP_CATEGORIES);
  const extra = toBuy.filter((i) => !known.has(i.category)).sort(byName);
  if (extra.length) groups.push({ category: extra[0].category, items: extra });

  return {
    weekStart: monday,
    groups,
    pantry: all.filter((i) => i.pantry).sort(byName),
    items: groups.flatMap((g) => g.items),
    mealCount,
    dates,
    starterDates,
    leadDates,
    starter: mealDays > 0 && starterDates.length >= mealDays,
  };
}

export interface ShoppingProgress {
  done: number;
  total: number;
  /** 0-1 */
  ratio: number;
}

/** Voci spuntate tra quelle da comprare (le spunte di voci non più in lista non contano). */
export function shoppingProgress(list: ShoppingList, checked: readonly string[] = []): ShoppingProgress {
  const set = new Set(checked);
  const total = list.items.length;
  const done = list.items.filter((i) => set.has(i.key)).length;
  return { done, total, ratio: total ? done / total : 0 };
}

export interface ShoppingTextOptions {
  /** Voci già spuntate: restano fuori dal testo. */
  checked?: readonly string[];
  /** Prima riga (es. "Spesa · 2-8 novembre"). */
  title?: string;
  /** Aggiunge in fondo i prodotti da dispensa da controllare (default true). */
  includePantry?: boolean;
  /** Aggiunge in fondo cosa congelare appena a casa (default true). */
  includeFreezer?: boolean;
}

/** Una riga di testo per la voce: "6 uova", "Petto di pollo: ≈ 650 g". */
export function shoppingLine(item: ShoppingItem): string {
  const q = item.qty;
  // Le quantità a pezzi contengono già il nome ("4 banane").
  if (/^\d+\s/.test(q) && q.toLowerCase().endsWith(item.name.toLowerCase())) return q;
  return q ? `${item.name}: ${q}` : item.name;
}

/** Testo semplice da incollare in una nota o in una chat: reparti in maiuscolo, una voce per riga. */
export function shoppingText(list: ShoppingList, opts: ShoppingTextOptions = {}): string {
  const checked = new Set(opts.checked ?? []);
  const lines: string[] = [];
  if (opts.title) lines.push(opts.title);
  for (const g of list.groups) {
    const items = g.items.filter((i) => !checked.has(i.key));
    if (!items.length) continue;
    if (lines.length) lines.push('');
    lines.push(g.category.toUpperCase());
    for (const i of items) lines.push(`- ${shoppingLine(i)}`);
  }
  if (opts.includePantry !== false) {
    const pantry = list.pantry.filter((i) => !checked.has(i.key));
    if (pantry.length) {
      if (lines.length) lines.push('');
      lines.push('DA CONTROLLARE IN DISPENSA');
      for (const i of pantry) lines.push(`- ${i.name}`);
    }
  }
  if (opts.includeFreezer !== false) {
    // Le voci già spuntate restano: a casa servono proprio quelle comprate.
    const freeze = list.items.filter((i) => i.note);
    if (freeze.length) {
      if (lines.length) lines.push('');
      lines.push('APPENA A CASA');
      for (const i of freeze) lines.push(`- ${i.name}: ${i.note!.charAt(0).toLowerCase()}${i.note!.slice(1)}`);
    }
  }
  return lines.join('\n').replace(/ /g, ' ');
}
