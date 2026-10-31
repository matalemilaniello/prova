import { describe, expect, it } from 'vitest';
import { fmtClock, fmtDelta, fmtHours, fmtKcal, fmtKg, fmtMinutes, fmtNumber, fmtPercent, listIt, plural } from './format';

const nb = (s: string) => s.replace(/ /g, ' ');

describe('formattatori italiani', () => {
  it('migliaia con il punto anche a 4 cifre, decimali con la virgola', () => {
    expect(fmtNumber(2600)).toBe('2.600');
    expect(fmtNumber(12500)).toBe('12.500');
    expect(fmtNumber(950)).toBe('950');
    expect(fmtNumber(70.25, 1)).toBe('70,3');
    expect(fmtNumber(70, 1, true)).toBe('70,0');
    expect(fmtNumber(-1200)).toBe('−1.200');
  });

  it('unità', () => {
    expect(nb(fmtKcal(2600))).toBe('2.600 kcal');
    expect(nb(fmtKg(70.2))).toBe('70,2 kg');
    expect(fmtPercent(0.724)).toBe('72%');
  });

  it('ore e minuti', () => {
    expect(nb(fmtHours(6 + 40 / 60))).toBe('6 h 40');
    expect(nb(fmtHours(7))).toBe('7 h');
    expect(nb(fmtHours(0.5))).toBe('30 min');
    expect(nb(fmtMinutes(80))).toBe('1 h 20');
    expect(nb(fmtMinutes(65))).toBe('1 h 05');
    expect(fmtClock(90)).toBe('1:30');
  });

  it('variazioni con il segno tipografico', () => {
    expect(nb(fmtDelta(0.4, 'kg'))).toBe('+0,4 kg');
    expect(nb(fmtDelta(-0.3, 'kg'))).toBe('−0,3 kg');
    expect(nb(fmtDelta(0.04, 'kg'))).toBe('0 kg');
    expect(fmtDelta(18, '%', 0)).toBe('+18%');
  });

  it('plurali ed elenchi', () => {
    expect(plural(1, 'bicchiere', 'bicchieri')).toBe('1 bicchiere');
    expect(plural(3, 'bicchiere', 'bicchieri')).toBe('3 bicchieri');
    expect(listIt(['a', 'b', 'c'])).toBe('a, b e c');
    expect(listIt(['a'])).toBe('a');
  });
});
