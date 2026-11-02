/**
 * Orari dei pasti con il lavoro (`mealTimesFor`, regole in engine/mealTimes.ts) e propagazione a timeline, card
 * Adesso, calendario e coach. Orari di lavoro inventati; senza lavoro tutto resta com'era.
 */
import { describe, expect, it } from 'vitest';
import type { AppData, MealSlot, Plan, ScheduleDay, TimeRange } from '../domain/types';
import { LEGACY_DEFAULT_SUPPLEMENTS, defaultAppData, defaultPlan } from '../data/defaults';
import { addDays } from './dates';
import { buildCoachContext } from './coachContext';
import { reminderEvents } from './ics';
import { daySchedule, mealSchedule, mealTimesFor, usualMealTime, workBlocksFor } from './mealTimes';
import { buildDay, buildTimeline, effectiveStatus, heldByWork, physioTime, pickNow, ritualItems, starterShopping } from './timeline';

/** Lunedì 9 novembre 2026: lunedì partita, martedì palestra A alle 17, sabato C facoltativa alle 11. */
const MON = '2026-11-09';
const TUE = '2026-11-10';
const SAT = '2026-11-14';

const block = (from: string, to: string): TimeRange => ({ from, to });

function planWith(work: Partial<Record<number, TimeRange[]>>, patch: Partial<Plan> = {}): Plan {
  const p = { ...defaultPlan(MON), supplements: LEGACY_DEFAULT_SUPPLEMENTS.map((x) => ({ ...x })), ...patch };
  return { ...p, week: p.week.map((d) => (work[d.weekday] ? { ...d, work: work[d.weekday] } : d)) };
}

function stateWith(plan: Plan): AppData {
  return { ...defaultAppData(MON), onboarded: true, plan };
}

/** Un giorno libero da calcio e palestra (tipo riposo) con il lavoro dato. */
const restDay = (work?: TimeRange[]): ScheduleDay => ({ weekday: 6, dayType: 'riposo', ...(work ? { work } : {}) });

const times = (day: ScheduleDay, plan: Plan = defaultPlan(MON)) =>
  Object.fromEntries(Object.entries(mealSchedule(day, plan)).map(([k, v]) => [k, `${v.time}${v.carry ? ' da portare' : ''}`])) as Record<MealSlot, string>;

const PLAIN = { colazione: '07:30', spuntino: '10:30', pranzo: '14:15', merenda: '16:30', cena: '20:30' };

