/**
 * Gusti ed esclusioni (docs/FASE2.md § 4.9, § 6.2, § 6.3). Funzioni pure: la data arriva dagli argomenti.
 *
 * - Un'esclusione è per alimento (`Plan.exclusions`, id di FOODS), mai per ricetta, e vale da `since`: oggi e i giorni
 *   passati non cambiano.
 * - I divieti di prevenzione (A1-A3: carni lavorate, alcol, prodotti di riso e riso integrale) sono esclusioni fisse, non
 *   visibili nella pagina dei gusti e non riattivabili: `excludedFoods` li comprende sempre.
 * - `tasteSignals` deriva dal diario i cambi ripetuti (niente si salva, P5); `tasteQuestion` dice quando chiedere
 *   «Lo tolgo dal piano?», solo nel momento dell'azione e mai da sola.
 */
import type { FoodExclusion, ISODate, Plan, Recipe } from '../domain/types';
import { FOODS } from '../data/foods';
import { FOOD_FACTS, factsOf } from '../data/foodFacts';
import { RECIPES } from '../data/recipes';
import { addDays, daysBetween, isISODate } from './dates';
import { MEAL_SLOTS, mealsForDate, type MenuState } from './menu';

// ───────────────────────── Divieti di prevenzione ─────────────────────────

/** Motivo di un divieto fisso: A1 carni lavorate, A2 alcol, A3 prodotti di riso e riso integrale. */
export type PreventionBan = 'A1' | 'A2' | 'A3';

/** Il solo riso ammesso nel menù: riso bianco in chicchi, lessato in molta acqua e scolato (A5). */
const ALLOWED_RICE: ReadonlySet<string> = new Set(['riso-basmati']);

/** Alimenti con alcol tra gli ingredienti (A2): oggi nessuno nell'archivio; il test lo controlla sui nomi. */
const ALCOHOL_FOODS: ReadonlySet<string> = new Set();

/** Divieto fisso di un alimento (FOODS o sola stima), o null. */
export function preventionBan(foodId: string): PreventionBan | null {
  if (ALCOHOL_FOODS.has(foodId)) return 'A2';
  const f = factsOf(foodId);
  if (!f) return null;
  if (f.group === 'carne-lavorata') return 'A1';
  if (f.rice && !ALLOWED_RICE.has(foodId)) return 'A3';
  return null;
}

let bannedCache: ReadonlySet<string> | null = null;

/** Alimenti dell'archivio vietati per regola (A1-A3). */
export function bannedFoods(): ReadonlySet<string> {
  if (!bannedCache) bannedCache = new Set(Object.keys(FOOD_FACTS).filter((id) => preventionBan(id) !== null));
  return bannedCache;
}

// ───────────────────────── Esclusioni dell'utente ─────────────────────────

/** Esclusioni dell'utente valide (id non vuoto, `since` valida), una per alimento. */
export function userExclusions(plan: Pick<Plan, 'exclusions'>): FoodExclusion[] {
  const seen = new Set<string>();
  const out: FoodExclusion[] = [];
  for (const e of plan.exclusions ?? []) {
    if (!e || typeof e.foodId !== 'string' || !e.foodId || !isISODate(e.since) || seen.has(e.foodId)) continue;
    seen.add(e.foodId);
    out.push(e);
  }
  return out;
}

/** Alimenti esclusi dall'utente nella data (da `since` in poi); senza data tutti quelli scelti. */
export function userExcludedFoods(plan: Pick<Plan, 'exclusions'>, iso?: ISODate): ReadonlySet<string> {
  return new Set(userExclusions(plan).filter((e) => iso === undefined || e.since <= iso).map((e) => e.foodId));
}

const excludedCache = new WeakMap<object, Map<string, ReadonlySet<string>>>();
const NO_PLAN_EXCLUSIONS = {};

/**
 * Alimenti che non entrano nel piano nella data: le esclusioni dell'utente valide in quel giorno più i divieti fissi
 * A1-A3. Senza data valgono tutte le esclusioni scelte. Memorizzato per piano (lo stesso oggetto dà lo stesso insieme).
 */
