/** Limiti del motore e catalogo d'impatto (docs/FASE2.md § 3.5-3.7, § 13.7 test 62). */
import { describe, expect, it } from 'vitest';
import type { SessionExercise, WorkoutSession } from '../../domain/types';
import { EXERCISES, EXERCISE_LIST, impactLevelOf, spaceOf } from '../../data/exercises';
import { DOSE_PRESETS, SESSIONS, estimateItemSec } from '../../data/sessions';
import { isImpactExercise } from '../training';
import {
  availableSpaces,
  candidatesFor,
  contactLimitsFor,
  floorOf,
  floorsDone,
  isHeavyLegs,
  isStrengthLegs,
  itemContacts,
  itemMeters,
  missingFloors,
  physioFloors,
  requiredFloors,
  sessionContacts,
  stepAllowed,
  substituteFor,
  substituteItem,
  warmupContacts,
} from './limits';

const JUMP_PATTERNS = new Set(['salto-verticale', 'salto-orizzontale', 'reattivo', 'laterale']);
const RUN_PATTERNS = new Set(['accelerazione', 'decelerazione', 'cambio-direzione', 'velocita-massima', 'aerobico', 'intermittente']);

describe('catalogo d’impatto (§ 3.7, 62)', () => {
  it('ogni esercizio ha uno schema; impact: true implica livello ≥ 1; i salti hanno contactsPerRep', () => {
    for (const e of EXERCISE_LIST) {
      expect(e.pattern, e.id).toBeDefined();
      if (e.impact) expect(impactLevelOf(e), e.id).toBeGreaterThanOrEqual(1);
      if (e.impact && e.pattern && JUMP_PATTERNS.has(e.pattern)) expect(e.contactsPerRep, e.id).toBeGreaterThan(0);
      if ((e.impactLevel ?? 0) >= 1) expect(e.impact, e.id).toBe(true);
    }
    expect(impactLevelOf(EXERCISES['balzi-del-pattinatore'])).toBe(2);
    expect(EXERCISES['balzi-del-pattinatore'].contactsPerRep).toBe(1);
  });

  it('ogni esercizio di corsa, sprint o salto è riconosciuto da isImpactExercise', () => {
    for (const e of EXERCISE_LIST) {
      const running = ['pliometria', 'sprint'].includes(e.category) || (e.pattern && RUN_PATTERNS.has(e.pattern) && e.space === 'campo');
      if (running && impactLevelOf(e) > 0) expect(isImpactExercise(e), e.id).toBe(true);
      if (impactLevelOf(e) === 0) expect(isImpactExercise(e), e.id).toBe(false);
    }
  });

  it('le 37 esercitazioni nuove ci sono, con spazio, qualità e una dose di riferimento', () => {
    const fresh = EXERCISE_LIST.slice(60);
    expect(fresh.length).toBe(37);
    for (const e of fresh) {
      expect(e.qualities?.length, e.id).toBeGreaterThan(0);
      expect(['palestra', 'corsia', 'campo', 'casa']).toContain(spaceOf(e));
      expect(DOSE_PRESETS[e.id], e.id).toBeDefined();
    }
  });

  it('i salti del riscaldamento entrano nei tetti di contatti', () => {
    const B = SESSIONS.B;
    expect(warmupContacts(B)).toBe(8);
    expect(sessionContacts(B)).toBe(8);
  });

  it('la prova del saltello sta fuori dal conteggio dei contatti', () => {
    expect(itemContacts(DOSE_PRESETS['prova-saltello'])).toBe(0);
    expect(itemContacts(DOSE_PRESETS['salto-sul-box'])).toBe(15);
  });
});