describe('senza lavoro non cambia niente', () => {
  it('gli orari sono quelli del piano, nessun pasto da portare, nessun avviso', () => {
    expect(times(restDay())).toEqual(PLAIN);
    expect(times(restDay([]))).toEqual(PLAIN);
    expect(daySchedule(restDay(), defaultPlan(MON)).earlyBreakfast).toBeUndefined();
    const plan = defaultPlan(MON);
    for (let i = 0; i < 7; i++) {
      const iso = addDays(MON, i);
      expect(Object.values(mealTimesFor(iso, plan)).some((m) => m.carry)).toBe(false);
      expect(workBlocksFor(iso, plan)).toEqual([]);
    }
    for (const slot of ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'] as const) expect(usualMealTime(slot, plan)).toBe(plan.mealTimes[slot]);
  });

  it('il calcio sposta i pasti come prima (merenda pre-partita e cena di recupero il lunedì)', () => {
    const m = mealTimesFor(MON, defaultPlan(MON));
    expect(m.merenda).toEqual({ time: '18:30', title: 'Merenda pre-partita' });
    expect(m.cena).toEqual({ time: '23:00', title: 'Cena di recupero, veloce e digeribile' });
  });

  it('un campo vuoto dà la stessa giornata e lo stesso calendario di un giorno senza campo', () => {
    const a = stateWith(planWith({}));
    const b = stateWith(planWith({ 1: [] }));
    expect(buildDay(TUE, b)).toEqual(buildDay(TUE, a));
    expect(reminderEvents(b, ['colazione', 'pranzo', 'fisio'])).toEqual(reminderEvents(a, ['colazione', 'pranzo', 'fisio']));
  });
});

describe('mealTimesFor: le regole del lavoro', () => {
  it('mattina che inizia alle 8: colazione al suo orario, spuntino da portare', () => {
    expect(times(restDay([block('08:00', '14:00')]))).toEqual({ ...PLAIN, spuntino: '10:30 da portare' });
    // Il lavoro comincia alle 08:00, non prima di colazione + 30 minuti: la colazione resta alle 07:30.
    expect(daySchedule(restDay([block('08:00', '14:00')]), defaultPlan(MON)).earlyBreakfast).toBeUndefined();
  });

  it('lavoro che comincia prima di colazione + 30 minuti: colazione 45 minuti prima, mai prima del controllo del mattino', () => {
    const plan = defaultPlan(MON);
    // Alle 08:30 il lavoro comincia dopo colazione + 30 minuti: la colazione resta alle 07:30.
    expect(times(restDay([block('08:30', '10:00')]))).toEqual(PLAIN);
    // Alle 07:55: servirebbe alle 07:10, prima della sveglia delle 07:15; va alle 07:20, dopo il controllo del mattino.
    const s = daySchedule(restDay([block('07:55', '12:00')]), plan);
    expect(s.meals.colazione).toEqual({ time: '07:20', title: 'Colazione' });
    expect(s.earlyBreakfast).toBe('07:10');
    // Con la sveglia alle 06:30 la colazione va davvero 45 minuti prima, senza avviso.
    const early = { ...plan, sleep: { ...plan.sleep, wake: '06:30' } };
    const e = daySchedule(restDay([block('07:55', '12:00')]), early);
    expect(e.meals.colazione.time).toBe('07:10');
    expect(e.earlyBreakfast).toBeUndefined();
  });

  it('colazione prima della sveglia: si segnala e, se cade nel lavoro, è da portare', () => {
    const s = daySchedule(restDay([block('06:00', '10:00')]), defaultPlan(MON));
    expect(s.earlyBreakfast).toBe('05:15');
    expect(s.meals.colazione).toEqual({ time: '07:20', title: 'Colazione', carry: true });
    expect(s.meals.spuntino.time).toBe('10:30');
  });

  it('giornata dalle 11 alle 14:30: il pranzo va a fine lavoro + 15 minuti', () => {
    expect(times(restDay([block('11:00', '14:30')]))).toEqual({ ...PLAIN, pranzo: '14:45' });
    // Fine alle 14:32: 14:47, arrotondato per eccesso ai 5 minuti.
    expect(times(restDay([block('11:00', '14:32')])).pranzo).toBe('14:50');
  });

  it('pausa tra due blocchi: il pasto ci va, se dista al massimo 90 minuti', () => {
    // Spuntino delle 10:30 nel secondo blocco: la pausa delle 09:15-10:15 è vicina; alle 09:45 restano 30 minuti.
    expect(times(restDay([block('08:30', '09:15'), block('10:15', '13:15')]))).toEqual({ ...PLAIN, spuntino: '09:45' });
    // Pranzo delle 14:15 nel blocco del pomeriggio: la pausa delle 13:00-14:00 è vicina (13:30); lo spuntino delle 10:30
    // è a 150 minuti dalla pausa e dalla fine del blocco: da portare, come la merenda.
    expect(times(restDay([block('09:00', '13:00'), block('14:00', '18:00')]))).toEqual({
      ...PLAIN,
      spuntino: '10:30 da portare',
      pranzo: '13:30',
      merenda: '16:30 da portare',
    });
  });

  it('una pausa più corta di 30 minuti non basta: conta come lavoro', () => {
    // 10:00-10:20 tra due blocchi: il pranzo delle 14:15 resta nel lavoro fino alle 14:40 e va alle 14:55.
    expect(times(restDay([block('08:00', '10:00'), block('10:20', '14:40')])).pranzo).toBe('14:55');
  });

  it('lavoro appena cominciato: il pasto va 45 minuti prima, se resta la distanza dal pasto prima', () => {
    expect(times(restDay([block('14:00', '19:00')]))).toEqual({ ...PLAIN, pranzo: '13:15', merenda: '16:30 da portare' });
    expect(times(restDay([block('10:15', '13:00')])).spuntino).toBe('09:30');
    // Merenda delle 16:30 con il lavoro dalle 16:00: alle 15:15 sarebbe a un'ora dal pranzo, troppo vicina; da portare.
    expect(times(restDay([block('16:00', '20:45')]))).toEqual({ ...PLAIN, merenda: '16:30 da portare', cena: '21:00' });
  });

  it('ordine e distanza: un pasto spostato avanti si porta dietro quello dopo', () => {
    // Pranzo alle 15:30 (fine lavoro 15:15 + 15): la merenda passa dalle 16:30 alle 17:00, 90 minuti dopo.
    expect(times(restDay([block('11:00', '15:15')]))).toEqual({ ...PLAIN, pranzo: '15:30', merenda: '17:00' });
    // Con una merenda del piano a 75 minuti dal pranzo resta quella distanza.
    const close = { ...defaultPlan(MON), mealTimes: { ...defaultPlan(MON).mealTimes, merenda: '15:30' } };
    expect(times(restDay([block('11:00', '14:30')]), close)).toEqual({ ...PLAIN, pranzo: '14:45', merenda: '16:00' });
  });

  it('il pasto spinto dentro il lavoro ripassa dalle regole', () => {
    // Pranzo nella pausa delle 15:15-16:30 (a 60 minuti), merenda spinta alle 16:45 dentro il blocco delle 16:30-17:45:
    // il blocco finisce entro un'ora, quindi alle 18:00.
    expect(times(restDay([block('11:00', '15:15'), block('16:30', '17:45')]))).toEqual({ ...PLAIN, pranzo: '15:15', merenda: '18:00' });
  });

  it('con il calcio: la merenda pre-partita resta tale e segue il lavoro', () => {
    const day: ScheduleDay = { weekday: 0, dayType: 'calcio', football: { kind: 'partita', time: '21:00', durationMin: 90 }, work: [block('15:00', '19:00')] };
    const m = mealSchedule(day, defaultPlan(MON));
    expect(m.merenda).toEqual({ time: '19:15', title: 'Merenda pre-partita' });
    expect(m.cena).toEqual({ time: '23:00', title: 'Cena di recupero, veloce e digeribile' });
    const late: ScheduleDay = { ...day, work: [block('14:00', '20:30')] };
    expect(mealSchedule(late, defaultPlan(MON)).merenda).toEqual({ time: '18:30', title: 'Merenda pre-partita', carry: true });
  });

  it('orario abituale della settimana: null se il lavoro lo cambia da un giorno all’altro', () => {
    const plan = planWith({ 1: [block('11:00', '14:30')] });
    expect(usualMealTime('pranzo', plan)).toBeNull();
    expect(usualMealTime('merenda', plan)).toBe('16:30');
    // Senza calcio: il lunedì la merenda pre-partita non conta.
    expect(mealTimesFor(MON, plan, { football: false }).merenda.time).toBe('16:30');
  });

  it('stessi ingressi, stessi risultati', () => {
    const day = restDay([block('09:00', '13:00'), block('14:00', '18:00')]);
    expect(daySchedule(day, defaultPlan(MON))).toEqual(daySchedule(structuredClone(day), defaultPlan(MON)));
  });
});

describe('propagazione', () => {
  it('timeline: orari spostati, pasti e integratori da portare', () => {
    const supplements = [...LEGACY_DEFAULT_SUPPLEMENTS.map((x) => ({ ...x })), { id: 'mg', name: 'Magnesio', dose: '300 mg', timing: 'pranzo' as const, active: true }];
    const plan = planWith({ 1: [block('12:00', '18:00')] }, { supplements });
    const items = buildTimeline(TUE, stateWith(plan));
    const pranzo = items.find((i) => i.id === 'pasto:pranzo');
    expect(pranzo).toMatchObject({ time: '14:15', carry: true });
    expect(items.find((i) => i.id === 'integratori:pranzo')).toMatchObject({ time: '14:15', carry: true });
    // Lo spuntino (10:30) è prima del lavoro; il lavoro non è una voce e non conta.
    expect(items.find((i) => i.id === 'pasto:spuntino')?.carry).toBeUndefined();
    expect(items.map((i) => i.id)).toEqual(buildTimeline(TUE, stateWith(planWith({}, { supplements }))).map((i) => i.id));
    const moved = buildTimeline(TUE, stateWith(planWith({ 1: [block('11:00', '14:30')] })));
    expect(moved.find((i) => i.id === 'pasto:pranzo')?.time).toBe('14:45');
  });

  it('giornata minima: proteine e frutto agli orari del giorno', () => {
    const s = stateWith(planWith({ 1: [block('08:30', '09:15'), block('10:15', '13:15')] }));
    s.dayLogs[TUE] = { date: TUE, status: {}, notes: {}, minimal: true, waterGlasses: 0, sweets: 0, recipeSwaps: {} };
    expect(buildTimeline(TUE, s).find((i) => i.id === 'minima:frutto')?.time).toBe('09:45');
  });

  it('esercizi del fisioterapista: a casa, dopo il lavoro', () => {
    const plan = defaultPlan(MON);
    // Pranzo 14:15 da portare (lavoro 13-18), fisioterapista 75 minuti dopo: nel lavoro, quindi alle 18:30.
    expect(physioTime(restDay([block('13:00', '18:00')]), plan, 20)).toBe('18:30');
    expect(physioTime(restDay(), plan, 20)).toBe('15:30');
  });

  it('spesa del sabato dopo il lavoro', () => {
    const s = stateWith(planWith({ 5: [block('09:00', '13:00')] }));
    // La seduta C delle 11:00 cade nel lavoro (l'avviso è nelle impostazioni); la spesa va alle 13:30.
    expect(ritualItems(SAT, s).find((i) => i.id === 'rito:spesa')?.time).toBe('13:30');
  });

  it('spesa di avvio: non durante il lavoro', () => {
    const base = planWith({}, { firstUse: { date: TUE, time: '09:00' } });
    expect(starterShopping(base)?.time).toBe('15:15');
    const busy = planWith({ 1: [block('14:00', '19:30')] }, { firstUse: { date: TUE, time: '09:00' } });
    // Martedì pieno fino alle 19:30: la spesa passa a mercoledì, un'ora dopo il pranzo.
    expect(starterShopping(busy)).toMatchObject({ date: addDays(TUE, 1), time: '15:15' });
  });

  it('card Adesso: durante il lavoro solo i pasti da portare, poi quello che viene dopo', () => {
    const plan = planWith({ 1: [block('08:00', '14:00')] }, {});
    plan.week[1] = { ...plan.week[1], gymTime: '12:00' };
    const s = stateWith(plan);
    const items = buildDay(TUE, s);
    const status = effectiveStatus(TUE, s, items);
    const done = { ...status, controllo: 'fatto' as const, 'pasto:colazione': 'fatto' as const, integratori: 'fatto' as const };
    const work = workBlocksFor(TUE, plan);
    // Alle 10:35 lo spuntino da portare è in corso.
    expect(pickNow(items, done, '10:35', plan, { work })?.item.id).toBe('pasto:spuntino');
    // Alle 12:05 la seduta delle 12:00 cade nel lavoro: la card guarda al pranzo dopo il lavoro.
    const later = { ...done, 'pasto:spuntino': 'fatto' as const };
    expect(pickNow(items, later, '12:05', plan)?.item.id).toBe('palestra:A');
    expect(pickNow(items, later, '12:05', plan, { work })).toMatchObject({ item: { id: 'pasto:pranzo' }, state: 'prossima' });
    const gym = items.find((i) => i.id === 'palestra:A')!;
    expect(heldByWork(gym, '12:05', work, plan)).toBe(true);
    expect(heldByWork(gym, '14:00', work, plan)).toBe(false);
    expect(heldByWork({ time: '10:30', carry: true }, '10:35', work, plan)).toBe(false);
    // Se resta solo quello che cade nel lavoro, la card lo mostra lo stesso.
    const only = items.filter((i) => i.id === 'palestra:A');
    expect(pickNow(only, {}, '12:05', plan, { work })?.item.id).toBe('palestra:A');
  });

  it('calendario: orari del giorno e «Da portare al lavoro»', () => {
    const s = stateWith(planWith({ 1: [block('11:00', '14:30')], 3: [block('12:00', '18:00')] }));
    const lunch = reminderEvents(s, ['pranzo']);
    const tue = lunch.find((e) => e.days.includes(1));
    expect(tue?.time).toBe('14:45');
    expect(tue?.days).toEqual([1]);
    const thu = lunch.find((e) => e.days.includes(3));
    expect(thu?.time).toBe('14:15');
    expect(thu?.description.startsWith('Da portare al lavoro.')).toBe(true);
    const mon = lunch.find((e) => e.days.includes(0));
    expect(mon?.time).toBe('14:15');
    expect(mon?.description).not.toMatch(/portare/);
  });

  it('coach: blocchi di oggi e della settimana, pasti da portare', () => {
    const plain = buildCoachContext(stateWith(planWith({})), new Date(2026, 10, 10, 9, 0));
    expect(plain).not.toMatch(/[Ll]avoro (oggi|:)/);
    const ctx = buildCoachContext(stateWith(planWith({ 1: [block('08:00', '14:00')], 3: [block('11:00', '14:30')] })), new Date(2026, 10, 10, 9, 0));
    expect(ctx).toContain('mar palestra (lavoro 08:00-14:00;');
    expect(ctx).toContain('Lavoro: mar 08:00-14:00 (spuntino da portare alle 10:30); gio 11:00-14:30 (pranzo alle 14:45).');
    expect(ctx).toContain('Lavoro oggi: 08:00-14:00; pasti: spuntino da portare alle 10:30.');
    expect(ctx).toMatch(/10:30 Spuntino: .* \(da portare al lavoro\)/);
  });
});
