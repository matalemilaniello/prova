import { describe, expect, it } from 'vitest';
import { BAR_OPTIONS } from '../../data/barPlanB';
import { defaultPlan } from '../../data/defaults';
import { MEAL_SLOTS } from '../../engine/menu';
import { emptyDayLog, useApp } from '../../state/store';
import { BAR_VEG_PORTIONS, barCombo, barContext, barOrder, CALCIO_MEAL_CAP, CALCIO_MEAL_SHARE, fitCombo, optionsById, plannedMeal, sumApprox, sweetsThisWeek } from './barPick';

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
        if (o.verdict === 'meglio') expect(c.ids.some((id) => id === 'macedonia' || id === 'spremuta' || id === 'yogurt-frutta')).toBe(true);
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

  it('alla vigilia la cena del bar arriva vicino a quella prevista, carboidrati compresi', () => {
    const c = barContext({ plan }, '2026-11-15', '20:10');
    const planned = plannedMeal({ plan, dayLogs: {} }, c.today, 'cena')!;
    expect(planned.kcal).toBeGreaterThan(600);
    const base = barCombo('cena', c.dayType, false, c.matchEve);
    expect(sumApprox(optionsById(base.ids)).kcal).toBeLessThan(planned.kcal * CALCIO_MEAL_SHARE);
    const fit = fitCombo(base, c.dayType, planned, 'cena');
    const t = sumApprox(optionsById(fit.ids));
    expect(fit.ids.length).toBeGreaterThan(base.ids.length);
    expect(fit.ids.slice(0, base.ids.length)).toEqual(base.ids);
    expect(t.kcal).toBeGreaterThanOrEqual(planned.kcal * CALCIO_MEAL_SHARE);
    expect(t.carbG).toBeGreaterThanOrEqual(planned.carbG * CALCIO_MEAL_SHARE);
    expect(t.kcal).toBeLessThanOrEqual(planned.kcal * CALCIO_MEAL_CAP);
    expect(t.proteinG).toBeGreaterThanOrEqual(30);
    expect(fit.why).toMatch(/Vigilia/);
    expect(fit.why).toMatch(/portan?o? i carboidrati vicino alla cena prevista\./);
  });

  it('il pasto previsto completa solo i giorni di calcio, senza strafare', () => {
    // Martedì di palestra: la scelta resta quella di base anche se sotto il pasto previsto.
    const tue = barCombo('cena', 'palestra', false);
    expect(fitCombo(tue, 'palestra', { kcal: 900, carbG: 120 })).toEqual(tue);
    // Senza pasto previsto, nessuna aggiunta.
    const mon = barCombo('cena', 'calcio', false);
    expect(fitCombo(mon, 'calcio', null)).toEqual(mon);
    // Già vicina al previsto: resta com'è.
    const t = sumApprox(optionsById(mon.ids));
    expect(fitCombo(mon, 'calcio', { kcal: t.kcal, carbG: t.carbG })).toEqual(mon);
    // Ogni aggiunta resta un'opzione buona, e il trancio arriva solo con la frutta.
    for (const slot of MEAL_SLOTS) {
      for (const kcal of [500, 700, 900, 1100]) {
        const f = fitCombo(barCombo(slot, 'calcio', false, true), 'calcio', { kcal, carbG: kcal * 0.14 }, slot);
        const opts = optionsById(f.ids);
        expect(opts.length).toBe(f.ids.length);
        expect(new Set(f.ids).size).toBe(f.ids.length);
        for (const o of opts) expect(o.verdict).not.toBe('programmato');
        if (f.ids.includes('trancio-pizza')) expect(f.ids).toContain('macedonia');
        expect(f.why).not.toMatch(/—|pane|aggiungi/i);
      }
    }
  });

  it('senza vigilia il giorno di riposo resta leggero', () => {
    const c = barContext({ plan }, '2026-11-12', '20:10'); // giovedì, allenamento: calcio
    expect(c.matchEve).toBe(false);
    expect(barContext({ plan }, '2026-11-14', '13:30').dayType).toBe('leggero'); // sabato
  });

  it('somma i valori indicativi', () => {
    const t = sumApprox(optionsById(['panino-pollo', 'macedonia']));
    const a = BAR_OPTIONS.find((o) => o.id === 'panino-pollo')!.approx;
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

describe('ordine al bar nel diario', () => {
  it('somma i valori e le porzioni di vegetali delle voci scelte', () => {
    const list = optionsById(['panino-pollo', 'yogurt-frutta']);
    const order = barOrder(list)!;
    expect(order.label).toBe('Panino con pollo, insalata e pomodoro e yogurt bianco con frutta fresca');
    expect(order.nutrients).toEqual(sumApprox(list));
    expect(order.vegPortions).toBe(1);
    expect(barOrder([])).toBeNull();
    expect(barOrder(optionsById(['insalatona', 'macedonia', 'spremuta']))!.vegPortions).toBe(4);
  });

  it('ogni porzione di vegetali riguarda una voce del banco', () => {
    const ids = new Set(BAR_OPTIONS.map((o) => o.id));
    for (const [id, v] of Object.entries(BAR_VEG_PORTIONS)) {
      expect(ids.has(id)).toBe(true);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it('il pasto preso al bar resta nel diario finché è sostituito', () => {
    useApp.setState({ dayLogs: {} });
    const s = useApp.getState();
    const date = '2026-11-10';
    const order = barOrder(optionsById(['panino-pollo', 'yogurt-frutta']))!;
    s.setItemStatus(date, 'pasto:cena', 'sostituito', 'Al bar');
    s.setBarMeal(date, 'cena', order);
    expect(useApp.getState().dayLogs[date].barMeals?.cena?.nutrients.proteinG).toBe(order.nutrients.proteinG);
    // Annulla: lo stato di prima (nessuno) toglie anche l'ordine.
    useApp.getState().setItemStatus(date, 'pasto:cena', null, '');
    useApp.getState().setBarMeal(date, 'cena', null);
    expect(useApp.getState().dayLogs[date].barMeals).toBeUndefined();
  });
});
