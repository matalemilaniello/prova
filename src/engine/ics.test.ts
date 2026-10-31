import { describe, expect, it } from 'vitest';
import type { AppData, Plan } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import {
  BYDAY,
  buildIcs,
  escapeText,
  firstOccurrence,
  foldLine,
  icsDuration,
  localStamp,
  reminderEvents,
  REMINDER_KINDS,
  remindersIcs,
  unfold,
  utcStamp,
  type ReminderEvent,
} from './ics';

const START = '2026-11-02'; // lunedì
const NOW = new Date(Date.UTC(2026, 9, 31, 10, 15, 0));
const enc = new TextEncoder();

function state(patch: Partial<Plan> = {}, physio?: AppData['physio']) {
  return { plan: { ...defaultPlan(START), ...patch }, physio };
}

/** Proprietà di tutti gli eventi, dopo aver ricomposto le righe ripiegate. */
function vevents(ics: string): Record<string, string>[] {
  const lines = unfold(ics);
  const out: Record<string, string>[] = [];
  let cur: Record<string, string> | null = null;
  let inAlarm = false;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') cur = {};
    else if (l === 'END:VEVENT') {
      if (cur) out.push(cur);
      cur = null;
    } else if (l === 'BEGIN:VALARM') {
      inAlarm = true;
      if (cur) cur.ALARM = 'yes';
    } else if (l === 'END:VALARM') inAlarm = false;
    else if (cur && !inAlarm) {
      const i = l.indexOf(':');
      cur[l.slice(0, i)] = l.slice(i + 1);
    }
  }
  return out;
}

describe('testo RFC 5545', () => {
  it('fa l’escape di virgole, punti e virgola, barre e a capo', () => {
    expect(escapeText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
  });

  it('ripiega a 75 ottetti con lo spazio iniziale e senza spezzare i caratteri accentati', () => {
    const long = `DESCRIPTION:${'è'.repeat(100)}`;
    const folded = foldLine(long);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const [i, p] of parts.entries()) {
      expect(enc.encode(p).length).toBeLessThanOrEqual(75);
      if (i > 0) expect(p.startsWith(' ')).toBe(true);
      // Nessun carattere sostitutivo: i byte di "è" non sono stati divisi.
      expect(p).not.toContain('�');
    }
    expect(unfold(folded)[0]).toBe(long);
  });

  it('lascia intatte le righe corte', () => {
    expect(foldLine('SUMMARY:Pranzo')).toBe('SUMMARY:Pranzo');
  });

  it('formatta date, istanti e durate', () => {
    expect(localStamp('2026-11-02', '07:30')).toBe('20261102T073000');
    expect(utcStamp(NOW)).toBe('20261031T101500Z');
    expect(icsDuration(90)).toBe('PT1H30M');
    expect(icsDuration(20)).toBe('PT20M');
    expect(icsDuration(60)).toBe('PT1H');
  });

  it('sincronizza DTSTART con la ricorrenza', () => {
    expect(firstOccurrence('2026-11-02', [1, 4])).toBe('2026-11-03'); // martedì
    expect(firstOccurrence('2026-11-07', [0])).toBe('2026-11-09'); // da sabato al lunedì dopo
    expect(firstOccurrence('2026-11-08', [6])).toBe('2026-11-08'); // domenica stessa
  });
});

