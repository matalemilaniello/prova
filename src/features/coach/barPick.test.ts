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

  const DAY_TYPES = ['calcio', 'palestra', 'leggero', 'riposo'] as const;
  const every = (fn: (c: ReturnType<typeof barCombo>, slot: (typeof MEAL_SLOTS)[number], dt: (typeof DAY_TYPES)[number]) => void) => {
    for (const slot of MEAL_SLOTS)
      for (const dt of DAY_TYPES)
        for (const pre of [false, true])
          for (const eve of [false, true]) fn(barCombo(slot, dt, pre, eve), slot, dt);
  };

  it('ogni combinazione usa opzioni esistenti e buone', () => {
    every((c) => {
      const opts = optionsById(c.ids);
      expect(opts.length).toBe(c.ids.length);
      for (const o of opts) {
        // Mai un dolce; "con un accorgimento" solo insieme alla frutta che il suo motivo chiede.
        expect(o.verdict).not.toBe('programmato');
        if (o.verdict === 'meglio') expect(c.ids.some((id) => id === 'macedonia' || id === 'spremuta')).toBe(true);
      }
      expect(c.why).not.toMatch(/—/);
      // La spiegazione non promette quello che i valori non contano.
      expect(c.why).not.toMatch(/pane|aggiungi/i);
    });
  });

  it('proteine come chiede il piano: 20 g a colazione, 30 g a pranzo e a cena', () => {
    every((c, slot) => {
      const p = sumApprox(optionsById(c.ids)).proteinG;
      if (slot === 'colazione') expect(p).toBeGreaterThanOrEqual(20);
      if (slot === 'pranzo' || slot === 'cena') expect(p).toBeGreaterThanOrEqual(30);
    });
  });

  it('la vigilia della partita mangia come un giorno di calcio', () => {
    // Domenica 15 novembre, partita lunedì: tipo previsto riposo, effettivo calcio.
    const c = barContext({ plan }, '2026-11-15', '20:10');
    expect(c.scheduledDayType).toBe('riposo');
    expect(c.dayType).toBe('calcio');
    expect(c.matchEve).toBe(true);
    expect(c.slot).toBe('cena');
    const cena = barCombo('cena', c.dayType, false, c.matchEve);
    const t = sumApprox(optionsById(cena.ids));
    expect(t.carbG).toBeGreaterThanOrEqual(60);
    expect(t.proteinG).toBeGreaterThanOrEqual(30);
    expect(cena.why).toMatch(/Vigilia/);
    expect(cena.why).not.toMatch(/dopo il calcio/i);
    // Il lunedì della partita non è una vigilia: la cena è quella di recupero.
    const mon = barContext({ plan }, '2026-11-16', '22:50');
    expect(mon.matchEve).toBe(false);
    expect(barCombo('cena', mon.dayType, false, mon.matchEve).why).toMatch(/recuperare/);
  });

  it('senza vigilia il giorno di riposo resta leggero', () => {
    const c = barContext({ plan }, '2026-11-12', '20:10'); // giovedì, allenamento: calcio
    expect(c.matchEve).toBe(false);
    expect(barContext({ plan }, '2026-11-14', '13:30').dayType).toBe('leggero'); // sabato
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
