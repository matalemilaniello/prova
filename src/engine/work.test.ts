/**
 * Orario di lavoro: lettura del testo, forma salvata (stato, backup, azione dello store), blocchi in minuti.
 * Orari inventati, con l'etichetta generica «Lavoro».
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAppData, defaultPlan } from '../data/defaults';
import { createBackup, parseBackup, serializeBackup } from '../lib/backup';
import { normalizeData, pickData, useApp } from '../state/store';
import { planBasis } from './plan/proposals';
import { afterWork, formatWork, MAX_WORK_BLOCKS, normalizeWork, overlapsWork, parseWork, spanAt, workSpans } from './work';

const ok = (text: string) => {
  const r = parseWork(text);
  if (!r.ok) throw new Error(r.error);
  return r.blocks;
};
const err = (text: string) => {
  const r = parseWork(text);
  return r.ok ? null : r.error;
};

describe('parseWork: il testo delle impostazioni', () => {
  it('vuoto o «libero» è un giorno libero', () => {
    expect(ok('')).toEqual([]);
    expect(ok('   ')).toEqual([]);
    expect(ok('Libero')).toEqual([]);
  });

  it('ore da sole, con i due punti o con il punto', () => {
    expect(ok('9-13.30')).toEqual([{ from: '09:00', to: '13:30' }]);
    expect(ok('8:30-10:00, 10:30-13:00')).toEqual([
      { from: '08:30', to: '10:00' },
      { from: '10:30', to: '13:00' },
    ]);
    expect(ok('14.30-18')).toEqual([{ from: '14:30', to: '18:00' }]);
  });

  it('separatori diversi: punto e virgola, «e», spazi, trattini con spazi, «dalle … alle …»', () => {
    const two = [
      { from: '08:00', to: '12:00' },
      { from: '14:00', to: '17:00' },
    ];
    expect(ok('8-12; 14-17')).toEqual(two);
    expect(ok('8-12 e 14-17')).toEqual(two);
    expect(ok('8-12 14-17')).toEqual(two);
    expect(ok('8 - 12, 14 – 17')).toEqual(two);
    expect(ok('dalle 8 alle 12, dalle 14 alle 17')).toEqual(two);
  });

  it('blocchi fuori ordine si ordinano, quelli sovrapposti o contigui si uniscono', () => {
    expect(ok('14-17, 8-12')).toEqual([
      { from: '08:00', to: '12:00' },
      { from: '14:00', to: '17:00' },
    ]);
    expect(ok('8-11, 10-12')).toEqual([{ from: '08:00', to: '12:00' }]);
    expect(ok('8-10, 10-12')).toEqual([{ from: '08:00', to: '12:00' }]);
  });

  it('errori che dicono cosa non va', () => {
    expect(err('otto-dodici')).toBe('Non leggo «otto-dodici»: scrivi gli orari come 9:00-13:30.');
    expect(err('8')).toMatch(/^Non leggo «8»/);
    expect(err('8-12:4')).toMatch(/^Non leggo/);
    expect(err('25-26')).toBe('In «25-26» c’è un orario che non esiste.');
    expect(err('8:75-9')).toMatch(/non esiste/);
    expect(err('12-8')).toBe('In «12-8» la fine deve venire dopo l’inizio.');
    expect(err('8-8')).toMatch(/la fine deve venire dopo/);
    expect(err('7-8, 9-10, 11-12, 13-14, 15-16')).toBe(`Al massimo ${MAX_WORK_BLOCKS} blocchi al giorno.`);
    // Quattro blocchi vanno bene, anche se scritti in cinque pezzi che si uniscono.
    expect(ok('7-8, 9-10, 11-12, 13-14, 13.30-16')).toHaveLength(4);
  });

  it('formatWork rilegge quello che parseWork scrive', () => {
    const blocks = ok('8.30-10, 10.30-13');
    expect(formatWork(blocks)).toBe('08:30-10:00, 10:30-13:00');
    expect(ok(formatWork(blocks))).toEqual(blocks);
    expect(formatWork(undefined)).toBe('');
  });
});

describe('normalizeWork: la forma salvata', () => {
  it('tiene i blocchi validi, in ordine, uniti, al massimo 4', () => {
    expect(
      normalizeWork([
        { from: '14:00', to: '17:00' },
        { from: '08:00', to: '11:00' },
        { from: '10:30', to: '12:00' },
        { from: '9:00', to: '10:00' },
        { from: '18:00', to: '17:00' },
        { from: '20:00' },
        'lavoro',
        null,
      ]),
    ).toEqual([
      { from: '08:00', to: '12:00' },
      { from: '14:00', to: '17:00' },
    ]);
    expect(
      normalizeWork([
        { from: '06:00', to: '07:00' },
        { from: '08:00', to: '09:00' },
        { from: '10:00', to: '11:00' },
        { from: '12:00', to: '13:00' },
        { from: '14:00', to: '15:00' },
      ]),
    ).toHaveLength(4);
  });

  it('niente blocchi validi: il campo sparisce', () => {
    expect(normalizeWork([])).toBeUndefined();
    expect(normalizeWork([{ from: '12:00', to: '08:00' }])).toBeUndefined();
    expect(normalizeWork('08:00-12:00')).toBeUndefined();
    expect(normalizeWork(undefined)).toBeUndefined();
  });

  it('normalizeData ripara il campo nella settimana tipo e lo toglie se è vuoto', () => {
    const base = defaultAppData('2026-11-09');
    const week = base.plan.week.map((d) => ({ ...d }));
    (week[0] as Record<string, unknown>).work = [
      { from: '13:00', to: '14:30' },
      { from: '08:00', to: '12:00' },
      { from: '11:00', to: '12:30' },
    ];
    (week[1] as Record<string, unknown>).work = [];
    (week[2] as Record<string, unknown>).work = 'boh';
    const n = normalizeData({ ...base, plan: { ...base.plan, week } });
    expect(n.plan.week[0].work).toEqual([
      { from: '08:00', to: '12:30' },
      { from: '13:00', to: '14:30' },
    ]);
    expect('work' in n.plan.week[1]).toBe(false);
    expect('work' in n.plan.week[2]).toBe(false);
    // Andata e ritorno: già normalizzato resta uguale.
    expect(normalizeData(pickData(n)).plan.week).toEqual(n.plan.week);
  });

  it('senza il campo la settimana tipo resta quella di prima', () => {
    const base = defaultAppData('2026-11-09');
    const n = normalizeData(base);
    expect(n.plan.week).toEqual(base.plan.week);
    expect(n.plan.week.some((d) => 'work' in d)).toBe(false);
  });

  it('il backup porta l’orario di lavoro e lo rilegge', () => {
    const d = defaultAppData('2026-11-09');
    d.onboarded = true;
    d.plan.week[3] = { ...d.plan.week[3], work: [{ from: '09:00', to: '13:00' }] };
    const res = parseBackup(serializeBackup(createBackup(d)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(normalizeData(res.data).plan.week[3].work).toEqual([{ from: '09:00', to: '13:00' }]);
  });
});

describe('setScheduleDay con il lavoro', () => {
  beforeEach(() => {
    useApp.getState().resetAll();
  });

  it('salva i blocchi normalizzati e toglie il campo vuoto', () => {
    const st = useApp.getState();
    st.setScheduleDay(0, { work: [{ from: '14:00', to: '16:00' }, { from: '08:00', to: '12:00' }] });
    expect(useApp.getState().plan.week[0].work).toEqual([
      { from: '08:00', to: '12:00' },
      { from: '14:00', to: '16:00' },
    ]);
    st.setScheduleDay(0, { work: undefined });
    expect('work' in useApp.getState().plan.week[0]).toBe(false);
    st.setScheduleDay(1, { work: [] });
    expect('work' in useApp.getState().plan.week[1]).toBe(false);
    // Le altre modifiche del giorno non toccano il lavoro.
    st.setScheduleDay(2, { work: [{ from: '09:00', to: '13:00' }] });
    st.setScheduleDay(2, { physio: true });
    expect(useApp.getState().plan.week[2].work).toEqual([{ from: '09:00', to: '13:00' }]);
  });
});

describe('proposte del piano', () => {
  it('cambiare il lavoro non supera le proposte di blocco e di menù', () => {
    const s = defaultAppData('2026-11-09');
    const withWork = { ...s, plan: { ...s.plan, week: s.plan.week.map((d) => (d.weekday === 1 ? { ...d, work: [{ from: '09:00', to: '13:00' }] } : d)) } };
    expect(planBasis('blocco', withWork)).toBe(planBasis('blocco', s));
    expect(planBasis('menu', withWork)).toBe(planBasis('menu', s));
    // Un cambio vero della settimana sì.
    const gym = { ...s, plan: { ...s.plan, week: s.plan.week.map((d) => (d.weekday === 6 ? { ...d, gymSessionId: 'A' } : d)) } };
    expect(planBasis('menu', gym)).not.toBe(planBasis('menu', s));
  });
});

describe('blocchi in minuti', () => {
  const plan = defaultPlan('2026-11-09');

  it('workSpans unisce le pause corte solo quando glielo si chiede', () => {
    const work = [
      { from: '08:00', to: '10:00' },
      { from: '10:15', to: '12:50' },
      { from: '14:00', to: '16:00' },
    ];
    expect(workSpans(work, plan)).toEqual([
      [480, 600],
      [615, 770],
      [840, 960],
    ]);
    expect(workSpans(work, plan, 30)).toEqual([
      [480, 770],
      [840, 960],
    ]);
    expect(workSpans(undefined, plan)).toEqual([]);
  });

  it('un blocco che finisce prima dell’inizio della giornata conta nella notte', () => {
    // Sveglia 07:15: la giornata comincia alle 05:45.
    expect(workSpans([{ from: '00:30', to: '02:00' }], plan)).toEqual([[1470, 1560]]);
    expect(workSpans([{ from: '05:00', to: '09:00' }], plan)).toEqual([[300, 540]]);
  });

  it('spanAt, overlapsWork e afterWork', () => {
    const spans = workSpans([{ from: '08:00', to: '12:00' }], plan);
    expect(spanAt(480, spans)).toEqual([480, 720]);
    expect(spanAt(720, spans)).toBeUndefined();
    expect(overlapsWork(700, 760, spans)).toBe(true);
    expect(overlapsWork(720, 760, spans)).toBe(false);
    expect(afterWork(600, 15, spans, 30)).toBe(750);
    expect(afterWork(780, 15, spans, 30)).toBe(780);
    expect(afterWork(600, 15, [], 30)).toBe(600);
  });
});

describe('motore puro', () => {
  it('engine/work.ts ed engine/mealTimes.ts non leggono l’orologio e non usano Math.random', () => {
    for (const f of ['./work.ts', './mealTimes.ts']) {
      const src = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Date\.now\s*\(/);
      expect(src, f).not.toMatch(/new Date\s*\(\s*\)/);
      expect(src, f).not.toMatch(/Math\.random/);
    }
  });
});
