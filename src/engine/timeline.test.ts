import { describe, expect, it } from 'vitest';
import type { AppData, DayLog, ISODate, ItemStatus, Plan, TimelineItem } from '../domain/types';
import { LEGACY_DEFAULT_SUPPLEMENTS, defaultAppData, defaultPlan } from '../data/defaults';
import { addDays } from './dates';
import { shoppingList } from './shopping';
import {
  gymDuration,
  adherenceSummary,
  buildDay,
  buildTimeline,
  canMarkNow,
  firstUseOf,
  isBeforeStart,
  itemCounts,
  itemsToSuccess,
  markableFrom,
  nextWeekPrep,
  nightStreak,
  openItems,
  physioSetupDue,
  dayAdherence,
  dayMinutes,
  daySuccessful,
  doseUndefined,
  firstShopping,
  PRE_SHOPPING_DETAIL,
  supplementDoseDue,
  setupTask,
  derivedStatus,
  effectiveStatus,
  isEveningFootball,
  mealSchedule,
  ritualItems,
  shoppingLeadFor,
  shoppingOptionsFor,
  shoppingTarget,
  starterShopping,
  STARTER_SHOPPING_ID,
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
/** La domenica prima del lunedì 9. */
const SUN0 = '2026-11-08';

function makeState(patch: Partial<AppData> = {}): AppData {
  const base = defaultAppData(MON);
  // Integratori della fase 1 (vitamina D con la dose da definire): i nuovi utenti partono dal catalogo.
  const plan = { ...defaultPlan('2026-10-19'), supplements: LEGACY_DEFAULT_SUPPLEMENTS.map((x) => ({ ...x })) };
  return { ...base, plan, onboarded: true, ...patch };
}

function log(date: ISODate, status: Record<string, ItemStatus>, extra: Partial<DayLog> = {}): DayLog {
  return { date, status, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {}, ...extra };
}

const ids = (items: Pick<TimelineItem, 'id'>[]) => items.map((i) => i.id);
/** I formattatori usano spazi indivisibili prima delle unità. */
const sp = (s: string | undefined) => s?.replace(/\u00a0/g, ' ');
const byId = <T extends Pick<TimelineItem, 'id'>>(items: T[], id: string) => items.find((i) => i.id === id);

/** Segna tutte le voci (tranne il letto) con lo stato dato. */
function markAll(state: TimelineState, date: ISODate, st: ItemStatus, except: string[] = []): Record<string, ItemStatus> {
  const out: Record<string, ItemStatus> = {};
  for (const it of buildDay(date, state)) if (it.kind !== 'letto' && !except.includes(it.id)) out[it.id] = st;
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
    // La vitamina D senza dose non si segna come presa.
    expect(byId(items, 'integratori')?.detail).toBe('Creatina monoidrato e omega-3');
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
    // Senza sedute registrate è la fase di ingresso (una serie in meno): la durata è quella di Allenamento.
    const d = gymDuration('A', {});
    expect(d && d.own).toBeLessThan(55);
    expect(sp(gym?.detail)).toContain(`${d?.own} min`);
  });

  it('la durata della palestra segue gli esercizi del fisioterapista e la fine della fase di ingresso', () => {
    const logs = [1, 2].map((i) => ({ id: `w${i}`, date: addDays(TUE, -7 * i), sessionId: 'A', durationMin: 55, rpe: 6, pain: {}, exercises: [] })) as AppData['workoutLogs'];
    // A regime, senza fisioterapista: la stima della seduta.
    expect(gymDuration('A', { workoutLogs: logs })).toMatchObject({ own: 55, physio: 0, total: 55 });
    const physio = { exercises: [], prescriptions: [{ exerciseId: 'tyler-twist', sets: 3, repMin: 15, repMax: 15, unit: 'reps', restSec: 60 }] } as unknown as AppData['physio'];
    const d = gymDuration('A', { workoutLogs: logs, physio })!;
    expect(d.physio).toBeGreaterThan(0);
    expect(d.total).toBe(d.own + d.physio);
    const gym = byId(buildTimeline(TUE, { ...makeState(), workoutLogs: logs, physio }), 'palestra:A');
    expect(gym?.detail).toContain(`${d.own}\u00a0+\u00a0${d.physio}\u00a0min`);
    expect(gymDuration('nessuna', {})).toBeNull();
  });

  it('coprifuoco e letto dopo mezzanotte restano in fondo', () => {
    expect(byId(items, 'coprifuoco')?.time).toBe('00:15');
    expect(byId(items, 'letto')?.time).toBe('00:45');
    expect(sp(byId(items, 'letto')?.detail)).toBe('Sveglia alle 07:15 · 6 h 30 a letto');
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
    expect(cena?.title).toBe('Cena di recupero, veloce e digeribile');
    // Ordine: merenda, partita, cena di recupero.
    const order = ids(items);
    expect(order.indexOf('pasto:merenda')).toBeLessThan(order.indexOf('calcio:partita'));
    expect(order.indexOf('calcio:partita')).toBeLessThan(order.indexOf('pasto:cena'));
  });

  it('senza esercizi del fisioterapista inseriti non c\'è nessuna voce da spuntare', () => {
    const mon = buildTimeline(MON, state);
    expect(byId(mon, 'fisio')).toBeUndefined();
    // Controllo, 5 pasti, integratori, partita, coprifuoco: 9 voci che contano.
    expect(adherenceSummary(MON, state).total).toBe(9);
    // Al suo posto, fuori dalla timeline, l'invito a inserirli: non conta e non ha orario.
    expect(physioSetupDue(MON, state)).toBe('15:30');
    expect(physioSetupDue(WED, state)).toBe('15:30');
    expect(physioSetupDue(THU, state)).toBeNull();
    expect(buildDay(MON, state).some((i) => i.kind === 'fisio')).toBe(false);
  });

  it('la configurazione da completare è fuori dalla timeline, una cosa alla volta', () => {
    // Lunedì: mancano esercizi del fisioterapista e dose della vitamina D; prima il fisioterapista.
    expect(setupTask(MON, state)).toEqual({ kind: 'fisio' });
    const withPhysio = makeState({
      physio: {
        exercises: [],
        prescriptions: [{ exerciseId: 'x', sets: 3, repMin: 12, repMax: 15, unit: 'reps', restSec: 45, progression: 'nessuna' }],
      },
    });
    // Con gli esercizi inseriti tocca alla dose; nessuna delle due diventa una voce.
    expect(setupTask(MON, withPhysio)).toEqual({ kind: 'dose', names: ['Vitamina D'] });
    expect(buildDay(MON, withPhysio).map((i) => i.id).some((id) => id.startsWith('setup'))).toBe(false);
    // Mercoledì c'è il fisioterapista ma la dose si ricorda solo il lunedì; giovedì niente.
    expect(setupTask(WED, state)).toEqual({ kind: 'fisio' });
    expect(setupTask(WED, withPhysio)).toBeNull();
    expect(setupTask(THU, state)).toBeNull();
    // Nella giornata minima niente da completare.
    const minimal = makeState({ dayLogs: { [MON]: log(MON, {}, { minimal: true }) } });
    expect(setupTask(MON, minimal)).toBeNull();
    // Il primo avvio di un giovedì ricorda la dose anche se non è lunedì.
    const firstThu: AppData = { ...state, plan: { ...state.plan, firstUse: { date: THU, time: '15:30' } } };
    expect(setupTask(THU, firstThu)).toEqual({ kind: 'dose', names: ['Vitamina D'] });
  });

  it('il fisio conta esercizi e minuti quando ci sono', () => {
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
    expect(byId(buildTimeline(MON, withPhysio), 'fisio')?.time).toBe('15:30');
    expect(byId(buildTimeline(WED, withPhysio), 'fisio')).toBeDefined();
    expect(byId(buildTimeline(THU, withPhysio), 'fisio')).toBeUndefined();
    expect(sp(byId(buildTimeline(MON, withPhysio), 'fisio')?.detail)).toMatch(/^2 esercizi · \d+ min$/);
    expect(physioSetupDue(MON, withPhysio)).toBeNull();
    expect(adherenceSummary(MON, withPhysio).total).toBe(10);
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

  it('un integratore senza dose non entra nella voce; il lunedì una riga ricorda di definirla', () => {
    const s = makeState();
    expect(doseUndefined({ dose: 'Dose da definire con l’esame' })).toBe(true);
    expect(doseUndefined({ dose: '5 g' })).toBe(false);
    expect(supplementDoseDue(MON, s)).toEqual({ time: '07:30', names: ['Vitamina D'] });
    expect(supplementDoseDue(TUE, s)).toBeNull();
    // Con la dose inserita la riga sparisce e l'integratore torna nella voce.
    const plan: Plan = { ...s.plan, supplements: s.plan.supplements.map((x) => (x.id === 'vitamina-d' ? { ...x, dose: '1.000 UI' } : x)) };
    expect(supplementDoseDue(MON, { ...s, plan })).toBeNull();
    expect(byId(buildTimeline(TUE, { ...s, plan }), 'integratori')?.detail).toBe('Creatina monoidrato, omega-3 e vitamina D');
    // Solo integratori senza dose: nessuna voce da segnare.
    const only: Plan = { ...s.plan, supplements: s.plan.supplements.filter((x) => x.id === 'vitamina-d') };
    expect(buildTimeline(TUE, { ...s, plan: only }).some((i) => i.kind === 'integratori')).toBe(false);
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

  it('giornata minima: le 4 voci minime più la seduta come appuntamento che non conta', () => {
    const s = makeState({ dayLogs: { [TUE]: log(TUE, {}, { minimal: true }) } });
    const items = buildTimeline(TUE, s);
    const minima = items.filter((i) => i.kind === 'minima');
    expect(minima).toHaveLength(4);
    expect(new Set(ids(minima))).toEqual(new Set(['minima:proteine', 'minima:frutto', 'minima:integratori', 'minima:telefono']));
    expect(items.at(-1)?.id).toBe('minima:telefono');
    expect(items[0].id).toBe('minima:proteine');
    expect(ids(items)).toContain('palestra:A');
    expect(itemCounts(TUE, byId(items, 'palestra:A')!, s)).toBe(false);
    expect(adherenceSummary(TUE, s).total).toBe(4);
  });

  it('giornata minima nel giorno di partita: la partita resta per segnare minuti e RPE, ma non conta', () => {
    const all = { 'minima:proteine': 'fatto', 'minima:frutto': 'fatto', 'minima:integratori': 'fatto', 'minima:telefono': 'fatto' } as const;
    const s = makeState({ dayLogs: { [MON]: log(MON, { ...all }, { minimal: true }) } });
    const items = buildTimeline(MON, s);
    expect(ids(items)).toContain('calcio:partita');
    expect(items.some((i) => i.kind === 'pasto')).toBe(false);
    const sum = adherenceSummary(MON, s);
    expect(sum.total).toBe(4);
    expect(daySuccessful(MON, s)).toBe(true);
    // La partita passata non resta indietro: non conta.
    const late = overdueItems(items, effectiveStatus(MON, s, items), '23:30', s.plan, (it) => itemCounts(MON, it, s));
    expect(ids(late)).toEqual([]);
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
    const items = buildDay(SUN, base);
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
    const items = buildDay(SUN, s0).filter((i) => i.kind !== 'letto');
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

  it('quante voci mancano alla giornata riuscita', () => {
    const sum = (done: number, replaced: number, skipped: number, total = 10, minimal = false) => ({
      total,
      done,
      replaced,
      skipped,
      pending: total - done - replaced - skipped,
      score: (done + replaced * 0.5) / total,
      minimal,
    });
    expect(itemsToSuccess(sum(7, 0, 0))).toBe(0);
    expect(itemsToSuccess(sum(4, 0, 0))).toBe(3);
    // Un sostituito vale mezza voce: 5 + 0,5 → ne servono 2 (7 su 10).
    expect(itemsToSuccess(sum(5, 1, 0))).toBe(2);
    expect(itemsToSuccess(sum(2, 0, 6))).toBe(null);
    expect(itemsToSuccess(sum(0, 0, 0, 0))).toBe(null);
    expect(itemsToSuccess(sum(2, 0, 0, 4, true))).toBe(2);
    expect(itemsToSuccess(sum(2, 1, 0, 4, true))).toBe(null);
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
    expect(streakInfo(s, today)).toMatchObject({ days: 3, includesToday: false, jolly: 0 });
    dayLogs[today] = success(today);
    expect(streakInfo(makeState({ dayLogs }), today)).toMatchObject({ days: 4, includesToday: true });
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
    const counts = (it: TimelineItem) => itemCounts(TUE, it, s);
    expect(ids(overdueItems(min, { 'minima:telefono': 'fatto' }, '00:30', s.plan, counts))).toEqual(['minima:proteine', 'minima:integratori', 'minima:frutto']);
  });

  it('minuti al coprifuoco, anche a cavallo della mezzanotte', () => {
    expect(minutesToCurfew(TUE, '22:55', plan)).toBe(80);
    expect(minutesToCurfew(TUE, '00:20', plan)).toBe(-5);
  });
});

describe('primo avvio', () => {
  // Benvenuto completato mercoledì alle 15:30: la mattina non c'era ancora l'app.
  const withFirst = (patch: Partial<AppData> = {}) => {
    const s = makeState(patch);
    return { ...s, plan: { ...s.plan, firstUse: { date: WED, time: '15:30' } } as Plan };
  };

  it('legge il campo facoltativo e ignora valori non validi', () => {
    expect(firstUseOf(withFirst().plan)).toEqual({ date: WED, time: '15:30' });
    expect(firstUseOf(makeState().plan)).toBeNull();
    expect(firstUseOf({ ...makeState().plan, firstUse: { date: 'ieri', time: '15:30' } } as Plan)).toBeNull();
  });

  it('le voci prima dell\'inizio non contano e non restano indietro', () => {
    const s = withFirst();
    const items = buildDay(WED, s);
    expect(isBeforeStart(WED, byId(items, 'pasto:colazione')!, s.plan)).toBe(true);
    expect(isBeforeStart(WED, byId(items, 'pasto:merenda')!, s.plan)).toBe(false);
    const sum = adherenceSummary(WED, s);
    // Restano spesa di avvio, merenda pre-calcetto, calcetto, cena di recupero e coprifuoco.
    expect(sum.total).toBe(5);
    const late = overdueItems(items, {}, '15:40', s.plan, (it) => itemCounts(WED, it, s));
    expect(late).toEqual([]);
    // Il giorno dopo tutto conta di nuovo.
    expect(adherenceSummary(THU, s).total).toBe(buildDay(THU, s).filter((i) => i.kind !== 'letto').length);
  });

  it('spesa di avvio: il giorno stesso se c\'è tempo, altrimenti il primo giorno feriale', () => {
    const plan = (first: { date: ISODate; time: string }) => ({ ...makeState().plan, firstUse: first }) as Plan;
    // Mercoledì 15:30: mezz'ora dopo, la lista parte da mercoledì.
    expect(starterShopping(plan({ date: WED, time: '15:30' }))).toEqual({ date: WED, time: '16:00', weekStart: MON, fromDate: WED });
    // Mercoledì sera: giovedì un'ora dopo il pranzo.
    expect(starterShopping(plan({ date: WED, time: '21:10' }))).toEqual({ date: THU, time: '15:15', weekStart: MON, fromDate: WED });
    // Domenica sera: lunedì, lista di tutta la settimana che comincia.
    expect(starterShopping(plan({ date: '2026-11-08', time: '20:40' }))).toEqual({ date: MON, time: '15:15', weekStart: MON });
    // Sabato: c'è già la spesa del sabato.
    expect(starterShopping(plan({ date: SAT, time: '10:00' }))).toBeNull();
    expect(starterShopping(makeState().plan)).toBeNull();
    const s = withFirst();
    expect(byId(buildDay(WED, s), STARTER_SHOPPING_ID)?.time).toBe('16:00');
    expect(byId(buildDay(THU, s), STARTER_SHOPPING_ID)).toBeUndefined();
  });

  it('spesa di avvio: mai durante la seduta, il calcio o gli esercizi del fisioterapista', () => {
    const s0 = makeState();
    const at = (date: ISODate, time: string, patch: Partial<AppData> = {}) => {
      const st = { ...s0, ...patch, plan: { ...s0.plan, firstUse: { date, time } } as Plan };
      return { st, shop: starterShopping(st.plan, st)! };
    };
    const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    // Martedì 16:58, seduta A alle 17:00: niente spesa tra le 16:45 e la fine della seduta più doccia e rientro.
    const { st, shop } = at(TUE, '16:58');
    const gymEnd = 17 * 60 + gymDuration('A', st)!.total + 30;
    expect(shop.date).toBe(TUE);
    expect(min(shop.time)).toBeGreaterThanOrEqual(gymEnd);
    expect(min(shop.time)).toBeLessThanOrEqual(19 * 60 + 30);
    const items = buildDay(TUE, st);
    const gym = byId(items, 'palestra:A')!;
    const spesa = byId(items, STARTER_SHOPPING_ID)!;
    expect(min(spesa.time)).toBeGreaterThan(min(gym.time) + gymDuration('A', st)!.total);
    // Con almeno un'ora prima della seduta la spesa resta prima.
    expect(at(TUE, '15:00').shop.time).toBe('15:30');
    // Alle 16:00 non ci sta più: dopo la seduta.
    expect(min(at(TUE, '16:00').shop.time)).toBeGreaterThanOrEqual(gymEnd);
    // Giovedì 19:00, allenamento alle 20:30 con la merenda pre-calcio alle 18:00: niente posto, venerdì dopo pranzo.
    expect(at(THU, '19:00').shop).toMatchObject({ date: '2026-11-13', time: '15:15' });
    // Mercoledì con gli esercizi del fisioterapista dopo pranzo: la spesa aspetta che finiscano.
    const physio = { exercises: [], prescriptions: [{ exerciseId: 'tyler-twist', sets: 3, repMin: 15, repMax: 15, unit: 'reps', restSec: 60 }] } as unknown as AppData['physio'];
    const withPhysio = at(WED, '14:00', { physio });
    const fisio = byId(buildDay(WED, withPhysio.st), 'fisio')!;
    const fisioEnd = min(fisio.time) + physioMinutes(physio);
    const spesaWed = min(withPhysio.shop.time);
    expect(spesaWed + 45 <= min(fisio.time) || spesaWed >= fisioEnd).toBe(true);
  });

  it('la domenica del primo avvio non ha revisione né preparazione', () => {
    const s0 = makeState();
    const first = { ...s0, plan: { ...s0.plan, firstUse: { date: SUN, time: '20:40' } } as Plan };
    expect(ritualItems(SUN, first).map((i) => i.kind)).toEqual([]);
    // Senza primo avvio (dati di esempio) restano entrambe.
    expect(ritualItems(SUN, s0).map((i) => i.kind)).toEqual(['preparazione', 'revisione']);
    // Chi comincia a metà settimana prepara già la domenica dopo.
    expect(ritualItems(SUN, withFirst()).map((i) => i.kind)).toEqual(['preparazione', 'revisione']);
    // Chi comincia di domenica prepara quella dopo.
    expect(ritualItems('2026-11-22', first).map((i) => i.kind)).toEqual(['preparazione', 'revisione']);
  });

  it('la revisione arriva con la prima settimana da rivedere (come firstReviewWeek)', () => {
    const s0 = makeState();
    const at = (date: ISODate, startDate: ISODate = MON) => ({ ...s0, plan: { ...s0.plan, startDate, firstUse: { date, time: '10:00' } } as Plan });
    const kinds = (iso: ISODate, st: AppData) => ritualItems(iso, st).map((i) => i.kind);
    // Sabato: due giorni soli, la prima revisione è la domenica dopo.
    expect(kinds(SUN, at(SAT))).not.toContain('revisione');
    expect(kinds('2026-11-22', at(SAT))).toContain('revisione');
    // Venerdì con il piano che parte il lunedì dopo (planStartFor): niente revisione domenica.
    expect(kinds(SUN, at('2026-11-13', '2026-11-16'))).not.toContain('revisione');
    expect(kinds('2026-11-22', at('2026-11-13', '2026-11-16'))).toContain('revisione');
    // Giovedì: la settimana si rivede già.
    expect(kinds(SUN, at(THU))).toContain('revisione');
  });

  it('prima della spesa di avvio i pasti si fanno con quello che c’è in casa', () => {
    // Benvenuto completato domenica alle 16:30: spesa di avvio lunedì alle 15:15.
    const s0 = makeState();
    const s = { ...s0, plan: { ...s0.plan, firstUse: { date: SUN0, time: '16:30' } } as Plan };
    expect(firstShopping(s)).toEqual({ id: STARTER_SHOPPING_ID, date: MON, time: '15:15' });
    const flags = (iso: ISODate, st: TimelineState = s) =>
      Object.fromEntries(buildDay(iso, st).filter((i) => i.kind === 'pasto').map((i) => [i.slot, Boolean(i.preShopping)]));
    expect(flags(SUN0)).toMatchObject({ merenda: true, cena: true });
    expect(flags(MON)).toEqual({ colazione: true, spuntino: true, pranzo: true, merenda: false, cena: false });
    expect(Object.values(flags(TUE)).some(Boolean)).toBe(false);
    const colazione = byId(buildDay(MON, s), 'pasto:colazione')!;
    expect(colazione.detail).toBe(PRE_SHOPPING_DETAIL);
    // La ricetta resta nel riferimento, per il menù e la spesa.
    expect(colazione.ref).toBeTruthy();
    // Spesa fatta prima del previsto: da lì si segue il menù.
    const done = { ...s, dayLogs: { [MON]: log(MON, { [STARTER_SHOPPING_ID]: 'fatto' }) } };
    expect(Object.values(flags(MON, done)).some(Boolean)).toBe(false);
    // Ricetta scelta a mano: chi la sceglie ha gli ingredienti.
    const swapped = { ...s, dayLogs: { [MON]: log(MON, {}, { recipeSwaps: { pranzo: 'pasta-ceci-rosmarino' } }) } };
    expect(flags(MON, swapped)).toMatchObject({ colazione: true, pranzo: false });
    // Senza primo avvio (dati di esempio) niente cambia.
    expect(Object.values(flags(MON, s0)).some(Boolean)).toBe(false);
  });

  it('chi comincia il sabato fa la spesa dopo il primo avvio', () => {
    const s0 = makeState();
    const at = (time: string) => ({ ...s0, plan: { ...s0.plan, firstUse: { date: SAT, time } } as Plan });
    expect(byId(ritualItems(SAT, at('08:00')), 'rito:spesa')?.time).toBe(byId(ritualItems(SAT, s0), 'rito:spesa')?.time);
    expect(byId(ritualItems(SAT, at('15:40')), 'rito:spesa')?.time).toBe('16:10');
    expect(firstShopping(at('15:40'))).toEqual({ id: 'rito:spesa', date: SAT, time: '16:10' });
    const pre = buildDay(SAT, at('08:00')).filter((i) => i.preShopping).map((i) => i.slot);
    expect(pre).toContain('colazione');
    expect(pre).not.toContain('cena');
  });

  it('chi comincia il sabato compra con la spesa del sabato anche i pasti di avvio del fine settimana', () => {
    const s0 = makeState();
    const NEXT = addDays(SAT, 2);
    const st = { ...s0, plan: { ...s0.plan, startDate: NEXT, firstUse: { date: SAT, time: '09:00' } } as Plan };
    const lead = shoppingLeadFor(NEXT, st);
    expect(lead?.date).toBe(SAT);
    // I pasti prima della spesa si fanno con quello che c'è in casa: restano fuori dalla lista.
    expect(lead?.skipSlots).toEqual(expect.arrayContaining(['colazione', 'spuntino']));
    expect(lead?.skipSlots).not.toContain('cena');
    const list = shoppingList(NEXT, st, shoppingOptionsFor(NEXT, st));
    expect(list.leadDates).toEqual([SAT, SUN]);
    expect(list.mealCount).toBeGreaterThan(shoppingList(NEXT, st).mealCount);
    expect(list.items.some((i) => i.uses.some((u) => u.date === SAT && u.slot === 'colazione'))).toBe(false);
    expect(list.items.some((i) => i.uses.some((u) => u.date === SUN))).toBe(true);
    // Il fresco del fine settimana si mangia subito dopo la spesa: niente da congelare per sabato e domenica.
    expect(list.items.some((i) => i.freezeDates?.some((d) => d < NEXT))).toBe(false);
    // Le settimane dopo e chi ha la spesa di avvio non cambiano.
    expect(shoppingLeadFor(addDays(NEXT, 7), st)).toBeUndefined();
    const mid = { ...s0, plan: { ...s0.plan, firstUse: { date: WED, time: '15:30' } } as Plan };
    expect(shoppingLeadFor(addDays(WED, 5), mid)).toBeUndefined();
  });

  it('la lista dietro la spesa è quella di Settimana: spuntarla tutta segna la voce', () => {
    const s = withFirst();
    const item = byId(buildDay(WED, s), STARTER_SHOPPING_ID)!;
    const target = shoppingTarget(WED, s, item)!;
    // Spesa di avvio: la lista della settimana del primo avvio, da mercoledì.
    expect(target.weekStart).toBe(MON);
    expect(target.keys).toEqual(shoppingList(MON, s, { fromDate: WED }).items.map((i) => i.key));
    expect(target.keys.length).toBeGreaterThan(0);
    expect(derivedStatus(WED, s, item)).toBeUndefined();
    const checked = { ...s, shoppingChecked: { [MON]: target.keys } };
    expect(derivedStatus(WED, checked, item)).toBe('fatto');
    // Spesa del sabato: la lista della settimana dopo, con le stesse opzioni di Settimana.
    const s0 = makeState();
    const sat = byId(buildDay(SAT, s0), 'rito:spesa')!;
    const next = addDays(SAT, 2);
    expect(shoppingTarget(SAT, s0, sat)).toEqual({ weekStart: next, keys: shoppingList(next, s0, shoppingOptionsFor(next, s0)).items.map((i) => i.key) });
    // Le altre voci non hanno lista.
    expect(shoppingTarget(SAT, s0, { id: 'pasto:pranzo', kind: 'pasto' })).toBeNull();
  });

  it('i giorni prima del primo avvio non contano nella serie', () => {
    const s = withFirst();
    const done = markAll(s, WED, 'fatto');
    const st = { ...s, dayLogs: { [WED]: log(WED, done) } };
    expect(daySuccessful(WED, st)).toBe(true);
    expect(streakInfo(st, THU)).toMatchObject({ days: 1, best: 1 });
  });
});

describe('riti del fine settimana', () => {
  const state = makeState();

  it('sabato la spesa, dopo la seduta C se si sovrappone', () => {
    const sat = buildDay(SAT, state);
    const spesa = byId(sat, 'rito:spesa');
    expect(spesa?.kind).toBe('spesa');
    // Seduta C alle 11:00 (circa 40 minuti): la spesa slitta a dopo.
    expect(spesa && dayMinutes(spesa.time, state.plan)).toBeGreaterThan(11 * 60 + 30);
    expect(buildTimeline(SAT, state).some((i) => i.id === 'rito:spesa')).toBe(false);
    // Senza seduta resta alle 11:30.
    const plan: Plan = { ...state.plan, week: state.plan.week.map((d) => (d.weekday === 5 ? { ...d, gymSessionId: undefined } : d)) };
    expect(byId(buildDay(SAT, makeState({ plan })), 'rito:spesa')?.time).toBe('11:30');
  });

  it('domenica preparazione che finisce prima della revisione delle 18:00', () => {
    const sun = buildDay(SUN, state);
    const prep = byId(sun, 'rito:preparazione');
    const review = byId(sun, 'rito:revisione');
    expect(review?.time).toBe('18:00');
    expect(prep).toBeDefined();
    expect(sp(prep?.detail)).toMatch(/attività · /);
    expect(dayMinutes(prep!.time, state.plan)).toBeLessThanOrEqual(17 * 60);
    const order = ids(sun);
    expect(order.indexOf('rito:preparazione')).toBeLessThan(order.indexOf('rito:revisione'));
    expect(order.indexOf('rito:revisione')).toBeLessThan(order.indexOf('pasto:cena'));
  });

  it('nessun rito negli altri giorni né in giornata minima', () => {
    expect(buildDay(TUE, state).some((i) => i.id.startsWith('rito:'))).toBe(false);
    const min = makeState({ dayLogs: { [SUN]: log(SUN, {}, { minimal: true }) } });
    expect(buildDay(SUN, min).some((i) => i.id.startsWith('rito:'))).toBe(false);
  });

  it('stato ricavato: revisione salvata e preparazione completa', () => {
    const sun = buildDay(SUN, state);
    const review = byId(sun, 'rito:revisione')!;
    const prep = byId(sun, 'rito:preparazione')!;
    expect(derivedStatus(SUN, state, review)).toBeUndefined();
    const reviewed = makeState({
      reviews: [{ weekStart: '2026-11-09', votes: { energia: 7, digestione: 7, umore: 7, campo: 7 }, acceptedProposals: [] }],
    });
    expect(derivedStatus(SUN, reviewed, review)).toBe('fatto');
    expect(derivedStatus(SUN, state, prep)).toBeUndefined();
    // Tutte le attività della settimana dopo spuntate (per il lunedì 16).
    const next = nextWeekPrep(SUN, state.plan);
    expect(next.weekStart).toBe('2026-11-16');
    const all = makeState({ prepDone: { [next.weekStart]: next.tasks.map((t) => t.id) } });
    expect(derivedStatus(SUN, all, prep)).toBe('fatto');
    const partial = makeState({ prepDone: { [next.weekStart]: next.tasks.slice(1).map((t) => t.id) } });
    expect(derivedStatus(SUN, partial, prep)).toBeUndefined();
  });

  it('i riti contano nell\'aderenza del giorno', () => {
    const sum = adherenceSummary(SUN, state);
    expect(sum.total).toBe(buildDay(SUN, state).filter((i) => i.kind !== 'letto').length);
    expect(sum.total).toBeGreaterThan(buildTimeline(SUN, state).filter((i) => i.kind !== 'letto').length);
  });
});

describe('coprifuoco onesto', () => {
  const state = makeState();
  const items = buildTimeline(TUE, state);
  const curfew = byId(items, 'coprifuoco')!;

  it('coprifuoco, letto e telefono fuori si segnano da un\'ora prima del coprifuoco', () => {
    // Coprifuoco alle 00:15: si segna dalle 23:15.
    expect(markableFrom(TUE, curfew, state.plan)).toBe('23:15');
    expect(canMarkNow(TUE, curfew, '15:00', state.plan)).toBe(false);
    expect(canMarkNow(TUE, curfew, '23:14', state.plan)).toBe(false);
    expect(canMarkNow(TUE, curfew, '23:15', state.plan)).toBe(true);
    expect(canMarkNow(TUE, curfew, '00:40', state.plan)).toBe(true);
    expect(canMarkNow(TUE, byId(items, 'letto')!, '20:00', state.plan)).toBe(false);
    expect(canMarkNow(TUE, { id: 'minima:telefono', kind: 'minima' }, '15:00', state.plan)).toBe(false);
    expect(canMarkNow(TUE, { id: 'minima:frutto', kind: 'minima' }, '15:00', state.plan)).toBe(true);
    expect(markableFrom(TUE, byId(items, 'pasto:pranzo')!, state.plan)).toBeNull();
  });

  it('la sera di ieri si sistema anche il mattino dopo', () => {
    expect(canMarkNow(TUE, curfew, '08:00', state.plan, WED)).toBe(true);
  });

  it('voci di ieri ancora aperte', () => {
    const s = makeState({ dayLogs: { [TUE]: log(TUE, markAll(state, TUE, 'fatto', ['pasto:cena', 'coprifuoco'])) } });
    expect(ids(openItems(TUE, s))).toEqual(['pasto:cena', 'coprifuoco']);
  });
});

describe('serie con jolly', () => {
  const s0 = makeState();
  const success = (d: ISODate) => log(d, markAll(s0, d, 'fatto'));
  const fail = (d: ISODate) => log(d, { 'pasto:colazione': 'fatto' });
  // Settimana dal 2 all'8 novembre e la successiva dal 9 al 15.
  const days = (from: ISODate, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

  it('5 giornate riuscite in una settimana fanno guadagnare un jolly', () => {
    const dayLogs: Record<ISODate, DayLog> = {};
    for (const d of days('2026-11-02', 5)) dayLogs[d] = success(d);
    const info = streakInfo(makeState({ dayLogs }), '2026-11-07');
    expect(info).toMatchObject({ days: 5, jolly: 1, jollyDays: [] });
  });

  it('con 4 giornate riuscite niente jolly: la giornata storta azzera la serie', () => {
    const dayLogs: Record<ISODate, DayLog> = {};
    for (const d of days('2026-11-02', 4)) dayLogs[d] = success(d);
    dayLogs['2026-11-06'] = fail('2026-11-06');
    const info = streakInfo(makeState({ dayLogs }), '2026-11-07');
    expect(info).toMatchObject({ days: 0, jolly: 0, best: 4 });
  });

  it('il jolly salva la serie una volta: il giorno salvato non si somma', () => {
    const dayLogs: Record<ISODate, DayLog> = {};
    for (const d of days('2026-11-02', 5)) dayLogs[d] = success(d);
    dayLogs['2026-11-07'] = fail('2026-11-07');
    dayLogs['2026-11-08'] = success('2026-11-08');
    const info = streakInfo(makeState({ dayLogs }), '2026-11-09');
    expect(info).toMatchObject({ days: 6, jolly: 0, jollyDays: ['2026-11-07'], best: 6 });
  });

  it('due giornate storte di fila: il secondo giorno senza jolly azzera', () => {
    const dayLogs: Record<ISODate, DayLog> = {};
    for (const d of days('2026-11-02', 5)) dayLogs[d] = success(d);
    dayLogs['2026-11-07'] = fail('2026-11-07');
    dayLogs['2026-11-08'] = fail('2026-11-08');
    const info = streakInfo(makeState({ dayLogs }), '2026-11-09');
    expect(info).toMatchObject({ days: 0, jolly: 0, jollyDays: [], best: 5 });
  });

  it('al massimo un jolly da parte, anche dopo due settimane piene', () => {
    const dayLogs: Record<ISODate, DayLog> = {};
    for (const d of days('2026-11-02', 14)) dayLogs[d] = success(d);
    const info = streakInfo(makeState({ dayLogs }), '2026-11-16');
    expect(info).toMatchObject({ days: 14, jolly: 1 });
  });

  it('oggi in corso non consuma il jolly', () => {
    const dayLogs: Record<ISODate, DayLog> = {};
    for (const d of days('2026-11-02', 5)) dayLogs[d] = success(d);
    dayLogs['2026-11-07'] = fail('2026-11-07');
    expect(streakInfo(makeState({ dayLogs }), '2026-11-07')).toMatchObject({ days: 5, jolly: 1, includesToday: false });
  });
});

describe('notti in orario', () => {
  const s0 = makeState();
  const plan = s0.plan; // a letto alle 00:45

  it('conta le notti consecutive dai controlli del mattino; stanotte senza controllo non spezza', () => {
    const checkIns: Record<ISODate, AppData['checkIns'][string]> = {
      [TUE]: { date: TUE, pain: {}, bedTime: '00:40' },
      [WED]: { date: WED, pain: {}, bedTime: '00:55' },
      [THU]: { date: THU, pain: {}, bedTime: '01:30' },
    };
    // Venerdì mattina senza controllo: la notte di giovedì non si sa ancora; quella di mercoledì è tardi.
    expect(nightStreak(makeState({ checkIns, plan }), '2026-11-13')).toBe(0);
    const ok = { ...checkIns, [THU]: { date: THU, pain: {}, bedTime: '00:30' } };
    expect(nightStreak(makeState({ checkIns: ok, plan }), '2026-11-13')).toBe(3);
  });

  it('vale anche la voce A letto segnata', () => {
    const dayLogs = { [WED]: log(WED, { letto: 'fatto' }) };
    expect(nightStreak(makeState({ dayLogs }), THU)).toBe(1);
    expect(nightStreak(makeState({ dayLogs }), '2026-11-13')).toBe(1);
    expect(nightStreak(makeState({ dayLogs: { [WED]: log(WED, { letto: 'saltato' }) } }), THU)).toBe(0);
  });
});