export function excludedFoods(plan: Pick<Plan, 'exclusions'>, iso?: ISODate): ReadonlySet<string> {
  const key = plan.exclusions ?? NO_PLAN_EXCLUSIONS;
  let byDate = excludedCache.get(key);
  if (!byDate) {
    byDate = new Map();
    excludedCache.set(key, byDate);
  }
  const k = iso ?? '*';
  const hit = byDate.get(k);
  if (hit) return hit;
  const set = new Set<string>(bannedFoods());
  for (const id of userExcludedFoods(plan, iso)) set.add(id);
  byDate.set(k, set);
  return set;
}

/** La ricetta non contiene nessun alimento escluso (dispensa compresa: la regola vale per tutti gli ingredienti). */
export function recipeAllowed(recipe: Recipe, excluded: ReadonlySet<string>): boolean {
  if (!excluded.size) return true;
  return !recipe.ingredients.some((l) => excluded.has(l.foodId));
}

/** Alimenti della ricetta che l'utente può togliere: senza dispensa (olio, sale, spezie, aglio), uno per id. */
export function excludableFoods(recipe: Recipe): string[] {
  const out: string[] = [];
  for (const l of recipe.ingredients) {
    const f = FOODS[l.foodId];
    if (!f || f.pantry || out.includes(f.id) || preventionBan(f.id)) continue;
    out.push(f.id);
  }
  return out;
}

/** Alimenti che si possono aggiungere a mano dalla pagina dei gusti: archivio senza dispensa né divieti. */
export function searchableFoods(): string[] {
  return Object.values(FOODS)
    .filter((f) => !f.pantry && !preventionBan(f.id))
    .map((f) => f.id);
}

// ───────────────────────── Cambi ripetuti (§ 6.3) ─────────────────────────

/** Finestra dei cambi ripetuti. */
export const TASTE_WINDOW_DAYS = 28;
/** Cambi minimi di un alimento nella finestra. */
export const TASTE_MIN_SWAPS = 3;
/** Quota minima delle volte in cui era previsto. */
export const TASTE_MIN_SHARE = 0.6;
/** Dopo un «Tienilo» la domanda non torna per 56 giorni. */
export const TASTE_ASK_COOLDOWN_DAYS = 56;

export interface TasteSignal {
  foodId: string;
  /** Cambi da una ricetta che lo conteneva a una che non lo contiene. */
  swaps: number;
  /** Volte in cui era previsto (pasti con quell'alimento nella ricetta prevista). */
  planned: number;
}

/** Alimenti di una ricetta che contano per i gusti: senza dispensa. */
function tasteFoods(recipe: Recipe | undefined): Set<string> {
  const out = new Set<string>();
  for (const l of recipe?.ingredients ?? []) {
    const f = FOODS[l.foodId];
    if (f && !f.pantry) out.add(f.id);
  }
  return out;
}

/**
 * Cambi e volte in cui era previsto, per alimento, negli ultimi 28 giorni (oggi compreso). La ricetta prevista è quella
 * salvata al momento del cambio (`DayLog.swapPlanned`), altrimenti quella del menù in vigore; un cambio da X a Y conta
 * per ogni alimento di X che non è in Y (dispensa esclusa). Solo gli alimenti cambiati almeno una volta, in ordine di
 * cambi e poi di id.
 */
export function tasteSignals(state: MenuState, today: ISODate): TasteSignal[] {
  if (!isISODate(today)) return [];
  const swaps = new Map<string, number>();
  const planned = new Map<string, number>();
  const start = state.plan.startDate;
  for (let i = TASTE_WINDOW_DAYS - 1; i >= 0; i--) {
    const iso = addDays(today, -i);
    if (isISODate(start) && daysBetween(start, iso) < 0) continue;
    const log = state.dayLogs[iso];
    const day = mealsForDate(iso, { plan: state.plan, dayLogs: {} });
    for (const slot of MEAL_SLOTS) {
      const plannedId = log?.swapPlanned?.[slot] || day.bySlot[slot]?.plannedId;
      if (!plannedId) continue;
      const from = tasteFoods(RECIPES[plannedId]);
      for (const id of from) planned.set(id, (planned.get(id) ?? 0) + 1);
      const swapId = log?.recipeSwaps?.[slot];
      if (!swapId || swapId === plannedId || !RECIPES[swapId]) continue;
      const to = tasteFoods(RECIPES[swapId]);
      for (const id of from) if (!to.has(id)) swaps.set(id, (swaps.get(id) ?? 0) + 1);
    }
  }
  return [...swaps.entries()]
    .map(([foodId, n]) => ({ foodId, swaps: n, planned: Math.max(n, planned.get(foodId) ?? 0) }))
    .sort((a, b) => b.swaps - a.swaps || a.foodId.localeCompare(b.foodId));
}

