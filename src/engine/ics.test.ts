import { describe, expect, it } from 'vitest';
import type { AppData, Plan } from '../domain/types';
import { defaultPlan } from '../data/defaults';
import {
  BYDAY,
  bedtimeStages,
  buildIcs,
  calendarSignature,
  calendarStatus,
  escapeText,
  firstOccurrence,
  foldLine,
  icsDuration,
  localStamp,
  reminderEvents,
  REMINDER_KINDS,
  remindersIcs,
  romeOffsetMin,
  romeToUtcStamp,
  stageBedtime,
  unfold,
  utcStamp,
  type CalendarFileRecord,
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

  it('fisioterapista solo nei giorni segnati, dopo pranzo, e solo con gli esercizi inseriti', () => {
    const physio = {
      exercises: [],
      prescriptions: [{ exerciseId: 'polpacci-eccentrici', sets: 3, repMin: 15, repMax: 15, unit: 'reps' as const, restSec: 60, progression: 'nessuna' as const }],
    };
    const ev = reminderEvents(state({}, physio), ['fisio'], START);
    const days = ev.flatMap((e) => e.days).sort();
    expect(days).toEqual([0, 2]);
    for (const e of ev) expect(e.time >= '15:00' && e.time <= '16:30').toBe(true);
    expect(ev[0].description).toMatch(/^1 esercizio, circa \d+ minuti/);
    expect(reminderEvents(state(), ['fisio'], START)).toEqual([]);
  });

  it('coprifuoco ogni giorno, con la scala del sonno a gradini settimanali', () => {
    const late = state({ sleep: { ...defaultPlan(START).sleep, current: '00:15', target: '23:30', curfewLeadMin: 30 } });
    const ev = reminderEvents(late, ['coprifuoco'], START);
    const first = ev.filter((e) => e.stage?.index === 0);
    expect(first).toHaveLength(1);
    expect(first[0].days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(first[0].time).toBe('23:45');
    expect(first[0].description).toContain('A letto alle 00:15');
    expect(first[0].description).toContain('settimana 1 di 4');
    expect(first[0].until).toEqual({ date: '2026-11-09', time: '05:44' });
    // Gradini: 00:15 → 00:00 → 23:45 → 23:30, l'ultimo senza fine.
    const beds = [...new Set(ev.map((e) => e.stage?.bed))];
    expect(beds).toEqual(['00:15', '00:00', '23:45', '23:30']);
    const last = ev.filter((e) => e.stage?.index === 3);
    expect(last.every((e) => !e.until)).toBe(true);
    expect(last[0].from).toBe('2026-11-23');
    expect(last.find((e) => e.days.length > 1)?.time).toBe('23:00');
    expect(new Set(ev.map((e) => e.uid)).size).toBe(ev.length);
  });

  it('dopo mezzanotte il coprifuoco suona il giorno dopo del calendario', () => {
    // Fase 00:45, coprifuoco 00:15: la notte di lunedì suona martedì alle 00:15.
    const ev = reminderEvents(state(), ['coprifuoco'], START);
    const first = ev.find((e) => e.stage?.index === 0)!;
    expect(first.time).toBe('00:15');
    expect(first.planDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(first.from).toBe('2026-11-03');
    const ics = buildIcs([first], { start: START, now: NOW });
    expect(unfold(ics)).toContain('DTSTART;TZID=Europe/Rome:20261103T001500');
  });

  it('con l’orario a letto già all’obiettivo il coprifuoco è una serie sola, senza fine', () => {
    const done = state({ sleep: { ...defaultPlan(START).sleep, current: '23:30', target: '23:30' } });
    const all = reminderEvents(done, ['coprifuoco'], START);
    expect(all.every((e) => !e.until && !e.from)).toBe(true);
    // Le sere di calcio il letto si sposta dopo la cena di recupero: lunedì 00:15, coprifuoco 23:45.
    expect(all.find((e) => e.days.includes(0))?.time).toBe('23:45');
    const normal = all.find((e) => e.time === '23:00');
    expect(normal?.days).toEqual([1, 4, 5, 6]);
    expect(normal?.uid).toBe('ritmo-coprifuoco-sera-tu');
    expect(normal?.description).not.toContain('Scala del sonno');
  });

  it('controllo del mattino 5 minuti dopo la sveglia, ogni giorno', () => {
    const [ev] = reminderEvents(state(), ['controllo'], START);
    expect(ev.time).toBe('07:20');
    expect(ev.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(ev.description).toContain('peso');
    expect(ev.uid).toBe('ritmo-controllo-mattino');
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
      expect(e.RRULE).toMatch(/^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*(;UNTIL=\d{8}T\d{6}Z)?$/);
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
      const days = e.RRULE.split('BYDAY=')[1].split(';')[0].split(',').map((x) => map[x]);
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

  it('i gradini del coprifuoco si passano il testimone senza buchi né sovrapposizioni', () => {
    const steps = vevents(remindersIcs(state(), ['coprifuoco'], { start: START, now: NOW })).filter((e) => !/-(mo|we)-g/.test(e.UID));
    // Un gradino a settimana da 00:45 a 23:15 (le sere di calcio hanno serie a parte quando il letto si sposta).
    expect(steps).toHaveLength(7);
    // Gradino 1: fino alla notte di domenica 8 novembre (00:15 di lunedì 9), UNTIL alle 05:44 locali = 04:44 UTC.
    expect(steps[0].RRULE).toContain('UNTIL=20261109T044400Z');
    expect(steps[0]['DTSTART;TZID=Europe/Rome']).toBe('20261103T001500');
    // Gradino 2: dalla notte di lunedì 9 (martedì 10 alle 00:00).
    expect(steps[1]['DTSTART;TZID=Europe/Rome']).toBe('20261110T000000');
    // Ultimo gradino, all'obiettivo: senza UNTIL.
    expect(steps.at(-1)?.RRULE).not.toContain('UNTIL');
  });

  it('la revisione parte dalla prima settimana da rivedere', () => {
    // Benvenuto finito venerdì 6 alle 20:00: piano dal lunedì 9, prima revisione domenica 15.
    const late = state({ startDate: '2026-11-09', firstUse: { date: '2026-11-06', time: '20:00' } });
    const [rev] = vevents(remindersIcs(late, ['revisione'], { start: '2026-11-06', now: NOW }));
    expect(rev['DTSTART;TZID=Europe/Rome']).toBe('20261115T180000');
    // Senza primo avvio (dati vecchi o di esempio): dalla prima domenica utile.
    const [plain] = vevents(remindersIcs(state(), ['revisione'], { start: START, now: NOW }));
    expect(plain['DTSTART;TZID=Europe/Rome']).toBe('20261108T180000');
  });

  it('un gradino che finirebbe prima di cominciare non si scrive', () => {
    const ev: ReminderEvent = { uid: 'x', kind: 'coprifuoco', summary: 'X', description: '', time: '23:00', durationMin: 5, days: [0], until: { date: '2026-11-09', time: '05:44' } };
    // Creato domenica 8: il lunedì dopo è già oltre la fine.
    expect(buildIcs([ev], { start: '2026-11-08', now: NOW })).not.toContain('BEGIN:VEVENT');
  });

  it('converte l’ora di Roma in UTC con l’ora legale', () => {
    expect(romeToUtcStamp('2026-11-09', '05:44')).toBe('20261109T044400Z');
    expect(romeToUtcStamp('2026-07-06', '05:44')).toBe('20260706T034400Z');
    expect(romeOffsetMin('2026-03-29', '01:59')).toBe(60);
    expect(romeOffsetMin('2026-03-29', '03:00')).toBe(120);
    expect(romeOffsetMin('2026-10-25', '02:30')).toBe(120);
    expect(romeOffsetMin('2026-10-25', '03:00')).toBe(60);
  });

  it('rispetta l’ora legale: lo stesso orario locale prima e dopo il cambio', () => {
    // 25 ottobre 2026 è l'ultima domenica di ottobre: l'evento resta alle 18:00 locali grazie al TZID.
    const out = remindersIcs(state({ startDate: '2026-10-19' }), ['revisione'], { start: '2026-10-20', now: NOW });
    expect(out).toContain('DTSTART;TZID=Europe/Rome:20261025T180000');
  });
});

describe('scala del sonno e stato del file nel calendario', () => {
  const sleep = { current: '00:45', target: '23:30', stepMin: 15 };

  it('costruisce i gradini attraverso la mezzanotte e trova quello della settimana', () => {
    expect(bedtimeStages(sleep)).toEqual(['00:45', '00:30', '00:15', '00:00', '23:45', '23:30']);
    expect(bedtimeStages({ ...sleep, current: '23:00' })).toEqual(['23:00']);
    expect(bedtimeStages({ ...sleep, current: '00:40' }).at(-1)).toBe('23:30');
    expect(stageBedtime(sleep, '2026-11-04', '2026-11-08')).toBe('00:45');
    expect(stageBedtime(sleep, '2026-11-04', '2026-11-09')).toBe('00:30');
    expect(stageBedtime(sleep, '2026-11-04', '2027-03-01')).toBe('23:30');
    expect(stageBedtime(sleep, '2026-11-04', '2026-10-20')).toBe('00:45');
  });

  const kinds = ['controllo', 'coprifuoco'] as const;
  const base = state();
  const file: CalendarFileRecord = { at: '2026-11-04', kinds: [...kinds], sig: calendarSignature(base, [...kinds]), sleep };
  const withBed = (current: string) => ({ ...base, plan: { ...base.plan, sleep: { ...base.plan.sleep, current } } });
  const review = (weekStart: string) => ({ weekStart, votes: { energia: 7, digestione: 7, umore: 7, campo: 7 }, acceptedProposals: [] });

  it('senza file non c’è niente da aggiornare', () => {
    expect(calendarStatus(null, base, '2026-11-04')).toEqual({ state: 'assente' });
  });

  it('resta aggiornato se il piano scende la scala come previsto', () => {
    expect(calendarStatus(file, base, '2026-11-06').state).toBe('aggiornato');
    expect(calendarStatus(file, { ...withBed('00:30'), reviews: [review('2026-11-02')] }, '2026-11-11').state).toBe('aggiornato');
  });

  it('la domenica, dopo la revisione, va bene anche il gradino della settimana dopo', () => {
    expect(calendarStatus(file, withBed('00:30'), '2026-11-08').state).toBe('aggiornato');
    expect(calendarStatus(file, withBed('00:30'), '2026-11-07').state).toBe('da-aggiornare');
  });

  it('prima della revisione della settimana chiusa va bene ancora il gradino di prima', () => {
    expect(calendarStatus(file, base, '2026-11-10').state).toBe('aggiornato');
  });

  it('se la revisione non anticipa, il calendario è avanti: da aggiornare', () => {
    const res = calendarStatus(file, { ...base, reviews: [review('2026-11-02')] }, '2026-11-10');
    expect(res).toEqual({ state: 'da-aggiornare', at: '2026-11-04', reason: 'sonno', bed: '00:30' });
  });

  it('un cambio di orari, settimana o promemoria scelti rende il file vecchio', () => {
    const meals = { ...base, plan: { ...base.plan, mealTimes: { ...base.plan.mealTimes, colazione: '07:45' } } };
    expect(calendarStatus(file, meals, '2026-11-05')).toMatchObject({ state: 'da-aggiornare', reason: 'piano' });
    expect(calendarStatus(file, base, '2026-11-05', ['controllo'])).toMatchObject({ state: 'da-aggiornare', reason: 'piano' });
    // Le calorie non entrano nel calendario.
    const kcal = { ...base, plan: { ...base.plan, targets: { ...base.plan.targets, calcio: { ...base.plan.targets.calcio, kcal: 2950 } } } };
    expect(calendarStatus(file, kcal, '2026-11-05').state).toBe('aggiornato');
  });

  it('senza coprifuoco né integratori della sera l’orario a letto non conta', () => {
    const f2: CalendarFileRecord = { ...file, kinds: ['controllo'], sig: calendarSignature(base, ['controllo']) };
    expect(calendarStatus(f2, withBed('00:00'), '2026-11-05').state).toBe('aggiornato');
  });
});
