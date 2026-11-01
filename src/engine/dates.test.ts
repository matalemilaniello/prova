import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMinutes,
  dateRange,
  daysBetween,
  formatDayLong,
  formatDayTitle,
  formatShort,
  formatWeekRange,
  formatWeekSpan,
  fromISO,
  hhmmToMin,
  isHHMM,
  isISODate,
  minToHHMM,
  minutesBetween,
  nightDiff,
  nightMinutes,
  setNowProvider,
  toISO,
  todayISO,
  weekDates,
  weekIndexSince,
  weekStart,
  weekdayOf,
} from './dates';

describe('date locali', () => {
  it('fromISO e toISO sono inverse e non scivolano col fuso', () => {
    for (const d of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31', '2028-02-29']) {
      expect(toISO(fromISO(d))).toBe(d);
    }
  });

  it('addDays attraversa mesi, anni e cambi di ora legale', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    // Ora legale in Europa: 29 marzo e 25 ottobre 2026.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-10-26', -2)).toBe('2026-10-24');
  });

  it('daysBetween conta giorni di calendario anche con l’ora legale', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-11-10', '2026-11-03')).toBe(-7);
  });

  it('weekdayOf: 0 = lunedì, 6 = domenica', () => {
    expect(weekdayOf('2026-11-09')).toBe(0); // lunedì
    expect(weekdayOf('2026-11-10')).toBe(1);
    expect(weekdayOf('2026-11-15')).toBe(6); // domenica
  });

  it('weekStart è il lunedì, anche di domenica e a cavallo d’anno', () => {
    expect(weekStart('2026-11-15')).toBe('2026-11-09');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
    expect(weekStart('2026-03-29')).toBe('2026-03-23'); // domenica del cambio d'ora
  });

  it('weekDates restituisce 7 giorni dal lunedì', () => {
    const w = weekDates('2026-11-12');
    expect(w).toHaveLength(7);
    expect(w[0]).toBe('2026-11-09');
    expect(w[6]).toBe('2026-11-15');
  });

  it('weekIndexSince conta le settimane dall’inizio, anche prima (negativo)', () => {
    expect(weekIndexSince('2026-11-09', '2026-11-15')).toBe(0);
    expect(weekIndexSince('2026-11-09', '2026-11-16')).toBe(1);
    expect(weekIndexSince('2026-11-11', '2026-11-30')).toBe(3);
    expect(weekIndexSince('2026-11-09', '2026-11-08')).toBe(-1);
    expect(weekIndexSince('2026-03-23', '2026-03-30')).toBe(1);
  });

  it('dateRange e validazione', () => {
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(dateRange('2026-11-02', '2026-10-30')).toEqual([]);
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-1-01')).toBe(false);
    expect(isHHMM('23:59')).toBe(true);
    expect(isHHMM('24:00')).toBe(false);
  });

  it('formattazione italiana', () => {
    expect(formatDayLong('2026-11-10')).toBe('martedì 10 novembre');
    expect(formatDayTitle('2026-11-10')).toBe('Martedì 10');
    expect(formatShort('2026-11-10')).toBe('10 nov');
    expect(formatWeekRange('2026-11-09')).toBe('9-15 novembre');
    // Il primo del mese è "1º"; l'intervallo usa il trattino senza spazi.
    expect(formatWeekRange('2026-10-26')).toBe('26 ottobre-1º novembre');
    expect(formatWeekRange('2027-03-01')).toBe('1º-7 marzo');
    expect(formatDayLong('2026-11-01')).toBe('domenica 1º novembre');
    expect(formatDayTitle('2026-11-01')).toBe('Domenica 1º');
    expect(formatShort('2026-11-01')).toBe('1º nov');
    expect(formatShort('2026-12-21')).toBe('21 dic');
    // Nelle frasi: "dal … al …", con l'elisione davanti a 8 e 11.
    expect(formatWeekSpan('2026-11-09')).toBe('dal 9 al 15 novembre');
    expect(formatWeekSpan('2026-10-26')).toBe('dal 26 ottobre al 1º novembre');
    expect(formatWeekSpan('2027-03-08')).toBe('dall’8 al 14 marzo');
    expect(formatWeekSpan('2026-11-02')).toBe('dal 2 all’8 novembre');
    expect(formatWeekSpan('2027-01-11')).toBe('dall’11 al 17 gennaio');
  });

  it('todayISO rispetta l’orologio sostituito', () => {
    setNowProvider(() => new Date(2026, 10, 10, 23, 59));
    expect(todayISO()).toBe('2026-11-10');
    setNowProvider(null);
    expect(isISODate(todayISO())).toBe(true);
  });
});

describe('orari e mezzanotte', () => {
  it('hhmmToMin e minToHHMM chiudono sulle 24 ore', () => {
    expect(hhmmToMin('00:00')).toBe(0);
    expect(hhmmToMin('23:30')).toBe(1410);
    expect(minToHHMM(1410)).toBe('23:30');
    expect(minToHHMM(1440 + 45)).toBe('00:45');
    expect(minToHHMM(-15)).toBe('23:45');
  });

  it('addMinutes attraversa la mezzanotte in avanti e indietro', () => {
    expect(addMinutes('23:30', 45)).toBe('00:15');
    expect(addMinutes('00:15', -30)).toBe('23:45');
    expect(addMinutes('07:15', 5)).toBe('07:20');
  });

  it('minutesBetween va sempre avanti nel tempo', () => {
    expect(minutesBetween('23:30', '07:15')).toBe(465);
    expect(minutesBetween('00:45', '07:15')).toBe(390);
    expect(minutesBetween('07:15', '07:15')).toBe(0);
    expect(minutesBetween('21:00', '22:30')).toBe(90);
  });

  it('nightMinutes ordina gli orari serali dopo la mezzanotte', () => {
    expect(nightMinutes('00:45')).toBeGreaterThan(nightMinutes('23:30'));
    expect(nightDiff('23:30', '00:45')).toBe(75);
    expect(nightDiff('00:45', '00:30')).toBe(-15);
  });
});