/** L'alimento supera le soglie del § 6.3: almeno 3 cambi in 28 giorni e almeno il 60% delle volte in cui era previsto. */
export function isRepeatedSwap(s: TasteSignal): boolean {
  return s.swaps >= TASTE_MIN_SWAPS && s.planned > 0 && s.swaps / s.planned >= TASTE_MIN_SHARE - 1e-9;
}

/**
 * La domanda da fare in testa alle alternative di un pasto: il primo alimento della ricetta (o di tutto il diario, senza
 * ricetta) cambiato spesso, non escluso e non chiesto negli ultimi 56 giorni (`Plan.tasteAsked`). Null se non c'è.
 */
export function tasteQuestion(state: MenuState, today: ISODate, recipe?: Recipe): TasteSignal | null {
  const inRecipe = recipe ? tasteFoods(recipe) : null;
  const excluded = userExcludedFoods(state.plan);
  const asked = state.plan.tasteAsked ?? {};
  for (const s of tasteSignals(state, today)) {
    if (!isRepeatedSwap(s) || excluded.has(s.foodId) || preventionBan(s.foodId)) continue;
    if (inRecipe && !inRecipe.has(s.foodId)) continue;
    const at = asked[s.foodId];
    if (isISODate(at) && daysBetween(at, today) < TASTE_ASK_COOLDOWN_DAYS) continue;
    return s;
  }
  return null;
}

// ───────────────────────── Testi ─────────────────────────

/** Articolo determinativo, con genere e numero: «il tonno», «l’orzo», «le zucchine». */
type Article = 'il' | 'lo' | 'la' | 'l’m' | 'l’f' | 'i' | 'gli' | 'le';

