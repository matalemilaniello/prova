/**
 * Allenamento: la prossima seduta in evidenza, la settimana di palestra e calcio con il carico,
 * le sedute A, B, C, gli esercizi del fisioterapista, la forza stimata e lo storico.
 */
import { useMemo, useState } from 'react';
import { CircleCheck, Dumbbell } from 'lucide-react';
import type { WorkoutLog } from '../../domain/types';
import { SESSIONS } from '../../data/sessions';
import { formatMonth, weekIndexSince } from '../../engine/dates';
import { FOOTBALL_LABEL, fmtNumber } from '../../lib/format';
import { sessionLoad } from '../../engine/training';
import { useNow, useToday } from '../../state/hooks';
import { useApp, useUi } from '../../state/store';
import { Card, DayTypeBadge, EmptyState, ListGroup, ListRow, Screen, SectionTitle } from '../../ui';
import { HistorySection, PhysioSection, SessionsSection, StrengthSection } from './components/Sections';
import { NextSessionCard, ResumeCard } from './components/NextSessionCard';
import { WeekCard } from './components/WeekCard';
import { WorkoutDetailSheet } from './components/WorkoutDetailSheet';
import { draftDoneSets, useSessionDraft } from './draft';
import { buildPlayerPlan, plannedSets } from './lib';
import { PhysioEditorSheet } from './PhysioEditor';
import { relativeDayShort, useTraining } from './useTraining';

export default function AllenamentoScreen() {
  const today = useToday();
  const now = useNow(30_000).getTime();
  const plan = useApp((s) => s.plan);
  const physio = useApp((s) => s.physio);
  const open = useUi((s) => s.open);
  const toast = useUi((s) => s.toast);
  const draft = useSessionDraft((s) => s.draft);
  const data = useTraining(today);
  const [detail, setDetail] = useState<{ log: WorkoutLog; open: boolean } | null>(null);
  const [physioOpen, setPhysioOpen] = useState(false);

  const draftTotal = useMemo(() => {
    const s = draft ? SESSIONS[draft.sessionId] : undefined;
    return s ? plannedSets(buildPlayerPlan(s, physio, plan, draft!.date).items) : 0;
  }, [draft, physio, plan]);

  const week = weekIndexSince(plan.startDate, today) + 1;
  const eyebrow = week > 0 ? `${formatMonth(today)} · settimana ${week}` : formatMonth(today);
  const match = data.nextMatch;
  const subtitle = match ? (
    <DayTypeBadge dayType="calcio" label={`${FOOTBALL_LABEL[match.event.kind]} ${relativeDayShort(match.date, today)} alle ${match.event.time}`} />
  ) : undefined;

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
    <Screen title="Allenamento" eyebrow={eyebrow} subtitle={subtitle}>
      {!draft && data.todayLogs.length > 0 && (
        <ListGroup>
          {data.todayLogs.map((w) => (
            <ListRow
              key={w.id}
              icon={CircleCheck}
              iconTone="good"
              title={`${SESSIONS[w.sessionId]?.name ?? 'Seduta'} fatta oggi`}
              subtitle={`${w.durationMin} min · RPE ${w.rpe} · ${fmtNumber(sessionLoad(w.durationMin, w.rpe))} UA${data.recordsById[w.id] ? ` · ${data.recordsById[w.id] === 1 ? '1 record' : `${data.recordsById[w.id]} record`}` : ''}`}
              onPress={() => setDetail({ log: w, open: true })}
            />
          ))}
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
        <NextSessionCard next={data.next} after={data.after} today={today} gate={data.gate} onStart={() => startSession(data.next!.sessionId, data.next!.daysAway === 0 ? data.next!.date : today)} />
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
        <SectionTitle id="settimana-titolo" subtitle="Palestra e calcio, carico come minuti × RPE">
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

      <SessionsSection plan={plan} history={data.history} today={today} onOpen={(id) => startSession(id)} />

      <PhysioSection physio={physio} plan={plan} onEdit={() => setPhysioOpen(true)} />

      <StrengthSection rows={data.strength} physio={physio} />

      <HistorySection
        history={data.history}
        recordsById={data.recordsById}
        onOpen={(log) => setDetail({ log, open: true })}
        onStart={() => startSession(data.next?.sessionId ?? 'A')}
      />

      <WorkoutDetailSheet
        key={detail?.log.id ?? 'nessuna'}
        log={detail?.log ?? null}
        open={Boolean(detail?.open)}
        onClose={() => setDetail((d) => (d ? { ...d, open: false } : d))}
        physio={physio}
      />
      <PhysioEditorSheet open={physioOpen} onClose={() => setPhysioOpen(false)} />
    </Screen>
  );
}
