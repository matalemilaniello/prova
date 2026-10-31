import { Fragment, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronRight, Ellipsis, Store } from 'lucide-react';
import type { HHMM, ItemStatus, MealSlot, Plan, TimelineItem } from '../../../domain/types';
import { dayMinutes, type StatusSource } from '../../../engine/timeline';
import { cn, keepHyphens, spring, useLongPress } from '../../../ui';
import { opensDetail } from '../kinds';
import { StatusMark } from './StatusMark';

export interface TimelineProps {
  items: TimelineItem[];
  status: Record<string, ItemStatus>;
  notes: Record<string, string>;
  sourceOf: (item: TimelineItem) => StatusSource | null;
  now: HHMM;
  plan: Plan;
  /** Voce mostrata nella card "Adesso". */
  currentId?: string;
  overdueIds: Set<string>;
  onToggle: (item: TimelineItem) => void;
  onBody: (item: TimelineItem) => void;
  onOptions: (item: TimelineItem) => void;
  onPlanB: (slot?: MealSlot) => void;
}

const STATUS_TEXT: Record<ItemStatus, string> = { fatto: 'fatto', sostituito: 'sostituito', saltato: 'saltato' };

/** Timeline della giornata: orario, cerchio da toccare, voce; la linea dell'ora attuale scorre tra le voci. */
export function Timeline({ items, status, notes, sourceOf, now, plan, currentId, overdueIds, onToggle, onBody, onOptions, onPlanB }: TimelineProps) {
  const nowM = dayMinutes(now, plan);
  let nowIndex = items.findIndex((it) => dayMinutes(it.time, plan) > nowM);
  if (nowIndex === -1) nowIndex = items.length;
  const firstMount = useRef(true);
  useEffect(() => {
    firstMount.current = false;
  }, []);

  return (
    <ol className="relative py-2" aria-label="Voci della giornata">
      {items.map((item, i) => (
        <Fragment key={item.id}>
          {i === nowIndex && <NowLine now={now} first={i === 0} />}
          <TimelineRow
            item={item}
            status={status[item.id]}
            note={notes[item.id]}
            source={sourceOf(item)}
            current={item.id === currentId}
            overdue={overdueIds.has(item.id)}
            first={i === 0 && nowIndex !== 0}
            last={i === items.length - 1 && nowIndex !== items.length}
            onToggle={onToggle}
            onBody={onBody}
            onOptions={onOptions}
            onPlanB={onPlanB}
            animateIn={firstMount.current}
            index={i}
          />
        </Fragment>
      ))}
      {nowIndex === items.length && items.length > 0 && <NowLine now={now} last />}
    </ol>
  );
}

/** Linea dell'ora attuale, come nel Calendario. */
function NowLine({ now, first, last }: { now: HHMM; first?: boolean; last?: boolean }) {
  return (
    <li aria-hidden className="relative flex h-5 items-center">
      <span className="w-[46px] shrink-0 pr-1 text-right">
        <span className="t-mono text-[0.6875rem] font-semibold text-accent-ink">{now}</span>
      </span>
      <span className="relative flex h-full w-11 shrink-0 items-center justify-center">
        <span className={cn('absolute left-1/2 w-px -translate-x-1/2 bg-line', first ? 'top-1/2 bottom-0' : last ? 'top-0 bottom-1/2' : 'inset-y-0')} />
        <span className="relative size-[9px] rounded-full bg-accent shadow-[0_0_0_3px_var(--accent-soft),0_0_12px_var(--accent-glow)]" />
      </span>
      <span className="mr-4 h-px flex-1" style={{ background: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 10%, transparent))' }} />
    </li>
  );
}

interface RowProps {
  item: TimelineItem;
  status?: ItemStatus;
  note?: string;
  source: StatusSource | null;
  current: boolean;
  overdue: boolean;
  first: boolean;
  last: boolean;
  animateIn: boolean;
  index: number;
  onToggle: (item: TimelineItem) => void;
  onBody: (item: TimelineItem) => void;
  onOptions: (item: TimelineItem) => void;
  onPlanB: (slot?: MealSlot) => void;
}

