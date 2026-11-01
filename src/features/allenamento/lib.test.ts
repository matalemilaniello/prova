import { describe, expect, it } from 'vitest';
import { durationLabel } from './lib';

const plain = (s: string) => s.replace(/ /g, ' ');

describe('durationLabel', () => {
  it('senza fisioterapista dà solo i minuti della seduta', () => {
    expect(plain(durationLabel({ own: 55, physio: 0 }))).toBe('55 min');
  });

  it('con il fisioterapista scrive l’unità in entrambe le parti, come Oggi', () => {
    expect(plain(durationLabel({ own: 45, physio: 24 }))).toBe('45 min + 24 min dal fisioterapista');
  });

  it('va a capo solo prima del "+", mai dentro una durata', () => {
    const label = durationLabel({ own: 45, physio: 24 });
    expect(label).toContain('45 min + 24 min');
  });

  it('oltre l’ora usa ore e minuti', () => {
    expect(plain(durationLabel({ own: 65, physio: 20 }))).toBe('1 h 05 + 20 min dal fisioterapista');
  });

  it('la forma breve resta compatta sotto l’ora', () => {
    expect(plain(durationLabel({ own: 45, physio: 24 }, { short: true }))).toBe('45 + 24 min');
    expect(plain(durationLabel({ own: 65, physio: 20 }, { short: true }))).toBe('1 h 05 + 20 min');
  });
});
