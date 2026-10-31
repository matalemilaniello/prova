import { memo, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeftRight,
  Check,
  History,
  Lightbulb,
  Minus,
  Pause,
  Pencil,
  PlayCircle,
  Plus,
  Repeat,
  Sparkles,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { Exercise, ExerciseLog, SetLog } from '../../../domain/types';
import { IS_PREVIEW } from '../../../app/env';
import { formatShort, formatWeekdayShort } from '../../../engine/dates';
import { bestSet, type LastEntry, type PainFlag, type Suggestion, type SuggestionKind } from '../../../engine/training';
import { fmtNumber } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Button, Callout, Card, IconButton, Pill, cn, spring, springSnappy } from '../../../ui';
import { BigStepper } from './BigStepper';
import { doseLabel, kgLabel, repsUnit, restLabel, weightStep, type PlayerItem } from '../lib';

export interface ExerciseStepProps {
  pitem: PlayerItem;
  /** Esercizio effettivo (dopo un'eventuale sostituzione). */
  exercise: Exercise | undefined;
  log: ExerciseLog;
  /** Serie aperta per l'inserimento (la prima da fare, o una fatta in modifica). */
  openIndex: number;
  editing: boolean;
  suggestion: Suggestion;
  last: LastEntry | null;
  painFlag: PainFlag | null;
  showWeight: boolean;
  /** Lato della tenuta per lato (0 o 1), se in corso. */
  holdSide: number;
  onSetChange: (index: number, patch: Partial<SetLog>) => void;
  onEdit: (index: number | null) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onShowWeight: () => void;
  onSwap: () => void;
  onMarkWithoutTimer: () => void;
  /** Toglie la spunta alla serie in modifica. */
  onUndo: () => void;
}

const KIND: Record<SuggestionKind, { icon: LucideIcon; tone: 'good' | 'accent' | 'warn' | 'bad' | 'neutral' | 'palestra' }> = {
  aumenta: { icon: TrendingUp, tone: 'good' },
  ripetizioni: { icon: Plus, tone: 'palestra' },
  ripeti: { icon: Repeat, tone: 'neutral' },
  nuovo: { icon: Sparkles, tone: 'accent' },
  mantieni: { icon: Pause, tone: 'warn' },
  riduci: { icon: TrendingDown, tone: 'bad' },
};

/** "22 kg · 10, 10, 9" oppure "20 kg × 10 · 22 kg × 8" se i carichi cambiano. */
export function setsSummary(sets: SetLog[], unit: 'reps' | 'secondi'): string {
  const done = sets.filter((s) => s.done && s.reps > 0);
  if (!done.length) return '';
  const u = unit === 'secondi' ? ' s' : '';
  const same = done.every((s) => s.weightKg === done[0].weightKg);
  if (same) {
    const reps = done.map((s) => `${s.reps}${u}`).join(', ');
    if (done[0].weightKg > 0) return `${kgLabel(done[0].weightKg)} · ${reps}`;
    return unit === 'secondi' ? reps : `${reps} rip.`;
  }
  return done.map((s) => `${s.weightKg > 0 ? `${fmtNumber(s.weightKg, 1)} × ` : ''}${s.reps}${u}`).join(' · ');
}

