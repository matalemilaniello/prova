import { describe, expect, it } from 'vitest';
import type { Plan } from '../../domain/types';
import { DEFAULT_WEEK, defaultPlan } from '../../data/defaults';
import { dayActivities, dayVerdict, fiberReferenceG, firstShoppingSafe, lowerFirst, portionShort, prepSkipped, preShoppingSlots } from './helpers';

const target = { kcal: 2800, proteinG: 135, carbG: 385, fatG: 80 };

describe('giudizio del giorno', () => {
  it('usa le soglie del controllo del menù: grassi fino a 15 g sotto l’obiettivo sono in linea', () => {
    expect(dayVerdict({ kcal: 2800, proteinG: 150, carbG: 380, fatG: 68 }, target).good).toBe(true);
    expect(dayVerdict({ kcal: 2800, proteinG: 150, carbG: 380, fatG: 65.4 }, target).good).toBe(true);
    expect(dayVerdict({ kcal: 2800, proteinG: 150, carbG: 380, fatG: 64 }, target)).toEqual({ good: false, text: 'Grassi sotto l’obiettivo' });
    // Sopra l'obiettivo vale il 15%.
    expect(dayVerdict({ kcal: 2800, proteinG: 150, carbG: 340, fatG: 93 }, target).text).toBe('Grassi sopra l’obiettivo');
  });

  it('accetta qualche grammo di proteine in più, non le kcal fuori di oltre l’8%', () => {
    expect(dayVerdict({ kcal: 2850, proteinG: 165, carbG: 370, fatG: 75 }, target).good).toBe(true);
    expect(dayVerdict({ kcal: 3060, proteinG: 150, carbG: 400, fatG: 80 }, target)).toEqual({ good: false, text: '+9% sull’obiettivo' });
    expect(dayVerdict({ kcal: 2700, proteinG: 110, carbG: 400, fatG: 80 }, target).text).toBe('Proteine sotto l’obiettivo');
  });

  it('guarda anche le fibre, con il riferimento dei giorni di avvio', () => {
    const withFiber = { ...target, fiberG: 35 };
    const day = { kcal: 2800, proteinG: 150, carbG: 380, fatG: 75, fiberG: 29 };
    // 29 g su 35: sotto di oltre 5 g.
    expect(dayVerdict(day, withFiber)).toEqual({ good: false, text: 'Fibre sotto l’obiettivo' });
    // Nei giorni di avvio il menù porta di proposito circa 28 g: in linea.
    expect(fiberReferenceG(35, true)).toBe(28);
    expect(fiberReferenceG(35, false)).toBe(35);
    expect(dayVerdict(day, withFiber, fiberReferenceG(35, true)).good).toBe(true);
    expect(dayVerdict({ ...day, fiberG: 31 }, withFiber).good).toBe(true);
    // Senza fibre nei dati il giudizio resta quello di kcal e macronutrienti.
    expect(dayVerdict({ kcal: 2800, proteinG: 150, carbG: 380, fatG: 75 }, withFiber).good).toBe(true);
  });
});

describe('testi', () => {
  it('abbassa solo l’iniziale e lascia i nomi propri', () => {
    expect(lowerFirst('Aceto balsamico di Modena')).toBe('aceto balsamico di Modena');
    expect(lowerFirst('Origano secco')).toBe('origano secco');
    expect(lowerFirst('RPE')).toBe('RPE');
  });
});

describe('attività del giorno', () => {
  it('mostra gli esercizi del fisio solo se l’utente li ha inseriti', () => {
    const monday = DEFAULT_WEEK[0];
    expect(dayActivities(monday).map((a) => a.kind)).toEqual(['calcio', 'fisio']);
    expect(dayActivities(monday, false).map((a) => a.kind)).toEqual(['calcio']);
  });
});

describe('settimana senza preparazione', () => {
  const withFirst = (date: string): Plan => ({ ...defaultPlan('2026-11-02'), firstUse: { date, time: '21:00' } }) as Plan;

  it('chi comincia a metà settimana non ha preparato nulla quella domenica', () => {
    expect(prepSkipped(withFirst('2026-11-04'), '2026-11-02', false)).toBe(true);
    expect(prepSkipped(withFirst('2026-11-04'), '2026-11-09', false)).toBe(false);
  });

  it('chi comincia la domenica sera salta anche la settimana dopo, se è di avvio', () => {
    expect(prepSkipped(withFirst('2026-11-01'), '2026-11-02', true)).toBe(true);
    expect(prepSkipped(withFirst('2026-11-01'), '2026-11-09', false)).toBe(false);
  });

  it('senza primo avvio (dati di esempio) la preparazione c’è sempre', () => {
    expect(prepSkipped(defaultPlan('2026-11-02'), '2026-11-02', false)).toBe(false);
  });
});

