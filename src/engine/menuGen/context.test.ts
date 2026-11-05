/**
 * Ingressi del generatore (docs/FASE2.md § 4.10): `menuGenInput` legge il piano proiettato e il diario, gli altri motori
 * solo i loro ingressi.
 */
import { describe, expect, it } from 'vitest';
import type { MenuWeek } from '../../domain/types';
import { MENU_ROTATION } from '../../data/menu';
import { RECIPES } from '../../data/recipes';
import { addDays } from '../dates';
import { menuWeekFor } from '../menu';
import { dayTargetFor } from '../nutrition';
import { lastApprovedBefore, menuDaysFor, menuGenInput, menuMonth, MAX_EVALUATIONS } from './context';
import { fixtureState } from './testFixtures';

const MON = '2026-11-16';

describe('menuGenInput', () => {
  it('tipi di giorno dal piano: partita, vigilia, calcio la sera, palestra, riposo', () => {
    const s = fixtureState(MON);
    const days = menuDaysFor(MON, s);
    expect(days.map((d) => d.iso)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(MON, i)));
    expect(days[0]).toMatchObject({ dayType: 'calcio', matchDay: true, eveningFootball: true, footballDay: true });
    expect(days[1]).toMatchObject({ dayType: 'palestra', matchDay: false, eveningFootball: false });
    // Domenica è la vigilia: mangia come il calcio, ha il minimo di carboidrati e niente calcio la sera.
    expect(days[6]).toMatchObject({ dayType: 'calcio', matchEve: true, eveningFootball: false });
    expect(days[6].carbFloorG).toBeGreaterThan(0);
    for (const d of days) expect(d.target).toEqual(dayTargetFor(d.iso, { plan: s.plan, dayLogs: s.dayLogs, checkIns: s.checkIns, profile: s.profile, reviews: s.reviews }));
  });

  it('in pausa niente calcio: niente pre-calcio né cena di recupero, niente minimo di partita', () => {
    const days = menuDaysFor(MON, fixtureState(MON, { phase: 'pausa' }));
    expect(days.every((d) => !d.eveningFootball && !d.matchDay && !d.matchEve && !d.carbFloorG)).toBe(true);
  });

  it('i pasti che cadono nel lavoro sono da portare', () => {
    const s = fixtureState(MON, { work: { 1: [{ from: '09:00', to: '18:00' }] } });
    const days = menuDaysFor(MON, s);
    expect(days[1].carry).toContain('pranzo');
    expect(days[2].carry).toBeUndefined();
  });

  it('seme: l’ultima approvata prima del lunedì, mai una con decorrenza futura; altrimenti la rotazione', () => {
    const s = fixtureState(MON);
    const rot = menuWeekFor(MON, s.plan.startDate)!;
    expect(menuGenInput(MON, s).seed).toBe(rot);
    const old: MenuWeek = JSON.parse(JSON.stringify(MENU_ROTATION[1]));
    const future: MenuWeek = JSON.parse(JSON.stringify(MENU_ROTATION[0]));
    s.plan.menus = { [addDays(MON, -14)]: old, [addDays(MON, 7)]: future };
    expect(lastApprovedBefore(MON, s.plan)?.week).toBe(old);
    const input = menuGenInput(MON, s);
    expect(input.seed).toBe(old);
    expect(input.month).toBe(menuMonth(MON));
    expect(input.maxEvaluations).toBe(MAX_EVALUATIONS);
  });

  it('esclusioni dell’utente più i divieti, gusti dal diario, deterministico', () => {
    const s = fixtureState(MON, { exclusions: ['tonno'] });
    const pranzo = Object.values(RECIPES).find((r) => r.slots.includes('pranzo') && !r.batch)!.id;
    const day = addDays(MON, -3);
    s.dayLogs[day] = { date: day, status: {}, notes: {}, minimal: false, waterGlasses: 0, sweets: 0, recipeSwaps: { pranzo }, swapPlanned: { pranzo: 'pasta-tonno-pomodoro' } };
    const input = menuGenInput(MON, s, { today: addDays(MON, -2) });
    expect(input.excluded.has('tonno')).toBe(true);
    expect(input.excluded.has('gallette-riso')).toBe(true);
    expect(input.swappedAway['pasta-tonno-pomodoro']).toBe(1);
    expect(Object.values(input.recentUses).reduce((a, b) => a + b, 0)).toBeGreaterThan(50);
    expect(menuGenInput(MON, s, { today: addDays(MON, -2) })).toEqual(input);
  });
});
