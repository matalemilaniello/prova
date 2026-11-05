/**
 * Pasti stimati (docs/FASE2.md § 7): dalla lettura della foto alla scheda modificabile e al pasto che entra nel diario.
 *
 * Regola di fondo (§ 7.3): i valori li calcola il motore, mai il coach. Per gli alimenti dell'archivio (`FOODS`) e di
 * sola stima (`ESTIMATE_FOODS`) valgono i loro valori per 100 g per i grammi confermati; i numeri del coach contano solo
 * fuori archivio e solo se passano i controlli di `validPer100g`. Olio e condimenti si chiedono sempre (la foto sbaglia
 * soprattutto lì); con la cottura «fritto» si aggiunge l'olio assorbito.
 *
 * Funzioni pure: niente orologio, niente casualità, niente stato. La forma compatta degli alimenti (`EstimatedItem`) e
 * i suoi controlli stanno qui e li usa anche la normalizzazione dello stato (`state/store.ts`).
 */
import type { EatenMeal, EstimateConfidence, EstimatedItem, Food, MealSlot, Nutrients, OilChoice, PortionUnit, Recipe } from '../domain/types';
import { ESTIMATE_FOODS } from '../data/estimateFoods';
import { FOODS } from '../data/foods';
import { fmtKcal } from '../lib/format';
import { PIECE_WORDS, portionPhrase, roundNutrients } from './nutrition';

// ───────────────────────── Limiti (§ 7.3) ─────────────────────────

/** Alimenti di un pasto stimato: al massimo 12, da 1 a 1.500 g l'uno; etichetta fuori archivio di 40 caratteri. */
export const MAX_MEAL_ITEMS = 12;
/** Nella scheda gli alimenti sono al massimo 11: il dodicesimo posto resta all'olio della domanda «Olio e condimenti». */
export const DRAFT_ITEMS_MAX = MAX_MEAL_ITEMS - 1;
export const ITEM_GRAMS_MIN = 1;
export const ITEM_GRAMS_MAX = 1500;
export const ITEM_LABEL_MAX = 40;
/** Nome di un piatto: una riga, al massimo 40 caratteri (come `DISH_NAME_MAX` dello stato). */
export const DISH_LABEL_MAX = 40;
/** Un pasto oltre 3.000 kcal non si segna (tetto di `normalizeEatenMeal`). */
export const MEAL_KCAL_MAX = 3000;
/** Oltre 1.800 o sotto 100 kcal la scheda chiede di controllare i grammi, in una riga. */
export const MEAL_KCAL_HIGH = 1800;
export const MEAL_KCAL_LOW = 100;
/** Grammi in scheda: arrotondati a 5, mai sotto 5. */
export const GRAMS_ROUND = 5;

/** Alimento dell'olio della domanda «Olio e condimenti». */
export const OIL_FOOD_ID = 'olio-evo';
/** Grammi di ogni risposta: un filo 5 g, un cucchiaio 10 g, due cucchiai 20 g. */
export const OIL_GRAMS: Record<OilChoice, number> = { niente: 0, filo: 5, cucchiaio: 10, 'due-cucchiai': 20 };
export const OIL_CHOICES: readonly OilChoice[] = ['niente', 'filo', 'cucchiaio', 'due-cucchiai'];
/**
 * Olio assorbito nella frittura: 8% del peso dell'alimento fritto [ipotesi: in letteratura l'assorbimento varia molto,
 * circa dal 5 al 15%]. Si applica solo agli alimenti dell'archivio: quelli di sola stima fritti (patatine, cotolette) e i
 * valori fuori archivio descrivono già il piatto cotto.
 */
export const FRIED_OIL_SHARE = 0.08;
/** Un alimento a confidenza bassa che pesa più del 25% delle kcal allarga i totali a un intervallo di ±25%. */
export const LOW_CONFIDENCE_SHARE = 0.25;
export const RANGE_SHARE = 0.25;
/** «Previsto» per il motore: almeno il 60% degli alimenti non di dispensa della ricetta prevista (§ 7.5). */
export const MATCH_PLANNED_SHARE = 0.6;

