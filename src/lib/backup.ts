/**
 * Backup dei dati di Ritmo: esportazione in JSON, lettura e validazione di un backup da importare,
 * e le utilità per consegnare un file (download, condivisione, appunti).
 *
 * Formato del file: { kind: 'ritmo-backup', format: 1, app, appVersion, exportedAt, data: AppData }.
 * In importazione si accettano anche i dati nudi (AppData) e il contenuto di localStorage
 * scritto dallo store ({ state: AppData, version }).
 *
 * Il backup è completo: comprende anche le sezioni della fase 2, piatti e proposte nel blob caldo, miniature e versioni
 * del piano nell'archivio freddo (`pickData` le prende tutte). Si accettano i backup fino a `DATA_VERSION` (4): un'app
 * più vecchia rifiuta un backup nuovo invece di perdere in silenzio piatti, proposte e versioni.
 *
 * La chiave del coach non entra nel backup, salvo richiesta esplicita.
 */
import type { AppData, ISODate } from '../domain/types';
import { DATA_VERSION } from '../data/defaults';
import { formatDayLong, isISODate } from '../engine/dates';

export const BACKUP_KIND = 'ritmo-backup';
export const BACKUP_FORMAT = 1;
/** Oltre questa dimensione il testo non è un backup plausibile (e bloccherebbe il telefono). */
export const BACKUP_MAX_BYTES = 25 * 1024 * 1024;

export interface BackupEnvelope {
  kind: typeof BACKUP_KIND;
  format: number;
  app: 'Ritmo';
  appVersion: string;
  /** Istante ISO dell'esportazione. */
  exportedAt: string;
  data: AppData;
}

export interface BackupSummary {
  name?: string;
  onboarded: boolean;
  demo: boolean;
  dayLogs: number;
  checkIns: number;
  workouts: number;
  football: number;
  reviews: number;
  chat: number;
  physio: number;
  /** I miei piatti. */
  dishes: number;
  /** Versioni del piano nello storico. */
  versions: number;
  /** Proposte del piano ancora aperte. */
  openProposals: number;
  /** Primo e ultimo giorno con dati (diario o controlli). */
  from?: ISODate;
  to?: ISODate;
  hasCoachKey: boolean;
}

export type BackupErrorCode = 'vuoto' | 'json' | 'formato' | 'versione' | 'troppo-grande';

