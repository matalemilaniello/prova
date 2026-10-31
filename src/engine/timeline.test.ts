import { describe, expect, it } from 'vitest';
import type { AppData, DayLog, ISODate, ItemStatus, Plan, TimelineItem } from '../domain/types';
import { defaultAppData, defaultPlan } from '../data/defaults';
import { addDays } from './dates';
import {
  adherenceSummary,
  buildTimeline,
  dayAdherence,
  dayMinutes,
  daySuccessful,
  derivedStatus,
  effectiveStatus,
  isEveningFootball,
  mealSchedule,
  minutesToCurfew,
  overdueItems,
  pickNow,
  physioMinutes,
  statusSource,
  streak,
  streakInfo,
  supplementList,
  type TimelineState,
} from './timeline';

// Settimana del 9 novembre 2026: lunedì 9 partita, martedì 10 palestra A, mercoledì 11 calcetto,
// giovedì 12 allenamento, venerdì 13 palestra B, sabato 14 leggero (C facoltativa), domenica 15 riposo.
const MON = '2026-11-09';
const TUE = '2026-11-10';
const WED = '2026-11-11';
const THU = '2026-11-12';
const SAT = '2026-11-14';
const SUN = '2026-11-15';

function makeState(patch: Partial<AppData> = {}): AppData {
  const base = defaultAppData(MON);
  return { ...base, plan: defaultPlan('2026-10-19'), onboarded: true, ...patch };
}

function log(date: ISODate, status: Record<string, ItemStatus>, extra: Partial<DayLog> = {}): DayLog {
  return { date, status, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {}, ...extra };
}

const ids = (items: TimelineItem[]) => items.map((i) => i.id);
/** I formattatori usano spazi indivisibili prima delle unità. */
const sp = (s: string | undefined) => s?.replace(/\u00a0/g, ' ');
const byId = (items: TimelineItem[], id: string) => items.find((i) => i.id === id);

/** Segna tutte le voci (tranne il letto) con lo stato dato. */
function markAll(state: TimelineState, date: ISODate, st: ItemStatus, except: string[] = []): Record<string, ItemStatus> {
  const out: Record<string, ItemStatus> = {};
  for (const it of buildTimeline(date, state)) if (it.kind !== 'letto' && !except.includes(it.id)) out[it.id] = st;
  return out;
}

describe('timeline · giornata di palestra', () => {
  const state = makeState();
  const items = buildTimeline(TUE, state);

  it('contiene tutte le voci previste, in ordine di orario', () => {
    expect(ids(items)).toEqual([
      'controllo',
      'pasto:colazione',
      'integratori',
      'pasto:spuntino',
      'pasto:pranzo',
      'pasto:merenda',
      'palestra:A',
      'pasto:cena',
      'coprifuoco',
      'letto',
    ]);
  });

  it('controllo 5 minuti dopo la sveglia, integratori con la colazione', () => {
    expect(byId(items, 'controllo')?.time).toBe('07:20');
    expect(byId(items, 'integratori')?.time).toBe('07:30');
    expect(byId(items, 'integratori')?.detail).toBe('Creatina monoidrato, omega-3 e vitamina D');
  });

  it('pasti con ricetta, slot e orari del piano', () => {
    const pranzo = byId(items, 'pasto:pranzo');
    expect(pranzo?.time).toBe('14:15');
    expect(pranzo?.slot).toBe('pranzo');
    expect(pranzo?.title).toBe('Pranzo');
    expect(pranzo?.ref).toBeTruthy();
    expect(pranzo?.detail).toBeTruthy();
    expect(byId(items, 'pasto:cena')?.title).toBe('Cena');
  });

  it('palestra con nome, durata e riferimento alla seduta', () => {
    const gym = byId(items, 'palestra:A');
    expect(gym?.time).toBe('17:00');
    expect(gym?.ref).toBe('A');
    expect(gym?.title).toBe('Seduta A');
    expect(sp(gym?.detail)).toContain('55 min');
  });

  it('coprifuoco e letto dopo mezzanotte restano in fondo', () => {
    expect(byId(items, 'coprifuoco')?.time).toBe('00:15');
    expect(byId(items, 'letto')?.time).toBe('00:45');
    expect(sp(byId(items, 'letto')?.detail)).toBe('Sveglia alle 07:15 · 6 h 30 di sonno');
    expect(items.at(-1)?.kind).toBe('letto');
  });

  it('gli id sono stabili e unici', () => {
    expect(new Set(ids(items)).size).toBe(items.length);
    expect(ids(buildTimeline(TUE, state))).toEqual(ids(items));
  });
});

