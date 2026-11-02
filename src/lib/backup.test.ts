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

  it('rifiuta un backup con una sezione rovinata e dice quale', () => {
    const broken = (patch: Record<string, unknown>) => parseBackup(JSON.stringify({ ...sample(), ...patch }));
    expect(broken({ dayLogs: { '2026-10-31': 'ciao' } })).toMatchObject({ ok: false, code: 'formato', error: expect.stringContaining('Il diario del 31 ottobre è danneggiato') });
    expect(broken({ dayLogs: [] })).toMatchObject({ ok: false, error: expect.stringContaining('Il diario è danneggiato') });
    expect(broken({ checkIns: { '2026-10-28': 71.8 } })).toMatchObject({ ok: false, error: expect.stringContaining('controllo del mattino del 28 ottobre') });
    expect(broken({ workoutLogs: [{ id: 'w', date: '2026-10-27', sessionId: 'A', exercises: 'tante' }] })).toMatchObject({
      ok: false,
      error: expect.stringContaining('La seduta del 27 ottobre è danneggiata'),
    });
    expect(broken({ workoutLogs: { a: 1 } })).toMatchObject({ ok: false, error: expect.stringContaining('sedute') });
    expect(broken({ footballLogs: [null] })).toMatchObject({ ok: false });
    expect(broken({ chat: 'ciao' })).toMatchObject({ ok: false, error: expect.stringContaining('coach') });
    expect(broken({ settings: [] })).toMatchObject({ ok: false });
    const d = sample();
    expect(parseBackup(JSON.stringify({ ...d, profile: { ...d.profile, painSites: 'Tibia' } }))).toMatchObject({ ok: false, error: expect.stringContaining('zone di dolore') });
    expect(parseBackup(JSON.stringify({ ...d, plan: { ...d.plan, week: [1, 2] } }))).toMatchObject({ ok: false, error: expect.stringContaining('settimana') });
    // Spiega anche come rimediare, senza trattini lunghi.
    const res = broken({ dayLogs: { '2026-10-31': 3 } });
    if (!res.ok) {
      expect(res.error).toContain('Prova con un backup precedente');
      expect(res.error).not.toMatch(/—/);
    }
  });

  it('accetta le sezioni assenti: si completano all’importazione', () => {
    const d = sample() as unknown as Record<string, unknown>;
    delete d.workoutLogs;
    delete d.chat;
    delete d.checkIns;
    expect(parseBackup(JSON.stringify(d)).ok).toBe(true);
  });

  it('riassume dati parziali senza errori', () => {
    expect(summarizeData({})).toMatchObject({ dayLogs: 0, workouts: 0, onboarded: false, from: undefined });
  });

  it('accetta i backup dalla versione 1 alla 4, rifiuta la 5', () => {
    for (const version of [1, 2, 3, 4]) expect(parseBackup(JSON.stringify({ ...sample(), version })).ok).toBe(true);
    expect(parseBackup(JSON.stringify({ ...sample(), version: 5 }))).toMatchObject({ ok: false, code: 'versione' });
  });

  it('il backup comprende piatti, proposte e archivio freddo, e li conta', () => {
    const d = {
      ...sample(),
      dishes: [{ id: 'p1', name: 'Pasta', slots: ['pranzo'], items: [{ foodId: 'pasta', grams: 100 }], nutrients: { kcal: 1, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 }, vegPortions: 0, createdAt: '', source: 'foto' as const }],
      dishThumbs: { p1: 'data:image/jpeg;base64,AAAA' },
      planner: {
        proposals: [
          { id: 'a', kind: 'menu', status: 'aperta', createdAt: '', effectiveFrom: '2026-11-02', basis: 'b', title: 't', patch: {}, diff: [], reasons: [], source: 'motore' },
          { id: 'b', kind: 'blocco', status: 'scartata', createdAt: '', effectiveFrom: '2026-11-02', basis: 'b', title: 't', patch: {}, diff: [], reasons: [], source: 'motore' },
        ],
      },
      planVersions: [{ id: 'v', at: '', effectiveFrom: '2026-11-02', kind: 'obiettivi', title: 't', before: {}, after: { goal: 'massa' } }],
    };
    const text = serializeBackup(createBackup(d as never, { now: NOW }));
    const res = parseBackup(text);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.summary).toMatchObject({ dishes: 1, versions: 1, openProposals: 1 });
    expect(res.data.dishThumbs).toEqual(d.dishThumbs);
    expect(summarizeData({})).toMatchObject({ dishes: 0, versions: 0, openProposals: 0 });
  });

  it('rifiuta un backup con piatti, proposte o storico rovinati', () => {
    const broken = (patch: Record<string, unknown>) => parseBackup(JSON.stringify({ ...sample(), ...patch }));
    expect(broken({ dishes: 'tanti' })).toMatchObject({ ok: false, error: expect.stringContaining('I miei piatti sono danneggiati') });
    expect(broken({ dishes: [{ id: 'x' }] })).toMatchObject({ ok: false, error: expect.stringContaining('piatti') });
    expect(broken({ dishThumbs: [] })).toMatchObject({ ok: false, error: expect.stringContaining('foto dei piatti') });
    expect(broken({ planner: { proposals: 3 } })).toMatchObject({ ok: false, error: expect.stringContaining('proposte del piano') });
    expect(broken({ planVersions: [{ id: 'v' }] })).toMatchObject({ ok: false, error: expect.stringContaining('storico del piano') });
    expect(broken({ planner: { proposals: [] }, planVersions: [] }).ok).toBe(true);
  });

  it('nomi dei file e dimensioni in italiano', () => {
    expect(backupFileName('2026-10-31')).toBe('ritmo-backup-2026-10-31.json');
    expect(fmtBytes(950)).toBe('950 byte');
    expect(fmtBytes(48_200)).toBe('47 kB');
    expect(fmtBytes(2_400_000)).toBe('2,3 MB');
  });
});
