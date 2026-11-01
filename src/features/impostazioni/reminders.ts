/**
 * Promemoria nel calendario, lato dispositivo: quali promemoria sono scelti e quale file è stato aggiunto al
 * calendario (chiave 'ritmo:promemoria', fuori dai dati e dal backup). Da qui si sa se il calendario è ancora
 * allineato al piano o se va aggiornato (vedi `calendarStatus` in engine/ics).
 *
 * Altre schermate possono usare `useCalendarStatus()`: per esempio la revisione della domenica, dopo aver
 * accettato la proposta del sonno, per invitare ad aggiornare il calendario. Oggi usa `useCalendarTask()` per la
 * riga "Da completare".
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { ISODate } from '../../domain/types';
import { isHHMM, isISODate } from '../../engine/dates';
import {
  DEFAULT_REMINDERS,
  REMINDER_KINDS,
  calendarFileRecord,
  calendarStatus,
  type CalendarFileRecord,
  type CalendarStatus,
  type ReminderKind,
  type ReminderState,
} from '../../engine/ics';
import { usePlanDay } from '../../state/hooks';
import { safeStorage, useApp } from '../../state/store';

export const REMINDERS_KEY = 'ritmo:promemoria';

export interface ReminderPrefs {
  kinds: ReminderKind[];
  file: CalendarFileRecord | null;
}

const isKind = (k: unknown): k is ReminderKind => typeof k === 'string' && (REMINDER_KINDS as string[]).includes(k);
const kindsFrom = (v: unknown): ReminderKind[] | null => (Array.isArray(v) ? REMINDER_KINDS.filter((k) => v.some((x) => x === k)) : null);

function fileFrom(v: unknown): CalendarFileRecord | null {
  if (typeof v !== 'object' || v === null) return null;
  const f = v as Record<string, unknown>;
  const sleep = f.sleep as Record<string, unknown> | undefined;
  if (!isISODate(f.at) || typeof f.sig !== 'string' || !Array.isArray(f.kinds) || !sleep) return null;
  if (!isHHMM(sleep.current) || !isHHMM(sleep.target) || typeof sleep.stepMin !== 'number') return null;
  return {
    at: f.at,
    ...(isISODate(f.origin) ? { origin: f.origin } : {}),
    sig: f.sig,
    kinds: f.kinds.filter(isKind),
    sleep: { current: sleep.current, target: sleep.target, stepMin: sleep.stepMin },
  };
}

/** Legge la scelta salvata: accetta anche il vecchio formato (solo l'elenco dei promemoria). */
function read(): ReminderPrefs {
  try {
    const raw = safeStorage.getItem(REMINDERS_KEY);
    const v = typeof raw === 'string' && raw ? (JSON.parse(raw) as unknown) : null;
    const legacy = kindsFrom(v);
    if (legacy) return { kinds: legacy, file: null };
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>;
      return { kinds: kindsFrom(o.kinds) ?? DEFAULT_REMINDERS, file: fileFrom(o.file) };
    }
  } catch {
    /* si usano quelli predefiniti */
  }
  return { kinds: DEFAULT_REMINDERS, file: null };
}

// Piccolo archivio esterno: tutte le schermate vedono subito il file appena aggiunto.
let cache: ReminderPrefs | null = null;
const listeners = new Set<() => void>();

function current(): ReminderPrefs {
  if (!cache) cache = read();
  return cache;
}

function write(next: ReminderPrefs) {
  cache = next;
  try {
    safeStorage.setItem(REMINDERS_KEY, JSON.stringify({ v: 2, kinds: next.kinds, ...(next.file ? { file: next.file } : {}) }));
  } catch {
    /* spazio finito: la scelta resta per questa sessione */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getReminderPrefs(): ReminderPrefs {
  return current();
}

export function saveReminderKinds(kinds: ReminderKind[]): void {
  write({ ...current(), kinds: REMINDER_KINDS.filter((k) => kinds.includes(k)) });
}

/**
 * Ricorda il file appena consegnato (scaricato, condiviso o copiato), con il lunedì da cui conta la sua scala del
 * sonno. Con `remember` salva anche la scelta dei promemoria (il benvenuto ne propone tre).
 */
export function saveCalendarFile(state: ReminderState, kinds: ReminderKind[], at: ISODate, remember = false): CalendarFileRecord {
  const file = calendarFileRecord(state, kinds, at);
  write({ ...current(), ...(remember ? { kinds: file.kinds } : {}), file });
  return file;
}

/** Dimentica scelta e file (azzera tutto). */
export function clearReminderPrefs(): void {
  cache = null;
  try {
    safeStorage.removeItem(REMINDERS_KEY);
  } catch {
    /* niente */
  }
  listeners.forEach((l) => l());
}

export function useReminderPrefs(): ReminderPrefs {
  return useSyncExternalStore(subscribe, current, current);
}

/**
 * Il calendario è allineato al piano? `kinds` di base: i promemoria del file aggiunto.
 * Nella pagina Promemoria si passa la scelta attuale, così una scelta cambiata chiede un file nuovo.
 */
export function useCalendarStatus(kinds?: ReminderKind[]): CalendarStatus {
  const prefs = useReminderPrefs();
  const plan = useApp((s) => s.plan);
  const physio = useApp((s) => s.physio);
  const reviews = useApp((s) => s.reviews);
  const today = usePlanDay();
  return useMemo(() => calendarStatus(prefs.file, { plan, physio, reviews }, today, kinds ?? prefs.file?.kinds), [prefs.file, plan, physio, reviews, today, kinds]);
}

/** Cosa resta da fare con il calendario, per la riga "Da completare" di Oggi. */
export type CalendarTask = { kind: 'calendario'; state: 'assente' | 'da-aggiornare' };

/** Testo della riga di Oggi. */
export const CALENDAR_TASK_TEXT: Record<CalendarTask['state'], string> = {
  assente: 'Aggiungi i promemoria al calendario',
  'da-aggiornare': 'Aggiorna i promemoria nel calendario',
};

/** Dove porta la riga di Oggi. */
export const CALENDAR_TASK_HASH = 'impostazioni?sezione=promemoria';

/**
 * Il calendario è l'unico modo in cui Ritmo raggiunge l'utente quando l'app è chiusa: finché non è allineato al
 * piano, Oggi lo propone. Mai con i dati di esempio; chi toglie tutti i promemoria in Impostazioni > Promemoria
 * non lo vede più.
 */
export function useCalendarTask(): CalendarTask | null {
  const status = useCalendarStatus();
  const { kinds, file } = useReminderPrefs();
  const demo = useApp((s) => s.settings.demoData);
  return useMemo(() => {
    if (demo) return null;
    if (status.state === 'da-aggiornare') return { kind: 'calendario', state: 'da-aggiornare' };
    if (status.state === 'assente' && !file && kinds.length > 0) return { kind: 'calendario', state: 'assente' };
    return null;
  }, [demo, status.state, file, kinds.length]);
}
