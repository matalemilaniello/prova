import { beforeEach, describe, expect, it } from 'vitest';
import { DATA_VERSION, defaultAppData } from '../data/defaults';
import {
  emptyDayLog,
  latestWeight,
  migrateData,
  normalizeBarMeal,
  normalizeData,
  normalizeImpactThreshold,
  persistedData,
  pickData,
  useApp,
  useUi,
} from './store';

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

  it('pasto al bar: si salva pulito e se ne va quando il pasto non è più sostituito', () => {
    const a = useApp.getState();
    const d = '2026-11-10';
    const order = { label: ' Toast e spremuta ', nutrients: { kcal: 420, proteinG: 22, carbG: 55, fatG: 12, fiberG: 4 }, vegPortions: 1 };
    a.setItemStatus(d, 'pasto:spuntino', 'sostituito', 'Toast e spremuta');
    a.setBarMeal(d, 'spuntino', order);
    expect(useApp.getState().dayLogs[d].barMeals?.spuntino).toEqual({ ...order, label: 'Toast e spremuta' });
    // Rimettere la stessa sostituzione non lo toglie; fatto, saltato o annulla sì.
    a.setItemStatus(d, 'pasto:spuntino', 'sostituito');
    expect(useApp.getState().dayLogs[d].barMeals?.spuntino).toBeDefined();
    a.setItemStatus(d, 'pasto:spuntino', 'fatto');
    expect(useApp.getState().dayLogs[d].barMeals).toBeUndefined();
    a.setBarMeal(d, 'pranzo', order);
    a.setItemStatus(d, 'pasto:pranzo', null);
    expect(useApp.getState().dayLogs[d].barMeals).toBeUndefined();
    // Un ordine illeggibile non si salva e toglie quello di prima.
    a.setBarMeal(d, 'merenda', order);
    a.setBarMeal(d, 'merenda', { label: '', nutrients: order.nutrients });
    expect(useApp.getState().dayLogs[d].barMeals).toBeUndefined();
    a.setBarMeal(d, 'cena', order);
    a.setBarMeal(d, 'cena', null);
    expect(useApp.getState().dayLogs[d].barMeals).toBeUndefined();
    // Le altre voci non toccano i pasti al bar.
    a.setBarMeal(d, 'cena', order);
    a.setItemStatus(d, 'integratori', 'fatto');
    expect(useApp.getState().dayLogs[d].barMeals?.cena).toBeDefined();
  });

  it('pasti al bar e soglia per gli impatti si riparano da un backup rovinato', () => {
    const base = pickData(useApp.getState());
    const fixed = normalizeData({
      ...base,
      plan: { ...base.plan, impactThreshold: '2,5' },
      dayLogs: {
        '2026-11-10': {
          date: '2026-11-10',
          status: { 'pasto:spuntino': 'sostituito', 'pasto:pranzo': 'sostituito', 'pasto:cena': 'sostituito', 'pasto:merenda': 'sostituito' },
          barMeals: {
            spuntino: { label: ' Toast\n e  spremuta ', nutrients: { kcal: '380', proteinG: '20', carbG: 40, fatG: 'x', fiberG: -3 }, vegPortions: '1,5' },
            pranzo: { label: '', nutrients: { kcal: 500 } },
            cena: { label: 'Piadina', nutrients: { proteinG: 20 } },
            brunch: { label: 'Uova', nutrients: { kcal: 400 } },
            merenda: 'yogurt',
            // Il pasto è segnato fatto: l'ordine rimasto non vale più.
            colazione: { label: 'Cappuccino e brioche', nutrients: { kcal: 330 } },
          },
        },
        '2026-11-12': {
          date: '2026-11-12',
          status: { 'pasto:colazione': 'fatto' },
          barMeals: { colazione: { label: 'Cappuccino e brioche', nutrients: { kcal: 330 } } },
        },
        '2026-11-11': { date: '2026-11-11', status: {}, barMeals: [] },
      },
    });
    expect(fixed.plan.impactThreshold).toBe(2.5);
    expect(fixed.dayLogs['2026-11-10'].barMeals).toEqual({
      spuntino: { label: 'Toast e spremuta', nutrients: { kcal: 380, proteinG: 20, carbG: 40, fatG: 0, fiberG: 0 }, vegPortions: 1.5 },
    });
    expect('barMeals' in fixed.dayLogs['2026-11-11']).toBe(false);
    expect('barMeals' in fixed.dayLogs['2026-11-12']).toBe(false);
    for (const bad of [{ ...base.plan, impactThreshold: 'tanto' }, { ...base.plan, impactThreshold: null }, { ...base.plan, impactThreshold: true }]) {
      expect('impactThreshold' in normalizeData({ ...base, plan: bad }).plan).toBe(false);
    }
    expect(normalizeData({ ...base, plan: { ...base.plan, impactThreshold: 14 } }).plan.impactThreshold).toBe(10);
    expect(normalizeImpactThreshold(-1)).toBe(0);
    expect(normalizeImpactThreshold(undefined)).toBeUndefined();
    // Al mezzo punto, come la scala del dolore; 2 coincide sempre con il predefinito min(soglia, 2) e toglie il campo.
    expect(normalizeImpactThreshold('1,3')).toBe(1.5);
    expect(normalizeImpactThreshold(0.2)).toBe(0);
    expect(normalizeImpactThreshold(2)).toBeUndefined();
    expect(normalizeImpactThreshold('2,1')).toBeUndefined();
    expect('impactThreshold' in normalizeData({ ...base, plan: { ...base.plan, impactThreshold: 2 } }).plan).toBe(false);
    expect(normalizeBarMeal({ label: 'Pizza', nutrients: { kcal: 9000, proteinG: 900 } })?.nutrients).toMatchObject({ kcal: 3000, proteinG: 300 });
    expect('impactThreshold' in normalizeData(base).plan).toBe(false);
  });

  it('updatePlan: la soglia per gli impatti resta un numero da 0 a 10', () => {
    const a = useApp.getState();
    a.updatePlan({ impactThreshold: 3 });
    expect(useApp.getState().plan.impactThreshold).toBe(3);
    a.updatePlan({ impactThreshold: 12 });
    expect(useApp.getState().plan.impactThreshold).toBe(10);
    a.updatePlan({ impactThreshold: Number.NaN });
    expect('impactThreshold' in useApp.getState().plan).toBe(false);
    a.updatePlan({ impactThreshold: 1.25 });
    expect(useApp.getState().plan.impactThreshold).toBe(1.5);
    a.updatePlan({ impactThreshold: 2 });
    expect('impactThreshold' in useApp.getState().plan).toBe(false);
    a.updatePlan({ impactThreshold: 1 });
    a.updatePlan({ impactThreshold: undefined });
    expect('impactThreshold' in useApp.getState().plan).toBe(false);
    a.updatePlan({ painThreshold: 4 });
    expect(useApp.getState().plan.painThreshold).toBe(4);
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
    expect(s.plan.sleep.target).toBe('23:15');
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

  it('i gesti di prova del fisioterapista restano solo se sono testi', () => {
    const base = pickData(defaultAppData('2026-11-09'));
    const keep = normalizeData({ ...base, profile: { ...base.profile, painSites: ['Gomito'], painTests: { Gomito: ' presa a pugno chiuso ', Tibia: 3, Spalla: '  ' } } });
    expect(keep.profile.painTests).toEqual({ Gomito: 'presa a pugno chiuso' });
    const none = normalizeData({ ...base, profile: { ...base.profile, painTests: 'boh' } });
    expect('painTests' in none.profile).toBe(false);
  });

  it('un backup danneggiato in una sezione si ripara invece di bloccare l’app', () => {
    const base = pickData(defaultAppData('2026-11-09'));
    const broken = {
      ...base,
      onboarded: true,
      profile: { ...base.profile, painSites: 'Tibia', heightCm: '175', startWeightKg: 'tanti' },
      plan: {
        ...base.plan,
        targets: { ...base.plan.targets, palestra: { kcal: '2700', proteinG: null } },
        week: [{ weekday: 0, dayType: 'boh', football: { kind: 'tennis' } }, 'x'],
        sleep: { wake: '7:00', current: '00:30' },
        supplements: [{ id: 'c', name: 'Creatina' }, 3],
      },
      dayLogs: {
        '2026-10-31': { date: '2026-10-31' },
        '2026-11-01': { status: { 'pasto:pranzo': 'fatto', x: 'forse' }, waterGlasses: '3', recipeSwaps: { pranzo: 'r1', boh: 'r2' }, extra: 1 },
        ciao: { status: {} },
      },
      checkIns: { '2026-11-01': { weightKg: '70,4', pain: { Tibia: '2', Gomito: 'alto' }, bedTime: '25:00' }, '2026-11-02': 5 },
      workoutLogs: [
        { id: 'w1', date: '2026-11-01', sessionId: 'A' },
        { id: 'w2', date: '2026-11-02', exercises: [{ exerciseId: 'panca', sets: 'tre' }, { nome: 'x' }] },
        { date: '2026-11-03' },
        null,
      ],
      footballLogs: [{ id: 'f1', date: '2026-11-02', kind: 'partita', rpe: '7' }, { id: 'f2', date: 'ieri', kind: 'partita' }],
      reviews: [{ weekStart: '2026-11-02' }, { weekStart: 3 }],
      physio: { exercises: [{ id: 'p', name: 'Ponte' }, {}], prescriptions: [{ exerciseId: 'p', repMin: 12, repMax: 8 }] },
      shoppingChecked: { '2026-11-02': ['a', 2], x: ['b'] },
      chat: [{ id: 'm', role: 'assistant' }, { id: 'n', role: 'sistema', text: 'x' }],
      settings: { theme: 'viola', coachModel: '' },
    };
    const n = normalizeData(broken);
    expect(n.profile.painSites).toEqual([]);
    expect(n.profile.heightCm).toBe(175);
    expect(n.profile.startWeightKg).toBe(0);
    expect(n.plan.targets.palestra.kcal).toBe(2700);
    expect(n.plan.targets.palestra.proteinG).toBe(base.plan.targets.palestra.proteinG);
    expect(n.plan.week).toHaveLength(7);
    expect(n.plan.week[0].dayType).toBe('calcio');
    expect(n.plan.week[0].football).toBeUndefined();
    expect(n.plan.sleep.wake).toBe(base.plan.sleep.wake);
    expect(n.plan.sleep.current).toBe('00:30');
    expect(n.plan.supplements).toHaveLength(1);
    expect(n.plan.supplements[0].active).toBe(true);
    expect(n.dayLogs['2026-10-31'].status).toEqual({});
    expect(n.dayLogs['2026-11-01'].status).toEqual({ 'pasto:pranzo': 'fatto' });
    expect(n.dayLogs['2026-11-01'].waterGlasses).toBe(3);
    expect(n.dayLogs['2026-11-01'].recipeSwaps).toEqual({ pranzo: 'r1' });
    expect((n.dayLogs['2026-11-01'] as unknown as { extra: number }).extra).toBe(1);
    expect(n.dayLogs.ciao).toBeUndefined();
    expect(n.checkIns['2026-11-01'].weightKg).toBeCloseTo(70.4);
    expect(n.checkIns['2026-11-01'].pain).toEqual({ Tibia: 2 });
    expect(n.checkIns['2026-11-01'].bedTime).toBeUndefined();
    expect(n.checkIns['2026-11-02']).toBeUndefined();
    expect(n.workoutLogs.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(n.workoutLogs[0].exercises).toEqual([]);
    expect(n.workoutLogs[1].exercises).toEqual([{ exerciseId: 'panca', sets: [] }]);
    expect(n.footballLogs.map((f) => [f.id, f.rpe])).toEqual([['f1', 7]]);
    expect(n.reviews).toHaveLength(1);
    expect(n.reviews[0].acceptedProposals).toEqual([]);
    expect(n.physio.exercises).toHaveLength(1);
    expect(n.physio.prescriptions[0].repMax).toBe(12);
    expect(n.shoppingChecked).toEqual({ '2026-11-02': ['a'] });
    expect(n.chat).toHaveLength(1);
    expect(n.chat[0].text).toBe('');
    expect(n.settings.theme).toBe('sistema');
    expect(n.settings.coachModel).toBeTruthy();
    // L'import lo accetta e lo stato resta usabile.
    expect(useApp.getState().importData(broken)).toBe(true);
    expect(useApp.getState().getDayLog('2026-10-31').status).toEqual({});
  });

  it('migrazione 1 → 2: fibre da 30 a 35 g, i valori cambiati restano', () => {
    const base = pickData(defaultAppData('2026-11-09'));
    const v1 = {
      ...base,
      version: 1,
      plan: { ...base.plan, targets: { ...base.plan.targets, calcio: { ...base.plan.targets.calcio, fiberG: 30 }, riposo: { ...base.plan.targets.riposo, fiberG: 28 } } },
    };
    const m = migrateData(v1, 1);
    expect(m.plan.targets.calcio.fiberG).toBe(35);
    expect(m.plan.targets.riposo.fiberG).toBe(28);
    expect(m.version).toBe(DATA_VERSION);
  });

  it('migrazione 2 → 3: obiettivo del sonno da 23:30 a 23:15 solo con i valori predefiniti', () => {
    const base = pickData(defaultAppData('2026-11-09'));
    const v2 = (sleep: Partial<typeof base.plan.sleep>) => ({ ...base, version: 2, plan: { ...base.plan, sleep: { ...base.plan.sleep, ...sleep } } });
    expect(migrateData(v2({ target: '23:30', wake: '07:15' }), 2).plan.sleep.target).toBe('23:15');
    expect(migrateData(v2({ target: '23:30', wake: '06:45' }), 2).plan.sleep.target).toBe('23:30');
    expect(migrateData(v2({ target: '23:00', wake: '07:15' }), 2).plan.sleep.target).toBe('23:00');
    // Già alla versione 3: nessun cambiamento.
    expect(migrateData(v2({ target: '23:30', wake: '07:15' }), 3).plan.sleep.target).toBe('23:30');
    // Dalla 3 alla 4 (fase 2) cambia solo il numero: i dati arrivano alla versione attuale.
    expect(migrateData(v2({}), 2).version).toBe(DATA_VERSION);
  });

  it('in localStorage restano solo le foto più recenti della chat', () => {
    const base = pickData(defaultAppData('2026-11-09'));
    const chat = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, role: 'user' as const, text: `t${i}`, image: `data:${i}`, createdAt: '' }));
    const out = persistedData({ ...base, chat });
    expect(out.chat.filter((m) => m.image).map((m) => m.id)).toEqual(['m3', 'm4', 'm5', 'm6']);
    expect(out.chat.map((m) => m.text)).toEqual(chat.map((m) => m.text));
  });
});
