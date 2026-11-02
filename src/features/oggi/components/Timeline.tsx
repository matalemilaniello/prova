import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Ellipsis, Store } from 'lucide-react';
import type { DayType, HHMM, ItemStatus, MealSlot, Plan } from '../../../domain/types';
import { dayMinutes, type DayItem, type StatusSource } from '../../../engine/timeline';
import { listIt } from '../../../lib/format';
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
/**
 * Le voci oltre queste ore da adesso si raccolgono: in fondo alla giornata in una riga "Più tardi" (se sono almeno
 * `LATER_COLLAPSE_FROM`), prima di un appuntamento (calcio, palestra, revisione, che non si nasconde mai) in una riga
 * con i loro nomi (se sono almeno `GAP_COLLAPSE_FROM`). In vista restano le prossime ore e gli appuntamenti.
 */
const LATER_WINDOW_MIN = 5 * 60;
const LATER_COLLAPSE_FROM = 3;
const GAP_COLLAPSE_FROM = 2;
/** Gli appuntamenti della giornata: mai raccolti in una riga. */
const ALWAYS_SHOWN = new Set<DayItem['kind']>(['calcio', 'palestra', 'revisione']);

type ItemEntry = { type: 'item'; item: DayItem; m: number };
type Entry =
  | ItemEntry
  | { type: 'done'; items: DayItem[]; m: number }
  | { type: 'before'; items: DayItem[]; m: number }
  | { type: 'later'; items: DayItem[]; m: number; key: string; gap: boolean };

