/**
 * Pasto rimasto senza ricetta per un'esclusione (docs/FASE2.md § 6.4): Oggi lo mostra con «Scegli tu», lo schema del suo
 * pasto e senza ricetta da aprire; uno scambio dell'utente o una stima da foto vincono. Prima della spesa di avvio conta
 * lo scambio che vale dopo le esclusioni. Spesa del sabato con il menù nuovo da guardare (§ 5.3). Dati inventati.
 */
import { describe, expect, it } from 'vitest';
import type { AppData, DayLog, PlanProposal } from '../domain/types';
import { defaultAppData } from '../data/defaults';
import { RECIPES } from '../data/recipes';
import { MENU_ROTATION } from '../data/menu';
import { addDays } from './dates';
import { EMPTY_MENU_CELL, mealsForDate } from './menu';
import {
  buildDay,
  buildTimeline,
  CLEARED_MEAL_DETAIL,
  CLEARED_MEAL_DETAILS,
  clearedMealDetail,
  ritualItems,
  SHOPPING_NEW_MENU_DETAIL,
} from './timeline';

const MON = '2026-11-09';
/** Mercoledì con il calcio la sera: la merenda pre-calcio della rotazione ha la banana. */
const WED = '2026-11-11';

function state(log?: Partial<DayLog>): AppData {
  const s = defaultAppData(MON);
  const plan = { ...s.plan, startDate: MON, exclusions: [{ foodId: 'banana', since: MON, origin: 'non-mi-piace' as const }] };
  const dayLogs: Record<string, DayLog> = log ? { [WED]: { date: WED, status: {}, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: {}, ...log } } : {};
  return { ...s, plan, dayLogs };
}

const snack = (s: AppData) => buildTimeline(WED, s).find((i) => i.id === 'pasto:merenda');

describe('pasto senza alternative in Oggi (§ 6.4)', () => {
  it('dice «Scegli tu» e non ha una ricetta da aprire', () => {
    const s = state();
    expect(mealsForDate(WED, s).cleared?.merenda).toBeDefined();
    const item = snack(s)!;
    // Il mercoledì ha il calcio la sera: la merenda è un pre-calcio, con il suo schema.
    expect(item.detail).toBe(CLEARED_MEAL_DETAILS['pre-calcio']);
    expect(item.detail).toBe('Scegli tu: un carboidrato semplice e poca proteina');
    expect(item.ref).toBeUndefined();
  });

  it('lo schema segue il pasto: pranzo e cena come prima, colazione, spuntino e merenda con il loro', () => {
    expect(clearedMealDetail('pranzo')).toBe(CLEARED_MEAL_DETAIL);
    expect(clearedMealDetail('cena')).toBe(CLEARED_MEAL_DETAIL);
    expect(clearedMealDetail('colazione')).toBe('Scegli tu: proteine, un cereale e un frutto');
    expect(clearedMealDetail('spuntino')).toBe('Scegli tu: un frutto e un po’ di proteine');
    expect(clearedMealDetail('merenda')).toBe(clearedMealDetail('spuntino'));
    expect(clearedMealDetail('merenda', { football: { kind: 'calcetto', time: '21:00', durationMin: 60 } })).toBe(CLEARED_MEAL_DETAILS['pre-calcio']);
    // Il calcio del pomeriggio non fa della merenda un pre-calcio.
    expect(clearedMealDetail('merenda', { football: { kind: 'calcetto', time: '15:00', durationMin: 60 } })).toBe(clearedMealDetail('spuntino'));
    for (const t of Object.values(CLEARED_MEAL_DETAILS)) expect(t).toMatch(/^Scegli tu: [a-z]/);
  });

  it('senza esclusioni il dettaglio resta il nome della ricetta', () => {
    const s = state();
    s.plan = { ...s.plan, exclusions: [] };
    const item = snack(s)!;
    expect(item.detail).toBe(mealsForDate(WED, s).bySlot.merenda?.recipe?.name);
    expect(item.detail).not.toBe(CLEARED_MEAL_DETAIL);
  });

  it('uno scambio dell’utente o una stima da foto vincono sul pasto vuoto', () => {
    const swapId = Object.values(RECIPES).find((r) => r.slots.includes('merenda') && !r.ingredients.some((l) => l.foodId === 'banana'))!.id;
    expect(snack(state({ recipeSwaps: { merenda: swapId } }))?.detail).toBe(RECIPES[swapId].name);
    const photo = state({
      status: { 'pasto:merenda': 'sostituito' },
      barMeals: { merenda: { label: 'Yogurt e frutta', nutrients: { kcal: 250, proteinG: 15, carbG: 30, fatG: 6, fiberG: 3 }, source: 'foto', items: [{ foodId: 'yogurt-greco-0', grams: 170 }] } },
    });
    expect(snack(photo)?.detail).toMatch(/^Dalla foto · /);
  });
});