/** Nome breve per i testi dei gusti e articolo, per ogni alimento che si può togliere. */
const FOOD_LABELS: Record<string, readonly [string, Article]> = {
  'riso-basmati': ['riso basmati', 'il'],
  'riso-integrale': ['riso integrale', 'il'],
  pasta: ['pasta', 'la'],
  'pasta-integrale': ['pasta integrale', 'la'],
  'pasta-lenticchie': ['pasta di lenticchie', 'la'],
  farro: ['farro', 'il'],
  orzo: ['orzo', 'l’m'],
  couscous: ['cous cous', 'il'],
  'couscous-integrale': ['cous cous integrale', 'il'],
  'pane-integrale': ['pane integrale', 'il'],
  'pane-bianco': ['pane comune', 'il'],
  'piadina-integrale': ['piadina', 'la'],
  'fette-biscottate': ['fette biscottate', 'le'],
  'gallette-riso': ['gallette di riso', 'le'],
  avena: ['fiocchi d’avena', 'i'],
  muesli: ['muesli', 'il'],
  'fiocchi-mais': ['fiocchi di mais', 'i'],
  'crackers-integrali': ['crackers', 'i'],
  ceci: ['ceci', 'i'],
  cannellini: ['fagioli cannellini', 'i'],
  borlotti: ['fagioli borlotti', 'i'],
  lenticchie: ['lenticchie', 'le'],
  'lenticchie-rosse': ['lenticchie rosse', 'le'],
  piselli: ['piselli', 'i'],
  edamame: ['edamame', 'gli'],
  hummus: ['hummus', 'l’m'],
  'ceci-tostati': ['ceci tostati', 'i'],
  pollo: ['pollo', 'il'],
  tacchino: ['tacchino', 'il'],
  manzo: ['manzo', 'il'],
  salmone: ['salmone', 'il'],
  'salmone-affumicato': ['salmone affumicato', 'il'],
  merluzzo: ['merluzzo', 'il'],
  gamberi: ['gamberi', 'i'],
  tonno: ['tonno', 'il'],
  sgombro: ['sgombro', 'lo'],
  uova: ['uova', 'le'],
  albume: ['albume', 'l’m'],
  'yogurt-greco-0': ['yogurt greco 0%', 'lo'],
  'yogurt-greco-2': ['yogurt greco 2%', 'lo'],
  skyr: ['skyr', 'lo'],
  latte: ['latte', 'il'],
  kefir: ['kefir', 'il'],
  'fiocchi-latte': ['fiocchi di latte', 'i'],
  ricotta: ['ricotta', 'la'],
  grana: ['grana', 'il'],
  feta: ['feta', 'la'],
  mela: ['mela', 'la'],
  pera: ['pera', 'la'],
  banana: ['banana', 'la'],
  arancia: ['arancia', 'l’f'],
  clementine: ['clementine', 'le'],
  kiwi: ['kiwi', 'i'],
  'frutti-bosco': ['frutti di bosco', 'i'],
  datteri: ['datteri', 'i'],
  insalata: ['insalata', 'l’f'],
  rucola: ['rucola', 'la'],
  'spinaci-novelli': ['spinaci novelli', 'gli'],
  spinaci: ['spinaci surgelati', 'gli'],
  zucchine: ['zucchine', 'le'],
  broccoli: ['broccoli', 'i'],
  fagiolini: ['fagiolini', 'i'],
  minestrone: ['minestrone', 'il'],
  'verdure-grigliate': ['verdure grigliate', 'le'],
  soffritto: ['soffritto', 'il'],
  'vellutata-pronta': ['vellutata pronta', 'la'],
  passata: ['passata di pomodoro', 'la'],
  pomodorini: ['pomodorini', 'i'],
  carote: ['carote', 'le'],
  zucca: ['zucca', 'la'],
  'cipolla-rossa': ['cipolla rossa', 'la'],
  cetriolo: ['cetriolo', 'il'],
  peperoni: ['peperoni', 'i'],
  patate: ['patate', 'le'],
  limone: ['limone', 'il'],
  mandorle: ['mandorle', 'le'],
  noci: ['noci', 'le'],
  'burro-arachidi': ['crema di arachidi', 'la'],
  'semi-chia': ['semi di chia', 'i'],
  'cioccolato-fondente': ['cioccolato fondente', 'il'],
  cacao: ['cacao', 'il'],
  miele: ['miele', 'il'],
  confettura: ['confettura', 'la'],
};

/** Nome breve dell'alimento in minuscolo («tonno», «fiocchi d’avena»); per un alimento senza etichetta il nome dell'archivio. */
export function foodLabel(foodId: string): string {
  const l = FOOD_LABELS[foodId];
  if (l) return l[0];
  const f = FOODS[foodId];
  if (!f) return foodId;
  const name = f.name.replace(/,\s*(cott[oaie]|sgocciolat[oaie]|rinvenut[oa])$/u, '');
  return name.length > 1 && name[1] === name[1].toLowerCase() ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

function articleOf(foodId: string): Article {
  return FOOD_LABELS[foodId]?.[1] ?? 'il';
}

/** «il tonno», «l’orzo», «le zucchine». */
export function foodWithArticle(foodId: string): string {
  const a = articleOf(foodId);
  const name = foodLabel(foodId);
  return a === 'l’m' || a === 'l’f' ? `l’${name}` : `${a} ${name}`;
}

/** Genere e numero dall'articolo. */
function agreement(foodId: string): { fem: boolean; plural: boolean } {
  const a = articleOf(foodId);
  return { fem: a === 'la' || a === 'l’f' || a === 'le', plural: a === 'i' || a === 'gli' || a === 'le' };
}

/** Participio accordato: «Tolto», «Tolta», «Tolti», «Tolte» (dalla radice «Tolt»). */
export function agreed(foodId: string, stem: string): string {
  const { fem, plural } = agreement(foodId);
  return `${stem}${plural ? (fem ? 'e' : 'i') : fem ? 'a' : 'o'}`;
}

/** Pronome oggetto: «lo», «la», «li», «le». */
export function objectPronoun(foodId: string): string {
  const { fem, plural } = agreement(foodId);
  return plural ? (fem ? 'le' : 'li') : fem ? 'la' : 'lo';
}

/** Maiuscola iniziale. */
export function capitalFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
