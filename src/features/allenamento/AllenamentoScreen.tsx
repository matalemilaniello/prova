/**
 * Allenamento: la prossima seduta in evidenza, la settimana di palestra e calcio con il carico,
 * le sedute (A, B, C o quelle del blocco in vigore), gli esercizi del fisioterapista, la forza stimata e lo storico.
 *
 * Fase 2 (docs/FASE2.md § 11.5): in cima la card della proposta di blocco aperta («Nuovo blocco pronto») e il blocco
 * approvato che entra più avanti, con «Annulla»; accanto a «Questa settimana» la pillola «Settimana 2 di 4 · carico»;
 * in fondo «Blocchi precedenti», che apre lo Storico del piano. La proposta di blocco nasce qui quando serve
 * (`ensureBlockProposal`, dopo il primo disegno): niente si applica da solo.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CircleCheck, Dumbbell } from 'lucide-react';
import type { WorkoutLog } from '../../domain/types';
import { daysBetween, formatDayTitle, formatMonth, formatWeekday, weekIndexSince } from '../../engine/dates';
import { FOOTBALL_LABEL, fmtNumber } from '../../lib/format';
import { sessionFor } from '../../engine/plan/program';
import { gateForLater, introLevel, sessionLoad } from '../../engine/training';
import { useNow, usePlanDay } from '../../state/hooks';
import { useApp, useUi } from '../../state/store';
import { Card, DayTypeBadge, EmptyState, ListGroup, ListRow, Pill, Screen, SectionTitle } from '../../ui';
import StoricoPage from '../piano/StoricoPage';
import { openProposalSheet, undoApproval } from '../piano/actions';
import { blockSessions, blockWeekLabel, ensureBlockProposal, openBlockProposal, pendingBlock, sessionName, type EnsureResult } from './blocks';
import { BlockProposalCard, NoGymDayLine, PastBlocksRow, PendingBlockCard } from './components/BlockCards';
import { HistorySection, PhysioSection, SessionsSection, StrengthSection } from './components/Sections';
import { NextSessionCard, ResumeCard } from './components/NextSessionCard';
import { WeekCard } from './components/WeekCard';
import { WorkoutDetailSheet } from './components/WorkoutDetailSheet';
import { draftDoneSets, useSessionDraft } from './draft';
import { buildPlayerPlan, exerciseFor, plannedSets, shortName } from './lib';
import { PhysioEditorSheet } from './PhysioEditor';
import { relativeDayShort, useTraining } from './useTraining';

/**
 * "Partita domani alle 21:00", "Partita giovedì alle 21:00". Da 5 giorni in là la partita dello stesso giorno della
 * settimana è passata da poco ("lunedì" sarebbe ieri o l'altro ieri): si scrive la data, "Prossima partita lunedì 9".
 */
function matchLabel(match: NonNullable<ReturnType<typeof useTraining>['nextMatch']>, today: string): string {
  const d = daysBetween(today, match.date);
  const kind = FOOTBALL_LABEL[match.event.kind];
  if (d >= 5) {
    const day = formatDayTitle(match.date);
    return `Prossima ${kind.toLowerCase()} ${day.charAt(0).toLowerCase()}${day.slice(1)} alle ${match.event.time}`;
  }
  return `${kind} ${relativeDayShort(match.date, today)} alle ${match.event.time}`;
}

