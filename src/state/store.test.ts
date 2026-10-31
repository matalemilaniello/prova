import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAppData } from '../data/defaults';
import { emptyDayLog, latestWeight, migrateData, normalizeData, pickData, useApp, useUi } from './store';

describe('store', () => {
  beforeEach(() => {
    useApp.getState().resetAll();
  });

  it('stato iniziale da configurare', () => {
    const s = useApp.getState();
    expect(s.onboarded).toBe(false);
    expect(s.plan.week).toHaveLength(7);
    expect(s.getDayLog('2026-11-10')).toEqual(emptyDayLog('2026-11-10'));
    expect(useApp.getState().dayLogs['2026-11-10']).toBeUndefined();
  });

  it('stati delle voci, note e annullamento', () => {
    const a = useApp.getState();
    a.setItemStatus('2026-11-10', 'pasto:pranzo', 'sostituito', ' Panino al bar ');
    expect(useApp.getState().dayLogs['2026-11-10'].status['pasto:pranzo']).toBe('sostituito');
    expect(useApp.getState().dayLogs['2026-11-10'].notes['pasto:pranzo']).toBe('Panino al bar');
    a.setItemStatus('2026-11-10', 'pasto:pranzo', null);
    expect(useApp.getState().dayLogs['2026-11-10'].status['pasto:pranzo']).toBeUndefined();
    expect(useApp.getState().dayLogs['2026-11-10'].notes['pasto:pranzo']).toBeUndefined();
  });

  it('acqua e dolci non scendono sotto zero', () => {
    const a = useApp.getState();
    a.addWater('2026-11-10', 2);
    a.addWater('2026-11-10', -5);
    a.addSweet('2026-11-10', 1);
    expect(useApp.getState().dayLogs['2026-11-10'].waterGlasses).toBe(0);
    expect(useApp.getState().dayLogs['2026-11-10'].sweets).toBe(1);
  });

  it('sostituzione di ricetta e ritorno al menù', () => {
    const a = useApp.getState();
    a.swapRecipe('2026-11-10', 'cena', 'r2');
    expect(useApp.getState().dayLogs['2026-11-10'].recipeSwaps.cena).toBe('r2');
    a.swapRecipe('2026-11-10', 'cena', null);
    expect(useApp.getState().dayLogs['2026-11-10'].recipeSwaps.cena).toBeUndefined();
  });

  it('upsert di sedute, calcio e revisioni', () => {
    const a = useApp.getState();
    a.saveWorkout({ id: 'w1', date: '2026-11-10', sessionId: 'A', durationMin: 50, rpe: 7, pain: {}, exercises: [] });
    a.saveWorkout({ id: 'w1', date: '2026-11-10', sessionId: 'A', durationMin: 55, rpe: 8, pain: {}, exercises: [] });
    a.saveWorkout({ id: 'w0', date: '2026-11-03', sessionId: 'B', durationMin: 60, rpe: 7, pain: {}, exercises: [] });
    expect(useApp.getState().workoutLogs.map((w) => w.id)).toEqual(['w0', 'w1']);
    expect(useApp.getState().workoutLogs[1].durationMin).toBe(55);
    a.deleteWorkout('w0');
    expect(useApp.getState().workoutLogs).toHaveLength(1);
    a.saveReview({ weekStart: '2026-11-02', votes: { energia: 7, digestione: 7, umore: 7, campo: 7 }, acceptedProposals: [] });
    a.saveReview({ weekStart: '2026-11-02', votes: { energia: 8, digestione: 7, umore: 7, campo: 7 }, acceptedProposals: ['sonno'] });
    expect(useApp.getState().reviews).toHaveLength(1);
    expect(useApp.getState().reviews[0].votes.energia).toBe(8);
  });

  it('applyProposal: orario a letto e calorie dai carboidrati', () => {
    const a = useApp.getState();
    const before = useApp.getState().plan.targets.palestra;
    a.applyProposal({ id: 'p1', area: 'sonno', title: '', reason: '', apply: { type: 'sleepCurrent', value: '00:30' } });
    expect(useApp.getState().plan.sleep.current).toBe('00:30');
    a.applyProposal({ id: 'p2', area: 'calorie', title: '', reason: '', apply: { type: 'kcalDelta', value: 150 } });
    const after = useApp.getState().plan.targets.palestra;
    expect(after.kcal).toBe(before.kcal + 150);
    expect(after.carbG).toBe(before.carbG + 40);
    expect(after.proteinG).toBe(before.proteinG);
  });

  it('spesa e preparazione si spuntano e si tolgono', () => {
    const a = useApp.getState();
    a.toggleShopping('2026-11-09', 'pollo');
    a.togglePrep('2026-11-09', 'riso');
    expect(useApp.getState().shoppingChecked['2026-11-09']).toEqual(['pollo']);
    a.toggleShopping('2026-11-09', 'pollo');
    expect(useApp.getState().shoppingChecked['2026-11-09']).toEqual([]);
    expect(useApp.getState().prepDone['2026-11-09']).toEqual(['riso']);
  });

  it('chat: aggiunge con id e aggiorna', () => {
    const id = useApp.getState().addChat({ role: 'user', text: 'Ciao' });
    useApp.getState().updateChat(id, { text: 'Ciao coach' });
    expect(useApp.getState().chat[0]).toMatchObject({ id, text: 'Ciao coach', role: 'user' });
  });

  it('dati di esempio: carica e rimuove ripristinando i dati dell’utente', () => {
    const a = useApp.getState();
    a.completeOnboarding({ ...a.profile, heightCm: 180, birthYear: 1990, startWeightKg: 75 }, a.plan);
    a.addWater('2026-11-10', 3);
    a.loadDemo('2026-11-12');
    expect(useApp.getState().settings.demoData).toBe(true);
    expect(useApp.getState().workoutLogs.length).toBeGreaterThan(0);
    useApp.getState().clearDemo();
    expect(useApp.getState().settings.demoData).toBe(false);
    expect(useApp.getState().profile.heightCm).toBe(180);
    expect(useApp.getState().dayLogs['2026-11-10'].waterGlasses).toBe(3);
  });

  it('import: rifiuta contenuti estranei, completa i campi mancanti', () => {
    expect(useApp.getState().importData({ foo: 1 })).toBe(false);
    expect(useApp.getState().importData('testo')).toBe(false);
    const data = pickData({ ...defaultAppData(), onboarded: true });
    const partial = { ...data, chat: undefined, plan: { ...data.plan, sleep: { wake: '06:45' } } };
    expect(useApp.getState().importData(partial)).toBe(true);
    const s = useApp.getState();
    expect(s.onboarded).toBe(true);
    expect(s.chat).toEqual([]);
    expect(s.plan.sleep.wake).toBe('06:45');
    expect(s.plan.sleep.target).toBe('23:30');
  });

  it('normalizeData e migrateData sono robusti', () => {
    expect(normalizeData(null).plan.week).toHaveLength(7);
    expect(migrateData({ onboarded: true }, 0).onboarded).toBe(true);
    expect(latestWeight({ checkIns: {}, profile: { ...defaultAppData().profile, startWeightKg: 72 } })).toBe(72);
  });

  it('toast in coda', () => {
    const id = useUi.getState().toast('Salvato', 'good');
    expect(useUi.getState().toasts.find((t) => t.id === id)?.tone).toBe('good');
    useUi.getState().dismissToast(id);
    expect(useUi.getState().toasts.find((t) => t.id === id)).toBeUndefined();
  });
});