export type ParseBackupResult =
  | { ok: true; data: Record<string, unknown>; summary: BackupSummary; exportedAt?: string; appVersion?: string }
  | { ok: false; code: BackupErrorCode; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ───────────────────────── Esportazione ─────────────────────────

export interface CreateBackupOptions {
  /** Include la chiave del coach (di base no: il file potrebbe finire in mani altrui). */
  includeCoachKey?: boolean;
  now?: Date;
  appVersion?: string;
}

export function createBackup(data: AppData, opts: CreateBackupOptions = {}): BackupEnvelope {
  const copy = JSON.parse(JSON.stringify(data)) as AppData;
  if (!opts.includeCoachKey && copy.settings) delete copy.settings.coachApiKey;
  return {
    kind: BACKUP_KIND,
    format: BACKUP_FORMAT,
    app: 'Ritmo',
    appVersion: opts.appVersion ?? '0.0.0',
    exportedAt: (opts.now ?? new Date()).toISOString(),
    data: copy,
  };
}

export function serializeBackup(env: BackupEnvelope): string {
  return `${JSON.stringify(env, null, 2)}\n`;
}

/** "ritmo-backup-2026-10-31.json" */
export function backupFileName(today: ISODate): string {
  return `ritmo-backup-${today}.json`;
}

// ───────────────────────── Importazione ─────────────────────────

const count = (v: unknown) => (Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : 0);

/** Numeri principali di un insieme di dati (per l'anteprima prima di importare o esportare). */
export function summarizeData(raw: Partial<AppData> | Record<string, unknown>): BackupSummary {
  const d = raw as Partial<AppData>;
  const dates = [
    ...Object.keys(isObj(d.dayLogs) ? d.dayLogs : {}),
    ...Object.keys(isObj(d.checkIns) ? d.checkIns : {}),
  ]
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();
  const settings = isObj(d.settings) ? d.settings : undefined;
  const profile = isObj(d.profile) ? d.profile : undefined;
  const physio = isObj(d.physio) ? d.physio : undefined;
  const planner = isObj(d.planner) ? d.planner : undefined;
  const proposals = Array.isArray(planner?.proposals) ? (planner.proposals as unknown[]) : [];
  return {
    name: typeof profile?.name === 'string' && profile.name.trim() ? profile.name.trim() : undefined,
    onboarded: Boolean(d.onboarded),
    demo: Boolean(settings?.demoData),
    dayLogs: count(d.dayLogs),
    checkIns: count(d.checkIns),
    workouts: count(d.workoutLogs),
    football: count(d.footballLogs),
    reviews: count(d.reviews),
    chat: count(d.chat),
    physio: count(physio?.prescriptions),
    dishes: Array.isArray(d.dishes) ? d.dishes.length : 0,
    versions: Array.isArray(d.planVersions) ? d.planVersions.length : 0,
    openProposals: proposals.filter((p) => isObj(p) && p.status === 'aperta').length,
    from: dates[0],
    to: dates[dates.length - 1],
    hasCoachKey: typeof settings?.coachApiKey === 'string' && settings.coachApiKey.length > 0,
  };
}

const fail = (code: BackupErrorCode, error: string): ParseBackupResult => ({ ok: false, code, error });

/**
 * Legge e valida il testo di un backup. Non tocca lo stato: restituisce i dati da passare a
 * `useApp.getState().importData(data)`, che completa i campi mancanti con i valori predefiniti.
 */
export function parseBackup(text: string): ParseBackupResult {
  const t = text.replace(/^﻿/, '').trim();
  if (!t) return fail('vuoto', 'Il testo è vuoto. Incolla il contenuto del file di backup oppure scegli il file.');
  if (byteSize(t) > BACKUP_MAX_BYTES) return fail('troppo-grande', 'Il file è troppo grande per essere un backup di Ritmo. Controlla di aver scelto il file giusto.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return fail(
      'json',
      t.startsWith('{')
        ? 'Il testo sembra tagliato o modificato: non è un JSON valido. Copialo di nuovo per intero, dalla prima all’ultima parentesi.'
        : 'Questo non è un backup di Ritmo. Il file giusto inizia con una parentesi graffa e finisce in .json.',
    );
  }
  if (!isObj(parsed)) return fail('formato', 'Questo non è un backup di Ritmo. Controlla di aver scelto il file giusto.');

  let data: unknown = parsed;
  let exportedAt: string | undefined;
  let appVersion: string | undefined;
  if (parsed.kind === BACKUP_KIND || (isObj(parsed.data) && 'exportedAt' in parsed)) {
    if (typeof parsed.format === 'number' && parsed.format > BACKUP_FORMAT) {
      return fail('versione', 'Il backup viene da una versione più recente di Ritmo. Aggiorna l’app e riprova.');
    }
    data = parsed.data;
    exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined;
    appVersion = typeof parsed.appVersion === 'string' ? parsed.appVersion : undefined;
  } else if (isObj(parsed.state) && isObj(parsed.state.profile)) {
    // Contenuto di localStorage scritto dallo store.
    data = parsed.state;
  }

  if (!isObj(data) || !isObj(data.profile) || !isObj(data.plan)) {
    return fail('formato', 'Mancano il profilo o il piano: questo file non è un backup completo di Ritmo.');
  }
  if (typeof data.version === 'number' && data.version > DATA_VERSION) {
    return fail('versione', 'Il backup viene da una versione più recente di Ritmo. Aggiorna l’app e riprova.');
  }
  const plan = data.plan as Record<string, unknown>;
  if (plan.week !== undefined && (!Array.isArray(plan.week) || !plan.week.every(isObj))) {
    return fail('formato', damaged('La settimana del piano è danneggiata'));
  }
  const broken = brokenSection(data);
  if (broken) return fail('formato', damaged(broken));
  return { ok: true, data, summary: summarizeData(data), exportedAt, appVersion };
}

const damaged = (what: string) => `${what}: il backup non si può importare. Prova con un backup precedente.`;

/** "31 ottobre", oppure la chiave così com'è se non è una data. */
const dayText = (key: unknown) => (isISODate(key) ? formatDayLong(key).replace(/^\S+\s/, '') : null);

/**
 * La prima sezione rovinata del backup, descritta per l'utente ("Il diario del 31 ottobre è danneggiato"),
 * oppure null. Le sezioni assenti vanno bene (si completano con i valori predefiniti); quelle presenti devono
 * avere la forma giusta, perché importare sostituisce tutto e una voce scartata in silenzio andrebbe persa.
 */
