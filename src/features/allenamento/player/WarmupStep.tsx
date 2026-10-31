import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, Flame } from 'lucide-react';
import type { ExerciseLog } from '../../../domain/types';
import { haptic } from '../../../lib/haptics';
import { ProgressBar, cn, springSnappy } from '../../../ui';
import { doseLabel, estimateMinutes, type PlayerItem } from '../lib';

export interface WarmupStepProps {
  title: string;
  items: PlayerItem[];
  logs: Record<string, ExerciseLog | undefined>;
  onToggle: (item: PlayerItem, done: boolean) => void;
}

const isDone = (l: ExerciseLog | undefined) => Boolean(l?.sets.length && l.sets.every((s) => s.done));

/** Riscaldamento come una lista da spuntare: si fa di fila, senza registrare carichi. */
export function WarmupStep({ title, items, logs, onToggle }: WarmupStepProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<string | null>(null);
  const done = items.filter((it) => isDone(logs[it.key])).length;
  const minutes = estimateMinutes(items.map((i) => i.item));

  return (
    <div className="flex flex-col gap-5 pb-6 pt-2">
      <header className="flex flex-col gap-3">
        <p className="t-label flex items-center gap-1.5 text-calcio-ink">
          <Flame size={13} strokeWidth={2.4} aria-hidden />
          {title}
        </p>
        <h2 className="t-title text-ink">Prepara il corpo</h2>
        <p className="t-callout text-ink-2">
          Circa {minutes} minuti, di fila e senza fretta. Tocca un esercizio per le indicazioni, il cerchio per spuntarlo.
        </p>
        <div className="flex items-center gap-3">
          <ProgressBar value={items.length ? done / items.length : 0} tone="calcio" size="sm" className="flex-1" label={`${done} esercizi su ${items.length}`} />
          <span className="t-mono text-[0.75rem] text-ink-3">
            {done}/{items.length}
          </span>
        </div>
      </header>

      <ol className="flex flex-col gap-2.5">
        {items.map((it, i) => {
          const d = isDone(logs[it.key]);
          const expanded = open === it.key;
          const ex = it.exercise;
          return (
            <li key={it.key} className={cn('overflow-hidden rounded-[18px] bg-card shadow-card transition-opacity', d && 'opacity-75')}>
              <div className="flex items-center gap-3 py-2 pl-2 pr-3">
                <motion.button
                  type="button"
                  role="checkbox"
                  aria-checked={d}
                  aria-label={`${ex?.name ?? 'Esercizio'}: ${d ? 'fatto' : 'da fare'}`}
                  whileTap={{ scale: 0.88 }}
                  transition={springSnappy}
                  onClick={() => {
                    haptic(d ? 'selection' : 'success');
                    onToggle(it, !d);
                  }}
                  className="grid size-12 shrink-0 place-items-center"
                >
                  <span
                    className={cn(
                      'grid size-8 place-items-center rounded-full transition-colors duration-200',
                      d ? 'bg-good text-[var(--on-good)]' : 'border-2 border-line-strong text-transparent',
                    )}
                  >
                    <Check size={17} strokeWidth={3} aria-hidden />
                  </span>
                </motion.button>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => {
                    haptic('selection');
                    setOpen(expanded ? null : it.key);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('t-callout block font-semibold', d ? 'text-ink-2 line-through decoration-ink-3/60' : 'text-ink')}>
                      <span className="t-mono mr-1.5 text-[0.75rem] font-medium text-ink-3">{i + 1}</span>
                      {ex?.name ?? it.item.exerciseId}
                    </span>
                    <span className="t-mono mt-0.5 block text-[0.75rem] text-calcio-ink">{doseLabel(it.item)}</span>
                  </span>
                  <ChevronDown size={18} strokeWidth={2.2} className={cn('shrink-0 text-ink-3 transition-transform duration-200', expanded && 'rotate-180')} aria-hidden />
                </button>
              </div>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={reduce ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduce ? undefined : { height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 40 }}
                  >
                    <div className="flex flex-col gap-1.5 border-t border-line px-4 pb-3.5 pt-3">
                      {it.item.note && <p className="t-footnote font-medium text-ink">{it.item.note}</p>}
                      {ex?.cues.map((c, ci) => (
                        <p key={ci} className="t-footnote flex gap-2 text-ink-2">
                          <span className="t-mono w-3 shrink-0 text-[0.75rem] text-ink-3">{ci + 1}</span>
                          {c}
                        </p>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
