import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from './cn';
import { Floodlights, type FloodlightsProps } from './Floodlights';
import { IconButton } from './IconButton';
import { useFocusTrap } from './useFocusTrap';
import { useKeyboardInset } from './useKeyboardInset';

export interface FullScreenModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Azioni a destra nell'intestazione. */
  headerRight?: ReactNode;
  /** Piede fisso con la safe area (es. pulsante principale). */
  footer?: ReactNode;
  /** Icona di chiusura: 'close' (X, default) o 'down' (freccia in giù). */
  closeIcon?: 'close' | 'down';
  closeLabel?: string;
  /** Se false, Esc non chiude (es. seduta in corso: chiedi conferma tu). */
  escapeCloses?: boolean;
  'aria-label'?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  contentClassName?: string;
  /**
   * Riflettori dietro l'intestazione (default intensità 0,35, senza righe del campo); `false` li spegne.
   * Es. `{ flare: n }` sul riepilogo della seduta, `{ curfew: true }` nel rito della sera.
   */
  light?: Pick<FloodlightsProps, 'intensity' | 'tone' | 'flare' | 'curfew' | 'pitch'> | false;
  children?: ReactNode;
}

/** Pannello a schermo intero che sale dal basso (es. la seduta in corso). */
export function FullScreenModal(props: FullScreenModalProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(<AnimatePresence propagate>{props.open && <Panel key="fsm" {...props} />}</AnimatePresence>, document.body);
}

function Panel({
  onClose,
  title,
  subtitle,
  headerRight,
  footer,
  closeIcon = 'close',
  closeLabel = 'Chiudi',
  escapeCloses = true,
  'aria-label': ariaLabel,
  initialFocus,
  className,
  contentClassName,
  light,
  children,
}: FullScreenModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reduce = useReducedMotion();
  const kb = useKeyboardInset();
  useFocusTrap(ref, true, escapeCloses ? onClose : undefined, initialFocus);

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="true"
      data-sheet-root
      aria-labelledby={typeof title === 'string' ? titleId : undefined}
      aria-label={ariaLabel}
      tabIndex={-1}
      className={cn('fixed inset-0 z-50 flex flex-col bg-bg text-ink outline-none', className)}
      initial={reduce ? { opacity: 0 } : { y: '100%', borderRadius: 28 }}
      animate={reduce ? { opacity: 1 } : { y: 0, borderRadius: 0 }}
      exit={reduce ? { opacity: 0 } : { y: '100%', borderRadius: 28 }}
      transition={{ type: 'spring', stiffness: 380, damping: 40, mass: 1 }}
      style={{ bottom: kb || undefined }}
    >
      {light !== false && <Floodlights intensity={0.35} pitch={false} {...light} />}
      <header className="relative flex shrink-0 items-center gap-2 px-3 pb-2 pt-[calc(var(--safe-top)+8px)]">
        <IconButton icon={closeIcon === 'down' ? ChevronDown : X} label={closeLabel} variant="tinted" onClick={onClose} />
        <div className="min-w-0 flex-1 px-1 text-center">
          {title && (
            <h2 id={titleId} className="t-headline truncate">
              {title}
            </h2>
          )}
          {subtitle && <div className="t-caption truncate text-ink-2">{subtitle}</div>}
        </div>
        <div className="flex min-w-11 items-center justify-end gap-1">{headerRight}</div>
      </header>
      <div className={cn('relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5', footer ? 'pb-4' : 'pb-[max(var(--safe-bottom),24px)]', contentClassName)}>
        {children}
      </div>
      {footer && <div className="glass relative shrink-0 border-t border-[var(--bar-line)] px-5 pb-[max(var(--safe-bottom),16px)] pt-3">{footer}</div>}
    </motion.div>
  );
}
