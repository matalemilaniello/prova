import { ArrowLeftRight, Check, Flag, HeartPulse, Pause, RotateCcw, Trash2 } from 'lucide-react';
import type { Exercise, ExerciseLog, WorkoutLog } from '../../../domain/types';
import { lastEntryFor } from '../../../engine/training';
import { Button, Pill, Sheet, cn, toneInk, toneRing, toneSoft } from '../../../ui';
import { doseLabel, type PlayerStep } from '../lib';
import { setsSummary } from './ExerciseStep';

// ───────────────────────── Alternative ─────────────────────────

export interface AlternativesSheetProps {
  open: boolean;
  onClose: () => void;
  /** Esercizio previsto dalla seduta. */
  planned: Exercise | undefined;
  /** Esercizio in uso ora. */
  currentId: string;
  catalog: Record<string, Exercise>;
  history: WorkoutLog[];
  /** Alternative consigliate dalla regola del dolore (in cima). */
  recommended: string[];
  /** Serie già segnate che andrebbero perse. */
  doneSets: number;
  onPick: (exerciseId: string) => void;
}

/** Sostituzione con un'alternativa: stesse finalità, attrezzi diversi. */
export function AlternativesSheet({ open, onClose, planned, currentId, catalog, history, recommended, doneSets, onPick }: AlternativesSheetProps) {
  const ids = [...new Set([...recommended, ...(planned?.alternatives ?? [])])].filter((id) => catalog[id]);
  const options: { ex: Exercise; original: boolean }[] = [
    ...(planned && currentId !== planned.id ? [{ ex: planned, original: true }] : []),
    ...ids.filter((id) => id !== currentId).map((id) => ({ ex: catalog[id], original: false })),
  ];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Sostituisci l'esercizio"
      subtitle={planned ? `Al posto di: ${planned.name}` : undefined}
    >
      <div className="flex flex-col gap-3 pb-2">
        {doneSets > 0 && (
          <p className="t-footnote rounded-[14px] bg-warn-soft px-3.5 py-2.5 text-warn-ink">
            {doneSets === 1 ? 'La serie già segnata verrà azzerata.' : `Le ${doneSets} serie già segnate verranno azzerate.`}
          </p>
        )}
        {options.length ? (
          <ul className="overflow-hidden rounded-card bg-card shadow-card">
            {options.map(({ ex, original }, i) => {
              const last = lastEntryFor(ex.id, history);
              const rec = recommended.includes(ex.id);
              return (
                <li key={ex.id} className={cn(i > 0 && 'border-t border-line')}>
                  <button
                    type="button"
                    onClick={() => onPick(ex.id)}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left active:bg-ink-soft"
                  >
                    <span
                      className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[11px]"
                      style={{ background: toneSoft('palestra', 16), boxShadow: toneRing('palestra'), color: toneInk('palestra') }}
                      aria-hidden
                    >
                      {original ? <RotateCcw size={17} strokeWidth={2.2} /> : <ArrowLeftRight size={17} strokeWidth={2.2} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="t-callout block font-semibold text-ink">{ex.name}</span>
                      <span className="t-footnote mt-0.5 block text-ink-2">{ex.equipment}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {original && <Pill tone="palestra">Torna a quello previsto</Pill>}
                        {rec && <Pill tone="good" icon={Check}>Consigliata oggi</Pill>}
                        {ex.elbowFriendly && <Pill>Adatto al gomito</Pill>}
                      </span>
                      {last && (
                        <span className="t-footnote mt-1.5 block text-ink-3">
                          Ultima volta: {setsSummary(last.log.sets, 'reps')}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="t-callout py-6 text-center text-ink-2">Per questo esercizio non ci sono alternative.</p>
        )}
      </div>
    </Sheet>
  );
}

// ───────────────────────── Panoramica ─────────────────────────

export interface OverviewSheetProps {
  open: boolean;
  onClose: () => void;
  steps: PlayerStep[];
  current: number;
  logs: Record<string, ExerciseLog | undefined>;
  nameOf: (step: PlayerStep) => string;
  onJump: (index: number) => void;
  onFinish: () => void;
}

/** Tutti gli esercizi della seduta con l'avanzamento: tocca per saltare a uno. */
export function OverviewSheet({ open, onClose, steps, current, logs, nameOf, onJump, onFinish }: OverviewSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="large"
      title="La seduta"
      footer={
        <Button fullWidth size="lg" variant="secondary" icon={Flag} onClick={onFinish}>
          Termina la seduta
        </Button>
      }
    >
      <ol className="flex flex-col gap-1.5 pb-2">
        {steps.map((st, i) => {
          const items = st.kind === 'warmup' ? st.items : [st.item];
          // Il riscaldamento si conta per esercizi spuntati ("2/3"), gli esercizi per serie.
          const warm = st.kind === 'warmup';
          const total = warm ? items.length : items.reduce((s, it) => s + (logs[it.key]?.sets.length ?? it.item.sets), 0);
          const done = warm
            ? items.filter((it) => {
                const l = logs[it.key];
                return Boolean(l?.sets.length && l.sets.every((x) => x.done));
              }).length
            : items.reduce((s, it) => s + (logs[it.key]?.sets.filter((x) => x.done).length ?? 0), 0);
          const complete = total > 0 && done >= total;
          const here = i === current;
          const block = st.kind === 'warmup' ? st.blockTitle : st.item.blockTitle;
          const prevBlock = i > 0 ? (steps[i - 1].kind === 'warmup' ? (steps[i - 1] as { blockTitle: string }).blockTitle : (steps[i - 1] as { item: { blockTitle: string } }).item.blockTitle) : null;
          return (
            <li key={st.key}>
              {block !== prevBlock && st.kind !== 'warmup' && (
                <p className={cn('t-label flex items-center gap-1.5 px-1 pb-1.5', st.item.physio ? 'text-leggero-ink' : 'text-ink-3', i > 0 && 'pt-3')}>
                  {st.item.physio && <HeartPulse size={12} strokeWidth={2.4} aria-hidden />}
                  {block}
                </p>
              )}
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-current={here ? 'step' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[16px] px-3.5 py-3 text-left',
                  here ? 'bg-card shadow-[inset_0_0_0_1.5px_var(--palestra)]' : 'bg-card',
                )}
              >
                {complete ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-good text-[var(--on-good)]" aria-hidden>
                    <Check size={15} strokeWidth={3} />
                  </span>
                ) : (
                  <span className="relative grid size-7 shrink-0 place-items-center" aria-hidden>
                    {/* Anello che si riempie con le serie fatte. */}
                    <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90">
                      <circle cx="14" cy="14" r="12.75" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
                      {done > 0 && (
                        <circle
                          cx="14"
                          cy="14"
                          r="12.75"
                          fill="none"
                          stroke="var(--palestra)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          pathLength={100}
                          strokeDasharray={`${Math.max(8, (done / total) * 100)} 100`}
                        />
                      )}
                    </svg>
                    <span className={cn('t-mono relative text-[0.6875rem]', done > 0 ? 'font-semibold text-palestra-ink' : 'text-ink-3')}>{i + 1}</span>
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="t-callout block font-medium text-ink">{nameOf(st)}</span>
                  <span className="t-mono mt-0.5 block text-[0.75rem] text-ink-3">
                    {st.kind === 'warmup' ? `${st.items.length} esercizi` : doseLabel(st.item.item)}
                  </span>
                </span>
                <span className="t-mono shrink-0 text-[0.75rem] text-ink-2">
                  {done}/{total}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}

// ───────────────────────── Uscita ─────────────────────────

export interface ExitSheetProps {
  open: boolean;
  onClose: () => void;
  doneSets: number;
  onLater: () => void;
  onFinish: () => void;
  onDiscard: () => void;
}

/** Uscita dalla seduta in corso: riprendi dopo, termina e salva, oppure annulla. */
export function ExitSheet({ open, onClose, doneSets, onLater, onFinish, onDiscard }: ExitSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Esci dalla seduta?" subtitle={`${doneSets === 1 ? '1 serie segnata' : `${doneSets} serie segnate`}, salvate su questo telefono.`}>
      <div className="flex flex-col gap-2.5 pb-2">
        <Button fullWidth size="lg" icon={Pause} onClick={onLater}>
          Riprendi più tardi
        </Button>
        <Button fullWidth size="lg" variant="secondary" icon={Flag} onClick={onFinish}>
          Termina e salva
        </Button>
        <Button fullWidth size="lg" variant="danger" icon={Trash2} onClick={onDiscard}>
          Annulla la seduta
        </Button>
        <Button fullWidth variant="ghost" onClick={onClose}>
          Resta qui
        </Button>
      </div>
    </Sheet>
  );
}