// ───────────────────────── Aiuti ─────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Numero finito (anche da testo con la virgola), non booleano né null; altrimenti undefined. */
const finiteNum = (v: unknown): number | undefined => {
  if (typeof v === 'boolean' || v === null) return undefined;
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const clampN = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const nonEmpty = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
/** Testo su una riga (a capo e spazi ripetuti diventano uno spazio), al massimo `max` caratteri. */
export const oneLine = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';
/** Toglie le chiavi con valore undefined. */
const compact = <T extends object>(o: T): T => {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
};

let estimateById: Map<string, Food> | null = null;

/** Alimento dell'archivio o di sola stima; undefined se l'id non è noto. */
export function estimateFoodById(id: string | undefined): Food | undefined {
  if (!id) return undefined;
  if (FOODS[id]) return FOODS[id];
  if (!estimateById || estimateById.size !== ESTIMATE_FOODS.length) estimateById = new Map(ESTIMATE_FOODS.map((f) => [f.id, f]));
  return estimateById.get(id);
}

/** Alimento di sola stima (mai nel menù né nella spesa). */
export function isEstimateOnly(id: string | undefined): boolean {
  return Boolean(id && !FOODS[id] && estimateFoodById(id));
}

/** Nome da mostrare: quello dell'archivio, l'etichetta letta, oppure «Alimento». */
export function itemName(item: Pick<EstimatedItem, 'foodId' | 'label'>): string {
  return estimateFoodById(item.foodId)?.name ?? item.label ?? 'Alimento';
}

// ───────────────────────── Forma compatta (spostata da state/store.ts) ─────────────────────────

/**
 * Valori per 100 g di un alimento fuori archivio, con i controlli del § 7.3: kcal tra 0 e 900; proteine, carboidrati,
 * grassi e fibre ≥ 0 e insieme ≤ 100 g; coerenza di Atwater |4P + 4C + 9G + 2F − kcal| ≤ 15% delle kcal + 10.
 * Null fuori dai limiti.
 */
export function validPer100g(raw: unknown): Nutrients | null {
  if (!isObj(raw)) return null;
  const kcal = finiteNum(raw.kcal);
  const proteinG = finiteNum(raw.proteinG);
  const carbG = finiteNum(raw.carbG);
  const fatG = finiteNum(raw.fatG);
  const fiberG = finiteNum(raw.fiberG);
  if (kcal === undefined || proteinG === undefined || carbG === undefined || fatG === undefined || fiberG === undefined) return null;
  if (kcal < 0 || kcal > 900 || proteinG < 0 || carbG < 0 || fatG < 0 || fiberG < 0) return null;
  if (proteinG + carbG + fatG + fiberG > 100) return null;
  const atwater = 4 * proteinG + 4 * carbG + 9 * fatG + 2 * fiberG;
  if (Math.abs(atwater - kcal) > 0.15 * kcal + 10) return null;
  return { kcal, proteinG, carbG, fatG, fiberG };
}

/**
 * Un alimento di un pasto stimato, in forma compatta: grammi tra 1 e 1.500; con `foodId` niente etichetta né valori;
 * fuori archivio l'etichetta su una riga e i valori per 100 g solo se passano i controlli. La confidenza della scheda
 * non si salva. Null senza grammi o senza nulla che lo descriva.
 */
export function normalizeEstimatedItem(raw: unknown): EstimatedItem | null {
  if (!isObj(raw)) return null;
  const g = finiteNum(raw.grams);
  if (g === undefined || !(g > 0)) return null;
  const { confidence: _c, label: _l, per100g: _p, ...rest } = raw as Record<string, unknown>;
  void _c;
  void _l;
  void _p;
  const base = { ...(rest as Partial<EstimatedItem>), grams: clampN(g, ITEM_GRAMS_MIN, ITEM_GRAMS_MAX), role: raw.role === 'condimento' ? ('condimento' as const) : undefined };
  const foodId = nonEmpty(raw.foodId);
  if (foodId) return compact({ ...base, foodId });
  const label = oneLine(raw.label, ITEM_LABEL_MAX) || undefined;
  const per100g = validPer100g(raw.per100g) ?? undefined;
  if (!label && !per100g) return null;
  return compact({ ...base, foodId: undefined, label, per100g });
}

/**
 * Valori di un elenco di alimenti stimati, calcolati dal motore: per gli alimenti dell'archivio e di sola stima dai
 * valori per 100 g di quegli elenchi, fuori archivio da quelli controllati. Porzioni di vegetali dai grammi degli
 * alimenti con `vegPortionG`. Arrotondati come gli altri valori (kcal all'unità, grammi a un decimale).
 */
export function estimatedItemsValues(items: readonly EstimatedItem[]): { nutrients: Nutrients; vegPortions: number } {
  const n: Nutrients = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 };
  let veg = 0;
  for (const item of items) {
    const food = item.foodId ? estimateFoodById(item.foodId) : undefined;
    const per = food ? food.per100g : item.per100g;
    if (!per) continue;
    const k = item.grams / 100;
    n.kcal += per.kcal * k;
    n.proteinG += per.proteinG * k;
    n.carbG += per.carbG * k;
    n.fatG += per.fatG * k;
    n.fiberG += per.fiberG * k;
    if (food?.vegPortionG && food.vegPortionG > 0) veg += item.grams / food.vegPortionG;
  }
  return { nutrients: roundNutrients(n), vegPortions: Math.round(veg * 10) / 10 };
}

