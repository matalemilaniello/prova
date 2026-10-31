/**
 * Conversazione con il coach: invio, risposta in streaming, interruzione, nuovo tentativo.
 *
 * Il testo in arrivo vive nello stato del componente (non nello store persistito: scrivere su
 * localStorage a ogni pezzo di testo sarebbe lento); il messaggio si salva quando la risposta finisce.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../domain/types';
import { buildCoachContext, COACH_SYSTEM_PROMPT } from '../../engine/coachContext';
import { currentDate } from '../../engine/dates';
import {
  buildApiMessages,
  CoachError,
  DEFAULT_MODEL,
  errorInfo,
  streamCoachReply,
  tidyReply,
  type CoachErrorKind,
  type CoachPhase,
} from '../../lib/claude';
import { haptic } from '../../lib/haptics';
import { uid } from '../../lib/id';
import { useApp } from '../../state/store';
import { addMessage, removeMessages } from './chat';

export interface DraftReply {
  id: string;
  text: string;
  phase: CoachPhase;
  startedAt: number;
}

export interface OutgoingImage {
  /** Versione a 1024 px da inviare. */
  send: string;
  /** Versione leggera da salvare nella cronologia. */
  store: string;
}

export interface CoachChat {
  draft: DraftReply | null;
  busy: boolean;
  /** Tipo di errore per id del messaggio di errore (solo in questa sessione). */
  errorKinds: Record<string, CoachErrorKind>;
  /** Ultimo annuncio per i lettori di schermo. */
  announcement: string;
  /** Id dei messaggi arrivati in questa sessione (entrano con un'animazione). */
  freshIds: Set<string>;
  send: (text: string, image?: OutgoingImage) => void;
  retry: (errorMessage: ChatMessage) => void;
  continueReply: () => void;
  stop: () => void;
}

export function useCoachChat(): CoachChat {
  const [draft, setDraft] = useState<DraftReply | null>(null);
  const [errorKinds, setErrorKinds] = useState<Record<string, CoachErrorKind>>({});
  const [announcement, setAnnouncement] = useState('');
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const textRef = useRef('');
  const frameRef = useRef(0);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const markFresh = (id: string) => setFreshIds((s) => new Set(s).add(id));

  const run = useCallback(async (imageOverride?: { id: string; dataUrl: string }) => {
    const s = useApp.getState();
    const apiKey = s.settings.coachApiKey;
    if (!apiKey || busyRef.current) return;
    const messages = buildApiMessages(s.chat, { imageOverride });
    if (!messages.length) return;

    busyRef.current = true;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const id = uid('m');
    textRef.current = '';
    setAnnouncement('');
    setDraft({ id, text: '', phase: 'attesa', startedAt: Date.now() });

    const flush = () => {
      frameRef.current = 0;
      const text = textRef.current;
      setDraft((d) => (d && d.id === id ? { ...d, text, phase: 'scrive' } : d));
    };

    try {
      const reply = await streamCoachReply({
        apiKey,
        model: s.settings.coachModel || DEFAULT_MODEL,
        system: COACH_SYSTEM_PROMPT,
        context: buildCoachContext(useApp.getState(), currentDate()),
        messages,
        signal: ctrl.signal,
        onPhase: (phase) => setDraft((d) => (d && d.id === id && d.phase !== 'scrive' ? { ...d, phase } : d)),
        onText: (_delta, full) => {
          textRef.current = full;
          if (!frameRef.current) frameRef.current = requestAnimationFrame(flush);
        },
      });
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      if (reply.stop === 'rifiuto') {
        addMessage({ id, role: 'assistant', text: '', stop: 'rifiuto' });
        setAnnouncement('Il coach non ha risposto a questa domanda.');
      } else if (reply.stop === 'interrotta') {
        if (reply.text) addMessage({ id, role: 'assistant', text: tidyReply(reply.text), stop: 'interrotta' });
        setAnnouncement('Risposta interrotta.');
      } else {
        addMessage({ id, role: 'assistant', text: tidyReply(reply.text), ...(reply.stop ? { stop: reply.stop } : {}) });
        haptic('light');
        setAnnouncement(`Il coach ha risposto: ${tidyReply(reply.text).slice(0, 280)}`);
      }
      markFresh(id);
    } catch (e) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      const err = e instanceof CoachError ? e : new CoachError(errorInfo('sconosciuto'), textRef.current);
      if (err.partial) {
        const pid = addMessage({ role: 'assistant', text: tidyReply(err.partial), stop: 'interrotta' });
        markFresh(pid);
      }
      const eid = addMessage({ role: 'assistant', text: err.message, error: true });
      markFresh(eid);
      setErrorKinds((k) => ({ ...k, [eid]: err.kind }));
      haptic('error');
      setAnnouncement(`Risposta non arrivata. ${err.message}`);
    } finally {
      busyRef.current = false;
      abortRef.current = null;
      setDraft(null);
    }
  }, []);

  const send = useCallback(
    (text: string, image?: OutgoingImage) => {
      const t = text.trim();
      if ((!t && !image) || busyRef.current) return;
      const uidUser = addMessage({ role: 'user', text: t, ...(image ? { image: image.store } : {}) });
      markFresh(uidUser);
      void run(image ? { id: uidUser, dataUrl: image.send } : undefined);
    },
    [run],
  );

  const retry = useCallback(
    (errorMessage: ChatMessage) => {
      if (busyRef.current) return;
      const chat = useApp.getState().chat;
      const i = chat.findIndex((m) => m.id === errorMessage.id);
      if (i === -1) return;
      const drop = [errorMessage.id];
      // Toglie anche la risposta parziale rimasta prima dell'errore.
      const prev = chat[i - 1];
      if (prev && prev.role === 'assistant' && prev.stop === 'interrotta') drop.push(prev.id);
      removeMessages(drop);
      void run();
    },
    [run],
  );

  const continueReply = useCallback(() => send('Continua da dove ti sei fermato.'), [send]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    haptic('selection');
  }, []);

  return { draft, busy: draft !== null, errorKinds, announcement, freshIds, send, retry, continueReply, stop };
}
