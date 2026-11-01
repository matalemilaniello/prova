import { describe, expect, it } from 'vitest';
import { DEFAULT_MEAL_TIMES, DEFAULT_SLEEP, DEFAULT_WEEK } from '../../data/defaults';
import {
  carbsToMatch,
  dayActivities,
  dayTypeCounts,
  elbowSites,
  hasErrors,
  impactRuleNote,
  initials,
  kcalFromMacros,
  lowerLegSites,
  matchEveCount,
  matchEveNote,
  mealOrderIssues,
  nextGymSession,
  normalizeSite,
  painLabel,
  shortTimeInBed,
  sleepSteps,
  sortSupplements,
  suggestedBedtime,
  suggestDayType,
  targetDayCounts,
  targetDaysLabel,
  validateBody,
  weekSummary,
} from './lib';

describe('profilo', () => {
  it('chiede i dati mancanti con gentilezza e controlla i limiti', () => {
    const empty = validateBody({ birthYear: 0, heightCm: 0, startWeightKg: 0 }, 2026);
    expect(Object.keys(empty).sort()).toEqual(['birthYear', 'heightCm', 'startWeightKg']);
    expect(hasErrors(validateBody({ birthYear: 1988, heightCm: 178, startWeightKg: 72.5 }, 2026))).toBe(false);
    expect(validateBody({ birthYear: 2020, heightCm: 178, startWeightKg: 72 }, 2026).birthYear).toContain('2012');
    expect(validateBody({ birthYear: 1990, heightCm: 1.78, startWeightKg: 72 }, 2026).heightCm).toContain('centimetri');
    expect(validateBody({ birthYear: 1990, heightCm: 178, startWeightKg: 720 }, 2026).startWeightKg).toBeDefined();
  });

  it('iniziali per l’avatar', () => {
    expect(initials('Luca Rossi')).toBe('LR');
    expect(initials('  anna ')).toBe('A');
    expect(initials(undefined)).toBe('');
  });
});

describe('settimana', () => {
  it('riassume la settimana tipo', () => {
    expect(weekSummary(DEFAULT_WEEK)).toBe('Calcio lun, mer e gio · palestra mar, ven e sab');
    expect(weekSummary(DEFAULT_WEEK.map((d) => ({ weekday: d.weekday, dayType: 'riposo' as const })))).toBe('Nessuna attività in programma');
    expect(dayTypeCounts(DEFAULT_WEEK)).toEqual([
      { type: 'calcio', count: 3 },
      { type: 'palestra', count: 2 },
      { type: 'leggero', count: 1 },
      { type: 'riposo', count: 1 },
    ]);
  });

  it('conta la vigilia della partita tra i giorni che mangiano come il calcio', () => {
    // Domenica di riposo, partita il lunedì: la domenica usa l'obiettivo del calcio.
    expect(targetDayCounts(DEFAULT_WEEK)).toEqual({ calcio: 4, palestra: 2, leggero: 1, riposo: 0 });
    expect(matchEveCount(DEFAULT_WEEK)).toBe(1);
    expect(matchEveNote(DEFAULT_WEEK)).toBe('La domenica, vigilia della partita, mangia come un giorno di calcio');
    // Senza partita il lunedì la domenica torna di riposo.
    const noMatch = DEFAULT_WEEK.map((d) => (d.weekday === 0 ? { ...d, football: undefined } : d));
    expect(targetDayCounts(noMatch)).toEqual({ calcio: 3, palestra: 2, leggero: 1, riposo: 1 });
    expect(matchEveCount(noMatch)).toBe(0);
    expect(matchEveNote(noMatch)).toBeNull();
  });

  it('etichetta i giorni di ogni obiettivo, con la vigilia dentro il calcio', () => {
    expect(targetDaysLabel('calcio', DEFAULT_WEEK)).toBe('3 giorni e la vigilia');
    expect(targetDaysLabel('palestra', DEFAULT_WEEK)).toBe('2 giorni');
    expect(targetDaysLabel('leggero', DEFAULT_WEEK)).toBe('1 giorno');
    expect(targetDaysLabel('riposo', DEFAULT_WEEK)).toBe('nessun giorno');
    const noMatch = DEFAULT_WEEK.map((d) => (d.weekday === 0 ? { ...d, football: undefined } : d));
    expect(targetDaysLabel('calcio', noMatch)).toBe('3 giorni');
    expect(targetDaysLabel('riposo', noMatch)).toBe('1 giorno');
  });

  it('descrive le attività del giorno', () => {
    expect(dayActivities(DEFAULT_WEEK[0]).map((a) => a.label)).toEqual(['Partita 21:00', 'Fisioterapista']);
    expect(dayActivities(DEFAULT_WEEK[5])[0].label).toBe('Seduta C 11:00, facoltativa');
  });

  it('suggerisce il tipo di giorno dalle attività', () => {
    expect(suggestDayType(DEFAULT_WEEK[0])).toBe('calcio');
    expect(suggestDayType({ ...DEFAULT_WEEK[0], football: undefined })).toBe('leggero');
    expect(suggestDayType(DEFAULT_WEEK[1])).toBe('palestra');
    expect(suggestDayType(DEFAULT_WEEK[5])).toBe('leggero');
    expect(suggestDayType(DEFAULT_WEEK[6])).toBe('riposo');
  });

  it('trova la prossima seduta, saltando quella di oggi già passata', () => {
    // 2026-11-03 è martedì: Seduta A alle 17:00.
    expect(nextGymSession({ week: DEFAULT_WEEK }, '2026-11-03', '10:00')).toMatchObject({ sessionId: 'A', inDays: 0 });
    expect(nextGymSession({ week: DEFAULT_WEEK }, '2026-11-03', '18:30')).toMatchObject({ sessionId: 'B', inDays: 3 });
    expect(nextGymSession({ week: DEFAULT_WEEK.map((d) => ({ ...d, gymSessionId: undefined })) }, '2026-11-03')).toBeNull();
  });
});