/** Il motore sa calcolare i valori dell'alimento: dell'archivio, di sola stima o con i valori per 100 g controllati. */
export function itemResolved(item: Pick<EstimatedItem, 'foodId' | 'per100g'>): boolean {
  return item.foodId ? estimateFoodById(item.foodId) !== undefined : item.per100g !== undefined;
}

/** Kcal di un solo alimento (0 se senza valori). */
export function itemKcal(item: EstimatedItem): number {
  const per = item.foodId ? estimateFoodById(item.foodId)?.per100g : item.per100g;
  return per ? (per.kcal * item.grams) / 100 : 0;
}

// ───────────────────────── Lettura della foto (§ 10.3) ─────────────────────────

export type PhotoCooking = 'crudo' | 'bollito' | 'vapore' | 'forno' | 'padella' | 'griglia' | 'fritto' | 'misto' | 'non-so';
export type PhotoMatch = 'si' | 'in-parte' | 'no' | 'non-so';

/** Un alimento letto dal coach, già passato dal validatore del compito (`engine/coachTasks/photo.ts`). */
export interface PhotoReadingItem {
  label: string;
  /** Id di FOODS o di ESTIMATE_FOODS; null = fuori archivio. */
  foodId: string | null;
  grams: number;
  confidence: EstimateConfidence;
  role: 'alimento' | 'condimento';
  /** Solo fuori archivio, già controllati con `validPer100g`; null altrimenti. */
  per100g: Nutrients | null;
}

/** Risposta del compito `foto-piatto`, nella forma dello schema del § 10.3. */
export interface PhotoReading {
  outcome: 'piatto' | 'non-cibo' | 'illeggibile';
  items: PhotoReadingItem[];
  cooking: PhotoCooking;
  oil: OilChoice | 'non-so';
  matchesPlanned: PhotoMatch;
  dishName: string;
  note: string;
}

/** Da dove arriva la foto e cosa prevedeva il piano per quel pasto. */
export interface EstimateCtx {
  /** Dal pasto di Oggi basta il «sì» del coach o il motore; dalla chat servono entrambi (§ 7.5). */
  origin: 'oggi' | 'chat';
  slot: MealSlot;
  /** Ricetta prevista per il pasto (strato 2 del menù con gli scambi), se c'è. */
  planned?: Recipe;
}

/** Un alimento della scheda: la forma compatta più la confidenza e una chiave per l'interfaccia (non si salvano). */
export interface DraftItem extends EstimatedItem {
  key: string;
  confidence: EstimateConfidence;
}

/** La scheda prima della conferma (§ 7.4): tutto modificabile, niente salvato. */
export interface EstimateDraft {
  items: DraftItem[];
  /** Scelta della domanda «Olio e condimenti»; null = da scegliere (il coach ha detto «non so»). */
  oil: OilChoice | null;
  /** Risposta del coach, per la riga «Il coach dice: un cucchiaio». */
  oilSuggested: OilChoice | null;
  /** Cottura «fritto»: si aggiunge l'olio assorbito. */
  fried: boolean;
  /** Conta come il pasto previsto: la voce diventa «fatto» con i valori della stima (§ 7.5). */
  asPlanned: boolean;
  /** Il motore trova nel piatto la ricetta prevista. */
  engineMatch: boolean;
  /** Nome proposto per «Salva tra i miei piatti». */
  dishName: string;
  /** Alimenti della lettura scartati (senza grammi, senza nome, oltre il massimo). */
  dropped: number;
}

