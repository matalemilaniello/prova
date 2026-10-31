/**
 * Coach: chat con Claude che conosce il piano e la giornata (SPEC §9 e §12).
 *
 * - Senza chiave e senza conversazione: pagina che spiega come attivarlo, quanto costa e cosa esce dal telefono.
 * - Con una conversazione: chat in stile Messaggi, risposta in streaming, foto del piatto, suggerimenti rapidi.
 * - Nell'anteprima (rete esterna bloccata) la chat resta leggibile, la barra di scrittura è spenta con un avviso
 *   e il piano B al bar funziona comunque.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowDown, Coffee, LockKeyhole, Sparkles, Wallet } from 'lucide-react';
import type { AppData, ChatMessage } from '../../domain/types';
import { IS_PREVIEW } from '../../app/env';
import { useUrlParam } from '../../app/urlParams';
import { coachDay, coachDaySummary } from '../../engine/coachContext';
import { hhmmToMin, nowHHMM, toISO, weekdayOf } from '../../engine/dates';
import { useNow } from '../../state/hooks';
import { useApp, useUi } from '../../state/store';
import { Card, IconButton, Screen, SCROLL_TOP_EVENT, useKeyboardInset } from '../../ui';
import { chatRows } from './chat';
import { ActivateStrip, ChatHeader, ConversationIntro, HEADER_CORE, PreviewStrip, SuggestionGrid } from './components/ChatChrome';
import { CoachAvatar } from './components/CoachAvatar';
import { Composer, type ComposerHandle } from './components/Composer';
import { CostCard, KeyForm, PreviewCallout, PrivacyCard, SetupSteps, TemporaryKeyNotice } from './components/KeySetup';
import { MessageRow, Separator, StreamingRow, TypingRow } from './components/Messages';
import { ContextSheet, ImageViewer, KeySheet, OptionsSheet } from './components/Sheets';
import { orderedSuggestions, type Suggestion } from './suggestions';
import { useCoachChat } from './useCoachChat';

export default function CoachScreen() {
  const hasKey = useApp((s) => Boolean(s.settings.coachApiKey));
  const hasChat = useApp((s) => s.chat.length > 0);
  // ?coach=setup mostra la pagina di attivazione anche con una conversazione (anteprime e screenshot).
  const forceSetup = useUrlParam('coach') === 'setup';
  if (forceSetup || (!hasKey && !hasChat)) return <CoachSetupScreen />;
  return <CoachChatScreen />;
}

// ───────────────────────── Stato del giorno per il coach ─────────────────────────

function useCoachState(): AppData {
  const plan = useApp((s) => s.plan);
  const profile = useApp((s) => s.profile);
  const dayLogs = useApp((s) => s.dayLogs);
  const checkIns = useApp((s) => s.checkIns);
  const workoutLogs = useApp((s) => s.workoutLogs);
  const footballLogs = useApp((s) => s.footballLogs);
  const physio = useApp((s) => s.physio);
  const settings = useApp((s) => s.settings);
  const reviews = useApp((s) => s.reviews);
  return useMemo(
    () =>
      ({
        ...useApp.getState(),
        plan,
        profile,
        dayLogs,
        checkIns,
        workoutLogs,
        footballLogs,
        physio,
        settings,
        reviews,
      }) as AppData,
    [plan, profile, dayLogs, checkIns, workoutLogs, footballLogs, physio, settings, reviews],
  );
}

// ───────────────────────── Pagina di attivazione ─────────────────────────

function CoachSetupScreen() {
  const open = useUi((s) => s.open);
  return (
    <Screen
      eyebrow="Con Claude di Anthropic"
      title="Coach"
      subtitle="Allenatore e nutrizionista che risponde con il tuo piano davanti."
      actions={<IconButton icon={Coffee} label="Piano B al bar" onClick={() => open({ type: 'barPlanB' })} />}
    >
      <PreviewCallout />

      <Card variant="highlight" padding="lg" className="overflow-hidden">
        <div className="flex items-center gap-4">
          <CoachAvatar size={64} glow />
          <div className="min-w-0">
            <p className="t-title-2 text-ink">Chiedi, con la giornata già sul tavolo</p>
          </div>
        </div>
        <ul className="mt-5 flex flex-col gap-3.5">
          {[
            { t: 'Al bar o fuori casa', d: 'Cosa ordinare adesso, in base al pasto e al tipo di giorno.' },
            { t: 'Una foto del piatto', d: 'Porzioni stimate e un aggiustamento per il resto della giornata.' },
            { t: 'Allenamento', d: 'Saltare, accorciare o spingere, guardando sonno, dolori e carico.' },
            { t: 'La settimana', d: 'Cosa ha funzionato e cosa correggere nella revisione della domenica.' },
          ].map((x) => (
            <li key={x.t} className="flex gap-3">
              <Sparkles size={16} strokeWidth={2.2} aria-hidden className="mt-[3px] shrink-0 text-accent-ink" />
              <p className="t-footnote text-ink-2">
                <span className="font-semibold text-ink">{x.t}. </span>
                {x.d}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-4">
          <span className="t-footnote inline-flex items-center gap-1.5 text-ink-2">
            <Wallet size={15} strokeWidth={2.2} aria-hidden className="text-ink-3" />
            Circa 7-12 $ al mese, a consumo
          </span>
          <span className="t-footnote inline-flex items-center gap-1.5 text-ink-2">
            <LockKeyhole size={15} strokeWidth={2.2} aria-hidden className="text-ink-3" />
            I dati partono solo quando scrivi
          </span>
        </div>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="coach-passi">
        <h2 id="coach-passi" className="t-label px-1 text-ink-3">
          Come attivarlo
        </h2>
        <Card padding="lg">
          <SetupSteps />
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="coach-chiave">
        <h2 id="coach-chiave" className="t-label px-1 text-ink-3">
          La tua chiave
        </h2>
        <Card padding="lg">
          <KeyForm />
        </Card>
        <TemporaryKeyNotice />
      </section>

      <CostCard />
      <PrivacyCard />

      <Card padding="md" onPress={() => open({ type: 'barPlanB' })}>
        <div className="flex items-center gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent-ink">
            <Coffee size={21} strokeWidth={2.1} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-headline text-ink">Intanto, il piano B al bar</p>
            <p className="t-footnote mt-0.5 text-ink-2">Le scelte migliori del banco, con i valori. Funziona anche senza rete.</p>
          </div>
        </div>
      </Card>
    </Screen>
  );
}

// ───────────────────────── Chat ─────────────────────────

type Mode = 'pronto' | 'anteprima' | 'chiave';

function CoachChatScreen() {
  const chat = useApp((s) => s.chat);
  const hasKey = useApp((s) => Boolean(s.settings.coachApiKey));
  const model = useApp((s) => s.settings.coachModel);
  const state = useCoachState();
  const now = useNow(60_000);
  const openOverlay = useUi((s) => s.open);
  const toast = useUi((s) => s.toast);
  const reduce = useReducedMotion();
  const kb = useKeyboardInset();
  const coach = useCoachChat();

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  const mode: Mode = IS_PREVIEW ? 'anteprima' : hasKey ? 'pronto' : 'chiave';
  const today = toISO(now);
  const rows = useMemo(() => chatRows(chat, today), [chat, today]);
  const summary = useMemo(() => coachDaySummary(state, now), [state, now]);
  const suggestions = useMemo(() => {
    const day = coachDay(state, now);
    const gymPending = Boolean(
      state.plan.week.find((d) => d.weekday === weekdayOf(day))?.gymSessionId && !state.workoutLogs.some((w) => w.date === day),
    );
    return orderedSuggestions({ nowMin: hhmmToMin(nowHHMM(now)), weekday: weekdayOf(day), gymPending });
  }, [state, now]);

  const barPlan = useCallback(() => openOverlay({ type: 'barPlanB' }), [openOverlay]);

  // ── Scorrimento: si resta in fondo mentre arrivano i messaggi, se l'utente è in fondo ──
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ComposerHandle>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [composerH, setComposerH] = useState(64);

  const toBottom = useCallback(
    (smooth: boolean) => {
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    },
    [reduce],
  );

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const d = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = d < 96;
    setShowJump(d > 280);
  };

  useLayoutEffect(() => {
    // Conversazione vuota: si parte dall'alto, con il coach e i suggerimenti in vista.
    if (!useApp.getState().chat.length) {
      atBottom.current = false;
      return;
    }
    toBottom(false);
    // Le immagini caricate dopo allungano la lista: si torna in fondo una volta.
    const id = window.setTimeout(() => toBottom(false), 120);
    return () => window.clearTimeout(id);
  }, [toBottom]);

  const lastId = chat[chat.length - 1]?.id;
  const lastRole = chat[chat.length - 1]?.role;
  useEffect(() => {
    if (!lastId) return;
    if (lastRole === 'user' || atBottom.current) toBottom(true);
  }, [lastId, lastRole, toBottom]);

  useEffect(() => {
    if (coach.draft && atBottom.current) toBottom(false);
  }, [coach.draft, toBottom]);

  // Qualunque cosa allunghi la lista (testo in arrivo, foto caricate, suggerimenti) tiene il fondo
  // agganciato, se l'utente era in fondo.
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) toBottom(false);
    });
    // border-box: conta anche lo spazio in fondo, che cresce con la barra di scrittura.
    ro.observe(el, { box: 'border-box' });
    return () => ro.disconnect();
  }, [toBottom]);

  useEffect(() => {
    if (!atBottom.current) return;
    // Al fotogramma dopo: lo spazio in fondo è già cresciuto con la barra.
    const id = requestAnimationFrame(() => toBottom(false));
    return () => cancelAnimationFrame(id);
  }, [composerH, kb, toBottom]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setComposerH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => {
    const onTop = () => {
      const el = scrollerRef.current;
      if (!el || !el.closest('[data-screen-active="true"]')) return;
      el.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    };
    window.addEventListener(SCROLL_TOP_EVENT, onTop);
    return () => window.removeEventListener(SCROLL_TOP_EVENT, onTop);
  }, [reduce]);

  // ── Azioni ──
  const pickSuggestion = (s: Suggestion) => {
    if (mode === 'pronto') {
      coach.send(s.text);
      return;
    }
    if (s.id === 'bar') {
      barPlan();
      return;
    }
    if (mode === 'chiave') setKeyOpen(true);
    else toast('Nell’anteprima il coach non risponde: serve la rete.', 'neutral', { actionLabel: 'Piano B', onAction: barPlan });
  };

  const clearChat = () => {
    coach.stop();
    const snapshot = useApp.getState().chat;
    useApp.getState().clearChat();
    toast('Conversazione cancellata', 'neutral', { actionLabel: 'Annulla', onAction: () => useApp.setState({ chat: snapshot }) });
  };

  const lastMessage: ChatMessage | undefined = chat[chat.length - 1];
  const bottomOffset = kb > 0 ? `${kb}px` : 'var(--tabbar-h)';
  const empty = chat.length === 0 && !coach.draft;

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <ChatHeader
        onBarPlan={barPlan}
        onOptions={() => setOptionsOpen(true)}
        onContext={() => setContextOpen(true)}
        status={coach.busy ? 'Sta scrivendo' : undefined}
      />

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        data-scroll-container
        className="h-full overflow-y-auto overflow-x-hidden overscroll-y-contain"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px]" style={{ background: 'var(--floodlight)' }} />
        <div
          ref={contentRef}
          className="relative mx-auto flex min-h-full max-w-[640px] flex-col"
          style={{
            paddingTop: `calc(var(--safe-top) + ${HEADER_CORE + 8}px)`,
            paddingBottom: `calc(${bottomOffset} + ${composerH + 16}px)`,
            paddingLeft: 'calc(var(--gutter) - 6px + var(--safe-left))',
            paddingRight: 'calc(var(--gutter) - 4px + var(--safe-right))',
          }}
        >
          <ConversationIntro summary={summary} model={model} onContext={() => setContextOpen(true)}>
            {empty && (
              <div className="mt-6 flex w-full flex-col items-center gap-4">
                <p className="t-callout max-w-[30ch] text-ink-2">
                  Chiedi quello che ti serve, anche con una foto del piatto: rispondo guardando il piano di oggi.
                </p>
                {mode === 'pronto' && <SuggestionGrid items={suggestions} onPick={pickSuggestion} className="mt-1 px-1" />}
              </div>
            )}
          </ConversationIntro>

          <div role="log" aria-label="Conversazione con il coach" aria-live="off" className="flex flex-col">
            {rows.map((r) => (
              <div key={r.message.id}>
                {r.separator && <Separator label={r.separator} />}
                <MessageRow
                  message={r.message}
                  first={r.first}
                  last={r.last}
                  fresh={coach.freshIds.has(r.message.id)}
                  onOpenImage={setViewer}
                  onRetry={mode === 'pronto' && r.message.error && r.message.id === lastMessage?.id ? coach.retry : undefined}
                  onContinue={mode === 'pronto' && r.message.id === lastMessage?.id ? coach.continueReply : undefined}
                  onFixKey={() => setKeyOpen(true)}
                  onBarPlan={barPlan}
                  errorKind={coach.errorKinds[r.message.id]}
                />
              </div>
            ))}
            {coach.draft &&
              (coach.draft.text ? (
                <StreamingRow text={coach.draft.text} />
              ) : (
                <TypingRow phase={coach.draft.phase} startedAt={coach.draft.startedAt} />
              ))}
          </div>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {coach.announcement}
      </div>

      {/* Torna in fondo */}
      <AnimatePresence>
        {showJump && (
          <motion.div
            key="jump"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute right-4 z-20"
            style={{ bottom: `calc(${bottomOffset} + ${composerH + 12}px)` }}
          >
            <IconButton icon={ArrowDown} label="Vai all’ultimo messaggio" variant="glass" onClick={() => toBottom(true)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barra di scrittura */}
      <div ref={composerRef} className="absolute inset-x-0 z-20" style={{ bottom: bottomOffset }}>
        <div aria-hidden className="glass absolute inset-0 border-t border-[var(--bar-line)]" />
        <div className="relative mx-auto max-w-[640px]">
          {mode === 'chiave' ? (
            <ActivateStrip onActivate={() => setKeyOpen(true)} />
          ) : mode === 'anteprima' ? (
            <PreviewStrip onBarPlan={barPlan} />
          ) : (
            <Composer
              ref={inputRef}
              onSend={coach.send}
              onStop={coach.stop}
              busy={coach.busy}
              suggestions={empty ? undefined : suggestions}
              onSuggestion={pickSuggestion}
            />
          )}
        </div>
      </div>

      <OptionsSheet
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        onContext={() => setContextOpen(true)}
        onKey={() => setKeyOpen(true)}
        onClear={clearChat}
      />
      <ContextSheet open={contextOpen} onClose={() => setContextOpen(false)} />
      <KeySheet open={keyOpen} onClose={() => setKeyOpen(false)} />
      <ImageViewer src={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