describe('timeline · giorni di calcio', () => {
  const state = makeState();

  it('partita serale: merenda pre-partita 2 h 30 prima e cena di recupero leggera dopo le 21:30', () => {
    const items = buildTimeline(MON, state);
    expect(byId(items, 'calcio:partita')?.time).toBe('21:00');
    expect(sp(byId(items, 'calcio:partita')?.detail)).toBe('1 h 30, fine alle 22:30');
    const merenda = byId(items, 'pasto:merenda');
    expect(merenda?.time).toBe('18:30');
    expect(merenda?.title).toBe('Merenda pre-partita');
    const cena = byId(items, 'pasto:cena');
    expect(cena?.time).toBe('23:00');
    expect(cena?.title).toBe('Cena di recupero, leggera e veloce');
    // Ordine: merenda, partita, cena di recupero.
    const order = ids(items);
    expect(order.indexOf('pasto:merenda')).toBeLessThan(order.indexOf('calcio:partita'));
    expect(order.indexOf('calcio:partita')).toBeLessThan(order.indexOf('pasto:cena'));
  });

  it('lunedì e mercoledì ci sono gli esercizi del fisioterapista dopo pranzo', () => {
    expect(byId(buildTimeline(MON, state), 'fisio')?.time).toBe('15:30');
    expect(byId(buildTimeline(WED, state), 'fisio')).toBeDefined();
    expect(byId(buildTimeline(THU, state), 'fisio')).toBeUndefined();
  });

  it('il fisio conta esercizi e minuti quando ci sono', () => {
    expect(byId(buildTimeline(MON, state), 'fisio')?.detail).toBe('Aggiungi gli esercizi nelle impostazioni');
    const withPhysio = makeState({
      physio: {
        exercises: [],
        prescriptions: [
          { exerciseId: 'x', sets: 3, repMin: 12, repMax: 15, unit: 'reps', restSec: 45, progression: 'nessuna' },
          { exerciseId: 'y', sets: 4, repMin: 30, repMax: 45, unit: 'secondi', restSec: 60, progression: 'nessuna', perSide: true },
        ],
      },
    });
    expect(physioMinutes(withPhysio.physio)).toBeGreaterThanOrEqual(5);
    expect(sp(byId(buildTimeline(MON, withPhysio), 'fisio')?.detail)).toMatch(/^2 esercizi · \d+ min$/);
  });

  it('calcetto e allenamento: merenda e cena seguono l\'orario', () => {
    const wed = buildTimeline(WED, state);
    expect(byId(wed, 'pasto:merenda')?.title).toBe('Merenda pre-calcetto');
    expect(byId(wed, 'pasto:merenda')?.time).toBe('18:30');
    expect(byId(wed, 'pasto:cena')?.time).toBe('22:30');
    const thu = buildTimeline(THU, state);
    expect(byId(thu, 'calcio:allenamento')?.title).toBe('Allenamento di squadra');
    expect(byId(thu, 'pasto:merenda')?.time).toBe('18:00');
    expect(byId(thu, 'pasto:merenda')?.title).toBe('Merenda pre-allenamento');
    expect(byId(thu, 'pasto:cena')?.time).toBe('22:30');
  });

  it('se il calcio finisce entro le 21:30 la cena di recupero è normale, mai prima del solito orario', () => {
    const plan: Plan = { ...state.plan, week: state.plan.week.map((d) => (d.weekday === 0 ? { ...d, football: { kind: 'partita', time: '18:30', durationMin: 90 } } : d)) };
    const s = makeState({ plan });
    const items = buildTimeline(MON, s);
    expect(byId(items, 'pasto:cena')?.title).toBe('Cena di recupero');
    expect(byId(items, 'pasto:cena')?.time).toBe('20:30');
    // Merenda: 2 h 30 prima sarebbe 16:00, ma il pranzo è alle 14:15: almeno 2 ore dopo.
    expect(byId(items, 'pasto:merenda')?.time).toBe('16:15');
  });

  it('calcio presto: la merenda resta almeno un\'ora prima del calcio', () => {
    const sched = mealSchedule({ weekday: 0, dayType: 'calcio', football: { kind: 'calcetto', time: '17:30', durationMin: 60 } }, state.plan);
    expect(sched.merenda.time).toBe('16:15');
    expect(sched.cena.time).toBe('20:30');
  });

  it('calcio di giorno: il pasto che cade durante il calcio si sposta subito dopo', () => {
    const day = { weekday: 5 as const, dayType: 'calcio' as const, football: { kind: 'partita' as const, time: '10:00', durationMin: 90 } };
    expect(isEveningFootball(day)).toBe(false);
    const sched = mealSchedule(day, state.plan);
    expect(sched.spuntino.time).toBe('12:00');
    expect(sched.spuntino.title).toBe('Spuntino di recupero');
    expect(sched.pranzo.time).toBe('14:15');
    expect(sched.merenda.title).toBe('Merenda');
  });

  it('calcio molto tardi: la cena di recupero dopo mezzanotte resta prima del letto', () => {
    const plan: Plan = {
      ...state.plan,
      sleep: { ...state.plan.sleep, current: '01:30' },
      week: state.plan.week.map((d) => (d.weekday === 0 ? { ...d, football: { kind: 'partita', time: '22:30', durationMin: 90 } } : d)),
    };
    const items = buildTimeline(MON, makeState({ plan }));
    expect(byId(items, 'pasto:cena')?.time).toBe('00:30');
    const order = ids(items);
    expect(order.indexOf('calcio:partita')).toBeLessThan(order.indexOf('pasto:cena'));
    expect(order.indexOf('pasto:cena')).toBeLessThan(order.indexOf('letto'));
  });
});

