import { useId, useRef, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { renderIcon, type IconLike } from './icon';
import { spring } from './motion';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconLike;
  /** Numero piccolo a destra dell'etichetta (es. voci da fare). */
  badge?: number;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Etichetta del gruppo per i lettori di schermo. */
  'aria-label': string;
  size?: 'sm' | 'md';
  /** Occupa tutta la larghezza con segmenti uguali (default true). */
  fullWidth?: boolean;
  className?: string;
}

/** Controllo segmentato iOS con indicatore animato. Frecce sinistra e destra per cambiare. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  size = 'md',
  fullWidth = true,
  className,
}: SegmentedProps<T>) {
  const group = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (v: T, focus = false) => {
    if (v === value) return;
    haptic('selection');
    onChange(v);
    if (focus) refs.current[options.findIndex((o) => o.value === v)]?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      select(options[(i + 1) % options.length].value, true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      select(options[(i - 1 + options.length) % options.length].value, true);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      className={cn(
        'relative flex rounded-[13px] bg-ink-soft p-[3px]',
        size === 'sm' ? 'h-9' : 'h-11',
        fullWidth ? 'w-full' : 'inline-flex',
        className,
      )}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => select(o.value)}
            className={cn(
              'relative z-0 flex min-w-0 items-center justify-center gap-1.5 rounded-[10px] px-3 font-semibold transition-colors duration-200',
              // Piccolo nell'aspetto, ma l'area toccabile resta di 44 px.
              size === 'sm' && 'hit-44',
              size === 'sm' ? 'text-[0.8125rem]' : 'text-[0.9375rem]',
              fullWidth && 'flex-1',
              active ? 'text-ink' : 'text-ink-2',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                className="absolute inset-0 -z-10 rounded-[10px] bg-[var(--seg-thumb)] shadow-[0_1px_2px_rgb(0_0_0/0.14),0_3px_10px_rgb(0_0_0/0.12)] ring-1 ring-[var(--bar-line)]"
                transition={spring}
              />
            )}
            {renderIcon(o.icon, size === 'sm' ? 14 : 16, 2.2)}
            <span className="truncate">{o.label}</span>
            {o.badge !== undefined && o.badge > 0 && (
              <span className="t-mono min-w-5 rounded-full bg-accent-soft px-1.5 text-center text-[0.6875rem] font-medium leading-5 text-accent-ink">
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
