/**
 * Lettore della seduta a schermo intero, pensato per le mani sudate tra una serie e l'altra:
 * pulsanti grandi, stepper precompilati dalla progressione doppia, "l'ultima volta", timer di recupero
 * circolare che parte quando segni una serie (vibra alla fine), sostituzione con un'alternativa,
 * blocco "Dal fisioterapista", fine seduta con durata, RPE e dolore, riepilogo con record e carico.
 *
 * Fasi: anteprima → esercizi (il riscaldamento è una lista unica) → fine seduta → riepilogo.
 * La seduta in corso è salvata sul telefono a ogni tocco (draft.ts): si riprende da dove eri.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronLeft, ChevronRight, Dumbbell, Flag, ListOrdered, Play, Timer } from 'lucide-react';
import type { ExerciseLog, ISODate, SetLog, WorkoutLog, WorkoutSession } from '../../domain/types';
import { EXERCISES } from '../../data/exercises';
import { SESSIONS } from '../../data/sessions';
import { weekStart } from '../../engine/dates';
import {
  gateForExercise,
  introLevel,
  lastEntryFor,
  loadStatus,
  painFlagFor,
  painGate,
  plannedSessionFor,
  suggestNext,
  workoutVolume,
  type LoadStatus,
  type PersonalRecord,
  type Suggestion,
} from '../../engine/training';
import { haptic } from '../../lib/haptics';
import { uid } from '../../lib/id';
import { usePlanDay } from '../../state/hooks';
import { useApp, useUi } from '../../state/store';
import { Button, Callout, EmptyState, FullScreenModal, IconButton, spring } from '../../ui';
import { draftDoneSets, useSessionDraft, type SessionDraft } from './draft';
import { buildPlayerPlan, exerciseFor, isBodyweight, kgLabel, plannedSets, sessionTone, strengthRecords, type PlayerItem, type PlayerStep } from './lib';
import { ExerciseStep } from './player/ExerciseStep';
import { FinishStep } from './player/FinishStep';
import { IntroStep } from './player/IntroStep';
import { AlternativesSheet, ExitSheet, OverviewSheet } from './player/PlayerSheets';
import { RestTimer } from './player/RestTimer';
import { SummaryStep } from './player/SummaryStep';
import { WarmupStep } from './player/WarmupStep';

export interface SessionPlayerProps {
  sessionId: string;
  date: ISODate;
  onClose: () => void;
}

export default function SessionPlayer({ sessionId, date, onClose }: SessionPlayerProps) {
  const session = SESSIONS[sessionId];
  if (!session) {
    return (
      <FullScreenModal open onClose={onClose} title="Seduta">
        <EmptyState icon={Dumbbell} title="Seduta non trovata" text="Questa seduta non è più nel programma. Scegline una dalla schermata Allenamento." />
      </FullScreenModal>
    );
  }
  return <Player session={session} date={date} onClose={onClose} />;
}

type Phase = 'intro' | 'run' | 'finish' | 'summary';

/** Orologio reale che avanza ogni `ms` (per il tempo trascorso della seduta). */
function useTick(ms: number, on = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms, on]);
  return now;
}

