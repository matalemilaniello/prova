/**
 * Date e orari locali.
 *
 * Regole:
 * - una data è sempre 'YYYY-MM-DD' locale: mai `new Date('YYYY-MM-DD')`, che è UTC;
 * - le date si costruiscono a mezzogiorno locale, così l'ora legale non sposta mai il giorno;
 * - gli orari 'HH:MM' vivono su un orologio di 24 ore che si chiude a mezzanotte.
 */
import type { HHMM, ISODate, Weekday } from '../domain/types';

const MS_DAY = 86_400_000;
const DAY_MIN = 1440;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Data locale → 'YYYY-MM-DD'. */
export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ───────────────────────── Orologio ─────────────────────────

let nowProvider: (() => Date) | null = null;

/**
 * Sostituisce l'orologio (solo per anteprime e screenshot: ?today=YYYY-MM-DD e ?now=HH:MM).
 * Passa null per tornare all'ora reale. I test non lo usano: passano la data esplicitamente.
 */
export function setNowProvider(fn: (() => Date) | null): void {
  nowProvider = fn;
}

/** Adesso (rispetta l'eventuale orologio sostituito). */
export function currentDate(): Date {
  return nowProvider ? nowProvider() : new Date();
}

/** Oggi, in ora locale. */
export function todayISO(now: Date = currentDate()): ISODate {
  return toISO(now);
}

/** True se la stringa è una data 'YYYY-MM-DD' valida. */
export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** 'YYYY-MM-DD' → Date locale a mezzogiorno (sicura rispetto all'ora legale). */
export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/** Numero del giorno nel calendario civile, indipendente dal fuso e dall'ora legale. */
function dayNumber(s: ISODate): number {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / MS_DAY);
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Giorni da `a` a `b` (positivo se `b` è dopo `a`). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return dayNumber(b) - dayNumber(a);
}

/** 0 = lunedì … 6 = domenica. */
export function weekdayOf(iso: ISODate): Weekday {
  return ((fromISO(iso).getDay() + 6) % 7) as Weekday;
}

/** Lunedì della settimana che contiene `iso`. */
export function weekStart(iso: ISODate): ISODate {
  return addDays(iso, -weekdayOf(iso));
}

