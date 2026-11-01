/**
 * Promemoria nel calendario: file .ics (RFC 5545) con eventi settimanali ricorrenti.
 *
 * - Righe terminate da CRLF e ripiegate a 75 ottetti (senza spezzare i caratteri UTF-8).
 * - Orari locali con TZID=Europe/Rome e il relativo VTIMEZONE (ora legale compresa).
 * - Ogni evento si ripete con RRULE:FREQ=WEEKLY;BYDAY=… e ha un VALARM all'orario.
 * - Gli orari vengono dalla stessa timeline della schermata Oggi (merenda e cena spostate nei giorni
 *   di calcio, fisioterapista dopo pranzo o dopo la palestra), così calendario e app non si contraddicono.
 * - Gli UID sono stabili: rigenerando il file dopo un cambio di piano molti calendari aggiornano gli eventi.
 * - Il coprifuoco segue la scala del sonno: una serie con UNTIL per ogni gradino (un passo a settimana, dal
 *   lunedì), l'ultimo, all'obiettivo, si ripete senza fine. Gli orari dopo mezzanotte cadono nel giorno dopo.
 */
import type { AppData, HHMM, ISODate, Plan, Supplement, TimelineItem, Weekday, WeeklyReview } from '../domain/types';
import { SESSIONS } from '../data/sessions';
import { hashString } from '../lib/id';
import { addDays, daysBetween, hhmmToMin, isHHMM, minToHHMM, nightMinutes, weekdayOf, weekStart } from './dates';
import { buildTimeline, physioMinutes, supplementList } from './timeline';
import { bedtimeFor, curfewFor, dayCutoffMin } from './sleep';

// ───────────────────────── Tipi e costanti ─────────────────────────

export type ReminderKind = 'controllo' | 'colazione' | 'pranzo' | 'palestra' | 'fisio' | 'coprifuoco' | 'revisione';

/** Ordine in cui si mostrano e si scrivono i promemoria. */
export const REMINDER_KINDS: ReminderKind[] = ['controllo', 'colazione', 'pranzo', 'palestra', 'fisio', 'coprifuoco', 'revisione'];

export const REMINDER_LABEL: Record<ReminderKind, string> = {
  controllo: 'Controllo del mattino',
  colazione: 'Colazione e integratori',
  pranzo: 'Pranzo',
  palestra: 'Palestra',
  fisio: 'Esercizi del fisioterapista',
  coprifuoco: 'Coprifuoco del telefono',
  revisione: 'Revisione della domenica',
};

/** Promemoria proposti di base: quelli che cambiano davvero la giornata. */
export const DEFAULT_REMINDERS: ReminderKind[] = ['controllo', 'colazione', 'palestra', 'fisio', 'coprifuoco', 'revisione'];

/** Il controllo del mattino arriva 5 minuti dopo la sveglia (come nella timeline). */
const CHECKIN_AFTER_WAKE = 5;

/** Gradini al massimo nella scala del sonno scritta nel calendario (sei mesi). */
export const MAX_SLEEP_STAGES = 26;

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
  /**
   * Giorni della giornata del piano, quando differiscono da `days`: il coprifuoco delle 00:15 della notte di
   * lunedì suona martedì. Serve all'interfaccia per descrivere l'evento.
   */
  planDays?: Weekday[];
  /** Prima data del calendario da cui può partire la serie (gradini della scala del sonno). */
  from?: ISODate;
  /** Ultimo istante della serie, ora locale di Roma: diventa UNTIL in UTC. */
  until?: { date: ISODate; time: HHMM };
  /** Gradino della scala del sonno (0 = questa settimana). */
  stage?: { index: number; count: number; bed: HHMM };
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

/** Giorno del mese dell'ultima domenica (mese 1-12). */
function lastSunday(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month, 0));
  return last.getUTCDate() - last.getUTCDay();
}

/**
 * Scarto di Europe/Rome da UTC, in minuti, per un'ora locale: 60 d'inverno, 120 con l'ora legale
 * (dall'ultima domenica di marzo alle 02:00 all'ultima domenica di ottobre alle 03:00, regole UE).
 */
export function romeOffsetMin(date: ISODate, time: HHMM): number {
  const [y, mo, d] = date.split('-').map(Number);
  const min = hhmmToMin(time);
  const reached = (month: number, day: number, at: number) => mo > month || (mo === month && (d > day || (d === day && min >= at)));
  return reached(3, lastSunday(y, 3), 120) && !reached(10, lastSunday(y, 10), 180) ? 120 : 60;
}