describe('timeline · altri giorni', () => {
  const state = makeState();

  it('sabato leggero: seduta C facoltativa alle 11:00', () => {
    const gym = byId(buildTimeline(SAT, state), 'palestra:C');
    expect(gym?.time).toBe('11:00');
    expect(gym?.detail?.startsWith('Facoltativa')).toBe(true);
  });

  it('domenica di riposo: niente palestra né calcio', () => {
    const items = buildTimeline(SUN, state);
    expect(items.some((i) => i.kind === 'palestra' || i.kind === 'calcio' || i.kind === 'fisio')).toBe(false);
    expect(items.filter((i) => i.kind === 'pasto')).toHaveLength(5);
  });

  it('integratori raggruppati per momento; nessuna voce senza integratori attivi', () => {
    const plan: Plan = {
      ...state.plan,
      supplements: [
        { id: 'a', name: 'Creatina', dose: '5 g', timing: 'colazione', active: true },
        { id: 'b', name: 'Magnesio', dose: '300 mg', timing: 'sera', active: true },
        { id: 'c', name: 'Ferro', dose: '1', timing: 'pranzo', active: false },
      ],
    };
    const items = buildTimeline(SUN, makeState({ plan }));
    expect(byId(items, 'integratori')?.detail).toBe('Creatina');
    const sera = byId(items, 'integratori:sera');
    expect(sera?.time).toBe('00:15');
    expect(sera?.title).toBe('Integratori della sera');
    expect(byId(items, 'integratori:pranzo')).toBeUndefined();
    const none = buildTimeline(SUN, makeState({ plan: { ...state.plan, supplements: [] } }));
    expect(none.some((i) => i.kind === 'integratori')).toBe(false);
  });

  it('elenco degli integratori in italiano', () => {
    expect(supplementList([])).toBe('');
    expect(
      supplementList([
        { id: 'z', name: 'ZMA', dose: '', timing: 'sera', active: true },
        { id: 'o', name: 'Omega-3', dose: '', timing: 'sera', active: true },
        { id: 'd', name: 'DHA', dose: '', timing: 'sera', active: true },
      ]),
    ).toBe('ZMA, omega-3 e DHA');
  });

  it('giornata minima: solo le 4 voci minime', () => {
    const s = makeState({ dayLogs: { [TUE]: log(TUE, {}, { minimal: true }) } });
    const items = buildTimeline(TUE, s);
    expect(items).toHaveLength(4);
    expect(items.every((i) => i.kind === 'minima')).toBe(true);
    expect(new Set(ids(items))).toEqual(new Set(['minima:proteine', 'minima:frutto', 'minima:integratori', 'minima:telefono']));
    expect(items.at(-1)?.id).toBe('minima:telefono');
    expect(items[0].id).toBe('minima:proteine');
  });

  it('dayMinutes: dopo mezzanotte conta come notte della stessa giornata', () => {
    const plan = state.plan;
    expect(dayMinutes('00:30', plan)).toBe(24 * 60 + 30);
    expect(dayMinutes('07:20', plan)).toBe(7 * 60 + 20);
    expect(dayMinutes('05:00', plan)).toBe(29 * 60);
  });
});