/**
 * Timeline della giornata: orario, cerchio da toccare, voce; la linea dell'ora attuale scorre tra le voci. Le voci
 * già segnate in apertura e quelle oltre le prossime 5 ore si raccolgono in una riga ciascuna.
 */
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
  onToggle,
  onBody,
  onOptions,
  onPlanB,
}: TimelineProps) {
  const nowM = dayMinutes(now, plan);
  const itemEntries: ItemEntry[] = items.map((item) => ({ type: 'item' as const, item, m: dayMinutes(item.time, plan) }));
  const [expanded, setExpanded] = useState(false);
  const [showBefore, setShowBefore] = useState(false);
  // Righe raccolte aperte, per id della prima voce: si riaprono una per una.
  const [shownGroups, setShownGroups] = useState<ReadonlySet<string>>(() => new Set());
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
  let doneTo = from;
  while (doneTo < itemEntries.length && status[itemEntries[doneTo].item.id] && itemEntries[doneTo].m <= nowM) doneTo++;
  if (!expanded && doneTo - from >= COLLAPSE_FROM) {
    entries.push({ type: 'done', items: itemEntries.slice(from, doneTo).map((e) => e.item), m: itemEntries[from].m });
    from = doneTo;
  }
  // Oltre le prossime ore la giornata si raccoglie: in vista restano gli appuntamenti (calcio, palestra, revisione),
  // la voce di Adesso e quelle rimaste indietro; le altre stanno in una riga prima dell'appuntamento o in fondo.
  const at = itemEntries.findIndex((e, i) => i >= from && e.m > nowM + LATER_WINDOW_MIN);
  const pinned = (e: ItemEntry) => ALWAYS_SHOWN.has(e.item.kind) || e.item.id === currentId || overdueIds.has(e.item.id);
  const end = at === -1 ? itemEntries.length : at;
  entries.push(...itemEntries.slice(from, end));
  let run: ItemEntry[] = [];
  const flush = (tail: boolean) => {
    const key = run[0]?.item.id;
    const min = tail ? LATER_COLLAPSE_FROM : GAP_COLLAPSE_FROM;
    if (key && run.length >= min && !shownGroups.has(key)) entries.push({ type: 'later', items: run.map((e) => e.item), m: run[0].m, key, gap: !tail });
    else entries.push(...run);
    run = [];
  };
  for (const e of itemEntries.slice(end)) {
    if (pinned(e)) {
      flush(false);
      entries.push(e);
    } else run.push(e);
  }
  flush(true);
  let nowIndex = entries.findIndex((e) => (e.type === 'item' || e.type === 'later') && e.m > nowM);
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
        const key = e.type === 'item' ? e.item.id : e.type === 'later' ? `later:${e.key}` : e.type;
        return (
          <Fragment key={key}>
            {i === nowIndex && <NowLine now={now} first={i === 0} />}
            {e.type === 'before' ? (
              <BeforeRun items={e.items} first={first} last={last} onExpand={() => setShowBefore(true)} />
            ) : e.type === 'done' ? (
              <DoneRun items={e.items} dayType={dayType} status={status} first={first} last={last} onExpand={() => setExpanded(true)} />
            ) : e.type === 'later' ? (
              <LaterRun
                items={e.items}
                gap={e.gap}
                dayType={dayType}
                status={status}
                first={first}
                last={last}
                onExpand={() => setShownGroups((g) => new Set(g).add(e.key))}
              />
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
      <span aria-hidden className="w-[46px] shrink-0 pr-1 pt-[15px] text-right leading-[12px]">
        <span className="t-mono text-[0.75rem] leading-[12px] text-ink-3">{items[0].time}</span>
      </span>
      <Rail first={first} last={last}>
        <span aria-hidden className="relative mt-[6px] grid size-[30px] place-items-center rounded-full bg-good text-[var(--on-good)]">
          <span className="t-num text-[0.9375rem] leading-none">{items.length}</span>
        </span>
      </Rail>
      <span className="flex min-w-0 flex-1 flex-col pb-1 pr-3">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          className="flex min-h-12 w-full items-start gap-2 rounded-[14px] py-[9px] pl-1.5 pr-1 text-left transition-colors duration-150 active:bg-ink-soft"
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

/** Nomi brevi dei riti e della notte, per le righe raccolte. */
const SHORT_NAME: Partial<Record<DayItem['kind'], string>> = {
  preparazione: 'Preparazione',
  spesa: 'Spesa',
  revisione: 'Revisione',
  coprifuoco: 'Telefono fuori',
  letto: 'A letto',
  fisio: 'Fisioterapista',
  controllo: 'Controllo',
};

/** Nome breve di una voce in una riga raccolta: "Cena di recupero, veloce e digeribile" diventa "cena di recupero". */
function shortName(item: DayItem, i: number): string {
  const t = SHORT_NAME[item.kind] ?? item.title.split(',')[0];
  return i === 0 ? t : t.charAt(0).toLowerCase() + t.slice(1);
}

/**
 * Voci lontane raccolte in una riga, con l'icona di ciascuna: un tocco le mostra. In fondo alla giornata "Più tardi,
 * fino alle 00:15"; prima di un appuntamento (`gap`) i loro nomi, "Pranzo e merenda".
 */
function LaterRun({
  items,
  gap,
  dayType,
  status,
  first,
  last,
  onExpand,
}: {
  items: DayItem[];
  gap: boolean;
  dayType: DayType;
  status: Record<string, ItemStatus>;
  first: boolean;
  last: boolean;
  onExpand: () => void;
}) {
  const end = items[items.length - 1].time;
  const names = items.length <= 3 ? listIt(items.map(shortName)) : `${listIt(items.slice(0, 2).map(shortName))} e altre ${items.length - 2}`;
  return (
    <li className="relative flex items-stretch">
      <span aria-hidden className="w-[46px] shrink-0 pr-1 pt-[15px] text-right leading-[12px]">
        <span className="t-mono text-[0.75rem] leading-[12px] text-ink-3">{items[0].time}</span>
      </span>
      <Rail first={first} last={last}>
        <span aria-hidden className="relative mt-[6px] grid size-[30px] place-items-center rounded-full bg-card-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line-strong)]">
          <span className="t-num text-[0.9375rem] leading-none">{items.length}</span>
        </span>
      </Rail>
      <span className="flex min-w-0 flex-1 flex-col pb-1 pr-3">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          className="flex min-h-12 w-full items-start gap-2 rounded-[14px] py-[9px] pl-1.5 pr-1 text-left transition-colors duration-150 active:bg-ink-soft"
        >
          <span className="min-w-0 flex-1">
            <span className="t-callout block font-semibold leading-snug text-ink-2">
              {gap ? (
                names
              ) : (
                <>
                  Più tardi, fino alle <span className="tabular">{end}</span>
                </>
              )}
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1" aria-hidden>
              {items.map((it) => (
                <StatusMark key={it.id} item={it} dayType={dayType} status={status[it.id]} size={18} />
              ))}
            </span>
            <span className="sr-only">{`${items.length} voci: ${items.map((it) => it.title).join(', ')}. Mostra`}</span>
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
      <span aria-hidden className="w-[46px] shrink-0 pr-1 pt-[15px] text-right leading-[12px]">
        <span className="t-mono text-[0.75rem] leading-[12px] text-ink-3">{items[0].time}</span>
      </span>
      <Rail first={first} last={last}>
        <span aria-hidden className="relative mt-[6px] grid size-[30px] place-items-center rounded-full border-[1.5px] border-dashed border-line-strong text-ink-3">
          <span className="t-num text-[0.9375rem] leading-none">{items.length}</span>
        </span>
      </Rail>
      <span className="flex min-w-0 flex-1 flex-col pb-1 pr-3">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          className="flex min-h-12 w-full items-start gap-2 rounded-[14px] py-[9px] pl-1.5 pr-1 text-left transition-colors duration-150 active:bg-ink-soft"
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
      {!first && <span aria-hidden className="absolute left-1/2 top-0 h-[6px] w-px -translate-x-1/2 bg-line" />}
      {!last && <span aria-hidden className="absolute bottom-0 left-1/2 top-[40px] w-px -translate-x-1/2 bg-line" />}
      {children}
    </span>
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
  // Prima della spesa di avvio è sotto ogni pasto: la ricetta non si può ancora fare.
  const showPlanB = item.kind === 'pasto' && !status && !muted && (item.preShopping || (item.slot !== 'cena' && (current || overdue)));

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
      <span aria-hidden className="w-[46px] shrink-0 pr-1 pt-[15px] text-right leading-[12px]">
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
          <span className="relative mt-[6px]">
            <StatusMark item={item} dayType={dayType} status={status} size={30} muted />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onToggle(item)}
            aria-label={toggleLabel}
            aria-pressed={status === 'fatto'}
            className="hit-44 relative mt-[4px] grid size-[34px] place-items-center rounded-full transition-transform duration-150 active:scale-90"
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
          aria-label={`${item.time}, ${item.title}${item.detail ? `, ${item.detail}` : ''}${item.carry ? ', da portare al lavoro' : ''}`}
          aria-haspopup={opens ? 'dialog' : undefined}
          className={cn(
            'flex min-h-12 w-full items-start gap-2 rounded-[14px] pl-1.5 pr-1 text-left transition-colors duration-150 active:bg-ink-soft',
            // Con il piano B sotto, la voce finisce prima: la pillola tocca su 44 px senza invadere la voce.
            showPlanB ? 'pb-1 pt-[9px]' : 'py-[9px]',
          )}
        >
          <span className="min-w-0 flex-1">
            <span className={cn('t-callout block font-semibold leading-snug transition-colors duration-200', titleCls)}>{item.title}</span>
            {item.detail && (
              <span className={cn('t-footnote mt-0.5 line-clamp-1 transition-colors duration-200', detailCls)}>{keepHyphens(item.detail)}</span>
            )}
            {status === 'sostituito' && (
              <span className="t-footnote mt-1 block text-warn-ink">{note ? (item.kind === 'pasto' ? `Al posto: ${note}` : note) : 'Sostituito'}</span>
            )}
            {status === 'fatto' && note && isNightNote(item) && <span className="t-footnote mt-1 block text-ink-3">{note}</span>}
            {status === 'saltato' && <span className="t-caption mt-1 block font-medium text-ink-3">{note ? `Saltato: ${note}` : 'Saltato'}</span>}
            {!status && muted && <span className="t-caption mt-1 block font-medium text-ink-3">Prima dell’inizio</span>}
            {!status && appointment && <span className="t-caption mt-1 block font-medium text-ink-3">Non conta oggi, segna minuti e fatica</span>}
            {!status && item.carry && <span className="t-caption mt-1 block font-medium text-ink-2">Da portare al lavoro</span>}
            {!status && overdue && <span className="t-caption mt-1 block font-medium text-warn-ink">Da segnare</span>}
          </span>
        </button>
        {showPlanB && (
          <button
            type="button"
            onClick={() => onPlanB(item.slot)}
            className="hit-44 t-footnote mb-2 ml-1.5 mt-2 inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-control px-3.5 font-semibold text-ink-2 shadow-[inset_0_0_0_1px_var(--control-line)] transition-transform duration-150 active:scale-95"
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
            'hit-44 mt-[5px] grid size-8 place-items-center rounded-full text-ink-3 transition-colors duration-150 hover:text-ink-2 active:bg-ink-soft',
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