const CONFIDENCE_RANK: Record<EstimateConfidence, number> = { bassa: 0, media: 1, alta: 2 };
const CONFIDENCES = new Set<string>(['bassa', 'media', 'alta']);

/** Grammi della scheda: arrotondati a 5, tra 5 e 1.500; null se non sono grammi. */
export function roundItemGrams(raw: unknown): number | null {
  const g = finiteNum(raw);
  if (g === undefined || !(g > 0)) return null;
  return clampN(Math.round(g / GRAMS_ROUND) * GRAMS_ROUND, GRAMS_ROUND, ITEM_GRAMS_MAX);
}

/** La risposta più vicina della domanda sull'olio per una quantità in grammi. */
export function nearestOil(grams: number): OilChoice {
  let best: OilChoice = 'niente';
  for (const c of OIL_CHOICES) if (Math.abs(OIL_GRAMS[c] - grams) < Math.abs(OIL_GRAMS[best] - grams)) best = c;
  return best;
}

/**
 * Il piatto è il pasto previsto per il motore: almeno il 60% degli alimenti non di dispensa della ricetta prevista
 * (stesso `foodId`) è tra gli alimenti del piatto. Senza ricetta, o con una ricetta di sola dispensa, no.
 */
export function matchesPlanned(items: readonly Pick<EstimatedItem, 'foodId'>[], recipe: Recipe | undefined): boolean {
  if (!recipe) return false;
  const wanted = [...new Set(recipe.ingredients.map((l) => l.foodId).filter((id) => FOODS[id] && !FOODS[id].pantry))];
  if (!wanted.length) return false;
  const have = new Set(items.map((i) => i.foodId).filter((id): id is string => Boolean(id)));
  const found = wanted.filter((id) => have.has(id)).length;
  return found / wanted.length >= MATCH_PLANNED_SHARE - 1e-9;
}

/**
 * Dalla lettura della foto alla scheda (§ 7.3, § 7.5). Gli alimenti dell'archivio tengono solo id e grammi (i valori
 * del coach si ignorano); fuori archivio l'etichetta e i valori per 100 g solo se passano i controlli, altrimenti
 * l'alimento resta senza valori e la scheda chiede di sceglierne uno dall'archivio. Grammi a 5, doppioni dello stesso
 * alimento sommati, al massimo `DRAFT_ITEMS_MAX` alimenti. L'olio letto come alimento passa alla domanda sull'olio,
 * che si preseleziona con la risposta del coach (senza, se dice «non so»). «Previsto»: dal pasto di Oggi il «sì» del
 * coach o il motore, dalla chat entrambi.
 */
export function resolveEstimate(raw: PhotoReading, ctx: EstimateCtx): EstimateDraft {
  const items: DraftItem[] = [];
  let dropped = 0;
  let oilSeen = 0;
  const list = raw.outcome === 'piatto' && Array.isArray(raw.items) ? raw.items : [];
  list.forEach((r, i) => {
    const grams = roundItemGrams(r?.grams);
    if (!r || grams === null) {
      dropped++;
      return;
    }
    const foodId = typeof r.foodId === 'string' && estimateFoodById(r.foodId) ? r.foodId : undefined;
    if (foodId === OIL_FOOD_ID) {
      oilSeen += grams;
      return;
    }
    const role = r.role === 'condimento' ? ('condimento' as const) : undefined;
    const confidence: EstimateConfidence = CONFIDENCES.has(r.confidence) ? r.confidence : 'media';
    if (foodId) {
      const same = items.find((x) => x.foodId === foodId);
      if (same) {
        same.grams = Math.min(ITEM_GRAMS_MAX, same.grams + grams);
        if (CONFIDENCE_RANK[confidence] < CONFIDENCE_RANK[same.confidence]) same.confidence = confidence;
        return;
      }
      if (items.length >= DRAFT_ITEMS_MAX) {
        dropped++;
        return;
      }
      items.push(compact({ key: `i${i}`, foodId, grams, role, confidence }));
      return;
    }
    const label = oneLine(r.label, ITEM_LABEL_MAX);
    if (!label || items.length >= DRAFT_ITEMS_MAX) {
      dropped++;
      return;
    }
    items.push(compact({ key: `i${i}`, label, grams, per100g: validPer100g(r.per100g) ?? undefined, role, confidence }));
  });

  const coachOil = raw.oil && raw.oil !== 'non-so' && OIL_CHOICES.includes(raw.oil) ? raw.oil : null;
  const oilSuggested = coachOil ?? (oilSeen > 0 ? nearestOil(oilSeen) : null);
  const engineMatch = matchesPlanned(items, ctx.planned);
  const coachMatch = raw.matchesPlanned === 'si';
  const asPlanned = Boolean(ctx.planned) && (ctx.origin === 'oggi' ? coachMatch || engineMatch : coachMatch && engineMatch);
  const dishName = oneLine(raw.dishName, DISH_LABEL_MAX) || (items[0] ? oneLine(itemName(items[0]), DISH_LABEL_MAX) : '') || 'Piatto';

  return { items, oil: oilSuggested, oilSuggested, fried: raw.cooking === 'fritto', asPlanned, engineMatch, dishName, dropped };
}

