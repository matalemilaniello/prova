import { describe, expect, it } from 'vitest';
import type { AppData } from '../domain/types';
import { defaultAppData } from '../data/defaults';
import { buildDemo } from '../demo/seed';
import { buildCoachContext, COACH_SYSTEM_PROMPT, coachDay, coachDaySummary } from './coachContext';

const TODAY = '2026-11-10'; // martedì, palestra nella settimana predefinita
const NOW = new Date(2026, 10, 10, 18, 10);

function demo(): AppData {
  return buildDemo(TODAY, { nowMin: 18 * 60 + 10 });
}

describe('prompt di sistema', () => {
  it('è in italiano, stabile e senza trattino lungo', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('Sei il coach di Ritmo');
    expect(COACH_SYSTEM_PROMPT).toContain('fisioterapista');
    expect(COACH_SYSTEM_PROMPT).toContain('Non fai diagnosi');
    expect(COACH_SYSTEM_PROMPT).not.toMatch(/—/);
    // Niente date o dati variabili: resta in cache tra una domanda e l'altra.
    expect(COACH_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('contiene il piano B al bar con i verdetti', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('Piano B al bar');
    expect(COACH_SYSTEM_PROMPT).toContain('Panino con bresaola');
    expect(COACH_SYSTEM_PROMPT).toContain('Dolce programmato');
  });

  it('è abbastanza lungo da andare in cache (oltre 512 token, circa 2.000 caratteri)', () => {
    expect(COACH_SYSTEM_PROMPT.length).toBeGreaterThan(2500);
  });
});

describe('giornata del coach', () => {
  it('dopo mezzanotte e prima della sveglia vale ancora ieri', () => {
    const s = defaultAppData(TODAY);
    expect(coachDay(s, new Date(2026, 10, 11, 0, 40))).toBe(TODAY);
    expect(coachDay(s, new Date(2026, 10, 11, 7, 0))).toBe('2026-11-11');
    expect(coachDay(s, new Date(2026, 10, 10, 23, 59))).toBe(TODAY);
  });
});

describe('contesto', () => {
  const ctx = buildCoachContext(demo(), NOW);

  it('ha tutte le sezioni', () => {
    for (const h of ['# Contesto di Ritmo', '## Profilo', '## Piano', '## Oggi, martedì 10 novembre', '## Controlli del mattino recenti', '## Allenamento e calcio', '## Settimana']) {
      expect(ctx).toContain(h);
    }
    expect(ctx).toContain('Adesso: martedì 10 novembre 2026, ore 18:10');
  });

  it('descrive la giornata con stati e valori del menù', () => {
    expect(ctx).toContain('Tipo di giorno: palestra');
    expect(ctx).toMatch(/Timeline:\n- \d{2}:\d{2} /);
    expect(ctx).toMatch(/· (fatto|sostituito|saltato|da fare)/);
    expect(ctx).toMatch(/Menù di oggi, totale stimato: [\d.]+\s?kcal/);
  });

  it('usa il formato italiano dei numeri', () => {
    expect(ctx).toMatch(/2\.600\s?kcal/);
    expect(ctx).toMatch(/\d+,\d\s?kg/);
    expect(ctx).not.toMatch(/\d+\.\d\s?kg/);
  });

  it('non invia il nome e segnala i dati di esempio', () => {
    const s = demo();
    s.profile = { ...s.profile, name: 'Nomeprova' };
    const c = buildCoachContext(s, NOW);
    expect(c).not.toContain('Nomeprova');
    expect(c).toContain('dati di esempio');
  });

  it('dichiara le competenze quando ci sono', () => {
    const s = demo();
    s.profile = { ...s.profile, expertise: 'allenatore' };
    expect(buildCoachContext(s, NOW)).toContain('Competenze dichiarate: allenatore.');
  });

  it('regge uno stato vuoto senza lanciare', () => {
    const empty = defaultAppData(TODAY);
    const c = buildCoachContext(empty, NOW);
    expect(c).toContain('## Profilo');
    expect(c).toContain('Il controllo del mattino di oggi non è ancora fatto');
    expect(c).toContain('Nessuna seduta di palestra registrata');
  });

  it('resta compatto', () => {
    expect(ctx.length).toBeLessThan(9000);
  });
});

describe('riassunto per la chat', () => {
  it('riporta tipo di giorno, attività e avanzamento', () => {
    const s = coachDaySummary(demo(), NOW);
    expect(s.date).toBe(TODAY);
    expect(s.dayType).toBe('palestra');
    expect(s.activity).toMatch(/Seduta A/);
    expect(s.total).toBeGreaterThan(0);
    expect(s.done).toBeLessThanOrEqual(s.total);
    expect(s.kcal).toBe(2600);
  });

  it('senza controllo del mattino non inventa sonno né dolore', () => {
    const s = coachDaySummary(defaultAppData(TODAY), NOW);
    expect(s.checkInDone).toBe(false);
    expect(s.sleepH).toBeNull();
    expect(s.pain).toBeNull();
  });
});