/** Ora locale di Roma → istante UTC nel formato di RFC 5545 (per UNTIL, che con TZID va in UTC). */
export function romeToUtcStamp(date: ISODate, time: HHMM): string {
  const [y, mo, d] = date.split('-').map(Number);
  return utcStamp(new Date(Date.UTC(y, mo - 1, d, 0, hhmmToMin(time)) - romeOffsetMin(date, time) * 60_000));
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
  /** Giorno della giornata del piano. */
  day: Weekday;
  time: HHMM;
  summary: string;
  description: string;
  durationMin: number;
  /** Chiave che resta uguale se cambia solo l'orario (per UID stabili). */
  key: string;
  /** Voce della notte: dopo mezzanotte suona il giorno dopo del calendario. */
  night?: boolean;
}

const sortDays = (list: Weekday[]) => [...new Set(list)].sort((a, b) => a - b) as Weekday[];

/** Raggruppa le occorrenze identiche (stesso orario e testo) in un solo evento con più giorni. */
function groupOccurrences(kind: ReminderKind, list: Occurrence[], cutoffMin = 0): ReminderEvent[] {
  const groups = new Map<string, Occurrence[]>();
  for (const o of list) {
    const k = [o.time, o.summary, o.description, o.durationMin].join('|');
    const g = groups.get(k);
    if (g) g.push(o);
    else groups.set(k, [o]);
  }
  const events: ReminderEvent[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    const planDays = sortDays(g.map((o) => o.day));
    const shifted = Boolean(first.night) && hhmmToMin(first.time) < cutoffMin;
    const days = shifted ? sortDays(planDays.map((d) => ((d + 1) % 7) as Weekday)) : planDays;
    const daily = days.length === 7;
    events.push({
      uid: `ritmo-${kind}-${first.key}${daily ? '' : `-${BYDAY[planDays[0]].toLowerCase()}`}`,
      kind,
      summary: first.summary,
      description: first.description,
      time: first.time,
      durationMin: first.durationMin,
      days,
      ...(shifted ? { planDays } : {}),
    });
  }
  return events.sort((a, b) => (a.planDays ?? a.days)[0] - (b.planDays ?? b.days)[0] || hhmmToMin(a.time) - hhmmToMin(b.time));
}

// ───────────────────────── Scala del sonno ─────────────────────────

/**
 * Gli orari a letto della scala del sonno, da quello attuale all'obiettivo, un passo a settimana
 * (00:45 → 00:30 → … → 23:30). Il primo è quello di questa settimana.
 */
export function bedtimeStages(sleep: Pick<Plan['sleep'], 'current' | 'target' | 'stepMin'>, max = MAX_SLEEP_STAGES): HHMM[] {
  const out: HHMM[] = [sleep.current];
  const target = nightMinutes(sleep.target);
  const step = Math.max(5, sleep.stepMin || 15);
  let cur = nightMinutes(sleep.current);
  while (cur > target && out.length < max) {
    cur = Math.max(target, cur - step);
    out.push(minToHHMM(cur));
  }
  return out;
}

/** Orario a letto previsto dalla scala per la settimana di `date`, partendo dalla settimana di `from`. */
export function stageBedtime(sleep: Pick<Plan['sleep'], 'current' | 'target' | 'stepMin'>, from: ISODate, date: ISODate): HHMM {
  const stages = bedtimeStages(sleep);
  const weeks = Math.floor(daysBetween(weekStart(from), weekStart(date)) / 7);
  return stages[Math.max(0, Math.min(stages.length - 1, weeks))];
}

/**
 * Eventi della notte (coprifuoco, integratori della sera) per ogni gradino della scala del sonno.
 * Ogni gradino copre una settimana del piano, da lunedì a domenica; l'ultimo si ripete senza fine.
 */