/** I 7 giorni da lunedì a domenica a partire da un lunedì (o da qualunque giorno: si allinea al lunedì). */
export function weekDates(weekStartIso: ISODate): ISODate[] {
  const monday = weekStart(weekStartIso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Settimane intere tra la settimana di `startIso` e quella di `iso` (0 = stessa settimana; negativo se prima). */
export function weekIndexSince(startIso: ISODate, iso: ISODate): number {
  return Math.floor(daysBetween(weekStart(startIso), weekStart(iso)) / 7);
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Date da `from` a `to` comprese. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const n = daysBetween(from, to);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

// ───────────────────────── Formattazione delle date ─────────────────────────

const fmtShortMonth = new Intl.DateTimeFormat('it-IT', { month: 'short' });
const fmtWeekdayLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long' });
const fmtWeekdayShort = new Intl.DateTimeFormat('it-IT', { weekday: 'short' });
const fmtMonthLong = new Intl.DateTimeFormat('it-IT', { month: 'long' });

const clean = (s: string) => s.replace(/\.$/, '').replace(/\s+/g, ' ').trim();

/** Indicatore ordinale maschile: in italiano il primo del mese si scrive "1º" ("domenica 1º novembre"). */
export const ORDINAL_FIRST = '1º';

/** Numero del giorno come si scrive in una data: "1º", "2", … "31". */
export function dayOfMonthLabel(n: number): string {
  return n === 1 ? ORDINAL_FIRST : String(n);
}

/** "martedì 10 novembre", "domenica 1º novembre" */
export function formatDayLong(iso: ISODate): string {
  const d = fromISO(iso);
  return `${fmtWeekdayLong.format(d)} ${dayOfMonthLabel(d.getDate())} ${fmtMonthLong.format(d)}`;
}

/** "10 nov", "1º nov" */
export function formatShort(iso: ISODate): string {
  const d = fromISO(iso);
  return `${dayOfMonthLabel(d.getDate())} ${clean(fmtShortMonth.format(d))}`;
}

/** "martedì" */
export function formatWeekday(iso: ISODate): string {
  return fmtWeekdayLong.format(fromISO(iso));
}

/** "mar" */
export function formatWeekdayShort(iso: ISODate): string {
  return clean(fmtWeekdayShort.format(fromISO(iso)));
}

/** "Martedì 10", "Domenica 1º": titolo della giornata. */
export function formatDayTitle(iso: ISODate): string {
  const w = formatWeekday(iso);
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${dayOfMonthLabel(fromISO(iso).getDate())}`;
}

/** "novembre" */
export function formatMonth(iso: ISODate): string {
  return fmtMonthLong.format(fromISO(iso));
}

/**
 * Settimana compatta per etichette e titoli: "9-15 novembre", "26 ottobre-1º novembre" (trattino senza spazi,
 * come negli intervalli di numeri). Nelle frasi usa `formatWeekSpan`.
 */
export function formatWeekRange(weekStartIso: ISODate): string {
  const a = fromISO(weekStart(weekStartIso));
  const b = fromISO(addDays(weekStart(weekStartIso), 6));
  if (a.getMonth() === b.getMonth()) return `${dayOfMonthLabel(a.getDate())}-${b.getDate()} ${fmtMonthLong.format(b)}`;
  return `${dayOfMonthLabel(a.getDate())} ${fmtMonthLong.format(a)}-${dayOfMonthLabel(b.getDate())} ${fmtMonthLong.format(b)}`;
}

/** Davanti a 8 e 11 (e 80-89, per i numeri in genere) la preposizione si elide: "dall’8", "all’11". */
const elides = (n: number) => n === 8 || n === 11;

/**
 * Settimana in una frase: "dal 9 al 15 novembre", "dal 26 ottobre al 1º novembre", "dall’8 al 14 marzo",
 * "dal 5 all’11 aprile".
 */
export function formatWeekSpan(weekStartIso: ISODate): string {
  const a = fromISO(weekStart(weekStartIso));
  const b = fromISO(addDays(weekStart(weekStartIso), 6));
  const from = `${elides(a.getDate()) ? 'dall’' : 'dal '}${dayOfMonthLabel(a.getDate())}`;
  const to = `${elides(b.getDate()) ? 'all’' : 'al '}${dayOfMonthLabel(b.getDate())}`;
  if (a.getMonth() === b.getMonth()) return `${from} ${to} ${fmtMonthLong.format(b)}`;
  return `${from} ${fmtMonthLong.format(a)} ${to} ${fmtMonthLong.format(b)}`;
}

/** "oggi", "ieri", "domani", altrimenti "martedì 10 novembre". */
export function formatRelativeDay(iso: ISODate, today: ISODate = todayISO()): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'oggi';
  if (diff === -1) return 'ieri';
  if (diff === 1) return 'domani';
  return formatDayLong(iso);
}

// ───────────────────────── Orari ─────────────────────────

/** True se la stringa è un orario 'HH:MM' valido. */
export function isHHMM(s: unknown): s is HHMM {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** 'HH:MM' → minuti dalla mezzanotte (0-1439). */
export function hhmmToMin(t: HHMM): number {
  const [h, m] = t.split(':').map(Number);
  return ((((h || 0) * 60 + (m || 0)) % DAY_MIN) + DAY_MIN) % DAY_MIN;
}

/** Minuti → 'HH:MM', chiudendo sulle 24 ore (anche con valori negativi o oltre mezzanotte). */
export function minToHHMM(min: number): HHMM {
  const m = ((Math.round(min) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** Somma minuti a un orario, attraversando la mezzanotte. */
export function addMinutes(t: HHMM, m: number): HHMM {
  return minToHHMM(hhmmToMin(t) + m);
}

/** Minuti da `a` a `b` andando avanti nel tempo: 23:30 → 07:15 = 465. Stesso orario = 0. */
export function minutesBetween(a: HHMM, b: HHMM): number {
  return (hhmmToMin(b) - hhmmToMin(a) + DAY_MIN) % DAY_MIN;
}

/**
 * Minuti "notturni": gli orari prima di mezzogiorno contano come dopo la mezzanotte (+24 h),
 * così 00:45 viene dopo 23:30. Serve per confrontare orari di andata a letto.
 */
export function nightMinutes(t: HHMM): number {
  const m = hhmmToMin(t);
  return m < 12 * 60 ? m + DAY_MIN : m;
}

/** Differenza con segno tra due orari serali (b − a), robusta attorno alla mezzanotte. */
export function nightDiff(a: HHMM, b: HHMM): number {
  return nightMinutes(b) - nightMinutes(a);
}

/** Orario attuale 'HH:MM'. */
export function nowHHMM(now: Date = currentDate()): HHMM {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

/** Minuti dalla mezzanotte, ora. */
export function nowMinutes(now: Date = currentDate()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Ordina per orario 'HH:MM' (stabile). */
export function compareHHMM(a: HHMM, b: HHMM): number {
  return hhmmToMin(a) - hhmmToMin(b);
}