export default function AllenamentoScreen() {
  const today = usePlanDay();
  const now = useNow(30_000).getTime();
  const plan = useApp((s) => s.plan);
  const physio = useApp((s) => s.physio);
  const workoutLogs = useApp((s) => s.workoutLogs);
  const open = useUi((s) => s.open);
  const toast = useUi((s) => s.toast);
  const draft = useSessionDraft((s) => s.draft);
  const data = useTraining(today);
  const [detail, setDetail] = useState<{ log: WorkoutLog; open: boolean } | null>(null);
  const [physioOpen, setPhysioOpen] = useState(false);
  const [storico, setStorico] = useState(false);
  const reduce = useReducedMotion();
  const proposals = useApp((s) => s.planner?.proposals);
  const pastBlocks = useApp((s) => (s.planVersions?.length ?? 0) + (s.planner?.blocks?.length ?? 0));

  // Proposta di blocco: nasce dopo il primo disegno quando serve (fine blocco la domenica, cambio di fase, obiettivo
  // cambiato, primo blocco) e quando l'app torna in primo piano. Senza obiettivo, date o blocco non fa niente.
  const [ensured, setEnsured] = useState<EnsureResult | null>(null);
  useEffect(() => {
    const run = () => setEnsured(ensureBlockProposal(today));
    const t = window.setTimeout(run, 0);
    const onVis = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [today, plan.training, plan.season, plan.program, proposals]);
  const openBlock = openBlockProposal(proposals);
  const pending = pendingBlock(proposals);
  const weekLabel = blockWeekLabel(plan, today);
  const blockRows = useMemo(() => blockSessions(plan, today), [plan, today]);

  const draftTotal = useMemo(() => {
    const s = draft ? sessionFor(draft.sessionId, draft.date, plan) : undefined;
    if (!s) return 0;
    // Come nel lettore: gli esercizi del fisioterapista contano solo se li stai facendo.
    const items = buildPlayerPlan(s, physio, plan, draft!.date, { intro: introLevel(s.id, workoutLogs) }).items;
    const physioItems = items.filter((i) => i.physio);
    const physioDone = physioItems.some((it) => draft!.logs[it.key]?.sets.some((x) => x.done));
    return plannedSets(items.filter((i) => !i.physio)) + (physioDone ? plannedSets(physioItems) : 0);
  }, [draft, physio, plan, workoutLogs]);

  const week = weekIndexSince(plan.startDate, today) + 1;
  // Prima dell'inizio (benvenuto finito di domenica) niente "settimana 0": si dice quando parte il piano.
  const startsIn = daysBetween(today, plan.startDate);
  const eyebrow =
    startsIn > 0 && startsIn <= 7
      ? `Il piano parte ${startsIn === 1 ? 'domani' : formatWeekday(plan.startDate)}`
      : week > 0
        ? `Settimana ${week} del piano`
        : formatMonth(today);
  const match = data.nextMatch;
  const subtitle = match ? <DayTypeBadge dayType="calcio" label={matchLabel(match, today)} /> : undefined;

  const startSession = (sessionId: string, date = today) => open({ type: 'session', sessionId, date });

  const discardDraft = () => {
    const saved = useSessionDraft.getState().draft;
    useSessionDraft.getState().clear();
    toast('Seduta in corso annullata', 'neutral', {
      actionLabel: 'Annulla',
      onAction: () => useSessionDraft.setState({ draft: saved }),
    });
  };

  return (
    <div className="relative h-full w-full">
      <div className="h-full" inert={storico || undefined} aria-hidden={storico || undefined}>
        <Screen title="Allenamento" eyebrow={eyebrow} subtitle={subtitle} light={{ intensity: 0.2 + 0.8 * data.weekProgress }}>
          {openBlock && <BlockProposalCard proposal={openBlock} onOpen={() => openProposalSheet(openBlock.id)} />}
          {pending && <PendingBlockCard proposal={pending} onOpen={() => openProposalSheet(pending.id)} onUndo={() => undoApproval(pending.id)} />}
          {!openBlock && ensured?.status === 'nessun-giorno' && <NoGymDayLine />}
          {!draft && data.todayLogs.length > 0 && (
            <ListGroup>
              {data.todayLogs.map((w) => {
                const rec = data.recordById[w.id];
                return (
                  <ListRow
                    key={w.id}
                    icon={CircleCheck}
                    iconTone="good"
                    title={`${sessionName(w.sessionId, w.date, plan)} fatta oggi`}
                    subtitle={`${w.durationMin} min · RPE ${w.rpe} · ${fmtNumber(sessionLoad(w.durationMin, w.rpe))} UA${rec ? ` · record: ${shortName(exerciseFor(rec.exerciseId, physio)?.name ?? rec.exerciseId, rec.exerciseId)}` : ''}`}
                    onPress={() => setDetail({ log: w, open: true })}
                  />
                );
              })}
            </ListGroup>
          )}
          {draft ? (
            <ResumeCard
              draft={draft}
              today={today}
              now={now}
              doneSets={draftDoneSets(draft)}
              totalSets={draftTotal}
              onResume={() => startSession(draft.sessionId, draft.date)}
              onDiscard={discardDraft}
            />
          ) : data.next ? (
            <NextSessionCard
              next={data.next}
              after={data.after}
              today={today}
              // La regola del dolore è calcolata sul controllo di oggi: per la seduta di domani "niente balzi oggi" non vale.
              gate={data.next.daysAway === 0 ? data.gate : gateForLater(data.gate)}
              intro={data.nextIntro}
              onStart={() => startSession(data.next!.sessionId, data.next!.daysAway === 0 ? data.next!.date : today)}
            />
          ) : (
            <Card padding="none">
              <EmptyState
                compact
                icon={Dumbbell}
                title="Nessuna seduta in programma"
                text="Scegli una seduta qui sotto quando vuoi, oppure aggiungi la palestra nella settimana dalle impostazioni."
              />
            </Card>
          )}

          <section className="flex flex-col gap-3" aria-labelledby="settimana-titolo">
            <SectionTitle
              id="settimana-titolo"
              action={
                weekLabel ? (
                  <Pill tone="palestra" size="sm">
                    {weekLabel}
                  </Pill>
                ) : undefined
              }
            >
              Questa settimana
            </SectionTitle>
            <WeekCard
              days={data.days}
              status={data.status}
              planned={data.planned}
              onDay={(d) => {
                const log = d.gym?.log ?? d.extra[0];
                if (log) setDetail({ log, open: true });
                else if (d.gym && !d.isPast) startSession(d.gym.sessionId);
                else if (d.football) open({ type: 'football', date: d.iso, kind: d.football.kind, itemId: `calcio:${d.football.kind}` });
              }}
            />
          </section>

          <SessionsSection plan={plan} history={data.history} today={today} physio={physio} blockRows={blockRows} onOpen={(id) => startSession(id)} />

          <PhysioSection physio={physio} plan={plan} onEdit={() => setPhysioOpen(true)} />

          <StrengthSection rows={data.strength} physio={physio} />

          <HistorySection
            history={data.history}
            recordById={data.recordById}
            physio={physio}
            plan={plan}
            onOpen={(log) => setDetail({ log, open: true })}
            onStart={() => startSession(data.next?.sessionId ?? 'A')}
          />

          {(pastBlocks > 0 || plan.program) && <PastBlocksRow onOpen={() => setStorico(true)} />}

          <WorkoutDetailSheet
            key={detail?.log.id ?? 'nessuna'}
            log={detail?.log ?? null}
            open={Boolean(detail?.open)}
            onClose={() => setDetail((d) => (d ? { ...d, open: false } : d))}
            physio={physio}
          />
          <PhysioEditorSheet open={physioOpen} onClose={() => setPhysioOpen(false)} />
        </Screen>
      </div>
      {/* Storico del piano sopra la schermata, che entra da destra come le pagine delle impostazioni. */}
      <AnimatePresence>
        {storico && (
          <motion.div
            key="storico"
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40, mass: 0.9 }}
            className="absolute inset-x-0 top-0 z-20 bg-bg shadow-[-12px_0_32px_-12px_rgb(0_0_0/0.35)]"
            style={{ bottom: 'var(--tabbar-h)' }}
          >
            <StoricoPage onBack={() => setStorico(false)} backLabel="Allenamento" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
