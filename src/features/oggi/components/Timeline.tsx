import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Ellipsis, HeartPulse, Plus, Store } from 'lucide-react';
import type { DayType, HHMM, ItemStatus, MealSlot, Plan } from '../../../domain/types';
import { dayMinutes, type DayItem, type StatusSource } from '../../../engine/timeline';
import { cn, keepHyphens, spring, useLongPress } from '../../../ui';
import { opensDetail } from '../kinds';
import { StatusMark } from './StatusMark';

export interface TimelineProps {
  items: DayItem[];
  dayType: DayType;
  status: Record<string, ItemStatus>;
  notes: Record<string, string>;
  sourceOf: (item: DayItem) => StatusSource | null;
  /** Voce precedente al primo avvio: grigia, non conta. */
  isBeforeStart?: (item: DayItem) => boolean;
  /** Voce che non conta (appuntamento della giornata minima). */
  counts?: (item: DayItem) => boolean;
  now: HHMM;
  plan: Plan;
  /** Voce mostrata nella card "Adesso". */
  currentId?: string;
  overdueIds: Set<string>;
  /** Riga di configurazione che non conta (es. aggiungi gli esercizi del fisioterapista). */
  setupRow?: { time: HHMM; title: string; detail: string; onPress: () => void } | null;
  onToggle: (item: DayItem) => void;
  onBody: (item: DayItem) => void;
  onOptions: (item: DayItem) => void;
  onPlanB: (slot?: MealSlot) => void;
}

const STATUS_TEXT: Record<ItemStatus, string> = { fatto: 'fatto', sostituito: 'sostituito', saltato: 'saltato' };
/** Da quante voci già segnate in apertura di giornata si raccolgono in una riga. */
const COLLAPSE_FROM = 4;
/** Da quante voci precedenti al primo avvio si raccolgono in una riga. */
const BEFORE_COLLAPSE_FROM = 2;

type ItemEntry = { type: 'item'; item: DayItem; m: number };
type Entry = ItemEntry | { type: 'setup'; m: number } | { type: 'done'; items: DayItem[]; m: number } | { type: 'before'; items: DayItem[]; m: number };

/** Timeline della giornata: orario, cerchio da toccare, voce; la linea dell'ora attuale scorre tra le voci. */
export function Timeline({
  items,
  dayType,
  status,
  notes,
  sourceOf,
  isBeforeStart,
  counts,
  now,
  plan,
  currentId,
  overdueIds,
  setupRow,
  onToggle,
  onBody,
  onOptions,
  onPlanB,
}: TimelineProps) {
  const nowM = dayMinutes(now, plan);
  const itemEntries: ItemEntry[] = items.map((item) => ({ type: 'item' as const, item, m: dayMinutes(item.time, plan) }));
  const [expanded, setExpanded] = useState(false);
  const [showBefore, setShowBefore] = useState(false);
  const entries: Entry[] = [];
  let from = 0;
  // Primo giorno: le voci prima dell'inizio non contano, si raccolgono in una riga.
  let before = 0;
  while (before < itemEntries.length && isBeforeStart?.(itemEntries[before].item)) before++;
  if (!showBefore && before >= BEFORE_COLLAPSE_FROM) {
    entries.push({ type: 'before', items: itemEntries.slice(0, before).map((e) => e.item), m: itemEntries[0].m });
    from = before;
  }
  // Le voci già segnate all'inizio della giornata si raccolgono in una riga: resta in vista quello che manca.
  let run = from;
  while (run < itemEntries.length && status[itemEntries[run].item.id] && itemEntries[run].m <= nowM) run++;
  if (!expanded && run - from >= COLLAPSE_FROM) {
    entries.push({ type: 'done', items: itemEntries.slice(from, run).map((e) => e.item), m: itemEntries[from].m });
    from = run;
  }
  entries.push(...itemEntries.slice(from));
  if (setupRow) {
    const m = dayMinutes(setupRow.time, plan);
    const at = entries.findIndex((e) => e.type === 'item' && e.m > m);
    entries.splice(at === -1 ? entries.length : at, 0, { type: 'setup', m });
  }
  let nowIndex = entries.findIndex((e) => (e.type === 'item' || e.type === 'setup') && e.m > nowM);
  if (nowIndex === -1) nowIndex = entries.length;
  // Le righe raccolte stanno sempre prima della linea dell'ora.
  while (nowIndex < entries.length && (entries[nowIndex].type === 'before' || entries[nowIndex].type === 'done')) nowIndex++;
  const firstMount = useRef(true);
  useEffect(() => {
    firstMount.current = false;
  }, []);

  return (
    <ol className="relative py-2" aria-label="Voci della giornata">
      {entries.map((e, i) => {
        const first = i === 0 && nowIndex !== 0;
        const last = i === entries.length - 1 && nowIndex !== entries.length;
        const key = e.type === 'item' ? e.item.id : e.type;
        return (
          <Fragment key={key}>
            {i === nowIndex && <NowLine now={now} first={i === 0} />}
            {e.type === 'before' ? (
              <BeforeRun items={e.items} first={first} last={last} onExpand={() => setShowBefore(true)} />
            ) : e.type === 'done' ? (
              <DoneRun items={e.items} dayType={dayType} status={status} first={first} last={last} onExpand={() => setExpanded(true)} />
            ) : e.type === 'setup' && setupRow ? (
              <SetupRow {...setupRow} first={first} last={last} />
            ) : e.type === 'item' ? (
              <TimelineRow
                item={e.item}
                dayType={dayType}
                status={status[e.item.id]}
                note={notes[e.item.id]}
                source={sourceOf(e.item)}
                current={e.item.id === currentId}
                overdue={overdueIds.has(e.item.id)}
                muted={Boolean(isBeforeStart?.(e.item))}
                appointment={counts ? !counts(e.item) && e.item.kind !== 'letto' && !isBeforeStart?.(e.item) : false}
                first={first}
                last={last}
                onToggle={onToggle}
                onBody={onBody}
                onOptions={onOptions}
                onPlanB={onPlanB}
                animateIn={firstMount.current}
                index={i}
              />
            ) : null}
          </Fragment>
        );
      })}
      {nowIndex === entries.length && entries.length > 0 && <NowLine now={now} last />}
    </ol>
  );
}

