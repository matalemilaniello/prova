import { describe, expect, it } from 'vitest';
import type { DayType } from '../domain/types';
import { TIPS, fillTip, tipOfDay, tipsFor } from './tips';

const DAY_TYPES: DayType[] = ['calcio', 'palestra', 'leggero', 'riposo'];

describe('consigli del giorno', () => {
  it('sono almeno 30, con id unici', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
  });

  it('nessun segnaposto resta nel testo mostrato', () => {
    for (const tip of TIPS) {
      const t = fillTip(tip, { painThreshold: 4, impactThreshold: 2, fiberG: 32 });
      expect(`${t.title} ${t.text}`).not.toMatch(/[{}]/);
    }
  });

  it('il dolore segue la soglia del piano e per gli impatti resta più basso', () => {
    const tip = TIPS.find((t) => t.id === 'carico-dolore-soglia')!;
    const t = fillTip(tip, { painThreshold: 4, impactThreshold: 2 });
    expect(t.title).toBe('Tendini: dolore fino a 4 su 10');
    expect(t.text).toContain('la soglia è 2');
    // Senza contesto valgono i predefiniti: 3 per i tendini, 2 per osso e impatti.
    expect(fillTip(tip).title).toBe('Tendini: dolore fino a 3 su 10');
    expect(fillTip(tip).text).toContain('la soglia è 2');
  });

  it('le fibre citano l’obiettivo del piano', () => {
    const tip = TIPS.find((t) => t.id === 'fibre-microbiota')!;
    expect(fillTip(tip, { fiberG: 35 }).title).toBe('Fibre: almeno 35 grammi al giorno');
  });

  it('la seduta A dopo la partita compare solo quando è davvero così', () => {
    const id = 'carico-giorno-dopo';
    expect(tipsFor('palestra', { gymSessionId: 'A', afterMatch: true }).some((t) => t.id === id)).toBe(true);
    expect(tipsFor('palestra', { gymSessionId: 'B', afterMatch: false }).some((t) => t.id === id)).toBe(false);
  });

  it('stesso giorno, stesso consiglio; "Un altro" scorre a uno diverso', () => {
    for (const d of DAY_TYPES) {
      const a = tipOfDay('2026-11-10', d);
      expect(tipOfDay('2026-11-10', d).id).toBe(a.id);
      expect(tipOfDay('2026-11-10', d, 1).id).not.toBe(a.id);
    }
    expect(tipOfDay('2026-11-10', 'riposo', 0, 'fibre-gradualita').id).toBe('fibre-gradualita');
  });
});