function stagedNightEvents(
  kind: ReminderKind,
  plan: Plan,
  start: ISODate,
  occurrences: (stagePlan: Plan, dateOf: (wd: Weekday) => ISODate, stage: { index: number; count: number; bed: HHMM }) => Occurrence[],
): ReminderEvent[] {
  const stages = bedtimeStages(plan.sleep);
  const cutoff = dayCutoffMin(plan);
  const cutoffEnd = minToHHMM(cutoff - 1);
  const monday = weekStart(start);
  const out: ReminderEvent[] = [];
  stages.forEach((bed, index) => {
    const weekMonday = addDays(monday, index * 7);
    const stagePlan: Plan = { ...plan, sleep: { ...plan.sleep, current: bed } };
    const stage = { index, count: stages.length, bed };
    const dateOf = (wd: Weekday) => addDays(weekMonday, wd);
    const last = index === stages.length - 1;
    const single = stages.length === 1;
    for (const ev of groupOccurrences(kind, occurrences(stagePlan, dateOf, stage), cutoff)) {
      const shifted = Boolean(ev.planDays);
      out.push({
        ...ev,
        uid: single ? ev.uid : `${ev.uid}-g${bed.replace(':', '')}`,
        stage,
        // Il primo gradino parte da oggi, gli altri dal lunedì della loro settimana; se la notte scavalca la
        // mezzanotte, dal giorno dopo (alle 00:15 di oggi suonava ancora la notte di ieri).
        ...(index > 0 ? { from: addDays(weekMonday, shifted ? 1 : 0) } : shifted ? { from: addDays(start, 1) } : {}),
        // Fine del gradino: la notte di domenica, prima dell'inizio della giornata di lunedì.
        ...(last ? {} : { until: { date: addDays(weekMonday, 7), time: cutoffEnd } }),
      });
    }
  });
  return out;
}

// ───────────────────────── Stato del file nel calendario ─────────────────────────

/** Il file aggiunto al calendario, come lo ricorda l'app (solo su questo dispositivo). */
export interface CalendarFileRecord {
  /** Giorno in cui è stato creato. */
  at: ISODate;
  kinds: ReminderKind[];
  /** Impronta del piano, senza l'orario a letto attuale (quello lo segue la scala). */
  sig: string;
  sleep: Pick<Plan['sleep'], 'current' | 'target' | 'stepMin'>;
}

/** Impronta di tutto ciò che finisce nel calendario, tranne l'orario a letto di questa settimana. */
export function calendarSignature(state: ReminderState, kinds: ReminderKind[]): string {
  const { plan } = state;
  const sleep = { wake: plan.sleep.wake, target: plan.sleep.target, stepMin: plan.sleep.stepMin, lead: plan.sleep.curfewLeadMin };
  const supps = plan.supplements.filter((s) => s.active).map((s) => [s.name, s.dose, s.timing]);
  const physio = [state.physio?.prescriptions.length ?? 0, physioMinutes(state.physio)];
  const kindsKey = REMINDER_KINDS.filter((k) => kinds.includes(k));
  return hashString(JSON.stringify([kindsKey, plan.mealTimes, plan.week, sleep, supps, physio])).toString(36);
}

export type CalendarStatus =
  | { state: 'assente' }
  | { state: 'aggiornato'; at: ISODate }
  | { state: 'da-aggiornare'; at: ISODate; reason: 'piano' | 'sonno'; bed?: HHMM };

/**
 * Il file nel calendario corrisponde ancora al piano?
 * - 'piano': pasti, settimana, integratori, sveglia, obiettivo del sonno o promemoria scelti sono cambiati.
 * - 'sonno': l'orario a letto del piano non è quello che la scala del file prevede per questa settimana
 *   (la revisione non ha anticipato, oppure l'orario è stato cambiato a mano). Prima della revisione della
 *   settimana appena chiusa vale anche il gradino precedente; la domenica, dopo la revisione, anche il prossimo.
 */
