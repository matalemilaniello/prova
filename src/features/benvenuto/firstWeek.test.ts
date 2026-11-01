import { describe, expect, it } from 'vitest';
import type { Plan } from '../../domain/types';
import { defaultPlan } from '../../data/defaults';
import { finalizePlan, firstWeekSteps, startInfo } from './firstWeek';

/** Fine del benvenuto in una data e ora locali. */
function finishAt(y: number, m: number, d: number, hh: number, mm: number): Plan {
  const base = defaultPlan('2026-11-01');
  return finalizePlan(base, base.targets, new Date(y, m - 1, d, hh, mm));
}

const brief = (plan: Plan, sites: string[] = ['Zona']) => firstWeekSteps(plan, sites).map((s) => `${s.date} ${s.time} ${s.kind}`);

describe('piano alla fine del benvenuto', () => {
  it('domenica sera: il piano parte lunedì, settimana 1, e i giorni di avvio arrivano a domenica', () => {
    const p = finishAt(2026, 11, 1, 20, 40);
    expect(p.firstUse).toEqual({ date: '2026-11-01', time: '20:40' });
    expect(p.startDate).toBe('2026-11-02');
    expect(startInfo(p)).toEqual({ startDate: '2026-11-02', startsLater: true, starterUntil: '2026-11-08' });
  });

  it('mercoledì: il piano parte dal lunedì di questa settimana', () => {
    const p = finishAt(2026, 11, 4, 10, 0);
    expect(p.startDate).toBe('2026-11-02');
    expect(startInfo(p)).toEqual({ startDate: '2026-11-02', startsLater: false, starterUntil: '2026-11-08' });
  });

  it('venerdì: il piano parte il lunedì dopo', () => {
    expect(finishAt(2026, 11, 6, 18, 0).startDate).toBe('2026-11-09');
  });

  it('alle 00:30 di lunedì la giornata del piano è ancora domenica', () => {
    const p = finishAt(2026, 11, 2, 0, 30);
    expect(p.firstUse?.date).toBe('2026-11-01');
    expect(p.startDate).toBe('2026-11-02');
  });
});

describe('le prime volte', () => {
  it('domenica sera: coprifuoco, controllo, spesa di avvio, partita, seduta, preparazione e revisione', () => {
    const p = finishAt(2026, 11, 1, 20, 40);
    expect(brief(p)).toEqual([
      '2026-11-01 00:15 coprifuoco',
      '2026-11-02 07:20 controllo',
      '2026-11-02 15:15 spesa',
      '2026-11-02 21:00 calcio',
      '2026-11-03 17:00 palestra',
      expect.stringMatching(/^2026-11-08 \d\d:\d\d preparazione$/),
      '2026-11-08 18:00 revisione',
    ]);
    const steps = firstWeekSteps(p, ['Zona']);
    expect(steps[0].detail).toBe('In carica fuori dalla camera, a letto alle 00:45');
    expect(steps[2].title).toBe('Spesa di avvio');
    expect(steps[3].detail).toMatch(/^Fine alle 22:30, poi cena di recupero e a letto alle \d\d:\d\d$/);
    expect(steps.at(-1)?.title).toBe('Prima revisione');
    // Senza zone di dolore il controllo non le nomina.
    expect(firstWeekSteps(p, []).find((s) => s.kind === 'controllo')?.detail).toBe('Peso, sonno ed energia');
  });

  it('dopo l’ora di andare a letto la prima sera non compare', () => {
    const p = finishAt(2026, 11, 2, 1, 10);
    expect(brief(p)[0]).toBe('2026-11-02 07:20 controllo');
  });

  it('venerdì: la prima revisione è quella della settimana 1, non la domenica dei giorni di avvio', () => {
    const p = finishAt(2026, 11, 6, 20, 0);
    const kinds = brief(p);
    expect(kinds.some((k) => k.startsWith('2026-11-08') && k.endsWith('revisione'))).toBe(false);
    expect(kinds.at(-1)).toBe('2026-11-15 18:00 revisione');
    // Spesa del sabato: dopo le 19:00 del venerdì non c'è spesa di avvio.
    expect(kinds).toContain('2026-11-07 ' + firstWeekSteps(p).find((s) => s.kind === 'spesa')!.time + ' spesa');
    expect(firstWeekSteps(p).find((s) => s.kind === 'spesa')?.title).toBe('Spesa per la settimana');
  });

  it('senza primo avvio non c’è niente da mostrare', () => {
    expect(firstWeekSteps(defaultPlan('2026-11-01'))).toEqual([]);
  });
});