describe('pasti, sonno, macro', () => {
  it('segnala i pasti fuori ordine', () => {
    expect(mealOrderIssues(DEFAULT_MEAL_TIMES)).toEqual([]);
    expect(mealOrderIssues({ ...DEFAULT_MEAL_TIMES, spuntino: '07:00' })).toEqual(['spuntino']);
  });

  it('costruisce la scala del sonno attraverso la mezzanotte', () => {
    const steps = sleepSteps(DEFAULT_SLEEP);
    expect(steps.map((s) => s.bed)).toEqual(['00:45', '00:30', '00:15', '00:00', '23:45', '23:30', '23:15']);
    expect(sleepSteps({ ...DEFAULT_SLEEP, current: '23:00' })).toHaveLength(1);
    expect(sleepSteps({ ...DEFAULT_SLEEP, stepMin: 20 }).at(-1)?.bed).toBe('23:15');
  });

  it('suggerisce 8 ore a letto quando l’obiettivo ne lascia meno', () => {
    expect(suggestedBedtime('07:15')).toBe('23:15');
    expect(suggestedBedtime('06:30')).toBe('22:30');
    expect(suggestedBedtime('08:00')).toBe('00:00');
    expect(shortTimeInBed(DEFAULT_SLEEP)).toBe(false); // 23:15 → 07:15: 8 ore
    expect(shortTimeInBed({ ...DEFAULT_SLEEP, target: '23:45' })).toBe(true); // 7 h 30
    expect(shortTimeInBed({ ...DEFAULT_SLEEP, target: '22:45' })).toBe(false);
    // Già prima dell'obiettivo: conta l'orario attuale.
    expect(shortTimeInBed({ ...DEFAULT_SLEEP, current: '23:00', target: '23:45' })).toBe(false);
    expect(shortTimeInBed({ ...DEFAULT_SLEEP, current: '23:30', target: '23:45', wake: '06:30' })).toBe(true);
  });

  it('fa tornare i conti tra calorie e macro', () => {
    const t = { kcal: 2600, proteinG: 135, fatG: 80, carbG: 335 };
    expect(kcalFromMacros(t)).toBe(2600);
    expect(carbsToMatch({ ...t, kcal: 2750 })).toBe(375); // 372,5 g arrotondati a 5
    expect(carbsToMatch({ kcal: 1000, proteinG: 200, fatG: 100 })).toBe(0);
  });

  it('ordina gli integratori per momento della giornata', () => {
    const list = [
      { id: 'a', name: 'A', dose: '1', timing: 'sera' as const, active: true },
      { id: 'b', name: 'B', dose: '1', timing: 'colazione' as const, active: true },
      { id: 'c', name: 'C', dose: '1', timing: 'cena' as const, active: true },
    ];
    expect(sortSupplements(list).map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('normalizza le zone scritte a mano e descrive il dolore', () => {
    expect(normalizeSite('  polpaccio   destro ')).toBe('Polpaccio destro');
    expect(normalizeSite('   ')).toBe('');
    expect(painLabel(0)).toBe('nessun dolore');
    expect(painLabel(3)).toBe('lieve');
    expect(painLabel(5)).toBe('moderato');
    expect(painLabel(8)).toBe('forte');
  });

  it('riconosce le zone che cambiano la regola e scrive quella degli impatti', () => {
    const sites = ['Tibia', 'Gomito', 'Tendine d’Achille', 'Schiena'];
    expect(lowerLegSites(sites)).toEqual(['Tibia', 'Tendine d’Achille']);
    expect(elbowSites(sites)).toEqual(['Gomito']);
    expect(impactRuleNote(sites, 3)).toBe('Per tibia e tendine d’Achille balzi, salti e partita si fermano già sopra 2.');
    // Soglia già bassa o nessuna zona sotto il ginocchio: la regola generale basta.
    expect(impactRuleNote(sites, 2)).toBeNull();
    expect(impactRuleNote(['Gomito', 'Schiena'], 3)).toBeNull();
  });
});