// ───────────────────────── Valori della scheda ─────────────────────────

export interface DraftValues {
  /** Valori del motore (kcal all'unità, grammi a un decimale): sono quelli che si salvano. */
  nutrients: Nutrients;
  vegPortions: number;
  /** Kcal da mostrare, arrotondate a 10. */
  kcalShown: number;
  /** Intervallo da mostrare con un alimento incerto che pesa: «circa 820 kcal (620-1.020)». */
  range: { low: number; high: number } | null;
  /** Olio della domanda e olio assorbito nella frittura, in grammi. */
  oilG: number;
  friedOilG: number;
  /** Alimenti senza valori: la scheda chiede di sceglierli dall'archivio o di toglierli. */
  unresolved: number;
}

/** Kcal arrotondate a 10 (incertezza dichiarata, § 7.3). */
export function roundKcal10(kcal: number): number {
  return Number.isFinite(kcal) && kcal > 0 ? Math.round(kcal / 10) * 10 : 0;
}

/** Olio assorbito nella frittura: 8% dei grammi degli alimenti dell'archivio (non condimenti). */
export function friedOilGrams(items: readonly EstimatedItem[]): number {
  const g = items.filter((i) => i.foodId && FOODS[i.foodId] && i.role !== 'condimento').reduce((s, i) => s + i.grams, 0);
  return Math.round(g * FRIED_OIL_SHARE);
}

/**
 * Alimenti da salvare: quelli della scheda in forma compatta (senza chiave né confidenza, solo quelli con i valori),
 * più l'olio della domanda e quello assorbito nella frittura in un solo alimento «condimento».
 */
export function draftItems(draft: Pick<EstimateDraft, 'items' | 'oil' | 'fried'>): EstimatedItem[] {
  const out: EstimatedItem[] = [];
  for (const d of draft.items.slice(0, DRAFT_ITEMS_MAX)) {
    if (!itemResolved(d)) continue;
    const item = normalizeEstimatedItem({ foodId: d.foodId, label: d.label, per100g: d.per100g, grams: d.grams, role: d.role });
    if (item) out.push(item);
  }
  const oil = OIL_GRAMS[draft.oil ?? 'niente'] + (draft.fried ? friedOilGrams(out) : 0);
  if (oil > 0) out.push({ foodId: OIL_FOOD_ID, grams: clampN(oil, ITEM_GRAMS_MIN, ITEM_GRAMS_MAX), role: 'condimento' });
  return out;
}

/** Valori della scheda come li calcola il motore, con le kcal da mostrare e l'eventuale intervallo. */
export function draftValues(draft: Pick<EstimateDraft, 'items' | 'oil' | 'fried'>): DraftValues {
  const items = draftItems(draft);
  const { nutrients, vegPortions } = estimatedItemsValues(items);
  const resolved = draft.items.filter(itemResolved);
  const friedOilG = draft.fried ? friedOilGrams(resolved) : 0;
  const total = nutrients.kcal;
  const uncertain = total > 0 && draft.items.some((d) => d.confidence === 'bassa' && itemResolved(d) && itemKcal(d) > LOW_CONFIDENCE_SHARE * total);
  const shown = roundKcal10(total);
  const range = uncertain
    ? { low: Math.ceil((shown * (1 - RANGE_SHARE)) / 10) * 10, high: Math.floor((shown * (1 + RANGE_SHARE)) / 10) * 10 }
    : null;
  return {
    nutrients,
    vegPortions,
    kcalShown: shown,
    range,
    oilG: OIL_GRAMS[draft.oil ?? 'niente'],
    friedOilG,
    unresolved: draft.items.length - resolved.length,
  };
}