describe('contatti, metri e tetti (§ 3.4, § 3.6)', () => {
  it('tabella per fase', () => {
    expect(contactLimitsFor('stagione', 'stagione')).toEqual({ session: 30, week: 40, maxLevel: 2 });
    expect(contactLimitsFor('pausa', 'sviluppo')).toEqual({ session: 60, week: 100, maxLevel: 3 });
    expect(contactLimitsFor('precampionato', 'generale')).toEqual({ session: 50, week: 80, maxLevel: 3 });
    expect(contactLimitsFor('precampionato', 'rifinitura')).toEqual({ session: 25, week: 40, maxLevel: 2 });
  });

  it('contatti per gamba negli esercizi su una gamba, metri degli sprint', () => {
    const lateral: SessionExercise = { ...DOSE_PRESETS['balzi-laterali-fermata'] };
    expect(itemContacts(lateral)).toBe(2 * 6);
    expect(itemMeters(DOSE_PRESETS['accelerazioni-10m'])).toBe(80);
    expect(itemContacts(DOSE_PRESETS['accelerazioni-10m'])).toBe(0);
  });

  it('aumento tra due settimane di carico: +20%, o +10 contatti sotto i 50', () => {
    expect(stepAllowed(20, 30)).toBe(true);
    expect(stepAllowed(20, 31)).toBe(false);
    expect(stepAllowed(60, 72)).toBe(true);
    expect(stepAllowed(60, 73)).toBe(false);
    expect(stepAllowed(60, 40)).toBe(true);
  });

  it('stime della durata per sprint e intervalli: il recupero è dentro ogni ripetuta', () => {
    const acc = DOSE_PRESETS['accelerazioni-10m'];
    expect(estimateItemSec(acc)).toBe(10 + 7 * (10 * 0.2 + 60));
    const ivl = DOSE_PRESETS['cyclette-intervalli'];
    expect(estimateItemSec(ivl)).toBe(10 + 4 * (180 + 120));
    // Le sedute fisse non cambiano.
    expect(Object.values(SESSIONS).map((s) => s.estMin)).toEqual([55, 59, 37]);
  });
});

describe('gambe pesanti e pavimenti (§ 3.5)', () => {
  it('forza di gambe: multiarticolari da 3-6 ripetizioni; pesanti a RIR 2 o meno', () => {
    const trap: SessionExercise = { exerciseId: 'stacco-trap-bar', sets: 3, repMin: 4, repMax: 6, unit: 'reps', rir: 2, restSec: 150, progression: 'doppia' };
    expect(isStrengthLegs(trap)).toBe(true);
    expect(isHeavyLegs(trap)).toBe(true);
    expect(isHeavyLegs({ ...trap, rir: 3 })).toBe(false);
    expect(isStrengthLegs({ ...trap, exerciseId: 'hip-thrust-bilanciere' })).toBe(false);
    expect(isStrengthLegs({ ...trap, exerciseId: 'trap-bar-veloce' })).toBe(false);
  });

  it('pavimenti della fase, meno quelli del fisioterapista', () => {
    expect(requiredFloors('stagione', { elbow: true })).toEqual({ nordic: 1, copenhagen: 1, polpacci: 2, tibiale: 1, polso: 2, 'forza-gambe': 1 });
    expect(requiredFloors('pausa')).toEqual({ nordic: 2, copenhagen: 1, polpacci: 2, tibiale: 1 });
    const physio = { exercises: [{ id: 'f1', name: 'Copenhagen del fisioterapista', category: 'fisio' as const, equipment: 'Panca', cues: ['Uno', 'Due'] }], prescriptions: [{ exerciseId: 'f1', sets: 2, repMin: 6, repMax: 8, unit: 'reps' as const, restSec: 30, progression: 'nessuna' as const }] };
    expect(physioFloors(physio)).toEqual(new Set(['copenhagen']));
    expect(requiredFloors('stagione', { physio }).copenhagen).toBeUndefined();
  });

  it('le sedute fisse coprono i pavimenti della stagione', () => {
    const fixed = Object.values(SESSIONS) as WorkoutSession[];
    expect(missingFloors(requiredFloors('stagione', { elbow: true }), fixed)).toEqual({});
    expect(floorsDone(fixed).polpacci).toBe(2);
    expect(floorOf({ exerciseId: 'nordic-hamstring-curl', sets: 2, repMin: 4, repMax: 6, unit: 'reps', restSec: 120, progression: 'nessuna' })).toBe('nordic');
  });
});