/** Voci già segnate raccolte in una riga, con un segno per ciascuna. */
function DoneRun({
  items,
  dayType,
  status,
  first,
  last,
  onExpand,
}: {
  items: DayItem[];
  dayType: DayType;
  status: Record<string, ItemStatus>;
  first: boolean;
  last: boolean;
  onExpand: () => void;
}) {
  const done = items.filter((i) => status[i.id] === 'fatto').length;
  const other = items.length - done;
  return (
    <li className="relative flex items-stretch">
      <span aria-hidden className="w-[46px] shrink-0 pr-1 pt-[17px] text-right leading-[12px]">
        <span className="t-mono text-[0.75rem] leading-[12px] text-ink-3">{items[0].time}</span>
      </span>
      <Rail first={first} last={last}>
        <span aria-hidden className="relative mt-[8px] grid size-[30px] place-items-center rounded-full bg-good text-[var(--on-good)]">
          <span className="t-num text-[0.9375rem] leading-none">{items.length}</span>
        </span>
      </Rail>
      <span className="flex min-w-0 flex-1 flex-col pb-1 pr-3">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          className="flex min-h-12 w-full items-start gap-2 rounded-[14px] py-[11px] pl-1.5 pr-1 text-left transition-colors duration-150 active:bg-ink-soft"
        >
          <span className="min-w-0 flex-1">
            <span className="t-callout block font-semibold leading-snug text-ink-2">{items.length} voci già segnate</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1" aria-hidden>
              {items.map((it) => (
                <StatusMark key={it.id} item={it} dayType={dayType} status={status[it.id]} size={16} />
              ))}
            </span>
            <span className="sr-only">{`Fino alle ${items[items.length - 1].time}: ${done} fatte${other ? `, ${other} sostituite o saltate` : ''}. Mostra`}</span>
          </span>
          <ChevronDown size={18} strokeWidth={2.5} aria-hidden className="mt-0.5 shrink-0 text-accent-ink" />
        </button>
      </span>
    </li>
  );
}

