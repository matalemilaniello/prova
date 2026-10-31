import { describe, expect, it } from 'vitest';
import { defaultAppData } from '../data/defaults';
import { backupFileName, createBackup, fmtBytes, parseBackup, serializeBackup, summarizeData } from './backup';

const NOW = new Date(Date.UTC(2026, 9, 31, 9, 0, 0));

function sample() {
  const d = defaultAppData('2026-10-31');
  d.onboarded = true;
  d.profile = { ...d.profile, name: 'Prova', birthYear: 1995, heightCm: 178, startWeightKg: 72 };
  d.settings = { ...d.settings, coachApiKey: 'sk-ant-chiave-di-prova-123456789' };
  d.dayLogs['2026-10-20'] = { date: '2026-10-20', status: {}, notes: {}, minimal: false, waterGlasses: 4, sweets: 0, recipeSwaps: {} };
  d.checkIns['2026-10-28'] = { date: '2026-10-28', weightKg: 71.8, pain: {} };
  return d;
}

describe('backup', () => {
  it('esporta senza la chiave del coach, salvo richiesta', () => {
    const d = sample();
    const env = createBackup(d, { now: NOW, appVersion: '0.1.0' });
    expect(env.kind).toBe('ritmo-backup');
    expect(env.exportedAt).toBe('2026-10-31T09:00:00.000Z');
    expect(env.data.settings.coachApiKey).toBeUndefined();
    // L'originale non cambia.
    expect(d.settings.coachApiKey).toBeDefined();
    expect(createBackup(d, { includeCoachKey: true }).data.settings.coachApiKey).toBe(d.settings.coachApiKey);
  });

  it('rilegge il proprio formato', () => {
    const text = serializeBackup(createBackup(sample(), { now: NOW, appVersion: '0.1.0' }));
    const res = parseBackup(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.exportedAt).toBe('2026-10-31T09:00:00.000Z');
    expect(res.summary).toMatchObject({ name: 'Prova', onboarded: true, dayLogs: 1, checkIns: 1, from: '2026-10-20', to: '2026-10-28', hasCoachKey: false });
  });

  it('accetta i dati nudi e il contenuto di localStorage, anche con BOM', () => {
    const d = sample();
    expect(parseBackup(JSON.stringify(d)).ok).toBe(true);
    expect(parseBackup(`﻿${JSON.stringify({ state: d, version: 1 })}`).ok).toBe(true);
  });

  it('spiega gli errori in modo utile', () => {
    expect(parseBackup('   ')).toMatchObject({ ok: false, code: 'vuoto' });
    expect(parseBackup('{"profile": {')).toMatchObject({ ok: false, code: 'json' });
    expect(parseBackup('ciao')).toMatchObject({ ok: false, code: 'json' });
    expect(parseBackup('[1,2]')).toMatchObject({ ok: false, code: 'formato' });
    expect(parseBackup('{"profile": {}}')).toMatchObject({ ok: false, code: 'formato' });
    expect(parseBackup(JSON.stringify({ ...sample(), version: 99 }))).toMatchObject({ ok: false, code: 'versione' });
    expect(parseBackup(JSON.stringify({ kind: 'ritmo-backup', format: 9, data: sample(), exportedAt: '' }))).toMatchObject({ ok: false, code: 'versione' });
    const res = parseBackup('{"profile": {');
    if (!res.ok) expect(res.error).not.toMatch(/—/);
  });

  it('riassume dati parziali senza errori', () => {
    expect(summarizeData({})).toMatchObject({ dayLogs: 0, workouts: 0, onboarded: false, from: undefined });
  });

  it('nomi dei file e dimensioni in italiano', () => {
    expect(backupFileName('2026-10-31')).toBe('ritmo-backup-2026-10-31.json');
    expect(fmtBytes(950)).toBe('950 byte');
    expect(fmtBytes(48_200)).toBe('47 kB');
    expect(fmtBytes(2_400_000)).toBe('2,3 MB');
  });
});
