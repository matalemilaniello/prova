import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOG_ID_LIST, CATALOG_IDS, CATALOG_VERSION, isCatalogId } from './supplementCatalogIds';

const CATALOG = fileURLToPath(new URL('../../scripts/data/supplement-catalog.json', import.meta.url));

describe('id del catalogo degli integratori', () => {
  it('il catalogo sorgente è nel repository', () => {
    expect(existsSync(CATALOG)).toBe(true);
  });

  it('CATALOG_IDS coincide con gli id del JSON, nello stesso ordine e senza doppioni', () => {
    const raw = JSON.parse(readFileSync(CATALOG, 'utf8')) as unknown;
    expect(Array.isArray(raw)).toBe(true);
    const ids = (raw as { id?: unknown }[]).map((e) => e.id);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(CATALOG_ID_LIST).toEqual(ids);
    expect(CATALOG_IDS.size).toBe(ids.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('riconosce solo gli id del catalogo', () => {
    expect(CATALOG_VERSION).toBe(1);
    expect(isCatalogId('vitamina-d')).toBe(true);
    expect(isCatalogId('omega-3')).toBe(true);
    expect(isCatalogId('omega3')).toBe(false);
    expect(isCatalogId('')).toBe(false);
    expect(isCatalogId(3)).toBe(false);
  });
});