/** Voci precedenti al primo avvio raccolte in una riga: non contano, si possono comunque mostrare. */
function BeforeRun({ items, first, last, onExpand }: { items: DayItem[]; first: boolean; last: boolean; onExpand: () => void }) {
  return (
    <li className="relative flex items-stretch">
      <span aria-hidden className="w-[46px] shrink-0 pr-1 pt-[17px] text-right leading-[12px]">
        <span className="t-mono text-[0.75rem] leading-[12px] text-ink-3">{items[0].time}</span>
      </span>
      <Rail first={first} last={last}>
        <span aria-hidden className="relative mt-[8px] grid size-[30px] place-items-center rounded-full border-[1.5px] border-dashed border-line-strong text-ink-3">
          <span className="t-num text-[0.9375rem] leading-none">{items.length}</span>
        </span>
      </Rail>
      <span className="flex min-w-0 flex-1 flex-col pb-1 pr-3">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          className="flex min-h-12 w-full items-start gap-2 rounded-[14px] py-[11px] pl-1.5 pr-1 text-left transition-colors duration-150 active:bg-ink-soft"
        >
          <span className="min-w-0 flex-1">
            <span className="t-callout block font-semibold leading-snug text-ink-2">{items.length} voci prima del tuo inizio</span>
            <span className="t-footnote mt-0.5 block text-ink-3">Non contano nella giornata</span>
            <span className="sr-only">Mostra</span>
          </span>
          <ChevronDown size={18} strokeWidth={2.5} aria-hidden className="mt-0.5 shrink-0 text-accent-ink" />
        </button>
      </span>
    </li>
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
        <span className="relative size-[9px] rounded-full bg-accent shadow-[0_0_0_3px_var(--bg-elev),0_0_12px_var(--accent-glow)]" />
      </span>
      <span className="mr-4 h-px flex-1" style={{ background: 'linear-gradient(90deg, var(--accent), transparent)' }} />
    </li>
  );
}

function Rail({ first, last, children }: { first: boolean; last: boolean; children: ReactNode }) {
  return (
    <span className="relative flex w-11 shrink-0 justify-center">
      {!first && <span aria-hidden className="absolute left-1/2 top-0 h-[8px] w-px -translate-x-1/2 bg-line" />}
      {!last && <span aria-hidden className="absolute bottom-0 left-1/2 top-[42px] w-px -translate-x-1/2 bg-line" />}
      {children}
    </span>
  );
}

/** Riga di configurazione: non conta, apre l'editor. */
function SetupRow({ time, title, detail, onPress, first, last }: { time: HHMM; title: string; detail: string; onPress: () => void; first: boolean; last: boolean }) {
  return (
    <li className="relative flex items-stretch">
      <span aria-hidden className="w-[46px] shrink-0 pr-1 pt-[17px] text-right leading-[12px]">
        <span className="t-mono text-[0.75rem] leading-[12px] text-ink-3">{time}</span>
      </span>
      <Rail first={first} last={last}>
        <span aria-hidden className="relative mt-[8px] grid size-[30px] place-items-center rounded-full border-[1.5px] border-dashed border-line-strong text-ink-3">
          <HeartPulse size={15} strokeWidth={2.2} />
        </span>
      </Rail>
      <span className="flex min-w-0 flex-1 flex-col pb-1 pr-3">
        <button
          type="button"
          onClick={onPress}
          aria-haspopup="dialog"
          className="flex min-h-12 w-full items-start gap-2 rounded-[14px] py-[11px] pl-1.5 pr-1 text-left transition-colors duration-150 active:bg-ink-soft"
        >
          <span className="min-w-0 flex-1">
            <span className="t-callout flex items-center gap-1.5 font-semibold text-accent-ink">
              <Plus size={15} strokeWidth={2.6} aria-hidden />
              {title}
            </span>
            <span className="t-footnote mt-0.5 block text-ink-3">{detail}</span>
          </span>
        </button>
      </span>
    </li>
  );
}

interface RowProps {
  item: DayItem;
  dayType: DayType;
  status?: ItemStatus;
  note?: string;
  source: StatusSource | null;
  current: boolean;
  overdue: boolean;
  muted: boolean;
  appointment: boolean;
  first: boolean;
  last: boolean;
  animateIn: boolean;
  index: number;
  onToggle: (item: DayItem) => void;
  onBody: (item: DayItem) => void;
  onOptions: (item: DayItem) => void;
  onPlanB: (slot?: MealSlot) => void;
}

