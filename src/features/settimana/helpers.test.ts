import { describe, expect, it } from 'vitest';
import type { Plan } from '../../domain/types';
import { DEFAULT_WEEK, defaultPlan } from '../../data/defaults';
import { dayActivities, dayVerdict, lowerFirst, prepSkipped } from './helpers';

const target = { kcal: 2800, proteinG: 135, carbG: 385, fatG: 80 };

describe('giudizio del giorno', () => {
  it('usa le soglie del controllo del menù: grassi fino a 15 g sotto l’obiettivo sono in linea', () => {
    expect(dayVerdict({ kcal: 2800, proteinG: 150, carbG: 380, fatG: 68 }, target).good).toBe(true);
    expect(dayVerdict({ kcal: 2800, proteinG: 150, carbG: 380, fatG: 65.4 }, target).good).toBe(true);
    expect(dayVerdict({ kcal: 2800, proteinG: 150, carbG: 380, fatG: 64 }, target)).toEqual({ good: false, text: 'Grassi sotto l’obiettivo' });
    // Sopra l'obiettivo vale il 15%.
    expect(dayVerdict({ kcal: 2800, proteinG: 150, carbG: 340, fatG: 93 }, target).text).toBe('Grassi sopra l’obiettivo');
  });

  it('accetta qualche grammo di proteine in più, non le kcal fuori di oltre l’8%', () => {
    expect(dayVerdict({ kcal: 2850, proteinG: 165, carbG: 370, fatG: 75 }, target).good).toBe(true);
    expect(dayVerdict({ kcal: 3060, proteinG: 150, carbG: 400, fatG: 80 }, target)).toEqual({ good: false, text: '+9% sull’obiettivo' });
    expect(dayVerdict({ kcal: 2700, proteinG: 110, carbG: 400, fatG: 80 }, target).text).toBe('Proteine sotto l’obiettivo');
  });
});

describe('testi', () => {
  it('abbassa solo l’iniziale e lascia i nomi propri', () => {
    expect(lowerFirst('Aceto balsamico di Modena')).toBe('aceto balsamico di Modena');
    expect(lowerFirst('Origano secco')).toBe('origano secco');
    expect(lowerFirst('RPE')).toBe('RPE');
  });
});

describe('attività del giorno', () => {
  it('mostra gli esercizi del fisio solo se l’utente li ha inseriti', () => {
    const monday = DEFAULT_WEEK[0];
    expect(dayActivities(monday).map((a) => a.kind)).toEqual(['calcio', 'fisio']);
    expect(dayActivities(monday, false).map((a) => a.kind)).toEqual(['calcio']);
  });
});

describe('settimana senza preparazione', () => {
  const withFirst = (date: string): Plan => ({ ...defaultPlan('2026-11-02'), firstUse: { date, time: '21:00' } }) as Plan;

  it('chi comincia a metà settimana non ha preparato nulla quella domenica', () => {
    expect(prepSkipped(withFirst('2026-11-04'), '2026-11-02', false)).toBe(true);
    expect(prepSkipped(withFirst('2026-11-04'), '2026-11-09', false)).toBe(false);
  });

  it('chi comincia la domenica sera salta anche la settimana dopo, se è di avvio', () => {
    expect(prepSkipped(withFirst('2026-11-01'), '2026-11-02', true)).toBe(true);
    expect(prepSkipped(withFirst('2026-11-01'), '2026-11-09', false)).toBe(false);
  });

  it('senza primo avvio (dati di esempio) la preparazione c’è sempre', () => {
    expect(prepSkipped(defaultPlan('2026-11-02'), '2026-11-02', false)).toBe(false);
  });
});
