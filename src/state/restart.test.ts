/**
 * «Ricomincia da capo»: via il diario e lo storico, restano profilo, settimana tipo e impostazioni; il piano riparte di
 * lunedì come alla fine del benvenuto. Dati inventati.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAppData } from '../data/defaults';
import { useApp } from './store';

function load(): void {
  useApp.getState().resetAll();
  const base = defaultAppData('2026-11-02');
  useApp.setState({
    ...base,
    onboarded: true,
    profile: { ...base.profile, name: 'Prova', startWeightKg: 70 },
    plan: {
      ...base.plan,
      startDate: '2026-11-02',
      firstUse: { date: '2026-11-01', time: '10:00' },
      week: base.plan.week.map((d) => (d.weekday === 0 ? { ...d, work: [{ from: '09:00', to: '13:00' }] } : d)),
      exclusions: [{ foodId: 'tonno', since: '2026-11-03', origin: 'impostazioni' }],
      menus: { '2026-11-09': { days: [] } as never },
      weekOverrides: { '2026-11-09': 'leggera' },
      impactHold: { site: 'Tibia', since: '2026-11-05' },
    },
    dayLogs: { '2026-11-03': { date: '2026-11-03', status: { colazione: 'fatto' }, waterGlasses: 3, sweets: 0, notes: {} } as never },
    checkIns: { '2026-11-03': { date: '2026-11-03', weightKg: 70.2, pain: {} } },
    workoutLogs: [{ id: 'w1', date: '2026-11-03', sessionId: 'A', durationMin: 40, rpe: 7, sets: [] } as never],
    shoppingChecked: { '2026-11-02': ['kiwi'] },
    prepDone: { '2026-11-02': ['riso'] },
    chat: [{ id: 'c1', role: 'user', text: 'ciao', at: '2026-11-03T10:00:00.000Z' } as never],
    planner: { proposals: [] },
    settings: { ...base.settings, coachApiKey: 'chiave-finta', demoData: false },
  });
}

beforeEach(() => load());

describe('ricomincia da capo', () => {
  it('di sabato: diario e storico vuoti, piano dal lunedì dopo, primo avvio adesso', () => {
    useApp.getState().restartPlan(new Date(2026, 10, 14, 17, 30));
    const s = useApp.getState();
    expect(s.onboarded).toBe(true);
    expect(s.dayLogs).toEqual({});
    expect(s.checkIns).toEqual({});
    expect(s.workoutLogs).toEqual([]);
    expect(s.footballLogs).toEqual([]);
    expect(s.reviews).toEqual([]);
    expect(s.shoppingChecked).toEqual({});
    expect(s.prepDone).toEqual({});
    expect(s.chat).toEqual([]);
    expect(s.planner).toBeUndefined();
    expect(s.planVersions).toBeUndefined();
    expect(s.plan.startDate).toBe('2026-11-16');
    expect(s.plan.firstUse).toEqual({ date: '2026-11-14', time: '17:30' });
    expect(s.plan.menus).toBeUndefined();
    expect(s.plan.weekOverrides).toBeUndefined();
    expect(s.plan.impactHold).toBeUndefined();
    expect(s.plan.program).toBeUndefined();
  });

  it('restano profilo, settimana con il lavoro, esclusioni, integratori e impostazioni', () => {
    const before = useApp.getState();
    useApp.getState().restartPlan(new Date(2026, 10, 14, 17, 30));
    const s = useApp.getState();
    expect(s.profile).toEqual(before.profile);
    expect(s.plan.week).toEqual(before.plan.week);
    expect(s.plan.week.find((d) => d.weekday === 0)?.work).toEqual([{ from: '09:00', to: '13:00' }]);
    expect(s.plan.exclusions).toEqual(before.plan.exclusions);
    expect(s.plan.supplements).toEqual(before.plan.supplements);
    expect(s.plan.targets).toEqual(before.plan.targets);
    expect(s.plan.mealTimes).toEqual(before.plan.mealTimes);
    expect(s.settings).toEqual(before.settings);
  });

  it('di lunedì il piano parte lo stesso giorno', () => {
    useApp.getState().restartPlan(new Date(2026, 10, 16, 7, 0));
    expect(useApp.getState().plan.startDate).toBe('2026-11-16');
  });

  it('con i dati di esempio o prima del benvenuto non fa niente', () => {
    useApp.setState((s) => ({ settings: { ...s.settings, demoData: true } }));
    useApp.getState().restartPlan(new Date(2026, 10, 14, 17, 30));
    expect(Object.keys(useApp.getState().dayLogs)).toHaveLength(1);
    useApp.setState((s) => ({ onboarded: false, settings: { ...s.settings, demoData: false } }));
    useApp.getState().restartPlan(new Date(2026, 10, 14, 17, 30));
    expect(Object.keys(useApp.getState().dayLogs)).toHaveLength(1);
  });
});