function ExerciseStepBase(props: ExerciseStepProps) {
  const { pitem, exercise, log, openIndex, editing, suggestion, last, painFlag, showWeight, holdSide } = props;
  const reduce = useReducedMotion();
  const item = pitem.item;
  const swapped = Boolean(log.swappedFrom);
  const doneCount = log.sets.filter((s) => s.done).length;
  const k = KIND[suggestion.kind];
  const lastBest = last ? bestSet(last.log) : null;
  const canSwap = !pitem.physio && (pitem.exercise?.alternatives?.length ?? 0) > 0;
  const videoUrl = exercise?.videoQuery && !IS_PREVIEW ? `https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.videoQuery)}` : null;
  const blockLabel = `${pitem.blockTitle} · ${pitem.indexInBlock + 1} di ${pitem.blockSize}`;

  // Dopo aver segnato una serie la successiva entra in vista (il riquadro del recupero ha finito di salire).
  const rootRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (openIndex < 0) return;
    // Si cerca nel DOM: durante l'uscita la vecchia serie aperta può ancora esistere.
    const id = window.setTimeout(
      () => rootRef.current?.querySelector(`[data-open-set="${openIndex}"]`)?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }),
      380,
    );
    return () => window.clearTimeout(id);
  }, [openIndex, reduce]);

  return (
    <div ref={rootRef} className="flex flex-col gap-5 pb-6 pt-2">
      {/* Intestazione dell'esercizio */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className={cn('t-label', pitem.physio ? 'text-leggero-ink' : 'text-palestra-ink')}>{blockLabel}</p>
          <div className="-my-2 -mr-1 flex items-center gap-1">
            {videoUrl && (
              <IconButton
                icon={PlayCircle}
                label="Cerca un video dimostrativo"
                size="sm"
                variant="plain"
                onClick={() => window.open(videoUrl, '_blank', 'noopener')}
              />
            )}
            {canSwap && <IconButton icon={ArrowLeftRight} label="Sostituisci con un'alternativa" size="sm" variant="tinted" onClick={props.onSwap} />}
          </div>
        </div>
        <h2 className="t-title text-ink">{exercise?.name ?? 'Esercizio'}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={pitem.physio ? 'leggero' : 'palestra'} size="md">
            {doseLabel(item)}
          </Pill>
          {item.rir !== undefined && <Pill size="md">RIR {item.rir}</Pill>}
          <Pill size="md">Recupero {restLabel(item.restSec)}</Pill>
          {swapped && (
            <Pill tone="accent" size="md" icon={ArrowLeftRight}>
              Sostituito
            </Pill>
          )}
        </div>
      </header>

      {painFlag && (
        <Callout
          tone="warn"
          title={painFlag.reason}
          action={
            painFlag.alternatives.length ? (
              <Button size="sm" variant="ghost" icon={ArrowLeftRight} onClick={props.onSwap}>
                Scegli la variante
              </Button>
            ) : undefined
          }
        >
          {painFlag.alternatives.length ? 'Le alternative adatte sono in cima alla lista.' : 'Riduci il carico e fermati se il dolore sale.'}
        </Callout>
      )}

      {/* Indicazioni tecniche: sempre visibili, compatte */}
      {(exercise?.cues.length || item.note) && (
        <Card variant="nested" padding="none" className="overflow-hidden">
          {item.note && (
            <div className="flex gap-2.5 border-b border-line px-3.5 py-3">
              <Lightbulb size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
              <p className="t-footnote font-medium text-ink">{item.note}</p>
            </div>
          )}
          {exercise?.cues.length ? (
            <ol className="flex flex-col gap-1.5 px-3.5 py-3" aria-label="Indicazioni tecniche">
              {exercise.cues.map((c, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="t-mono w-3 shrink-0 pt-px text-[0.75rem] font-medium text-ink-3">{i + 1}</span>
                  <span className="t-footnote text-ink-2">{c}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </Card>
      )}

      {/* L'ultima volta e il suggerimento, in un unico riquadro */}
      <section aria-label="L'ultima volta e oggi" className="overflow-hidden rounded-[16px]" style={{ background: 'var(--ink-soft)' }}>
        <div className="flex items-end justify-between gap-3 px-3.5 pb-2.5 pt-3">
          <div className="min-w-0">
            <p className="t-label flex items-center gap-1.5 text-ink-3">
              <History size={12} strokeWidth={2.4} aria-hidden />
              {last ? `L'ultima volta · ${formatWeekdayShort(last.date)} ${formatShort(last.date)}` : "L'ultima volta"}
            </p>
            <p className="t-callout mt-1 font-semibold text-ink tabular">{last ? setsSummary(last.log.sets, item.unit) : 'Prima volta'}</p>
          </div>
          {lastBest && lastBest.e1rm > 0 && (
            <div className="shrink-0 text-right">
              <p className="t-label text-ink-3">1RM stimato</p>
              <p className="t-callout mt-1 font-semibold text-ink tabular">{kgLabel(Math.round(lastBest.e1rm * 2) / 2)}</p>
            </div>
          )}
        </div>
        <div className="flex items-start gap-2.5 border-t border-[var(--control-line)] px-3.5 py-2.5">
          <span
            className="mt-px grid size-6 shrink-0 place-items-center rounded-full"
            style={{ background: `color-mix(in srgb, var(--${k.tone === 'neutral' ? 'ink-2' : k.tone}) 18%, transparent)`, color: `var(--${k.tone === 'neutral' ? 'ink-2' : `${k.tone}-ink`})` }}
            aria-hidden
          >
            <k.icon size={14} strokeWidth={2.6} />
          </span>
          <p className="t-footnote min-w-0 text-ink-2">
            <span className="font-semibold text-ink">
              Oggi {suggestion.weightKg > 0 ? `${kgLabel(suggestion.weightKg)} × ` : ''}
              {suggestion.sets.map((s) => s.reps).join(', ')}
              {item.unit === 'secondi' ? '\u00a0s' : ''}
            </span>
            <span className="text-ink-3"> · </span>
            {suggestion.reason}
          </p>
        </div>
      </section>

      {/* Serie */}
      <section aria-label="Serie" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between px-1">
          <h3 className="t-label text-ink-3">Serie</h3>
          <span className="t-mono text-[0.75rem] text-ink-3">
            {doneCount} di {log.sets.length}
          </span>
        </div>
        <ol className="flex flex-col gap-2">
          {log.sets.map((s, i) => {
            const open = i === openIndex;
            return (
              <motion.li key={i} layout={reduce ? false : 'position'} transition={spring}>
                <AnimatePresence initial={false} mode="popLayout">
                  {open ? (
                    <motion.div
                      key="open"
                      data-open-set={i}
                      className="scroll-mb-4"
                      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                      transition={springSnappy}
                    >
                      <OpenSet
                        index={i}
                        total={log.sets.length}
                        set={s}
                        item={item}
                        editing={editing}
                        target={suggestion.sets[i]?.reps ?? suggestion.reps}
                        showWeight={showWeight}
                        holdSide={holdSide}
                        onChange={(patch) => props.onSetChange(i, patch)}
                        onShowWeight={props.onShowWeight}
                        onCancelEdit={() => props.onEdit(null)}
                        onMarkWithoutTimer={props.onMarkWithoutTimer}
                        onUndo={props.onUndo}
                      />
                    </motion.div>
                  ) : (
                    <motion.div key="row" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }}>
                      <SetRowCompact
                        index={i}
                        set={s}
                        unit={item.unit}
                        showWeight={showWeight}
                        upcoming={!s.done && i > openIndex}
                        onPress={s.done ? () => props.onEdit(i) : undefined}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ol>
        <div className="flex items-center justify-between px-1 pt-1">
          <button type="button" onClick={props.onAddSet} className="hit-44 t-footnote inline-flex items-center gap-1 font-semibold text-accent-ink">
            <Plus size={15} strokeWidth={2.6} aria-hidden />
            Aggiungi serie
          </button>
          {log.sets.length > 1 && !log.sets[log.sets.length - 1].done && (
            <button type="button" onClick={props.onRemoveSet} className="hit-44 t-footnote inline-flex items-center gap-1 font-medium text-ink-3">
              <Minus size={15} strokeWidth={2.6} aria-hidden />
              Togli una serie
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export const ExerciseStep = memo(ExerciseStepBase);

function SetRowCompact({
  index,
  set,
  unit,
  showWeight,
  upcoming,
  onPress,
}: {
  index: number;
  set: SetLog;
  unit: 'reps' | 'secondi';
  showWeight: boolean;
  upcoming: boolean;
  onPress?: () => void;
}) {
  const value = (
    <span className="t-num text-[1.375rem] text-ink">
      {showWeight && set.weightKg > 0 && (
        <>
          {fmtNumber(set.weightKg, 1)}
          <span className="t-mono ml-0.5 text-[0.75rem] text-ink-3">kg</span>
          <span className="mx-1.5 text-ink-3">×</span>
        </>
      )}
      {set.reps}
      <span className="t-mono ml-0.5 text-[0.75rem] text-ink-3">{unit === 'secondi' ? 's' : 'rip.'}</span>
    </span>
  );
  const body = (
    <>
      <span
        className={cn('grid size-7 shrink-0 place-items-center rounded-full', set.done ? 'bg-good text-[var(--on-good)]' : 'border-[1.5px] border-dashed border-line-strong text-ink-3')}
        aria-hidden
      >
        {set.done ? <Check size={15} strokeWidth={3} /> : <span className="t-mono text-[0.6875rem]">{index + 1}</span>}
      </span>
      <span className={cn('t-callout flex-1 font-medium', set.done ? 'text-ink' : 'text-ink-2')}>Serie {index + 1}</span>
      {value}
      {onPress && <Pencil size={14} strokeWidth={2.2} className="ml-1 text-ink-3" aria-hidden />}
    </>
  );
  const cls = cn('flex min-h-[52px] w-full items-center gap-3 rounded-[16px] px-3.5 text-left', set.done ? 'bg-card' : 'bg-transparent shadow-[inset_0_0_0_1px_var(--line)]', upcoming && 'opacity-60');
  if (onPress) {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        transition={springSnappy}
        className={cls}
        aria-label={`Serie ${index + 1}, fatta. Tocca per modificare`}
        onClick={() => {
          haptic('selection');
          onPress();
        }}
      >
        {body}
      </motion.button>
    );
  }
  return <div className={cls}>{body}</div>;
}

function OpenSet({
  index,
  total,
  set,
  item,
  editing,
  target,
  showWeight,
  holdSide,
  onChange,
  onShowWeight,
  onCancelEdit,
  onMarkWithoutTimer,
  onUndo,
}: {
  index: number;
  total: number;
  set: SetLog;
  item: PlayerItem['item'];
  editing: boolean;
  target: number;
  showWeight: boolean;
  holdSide: number;
  onChange: (patch: Partial<SetLog>) => void;
  onShowWeight: () => void;
  onCancelEdit: () => void;
  onMarkWithoutTimer: () => void;
  onUndo: () => void;
}) {
  const timed = item.unit === 'secondi';
  const repsLabel = timed ? (item.perSide ? 'Secondi per lato' : 'Secondi') : item.perSide ? 'Rip. per lato' : 'Ripetizioni';
  return (
    <div
      className="relative overflow-hidden rounded-[20px] bg-card p-4 shadow-card"
      style={{ boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--palestra) 55%, transparent), var(--card-shadow)' }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(120% 80% at 100% 0%, color-mix(in srgb, var(--palestra) 12%, transparent), transparent 60%)' }}
      />
      <div className="relative flex items-center justify-between gap-3">
        <p className="t-headline text-ink">
          {editing ? `Modifica serie ${index + 1}` : `Serie ${index + 1}`}
          <span className="font-normal text-ink-3"> di {total}</span>
        </p>
        {editing ? (
          <span className="flex items-center gap-4">
            <button type="button" onClick={onUndo} className="hit-44 t-footnote font-medium text-ink-2">
              Togli la spunta
            </button>
            <button type="button" onClick={onCancelEdit} className="hit-44 t-footnote font-semibold text-accent-ink">
              Fatto
            </button>
          </span>
        ) : (
          <span className="t-mono text-[0.75rem] text-ink-3">
            obiettivo {target}
            {timed ? ' s' : ''}
            {timed && item.perSide && holdSide === 1 ? ' · secondo lato' : ''}
          </span>
        )}
      </div>
      <div className={cn('relative mt-3 grid gap-3', showWeight ? 'grid-cols-2' : 'grid-cols-1')}>
        {showWeight && (
          <BigStepper
            label="Carico"
            unit="kg"
            step={weightStep(item, set.weightKg)}
            max={400}
            value={set.weightKg}
            format={(n) => fmtNumber(n, 1)}
            onChange={(v) => onChange({ weightKg: v })}
          />
        )}
        <BigStepper
          label={repsLabel}
          unit={repsUnit(item)}
          step={timed ? 5 : 1}
          min={timed ? 5 : 1}
          max={timed ? 600 : 100}
          value={set.reps}
          onChange={(v) => onChange({ reps: v })}
          className={showWeight ? undefined : 'mx-auto w-full max-w-[220px]'}
        />
      </div>
      <div className="relative mt-1 flex flex-wrap justify-center gap-x-6">
        {!showWeight && (
          <button type="button" onClick={onShowWeight} className="hit-44 t-footnote mt-2 font-semibold text-accent-ink">
            + Aggiungi un carico
          </button>
        )}
        {timed && !editing && (
          <button type="button" onClick={onMarkWithoutTimer} className="hit-44 t-footnote mt-2 font-semibold text-ink-2">
            Segna senza timer
          </button>
        )}
      </div>
    </div>
  );
}
