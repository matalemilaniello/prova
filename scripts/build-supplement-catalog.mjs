#!/usr/bin/env node
/**
 * Genera `src/data/supplementCatalog.ts` da `scripts/data/supplement-catalog.json` (la fonte di verità).
 *
 * È la versione corta del catalogo per l'app: nome, altri nomi per la ricerca, dose predefinita, altre dosi, pasto,
 * giudizio e tetto giornaliero. I testi lunghi e le fonti restano nel JSON e in docs/fase2/catalogo-integratori.md.
 *
 *   node scripts/build-supplement-catalog.mjs          scrive il file
 *   node scripts/build-supplement-catalog.mjs --check  esce con 1 se il file non è aggiornato
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(readFileSync(join(root, 'scripts/data/supplement-catalog.json'), 'utf8'));
const out = join(root, 'src/data/supplementCatalog.ts');

const dose = (d) => (d && typeof d.amount === 'number' ? { amount: d.amount, unit: d.unit } : null);

/** Tetto al giorno: il più basso tra il massimo italiano per gli integratori e il limite superiore, nella stessa unità. */
function maxOf(e) {
  const cands = [e.itMax, e.upperLimit].map(dose).filter((d) => d && d.unit === e.unit);
  if (!cands.length) return null;
  return cands.reduce((a, b) => (b.amount < a.amount ? b : a));
}

const entries = src.map((e) => {
  const def = dose(e.defaultDose);
  const options = (e.doseOptions ?? []).map(dose).filter(Boolean);
  const max = maxOf(e);
  return {
    id: e.id,
    name: e.name,
    aliases: e.aliases ?? [],
    stance: e.stance,
    timing: e.timing,
    dose: def,
    ...(options.length > 1 ? { options } : {}),
    ...(max ? { max } : {}),
    ...(e.needsTest?.required ? { needsTest: true } : {}),
  };
});

const body = `/**
 * Catalogo corto degli integratori: generato da scripts/build-supplement-catalog.mjs, non si modifica a mano.
 * Fonte: scripts/data/supplement-catalog.json (testi e fonti in docs/fase2/catalogo-integratori.md).
 */
import type { DoseUnit, Supplement } from '../domain/types';

export type CatalogStance = 'utile' | 'situazionale' | 'su-indicazione' | 'non-serve' | 'sconsigliato';

export interface CatalogDose {
  amount: number;
  unit: DoseUnit;
}

export interface CatalogEntry {
  id: string;
  name: string;
  /** Altri nomi con cui si cerca (sigle, nomi inglesi, forme). */
  aliases: readonly string[];
  /** Giudizio del catalogo: utile, dipende dalla situazione, solo su indicazione, non serve, sconsigliato. */
  stance: CatalogStance;
  timing: Supplement['timing'];
  /** Dose predefinita al giorno. */
  dose: CatalogDose;
  /** Altre dosi tra cui scegliere (compresa la predefinita). */
  options?: readonly CatalogDose[];
  /** Tetto al giorno per un integratore, nella stessa unità della dose. */
  max?: CatalogDose;
  /** Serve un esame prima di prenderlo. */
  needsTest?: boolean;
}

export const SUPPLEMENT_CATALOG: readonly CatalogEntry[] = ${JSON.stringify(entries, null, 2)};
`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    /* manca */
  }
  if (current !== body) {
    console.error('src/data/supplementCatalog.ts non è aggiornato: lancia node scripts/build-supplement-catalog.mjs');
    process.exit(1);
  }
  console.log(`Catalogo aggiornato: ${entries.length} voci.`);
} else {
  writeFileSync(out, body);
  console.log(`Scritte ${entries.length} voci in src/data/supplementCatalog.ts`);
}
