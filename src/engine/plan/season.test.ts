/** Fasi della stagione e obiettivi pronti (docs/FASE2.md § 2.3-2.4). Date inventate. */
import { describe, expect, it } from 'vitest';
import type { SeasonCalendar, SeasonPhase, TrainingQuality } from '../../domain/types';
import { addDays } from '../dates';
import { isPreseason as energyIsPreseason } from '../energy';
import {
  DEFAULT_TRAINING,
  PRESET_BY_ID,
  QUALITIES,
  TRAINING_PRESETS,
  dayTypeForLoad,
  forbiddenPair,
  lockedPresets,
  nextPhaseChange,
  preseasonStartOf,
  presetsFor,
  qualityAllowed,
  seasonOn,
  trainingAllowed,
  trainingForPhase,
} from './season';

const season: SeasonCalendar = { lastMatch: '2026-05-31', firstMatch: '2026-09-06', preseasonWeeks: 5 };

describe('fasi della stagione (§ 2.4)', () => {
  it('senza date è sempre in stagione', () => {
    for (const d of ['2026-01-01', '2026-06-15', '2026-08-20']) expect(seasonOn(d, undefined)).toEqual({ phase: 'stagione', stage: 'stagione' });
    expect(seasonOn('2026-06-15', {}).phase).toBe('stagione');
  });

  it('pausa: transizione nei 14 giorni dopo l’ultima partita, poi sviluppo; precampionato: generale, specifico, rifinitura', () => {
    expect(seasonOn('2026-05-31', season).phase).toBe('stagione');
    expect(seasonOn('2026-06-01', season)).toMatchObject({ phase: 'pausa', stage: 'transizione' });
    expect(seasonOn('2026-06-14', season).stage).toBe('transizione');
    expect(seasonOn('2026-06-15', season).stage).toBe('sviluppo');
    expect(preseasonStartOf(season)).toBe('2026-08-02');
    expect(seasonOn('2026-08-01', season)).toMatchObject({ phase: 'pausa', stage: 'sviluppo', lateBreak: true });
    expect(seasonOn('2026-07-05', season).lateBreak).toBe(true);
    expect(seasonOn('2026-07-04', season).lateBreak).toBeUndefined();
    expect(seasonOn('2026-08-02', season)).toMatchObject({ phase: 'precampionato', stage: 'generale' });
    expect(seasonOn('2026-08-15', season).stage).toBe('generale');
    expect(seasonOn('2026-08-16', season).stage).toBe('specifico');
    expect(seasonOn('2026-08-30', season).stage).toBe('rifinitura');
    expect(seasonOn('2026-09-05', season).stage).toBe('rifinitura');
    expect(seasonOn('2026-09-06', season).phase).toBe('stagione');
  });

  it('il precampionato non comincia prima del giorno dopo l’ultima partita', () => {
    const short: SeasonCalendar = { lastMatch: '2026-08-10', firstMatch: '2026-09-06', preseasonWeeks: 8 };
    expect(preseasonStartOf(short)).toBe('2026-08-11');
    expect(seasonOn('2026-08-10', short).phase).toBe('stagione');
    expect(seasonOn('2026-08-11', short)).toMatchObject({ phase: 'precampionato', stage: 'generale' });
  });

  it('isPreseason di engine/energy.ts legge le fasi di season.ts, come prima', () => {
    const cases: SeasonCalendar[] = [season, { firstMatch: '2026-09-06' }, { firstMatch: '2026-09-06', preseasonWeeks: 3 }, { lastMatch: '2026-05-31' }, { preseasonWeeks: 8 }];
    for (const s of cases) {
      for (let i = -80; i <= 10; i++) {
        const d = addDays('2026-09-06', i);
        // La regola ridotta dell'onda 0: prima della prima partita, entro le settimane, dopo l'ultima.
        const first = s.firstMatch;
        const weeks = Math.min(8, Math.max(3, s.preseasonWeeks ?? 5));
        const legacy = Boolean(first && d < first && d >= addDays(first, -7 * weeks) && !(s.lastMatch && d <= s.lastMatch));
        expect(energyIsPreseason(d, s), `${JSON.stringify(s)} ${d}`).toBe(legacy);
      }
    }
    expect(energyIsPreseason('2026-08-10', undefined)).toBe(false);
  });

  it('nextPhaseChange trova il primo giorno della fase dopo', () => {
    expect(nextPhaseChange('2026-05-25', season)).toBe('2026-06-01');
    expect(nextPhaseChange('2026-06-20', season)).toBe('2026-08-02');
    expect(nextPhaseChange('2026-06-20', undefined)).toBeUndefined();
  });

  it('nella pausa il tipo di giorno viene dal carico previsto', () => {
    expect(dayTypeForLoad(0)).toBe('riposo');
    expect(dayTypeForLoad(200)).toBe('leggero');
    expect(dayTypeForLoad(250)).toBe('palestra');
    expect(dayTypeForLoad(499)).toBe('palestra');
    expect(dayTypeForLoad(500)).toBe('calcio');
  });
});

