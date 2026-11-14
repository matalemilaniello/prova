import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { SUPPLEMENT_CATALOG } from '../data/supplementCatalog';
import { CATALOG_ID_LIST } from '../data/supplementCatalogIds';
import { commonEntries, doseChoices, formatDose, fromCatalog, overMax, searchCatalog } from './supplements';

const byId = (id: string) => SUPPLEMENT_CATALOG.find((e) => e.id === id)!;

describe('catalogo corto degli integratori', () => {
  it('è generato dal JSON ed è aggiornato', () => {
    expect(() => execFileSync('node', ['scripts/build-supplement-catalog.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
    expect(SUPPLEMENT_CATALOG.map((e) => e.id)).toEqual([...CATALOG_ID_LIST]);
  });

  it('ogni voce ha una dose predefinita che sta tra le sue dosi e non supera il tetto', () => {
    for (const e of SUPPLEMENT_CATALOG) {
      expect(e.dose.amount, e.id).toBeGreaterThan(0);
      expect(doseChoices(e).some((d) => d.amount === e.dose.amount && d.unit === e.dose.unit), e.id).toBe(true);
      expect(overMax(e, e.dose), e.id).toBe(false);
    }
  });

  it('la vitamina D parte da 15 µg, con 25 µg tra le dosi', () => {
    const d = byId('vitamina-d');
    expect(formatDose(d.dose)).toBe('15 µg');
    expect(doseChoices(d).map(formatDose)).toContain('25 µg');
    expect(overMax(d, { amount: 100, unit: 'µg' })).toBe(true);
  });
});

describe('ricerca', () => {
  it('trova per nome, per sigla e senza accenti; il nome vale più di un altro nome', () => {
    expect(searchCatalog('crea', SUPPLEMENT_CATALOG)[0].entry.id).toBe('creatina');
    expect(searchCatalog('D3', SUPPLEMENT_CATALOG)[0].entry.id).toBe('vitamina-d');
    expect(searchCatalog('MAGNESIO', SUPPLEMENT_CATALOG)[0].entry.id).toBe('magnesio');
    expect(searchCatalog('vitamina', SUPPLEMENT_CATALOG, 3)).toHaveLength(3);
  });

  it('sotto i due caratteri e senza corrispondenze non dà niente', () => {
    expect(searchCatalog('c', SUPPLEMENT_CATALOG)).toEqual([]);
    expect(searchCatalog('zzzz', SUPPLEMENT_CATALOG)).toEqual([]);
  });
});

describe('dose e scheda', () => {
  it('scrive le dosi in italiano', () => {
    expect(formatDose({ amount: 3, unit: 'g' })).toBe('3 g');
    expect(formatDose({ amount: 2.5, unit: 'mg' })).toBe('2,5 mg');
    expect(formatDose({ amount: 1, unit: 'compressa' })).toBe('1 compressa');
    expect(formatDose({ amount: 2, unit: 'compressa' })).toBe('2 compresse');
    expect(formatDose({ amount: 1e10, unit: 'UFC' })).toBe('10 miliardi UFC');
    expect(formatDose({ amount: 1500, unit: 'mg' })).toBe('1.500 mg');
  });

  it('una voce scelta riempie nome, dose, pasto e legame con il catalogo', () => {
    const c = byId('creatina');
    expect(fromCatalog(c)).toEqual({ name: c.name, dose: '3 g', timing: c.timing, catalogId: 'creatina', amount: { amount: 3, unit: 'g' } });
    expect(fromCatalog(c, { amount: 5, unit: 'g' }).dose).toBe('5 g');
  });

  it('le voci proposte esistono tutte', () => {
    expect(commonEntries(SUPPLEMENT_CATALOG)).toHaveLength(6);
  });
});
