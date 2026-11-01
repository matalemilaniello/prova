import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react';
import { useUi, type ToastItem } from '../state/store';
import { cn } from './cn';
import { spring } from './motion';

const ICON = { neutral: Info, good: CircleCheck, warn: CircleAlert, bad: CircleX };
const COLOR = { neutral: 'var(--ink-2)', good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' };

/** Avvisi visibili insieme: quello nuovo davanti, i precedenti compressi dietro come su iOS. */
const MAX_VISIBLE = 3;

function Toast({ t, depth }: { t: ToastItem; depth: number }) {
  const dismiss = useUi((s) => s.dismissToast);
  const reduce = useReducedMotion();
  useEffect(() => {
    const id = window.setTimeout(() => dismiss(t.id), t.durationMs);
    return () => window.clearTimeout(id);
  }, [t.id, t.durationMs, dismiss]);
  const Icon = ICON[t.tone];
  const front = depth === 0;
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.94 }}
      animate={
        reduce
          ? { opacity: front ? 1 : 0 }
          : { opacity: front ? 1 : depth === 1 ? 0.6 : 0.35, y: depth * 8, scale: 1 - depth * 0.05 }
      }
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96, transition: { duration: 0.18 } }}
      transition={spring}
      drag={reduce || !front ? false : 'y'}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.8, bottom: 0.1 }}
      onDragEnd={(_, info) => {
        if (info.offset.y < -24 || info.velocity.y < -300) dismiss(t.id);
      }}
      role={t.tone === 'bad' ? 'alert' : 'status'}
      aria-hidden={!front || undefined}
      style={{ gridArea: '1 / 1', zIndex: MAX_VISIBLE - depth, transformOrigin: '50% 0%' }}
      className={cn(
        'flex w-full max-w-[420px] items-center gap-3 self-start justify-self-center rounded-[20px] border border-[var(--bar-line)] bg-[var(--bg-elev)] py-2 pl-3.5 pr-2',
        'shadow-[0_12px_32px_-10px_rgb(0_0_0/0.5)]',
        front ? 'pointer-events-auto' : 'pointer-events-none',
      )}
    >
      <Icon size={20} strokeWidth={2.2} style={{ color: COLOR[t.tone] }} aria-hidden className="shrink-0" />
      <p className="t-callout min-w-0 flex-1 py-1.5 font-medium text-ink">{t.message}</p>
      {t.actionLabel && t.onAction && (
        <button
          type="button"
          tabIndex={front ? 0 : -1}
          onClick={() => {
            t.onAction?.();
            dismiss(t.id);
          }}
          className="t-footnote h-11 shrink-0 rounded-full bg-ink-soft px-4 font-semibold text-accent-ink"
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
  const visible = toasts.slice(-MAX_VISIBLE);
  return createPortal(
    <div
      aria-live="polite"
      data-toast-host
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] grid px-4 pt-[calc(var(--safe-top)+10px)]"
    >
      <AnimatePresence initial={false}>
        {visible.map((t, i) => (
          <Toast key={t.id} t={t} depth={visible.length - 1 - i} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
