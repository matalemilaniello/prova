import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chance, intBelow, mulberry32, pick, seedOf, shuffled } from './rng';

describe('generatore con seme', () => {
  it('stesso seme, stessa sequenza; semi diversi, sequenze diverse', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const sa = Array.from({ length: 20 }, a);
    const sb = Array.from({ length: 20 }, b);
    const sc = Array.from({ length: 20 }, c);
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('numeri in [0, 1), distribuiti in modo ragionevole', () => {
    const r = mulberry32(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20_000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      buckets[Math.floor(x * 10)]++;
    }
    for (const n of buckets) expect(Math.abs(n - 2000)).toBeLessThan(250);
  });

  it('la sequenza è fissata: un cambio dell’algoritmo cambierebbe i menù generati', () => {
    const r = mulberry32(1);
    // Valori di riferimento di mulberry32 con seme 1 (× 10^9, arrotondati).
    expect([r(), r(), r()].map((x) => Math.round(x * 1e9))).toEqual([627073941, 2735721, 527447040]);
  });

  it('semi non numerici o infiniti valgono 0, senza eccezioni', () => {
    expect(Array.from({ length: 3 }, mulberry32(Number.NaN))).toEqual(Array.from({ length: 3 }, mulberry32(0)));
    expect(Array.from({ length: 3 }, mulberry32(Number.POSITIVE_INFINITY))).toEqual(Array.from({ length: 3 }, mulberry32(0)));
  });
});

describe('seme dagli ingressi', () => {
  it('l’ordine delle chiavi non conta, quello delle parti sì', () => {
    expect(seedOf('2026-11-16', { b: 1, a: 2 }, 0)).toBe(seedOf('2026-11-16', { a: 2, b: 1 }, 0));
    expect(seedOf('2026-11-16', 'x')).not.toBe(seedOf('x', '2026-11-16'));
    expect(seedOf('2026-11-16', 'impronta', ['tonno'], 0)).not.toBe(seedOf('2026-11-16', 'impronta', ['tonno'], 1));
    expect(seedOf()).toBe(seedOf());
    expect(Number.isInteger(seedOf('a'))).toBe(true);
    expect(seedOf('a')).toBeGreaterThanOrEqual(0);
  });
});

describe('operazioni', () => {
  it('shuffled è una permutazione, deterministica, e non tocca l’elenco', () => {
    const items = Object.freeze(Array.from({ length: 30 }, (_, i) => i));
    const s1 = shuffled(items, mulberry32(seedOf('menu', 1)));
    const s2 = shuffled(items, mulberry32(seedOf('menu', 1)));
    expect(s1).toEqual(s2);
    expect([...s1].sort((a, b) => a - b)).toEqual([...items]);
    expect(s1).not.toEqual([...items]);
    expect(shuffled([], mulberry32(1))).toEqual([]);
  });

  it('intBelow, pick e chance restano nei limiti', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const k = intBelow(r, 7);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(7);
    }
    expect(intBelow(r, 0)).toBe(0);
    expect(intBelow(r, Number.NaN)).toBe(0);
    expect(intBelow(() => 0.9999999999, 3)).toBe(2);
    expect(pick([], r)).toBeUndefined();
    expect(['a', 'b']).toContain(pick(['a', 'b'], r));
    expect(chance(r, 0)).toBe(false);
    expect(chance(r, 1)).toBe(true);
    expect(chance(r, Number.NaN)).toBe(false);
    let yes = 0;
    for (let i = 0; i < 10_000; i++) if (chance(r, 0.1)) yes++;
    expect(Math.abs(yes - 1000)).toBeLessThan(150);
  });

  it('il modulo non legge l’orologio e non usa Math.random', () => {
    const src = readFileSync(fileURLToPath(new URL('./rng.ts', import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/Date\.now\s*\(/);
    expect(src).not.toMatch(/new Date\s*\(\s*\)/);
    expect(src).not.toMatch(/Math\.random/);
  });
});
