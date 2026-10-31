import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';
import { useUi, type ToastItem } from '../state/store';
import { cn } from './cn';
import { spring } from './motion';

const ICON = { neutral: Info, good: CircleCheck, warn: CircleAlert, bad: CircleX };
const COLOR = { neutral: 'var(--ink-2)', good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' };

function Toast({ t }: { t: ToastItem }) {
  const dismiss = useUi((s) => s.dismissToast);
  const reduce = useReducedMotion();
  useEffect(() => {
    const id = window.setTimeout(() => dismiss(t.id), t.durationMs);
    return () => window.clearTimeout(id);
  }, [t.id, t.durationMs, dismiss]);
  const Icon = ICON[t.tone];
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96, transition: { duration: 0.18 } }}
      transition={spring}
      drag={reduce ? false : 'y'}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.8, bottom: 0.1 }}
      onDragEnd={(_, info) => {
        if (info.offset.y < -24 || info.velocity.y < -300) dismiss(t.id);
      }}
      role={t.tone === 'bad' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-[20px] border border-[var(--bar-line)] py-2.5 pl-3.5 pr-2.5',
        'glass shadow-[0_10px_30px_-8px_rgb(0_0_0/0.45)]',
      )}
    >
      <Icon size={20} strokeWidth={2.2} style={{ color: COLOR[t.tone] }} aria-hidden className="shrink-0" />
      <p className="t-callout min-w-0 flex-1 py-1 font-medium text-ink">{t.message}</p>
      {t.actionLabel && t.onAction && (
        <button
          type="button"
          onClick={() => {
            t.onAction?.();
            dismiss(t.id);
          }}
          className="t-footnote h-8 shrink-0 rounded-full bg-ink-soft px-3 font-semibold text-accent-ink"
        >
          {t.actionLabel}
        </button>
      )}
    </motion.div>
  );
}

/** Coda dei messaggi brevi, in alto sotto la barra di stato. Usa useUi.getState().toast(...). */
export function ToastHost() {
  const toasts = useUi((s) => s.toasts);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4 pt-[calc(var(--safe-top)+10px)]"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <Toast key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
