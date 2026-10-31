import { describe, expect, it } from 'vitest';
import { BAR_OPTIONS } from '../../data/barPlanB';
import { defaultPlan } from '../../data/defaults';
import { MEAL_SLOTS } from '../../engine/menu';
import { emptyDayLog } from '../../state/store';
import { barCombo, barContext, optionsById, sumApprox, sweetsThisWeek } from './barPick';

const plan = defaultPlan('2026-11-09');

describe('piano B al bar', () => {
  it('sceglie il pasto di adesso', () => {
    // Martedì (palestra): orari standard.
    expect(barContext({ plan }, '2026-11-10', '07:40').slot).toBe('colazione');
    expect(barContext({ plan }, '2026-11-10', '10:20').slot).toBe('spuntino');
    expect(barContext({ plan }, '2026-11-10', '11:30').slot).toBe('spuntino');
    expect(barContext({ plan }, '2026-11-10', '13:30').slot).toBe('pranzo');
    expect(barContext({ plan }, '2026-11-10', '16:45').slot).toBe('merenda');
    expect(barContext({ plan }, '2026-11-10', '21:10').slot).toBe('cena');
  });

  it('dopo mezzanotte vale ancora la giornata di ieri', () => {
    const c = barContext({ plan }, '2026-11-11', '00:30');
    expect(c.today).toBe('2026-11-10');
    expect(c.slot).toBe('cena');
  });

  it('riconosce la merenda pre-partita del lunedì', () => {
    const c = barContext({ plan }, '2026-11-09', '18:20');
    expect(c.dayType).toBe('calcio');
    expect(c.preFootball).toBe(true);
    expect(c.slot).toBe('merenda');
    expect(c.schedule.merenda.title).toMatch(/pre-partita/);
  });

  it('ogni combinazione usa opzioni esistenti e buone', () => {
    for (const slot of MEAL_SLOTS) {
      for (const dt of ['calcio', 'palestra', 'leggero', 'riposo'] as const) {
        for (const pre of [false, true]) {
          const c = barCombo(slot, dt, pre);
          const opts = optionsById(c.ids);
          expect(opts.length).toBe(c.ids.length);
          for (const o of opts) expect(o.verdict).toBe('si');
          expect(c.why).not.toMatch(/—/);
        }
      }
    }
  });

  it('somma i valori indicativi', () => {
    const t = sumApprox(optionsById(['panino-bresaola', 'macedonia']));
    const a = BAR_OPTIONS.find((o) => o.id === 'panino-bresaola')!.approx;
    const b = BAR_OPTIONS.find((o) => o.id === 'macedonia')!.approx;
    expect(t.kcal).toBe(a.kcal + b.kcal);
    expect(t.proteinG).toBeCloseTo(a.proteinG + b.proteinG);
  });

  it('conta i dolci da lunedì a oggi', () => {
    const logs = {
      '2026-11-08': { ...emptyDayLog('2026-11-08'), sweets: 2 }, // domenica della settimana prima
      '2026-11-09': { ...emptyDayLog('2026-11-09'), sweets: 1 },
      '2026-11-11': { ...emptyDayLog('2026-11-11'), sweets: 1 },
      '2026-11-12': { ...emptyDayLog('2026-11-12'), sweets: 3 }, // dopo oggi
    };
    expect(sweetsThisWeek(logs, '2026-11-11')).toBe(2);
  });
});