/** Tiene acceso lo schermo durante la seduta, dove il browser lo consente. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let sentinel: Sentinel | null = null;
    let alive = true;
    const req = () => {
      nav.wakeLock
        ?.request('screen')
        .then((s) => {
          if (alive) sentinel = s;
          else void s.release();
        })
        .catch(() => undefined);
    };
    req();
    const onVis = () => {
      if (document.visibilityState === 'visible') req();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel?.release().catch(() => undefined);
    };
  }, [on]);
}

/** Tempo trascorso: "4:05", oltre l'ora "1:04:05". */
function elapsedLabel(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const stepItems = (st: PlayerStep): PlayerItem[] => (st.kind === 'warmup' ? st.items : [st.item]);

function Player({ session, date, onClose }: { session: WorkoutSession; date: ISODate; onClose: () => void }) {
  const reduce = useReducedMotion();
  const today = usePlanDay();
  const toast = useUi((s) => s.toast);
  const plan = useApp((s) => s.plan);
  const physio = useApp((s) => s.physio);
  const history = useApp((s) => s.workoutLogs);
  const footballLogs = useApp((s) => s.footballLogs);
  const checkIns = useApp((s) => s.checkIns);
  const profile = useApp((s) => s.profile);
  const draft = useSessionDraft((s) => s.draft);
  const mine: SessionDraft | null = draft && draft.sessionId === session.id && draft.date === date ? draft : null;
  const other: SessionDraft | null = draft && !mine ? draft : null;

  // Storico all'apertura: la seduta salvata alla fine non deve cambiare la fase di ingresso né la regola del
  // dolore mentre si guarda il riepilogo.
  const [historyAtOpen] = useState(history);
  const [intro] = useState(() => introLevel(session.id, history));
  const gate = useMemo(
    () => painGate({ plan, checkIns, profile, workoutLogs: historyAtOpen, footballLogs }, date),
    [plan, checkIns, profile, historyAtOpen, footballLogs, date],
  );
  const pplan = useMemo(() => buildPlayerPlan(session, physio, plan, date, { gate, intro }), [session, physio, plan, date, gate, intro]);
  const catalog = useMemo(() => ({ ...EXERCISES, ...Object.fromEntries(physio.exercises.map((e) => [e.id, e])) }), [physio.exercises]);
  const planned = plannedSessionFor(date, plan);
  const lastSession = useMemo(
    () => history.filter((w) => w.sessionId === session.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null,
    [history, session.id],
  );

  const [phase, setPhase] = useState<Phase>(() => (mine ? 'run' : 'intro'));
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [holdSide, setHoldSide] = useState(0);
  const [weightShown, setWeightShown] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<'alt' | 'overview' | 'exit' | null>(null);
  const [dir, setDir] = useState(1);
  const [restDone, setRestDone] = useState(false);
  // Fine seduta
  const [duration, setDuration] = useState(session.estMin);
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const [pain, setPain] = useState<Record<string, number | undefined>>({});
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<{ log: WorkoutLog; records: PersonalRecord[]; status: LoadStatus; planned: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const resumed = useRef(false);

  const running = phase === 'run' || phase === 'finish';
  const now = useTick(1000, running);
  useWakeLock(phase === 'run');

  useEffect(() => {
    if (mine && !resumed.current && phase === 'run') {
      resumed.current = true;
      if (draftDoneSets(mine) > 0) toast('Seduta ripresa da dove eri', 'neutral');
    }
  }, [mine, phase, toast]);

  const stepIndex = Math.min(mine?.step ?? 0, pplan.steps.length - 1);
  const step = pplan.steps[stepIndex];
  const logs = mine?.logs ?? {};

  // ── Esercizio effettivo, suggerimento, registro iniziale ──

  const currentIdOf = useCallback((it: PlayerItem) => logs[it.key]?.exerciseId ?? it.item.exerciseId, [logs]);

  const suggestionFor = useCallback(
    (it: PlayerItem): Suggestion => {
      const id = currentIdOf(it);
      const ex = catalog[id];
      const last = lastEntryFor(id, history)?.log ?? null;
      return suggestNext({ ...it.base, exerciseId: id }, last, { gate: gateForExercise(ex, gate), intro: !it.physio && Boolean(pplan.intro) });
    },
    [catalog, currentIdOf, gate, history, pplan.intro],
  );

  const suggestions = useMemo(() => Object.fromEntries(pplan.items.map((it) => [it.key, suggestionFor(it)])), [pplan.items, suggestionFor]);

  const initialLog = useCallback(
    (it: PlayerItem, exerciseId = it.item.exerciseId): ExerciseLog => {
      const s =
        exerciseId === it.item.exerciseId
          ? suggestions[it.key]
          : suggestNext({ ...it.base, exerciseId }, lastEntryFor(exerciseId, history)?.log ?? null, {
              gate: gateForExercise(catalog[exerciseId], gate),
              intro: !it.physio && Boolean(pplan.intro),
            });
      const swappedFrom = exerciseId !== it.item.exerciseId ? it.item.exerciseId : it.replacedFrom;
      return {
        exerciseId,
        sets: s.sets.map((t) => ({ weightKg: t.weightKg, reps: t.reps, done: false })),
        ...(swappedFrom ? { swappedFrom } : {}),
      };
    },
    [suggestions, history, catalog, gate, pplan.intro],
  );

  const logOf = useCallback((it: PlayerItem) => logs[it.key] ?? initialLog(it), [logs, initialLog]);

  const patchDraft = useSessionDraft((s) => s.patch);
  const writeLog = useCallback((key: string, log: ExerciseLog) => patchDraft((d) => ({ ...d, logs: { ...d.logs, [key]: log } })), [patchDraft]);

  // ── Navigazione ──

  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(pplan.steps.length - 1, i));
      setDir(next >= stepIndex ? 1 : -1);
      setEditIndex(null);
      setHoldSide(0);
      patchDraft((d) => ({ ...d, step: next }));
      anchorRef.current?.parentElement?.scrollTo({ top: 0 });
    },
    [pplan.steps.length, stepIndex, patchDraft],
  );

  const nameOf = useCallback(
    (st: PlayerStep) => (st.kind === 'warmup' ? st.blockTitle : (catalog[currentIdOf(st.item)]?.name ?? st.item.exercise?.name ?? 'Esercizio')),
    [catalog, currentIdOf],
  );

  // ── Recupero ──

  const startRest = useCallback(
    (sec: number, key: string, mode: 'recupero' | 'tenuta' = 'recupero') => {
      if (sec <= 0) return;
      setRestDone(false);
      patchDraft((d) => ({ ...d, rest: { endsAt: Date.now() + sec * 1000, total: sec, key, mode } }));
    },
    [patchDraft],
  );
  const clearRest = useCallback(() => {
    setRestDone(false);
    patchDraft((d) => ({ ...d, rest: null }));
  }, [patchDraft]);

  // ── Azioni sulle serie ──

  const current = step?.kind === 'exercise' ? step.item : null;
  const currentLog = current ? logOf(current) : null;
  const firstOpen = currentLog ? currentLog.sets.findIndex((s) => !s.done) : -1;
  const openIndex = editIndex ?? firstOpen;

  const markSet = useCallback(
    (it: PlayerItem, index: number, patch: Partial<SetLog> = {}) => {
      const log = logOf(it);
      const sets = log.sets.map((s, i) => (i === index ? { ...s, ...patch, done: true } : s));
      writeLog(it.key, { ...log, sets });
      haptic('success');
      setEditIndex(null);
      setHoldSide(0);
      const allDone = sets.every((s) => s.done);
      const itemStep = pplan.steps.findIndex((st) => stepItems(st).some((x) => x.key === it.key));
      const lastStep = itemStep >= pplan.steps.length - 1;
      if (!(allDone && lastStep)) startRest(it.item.restSec, it.key);
      else clearRest();
      // Finito l'esercizio che hai davanti, si passa al successivo mentre recuperi.
      if (allDone && !lastStep && itemStep === stepIndex) window.setTimeout(() => goTo(stepIndex + 1), reduce ? 0 : 700);
    },
    [logOf, writeLog, stepIndex, pplan.steps, startRest, clearRest, goTo, reduce],
  );

  const changeSet = useCallback(
    (it: PlayerItem, index: number, patch: Partial<SetLog>) => {
      const log = logOf(it);
      const sets = log.sets.map((s, i) => {
        if (i === index) return { ...s, ...patch };
        // Il carico scelto vale anche per le serie successive ancora da fare.
        if (patch.weightKg !== undefined && i > index && !s.done) return { ...s, weightKg: patch.weightKg };
        return s;
      });
      writeLog(it.key, { ...log, sets });
    },
    [logOf, writeLog],
  );

  const toggleWarmup = useCallback(
    (it: PlayerItem, done: boolean) => {
      const log = logOf(it);
      writeLog(it.key, { ...log, sets: log.sets.map((s) => ({ ...s, done })) });
    },
    [logOf, writeLog],
  );

  const swapTo = useCallback(
    (it: PlayerItem, exerciseId: string) => {
      writeLog(it.key, initialLog(it, exerciseId));
      setEditIndex(null);
      setSheet(null);
      haptic('success');
      toast(exerciseId === it.item.exerciseId ? "Tornato all'esercizio previsto" : `Sostituito con ${catalog[exerciseId]?.name ?? "l'alternativa"}`, 'good');
    },
    [writeLog, initialLog, toast, catalog],
  );

  // ── Avvio, uscita, salvataggio ──

  const startSession = () => {
    useSessionDraft.getState().start(session.id, date);
    haptic('medium');
    setDir(1);
    setPhase('run');
  };

  const doneSets = draftDoneSets(mine);
  // Gli esercizi del fisioterapista contano nel totale solo se li fai qui.
  const physioItems = pplan.items.filter((i) => i.physio);
  const physioDone = physioItems.some((it) => mine?.logs[it.key]?.sets.some((s) => s.done));
  const totalPlanned = plannedSets(pplan.items.filter((i) => !i.physio)) + (physioDone ? plannedSets(physioItems) : 0);
  const measuredMin = mine ? Math.max(1, Math.round((now - mine.startedAt) / 60000)) : 0;

  const toFinish = () => {
    setSheet(null);
    clearRest();
    // Durata misurata, salvo pause enormi (seduta lasciata aperta): allora la stima della seduta.
    const sane = measuredMin > 0 && measuredMin <= session.estMin * 2.5 ? measuredMin : session.estMin;
    setDuration(Math.max(5, sane));
    setDir(1);
    setPhase('finish');
  };

  const requestClose = () => {
    if (phase === 'run' && doneSets > 0) return setSheet('exit');
    if (phase === 'run' && mine && doneSets === 0) useSessionDraft.getState().clear();
    onClose();
  };

  const discard = () => {
    useSessionDraft.getState().clear();
    setSheet(null);
    toast('Seduta annullata', 'neutral');
    onClose();
  };

  const save = () => {
    if (!mine) {
      toast("La seduta in corso non c'è più: riaprila da Allenamento", 'bad');
      return onClose();
    }
    if (rpe === undefined) {
      haptic('warning');
      toast('Scegli la fatica percepita per salvare', 'warn');
      scrollRef.current?.querySelector('[data-rpe]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const exercises = pplan.items
      .map((it) => mine.logs[it.key])
      .filter((l): l is ExerciseLog => Boolean(l?.sets.some((s) => s.done)))
      .map((l) => ({ ...l, sets: l.sets.filter((s) => s.done) }));
    const painDone = Object.fromEntries(Object.entries(pain).filter((e): e is [string, number] => typeof e[1] === 'number'));
    const log: WorkoutLog = {
      id: uid('w'),
      date,
      sessionId: session.id,
      durationMin: duration,
      rpe,
      pain: painDone,
      exercises,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    const records = strengthRecords(log, history, physio);
    useApp.getState().saveWorkout(log);
    useSessionDraft.getState().clear();
    const status = loadStatus(weekStart(date), { workoutLogs: [...history, log], footballLogs });
    haptic('success');
    setSaved({ log, records, status, planned: totalPlanned });
    setDir(1);
    setPhase('summary');
  };

  // ── Intestazione e piede ──

  const nextStep = pplan.steps[stepIndex + 1];
  const isLast = stepIndex >= pplan.steps.length - 1;
  const rest = mine?.rest ?? null;
  const holdRunning = Boolean(rest && rest.mode === 'tenuta' && current && rest.key === current.key);

  const restNext = (() => {
    if (!rest) return undefined;
    const it = pplan.items.find((i) => i.key === rest.key);
    if (!it) return undefined;
    const l = logOf(it);
    const n = l.sets.findIndex((s) => !s.done);
    if (n >= 0) {
      const s = l.sets[n];
      const unit = it.item.unit === 'secondi' ? ' s' : '';
      return `Serie ${n + 1} · ${s.weightKg > 0 ? `${kgLabel(s.weightKg)} × ` : ''}${s.reps}${unit}`;
    }
    const idx = pplan.steps.findIndex((st) => stepItems(st).some((x) => x.key === it.key));
    const nx = pplan.steps[idx + 1];
    return nx ? `Poi: ${nameOf(nx)}` : undefined;
  })();

  const onRestElapsed = useCallback(() => {
    const r = useSessionDraft.getState().draft?.rest;
    if (!r) return;
    if (r.mode === 'tenuta') {
      const it = pplan.items.find((i) => i.key === r.key);
      if (!it) return clearRest();
      if (it.item.perSide && holdSide === 0) {
        setHoldSide(1);
        clearRest();
        toast("Ora l'altro lato", 'neutral');
        return;
      }
      const l = logOf(it);
      const n = l.sets.findIndex((s) => !s.done);
      if (n >= 0) markSet(it, n);
      return;
    }
    setRestDone(true);
  }, [pplan.items, holdSide, logOf, markSet, clearRest, toast]);

  // Il riquadro del recupero finito si chiude da solo dopo qualche secondo.
  useEffect(() => {
    if (!restDone) return;
    const id = window.setTimeout(() => clearRest(), 6000);
    return () => window.clearTimeout(id);
  }, [restDone, clearRest]);

  let main: { label: string; icon?: typeof Check; onClick: () => void; variant?: 'primary' | 'secondary' } | null = null;
  if (phase === 'intro') main = { label: other ? 'Inizia questa seduta' : 'Inizia la seduta', icon: Play, onClick: startSession };
  else if (phase === 'finish') main = { label: 'Salva la seduta', icon: Check, onClick: save };
  else if (phase === 'summary') main = { label: 'Fine', onClick: onClose };
  else if (step?.kind === 'warmup') {
    const allDone = step.items.every((it) => logOf(it).sets.every((s) => s.done));
    main = {
      label: allDone ? (nextStep ? 'Avanti' : 'Termina la seduta') : 'Segna tutto',
      icon: allDone ? undefined : Check,
      onClick: () => {
        if (!allDone) step.items.forEach((it) => toggleWarmup(it, true));
        haptic('success');
        if (nextStep) goTo(stepIndex + 1);
        else toFinish();
      },
    };
  } else if (current && currentLog) {
    if (editIndex !== null) main = { label: 'Fatto', icon: Check, onClick: () => setEditIndex(null), variant: 'secondary' };
    else if (firstOpen >= 0) {
      const set = currentLog.sets[firstOpen];
      if (current.item.unit === 'secondi' && !holdRunning) {
        main = {
          label: current.item.perSide ? `Lato ${holdSide + 1} · ${set.reps} s` : `Avvia ${set.reps} s`,
          icon: Timer,
          onClick: () => {
            haptic('medium');
            startRest(set.reps, current.key, 'tenuta');
          },
        };
      } else {
        main = { label: `Segna serie ${firstOpen + 1}`, icon: Check, onClick: () => markSet(current, firstOpen) };
      }
    } else {
      main = isLast
        ? { label: 'Termina la seduta', icon: Flag, onClick: toFinish }
        : { label: 'Prossimo esercizio', icon: ChevronRight, onClick: () => goTo(stepIndex + 1) };
    }
  }

  const headerTitle = phase === 'run' || phase === 'finish' ? session.name : undefined;
  const headerSubtitle =
    phase === 'run' && mine ? (
      <>
        <span className="tabular">
          {elapsedLabel((now - mine.startedAt) / 1000)} · {stepIndex + 1} di {pplan.steps.length}
        </span>
        <span className="mx-auto mt-1.5 flex w-full max-w-[200px] gap-[3px]" aria-hidden>
          {pplan.steps.map((st, i) => {
            const items = stepItems(st);
            const total = items.reduce((s, it) => s + logOf(it).sets.length, 0);
            const done = items.reduce((s, it) => s + logOf(it).sets.filter((x) => x.done).length, 0);
            const frac = total ? done / total : 0;
            return (
              <span key={st.key} className="relative h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: 'var(--ink-soft)' }}>
                <span
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
                  style={{
                    width: `${(i === stepIndex && frac < 1 ? Math.max(frac, 0.34) : frac) * 100}%`,
                    background: frac >= 1 ? 'var(--good)' : i === stepIndex ? 'var(--ink)' : 'var(--palestra)',
                  }}
                />
              </span>
            );
          })}
        </span>
      </>
    ) : undefined;

  const footer = main ? (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {phase === 'run' && rest && (
          <motion.div
            key="rest"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, height: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="pb-1 pt-0.5">
              <RestTimer
                rest={rest}
                nextLabel={rest.mode === 'tenuta' ? (pplan.items.find((i) => i.key === rest.key)?.item.perSide ? (holdSide === 0 ? 'Primo lato: tieni la posizione' : 'Secondo lato: tieni la posizione') : 'Tieni la posizione') : restNext}
                onAdjust={(d) =>
                  patchDraft((x) =>
                    x.rest ? { ...x, rest: { ...x.rest, endsAt: Math.max(Date.now() + 1000, x.rest.endsAt + d * 1000), total: Math.max(5, x.rest.total + d) } } : x,
                  )
                }
                onSkip={clearRest}
                onElapsed={onRestElapsed}
                onDismiss={clearRest}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center gap-2.5">
        {phase === 'run' && (
          <IconButton icon={ChevronLeft} label="Esercizio precedente" size="lg" variant="tinted" disabled={stepIndex === 0} onClick={() => goTo(stepIndex - 1)} />
        )}
        <Button
          size="lg"
          fullWidth
          className="h-[56px] min-w-0 flex-1 text-[1.0625rem] [&>span]:min-w-0 [&>span]:max-w-full [&>span>span]:min-w-0 [&>span>span]:truncate"
          variant={main.variant ?? 'primary'}
          icon={main.icon}
          onClick={main.onClick}
          haptic={false}
        >
          {main.label}
        </Button>
        {phase === 'run' && (
          <IconButton icon={ChevronRight} label="Esercizio successivo" size="lg" variant="tinted" disabled={isLast} onClick={() => goTo(stepIndex + 1)} />
        )}
      </div>
    </div>
  ) : undefined;

  // ── Contenuto ──

  let body: React.ReactNode = null;
  let bodyKey = phase as string;
  if (phase === 'intro') {
    body = (
      <>
        {other && (
          <div className="pt-3">
            <Callout
              tone="accent"
              title={`Hai una ${SESSIONS[other.sessionId]?.name.replace(/^Seduta/, 'seduta') ?? 'seduta'} in corso`}
              action={
                <Button size="sm" variant="ghost" onClick={() => useUi.getState().open({ type: 'session', sessionId: other.sessionId, date: other.date })}>
                  Riprendila
                </Button>
              }
            >
              Iniziando questa, quella in corso viene annullata.
            </Callout>
          </div>
        )}
        <IntroStep
          plan={pplan}
          date={date}
          today={today}
          time={planned?.sessionId === session.id ? planned.time : undefined}
          optional={planned?.sessionId === session.id ? planned.optional : false}
          gate={gate}
          lastSession={lastSession}
          suggestions={suggestions}
          tone={sessionTone(session.id, plan)}
        />
      </>
    );
  } else if (phase === 'run' && step) {
    bodyKey = step.key;
    if (step.kind === 'warmup') {
      body = <WarmupStep title={step.blockTitle} items={step.items} logs={Object.fromEntries(step.items.map((it) => [it.key, logOf(it)]))} onToggle={toggleWarmup} />;
    } else if (current && currentLog) {
      const exId = currentLog.exerciseId;
      const ex = catalog[exId] ?? exerciseFor(exId, physio);
      const sug = suggestions[current.key] && exId === currentIdOf(current) ? suggestions[current.key] : suggestionFor(current);
      const shown = weightShown[current.key] ?? (sug.weightKg > 0 || currentLog.sets.some((s) => s.weightKg > 0) || (current.item.progression === 'doppia' && !isBodyweight(ex)));
      body = (
        <ExerciseStep
          pitem={current}
          exercise={ex}
          log={currentLog}
          openIndex={openIndex}
          editing={editIndex !== null}
          suggestion={sug}
          last={lastEntryFor(exId, history)}
          painFlag={painFlagFor(ex, gate, catalog)}
          showWeight={shown}
          holdSide={holdSide}
          onSetChange={(i, patch) => changeSet(current, i, patch)}
          onEdit={setEditIndex}
          onAddSet={() => {
            const l = logOf(current);
            const lastSet = l.sets[l.sets.length - 1];
            writeLog(current.key, { ...l, sets: [...l.sets, { weightKg: lastSet?.weightKg ?? 0, reps: lastSet?.reps ?? current.item.repMin, done: false }] });
            haptic('selection');
          }}
          onRemoveSet={() => {
            const l = logOf(current);
            if (l.sets.length > 1 && !l.sets[l.sets.length - 1].done) writeLog(current.key, { ...l, sets: l.sets.slice(0, -1) });
            haptic('selection');
          }}
          onShowWeight={() => setWeightShown((m) => ({ ...m, [current.key]: true }))}
          onSwap={() => setSheet('alt')}
          onMarkWithoutTimer={() => firstOpen >= 0 && markSet(current, firstOpen)}
          onUndo={() => {
            if (editIndex === null) return;
            const l = logOf(current);
            writeLog(current.key, { ...l, sets: l.sets.map((s, i) => (i === editIndex ? { ...s, done: false } : s)) });
            setEditIndex(null);
            haptic('selection');
          }}
        />
      );
    }
  } else if (phase === 'finish') {
    const draftLogs = Object.values(mine?.logs ?? {});
    const weekLoadBefore = loadStatus(weekStart(date), { workoutLogs: history, footballLogs });
    body = (
      <div ref={scrollRef}>
        <FinishStep
          sessionName={session.name}
          durationMin={duration}
          onDuration={setDuration}
          measuredMin={measuredMin <= session.estMin * 2.5 ? measuredMin : 0}
          rpe={rpe}
          onRpe={setRpe}
          painSites={profile.painSites}
          pain={pain}
          onPain={(site, v) => setPain((p) => ({ ...p, [site]: v }))}
          threshold={plan.painThreshold}
          notes={notes}
          onNotes={setNotes}
          setsDone={doneSets}
          setsPlanned={totalPlanned}
          volume={workoutVolume({ exercises: draftLogs })}
          weekLoad={weekLoadBefore.load}
          average={weekLoadBefore.average}
        />
      </div>
    );
  } else if (phase === 'summary' && saved) {
    body = (
      <SummaryStep log={saved.log} sessionName={session.name} setsPlanned={saved.planned} records={saved.records} status={saved.status} physio={physio} history={historyAtOpen} />
    );
  }

  return (
    <FullScreenModal
      open
      onClose={requestClose}
      title={headerTitle}
      subtitle={headerSubtitle}
      closeIcon={phase === 'intro' ? 'down' : 'close'}
      closeLabel={phase === 'run' ? 'Esci dalla seduta' : 'Chiudi'}
      aria-label={session.name}
      headerRight={phase === 'run' ? <IconButton icon={ListOrdered} label="Tutti gli esercizi" variant="tinted" onClick={() => setSheet('overview')} /> : undefined}
      footer={footer}
      // Il riepilogo è il momento della seduta: i riflettori si accendono a piena luce.
      light={phase === 'summary' ? { intensity: 0.8, tone: 'palestra', flare: true } : undefined}
    >
      <div ref={anchorRef} aria-hidden />
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={bodyKey}
          custom={dir}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 28 * dir }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: -28 * dir }}
          transition={{ type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }}
        >
          {body}
        </motion.div>
      </AnimatePresence>

      {current && (
        <AlternativesSheet
          open={sheet === 'alt'}
          onClose={() => setSheet(null)}
          planned={current.exercise}
          currentId={currentLog?.exerciseId ?? current.item.exerciseId}
          catalog={catalog}
          history={history}
          recommended={painFlagFor(catalog[currentLog?.exerciseId ?? current.item.exerciseId], gate, catalog)?.alternatives ?? painFlagFor(current.exercise, gate, catalog)?.alternatives ?? []}
          doneSets={currentLog?.sets.filter((s) => s.done).length ?? 0}
          onPick={(id) => swapTo(current, id)}
        />
      )}
      <OverviewSheet
        open={sheet === 'overview'}
        onClose={() => setSheet(null)}
        steps={pplan.steps}
        current={stepIndex}
        logs={Object.fromEntries(pplan.items.map((it) => [it.key, logOf(it)]))}
        nameOf={nameOf}
        onJump={(i) => {
          setSheet(null);
          goTo(i);
        }}
        onFinish={toFinish}
      />
      <ExitSheet
        open={sheet === 'exit'}
        onClose={() => setSheet(null)}
        doneSets={doneSets}
        onLater={() => {
          setSheet(null);
          toast('Seduta in pausa: la riprendi da Allenamento', 'neutral');
          onClose();
        }}
        onFinish={toFinish}
        onDiscard={discard}
      />
    </FullScreenModal>
  );
}