describe('aderenza e giornata riuscita', () => {
  it('fatto 1, sostituito 0,5, saltato e non segnato 0; il letto non conta', () => {
    const base = makeState();
    const items = buildTimeline(SUN, base);
    const counted = items.filter((i) => i.kind !== 'letto');
    const status: Record<string, ItemStatus> = {};
    counted.slice(0, 4).forEach((i) => (status[i.id] = 'fatto'));
    counted.slice(4, 6).forEach((i) => (status[i.id] = 'sostituito'));
    status[counted[6].id] = 'saltato';
    status.letto = 'fatto';
    const s = makeState({ dayLogs: { [SUN]: log(SUN, status) } });
    const sum = adherenceSummary(SUN, s);
    expect(sum.total).toBe(counted.length);
    expect(sum.done).toBe(4);
    expect(sum.replaced).toBe(2);
    expect(sum.skipped).toBe(1);
    expect(sum.pending).toBe(counted.length - 7);
    expect(dayAdherence(SUN, s)).toBeCloseTo(5 / counted.length);
  });

  it('giornata vuota: aderenza 0, non riuscita', () => {
    const s = makeState();
    expect(dayAdherence(TUE, s)).toBe(0);
    expect(daySuccessful(TUE, s)).toBe(false);
  });

  it('riuscita con il 70%', () => {
    const s0 = makeState();
    const items = buildTimeline(SUN, s0).filter((i) => i.kind !== 'letto');
    const need = Math.ceil(items.length * 0.7);
    const status: Record<string, ItemStatus> = {};
    items.slice(0, need).forEach((i) => (status[i.id] = 'fatto'));
    expect(daySuccessful(SUN, makeState({ dayLogs: { [SUN]: log(SUN, status) } }))).toBe(true);
    delete status[items[0].id];
    expect(daySuccessful(SUN, makeState({ dayLogs: { [SUN]: log(SUN, status) } }))).toBe(false);
  });

  it('giornata minima: servono 4 voci fatte su 4', () => {
    const all = { 'minima:proteine': 'fatto', 'minima:frutto': 'fatto', 'minima:integratori': 'fatto', 'minima:telefono': 'fatto' } as const;
    expect(daySuccessful(TUE, makeState({ dayLogs: { [TUE]: log(TUE, { ...all }, { minimal: true }) } }))).toBe(true);
    const three = { ...all, 'minima:telefono': 'sostituito' } as const;
    expect(daySuccessful(TUE, makeState({ dayLogs: { [TUE]: log(TUE, { ...three }, { minimal: true }) } }))).toBe(false);
    // Le voci normali segnate prima di passare alla minima non contano.
    const mixed = makeState({ dayLogs: { [TUE]: log(TUE, { 'pasto:pranzo': 'fatto', 'minima:frutto': 'fatto' }, { minimal: true }) } });
    expect(adherenceSummary(TUE, mixed).done).toBe(1);
  });
});

