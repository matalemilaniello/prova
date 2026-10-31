/**
 * Cronologia della chat del coach: aggiunta con limite, pulizia delle foto vecchie, raggruppamento
 * per la visualizzazione e testi delle date. Le azioni passano dallo store senza modificarlo.
 */
import type { ChatMessage, ISODate } from '../../domain/types';
import { addDays, formatDayLong, toISO } from '../../engine/dates';
import { useApp } from '../../state/store';

/** Messaggi conservati sul telefono. */
export const CHAT_KEEP = 60;
/** Foto conservate nella cronologia (le più recenti): lo spazio sul telefono è poco. */
export const CHAT_KEEP_IMAGES = 12;

/** Ultimi 60 messaggi; oltre le 12 foto più recenti l'immagine si toglie (resta il testo). */
export function pruneChat(chat: readonly ChatMessage[]): ChatMessage[] {
  const kept = chat.slice(-CHAT_KEEP);
  let images = 0;
  const out: ChatMessage[] = new Array(kept.length);
  for (let i = kept.length - 1; i >= 0; i--) {
    const m = kept[i];
    if (m.image) {
      images++;
      if (images > CHAT_KEEP_IMAGES) {
        const { image: _drop, ...rest } = m;
        void _drop;
        out[i] = rest;
        continue;
      }
    }
    out[i] = m;
  }
  return out;
}

type NewMessage = Parameters<ReturnType<typeof useApp.getState>['addChat']>[0];

/** Aggiunge un messaggio e applica il limite della cronologia. Restituisce l'id. */
export function addMessage(msg: NewMessage): string {
  const id = useApp.getState().addChat(msg);
  useApp.setState((s) => (s.chat.length > CHAT_KEEP || s.chat.filter((m) => m.image).length > CHAT_KEEP_IMAGES ? { chat: pruneChat(s.chat) } : {}));
  return id;
}

export function removeMessages(ids: string[]): void {
  if (!ids.length) return;
  const set = new Set(ids);
  useApp.setState((s) => ({ chat: s.chat.filter((m) => !set.has(m.id)) }));
}

// ───────────────────────── Raggruppamento ─────────────────────────

/** Un nuovo separatore con la data quando passano più di 45 minuti tra due messaggi. */
const SEPARATOR_GAP_MS = 45 * 60 * 1000;
/** Messaggi dello stesso autore entro 4 minuti stanno nello stesso gruppo (bolle attaccate). */
const GROUP_GAP_MS = 4 * 60 * 1000;

export interface ChatRow {
  message: ChatMessage;
  /** Primo e ultimo del gruppo di bolle dello stesso autore. */
  first: boolean;
  last: boolean;
  /** Separatore con la data prima del messaggio. */
  separator: SeparatorLabel | null;
}

export interface SeparatorLabel {
  /** "Oggi", "Ieri", "Domenica 8 novembre". */
  day: string;
  /** "10:41" */
  time: string;
}

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** { day: "Oggi" | "Ieri" | "Domenica 8 novembre", time: "10:41" }. */
export function separatorLabel(createdAt: string, today: ISODate): SeparatorLabel {
  const d = new Date(time(createdAt));
  const iso = toISO(d);
  const day = iso === today ? 'Oggi' : iso === addDays(today, -1) ? 'Ieri' : capitalizeFirst(formatDayLong(iso));
  return { day, time: hhmm(d) };
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Righe pronte per la lista: gruppi di bolle e separatori con la data. */
export function chatRows(chat: readonly ChatMessage[], today: ISODate): ChatRow[] {
  const rows: ChatRow[] = [];
  for (let i = 0; i < chat.length; i++) {
    const m = chat[i];
    const prev = chat[i - 1];
    const next = chat[i + 1];
    const t = time(m.createdAt);
    const sep = !prev || t - time(prev.createdAt) > SEPARATOR_GAP_MS || toISO(new Date(t)) !== toISO(new Date(time(prev.createdAt)));
    const sameAsPrev = Boolean(prev) && !sep && prev.role === m.role && !prev.error && !m.error && t - time(prev.createdAt) < GROUP_GAP_MS;
    const nextSep = next ? time(next.createdAt) - t > SEPARATOR_GAP_MS || toISO(new Date(time(next.createdAt))) !== toISO(new Date(t)) : true;
    const sameAsNext = Boolean(next) && !nextSep && next.role === m.role && !next.error && !m.error && time(next.createdAt) - t < GROUP_GAP_MS;
    rows.push({ message: m, first: !sameAsPrev, last: !sameAsNext, separator: sep ? separatorLabel(m.createdAt, today) : null });
  }
  return rows;
}
