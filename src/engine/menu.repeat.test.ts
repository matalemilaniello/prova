/**
 * Ripiego del lunedì (docs/FASE2.md § 4.10, § 13.4 test 57): senza approvazione si ripete l'ultima settimana approvata
 * delle 4 prima se è di stagione nel mese nuovo (`source: 'ripetuto'`), altrimenti la rotazione; il menù di avvio vince su
 * tutto; l'ultima approvata si cerca solo tra i lunedì già iniziati, mai tra i menù con decorrenza futura.
 */
import { describe, expect, it } from 'vitest';
import type { MenuWeek } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import { MENU_ROTATION } from '../data/menu';
import { mealsForDate, menuWeekFor, menuWeekInForce, menuWeekInSeason, prepInForce, repeatedMenuWeek } from './menu';

const p = defaultPlan('2026-11-09');
const week = (over: Partial<Record<number, Record<string, string>>> = {}): MenuWeek => {
  const w = JSON.parse(JSON.stringify(MENU_ROTATION[1])) as MenuWeek;
  for (const [d, meals] of Object.entries(over)) Object.assign(w.days[Number(d)].meals, meals);
  return w;
};

describe('ripetizione dell’ultima settimana approvata', () => {
  it('ripete per 4 settimane, poi torna la rotazione', () => {
    const approved = week();
    const plan = { ...p, menus: { '2026-11-16': approved } };
    for (const [iso, expected] of [
      ['2026-11-25', approved],
      ['2026-12-03', approved],
      ['2026-12-13', approved],
      ['2026-12-16', approved],
      ['2026-12-21', menuWeekFor('2026-12-21', p.startDate)],
    ] as const) {
      expect(menuWeekInForce(iso, plan), iso).toBe(expected);
    }
    expect(mealsForDate('2026-11-25', { plan, dayLogs: {} }).source).toBe('ripetuto');
    expect(mealsForDate('2026-11-18', { plan, dayLogs: {} }).source).toBe('approvato');
    expect(prepInForce('2026-11-23', plan)).toBe(approved.prep);
  });

  it('vale l’ultima approvata, la più recente tra le 4 settimane prima', () => {
    const older = week();
    const newer = week({ 1: { colazione: 'porridge-pera-cannella' } });
    const plan = { ...p, menus: { '2026-11-09': older, '2026-11-16': newer } };
    expect(menuWeekInForce('2026-11-23', plan)).toBe(newer);
  });

  it('un menù approvato con decorrenza futura non vale prima del suo lunedì', () => {
    const future = week();
    const plan = { ...p, menus: { '2026-11-30': future } };
    expect(menuWeekInForce('2026-11-25', plan)).toBe(menuWeekFor('2026-11-25', p.startDate));
    expect(repeatedMenuWeek('2026-11-23', plan)).toBeNull();
    expect(menuWeekInForce('2026-12-02', plan)).toBe(future);
  });

  it('con un fresco strict fuori stagione nel mese nuovo non si ripete: torna la rotazione', () => {
    // Le clementine finiscono a marzo: un menù di marzo con i mandarini non si ripete ad aprile.
    const withMandarins = week({ 1: { spuntino: 'yogurt-mandarini-noci' } });
    expect(menuWeekInSeason(withMandarins, 3)).toBe(true);
    expect(menuWeekInSeason(withMandarins, 4)).toBe(false);
    const plan = { ...defaultPlan('2026-03-02'), menus: { '2026-03-16': withMandarins } };
    expect(menuWeekInForce('2026-03-25', plan)).toBe(withMandarins);
    // La settimana del 30 marzo ha il mercoledì il 1º aprile: conta aprile, e i mandarini sono fuori stagione.
    expect(menuWeekInForce('2026-03-30', plan)).toBe(menuWeekFor('2026-03-30', plan.startDate));
    expect(menuWeekInForce('2026-04-08', plan)).toBe(menuWeekFor('2026-04-08', plan.startDate));
  });

  it('il menù di avvio vince anche sulla settimana ripetuta', () => {
    const approved = week();
    const plan = { ...p, firstUse: { date: '2026-11-24', time: '18:00' }, menus: { '2026-11-16': approved } };
    expect(mealsForDate('2026-11-25', { plan, dayLogs: {} }).source).toBe('avvio');
  });

  it('senza menù approvati niente cambia: la rotazione di sempre', () => {
    for (const iso of ['2026-11-09', '2026-11-18', '2026-12-30']) expect(menuWeekInForce(iso, p)).toBe(menuWeekFor(iso, p.startDate));
    expect(repeatedMenuWeek('2026-11-16', p)).toBeNull();
  });
});
