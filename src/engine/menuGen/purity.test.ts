/**
 * Motori puri (docs/FASE2.md § 13.2, test 6): il menù generato non legge l'orologio e non usa Math.random; il caso viene
 * dal generatore con seme (engine/rng.ts) e la data dagli ingressi.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('motori puri del menù (§ 13.2)', () => {
  it('engine/menuGen e i dati della preparazione non leggono l’orologio e non usano Math.random', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => `${dir}/${f}`);
    files.push(fileURLToPath(new URL('../../data/prepComponents.ts', import.meta.url)));
    files.push(fileURLToPath(new URL('../menu.ts', import.meta.url)));
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Date\.now\s*\(/);
      expect(src, f).not.toMatch(/new Date\s*\(\s*\)/);
      expect(src, f).not.toMatch(/Math\.random/);
      expect(src, f).not.toMatch(/performance\.now/);
    }
  });
});