describe('eventi dal piano', () => {
  it('palestra nei giorni previsti con seduta, orario e durata', () => {
    const ev = reminderEvents(state(), ['palestra'], START);
    expect(ev.map((e) => e.days)).toEqual([[1], [4], [5]]);
    expect(ev[0].summary).toBe('Palestra · Seduta A');
    expect(ev[0].time).toBe('17:00');
    expect(ev[2].summary).toContain('(facoltativa)');
    expect(ev[2].time).toBe('11:00');
    expect(new Set(ev.map((e) => e.uid)).size).toBe(3);
  });

  it('fisioterapista solo nei giorni segnati, dopo pranzo', () => {
    const ev = reminderEvents(state(), ['fisio'], START);
    const days = ev.flatMap((e) => e.days).sort();
    expect(days).toEqual([0, 2]);
    for (const e of ev) expect(e.time >= '15:00' && e.time <= '16:30').toBe(true);
  });

  it('coprifuoco ogni giorno, anche dopo mezzanotte', () => {
    const late = state({ sleep: { ...defaultPlan(START).sleep, current: '00:15', curfewLeadMin: 30 } });
    const ev = reminderEvents(late, ['coprifuoco'], START);
    expect(ev).toHaveLength(1);
    expect(ev[0].days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(ev[0].time).toBe('23:45');
    expect(ev[0].description).toContain('00:15');
  });

  it('revisione la domenica alle 18:00', () => {
    const [rev] = reminderEvents(state(), ['revisione'], START);
    expect(rev.days).toEqual([6]);
    expect(rev.time).toBe('18:00');
  });

  it('colazione con gli integratori attivi del mattino', () => {
    const ev = reminderEvents(state(), ['colazione'], START);
    expect(ev).toHaveLength(1);
    expect(ev[0].summary).toBe('Colazione e integratori');
    expect(ev[0].description).toContain('creatina monoidrato (5 g)');
    expect(ev[0].time).toBe('07:30');
  });

  it('senza integratori attivi la colazione resta un promemoria semplice', () => {
    const plan = defaultPlan(START);
    const ev = reminderEvents(state({ supplements: plan.supplements.map((s) => ({ ...s, active: false })) }), ['colazione'], START);
    expect(ev[0].summary).toBe('Colazione');
  });

  it('integratori della sera come evento a parte, al coprifuoco', () => {
    const plan = defaultPlan(START);
    const supplements = [...plan.supplements, { id: 'mg', name: 'Magnesio', dose: '300 mg', timing: 'sera' as const, active: true }];
    const ev = reminderEvents(state({ supplements }), ['colazione'], START);
    const evening = ev.find((e) => e.summary === 'Integratori della sera');
    expect(evening?.time).toBe('00:15');
    expect(evening?.description).toContain('magnesio (300 mg)');
  });

  it('nei giorni di calcio serale gli integratori della cena seguono la cena di recupero', () => {
    const plan = defaultPlan(START);
    const supplements = [{ id: 'x', name: 'Omega-3', dose: '2 g', timing: 'cena' as const, active: true }];
    const ev = reminderEvents(state({ supplements: [...plan.supplements.slice(0, 1), ...supplements] }), ['colazione'], START);
    const dinners = ev.filter((e) => e.summary === 'Integratori a cena');
    expect(dinners.length).toBeGreaterThan(1);
    const normal = dinners.find((e) => e.days.includes(6));
    const monday = dinners.find((e) => e.days.includes(0));
    expect(normal?.time).toBe('20:30');
    expect(monday && monday.time > '22:00').toBe(true);
  });

  it('filtra per tipo e non duplica gli integratori del pranzo', () => {
    const plan = defaultPlan(START);
    const supplements = [...plan.supplements, { id: 'p', name: 'Ferro', dose: '1 compressa', timing: 'pranzo' as const, active: true }];
    const both = reminderEvents(state({ supplements }), ['colazione', 'pranzo'], START);
    expect(both.some((e) => e.summary === 'Integratori a pranzo')).toBe(false);
    expect(both.find((e) => e.summary === 'Pranzo')?.description).toContain('ferro')
    const onlyBreakfast = reminderEvents(state({ supplements }), ['colazione'], START);
    expect(onlyBreakfast.some((e) => e.summary === 'Integratori a pranzo')).toBe(true);
    expect(reminderEvents(state(), [], START)).toEqual([]);
  });
});

describe('file .ics', () => {
  const ics = remindersIcs(state(), REMINDER_KINDS, { start: START, now: NOW });

  it('usa CRLF e righe di al massimo 75 ottetti', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const line of ics.split('\r\n')) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
  });

  it('ha calendario, fuso Europe/Rome e un VALARM per ogni evento', () => {
    const lines = unfold(ics);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('TZID:Europe/Rome');
    expect(lines).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU');
    const evs = vevents(ics);
    expect(evs.length).toBeGreaterThan(5);
    for (const e of evs) {
      expect(e.ALARM).toBe('yes');
      expect(e['DTSTART;TZID=Europe/Rome']).toMatch(/^\d{8}T\d{6}$/);
      expect(e.RRULE).toMatch(/^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/);
      expect(e.DTSTAMP).toBe('20261031T101500Z');
      expect(e.UID).toMatch(/@ritmo\.app$/);
    }
    expect(new Set(evs.map((e) => e.UID)).size).toBe(evs.length);
  });

  it('DTSTART cade in uno dei giorni della ricorrenza', () => {
    const map: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };
    for (const e of vevents(ics)) {
      const s = e['DTSTART;TZID=Europe/Rome'];
      const d = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)), 12);
      const days = e.RRULE.split('BYDAY=')[1].split(',').map((x) => map[x]);
      expect(days).toContain(d.getDay());
    }
  });

  it('la palestra del martedì parte martedì 3 novembre alle 17:00', () => {
    const gym = vevents(ics).find((e) => e.SUMMARY === 'Palestra · Seduta A');
    expect(gym?.['DTSTART;TZID=Europe/Rome']).toBe('20261103T170000');
    expect(gym?.RRULE).toBe(`FREQ=WEEKLY;BYDAY=${BYDAY[1]}`);
  });

  it('salta gli eventi senza giorni o con orari non validi', () => {
    const bad: ReminderEvent[] = [
      { uid: 'a', kind: 'pranzo', summary: 'A', description: '', time: '25:00', durationMin: 10, days: [0] },
      { uid: 'b', kind: 'pranzo', summary: 'B', description: '', time: '12:00', durationMin: 10, days: [] },
    ];
    expect(buildIcs(bad, { start: START, now: NOW })).not.toContain('BEGIN:VEVENT');
  });

  it('rispetta l’ora legale: lo stesso orario locale prima e dopo il cambio', () => {
    // 25 ottobre 2026 è l'ultima domenica di ottobre: l'evento resta alle 18:00 locali grazie al TZID.
    const out = remindersIcs(state(), ['revisione'], { start: '2026-10-20', now: NOW });
    expect(out).toContain('DTSTART;TZID=Europe/Rome:20261025T180000');
  });
});
