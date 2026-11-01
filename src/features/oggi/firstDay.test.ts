import { describe, expect, it } from 'vitest';
import type { AppData, Plan } from '../../domain/types';
import { defaultAppData } from '../../data/defaults';
import { addDays } from '../../engine/dates';
import { buildDay, isBeforeStart } from '../../engine/timeline';
import { welcomeBoard } from './firstDay';

// Settimana predefinita: lunedì partita alle 21:00, mercoledì calcetto alle 21:00, martedì seduta A alle 17:00.
const SUN = '2026-11-08';
const MON = '2026-11-09';
const TUE = '2026-11-10';
const WED = '2026-11-11';

function firstUseAt(date: string, time: string, startDate = MON): AppData {
  const s = defaultAppData(MON);
  return { ...s, plan: { ...s.plan, startDate, firstUse: { date, time } } as Plan };
}

function board(date: string, state: AppData, status = {}) {
  return welcomeBoard(buildDay(date, state), buildDay(addDays(date, 1), state), {
    beforeStart: (it) => isBeforeStart(date, it, state.plan),
    status,
  });
}

const view = (spots: ReturnType<typeof board>) => spots.map((s) => [s.group ?? '', s.time, s.name]);

describe('primo giorno: il piano è pronto', () => {
  it('domenica sera: stasera solo il telefono, domani spesa di avvio e partita', () => {
    const s = firstUseAt(SUN, '21:10');
    const spots = board(SUN, s);
    expect(spots).toHaveLength(3);
    expect(spots[0]).toMatchObject({ group: 'Stasera', name: 'Telefono fuori', tomorrow: false });
    expect(view(spots.slice(1))).toEqual([
      ['Domani', '15:15', 'Spesa di avvio'],
      ['', '21:00', 'Partita'],
    ]);
  });

  it('mercoledì pomeriggio: spesa di avvio, calcetto e telefono, niente di domani', () => {
    const s = firstUseAt(WED, '14:25');
    const spots = board(WED, s);
    expect(spots.map((x) => x.name)).toEqual(['Spesa di avvio', 'Calcetto', 'Telefono fuori']);
    expect(spots[0].group).toBe('Oggi');
    expect(spots.some((x) => x.tomorrow)).toBe(false);
    // I pasti restano alla timeline.
    expect(spots.some((x) => x.kind === 'pasto')).toBe(false);
  });

  it('le voci prima del primo avvio non entrano, la palestra sì', () => {
    const s = firstUseAt(TUE, '10:00');
    const names = board(TUE, s).map((x) => x.name);
    expect(names).toContain('Seduta A');
    expect(names).toContain('Spesa di avvio');
    expect(names).toHaveLength(3);
  });

  it('una voce segnata porta il suo stato', () => {
    const s = firstUseAt(WED, '14:25');
    const spots = board(WED, s, { 'rito:spesa-avvio': 'fatto' });
    expect(spots.find((x) => x.id === 'rito:spesa-avvio')?.status).toBe('fatto');
  });
});