describe('sostituzione deterministica (§ 3.7)', () => {
  const spaces = availableSpaces(undefined);

  it('sicuro: resta com’è', () => {
    expect(substituteFor('salto-sul-box', { maxLevel: 2, spaces })).toBe('salto-sul-box');
  });

  it('livello: lo stesso schema e la stessa famiglia prima, poi le alternative del catalogo', () => {
    expect(substituteFor('salti-ostacolini', { maxLevel: 1, spaces: availableSpaces(['corsia']) })).toBe('salti-corda');
    expect(substituteFor('balzi-del-pattinatore', { maxLevel: 0, spaces })).toBe('passi-laterali-elastico');
    expect(substituteFor('salto-sul-box', { maxLevel: 0, spaces })).toBe('lancio-palla-medica-dal-basso');
  });

  it('spazio: senza corsia né campo rapidità e velocità passano alle alternative senza spazio', () => {
    expect(substituteFor('accelerazioni-10m', { maxLevel: 3, spaces })).toBe('sprint-cyclette');
    expect(substituteFor('allunghi', { maxLevel: 3, spaces })).toBe('sprint-cyclette');
    expect(substituteFor('corsa-facile', { maxLevel: 3, spaces })).toBe('cyclette-facile');
    expect(substituteFor('accelerazioni-10m', { maxLevel: 3, spaces: availableSpaces(['campo']) })).toBe('sprint-salita');
  });

  it('gomito: solo varianti adatte; eccezioni dello stadio del rientro', () => {
    const sub = substituteFor('stacco-trap-bar', { maxLevel: 3, spaces, elbow: true })!;
    expect(EXERCISES[sub].elbowFriendly).toBe(true);
    expect(substituteFor('cammino-corsa', { maxLevel: 1, spaces: availableSpaces(['campo']), allowed: ['cammino-corsa'] })).toBe('cammino-corsa');
  });

  it('la prova del saltello non ha sostituti; un salto che diventa uno sprint in cyclette prende la sua dose', () => {
    expect(substituteFor('prova-saltello', { maxLevel: 1, spaces })).toBeNull();
    const sub = substituteItem({ ...DOSE_PRESETS['pogo-bilaterali'] }, { maxLevel: 0, spaces, categories: new Set(['pliometria', 'sprint', 'condizionamento', 'prevenzione']) })!;
    expect(sub.exerciseId).toBe('polpacci-esplosivi');
    expect(itemContacts(sub)).toBe(0);
    const bike = substituteItem({ ...DOSE_PRESETS['salto-verticale-fermo'] }, { maxLevel: 0, spaces, alternativesOnly: true })!;
    expect(bike.exerciseId).toBe('sprint-cyclette');
    expect(bike.workSec).toBe(8);
    // Senza una famiglia ammessa lo sprint salta invece di diventare un affondo.
    expect(substituteItem({ ...DOSE_PRESETS['frenate-tre-passi'] }, { maxLevel: 0, spaces, categories: new Set(['pliometria', 'sprint', 'condizionamento']) })).toBeNull();
  });

  it('candidati sicuri per i ritocchi del coach', () => {
    const c = candidatesFor('salto-sul-box', { maxLevel: 1, spaces });
    expect(c.length).toBeGreaterThan(0);
    expect(c).not.toContain('salto-sul-box');
    for (const id of c) expect(impactLevelOf(EXERCISES[id])).toBeLessThanOrEqual(1);
  });

  it('tra due esercizi d’impatto i contatti non superano quelli dell’originale', () => {
    const orig: SessionExercise = { ...DOSE_PRESETS['salti-ostacolini'], sets: 2, repMin: 3, repMax: 4 };
    const sub = substituteItem(orig, { maxLevel: 1, spaces: availableSpaces(['corsia']) })!;
    expect(sub.exerciseId).toBe('salti-corda');
    expect(itemContacts(sub)).toBeLessThanOrEqual(itemContacts(orig));
  });
});
