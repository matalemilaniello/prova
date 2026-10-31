import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeftRight, Minus } from 'lucide-react';
import type { ItemStatus, TimelineItem } from '../../../domain/types';
import { cn, springSnappy, toneColor, toneInk, toneSoft } from '../../../ui';
import { itemIcon, itemTone } from '../kinds';

export interface StatusMarkProps {
  item: TimelineItem;
  status?: ItemStatus;
  /** Diametro in px (default 30). */
  size?: number;
  /** Voce attuale: anello luminoso del suo colore. */
  current?: boolean;
  className?: string;
}

/**
 * Cerchio della voce: icona del tipo quando è da fare, spunta verde quando è fatta,
 * frecce ambra quando è sostituita, trattino quando è saltata. La spunta si disegna.
 */
export function StatusMark({ item, status, size = 30, current, className }: StatusMarkProps) {
  const reduce = useReducedMotion();
  const tone = itemTone(item);
  const Icon = itemIcon(item);
  const icon = Math.round(size * 0.53);

  const bg =
    status === 'fatto'
      ? 'var(--good)'
      : status === 'sostituito'
        ? 'var(--warn)'
        : status === 'saltato'
          ? 'transparent'
          : toneSoft(tone, 17);

  return (
    <span
      aria-hidden
      className={cn('relative grid shrink-0 place-items-center rounded-full', className)}
      style={{ width: size, height: size }}
    >
      {current && !status && (
        <span
          className="absolute -inset-[3px] rounded-full"
          style={{
            boxShadow: `0 0 0 1.5px ${toneColor(tone)}, 0 0 14px 1px color-mix(in srgb, ${toneColor(tone)} 45%, transparent)`,
          }}
        />
      )}
      <motion.span
        className="absolute inset-0 rounded-full"
        initial={false}
        animate={{ backgroundColor: bg, scale: status === 'fatto' && !reduce ? [1, 1.16, 1] : 1 }}
        transition={{ backgroundColor: { duration: 0.18 }, scale: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
        style={status === 'saltato' ? { boxShadow: 'inset 0 0 0 1.5px var(--line-strong)' } : undefined}
      />
      <AnimatePresence initial={false} mode="popLayout">
        {status === 'fatto' ? (
          <motion.svg
            key="fatto"
            viewBox="0 0 24 24"
            width={icon + 2}
            height={icon + 2}
            className="relative"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={springSnappy}
          >
            <motion.path
              d="M5 12.6l4.3 4.3L19 7.4"
              fill="none"
              stroke="var(--on-good)"
              strokeWidth={3.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: 0.04 }}
            />
          </motion.svg>
        ) : status === 'sostituito' ? (
          <motion.span key="sost" className="relative" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={springSnappy}>
            <ArrowLeftRight size={icon} strokeWidth={2.6} style={{ color: 'var(--on-warn)' }} />
          </motion.span>
        ) : status === 'saltato' ? (
          <motion.span key="salt" className="relative text-ink-3" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={springSnappy}>
            <Minus size={icon} strokeWidth={2.6} />
          </motion.span>
        ) : (
          <motion.span key="todo" className="relative" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={springSnappy}>
            <Icon size={icon} strokeWidth={2.2} style={{ color: toneInk(tone) }} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