describe('qualità e obiettivi pronti (§ 2.2-2.3)', () => {
  const phases: SeasonPhase[] = ['stagione', 'pausa', 'precampionato'];

  it('tabella di compatibilità', () => {
    const P = (q: TrainingQuality, phase: SeasonPhase, extra = {}) => qualityAllowed(q, 'principale', { phase, ...extra });
    const S = (q: TrainingQuality, phase: SeasonPhase, extra = {}) => qualityAllowed(q, 'secondaria', { phase, ...extra });
    expect([P('forza', 'stagione'), P('forza', 'pausa'), P('forza', 'precampionato'), S('forza', 'precampionato')]).toEqual([true, true, false, true]);
    expect([P('velocita', 'stagione'), S('velocita', 'stagione'), P('velocita', 'precampionato')]).toEqual([false, true, true]);
    expect([P('resistenza', 'stagione'), P('resistenza', 'stagione', { noFootballWeek: true }), P('resistenza', 'pausa'), P('resistenza', 'pausa', { lateBreak: true }), S('resistenza', 'pausa'), S('resistenza', 'precampionato'), P('resistenza', 'precampionato')]).toEqual([
      false,
      true,
      false,
      true,
      true,
      false,
      true,
    ]);
    expect([P('ipertrofia', 'stagione'), S('ipertrofia', 'stagione'), P('ipertrofia', 'pausa'), S('ipertrofia', 'precampionato')]).toEqual([false, true, true, false]);
    for (const q of ['potenza', 'rapidita', 'prevenzione', 'rientro'] as const) for (const ph of phases) expect(P(q, ph) && S(q, ph)).toBe(true);
    expect(QUALITIES.length).toBe(8);
  });

  it('obiettivi pronti e tabella coincidono: in ogni fase dichiarata principale e secondaria sono ammesse', () => {
    for (const p of TRAINING_PRESETS) {
      for (const phase of p.phases) {
        expect(qualityAllowed(p.primary, 'principale', { phase }), `${p.id} ${phase}`).toBe(true);
        expect(qualityAllowed(p.secondary, 'secondaria', { phase }), `${p.id} ${phase}`).toBe(true);
        expect(trainingAllowed({ presetId: p.id, primary: p.primary, secondary: p.secondary }, { phase })).toBe(true);
      }
    }
    expect(PRESET_BY_ID.sicuro.phases).toEqual(phases);
    expect(DEFAULT_TRAINING.presetId).toBe('sicuro');
  });

  it('elenco per fase e obiettivi che si sbloccano in un’altra', () => {
    expect(presetsFor({ phase: 'precampionato' }).map((p) => p.id)).toEqual(['calcio', 'pliometria', 'rapido', 'pronto', 'sicuro', 'rientro']);
    expect(lockedPresets({ phase: 'precampionato' }).map((p) => p.id)).toEqual(['forte', 'muscolo']);
    expect(presetsFor({ phase: 'pausa', lateBreak: true }).map((p) => p.id)).toContain('pronto');
    expect(presetsFor({ phase: 'pausa' }).map((p) => p.id)).not.toContain('pronto');
  });

  it('coppie vietate', () => {
    expect(forbiddenPair({ primary: 'potenza', secondary: 'rientro', rientro: { site: 'Tibia', stage: 1, since: '2026-01-05' } }, 'stagione')).toBe(true);
    expect(forbiddenPair({ primary: 'potenza', secondary: 'rientro', rientro: { site: 'Gomito', stage: 1, since: '2026-01-05' } }, 'stagione')).toBe(false);
    expect(forbiddenPair({ primary: 'resistenza', secondary: 'ipertrofia' }, 'precampionato')).toBe(true);
    expect(forbiddenPair({ primary: 'ipertrofia', secondary: 'resistenza' }, 'pausa')).toBe(false);
  });

  it('al cambio di fase: stessa principale, poi «Prestazione nel calcio» o «Senza infortuni»', () => {
    expect(trainingForPhase({ presetId: 'forte', primary: 'forza', secondary: 'prevenzione', sessionMin: 45 }, { phase: 'precampionato' })).toEqual({
      training: { presetId: 'calcio', primary: 'potenza', secondary: 'forza', sessionMin: 45 },
      replaced: { from: 'Più forte', to: 'Prestazione nel calcio' },
    });
    expect(trainingForPhase({ presetId: 'muscolo', primary: 'ipertrofia', secondary: 'forza' }, { phase: 'stagione' }).training.presetId).toBe('calcio');
    expect(trainingForPhase({ presetId: 'calcio', primary: 'potenza', secondary: 'forza' }, { phase: 'pausa' }).training.presetId).toBe('pliometria');
    expect(trainingForPhase({ presetId: 'pronto', primary: 'resistenza', secondary: 'velocita' }, { phase: 'stagione' }).training.presetId).toBe('calcio');
    // Scelta libera: la secondaria non ammessa si toglie.
    expect(trainingForPhase({ primary: 'potenza', secondary: 'ipertrofia' }, { phase: 'precampionato' }).training).toEqual({ primary: 'potenza' });
    expect(trainingForPhase(undefined, { phase: 'stagione' }).training).toEqual(DEFAULT_TRAINING);
  });
});
