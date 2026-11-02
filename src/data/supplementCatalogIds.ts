/**
 * Id delle voci del catalogo degli integratori (docs/FASE2.md § 9.1), nell'ordine di
 * `scripts/data/supplement-catalog.json`, che resta la fonte di verità.
 *
 * Serve a `normalizeData` per riconoscere un `Supplement.catalogId` senza caricare il catalogo grande (§ 9.7). Scritto a
 * mano nell'onda 0 dal JSON; dall'onda 3A lo rigenera `scripts/build-supplement-catalog.mjs`. Il test
 * `supplementCatalogIds.test.ts` fallisce se non coincide con il JSON.
 */

/** Versione del catalogo: cambia quando cambiano dosi, limiti o voci (la revisione degli integratori torna). */
export const CATALOG_VERSION = 1;

/** Id delle 49 voci, in ordine di catalogo. */
export const CATALOG_ID_LIST: readonly string[] = [
  'vitamina-d', 'calcifediolo', 'vitamina-b1', 'vitamina-b2', 'niacina', 'acido-pantotenico', 'vitamina-b6',
  'biotina', 'acido-folico', 'vitamina-b12', 'complesso-b', 'vitamina-c', 'vitamina-e', 'vitamina-a',
  'beta-carotene', 'vitamina-k', 'multivitaminico', 'magnesio', 'zinco', 'rame', 'ferro', 'calcio', 'selenio',
  'iodio', 'potassio', 'omega-3', 'proteine-siero', 'caseina', 'proteine-vegetali', 'bcaa', 'creatina', 'caffeina',
  'beta-alanina', 'nitrati', 'bicarbonato', 'elettroliti', 'carboidrati-sport', 'collagene', 'citrullina', 'hmb',
  'zma', 'amarena', 'pre-workout', 'melatonina', 'ashwagandha', 'curcumina', 'glucosammina', 'probiotici',
  'gruppo-d-ais',
];

/** Insieme degli id del catalogo. */
export const CATALOG_IDS: ReadonlySet<string> = new Set(CATALOG_ID_LIST);

/** True se l'id è una voce del catalogo. */
export function isCatalogId(id: unknown): id is string {
  return typeof id === 'string' && CATALOG_IDS.has(id);
}
