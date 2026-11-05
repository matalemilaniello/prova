/**
 * Nomi delle sedute per le frasi (docs/FASE2.md § 3.1): con un blocco in vigore gli slot sono anche «K» (corsa o
 * condizionamento) e «R» (uscita facile), che non devono mai diventare «Seduta K». Modulo leggero: lo usano anche Oggi
 * e i pannelli, senza caricare il generatore dei blocchi.
 */
import type { ISODate, Plan } from '../../domain/types';
import { sessionFor, slotLabel } from '../../engine/plan/program';

/** Nome della seduta di uno slot nella data («Seduta B», «Corsa intermittente»), anche per gli slot del blocco. */
export function sessionName(slot: string, iso: ISODate, plan: Pick<Plan, 'program' | 'weekOverrides'> & Partial<Pick<Plan, 'season'>>): string {
  return sessionFor(slot, iso, plan)?.name ?? slotLabel(slot);
}

/** «la seduta B», «la corsa intermittente», «l’uscita facile»: il nome con l'articolo, per le frasi. */
export function sessionWithArticle(name: string): string {
  const lower = /^(Seduta|Corsa|Uscita|Intervalli)\b/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
  return /^[aeiouàèéìòù]/i.test(lower) ? `l’${lower}` : `la ${lower}`;
}
