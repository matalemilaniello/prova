/**
 * Seduta in corso: salvata sul dispositivo a ogni serie, così sopravvive allo schermo che si spegne,
 * all'app chiusa per sbaglio o al pannello chiuso tra una serie e l'altra.
 * Una sola seduta in corso alla volta. Non fa parte di AppData (non va nel backup).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ExerciseLog, ISODate } from '../../domain/types';
import { DATA_REPLACED_EVENT, SESSION_DRAFT_KEY, safeStorage } from '../../state/store';

export interface RestState {
  /** Fine del recupero (ms dall'epoca). */
  endsAt: number;
  /** Durata totale in secondi (per l'anello). */
  total: number;
  /** Esercizio a cui si riferisce. */
  key: string;
  /** 'recupero' tra le serie, 'tenuta' per gli esercizi a tempo. */
  mode: 'recupero' | 'tenuta';
}

export interface SessionDraft {
  sessionId: string;
  date: ISODate;
  /** Inizio della seduta (ms). */
  startedAt: number;
  /** Passo attuale del lettore. */
  step: number;
  /** Registro per chiave dell'esercizio nella seduta (vedi PlayerItem.key). */
  logs: Record<string, ExerciseLog>;
  rest: RestState | null;
  updatedAt: number;
}

interface DraftStore {
  draft: SessionDraft | null;
  start: (sessionId: string, date: ISODate, now?: number) => SessionDraft;
  patch: (fn: (d: SessionDraft) => SessionDraft) => void;
  clear: () => void;
}

export const DRAFT_KEY = SESSION_DRAFT_KEY;

export const useSessionDraft = create<DraftStore>()(
  persist(
    (set) => ({
      draft: null,
      start: (sessionId, date, now = Date.now()) => {
        const draft: SessionDraft = { sessionId, date, startedAt: now, step: 0, logs: {}, rest: null, updatedAt: now };
        set({ draft });
        return draft;
      },
      patch: (fn) =>
        set((s) => (s.draft ? { draft: { ...fn(s.draft), updatedAt: Date.now() } } : {})),
      clear: () => set({ draft: null }),
    }),
    {
      name: DRAFT_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ draft: s.draft }),
    },
  ),
);

// Dati di esempio, importazione o azzeramento: la seduta in corso apparteneva ai dati di prima.
if (typeof window !== 'undefined') {
  window.addEventListener(DATA_REPLACED_EVENT, () => useSessionDraft.getState().clear());
}

/** Serie fatte nella bozza. */
export function draftDoneSets(d: SessionDraft | null): number {
  if (!d) return 0;
  return Object.values(d.logs).reduce((s, l) => s + l.sets.filter((x) => x.done).length, 0);
}
