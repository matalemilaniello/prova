/**
 * Testi e dati della Settimana per il menù generato (docs/FASE2.md § 4.10-4.11, § 6.4): provenienza del menù, perché una
 * casella è vuota, giorni dal frigo e dal freezer dei compiti generati per componente. Stati inventati.
 */
import { describe, expect, it } from 'vitest';
import type { MenuWeek } from '../../domain/types';
import { MENU_ROTATION } from '../../data/menu';
import { PREP_COMPONENTS } from '../../data/prepComponents';
import { RECIPES } from '../../data/recipes';
import { addDays, daysBetween } from '../../engine/dates';
import { EMPTY_MENU_CELL, mealsForDate, prepInForce } from '../../engine/menu';
import { prepTasksFor, sameBatchLayout } from '../../engine/menuGen';
import { fixtureState } from '../../engine/menuGen/testFixtures';
import { clearedReason, freezerNote, menuSourceInfo, prepStorage, repeatedFromMonday } from './menuInfo';

const NEXT = '2026-11-16';

/** Una settimana della rotazione con due ricette da preparazione scambiate di giorno: i compiti nascono dai componenti. */
function movedWeek(): MenuWeek {
  const w = JSON.parse(JSON.stringify(MENU_ROTATION[0])) as MenuWeek;
  const a = w.days[0].meals.cena;
  w.days[0].meals.cena = w.days[4].meals.cena;
  w.days[4].meals.cena = a;
  const b = w.days[1].meals.pranzo;
  w.days[1].meals.pranzo = w.days[3].meals.pranzo;
  w.days[3].meals.pranzo = b;
  return { ...w, prep: prepTasksFor(w) };
}

describe('provenienza del menù', () => {
  it('una etichetta per provenienza; il menù ripetuto dice da quale settimana', () => {
    const plan = fixtureState(NEXT).plan;
    expect(menuSourceInfo('rotazione', NEXT, plan)).toEqual({ source: 'rotazione', label: 'Menù di base' });
    expect(menuSourceInfo('avvio', NEXT, plan).label).toBe('Menù di avvio');
    expect(menuSourceInfo('approvato', NEXT, plan).label).toBe('Menù approvato');
    const week = MENU_ROTATION[1];
    const withPast = { ...plan, menus: { [addDays(NEXT, -14)]: week } };
    expect(repeatedFromMonday(NEXT, withPast)).toBe(addDays(NEXT, -14));
    expect(repeatedFromMonday(NEXT, plan)).toBeNull();
    // Oltre le 4 settimane non si ripete.
    expect(repeatedFromMonday(NEXT, { menus: { [addDays(NEXT, -35)]: week } })).toBeNull();
    const info = menuSourceInfo('ripetuto', addDays(NEXT, 2), withPast);
    expect(info.label).toBe('Menù ripetuto');
    expect(info.note).toBe('Per questa settimana non c’è un menù nuovo approvato: si ripete quello del 2-8 novembre.');
    // Coerente con il risolutore: la settimana ripetuta è proprio quella.
    expect(mealsForDate(NEXT, { plan: withPast, dayLogs: {} }).source).toBe('ripetuto');
  });
});

describe('casella vuota', () => {
  it('nomina gli alimenti esclusi della ricetta tolta, al massimo due', () => {
    const recipe = Object.values(RECIPES).find((r) => r.ingredients.some((l) => l.foodId === 'tonno'))!;
    const plan = { exclusions: [{ foodId: 'tonno', since: '2026-11-01', origin: 'impostazioni' as const }] };
    expect(clearedReason(recipe.id, plan, NEXT)).toBe('Senza il tonno il menù non ha un piatto simile.');
    expect(clearedReason(recipe.id, { exclusions: [] }, NEXT)).toBe('Il menù non ha un piatto simile per questo pasto.');
    expect(clearedReason(undefined, plan, NEXT)).toBe('Il menù non ha un piatto simile per questo pasto.');
    // Casella lasciata vuota dal menù generato (nessuna ricetta adatta).
    expect(clearedReason(EMPTY_MENU_CELL, plan, NEXT)).toBe('Nessuna ricetta adatta con le tue esclusioni.');
    expect(clearedReason(EMPTY_MENU_CELL, { exclusions: [] }, NEXT)).toBe('Il menù non ha una ricetta adatta per questo pasto.');
  });
});

describe('preparazione generata per componente', () => {
  it('giorni dal frigo entro i giorni del componente, il resto dal freezer, solo per i componenti cotti', () => {
    const week = movedWeek();
    expect(sameBatchLayout(week, MENU_ROTATION[0])).toBe(false);
    const s = fixtureState(NEXT);
    s.plan.menus = { [NEXT]: week };
    const tasks = prepInForce(NEXT, s.plan);
    expect(tasks.map((t) => t.id).sort()).toEqual(week.prep.map((t) => t.id).sort());
    const storage = prepStorage(NEXT, s.plan, tasks);
    const sunday = addDays(NEXT, -1);
    expect(Object.keys(storage).length).toBeGreaterThan(0);
    for (const [id, st] of Object.entries(storage)) {
      const c = PREP_COMPONENTS[id as keyof typeof PREP_COMPONENTS];
      expect(c.cooked).toBe(true);
      expect(st.what).toBe(c.what);
      for (const d of st.fridge) expect(daysBetween(sunday, d)).toBeLessThanOrEqual(c.fridgeDays);
      for (const d of st.freezer) expect(daysBetween(sunday, d)).toBeGreaterThan(c.fridgeDays);
      // Niente la domenica: le ricette da preparazione vanno dal lunedì al sabato.
      for (const d of [...st.fridge, ...st.freezer]) expect(d >= NEXT && d < addDays(NEXT, 6)).toBe(true);
    }
    // La resa scritta dal motore dice gli stessi giorni.
    for (const t of tasks) {
      const st = storage[t.id];
      if (st?.freezer.length) expect(t.yields).toMatch(/freezer/);
    }
    const note = freezerNote(storage);
    if (Object.values(storage).some((x) => x.freezer.length)) expect(note).toMatch(/^In freezer: .+\. La sera prima passale in frigo\.$/);
    else expect(note).toBeNull();
  });

  it('i compiti scritti a mano del seme restano senza righe di conservazione (lo dice la loro guida)', () => {
    const s = fixtureState(NEXT);
    const tasks = prepInForce(NEXT, s.plan);
    expect(tasks.length).toBeGreaterThan(0);
    expect(prepStorage(NEXT, s.plan, tasks)).toEqual({});
    expect(freezerNote({})).toBeNull();
  });

  it('la riga del freezer elenca i componenti in ordine di giorno', () => {
    const note = freezerNote({
      a: { what: 'Ragù di lenticchie', fridge: ['2026-11-17'], freezer: ['2026-11-21'] },
      b: { what: 'Riso basmati', fridge: [], freezer: ['2026-11-19', '2026-11-20'] },
      c: { what: 'Frittatine', fridge: ['2026-11-16'], freezer: [] },
    });
    expect(note).toBe('In freezer: riso basmati per giovedì e venerdì; ragù di lenticchie per sabato. La sera prima passale in frigo.');
  });
});
