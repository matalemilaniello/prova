/**
 * La sostituzione nel menù in vigore non dipende dalla spesa né da `dayCarbScale` (docs/FASE2.md § 6.4, § 13.5 test 23):
 * con un contatore di chiamate la catena resta strato 1 → strato 2 → `dayCarbScale`, mai indietro.
 */
import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ dayCarbScale: 0, shoppingList: 0 }));

vi.mock('./nutrition', async (importOriginal) => {
  const real = await importOriginal<typeof import('./nutrition')>();
  return {
    ...real,
    dayCarbScale: (...args: Parameters<typeof real.dayCarbScale>) => {
      calls.dayCarbScale++;
      return real.dayCarbScale(...args);
    },
  };
});

vi.mock('./shopping', async (importOriginal) => {
  const real = await importOriginal<typeof import('./shopping')>();
  return {
    ...real,
    shoppingList: (...args: Parameters<typeof real.shoppingList>) => {
      calls.shoppingList++;
      return real.shoppingList(...args);
    },
  };
});

import type { Plan } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import { mealsForDate, weekSubstitutions } from './menu';
import { dayCarbScale } from './nutrition';

const MON = '2026-11-09';

describe('profondità delle sostituzioni', () => {
  it('le sostituzioni non chiamano dayCarbScale né la spesa', () => {
    const p: Plan = { ...defaultPlan(MON), exclusions: [{ foodId: 'pollo', since: MON, origin: 'non-mi-piace' }] };
    calls.dayCarbScale = 0;
    calls.shoppingList = 0;
    const subs = weekSubstitutions(MON, p);
    expect(Object.keys(subs).length).toBeGreaterThan(0);
    expect(calls).toEqual({ dayCarbScale: 0, shoppingList: 0 });
    // Lo strato 2 già deciso è quello che dayCarbScale legge: una chiamata per ogni giorno, e finisce.
    for (let i = 0; i < 7; i++) dayCarbScale(`2026-11-${String(9 + i).padStart(2, '0')}`, { plan: p, dayLogs: {} });
    expect(calls.dayCarbScale).toBe(7);
    expect(calls.shoppingList).toBe(0);
    // Due chiamate danno lo stesso risultato, anche dopo aver letto i pasti.
    mealsForDate('2026-11-11', { plan: p, dayLogs: {} });
    expect(weekSubstitutions(MON, p)).toBe(subs);
  });
});
