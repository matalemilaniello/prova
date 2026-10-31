/**
 * Formattatori italiani per l'interfaccia.
 * Numeri: "2.600 kcal", "70,2 kg", "6 h 40", "72%". Il segno meno è quello tipografico (−).
 */
import type { DayType, FootballKind, HHMM, ISODate, MealSlot, Weekday } from '../domain/types';
import { formatDayLong, formatDayTitle, formatShort, formatWeekdayShort, fromISO } from '../engine/dates';

const MINUS = '−';
const NBSP = ' ';

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number): Intl.NumberFormat {
  const key = `${min}:${max}`;
  let f = nfCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat('it-IT', {
        minimumFractionDigits: min,
        maximumFractionDigits: max,
        // In italiano Intl non raggruppa i numeri di 4 cifre ("2600"): l'interfaccia vuole "2.600".
        useGrouping: 'always' as unknown as boolean,
      });
    } catch {
      f = new Intl.NumberFormat('it-IT', { minimumFractionDigits: min, maximumFractionDigits: max });
    }
    nfCache.set(key, f);
  }
  return f;
}

/** Garantisce il separatore delle migliaia anche dove Intl non applica 'always'. */
function groupFix(s: string): string {
  return s.replace(/^(-?)(\d)(\d{3})(?=,|$)/, '$1$2.$3');
}

/**
 * Numero in formato italiano. `decimals` = cifre decimali massime (default 0);
 * `fixed` forza sempre quel numero di decimali.
 */
export function fmtNumber(n: number, decimals = 0, fixed = false): string {
  if (!Number.isFinite(n)) return '–';
  const s = groupFix(nf(fixed ? decimals : 0, decimals).format(n));
  return s.replace(/^-/, MINUS);
}

/** "2.600 kcal" */
export function fmtKcal(n: number): string {
  return `${fmtNumber(Math.round(n))}${NBSP}kcal`;
}

/** "70,2 kg" (un decimale fisso). */
export function fmtKg(n: number, decimals = 1): string {
  return `${fmtNumber(n, decimals, true)}${NBSP}kg`;
}

/** Carichi in palestra: "22,5 kg", "20 kg", "corpo libero" se 0. */
export function fmtLoad(n: number): string {
  if (!n) return 'corpo libero';
  return `${fmtNumber(n, 1)}${NBSP}kg`;
}

/** "135 g" */
export function fmtGrams(n: number): string {
  return `${fmtNumber(Math.round(n))}${NBSP}g`;
}

/** "2,5 l" */
export function fmtLiters(n: number): string {
  return `${fmtNumber(n, 1)}${NBSP}l`;
}

/** "84,5 cm" */
export function fmtCm(n: number): string {
  return `${fmtNumber(n, 1)}${NBSP}cm`;
}

/** 0,72 → "72%" */
export function fmtPercent(ratio: number, decimals = 0): string {
  if (!Number.isFinite(ratio)) return '–';
  return `${fmtNumber(ratio * 100, decimals)}%`;
}

/** Ore decimali → "6 h 40" (7 → "7 h", 0,5 → "30 min"). */
export function fmtHours(hours: number): string {
  if (!Number.isFinite(hours)) return '–';
  return fmtMinutes(Math.round(hours * 60));
}

/** Minuti → "1 h 20", "45 min", "2 h". */
export function fmtMinutes(totalMin: number): string {
  if (!Number.isFinite(totalMin)) return '–';
  const sign = totalMin < 0 ? MINUS : '';
  const m = Math.abs(Math.round(totalMin));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${sign}${r}${NBSP}min`;
  if (r === 0) return `${sign}${h}${NBSP}h`;
  return `${sign}${h}${NBSP}h ${String(r).padStart(2, '0')}`;
}

/** Secondi → "1:30" (timer di recupero). */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Variazione con segno: "+0,4 kg", "−0,3 kg", "0 kg". */
export function fmtDelta(n: number, unit = '', decimals = 1): string {
  if (!Number.isFinite(n)) return '–';
  const rounded = Number(n.toFixed(decimals));
  const body = fmtNumber(Math.abs(rounded), decimals);
  const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS : '';
  return `${sign}${body}${unit ? `${unit === '%' ? '' : NBSP}${unit}` : ''}`;
}

/** Orario: "07:30" (già nel formato giusto, normalizza solo). */
export function fmtTime(t: HHMM | undefined): string {
  if (!t) return '–';
  const [h, m] = t.split(':');
  return `${(h ?? '0').padStart(2, '0')}:${(m ?? '0').padStart(2, '0')}`;
}

/** "martedì 10 novembre" */
export function fmtDateLong(iso: ISODate): string {
  return formatDayLong(iso);
}

/** "10 nov" */
export function fmtDateShort(iso: ISODate): string {
  return formatShort(iso);
}

/** "mar 10" */
export function fmtDateCompact(iso: ISODate): string {
  return `${formatWeekdayShort(iso)} ${fromISO(iso).getDate()}`;
}

/** "Martedì 10" */
export function fmtDayTitle(iso: ISODate): string {
  return formatDayTitle(iso);
}

/** Prima lettera maiuscola. */
export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Singolare o plurale: plural(2, 'bicchiere', 'bicchieri') → "2 bicchieri". */
export function plural(n: number, one: string, many: string, withNumber = true): string {
  const word = n === 1 ? one : many;
  return withNumber ? `${fmtNumber(n)} ${word}` : word;
}

/** Elenco in italiano: ["a", "b", "c"] → "a, b e c". */
export function listIt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

// ───────────────────────── Etichette condivise ─────────────────────────

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  calcio: 'Calcio',
  palestra: 'Palestra',
  leggero: 'Leggero',
  riposo: 'Riposo',
};

export const DAY_TYPES: DayType[] = ['calcio', 'palestra', 'leggero', 'riposo'];

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  colazione: 'Colazione',
  spuntino: 'Spuntino',
  pranzo: 'Pranzo',
  merenda: 'Merenda',
  cena: 'Cena',
};

export const FOOTBALL_LABEL: Record<FootballKind, string> = {
  partita: 'Partita',
  calcetto: 'Calcetto',
  allenamento: 'Allenamento',
};

export const WEEKDAY_LONG: Record<Weekday, string> = {
  0: 'lunedì',
  1: 'martedì',
  2: 'mercoledì',
  3: 'giovedì',
  4: 'venerdì',
  5: 'sabato',
  6: 'domenica',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: 'lun',
  1: 'mar',
  2: 'mer',
  3: 'gio',
  4: 'ven',
  5: 'sab',
  6: 'dom',
};

/** Iniziali per strisce compatte: L M M G V S D. */
export const WEEKDAY_INITIAL: Record<Weekday, string> = {
  0: 'L',
  1: 'M',
  2: 'M',
  3: 'G',
  4: 'V',
  5: 'S',
  6: 'D',
};
