/**
 * Controllo segmentato con segmenti larghi quanto serve all'etichetta ("Preparazione" non si tronca
 * accanto a "Menù"), indicatore animato, contatore facoltativo e frecce da tastiera.
 * Variante del Segmented del design system per questa schermata.
 */
import { useId, useRef, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { haptic } from '../../lib/haptics';
import { cn } from '../../ui/cn';
import { spring } from '../../ui/motion';

export interface TabOption<T extends string> {
  value: T;
  label: string;
  /** Contatore a destra (es. prodotti da prendere). Nascosto se 0 o assente. */
  count?: number;
  /** Etichetta per i lettori di schermo del contatore. */
  countLabel?: string;
}

export interface TabSwitchProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (v: T) => void;
  'aria-label': string;
  /** Id del pannello controllato (per aria-controls). */
  panelId?: string;
}

export function TabSwitch<T extends string>({ options, value, onChange, 'aria-label': ariaLabel, panelId }: TabSwitchProps<T>) {
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
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      select(options[(i + 1) % options.length].value, true);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      select(options[(i - 1 + options.length) % options.length].value, true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      select(options[0].value, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      select(options[options.length - 1].value, true);
    }
  };

  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKey} className="relative flex h-11 w-full rounded-[13px] bg-ink-soft p-[3px]">
      {options.map((o, i) => {
        const active = o.value === value;
        const showCount = o.count !== undefined && o.count > 0;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${group}-${o.value}`}
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => select(o.value)}
            className={cn(
              'relative z-0 flex min-w-0 flex-auto items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-[0.9375rem] font-semibold transition-colors duration-200',
              active ? 'text-ink' : 'text-ink-2',
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-${group}`}
                className="absolute inset-0 -z-10 rounded-[10px] bg-[var(--seg-thumb)] shadow-[0_1px_2px_rgb(0_0_0/0.14),0_3px_10px_rgb(0_0_0/0.12)] ring-1 ring-[var(--bar-line)]"
                transition={spring}
              />
            )}
            <span className="whitespace-nowrap">{o.label}</span>
            {showCount && (
              <span
                className={cn(
                  't-mono min-w-[1.25rem] rounded-full px-1.5 text-center text-[0.6875rem] font-medium leading-5 transition-colors',
                  active ? 'bg-accent-soft text-accent-ink' : 'bg-ink-soft text-ink-2',
                )}
              >
                <span className="sr-only">{o.countLabel ? `, ${o.countLabel}: ` : ', '}</span>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
