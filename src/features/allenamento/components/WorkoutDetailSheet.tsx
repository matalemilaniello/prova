import { useState } from 'react';
import { ArrowLeftRight, Trash2, TrendingUp, Trophy } from 'lucide-react';
import type { AppData, WorkoutLog } from '../../../domain/types';
import { SESSIONS } from '../../../data/sessions';
import { formatDayLong } from '../../../engine/dates';
import { bestSet, sessionLoad, workoutSetCount, workoutVolume } from '../../../engine/training';
import { fmtNumber } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { useApp, useUi } from '../../../state/store';
import { Button, Pill, Sheet, cn, scaleColor } from '../../../ui';
import { exerciseFor, headlineRecord, kgLabel, strengthRecords } from '../lib';
import { setsSummary } from '../player/ExerciseStep';

export interface WorkoutDetailSheetProps {
  log: WorkoutLog | null;
  open: boolean;
  onClose: () => void;
  physio: AppData['physio'];
}

/** Dettaglio di una seduta registrata: numeri, esercizi serie per serie, record, eliminazione. */
export function WorkoutDetailSheet({ log, open, onClose, physio }: WorkoutDetailSheetProps) {
  const history = useApp((s) => s.workoutLogs);
  const toast = useUi((s) => s.toast);
  const [confirm, setConfirm] = useState(false);
  if (!log) return null;
  const session = SESSIONS[log.sessionId];
  // Il trofeo va solo al record ancora imbattuto della seduta; gli altri miglioramenti sono progressi.
  const top = headlineRecord(log, history, physio)?.exerciseId ?? null;
  const prs = new Set(strengthRecords(log, history, physio).map((r) => r.exerciseId));
  const unitOf = (id: string): 'reps' | 'secondi' =>
    (session?.blocks.flatMap((b) => b.items).find((i) => i.exerciseId === id)?.unit ??
      physio.prescriptions.find((p) => p.exerciseId === id)?.unit ??
      'reps') as 'reps' | 'secondi';
  const stats = [
    { label: 'Durata', value: fmtNumber(log.durationMin), unit: 'min' },
    { label: 'RPE', value: fmtNumber(log.rpe), unit: 'su 10' },
    { label: 'Carico', value: fmtNumber(sessionLoad(log.durationMin, log.rpe)), unit: 'UA' },
    { label: 'Volume', value: fmtNumber(Math.round(workoutVolume(log))), unit: 'kg' },
  ];
  const painEntries = Object.entries(log.pain ?? {});
  // Il riscaldamento si riassume in una riga: conta che sia stato fatto, non i dettagli.
  const warmIds = new Set(session?.blocks.filter((b) => /riscaldamento/i.test(b.title)).flatMap((b) => b.items.map((i) => i.exerciseId)) ?? []);
  // Conta anche l'esercizio di riscaldamento sostituito in automatico (es. i balzi con la tibia alta).
  const warmCategory = (id: string) => /riscaldamento|mobilita/.test(exerciseFor(id, physio)?.category ?? '');
  const warm = log.exercises.filter((e) => (e.swappedFrom ? warmIds.has(e.swappedFrom) && warmCategory(e.exerciseId) : warmIds.has(e.exerciseId)));
  const main = log.exercises.filter((e) => !warm.includes(e));

  const remove = () => {
    if (!confirm) {
      haptic('warning');
      setConfirm(true);
      return;
    }
    useApp.getState().deleteWorkout(log.id);
    toast('Seduta eliminata', 'neutral', { actionLabel: 'Annulla', onAction: () => useApp.getState().saveWorkout(log) });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="large"
      title={session?.name ?? `Seduta ${log.sessionId}`}
      subtitle={`${formatDayLong(log.date)} · ${workoutSetCount(log)} serie`}
      footer={
        <Button variant="danger" fullWidth icon={Trash2} onClick={remove}>
          {confirm ? 'Tocca di nuovo per eliminare' : 'Elimina seduta'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-4">
        <dl className="grid grid-cols-4 overflow-hidden rounded-card bg-card shadow-card">
          {stats.map((s, i) => (
            <div key={s.label} className={cn('flex min-w-0 flex-col gap-0.5 px-3 py-3', i > 0 && 'border-l border-line')}>
              <dt className="t-label text-[0.625rem] text-ink-3">{s.label}</dt>
              <dd className="t-num truncate text-[1.375rem] text-ink">{s.value}</dd>
              <dd className={cn(/\s/.test(s.unit) ? 't-caption' : 't-mono text-[0.625rem]', 'text-ink-3')}>{s.unit}</dd>
            </div>
          ))}
        </dl>

        {(painEntries.length > 0 || log.notes) && (
          <div className="flex flex-col gap-2.5 rounded-card bg-card p-4 shadow-card">
            {painEntries.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="t-label mr-1 text-ink-3">Dolore</span>
                {painEntries.map(([site, v]) => (
                  <span key={site} className="t-footnote inline-flex h-7 items-center gap-1.5 rounded-full bg-ink-soft px-2.5 font-medium text-ink">
                    <span className="size-2 rounded-full" style={{ background: scaleColor(v, 0, 10, 'pain') }} aria-hidden />
                    {site} {v}
                  </span>
                ))}
              </div>
            )}
            {log.notes && <p className="t-callout selectable text-ink-2">{log.notes}</p>}
          </div>
        )}

        <section aria-label="Esercizi" className="flex flex-col gap-2">
          <h3 className="t-label px-1 text-ink-3">Esercizi</h3>
          <ul className="overflow-hidden rounded-card bg-card shadow-card">
            {warm.length > 0 && (
              <li className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="t-callout block font-medium text-ink">Riscaldamento</span>
                  <span className="t-footnote mt-0.5 block text-ink-2">{warm.length === 1 ? '1 esercizio fatto' : `${warm.length} esercizi fatti`}</span>
                </span>
              </li>
            )}
            {main.map((ex, j) => {
              const i = j + (warm.length ? 1 : 0);
              const best = bestSet(ex);
              const swapped = ex.swappedFrom ? exerciseFor(ex.swappedFrom, physio)?.name : null;
              return (
                <li key={`${ex.exerciseId}-${i}`} className={cn('flex items-start gap-3 px-4 py-3', i > 0 && 'border-t border-line')}>
                  <span className="min-w-0 flex-1">
                    <span className="t-callout block font-medium text-ink">{exerciseFor(ex.exerciseId, physio)?.name ?? ex.exerciseId}</span>
                    {swapped && (
                      <span className="t-caption mt-0.5 flex items-center gap-1 text-ink-3">
                        <ArrowLeftRight size={11} strokeWidth={2.4} aria-hidden />
                        al posto di {swapped}
                      </span>
                    )}
                    <span className="t-footnote mt-0.5 block text-ink-2 tabular">{setsSummary(ex.sets, unitOf(ex.exerciseId)) || 'nessuna serie'}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {top === ex.exerciseId ? (
                      <Pill tone="accent" icon={Trophy}>
                        Record
                      </Pill>
                    ) : prs.has(ex.exerciseId) ? (
                      <Pill tone="good" icon={TrendingUp}>
                        Migliorato
                      </Pill>
                    ) : null}
                    {best && best.e1rm > 0 && <span className="t-caption text-ink-3 tabular">1RM {kgLabel(Math.round(best.e1rm * 2) / 2)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}
