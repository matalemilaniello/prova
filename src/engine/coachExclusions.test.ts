/**
 * Esclusioni nel contesto del coach (docs/FASE2.md § 6.5): il contesto le elenca, il prompt di sistema vieta di
 * proporle; senza esclusioni il contesto non cambia. Dati inventati.
 */
import { describe, expect, it } from 'vitest';
import { buildDemo } from '../demo/seed';
import { buildCoachContext, COACH_SYSTEM_PROMPT } from './coachContext';

const NOW = new Date(2026, 10, 12, 13, 0, 0);

describe('esclusioni e coach', () => {
  it('il prompt di sistema vieta di proporre gli esclusi', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('Esclusi dall’utente');
    expect(COACH_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('il contesto elenca gli esclusi, con la data per quelli da domani', () => {
    const s = buildDemo('2026-11-12');
    expect(buildCoachContext(s, NOW)).not.toContain('Esclusi dall’utente');
    s.plan = {
      ...s.plan,
      exclusions: [
        { foodId: 'tonno', since: '2026-11-01', origin: 'non-mi-piace' },
        { foodId: 'zucchine', since: '2026-11-13', origin: 'impostazioni' },
      ],
    };
    const ctx = buildCoachContext(s, NOW);
    expect(ctx).toContain('Esclusi dall’utente: tonno e zucchine (da venerdì 13 novembre). Non proporli.');
  });
});