export function brokenSection(data: Record<string, unknown>): string | null {
  const profile = data.profile as Record<string, unknown>;
  if (profile.painSites !== undefined && (!Array.isArray(profile.painSites) || !profile.painSites.every((s) => typeof s === 'string'))) {
    return 'Le zone di dolore del profilo sono danneggiate';
  }

  const byDate = (key: 'dayLogs' | 'checkIns', label: (day: string | null) => string): string | null => {
    const v = data[key];
    if (v === undefined) return null;
    if (!isObj(v)) return label(null);
    for (const [k, entry] of Object.entries(v)) if (!isObj(entry)) return label(dayText(k));
    return null;
  };
  const diary = byDate('dayLogs', (d) => (d ? `Il diario del ${d} è danneggiato` : 'Il diario è danneggiato'));
  if (diary) return diary;
  const checks = byDate('checkIns', (d) => (d ? `Il controllo del mattino del ${d} è danneggiato` : 'I controlli del mattino sono danneggiati'));
  if (checks) return checks;

  const list = (key: keyof AppData, ok: (e: Record<string, unknown>) => boolean, label: (day: string | null) => string): string | null => {
    const v = data[key];
    if (v === undefined) return null;
    if (!Array.isArray(v)) return label(null);
    for (const e of v) if (!isObj(e) || !ok(e)) return label(isObj(e) ? dayText(e.date) : null);
    return null;
  };
  return (
    list('workoutLogs', (e) => Array.isArray(e.exercises), (d) => (d ? `La seduta del ${d} è danneggiata` : 'Le sedute registrate sono danneggiate')) ??
    list('footballLogs', () => true, (d) => (d ? `Il calcio del ${d} è danneggiato` : 'Le partite registrate sono danneggiate')) ??
    list('reviews', () => true, () => 'Le revisioni della domenica sono danneggiate') ??
    list('chat', () => true, () => 'La conversazione con il coach è danneggiata') ??
    (data.physio !== undefined && !isObj(data.physio) ? 'Gli esercizi del fisioterapista sono danneggiati' : null) ??
    (data.settings !== undefined && !isObj(data.settings) ? 'Le impostazioni sono danneggiate' : null) ??
    // Fase 2: piatti, proposte e storico del piano.
    list('dishes', (e) => Array.isArray(e.items), () => 'I miei piatti sono danneggiati') ??
    (data.dishThumbs !== undefined && !isObj(data.dishThumbs) ? 'Le foto dei piatti sono danneggiate' : null) ??
    (data.planner !== undefined && (!isObj(data.planner) || !Array.isArray(data.planner.proposals))
      ? 'Le proposte del piano sono danneggiate'
      : null) ??
    list('planVersions', (e) => isObj(e.after), () => 'Lo storico del piano è danneggiato')
  );
}

// ───────────────────────── Dimensioni ─────────────────────────

export function byteSize(text: string): number {
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
}

/** 950 → "950 byte", 48_200 → "47 kB", 2_400_000 → "2,3 MB". */
export function fmtBytes(n: number): string {
  if (n < 1000) return `${n} byte`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} kB`;
  return `${(n / (1024 * 1024)).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;
}

// ───────────────────────── Consegna del file ─────────────────────────

/**
 * Scarica un file di testo generato sul momento (Blob + link). Restituisce false se il browser non lo
 * permette (es. anteprima in un iframe senza download): in quel caso si ripiega sulla copia.
 */
export function downloadText(fileName: string, text: string, mime: string): boolean {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
  } catch {
    return false;
  }
}

/** True se il sistema sa condividere un file (foglio di condivisione di iPhone e Android). */
export function canShareFiles(): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function' || typeof File === 'undefined') return false;
    const probe = new File(['x'], 'prova.txt', { type: 'text/plain' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Apre il foglio di condivisione con il file. 'annullato' se l'utente lo chiude. */
export async function shareText(fileName: string, text: string, mime: string, title: string): Promise<'condiviso' | 'annullato' | 'non-disponibile'> {
  try {
    if (!canShareFiles()) return 'non-disponibile';
    const file = new File([text], fileName, { type: mime });
    await navigator.share({ files: [file], title });
    return 'condiviso';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'annullato' : 'non-disponibile';
  }
}

/**
 * Copia negli appunti con ripiego: Clipboard API, poi selezione nascosta con execCommand.
 * Restituisce false se nessuno dei due funziona: l'interfaccia mostra il testo da copiare a mano.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* si prova il ripiego */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    ta.contentEditable = 'true';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Legge un file scelto dall'utente come testo. */
export function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('lettura non riuscita'));
    r.readAsText(file);
  });
}

// ───────────────────────── Ultimo backup (solo su questo dispositivo) ─────────────────────────

const LAST_BACKUP_KEY = 'ritmo:last-backup';

export function getLastBackupAt(): string | null {
  try {
    return globalThis.localStorage?.getItem(LAST_BACKUP_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setLastBackupAt(iso: string | null): void {
  try {
    if (iso) globalThis.localStorage?.setItem(LAST_BACKUP_KEY, iso);
    else globalThis.localStorage?.removeItem(LAST_BACKUP_KEY);
  } catch {
    /* storage non disponibile: pazienza */
  }
}
