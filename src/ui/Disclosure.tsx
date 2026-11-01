import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { renderIcon, type IconLike } from './icon';

export interface DisclosureProps {
  /** Testo del comando: il titolo della riga ('row') o la parola del collegamento ('inline', es. "Perché"). */
  title: ReactNode;
  /** A destra del titolo quando è chiuso (riga): un riassunto breve, es. "3 voci" o "2.450 kcal". */
  summary?: ReactNode;
  /** Icona a sinistra del titolo (solo 'row'). */
  icon?: IconLike;
  /**
   * 'row' (default): riga a tutta larghezza, alta almeno 44 px, da mettere in una Card o da sola.
   * 'inline': collegamento piccolo color luce con la freccia ("Perché", "Come si calcola"), il testo sotto.
   */
  variant?: 'row' | 'inline';
  /** Aperto all'inizio (non controllato). Di base chiuso: le spiegazioni stanno dietro un tocco. */
  defaultOpen?: boolean;
  /** Controllato: stato aperto. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  /** Classi del contenuto (default: testo secondario, 8 px sopra). */
  contentClassName?: string;
  children: ReactNode;
}

/**
 * Spiegazione o elenco dietro un tocco: il comando dice cosa c'è, il contenuto si apre sotto con un'animazione
 * di altezza (istantanea con la riduzione del movimento). Pulsante con `aria-expanded` e `aria-controls`; il
 * contenuto chiuso non è nel DOM, quindi non lo legge VoiceOver e non riceve il focus.
 */
export function Disclosure({
  title,
  summary,
  icon,
  variant = 'row',
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  className,
  contentClassName,
  children,
}: DisclosureProps) {
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const reduce = useReducedMotion();
  const id = useId();
  const toggle = () => {
    haptic('selection');
    const next = !open;
    if (openProp === undefined) setInner(next);
    onOpenChange?.(next);
  };
  const chevron = (size: number) => (
    <motion.span
      aria-hidden
      className="inline-flex shrink-0"
      animate={{ rotate: open ? 180 : 0 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
    >
      <ChevronDown size={size} strokeWidth={2.4} />
    </motion.span>
  );

  return (
    <div className={cn('flex flex-col', className)}>
      {variant === 'inline' ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
          className="hit-44 -mx-1 inline-flex items-center gap-1 self-start rounded-[8px] px-1 text-[0.9375rem] font-semibold text-accent-ink"
        >
          {title}
          {chevron(16)}
        </button>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
          className="flex min-h-11 w-full items-center gap-3 rounded-[12px] text-left"
        >
          {icon && <span className="inline-flex shrink-0 text-ink-2">{renderIcon(icon, 18, 2.2)}</span>}
          <span className="t-headline min-w-0 flex-1 text-ink">{title}</span>
          {summary !== undefined && summary !== null && !open && (
            <span className="t-callout shrink-0 tabular text-ink-3">{summary}</span>
          )}
          <span className="inline-flex items-center text-ink-3">{chevron(18)}</span>
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { height: { type: 'spring', stiffness: 380, damping: 36 }, opacity: { duration: 0.18 } }}
            className="overflow-hidden"
          >
            <div className={cn(variant === 'inline' ? 't-footnote pt-1.5 text-pretty text-ink-2' : 'pb-3 pt-1 text-ink-2', contentClassName)}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
