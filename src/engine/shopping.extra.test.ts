/** «Da comprare in più» (docs/FASE2.md § 5.3): prodotti nuovi e prodotti che salgono di almeno una confezione. */
import { describe, expect, it } from 'vitest';
import type { MenuWeek } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import { MENU_ROTATION } from '../data/menu';
import { shoppingExtra, shoppingList } from './shopping';

describe('shoppingExtra', () => {
  const p = defaultPlan('2026-11-09');
  const before = shoppingList('2026-11-16', { plan: p, dayLogs: {} });

  it('nessun cambio, niente in più', () => {
    expect(shoppingExtra(before, before)).toEqual([]);
  });

  it('un prodotto nuovo c’è, uno che sale di una confezione anche; le chiavi sono gli id degli alimenti', () => {
    const w = JSON.parse(JSON.stringify(MENU_ROTATION[1])) as MenuWeek;
    w.days[1].meals.merenda = 'yogurt-cachi-mandorle';
    w.days[4].meals.merenda = 'yogurt-cachi-mandorle';
    const after = shoppingList('2026-11-16', { plan: { ...p, menus: { '2026-11-16': w } }, dayLogs: {} });
    const extra = shoppingExtra(before, after);
    const keys = extra.map((e) => e.item.key);
    expect(keys).toContain('cachi');
    expect(keys).toContain('mandorle');
    expect(extra.find((e) => e.item.key === 'cachi')?.before).toBeUndefined();
    for (const e of extra) if (e.before) expect(e.item.buyG).toBeGreaterThan(e.before.buyG);
    // Il cacao e la pera della merenda tolta non sono «in più».
    expect(keys).not.toContain('cacao');
  });
});
