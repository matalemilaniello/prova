/**
 * Logica delle pagine Obiettivi e Calorie e macro (docs/FASE2.md § 2, § 11.4): effetto dell'obiettivo del corpo dentro i
 * limiti, obiettivi pronti della fase e quelli bloccati, bozza dell'allenamento, bozza della proposta solo con le parti
 * cambiate, stadi del rientro senza via libera, ricalcolo dal profilo con il deficit in vigore. Dati inventati.
 */
import { describe, expect, it } from 'vitest';
import type { DayType, Plan, Profile } from '../../domain/types';
import { DEFAULT_PROFILE, defaultPlan } from '../../data/defaults';
import { DEFAULT_TRAINING, PRESET_BY_ID } from '../../engine/plan/season';
import { computeTargets } from '../../engine/targets';
import {
  goalDeltaFor,
  goalEffect,
  goalsDraftOf,
  lockedLine,
  presetRows,
  recalcTargets,
  rientroMissingSite,
  secondaryOptions,
  shownTraining,
  stageChoices,
  trainingSummary,
  withPreset,
  withQualities,
} from './goals';

const TODAY = '2026-11-05';
const NOW = new Date('2026-11-05T09:00:00');
const plan = (over: Partial<Plan> = {}): Plan => ({ ...defaultPlan('2026-11-02'), ...over });
const profile: Profile = { ...DEFAULT_PROFILE, sex: 'M', birthYear: 1994, heightCm: 180, startWeightKg: 75, goal: 'ricomposizione' };
const DAY_TYPES: DayType[] = ['calcio', 'palestra', 'leggero', 'riposo'];

describe('corpo', () => {
  it('l’obiettivo di oggi tiene il deficit in vigore; un dimagrimento nuovo vale −350, mai oltre i limiti', () => {
    expect(goalDeltaFor('ricomposizione', plan(), profile, [])).toBe(0);
    expect(goalDeltaFor('dimagrimento', plan(), profile, [])).toBe(-350);
    expect(goalDeltaFor('massa', plan(), profile, [])).toBe(250);
    // Con obiettivi bassi il 20% del dispendio taglia il deficit.
    const low = plan();
    for (const t of DAY_TYPES) low.targets[t] = { ...low.targets[t], kcal: 1500 };
    expect(goalDeltaFor('dimagrimento', low, profile, [])).toBe(-300);
    // Un deficit già salvato vale per l'obiettivo in vigore.
    expect(goalDeltaFor('dimagrimento', plan({ goalDeltaKcal: -420 }), { ...profile, goal: 'dimagrimento' }, [])).toBe(-420);
  });

  it('la riga sull’effetto', () => {
    expect(goalEffect(-350)).toBe('−350 kcal al giorno, mai a partita e vigilia');
    expect(goalEffect(250)).toBe('+250 kcal al giorno');
    expect(goalEffect(0)).toBe('Calorie del dispendio stimato');
  });
});