describe('porzioni del giorno', () => {
  const text = (p: ReturnType<typeof portionShort>) => (p ? `${p.lead}${p.pct}${p.tail}` : null);
  it('dice di quanto cambiano pasta, riso e pane e perché, in breve', () => {
    expect(text(portionShort('calcio', 1.25))).toBe('Pasta, riso e pane +25% per un giorno di calcio.');
    expect(text(portionShort('calcio', 1.25, true))).toBe('Pasta, riso e pane +25% per la vigilia della partita.');
    expect(text(portionShort('leggero', 0.9))).toBe('Pasta, riso e pane −10% per un giorno leggero.');
    expect(text(portionShort('palestra', 1.06))).toBe('Pasta, riso e pane +6% per i tuoi obiettivi.');
    expect(portionShort('palestra', 1)).toBeNull();
  });

  it('partita e vigilia con il minimo per kg: il motivo è il minimo', () => {
    expect(text(portionShort('calcio', 1.653, true, 6))).toBe('Pasta, riso e pane +65% per arrivare a 6 g di carboidrati per kg.');
    expect(text(portionShort('calcio', 1.634, false, 6))).toBe('Pasta, riso e pane +63% per arrivare a 6 g di carboidrati per kg.');
  });

  it('nella ricetta nomina le righe che cambiano', () => {
    expect(text(portionShort('calcio', 1.653, true, 6, ['Riso basmati']))).toBe('Riso basmati +65% per arrivare a 6 g di carboidrati per kg.');
    expect(text(portionShort('calcio', 1.25, false, undefined, ['Pane integrale', 'Fiocchi d’avena']))).toBe('Pane integrale e fiocchi d’avena +25% per un giorno di calcio.');
    expect(text(portionShort('calcio', 1.25, false, undefined, []))).toBe('Pasta, riso e pane +25% per un giorno di calcio.');
  });

  it('la percentuale non è mai detta dei carboidrati del giorno', () => {
    // Alla vigilia le righe di pasta, riso e pane crescono del 65%, i carboidrati del giorno di molto meno.
    const cases: [Parameters<typeof portionShort>[0], number, boolean, number?][] = [
      ['calcio', 1.653, true, 6],
      ['calcio', 1.634, false, 6],
      ['calcio', 1.25, true],
      ['calcio', 1.25, false],
      ['leggero', 0.9, false],
      ['riposo', 0.75, false],
      ['palestra', 1.06, false],
    ];
    for (const [dayType, factor, eve, floor] of cases) {
      const t = text(portionShort(dayType, factor, eve, floor)) ?? '';
      expect(t, t).not.toMatch(/carboidrati\s*[+−-]?\s*\d+([,.]\d+)?\s*%/i);
      expect(t, t).toMatch(/^Pasta, riso e pane [+−]\d+% /);
    }
  });
});

describe('prima della spesa di avvio', () => {
  // Benvenuto finito domenica 1 novembre alle 19:00: il piano parte lunedì, la spesa di avvio è lunedì pomeriggio.
  const plan = { ...defaultPlan('2026-11-02'), week: DEFAULT_WEEK, firstUse: { date: '2026-11-01', time: '19:00' } } as Plan;
  const state = { plan, dayLogs: {}, shoppingChecked: {} };

  it('trova la prima spesa come Oggi, ancora da fare', () => {
    const shop = firstShoppingSafe(state);
    expect(shop?.date).toBe('2026-11-02');
    expect(shop?.done).toBe(false);
  });

  it('segna i pasti prima della spesa: tutta la domenica, il lunedì fino all’orario della spesa, poi più niente', () => {
    expect([...preShoppingSlots('2026-11-01', state)].sort()).toEqual(['cena', 'colazione', 'merenda', 'pranzo', 'spuntino']);
    const monday = preShoppingSlots('2026-11-02', state);
    expect(monday.has('colazione') && monday.has('pranzo')).toBe(true);
    expect(monday.has('cena')).toBe(false);
    expect(preShoppingSlots('2026-11-03', state).size).toBe(0);
  });

  it('con la spesa segnata non segna più niente', () => {
    const shop = firstShoppingSafe(state)!;
    const done = { ...state, dayLogs: { [shop.date]: { date: shop.date, status: { [shop.id]: 'fatto' as const }, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {} } } };
    expect(firstShoppingSafe(done)?.done).toBe(true);
    expect(preShoppingSlots('2026-11-01', done).size).toBe(0);
  });
});
