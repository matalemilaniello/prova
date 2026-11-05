import { describe, expect, it } from 'vitest';
import { defaultPlan } from '../../data/defaults';
import { FOODS } from '../../data/foods';
import { mealTimesFor } from '../../engine/mealTimes';
import { PHOTO_TEXT } from '../../engine/coachTasks/photo';
import {
  MEAL_LOG_TEXT,
  countsAsText,
  defaultGrams,
  dishLine,
  failureView,
  kcalText,
  markLabel,
  markedToast,
  nearestOpenSlot,
  searchFoods,
} from './logic';
import { chatPhoto, clearPhoto, peekPhoto, rememberChatPhoto, stashPhoto } from './photoInbox';

const NB = ' ';

describe('testi del foglio dei pasti (§ 11.6)', () => {
  it('pasto previsto o sostituito, con articoli e accordi', () => {
    expect(countsAsText('pranzo', true)).toBe('Conta come il pranzo previsto');
    expect(countsAsText('cena', true)).toBe('Conta come la cena prevista');
    expect(countsAsText('spuntino', true)).toBe('Conta come lo spuntino previsto');
    expect(countsAsText('cena', false)).toBe('Conta come pasto sostituito');
    expect(markLabel('pranzo')).toBe('Segna il pranzo');
    expect(markLabel('colazione')).toBe('Segna la colazione');
    expect(markedToast('cena', 718)).toBe(`Cena segnata: 720${NB}kcal`);
  });

  it('kcal con l’intervallo e riga del piatto', () => {
    expect(kcalText({ kcalShown: 720, range: null })).toBe(`720${NB}kcal`);
    expect(kcalText({ kcalShown: 820, range: { low: 620, high: 1020 } })).toBe(`circa 820${NB}kcal (620-1.020)`);
    expect(dishLine({ nutrients: { kcal: 642, proteinG: 37.6, carbG: 70, fatG: 20, fiberG: 8 } })).toBe(`640${NB}kcal · P 38${NB}g`);
  });

  it('esiti della lettura (§ 7.6): un solo «Riprova» per la risposta non valida, rete assente con le uscite offline', () => {
    const base = { ok: false as const, message: 'Messaggio dell’API.', retryable: true };
    expect(failureView({ ...base, kind: 'rifiuto' }, false)).toEqual({ text: PHOTO_TEXT.rifiuto, retry: true, offline: false });
    expect(failureView({ ...base, kind: 'non-valida' }, false)).toEqual({ text: PHOTO_TEXT.nonValida, retry: true, offline: false });
    expect(failureView({ ...base, kind: 'non-valida' }, true)?.retry).toBe(false);
    expect(failureView({ ...base, kind: 'incompleta' }, true)?.retry).toBe(false);
    expect(failureView({ ...base, kind: 'offline' }, false)).toEqual({ text: MEAL_LOG_TEXT.offline, retry: true, offline: true });
    expect(failureView({ ...base, kind: 'chiave', retryable: false }, false)).toEqual({ text: 'Messaggio dell’API.', retry: false, offline: false });
    expect(failureView({ ...base, kind: 'annullata' }, false)).toBeNull();
  });
});

describe('pasto di una foto della chat', () => {
  const plan = { ...defaultPlan('2026-11-09'), startDate: '2026-11-09' };
  const day = '2026-11-10';

  it('il più vicino all’ora del messaggio tra quelli non ancora segnati', () => {
    const t = mealTimesFor(day, plan);
    expect(nearestOpenSlot(day, t.pranzo.time, plan, { status: {} })).toBe('pranzo');
    expect(nearestOpenSlot(day, t.pranzo.time, plan, { status: { 'pasto:pranzo': 'fatto' } })).not.toBe('pranzo');
    const all = { status: Object.fromEntries(['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'].map((s) => [`pasto:${s}`, 'fatto' as const])) };
    expect(nearestOpenSlot(day, t.cena.time, plan, all)).toBe('cena');
  });
});

describe('ricerca degli alimenti', () => {
  it('archivio e sole stime, senza sale e spezie, prima chi comincia con la parola', () => {
    const r = searchFoods('pasta');
    expect(r[0].name.toLowerCase().startsWith('pasta')).toBe(true);
    expect(searchFoods('pizza').map((f) => f.id)).toContain('pizza-margherita');
    expect(searchFoods('sale')).not.toContainEqual(FOODS.sale);
    expect(searchFoods('olio').map((f) => f.id)).toContain('olio-evo');
    expect(searchFoods('   ')).toEqual([]);
    expect(searchFoods('tiramisu').map((f) => f.id)).toEqual(['tiramisu']);
  });

  it('grammi proposti: una porzione a mano, altrimenti 100 g', () => {
    expect(defaultGrams(FOODS.pasta)).toBe(150);
    expect(defaultGrams(FOODS.pollo)).toBe(110);
    expect(defaultGrams({ ...FOODS.pasta, unitGrams: {} })).toBe(100);
  });
});

describe('foto in memoria (§ 7.7)', () => {
  it('la casella tiene l’ultima foto e si svuota solo con il suo numero', () => {
    const a = stashPhoto({ kind: 'dataUrl', dataUrl: 'data:image/jpeg;base64,QQ==' });
    const b = stashPhoto({ kind: 'dataUrl', dataUrl: 'data:image/jpeg;base64,Qg==' });
    expect(peekPhoto()?.id).toBe(b);
    clearPhoto(a);
    expect(peekPhoto()?.id).toBe(b);
    clearPhoto(b);
    expect(peekPhoto()).toBeNull();
  });

  it('le foto da 1.024 px della chat: al massimo le ultime 4', () => {
    for (let i = 1; i <= 5; i++) rememberChatPhoto(`m${i}`, `data:image/jpeg;base64,${i}`);
    expect(chatPhoto('m1')).toBeUndefined();
    expect(chatPhoto('m5')).toBe('data:image/jpeg;base64,5');
  });
});