function TimelineRow({
  item,
  dayType,
  status,
  note,
  source,
  current,
  overdue,
  muted,
  appointment,
  first,
  last,
  animateIn,
  index,
  onToggle,
  onBody,
  onOptions,
  onPlanB,
}: RowProps) {
  const reduce = useReducedMotion();
  const lp = useLongPress(() => onOptions(item), { onPress: () => onBody(item) });
  const opens = opensDetail(item);
  // Piano B al bar sotto il pasto di adesso o rimasto indietro (cena esclusa): per gli altri è nelle opzioni.
  const showPlanB = item.kind === 'pasto' && !status && !muted && item.slot !== 'cena' && (current || overdue);

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
      : status || muted
        ? 'text-ink-2'
        : 'text-ink';
  const detailCls = status || muted ? 'text-ink-3' : 'text-ink-2';
  const toggleLabel = status
    ? source === 'registro'
      ? `${item.title}: ${STATUS_TEXT[status]}. Apri le opzioni`
      : `${item.title}: ${STATUS_TEXT[status]}. Tocca per annullare`
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

      {/* Orario: già nell'etichetta della voce, nascosto ai lettori di schermo. */}
      <span aria-hidden className="w-[46px] shrink-0 pr-1 pt-[17px] text-right leading-[12px]">
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
      <Rail first={first} last={last}>
        {muted ? (
          <span className="relative mt-[8px]">
            <StatusMark item={item} dayType={dayType} status={status} size={30} muted />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onToggle(item)}
            aria-label={toggleLabel}
            aria-pressed={status === 'fatto'}
            className="hit-44 relative mt-[6px] grid size-[34px] place-items-center rounded-full transition-transform duration-150 active:scale-90"
          >
            <StatusMark item={item} dayType={dayType} status={status} size={30} current={current} />
          </button>
        )}
      </Rail>

      {/* Voce */}
      <span className="flex min-w-0 flex-1 flex-col pb-1">
        <button
          type="button"
          {...lp}
          aria-label={`${item.time}, ${item.title}${item.detail ? `, ${item.detail}` : ''}`}
          aria-haspopup={opens ? 'dialog' : undefined}
          className="flex min-h-12 w-full items-start gap-2 rounded-[14px] py-[11px] pl-1.5 pr-1 text-left transition-colors duration-150 active:bg-ink-soft"
        >
          <span className="min-w-0 flex-1">
            <span className={cn('t-callout block font-semibold leading-snug transition-colors duration-200', titleCls)}>{item.title}</span>
            {item.detail && (
              <span className={cn('t-footnote mt-0.5 transition-colors duration-200', current ? 'line-clamp-2' : 'line-clamp-1', detailCls)}>{keepHyphens(item.detail)}</span>
            )}
            {status === 'sostituito' && (
              <span className="t-footnote mt-1 block text-warn-ink">{note ? (item.kind === 'pasto' ? `Al posto: ${note}` : note) : 'Sostituito'}</span>
            )}
            {status === 'fatto' && note && isNightNote(item) && <span className="t-footnote mt-1 block text-ink-3">{note}</span>}
            {status === 'saltato' && <span className="t-caption mt-1 block font-medium text-ink-3">{note ? `Saltato: ${note}` : 'Saltato'}</span>}
            {!status && muted && <span className="t-caption mt-1 block font-medium text-ink-3">Prima dell’inizio</span>}
            {!status && appointment && <span className="t-caption mt-1 block font-medium text-ink-3">Non conta oggi, segna minuti e fatica</span>}
            {!status && overdue && <span className="t-caption mt-1 block font-medium text-warn-ink">Da segnare</span>}
          </span>
        </button>
        {showPlanB && (
          <button
            type="button"
            onClick={() => onPlanB(item.slot)}
            className="t-footnote -mt-1.5 mb-2 ml-1.5 inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-control px-3.5 font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--control-line)] transition-transform duration-150 active:scale-95"
          >
            <Store size={14} strokeWidth={2.4} aria-hidden className="text-accent-ink" />
            Piano B al bar
          </button>
        )}
      </span>

      {/* Opzioni, sulla riga del titolo */}
      <span className="flex w-11 shrink-0 justify-center pr-1">
        <button
          type="button"
          onClick={() => onOptions(item)}
          aria-label={`Opzioni: ${item.title}`}
          aria-haspopup="dialog"
          className={cn(
            'hit-44 mt-[7px] grid size-8 place-items-center rounded-full text-ink-3 transition-colors duration-150 hover:text-ink-2 active:bg-ink-soft',
            (status || muted) && 'opacity-60',
          )}
        >
          <Ellipsis size={19} strokeWidth={2.2} aria-hidden />
        </button>
      </span>
    </motion.li>
  );
}

/** Le voci della notte mostrano l'orario vero registrato dal rito della sera. */
function isNightNote(item: DayItem): boolean {
  return item.kind === 'coprifuoco' || item.id === 'minima:telefono';
}
