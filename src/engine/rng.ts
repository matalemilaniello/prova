/**
 * Caso con seme per i motori (docs/FASE2.md § 1.3, P4): stessi ingressi, stessi risultati.
 *
 * I motori non usano mai `Math.random`: quando una scelta va mescolata (l'ordine dei vicini nella ricerca del menù,
 * § 4.10, o le alternative a parità di costo) ricevono un generatore costruito da un seme che dipende solo dagli
 * ingressi, per esempio `mulberry32(seedOf(lunedì, impronta del piano, esclusioni, attempt))`.
 *
 * - `mulberry32(seed)`: generatore a 32 bit, veloce e con un periodo di 2^32, più che sufficiente per qualche migliaio
 *   di valutazioni. Restituisce numeri in [0, 1).
 * - `seedOf(...parti)`: seme da qualunque valore serializzabile; l'ordine delle chiavi degli oggetti non conta,
 *   l'ordine delle parti sì.
 * - `shuffled`, `pick`, `intBelow`, `chance`: le operazioni di tutti i giorni, senza toccare gli argomenti.
 */
import { hashString } from '../lib/id';
import { stableStringify } from './plan/proposals';

/** Generatore di numeri in [0, 1). */
export type Rng = () => number;

/** Generatore mulberry32: stesso seme, stessa sequenza. */
export function mulberry32(seed: number): Rng {
  let a = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seme a 32 bit dalle parti (date, impronte, elenchi, tentativi): JSON stabile, poi FNV-1a. */
export function seedOf(...parts: unknown[]): number {
  return hashString(stableStringify(parts));
}

/** Intero in [0, n): 0 se n non è un intero positivo. */
export function intBelow(rng: Rng, n: number): number {
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(Math.floor(n) - 1, Math.floor(rng() * Math.floor(n)));
}

/** Vero con probabilità p (tra 0 e 1). */
export function chance(rng: Rng, p: number): boolean {
  if (!(p > 0)) return false;
  if (p >= 1) return true;
  return rng() < p;
}

/** Copia mescolata (Fisher-Yates): l'elenco di partenza non cambia. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = intBelow(rng, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Un elemento a caso, o undefined da un elenco vuoto. */
export function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  return items.length ? items[intBelow(rng, items.length)] : undefined;
}
