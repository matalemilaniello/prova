/**
 * Parametri dell'URL per anteprime e screenshot:
 * ?demo=1 · ?theme=scuro|chiaro (anche dark|light) · ?overlay=recipe|checkin|session|football|barPlanB · ?onboarding=1 ·
 * ?tab=… · ?today=YYYY-MM-DD · ?now=HH:MM
 */
import { useMemo } from 'react';

function search(): URLSearchParams {
  try {
    const s = new URLSearchParams(location.search);
    // Anche dopo l'hash: '#settimana?tab=spesa'.
    const q = location.hash.indexOf('?');
    if (q !== -1) new URLSearchParams(location.hash.slice(q + 1)).forEach((v, k) => s.set(k, v));
    return s;
  } catch {
    return new URLSearchParams();
  }
}

export function getUrlParam(name: string): string | null {
  return search().get(name);
}

/** Valore del parametro all'apertura della pagina (non reattivo). */
export function useUrlParam(name: string): string | null {
  return useMemo(() => getUrlParam(name), [name]);
}
