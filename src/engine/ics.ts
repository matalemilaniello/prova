/**
 * Promemoria nel calendario: file .ics (RFC 5545) con eventi settimanali ricorrenti.
 *
 * - Righe terminate da CRLF e ripiegate a 75 ottetti (senza spezzare i caratteri UTF-8).
 * - Orari locali con TZID=Europe/Rome e il relativo VTIMEZONE (ora legale compresa).
 * - Ogni evento si ripete con RRULE:FREQ=WEEKLY;BYDAY=… e ha un VALARM all'orario.
 * - Gli orari vengono dalla stessa timeline della schermata Oggi (merenda e cena spostate nei giorni
 *   di calcio, fisioterapista dopo pranzo o dopo la palestra), così calendario e app non si contraddicono.
 * - Gli UID sono stabili: rigenerando il file dopo un cambio di piano molti calendari aggiornano gli eventi.
 */
import type { AppData, HHMM, ISODate, Plan, Supplement, TimelineItem, Weekday } from '../domain/types';
import { SESSIONS } from '../data/sessions';
import { addDays, hhmmToMin, isHHMM, minToHHMM, weekdayOf, weekStart } from './dates';
import { buildTimeline, physioMinutes, supplementList } from './timeline';
import { curfewFor } from './sleep';

// ───────────────────────── Tipi e costanti ─────────────────────────

export type ReminderKind = 'colazione' | 'pranzo' | 'palestra' | 'fisio' | 'coprifuoco' | 'revisione';

/** Ordine in cui si mostrano e si scrivono i promemoria. */
export const REMINDER_KINDS: ReminderKind[] = ['colazione', 'pranzo', 'palestra', 'fisio', 'coprifuoco', 'revisione'];

export const REMINDER_LABEL: Record<ReminderKind, string> = {
  colazione: 'Colazione e integratori',
  pranzo: 'Pranzo',
  palestra: 'Palestra',
  fisio: 'Esercizi del fisioterapista',
  coprifuoco: 'Coprifuoco del telefono',
  revisione: 'Revisione della domenica',
};

/** Promemoria proposti di base: quelli che cambiano davvero la giornata. */
export const DEFAULT_REMINDERS: ReminderKind[] = ['colazione', 'palestra', 'fisio', 'coprifuoco', 'revisione'];

/** Orario della revisione della domenica. */
export const REVIEW_TIME: HHMM = '18:00';
export const REVIEW_WEEKDAY: Weekday = 6;

export const ICS_TZID = 'Europe/Rome';
const CRLF = '\r\n';
const MAX_OCTETS = 75;

/** Giorni della settimana nella forma di RRULE, lunedì = 0. */
export const BYDAY: Record<Weekday, string> = { 0: 'MO', 1: 'TU', 2: 'WE', 3: 'TH', 4: 'FR', 5: 'SA', 6: 'SU' };

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** Un evento ricorrente, prima di diventare testo. */
export interface ReminderEvent {
  /** Identificativo stabile (senza dominio). */
  uid: string;
  kind: ReminderKind;
  summary: string;
  description: string;
  time: HHMM;
  durationMin: number;
  /** Giorni della settimana in cui si ripete (lunedì = 0), ordinati. */
  days: Weekday[];
}

export type ReminderState = Pick<AppData, 'plan'> & Partial<Pick<AppData, 'physio'>>;

// ───────────────────────── Testo RFC 5545 ─────────────────────────

/** Escape dei valori TEXT: barra rovesciata, punto e virgola, virgola, a capo. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const octets = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/**
 * Ripiega una riga a 75 ottetti (RFC 5545 §3.1): le righe di continuazione iniziano con uno spazio,
 * che conta nei 75. I caratteri multibyte non vengono mai spezzati.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let cur = '';
  let size = 0;
  let limit = MAX_OCTETS;
  for (const ch of line) {
    const n = octets(ch.codePointAt(0) ?? 0);
    if (size + n > limit) {
      parts.push(cur);
      cur = ' ';
      size = 1;
      limit = MAX_OCTETS;
    }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join(CRLF);
}

/** Inverso di foldLine (per i test e per leggere un file). */
export function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').split(CRLF).filter((l, i, a) => l !== '' || i < a.length - 1);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' + 'HH:MM' → '20261102T073000' (ora locale, da usare con TZID). */
export function localStamp(date: ISODate, time: HHMM): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