function TimelineRow({ item, status, note, source, current, overdue, first, last, animateIn, index, onToggle, onBody, onOptions, onPlanB }: RowProps) {
  const reduce = useReducedMotion();
  const lp = useLongPress(() => onOptions(item), { onPress: () => onBody(item) });
  const opens = opensDetail(item);
  const showPlanB = item.kind === 'pasto' && item.slot === 'spuntino' && !status;

  // Lampo verde quando la voce diventa "fatto".
  const prev = useRef(status);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (status === 'fatto' && prev.current !== 'fatto') setFlash((n) => n + 1);
    prev.current = status;
  }, [status]);

  const titleCls =
    status === 'saltato'
      ? 'text-ink-3 line-through decoration-[color-mix(in_srgb,var(--ink-3)_60%,transparent)]'
      : status
        ? 'text-ink-2'
        : 'text-ink';
  const detailCls = status ? 'text-ink-3' : 'text-ink-2';
  const statusText = status ? STATUS_TEXT[status] : overdue ? 'da segnare' : 'da fare';
  const toggleLabel = status
    ? source === 'registro'
      ? `${item.title}: ${statusText}. Apri le opzioni`
      : `${item.title}: ${statusText}. Tocca per tornare da fare`
    : `Segna fatto: ${item.title}`;

  return (
    <motion.li
      id={`voce-${item.id}`}
      className="relative flex scroll-mt-24 items-stretch"
      initial={animateIn && !reduce ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: animateIn ? Math.min(index * 0.022, 0.22) : 0 }}
    >
      {flash > 0 && !reduce && (
        <motion.span
          key={flash}
          aria-hidden
          className="pointer-events-none absolute inset-x-2 inset-y-0.5 rounded-[14px] bg-good-soft"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      )}

      {/* Orario */}
      <span className="w-[46px] shrink-0 pr-1 pt-[19px] text-right leading-[12px]">
        <span
          className={cn(
            't-mono text-[0.75rem] leading-[12px]',
            current && !status ? 'font-semibold text-accent-ink' : overdue ? 'text-warn-ink' : 'text-ink-3',
          )}
        >
          {item.time}
        </span>
      </span>

      {/* Binario con il cerchio da toccare */}
      <span className="relative flex w-11 shrink-0 justify-center">
        {!first && <span aria-hidden className="absolute left-1/2 top-0 h-[10px] w-px -translate-x-1/2 bg-line" />}
        {!last && <span aria-hidden className="absolute bottom-0 left-1/2 top-[44px] w-px -translate-x-1/2 bg-line" />}
        <button
          type="button"
          onClick={() => onToggle(item)}
          aria-label={toggleLabel}
          aria-pressed={status === 'fatto'}
          className="hit-44 relative mt-[8px] grid size-[34px] place-items-center rounded-full transition-transform duration-150 active:scale-90"
        >
          <StatusMark item={item} status={status} size={30} current={current} />
        </button>
      </span>

      {/* Voce */}
      <span className="flex min-w-0 flex-1 flex-col pb-1.5">
        <button
          type="button"
          {...lp}
          aria-label={`${item.time}, ${item.title}${item.detail ? `, ${item.detail}` : ''}, ${statusText}`}
          aria-haspopup={opens ? 'dialog' : undefined}
          className="flex min-h-[52px] w-full items-start gap-2 rounded-[14px] py-[13px] pl-1.5 pr-1 text-left transition-colors duration-150 active:bg-ink-soft"
        >
          <span className="min-w-0 flex-1">
            <span className={cn('t-callout block font-semibold leading-snug transition-colors duration-200', titleCls)}>{item.title}</span>
            {item.detail && <span className={cn('t-footnote mt-0.5 line-clamp-2 block transition-colors duration-200', detailCls)}>{keepHyphens(item.detail)}</span>}
            {status === 'sostituito' && (
              <span className="t-footnote mt-1 block text-warn-ink">{note ? (item.kind === 'pasto' ? `Al posto: ${note}` : note) : 'Sostituito'}</span>
            )}
            {status === 'saltato' && <span className="t-caption mt-1 block font-medium text-ink-3">Saltato</span>}
            {!status && overdue && <span className="t-caption mt-1 block font-medium text-warn-ink">Da segnare</span>}
          </span>
          {opens && <ChevronRight aria-hidden size={16} strokeWidth={2.4} className="mt-[2px] shrink-0 text-ink-3 opacity-70" />}
        </button>
        {showPlanB && (
          <button
            type="button"
            onClick={() => onPlanB(item.slot)}
            className="t-footnote -mt-1.5 mb-2 inline-flex h-8 w-fit items-center gap-1.5 rounded-full bg-control px-3 font-semibold text-accent-ink shadow-[inset_0_0_0_1px_var(--control-line)] transition-transform duration-150 active:scale-95"
          >
            <Store size={14} strokeWidth={2.4} aria-hidden />
            Piano B bar
          </button>
        )}
      </span>

      {/* Opzioni */}
      <span className="flex w-11 shrink-0 justify-center pr-1">
        <button
          type="button"
          onClick={() => onOptions(item)}
          aria-label={`Opzioni: ${item.title}`}
          aria-haspopup="dialog"
          className="hit-44 mt-[11px] grid size-8 place-items-center rounded-full text-ink-3 transition-colors duration-150 hover:text-ink-2 active:bg-ink-soft"
        >
          <Ellipsis size={19} strokeWidth={2.2} aria-hidden />
        </button>
      </span>
    </motion.li>
  );
}
