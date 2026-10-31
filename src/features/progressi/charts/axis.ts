import type { ISODate } from '../../../domain/types';
import { fromISO, weekdayOf } from '../../../engine/dates';
import { fmtDateShort } from '../../../lib/format';
import type { Geometry } from './frame';

const MONTH_SHORT = new Intl.DateTimeFormat('it-IT', { month: 'short' });

/** "ott", "nov" (senza punto). */
export function monthShort(iso: ISODate): string {
  return MONTH_SHORT.format(fromISO(iso)).replace(/\.$/, '');
}

/**
 * Etichette dei lunedì per un asse giornaliero ("12 ott"), tenute dentro il grafico e mai sovrapposte.
 */
export function mondayTicks(dates: ISODate[], xAt: (i: number) => number, geo: Geometry, minGap = 44) {
  const out: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[] = [];
  let lastX = -Infinity;
  dates.forEach((d, i) => {
    if (weekdayOf(d) !== 0) return;
    const x = xAt(i);
    if (x - lastX < minGap) return;
    const label = fmtDateShort(d);
    const half = label.length * 3.2;
    const anchor = x - half < geo.left - 8 ? 'start' : x + half > geo.right + 6 ? 'end' : 'middle';
    out.push({ x: anchor === 'start' ? Math.max(x - 2, geo.left - 8) : x, label, anchor });
    lastX = x;
  });
  return out;
}

/** Etichette compatte per le settimane: "5 ott", "12", "19", "26", "2 nov". */
export function weekLabel(iso: ISODate, prev: ISODate | null): string {
  const d = fromISO(iso);
  const showMonth = !prev || fromISO(prev).getMonth() !== d.getMonth();
  return showMonth ? `${d.getDate()} ${monthShort(iso)}` : String(d.getDate());
}