export function calendarStatus(
  file: CalendarFileRecord | null | undefined,
  state: ReminderState & Partial<Pick<AppData, 'reviews'>>,
  today: ISODate,
  kinds: ReminderKind[] = file?.kinds ?? [],
): CalendarStatus {
  if (!file) return { state: 'assente' };
  if (calendarSignature(state, kinds) !== file.sig) return { state: 'da-aggiornare', at: file.at, reason: 'piano' };
  const eveningSupps = kinds.includes('colazione') && state.plan.supplements.some((s) => s.active && s.timing === 'sera');
  if (!kinds.includes('coprifuoco') && !eveningSupps) return { state: 'aggiornato', at: file.at };
  const current = state.plan.sleep.current;
  const allowed = new Set<HHMM>([stageBedtime(file.sleep, file.at, today)]);
  if (weekdayOf(today) === 6) allowed.add(stageBedtime(file.sleep, file.at, addDays(today, 1)));
  const lastWeek = addDays(weekStart(today), -7);
  if (!(state.reviews ?? []).some((r: WeeklyReview) => r.weekStart === lastWeek)) allowed.add(stageBedtime(file.sleep, file.at, lastWeek));
  return allowed.has(current)
    ? { state: 'aggiornato', at: file.at }
    : { state: 'da-aggiornare', at: file.at, reason: 'sonno', bed: stageBedtime(file.sleep, file.at, today) };
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

  // Controllo del mattino: l'abitudine da cui dipendono peso, sonno e dolori nella revisione.
  if (want.has('controllo')) {
    const occ: Occurrence[] = ALL_DAYS.map((day) => ({
      day,
      time: findItem(tl[day], 'controllo')?.time ?? minToHHMM(hhmmToMin(plan.sleep.wake) + CHECKIN_AFTER_WAKE),
      summary: 'Controllo del mattino',
      description: 'Due minuti in Ritmo: peso a digiuno dopo il bagno, ore di sonno, dolori ed energia.',
      durationMin: 5,
      key: 'mattino',
    }));
    events.push(...groupOccurrences('controllo', occ));
  }

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

    for (const timing of ['pranzo', 'cena'] as const) {
      const group = byTiming(timing);
      // Con il promemoria del pranzo attivo, gli integratori del pranzo vanno nella sua descrizione.
      if (!group.length || (timing === 'pranzo' && want.has('pranzo'))) continue;
      const occT: Occurrence[] = ALL_DAYS.map((day) => ({
        day,
        time: findItem(tl[day], `pasto:${timing}`)?.time ?? plan.mealTimes[timing],
        summary: TIMING_TITLE[timing],
        description: suppText(group),
        durationMin: 5,
        key: timing,
      }));
      events.push(...groupOccurrences('colazione', occT));
    }

    // Integratori della sera: al coprifuoco, che segue la scala del sonno.
    const evening = byTiming('sera');
    if (evening.length) {
      events.push(
        ...stagedNightEvents('colazione', plan, start, (p, dateOf) =>
          ALL_DAYS.map((day) => ({
            day,
            time: curfewFor(dateOf(day), p),
            summary: TIMING_TITLE.sera,
            description: suppText(evening),
            durationMin: 5,
            key: 'sera',
            night: true,
          })),
        ),
      );
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

  // Esercizi del fisioterapista: solo se inseriti, come nella giornata (un avviso senza esercizi non serve).
  const physioCount = state.physio?.prescriptions.length ?? 0;
  if (want.has('fisio') && physioCount > 0) {
    const mins = physioMinutes(state.physio);
    const n = physioCount;
    const occ: Occurrence[] = [];
    for (const day of ALL_DAYS) {
      const sched = plan.week.find((d) => d.weekday === day);
      if (!sched?.physio) continue;
      const item = findItem(tl[day], 'fisio');
      occ.push({
        day,
        time: item?.time ?? minToHHMM(hhmmToMin(plan.mealTimes.pranzo) + 75),
        summary: 'Esercizi del fisioterapista',
        description: `${n === 1 ? '1 esercizio' : `${n} esercizi`}, circa ${mins} minuti. In Ritmo trovi dosi e indicazioni.`,
        durationMin: Math.max(10, mins || 20),
        key: 'fisio',
      });
    }
    events.push(...groupOccurrences('fisio', occ));
  }

  if (want.has('coprifuoco')) {
    events.push(
      ...stagedNightEvents('coprifuoco', plan, start, (p, dateOf, stage) =>
        ALL_DAYS.map((day) => {
          const date = dateOf(day);
          const scale =
            stage.count === 1
              ? ''
              : stage.index === stage.count - 1
                ? ' Scala del sonno: obiettivo raggiunto.'
                : ` Scala del sonno: settimana ${stage.index + 1} di ${stage.count}.`;
          return {
            day,
            time: curfewFor(date, p),
            summary: 'Telefono fuori dalla camera',
            description: `In carica fuori dalla camera, luci basse. A letto alle ${bedtimeFor(date, p)}, sveglia alle ${p.sleep.wake}.${scale}`,
            durationMin: 5,
            key: 'sera',
            night: true,
          };
        }),
      ),
    );
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
    const from = ev.from && ev.from > opts.start ? ev.from : opts.start;
    const first = firstOccurrence(from, ev.days);
    const until = ev.until ? romeToUtcStamp(ev.until.date, ev.until.time) : null;
    // Un gradino che finisce prima di cominciare (file creato a fine settimana) non si scrive.
    if (until && romeToUtcStamp(first, ev.time) > until) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}@${domain}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${ICS_TZID}:${localStamp(first, ev.time)}`,
      `DURATION:${icsDuration(ev.durationMin)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${ev.days.map((d) => BYDAY[d]).join(',')}${until ? `;UNTIL=${until}` : ''}`,
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