describe('stato ricavato dai registri', () => {
  it('controllo salvato, seduta e calcio registrati', () => {
    const s = makeState({
      checkIns: { [MON]: { date: MON, pain: {}, weightKg: 70 } },
      footballLogs: [{ id: 'f1', date: MON, kind: 'partita', durationMin: 90, rpe: 7 }],
    });
    const items = buildTimeline(MON, s);
    const st = effectiveStatus(MON, s, items);
    expect(st.controllo).toBe('fatto');
    expect(st['calcio:partita']).toBe('fatto');
    expect(statusSource(MON, s, byId(items, 'controllo')!)).toBe('registro');
    expect(statusSource(MON, s, byId(items, 'pasto:pranzo')!)).toBeNull();
  });

  it('una seduta diversa da quella prevista vale come sostituita', () => {
    const s = makeState({
      workoutLogs: [{ id: 'w1', date: TUE, sessionId: 'B', durationMin: 50, rpe: 7, pain: {}, exercises: [] }],
    });
    const gym = byId(buildTimeline(TUE, s), 'palestra:A')!;
    expect(derivedStatus(TUE, s, gym)).toBe('sostituito');
  });

  it('il diario vince sul registro', () => {
    const s = makeState({
      checkIns: { [MON]: { date: MON, pain: {} } },
      dayLogs: { [MON]: log(MON, { controllo: 'saltato' }) },
    });
    expect(effectiveStatus(MON, s).controllo).toBe('saltato');
    expect(statusSource(MON, s, byId(buildTimeline(MON, s), 'controllo')!)).toBe('diario');
  });
});

describe('serie di giornate riuscite', () => {
  const s0 = makeState();
  const success = (d: ISODate) => log(d, markAll(s0, d, 'fatto'));

  it('conta le giornate consecutive; oggi in corso non spezza la serie', () => {
    const today = SUN;
    const dayLogs: Record<ISODate, DayLog> = {};
    for (let i = 1; i <= 3; i++) {
      const d = addDays(today, -i);
      dayLogs[d] = success(d);
    }
    // Il quarto giorno prima è andato male.
    const bad = addDays(today, -4);
    dayLogs[bad] = log(bad, { 'pasto:colazione': 'fatto' });
    const s = makeState({ dayLogs });
    expect(streakInfo(s, today)).toEqual({ days: 3, includesToday: false });
    dayLogs[today] = success(today);
    expect(streakInfo(makeState({ dayLogs }), today)).toEqual({ days: 4, includesToday: true });
  });

  it('la giornata minima completa conta nella serie', () => {
    const d1 = addDays(SUN, -1);
    const s = makeState({
      dayLogs: {
        [d1]: log(d1, { 'minima:proteine': 'fatto', 'minima:frutto': 'fatto', 'minima:integratori': 'fatto', 'minima:telefono': 'fatto' }, { minimal: true }),
      },
    });
    expect(streak(s, SUN)).toBe(1);
  });

  it('non va prima dell\'inizio del piano', () => {
    const plan = { ...defaultPlan(SAT) };
    const dayLogs: Record<ISODate, DayLog> = {};
    for (let i = 1; i <= 10; i++) {
      const d = addDays(SUN, -i);
      dayLogs[d] = success(d);
    }
    // Il piano parte lunedì 9: da sabato 14 indietro fino a lunedì 9 sono 6 giorni.
    expect(streak(makeState({ plan, dayLogs }), SUN)).toBe(6);
  });

  it('senza diario la serie è zero', () => {
    expect(streak(makeState(), SUN)).toBe(0);
  });
});