describe('allenamento', () => {
  it('obiettivi pronti della stagione nell’ordine della tabella, con la riga di R8 su potenza e rapidità', () => {
    const rows = presetRows({ phase: 'stagione' }, true);
    expect(rows.map((r) => r.preset.id)).toEqual(['calcio', 'pliometria', 'rapido', 'forte', 'sicuro', 'rientro']);
    expect(rows.filter((r) => r.r8).map((r) => r.preset.id)).toEqual(['calcio', 'pliometria', 'rapido']);
    expect(presetRows({ phase: 'stagione' }, false).some((r) => r.r8)).toBe(false);
    expect(rows[0].text).toBe('Potenza, poi forza');
  });

  it('una riga dice quali si sbloccano in un’altra fase, senza opzioni grigie', () => {
    const line = lockedLine({ phase: 'stagione' })!;
    expect(line).toContain('più muscolo nella pausa estiva');
    expect(line).toContain('pronto per la stagione nel precampionato e nelle ultime 4 settimane della pausa');
    expect(lockedLine({ phase: 'pausa', lateBreak: true })).toContain('prestazione nel calcio');
  });

  it('scegliere un obiettivo pronto tiene tempo e spazi; il rientro parte dalla prima zona, stadio 0, da domani', () => {
    const base = { ...DEFAULT_TRAINING, sessionMin: 45, spaces: ['casa' as const] };
    const t = withPreset(base, PRESET_BY_ID.rientro, ['Caviglia', 'Spalla'], TODAY);
    expect(t).toMatchObject({ presetId: 'rientro', primary: 'rientro', secondary: 'prevenzione', sessionMin: 45, spaces: ['casa'] });
    expect(t.rientro).toEqual({ site: 'Caviglia', stage: 0, since: '2026-11-06' });
    // Lasciando il rientro, la zona non resta nella bozza.
    expect(withPreset(t, PRESET_BY_ID.forte, ['Caviglia'], TODAY).rientro).toBeUndefined();
    // Senza zone il rientro resta senza sito: la pagina porta alla pagina Dolore.
    expect(rientroMissingSite(withPreset(base, PRESET_BY_ID.rientro, [], TODAY))).toBe(true);
  });

  it('«Scegli tu»: niente coppie vietate con il rientro di una zona sotto il ginocchio', () => {
    const t = withQualities(undefined, 'rientro', undefined, ['Caviglia'], TODAY);
    expect(secondaryOptions({ phase: 'stagione' }, 'rientro', t.rientro)).not.toContain('potenza');
    expect(secondaryOptions({ phase: 'stagione' }, 'forza')).toContain('potenza');
    expect(withQualities(undefined, 'forza', 'forza', [], TODAY).secondary).toBeUndefined();
  });

  it('senza via libera solo gli stadi senza corsa né salti', () => {
    expect(stageChoices('Caviglia', false).map((s) => s.stage)).toEqual([0, 1]);
    expect(stageChoices('Caviglia', true).map((s) => s.stage)).toEqual([0, 1, 2, 3, 4]);
  });

  it('riga delle impostazioni', () => {
    expect(trainingSummary(undefined)).toBe('sedute fisse');
    expect(trainingSummary(DEFAULT_TRAINING)).toBe('Senza infortuni');
    expect(trainingSummary({ primary: 'forza', secondary: 'potenza' })).toBe('Forza, poi potenza');
  });
});

describe('bozza della proposta', () => {
  it('solo le parti cambiate rispetto al piano; senza cambi niente', () => {
    expect(goalsDraftOf({}, plan(), profile)).toBeNull();
    expect(goalsDraftOf({ goal: 'ricomposizione' }, plan(), profile)).toBeNull();
    expect(goalsDraftOf({ goal: 'dimagrimento' }, plan(), profile)).toEqual({ goal: 'dimagrimento' });
    const forte = { presetId: 'forte', primary: 'forza' as const, secondary: 'prevenzione' as const };
    expect(goalsDraftOf({ training: forte }, plan({ training: forte }), profile)).toBeNull();
    expect(goalsDraftOf({ training: forte }, plan(), profile)).toEqual({ training: forte });
  });

  it('«Senza infortuni» è già scelto, ma entra nella proposta solo se l’utente lo tocca', () => {
    expect(shownTraining(undefined, plan())).toEqual(DEFAULT_TRAINING);
    expect(goalsDraftOf({ goal: 'dimagrimento' }, plan(), profile)?.training).toBeUndefined();
    expect(goalsDraftOf({ training: DEFAULT_TRAINING }, plan(), profile)?.training).toEqual(DEFAULT_TRAINING);
  });
});

describe('ricalcolo dal profilo (Calorie e macro)', () => {
  it('in ricomposizione coincide con il ricalcolo di prima', () => {
    const r = recalcTargets(profile, 75, plan(), [], NOW);
    expect(r.goalDeltaKcal).toBe(0);
    expect(r.capped).toBe(false);
    expect(r.targets).toEqual(computeTargets(profile, 75, NOW));
  });

  it('tiene il deficit in vigore dentro i limiti, con 2,2 g/kg di proteine in dimagrimento', () => {
    const lean: Profile = { ...profile, goal: 'dimagrimento' };
    const r = recalcTargets(lean, 75, plan({ goalDeltaKcal: -500 }), [], NOW);
    expect(r.proteinPerKg).toBe(2.2);
    expect(r.targets.palestra.proteinG).toBe(165);
    const neutral = computeTargets({ ...profile, goal: 'mantenimento' }, 75, NOW);
    for (const t of DAY_TYPES) {
      const cut = neutral[t].kcal - r.targets[t].kcal;
      expect(cut).toBeLessThanOrEqual(550);
      expect(cut).toBeGreaterThanOrEqual(450);
    }
    // Un deficit oltre il 20% del dispendio si taglia.
    const small: Profile = { ...lean, heightCm: 160, startWeightKg: 50, birthYear: 1970, sex: 'F' };
    const capped = recalcTargets(small, 50, plan({ goalDeltaKcal: -500 }), [], NOW);
    expect(capped.capped).toBe(true);
    expect(capped.goalDeltaKcal).toBeGreaterThan(-500);
  });
});