/** Controllo delle kcal di un pasto: oltre il tetto non si segna, fuori dalla fascia abituale si chiede di controllare. */
export function kcalCheck(kcal: number): 'ok' | 'alto' | 'basso' | 'oltre' {
  if (kcal > MEAL_KCAL_MAX) return 'oltre';
  if (kcal > MEAL_KCAL_HIGH) return 'alto';
  if (kcal < MEAL_KCAL_LOW) return 'basso';
  return 'ok';
}

/** Il pasto stimato da una foto, pronto per `setEatenMeal`. */
export function draftMeal(draft: EstimateDraft, label = draft.dishName): EatenMeal {
  const items = draftItems(draft);
  const { nutrients, vegPortions } = estimatedItemsValues(items);
  return compact<EatenMeal>({
    label: oneLine(label, DISH_LABEL_MAX) || 'Piatto',
    nutrients,
    vegPortions,
    source: 'foto',
    items,
    oil: draft.oil ?? undefined,
    asPlanned: draft.asPlanned ? true : undefined,
  });
}

// ───────────────────────── Scheda: grammi e porzioni ─────────────────────────

/** Passi dei grammi nella scheda: 10 g sotto i 100 g, 25 g sopra; mai sotto 5 g né sopra 1.500. */
export function stepGrams(value: number, dir: 1 | -1): number {
  const step = dir > 0 ? (value < 100 ? 10 : 25) : value <= 100 ? 10 : 25;
  return clampN(value + dir * step, GRAMS_ROUND, ITEM_GRAMS_MAX);
}

type HandUnit = Exclude<PortionUnit, 'g' | 'ml'>;
/** Unità a mano preferite per dire una porzione, in ordine. */
const HAND_UNITS: readonly HandUnit[] = ['palmo', 'pugno', 'mano a coppa', 'fetta', 'vasetto', 'tazza', 'bicchiere', 'manciata', 'cucchiaio', 'cucchiaino', 'pollice', 'pezzo'];

/**
 * Porzione a mano di un alimento per i grammi della scheda («1 pugno e mezzo»), come nelle ricette (`portionPhrase`).
 * Solo per gli alimenti con un'unità a mano; a pezzi solo quelli con le parole dell'alimento (mai «pezzo»). Null
 * altrimenti, o fuori da mezza unità e 12 unità.
 */
export function portionHint(item: Pick<EstimatedItem, 'foodId' | 'grams'>): string | null {
  const food = estimateFoodById(item.foodId);
  if (!food || !(item.grams > 0)) return null;
  for (const unit of HAND_UNITS) {
    const g = food.unitGrams[unit];
    if (!g || g <= 0) continue;
    if (unit === 'pezzo' && !PIECE_WORDS[food.id]) continue;
    const qty = item.grams / g;
    if (qty < 0.4 || qty > 12) continue;
    return portionPhrase(qty, unit, food.id);
  }
  return null;
}

// ───────────────────────── Diario ─────────────────────────

const lowerFirst = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * Dettaglio della voce di un pasto con una stima (§ 11.2): «Dalla foto · 720 kcal», «Il mio piatto: pasta al pesto ·
 * 640 kcal». Il bar resta com'è: null.
 */
export function estimateDetail(meal: Pick<EatenMeal, 'source' | 'label' | 'nutrients'>): string | null {
  const kcal = fmtKcal(roundKcal10(meal.nutrients?.kcal ?? 0));
  if (meal.source === 'foto') return `Dalla foto · ${kcal}`;
  if (meal.source === 'piatto') return `Il mio piatto: ${lowerFirst(oneLine(meal.label, DISH_LABEL_MAX))} · ${kcal}`;
  return null;
}
