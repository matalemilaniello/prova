import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { useFocusTrap } from './useFocusTrap';
import { useKeyboardInset } from './useKeyboardInset';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Riga sotto il titolo (testo secondario). */
  subtitle?: ReactNode;
  /** Piede fisso in basso (pulsanti), con la safe area. */
  footer?: ReactNode;
  /** Azione a destra del titolo, prima della chiusura. */
  headerAction?: ReactNode;
  /** auto: alto quanto il contenuto · large: quasi tutto lo schermo · full: tutto lo schermo sotto la barra di stato. */
  size?: 'auto' | 'large' | 'full';
  /** Se false niente chiusura con trascinamento, sfondo o Esc (default true). */
  dismissible?: boolean;
  /** Mostra la X di chiusura (default true). */
  showClose?: boolean;
  /** Etichetta del dialogo se il titolo non è testo. */
  'aria-label'?: string;
  /** Elemento che riceve il focus all'apertura (altrimenti [data-autofocus] o il foglio). */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
}

/**
 * Foglio dal basso in stile iOS: maniglia, trascina in giù per chiudere, sfondo oscurato,
 * titolo, piede fisso, focus intrappolato, Esc per chiudere. Si anima anche quando il componente
 * che lo contiene viene smontato da un AnimatePresence (es. OverlayHost).
 */
export function Sheet(props: SheetProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(<AnimatePresence propagate>{props.open && <SheetPanel key="sheet" {...props} />}</AnimatePresence>, document.body);
}

function SheetPanel({
  onClose,
  title,
  subtitle,
  footer,
  headerAction,
  size = 'auto',
  dismissible = true,
  showClose = true,
  'aria-label': ariaLabel,
  initialFocus,
  className,
  contentClassName,
  children,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const controls = useDragControls();
  const reduce = useReducedMotion();
  const kb = useKeyboardInset();
  useFocusTrap(panelRef, true, dismissible ? onClose : undefined, initialFocus);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (!dismissible) return;
    const h = panelRef.current?.offsetHeight ?? 600;
    if (info.offset.y > Math.min(140, h * 0.28) || info.velocity.y > 650) {
      haptic('light');
      onClose();
    }
  };

  const startDrag = (e: React.PointerEvent) => {
    if (!dismissible) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select, textarea, [data-no-drag]')) return;
    controls.start(e);
  };

  const height =
    size === 'full'
      ? 'h-[calc(100dvh-var(--safe-top)-8px)]'
      : size === 'large'
        ? 'h-[calc(100dvh-var(--safe-top)-40px)]'
        : 'max-h-[calc(100dvh-var(--safe-top)-24px)]';

  return (
    <div className="fixed inset-0 z-[60]" data-sheet-root>
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={dismissible ? onClose : undefined}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title && typeof title === 'string' ? titleId : undefined}
        aria-label={ariaLabel ?? (typeof title === 'string' ? undefined : 'Pannello')}
        tabIndex={-1}
        className={cn(
          'absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-[640px] flex-col overflow-hidden rounded-t-[28px] bg-sheet text-ink shadow-sheet outline-none',
          'border-t border-[var(--bar-line)]',
          height,
          className,
        )}
        initial={reduce ? { opacity: 0 } : { y: '100%' }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        exit={reduce ? { opacity: 0 } : { y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 40, mass: 0.9 }}
        style={kb ? { bottom: kb, maxHeight: `calc(100dvh - var(--safe-top) - 16px - ${kb}px)` } : undefined}
        drag={dismissible && !reduce ? 'y' : false}
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.9 }}
        onDragEnd={onDragEnd}
      >
        <div className="shrink-0 touch-none select-none" onPointerDown={startDrag}>
          <div className="flex justify-center pb-1 pt-2.5" aria-hidden>
            <span className="h-[5px] w-10 rounded-full bg-ink-3/50" />
          </div>
          {(title || showClose || headerAction) && (
            <div className="flex items-start gap-3 px-5 pb-3 pt-1.5">
              <div className="min-w-0 flex-1 pt-1">
                {title && (
                  <h2 id={titleId} className="t-title-2 text-ink">
                    {title}
                  </h2>
                )}
                {subtitle && <div className="t-footnote mt-1 text-ink-2">{subtitle}</div>}
              </div>
              {headerAction}
              {showClose && <IconButton icon={X} label="Chiudi" size="sm" variant="tinted" onClick={onClose} />}
            </div>
          )}
        </div>
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5',
            footer ? 'pb-4' : 'pb-[max(var(--safe-bottom),20px)]',
            contentClassName,
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-line bg-sheet px-5 pb-[max(var(--safe-bottom),16px)] pt-3">{footer}</div>
        )}
      </motion.div>
    </div>
  );
}
