import { describe, expect, it } from 'vitest';
import type { AppData } from '../domain/types';
import { LEGACY_DEFAULT_SUPPLEMENTS, defaultAppData } from '../data/defaults';
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
    expect(COACH_SYSTEM_PROMPT).toContain('Panino con pollo');
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
    s.profile = { ...s.profile, expertise: 'preparatore atletico' };
    expect(buildCoachContext(s, NOW)).toContain('Competenze dichiarate: preparatore atletico.');
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

describe('zone e priorità dal profilo', () => {
  it('nessuna zona scritta a mano: con il solo ginocchio non si parla di tibia né di gomito', () => {
    const s = defaultAppData(TODAY);
    s.profile = { ...s.profile, painSites: ['Ginocchio'] };
    s.checkIns[TODAY] = { date: TODAY, pain: { Ginocchio: 5 }, weightKg: 70, energy: 6 };
    const text = `${COACH_SYSTEM_PROMPT}\n${buildCoachContext(s, NOW)}`.toLowerCase();
    expect(text).not.toContain('tibia');
    expect(text).not.toContain('gomito');
    expect(text).toContain('ginocchio');
  });

  it('le limitazioni arrivano dalle zone monitorate e dal dolore di oggi', () => {
    const s = defaultAppData(TODAY);
    s.profile = { ...s.profile, painSites: ['Tibia', 'Gomito'] };
    s.checkIns[TODAY] = { date: TODAY, pain: { Tibia: 5, Gomito: 5 } };
    const ctx = buildCoachContext(s, NOW);
    expect(ctx).toContain('Limitazioni del piano: gomito monitorato: nelle spinte manubri a presa neutra');
    expect(ctx).toMatch(/tibia: balzi e salti solo con dolore fino a \d su 10/);
    expect(ctx).toContain('Limitazioni di oggi: niente balzi né salti; panca con i manubri sostituita da chest press e cavi.');
  });

  it('le priorità seguono l’obiettivo', () => {
    const s = defaultAppData(TODAY);
    expect(buildCoachContext(s, NOW)).toContain("Priorità, in quest’ordine: salute");
    s.profile = { ...s.profile, goal: 'dimagrimento' };
    expect(buildCoachContext(s, NOW)).toContain('calo di grasso graduale');
    expect(COACH_SYSTEM_PROMPT).not.toContain("un po’ di muscolo");
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

  it('prima della prima spesa i pasti sono con quello che c’è in casa e la dose da definire resta fuori', () => {
    // Primo avvio lunedì 9 alle 10:00: la spesa di avvio è alle 15:15, colazione, spuntino e pranzo vengono prima.
    const base = defaultAppData('2026-11-09');
    // Integratori della fase 1 (vitamina D con la dose da definire): i nuovi utenti partono dal catalogo.
    const supplements = LEGACY_DEFAULT_SUPPLEMENTS.map((x) => ({ ...x }));
    const state: AppData = { ...base, onboarded: true, plan: { ...base.plan, supplements, startDate: '2026-11-09', firstUse: { date: '2026-11-09', time: '10:00' } } };
    const ctx = buildCoachContext(state, new Date(2026, 10, 9, 11, 0));
    expect(ctx).toMatch(/Pranzo: prima della prima spesa, con quello che c’è in casa/);
    expect(ctx).not.toMatch(/Cena: prima della prima spesa/);
    expect(ctx).toMatch(/Integratori senza dose: Vitamina D, dose da definire con l’esame, per ora non si prende\./);
    expect(ctx).not.toMatch(/Integratori: [^\n]*Vitamina D/);
  });

  it('senza controllo del mattino non inventa sonno né dolore', () => {
    const s = coachDaySummary(defaultAppData(TODAY), NOW);
    expect(s.checkInDone).toBe(false);
    expect(s.sleepH).toBeNull();
    expect(s.pain).toBeNull();
  });
});

describe('piano B al bar nel contesto', () => {
  it('un pasto preso al bar porta i valori dell’ordine', () => {
    const s = demo();
    const log = s.dayLogs[TODAY];
    log.status['pasto:pranzo'] = 'sostituito';
    log.notes['pasto:pranzo'] = 'Al bar: panino con pollo, insalata e pomodoro';
    log.barMeals = { pranzo: { label: 'Panino con pollo, insalata e pomodoro', nutrients: { kcal: 400, proteinG: 30, carbG: 56, fatG: 6, fiberG: 3 } } };
    const ctx = buildCoachContext(s, NOW);
    expect(ctx).toMatch(/sostituito, ordine al bar: 400\skcal, P 30 g, fibre 3 g/);
  });
});