describe('casella vuota di un menù generato e approvato (§ 4.10)', () => {
  /** Un menù approvato per il lunedì con la merenda del mercoledì vuota: il generatore non aveva candidati. */
  function approvedWithEmpty(): AppData {
    const s = defaultAppData(MON);
    const week = JSON.parse(JSON.stringify(MENU_ROTATION[0])) as (typeof MENU_ROTATION)[number];
    delete week.days[2].meals.merenda;
    return { ...s, plan: { ...s.plan, startDate: addDays(MON, -21), menus: { [MON]: week } } };
  }

  it('la casella resta nel giorno con «Scegli tu»: in Oggi lo schema del pasto, senza ricetta da aprire', () => {
    const s = approvedWithEmpty();
    const meals = mealsForDate(WED, s);
    expect(meals.source).toBe('approvato');
    expect(meals.bySlot.merenda).toBeUndefined();
    expect(meals.cleared?.merenda).toBe(EMPTY_MENU_CELL);
    const item = snack(s)!;
    expect(item.detail).toBe(CLEARED_MEAL_DETAILS['pre-calcio']);
    expect(item.ref).toBeUndefined();
    // Gli altri pasti del giorno restano quelli del menù.
    expect(meals.cleared?.pranzo).toBeUndefined();
    expect(meals.bySlot.pranzo?.recipeId).toBe(MENU_ROTATION[0].days[2].meals.pranzo);
  });

  it('senza menù approvati (rotazione) nessuna casella vuota: l’app di prima', () => {
    const s = defaultAppData(MON);
    expect(mealsForDate(WED, { ...s, plan: { ...s.plan, startDate: MON } }).cleared).toBeUndefined();
  });
});

describe('prima della spesa di avvio, con le esclusioni', () => {
  const SUN0 = '2026-11-08';
  /** Benvenuto finito domenica alle 16:30: spesa di avvio lunedì pomeriggio, pasti del mattino «con quello che hai». */
  function starter(exclusions: AppData['plan']['exclusions'], swaps: DayLog['recipeSwaps']): AppData {
    const s = defaultAppData(SUN0);
    const plan = { ...s.plan, startDate: MON, firstUse: { date: SUN0, time: '16:30' }, ...(exclusions ? { exclusions } : {}) };
    const dayLogs: Record<string, DayLog> = { [MON]: { date: MON, status: {}, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: swaps } };
    return { ...s, plan, dayLogs, onboarded: true };
  }
  const lunch = (s: AppData) => buildDay(MON, s).find((i) => i.id === 'pasto:pranzo');

  it('uno scambio con un alimento escluso non è una ricetta scelta: il pasto resta «con quello che hai»', () => {
    const swap = 'pasta-ceci-rosmarino';
    expect(RECIPES[swap]?.ingredients.some((l) => l.foodId === 'ceci')).toBe(true);
    // Lo scambio vale: chi sceglie la ricetta ha gli ingredienti.
    expect(lunch(starter(undefined, { pranzo: swap }))?.preShopping).toBeFalsy();
    // Con i ceci esclusi da lunedì lo scambio non vale più (`mealsForDate`) e il pasto torna prima della spesa.
    const excluded = starter([{ foodId: 'ceci', since: MON, origin: 'non-mi-piace' }], { pranzo: swap });
    expect(mealsForDate(MON, excluded).bySlot.pranzo?.swapped).toBe(false);
    expect(lunch(excluded)?.preShopping).toBe(true);
  });
});

describe('spesa del sabato con la proposta del menù (§ 5.3)', () => {
  const SAT = '2026-11-14';
  const NEXT = '2026-11-16';
  const proposal = (patch: Partial<PlanProposal>): PlanProposal => ({
    id: 'menu-prova',
    kind: 'menu',
    status: 'aperta',
    createdAt: '2026-11-13T12:00:00.000Z',
    effectiveFrom: NEXT,
    basis: 'base',
    title: 'Menù 16-22 novembre',
    patch: {},
    diff: [],
    reasons: [],
    source: 'motore',
    ...patch,
  });
  const detail = (proposals: PlanProposal[]) => {
    const s = defaultAppData(MON);
    return ritualItems(SAT, { ...s, plan: { ...s.plan, startDate: MON }, planner: { proposals } }).find((i) => i.id === 'rito:spesa')?.detail;
  };

  it('con la proposta aperta per il lunedì dopo dice di guardarla prima, altrimenti la lista è pronta', () => {
    expect(detail([proposal({})])).toBe(SHOPPING_NEW_MENU_DETAIL);
    expect(SHOPPING_NEW_MENU_DETAIL).toBe('Prima guarda il menù nuovo');
    expect(detail([])).toBe('La lista è già pronta in Settimana');
    expect(detail([proposal({ status: 'approvata' })])).toBe('La lista è già pronta in Settimana');
    expect(detail([proposal({ effectiveFrom: '2026-11-23' })])).toBe('La lista è già pronta in Settimana');
    expect(detail([proposal({ kind: 'blocco' })])).toBe('La lista è già pronta in Settimana');
  });
});