describe('adesso', () => {
  const state = makeState();
  const items = buildTimeline(TUE, state);
  const plan = state.plan;

  it('voce in corso', () => {
    const p = pickNow(items, {}, '14:30', plan);
    expect(p?.item.id).toBe('pasto:pranzo');
    expect(p?.state).toBe('adesso');
    expect(p?.deltaMin).toBe(-15);
  });

  it('prossima voce non segnata, saltando quelle già segnate', () => {
    const p = pickNow(items, { 'pasto:merenda': 'fatto' }, '16:00', plan);
    expect(p?.item.id).toBe('palestra:A');
    expect(p?.state).toBe('prossima');
    expect(p?.deltaMin).toBe(60);
  });

  it('salta i tipi esclusi (controllo già proposto da un\'altra card)', () => {
    const p = pickNow(items, {}, '07:00', plan, { skip: ['controllo'] });
    expect(p?.item.id).toBe('pasto:colazione');
  });

  it('dopo mezzanotte il letto è ancora la prossima voce', () => {
    const done = Object.fromEntries(items.filter((i) => i.kind !== 'letto').map((i) => [i.id, 'fatto' as const]));
    const p = pickNow(items, done, '00:30', plan);
    expect(p?.item.id).toBe('letto');
    expect(p?.state).toBe('prossima');
    expect(p?.deltaMin).toBe(15);
  });

  it('se non resta niente in avanti mostra l\'ultima rimasta indietro; null se è tutto segnato', () => {
    const allButLunch = Object.fromEntries(items.filter((i) => i.id !== 'pasto:pranzo').map((i) => [i.id, 'fatto' as const]));
    const p = pickNow(items, allButLunch, '22:00', plan);
    expect(p?.item.id).toBe('pasto:pranzo');
    expect(p?.state).toBe('in-ritardo');
    const all = Object.fromEntries(items.map((i) => [i.id, 'fatto' as const]));
    expect(pickNow(items, all, '22:00', plan)).toBeNull();
  });

  it('voci rimaste indietro', () => {
    const late = overdueItems(items, { 'pasto:colazione': 'fatto' }, '15:30', plan);
    expect(ids(late)).toEqual(['controllo', 'integratori', 'pasto:spuntino', 'pasto:pranzo']);
  });

  it('giornata minima: le voci valgono tutto il giorno, non restano indietro a metà giornata', () => {
    const s = makeState({ dayLogs: { [TUE]: log(TUE, {}, { minimal: true }) } });
    const min = buildTimeline(TUE, s);
    expect(overdueItems(min, {}, '15:00', s.plan)).toEqual([]);
    const p = pickNow(min, {}, '15:00', s.plan);
    expect(p?.item.id).toBe('minima:proteine');
    expect(p?.state).toBe('adesso');
    // Dopo il coprifuoco proteine, frutto e integratori non segnati restano indietro.
    expect(ids(overdueItems(min, { 'minima:telefono': 'fatto' }, '00:30', s.plan))).toEqual(['minima:proteine', 'minima:integratori', 'minima:frutto']);
  });

  it('minuti al coprifuoco, anche a cavallo della mezzanotte', () => {
    expect(minutesToCurfew(TUE, '22:55', plan)).toBe(80);
    expect(minutesToCurfew(TUE, '00:20', plan)).toBe(-5);
  });
});