/** Data e ora UTC → '20261031T101500Z'. */
export function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/** Durata RFC 5545: 90 → 'PT1H30M', 20 → 'PT20M'. */
export function icsDuration(min: number): string {
  const m = Math.max(1, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `PT${h ? `${h}H` : ''}${r ? `${r}M` : ''}`;
}

/** Prima data (da `start` compreso) che cade in uno dei giorni indicati: DTSTART sincronizzato con la RRULE. */
export function firstOccurrence(start: ISODate, days: Weekday[]): ISODate {
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (days.includes(weekdayOf(d))) return d;
  }
  return start;
}

/** Definizione del fuso Europe/Rome (CET/CEST, regole UE in vigore dal 1996). */
export const VTIMEZONE_ROME: string[] = [
  'BEGIN:VTIMEZONE',
  `TZID:${ICS_TZID}`,
  `X-LIC-LOCATION:${ICS_TZID}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

// ───────────────────────── Eventi dal piano ─────────────────────────

/** Voci della timeline per ciascun giorno della settimana tipo (una data rappresentativa per giorno). */
function weekTimelines(state: ReminderState, start: ISODate): Record<Weekday, TimelineItem[]> {
  const monday = weekStart(start);
  const out = {} as Record<Weekday, TimelineItem[]>;
  for (const wd of ALL_DAYS) {
    const iso = addDays(monday, wd);
    try {
      out[wd] = buildTimeline(iso, { plan: state.plan, dayLogs: {}, physio: state.physio });
    } catch {
      out[wd] = fallbackTimeline(state.plan, wd);
    }
  }
  return out;
}

/** Ripiego minimo se la timeline non è disponibile: orari salvati nel piano. */
function fallbackTimeline(plan: Plan, wd: Weekday): TimelineItem[] {
  const t = plan.mealTimes;
  const day = plan.week.find((d) => d.weekday === wd);
  const items: TimelineItem[] = [
    { id: 'pasto:colazione', time: t.colazione, kind: 'pasto', title: 'Colazione', slot: 'colazione' },
    { id: 'pasto:pranzo', time: t.pranzo, kind: 'pasto', title: 'Pranzo', slot: 'pranzo' },
    { id: 'pasto:cena', time: t.cena, kind: 'pasto', title: 'Cena', slot: 'cena' },
    { id: 'coprifuoco', time: curfewFor('', plan), kind: 'coprifuoco', title: 'Coprifuoco' },
  ];
  if (day?.gymSessionId) items.push({ id: `palestra:${day.gymSessionId}`, time: day.gymTime ?? '17:00', kind: 'palestra', title: '', ref: day.gymSessionId });
  if (day?.physio) items.push({ id: 'fisio', time: minToHHMM(hhmmToMin(t.pranzo) + 75), kind: 'fisio', title: '' });
  return items;
}

interface Occurrence {
  day: Weekday;
  time: HHMM;
  summary: string;
  description: string;
  durationMin: number;
  /** Chiave che resta uguale se cambia solo l'orario (per UID stabili). */
  key: string;
}

/** Raggruppa le occorrenze identiche (stesso orario e testo) in un solo evento con più giorni. */
function groupOccurrences(kind: ReminderKind, list: Occurrence[]): ReminderEvent[] {
  const groups = new Map<string, Occurrence[]>();
  for (const o of list) {
    const k = [o.time, o.summary, o.description, o.durationMin].join('|');
    const g = groups.get(k);
    if (g) g.push(o);
    else groups.set(k, [o]);
  }
  const events: ReminderEvent[] = [];
  for (const g of groups.values()) {
    const days = [...new Set(g.map((o) => o.day))].sort((a, b) => a - b) as Weekday[];
    const first = g[0];
    const daily = days.length === 7;
    events.push({
      uid: `ritmo-${kind}-${first.key}${daily ? '' : `-${BYDAY[days[0]].toLowerCase()}`}`,
      kind,
      summary: first.summary,
      description: first.description,
      time: first.time,
      durationMin: first.durationMin,
      days,
    });
  }
  return events.sort((a, b) => a.days[0] - b.days[0] || hhmmToMin(a.time) - hhmmToMin(b.time));
}

const findItem = (items: TimelineItem[], id: string) => items.find((i) => i.id === id);

/** "Creatina" → "creatina", ma "EPA" resta "EPA". */
const lowerFirst = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const suppText = (list: Supplement[]) => {
  const parts = list.map((s) => (s.dose ? `${lowerFirst(s.name)} (${lowerFirst(s.dose)})` : lowerFirst(s.name)));
  return parts.length ? `${supplementListFrom(parts)}.` : '';
};

/** "a, b e c" senza ricalcolare le maiuscole (i nomi restano come li ha scritti l'utente). */
function supplementListFrom(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

const TIMING_TITLE: Record<Exclude<Supplement['timing'], 'colazione'>, string> = {
  pranzo: 'Integratori a pranzo',
  cena: 'Integratori a cena',
  sera: 'Integratori della sera',
};

/**
 * Eventi ricorrenti per i promemoria scelti.
 * `start` serve solo a scegliere una settimana rappresentativa (default: il piano).
 */
export function reminderEvents(state: ReminderState, kinds: ReminderKind[], start: ISODate = state.plan.startDate): ReminderEvent[] {
  const want = new Set(kinds);
  const { plan } = state;
  const tl = weekTimelines(state, start);
  const active = plan.supplements.filter((s) => s.active);
  const byTiming = (t: Supplement['timing']) => active.filter((s) => s.timing === t);
  const events: ReminderEvent[] = [];

  // Colazione con gli integratori del mattino; gli integratori degli altri momenti come eventi a parte.
  if (want.has('colazione')) {
    const morning = byTiming('colazione');
    const occ: Occurrence[] = ALL_DAYS.map((day) => {
      const item = findItem(tl[day], 'pasto:colazione');
      return {
        day,
        time: item?.time ?? plan.mealTimes.colazione,
        summary: morning.length ? 'Colazione e integratori' : 'Colazione',
        description: [morning.length ? `Integratori: ${suppText(morning)}` : '', 'In Ritmo trovi la colazione di oggi.']
          .filter(Boolean)
          .join(' '),
        durationMin: 20,
        key: 'mattino',
      };
    });
    events.push(...groupOccurrences('colazione', occ));

    for (const timing of ['pranzo', 'cena', 'sera'] as const) {
      const group = byTiming(timing);
      // Con il promemoria del pranzo attivo, gli integratori del pranzo vanno nella sua descrizione.
      if (!group.length || (timing === 'pranzo' && want.has('pranzo'))) continue;
      const occT: Occurrence[] = ALL_DAYS.map((day) => {
        const item = findItem(tl[day], timing === 'sera' ? 'coprifuoco' : `pasto:${timing}`);
        return {
          day,
          time: item?.time ?? (timing === 'sera' ? curfewFor('', plan) : plan.mealTimes[timing]),
          summary: TIMING_TITLE[timing],
          description: suppText(group),
          durationMin: 5,
          key: timing,
        };
      });
      events.push(...groupOccurrences('colazione', occT));
    }
  }

  if (want.has('pranzo')) {
    const lunchSupps = byTiming('pranzo');
    const occ: Occurrence[] = ALL_DAYS.map((day) => ({
      day,
      time: findItem(tl[day], 'pasto:pranzo')?.time ?? plan.mealTimes.pranzo,
      summary: 'Pranzo',
      description: [lunchSupps.length ? `Con il pranzo: ${suppText(lunchSupps)}` : '', 'In Ritmo trovi il pranzo di oggi con le porzioni.']
        .filter(Boolean)
        .join(' '),
      durationMin: 30,
      key: 'pranzo',
    }));
    events.push(...groupOccurrences('pranzo', occ));
  }

  if (want.has('palestra')) {
    const occ: Occurrence[] = [];
    for (const day of ALL_DAYS) {
      const sched = plan.week.find((d) => d.weekday === day);
      const id = sched?.gymSessionId;
      if (!id) continue;
      const item = tl[day].find((i) => i.kind === 'palestra');
      const session = SESSIONS[id];
      const est = session?.estMin ?? 55;
      const name = session?.name ?? `Seduta ${id}`;
      occ.push({
        day,
        time: item?.time ?? sched.gymTime ?? '17:00',
        summary: `Palestra · ${name}${sched.gymOptional ? ' (facoltativa)' : ''}`,
        description: `${session?.subtitle ? `${session.subtitle}, circa` : 'Circa'} ${est} minuti. Apri Ritmo per la seduta guidata con i carichi suggeriti.`,
        durationMin: est,
        key: `seduta-${id.toLowerCase()}`,
      });
    }
    events.push(...groupOccurrences('palestra', occ));
  }

  if (want.has('fisio')) {
    const mins = physioMinutes(state.physio);
    const n = state.physio?.prescriptions.length ?? 0;
    const occ: Occurrence[] = [];
    for (const day of ALL_DAYS) {
      const sched = plan.week.find((d) => d.weekday === day);
      if (!sched?.physio) continue;
      const item = findItem(tl[day], 'fisio');
      occ.push({
        day,
        time: item?.time ?? minToHHMM(hhmmToMin(plan.mealTimes.pranzo) + 75),
        summary: 'Esercizi del fisioterapista',
        description: n
          ? `${n === 1 ? '1 esercizio' : `${n} esercizi`}, circa ${mins} minuti. In Ritmo trovi dosi e indicazioni.`
          : 'Gli esercizi che ti ha dato il fisioterapista. Inseriscili in Ritmo per avere dosi e indicazioni.',
        durationMin: Math.max(10, mins || 20),
        key: 'fisio',
      });
    }
    events.push(...groupOccurrences('fisio', occ));
  }

  if (want.has('coprifuoco')) {
    const bed = plan.sleep.current;
    const occ: Occurrence[] = ALL_DAYS.map((day) => ({
      day,
      time: findItem(tl[day], 'coprifuoco')?.time ?? curfewFor('', plan),
      summary: 'Telefono fuori dalla camera',
      description: `In carica fuori dalla camera, luci basse. A letto alle ${bed}, sveglia alle ${plan.sleep.wake}.`,
      durationMin: 5,
      key: 'sera',
    }));
    events.push(...groupOccurrences('coprifuoco', occ));
  }

  if (want.has('revisione')) {
    events.push({
      uid: 'ritmo-revisione-domenica',
      kind: 'revisione',
      summary: 'Revisione della settimana',
      description: 'Dieci minuti in Ritmo: voti, misure e proposte da accettare per la settimana che arriva.',
      time: REVIEW_TIME,
      durationMin: 15,
      days: [REVIEW_WEEKDAY],
    });
  }

  return events;
}

// ───────────────────────── File .ics ─────────────────────────

export interface IcsOptions {
  /** Data da cui partono le ricorrenze (DTSTART = prima occorrenza da questa data). */
  start: ISODate;
  /** Istante di generazione (DTSTAMP). */
  now?: Date;
  calendarName?: string;
  /** Dominio degli UID. */
  uidDomain?: string;
}

/** Testo .ics completo per gli eventi indicati. */
export function buildIcs(events: ReminderEvent[], opts: IcsOptions): string {
  const stamp = utcStamp(opts.now ?? new Date());
  const domain = opts.uidDomain ?? 'ritmo.app';
  const name = opts.calendarName ?? 'Ritmo';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ritmo//Promemoria del piano//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${ICS_TZID}`,
    'X-APPLE-CALENDAR-COLOR:#F5C04A',
    ...VTIMEZONE_ROME,
  ];
  for (const ev of events) {
    if (!ev.days.length || !isHHMM(ev.time)) continue;
    const first = firstOccurrence(opts.start, ev.days);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}@${domain}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${ICS_TZID}:${localStamp(first, ev.time)}`,
      `DURATION:${icsDuration(ev.durationMin)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${ev.days.map((d) => BYDAY[d]).join(',')}`,
      `SUMMARY:${escapeText(ev.summary)}`,
      `DESCRIPTION:${escapeText(ev.description)}`,
      'CATEGORIES:Ritmo',
      'TRANSP:TRANSPARENT',
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(ev.summary)}`,
      'TRIGGER:PT0S',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** Scorciatoia: eventi dal piano e testo .ics. */
export function remindersIcs(state: ReminderState, kinds: ReminderKind[], opts: IcsOptions): string {
  return buildIcs(reminderEvents(state, kinds, opts.start), opts);
}

/** Nome del file: "ritmo-promemoria.ics". */
export const ICS_FILE_NAME = 'ritmo-promemoria.ics';

/** Elenco breve per l'interfaccia ("Integratori: creatina monoidrato e omega-3"). */
export function supplementsSummary(plan: Plan): string {
  return supplementList(plan.supplements.filter((s) => s.active));
}
