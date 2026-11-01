import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, Cookie, Footprints, GlassWater, Minus, Plus } from 'lucide-react';
import { formatWeekday } from '../../../engine/dates';
import type { WeeklyStepStatus } from '../../../engine/review';
import { fmtLiters, fmtNumber, plural } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Button, Card, IconButton, cn, spring, springSnappy, toneColor, toneInk, toneRing, toneSoft, type AnyTone } from '../../../ui';
import { BOARD_LABEL } from '../kinds';

const GLASS_L = 0.25;

export interface WaterProps {
  glasses: number;
  targetL: number;
  /** Litri in più del giorno (es. calcio: sudore da reintegrare). */
  extraL?: number;
  extraReason?: string;
  onAdd: (delta: number) => void;
}

export interface SweetsProps {
  /** Dolci della settimana fino a oggi. */
  week: number;
  today: number;
  planned: number;
  onAdd: (delta: number) => void;
}

/**
 * Le piccole abitudini in una card sola, una riga ciascuna: lo scalino della settimana (se c'è), l'acqua e i
 * dolci. Ogni riga è titolo, avanzamento e un pulsante; il tocco sulla riga apre il dettaglio (il come dello
 * scalino, i bicchieri da toccare, togliere un dolce di oggi).
 */
export function TrackersCard({ water, sweets, step }: { water: WaterProps; sweets: SweetsProps; step?: StepProps | null }) {
  return (
    <Card padding="none" as="section" aria-label={step ? 'Scalino, acqua e dolci' : 'Acqua e dolci'}>
      {step && (
        <>
          <StepRow {...step} />
          <div aria-hidden className="mx-4 h-px bg-line" />
        </>
      )}
      <WaterRow {...water} />
      <div aria-hidden className="mx-4 h-px bg-line" />
      <SweetsRow {...sweets} />
    </Card>
  );
}

/**
 * Tacche di avanzamento: una per bicchiere o per dolce previsto. Con `over` si aggiungono in fondo tacche piene
 * nel colore `overTone` (dolci oltre i previsti).
 */
function Ticks({ filled, total, tone, over: extra = 0, overTone }: { filled: number; total: number; tone: AnyTone; over?: number; overTone?: AnyTone }) {
  const reduce = useReducedMotion();
  const n = total + extra;
  return (
    <span aria-hidden className="flex min-w-0 flex-1 gap-1">
      {Array.from({ length: n }, (_, i) => {
        const over = i >= total;
        const on = over || i < filled;
        return (
          <span key={i} className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--ring-track)]">
            <motion.span
              className="absolute inset-0 origin-left rounded-full"
              style={{ background: toneColor(over && overTone ? overTone : tone) }}
              initial={false}
              animate={{ scaleX: on ? 1 : 0 }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30, delay: Math.min(i * 0.015, 0.15) }}
            />
          </span>
        );
      })}
    </span>
  );
}

interface RowShellProps {
  id: string;
  icon: typeof GlassWater;
  tone: AnyTone;
  /** Etichetta da tabellone sopra il titolo (es. "Scalino della settimana"). */
  label?: string;
  title: string;
  /** Avanzamento sotto il titolo (tacche o pallini). */
  visual: ReactNode;
  count: ReactNode;
  /** Riassunto per i lettori di schermo (titolo escluso). */
  countLabel: string;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}

function RowShell({ id, icon: Icon, tone, label, title, visual, count, countLabel, open, onToggle, action, children }: RowShellProps) {
  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            haptic('selection');
            onToggle();
          }}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`${title}: ${countLabel}. ${open ? 'Chiudi il dettaglio' : 'Apri il dettaglio'}`}
          className="-ml-1 flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-control py-1 pl-1 pr-1 text-left transition-colors duration-150 active:bg-ink-soft"
        >
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[11px]" style={{ background: toneSoft(tone, 16), boxShadow: toneRing(tone), color: toneInk(tone) }}>
            <Icon size={19} strokeWidth={2.2} />
          </span>
          <span aria-hidden className="min-w-0 flex-1">
            {label && <span className={cn(BOARD_LABEL, 'mb-1 block text-[0.6875rem] text-accent-ink')}>{label}</span>}
            <span className="t-callout block truncate font-semibold text-ink">{title}</span>
            <span className="mt-1.5 flex items-center gap-3">
              <span className="flex min-w-0 flex-1 items-center">{visual}</span>
              <span className="flex shrink-0 items-baseline gap-0.5">{count}</span>
              <ChevronDown size={15} strokeWidth={2.5} className={cn('-ml-1.5 shrink-0 self-center text-ink-4 transition-transform duration-200', open && 'rotate-180')} />
            </span>
          </span>
        </button>
        {action}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} key="detail" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring} className="overflow-hidden">
            <div className="pb-1.5 pt-2.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Acqua: bicchieri da 250 ml verso l'obiettivo. Un tocco su "Bicchiere" ne aggiunge uno. */
function WaterRow({ glasses, targetL: baseL, extraL = 0, extraReason, onAdd }: WaterProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const targetL = baseL + extraL;
  const target = Math.max(1, Math.round(targetL / GLASS_L));
  const rows = Math.ceil(target / 7);
  const perRow = Math.ceil(target / rows);
  const reached = glasses >= target;

  const setTo = (n: number) => {
    const next = n === glasses ? n - 1 : n;
    if (next === glasses) return;
    haptic(next > glasses ? (next >= target && glasses < target ? 'success' : 'light') : 'selection');
    onAdd(next - glasses);
  };

  return (
    <RowShell
      id={id}
      icon={GlassWater}
      tone="palestra"
      title="Acqua"
      count={
        <>
          <span className={cn('t-num text-[1.125rem] leading-none', reached ? 'text-good-ink' : 'text-ink')}>{fmtNumber(glasses * GLASS_L, 2)}</span>
          <span className="t-caption text-ink-3">/{fmtLiters(targetL)}</span>
        </>
      }
      countLabel={`${fmtLiters(glasses * GLASS_L)} su ${fmtLiters(targetL)}, ${plural(glasses, 'bicchiere', 'bicchieri')} su ${target}${extraL > 0 && extraReason ? `, ${extraReason}` : ''}`}
      visual={<Ticks filled={glasses} total={target} tone={reached ? 'good' : 'palestra'} />}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      action={
        <IconButton
          icon={Plus}
          variant="tinted"
          className="shrink-0"
          onClick={() => {
            haptic(glasses + 1 === target ? 'success' : 'light');
            onAdd(1);
          }}
          label="Aggiungi un bicchiere d’acqua"
        />
      }
    >
      <div className="grid gap-x-[5px] gap-y-2" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }} role="group" aria-label="Bicchieri d’acqua">
        {Array.from({ length: target }, (_, i) => {
          const full = i < glasses;
          return (
            <button
              key={i}
              type="button"
              aria-label={plural(i + 1, 'bicchiere', 'bicchieri')}
              aria-pressed={full}
              onClick={() => setTo(i + 1)}
              className="group relative h-11 touch-manipulation"
            >
              <Glass full={full} reduce={Boolean(reduce)} />
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <p className="t-caption text-ink-3">
          {extraL > 0 && extraReason ? `Oggi ${extraReason}. ` : ''}Tocca un bicchiere per arrivare fin lì.
        </p>
        <Button size="sm" variant="ghost" icon={Minus} disabled={glasses <= 0} onClick={() => onAdd(-1)} className="shrink-0">
          Togli
        </Button>
      </div>
    </RowShell>
  );
}

/** Bicchiere disegnato: contorno sempre visibile (anche nel tema chiaro), acqua che sale quando è pieno. */
function Glass({ full, reduce }: { full: boolean; reduce: boolean }) {
  const id = useId();
  const shape = 'M2 1.5 H22 L19.6 38.5 Q19.4 40 17.9 40 H6.1 Q4.6 40 4.4 38.5 Z';
  return (
    <svg aria-hidden viewBox="0 0 24 41.5" preserveAspectRatio="none" className="absolute inset-x-[3px] inset-y-0 h-full w-[calc(100%-6px)] transition-transform duration-150 group-active:scale-90">
      <defs>
        <clipPath id={id}>
          <path d={shape} />
        </clipPath>
        <linearGradient id={`${id}-w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`color-mix(in srgb, ${toneColor('palestra')} 75%, white)`} />
          <stop offset="1" stopColor={toneColor('palestra')} />
        </linearGradient>
      </defs>
      <path d={shape} fill="var(--card-2)" />
      <g clipPath={`url(#${id})`}>
        <motion.rect
          x="0"
          width="24"
          fill={`url(#${id}-w)`}
          initial={false}
          animate={{ y: full ? 0 : 41.5, height: full ? 41.5 : 0 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 26 }}
        />
      </g>
      <path d={shape} fill="none" stroke={full ? 'transparent' : 'var(--line-strong)'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Dolci: quanti dei previsti della settimana restano, e il pulsante per segnarne uno. Testo, numero e tacche
 * dicono la stessa cosa (i rimasti): la barra si svuota a ogni dolce; oltre i previsti compaiono tacche di avviso.
 */
function SweetsRow({ week, today, planned, onAdd }: SweetsProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const remaining = Math.max(0, planned - week);
  const over = Math.max(0, week - planned);
  const text =
    over > 0
      ? `${plural(over, 'dolce', 'dolci')} oltre i previsti`
      : remaining > 0
        ? `Ne ${remaining === 1 ? 'resta' : 'restano'} ${fmtNumber(remaining)} dei ${fmtNumber(planned)} previsti`
        : 'Previsti finiti per questa settimana';

  return (
    <RowShell
      id={id}
      icon={Cookie}
      tone="riposo"
      title="Dolci della settimana"
      count={
        over > 0 ? (
          <>
            <span className="t-num text-[1.125rem] leading-none text-warn-ink">+{fmtNumber(over)}</span>
            <span className="t-caption text-warn-ink">oltre</span>
          </>
        ) : (
          <>
            <span className="t-num text-[1.125rem] leading-none text-ink">{fmtNumber(remaining)}</span>
            <span className="t-caption text-ink-3">{remaining === 1 ? 'rimasto' : 'rimasti'}</span>
          </>
        )
      }
      countLabel={text}
      visual={<Ticks filled={remaining} total={planned} tone="riposo" over={over} overTone="warn" />}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      action={
        <IconButton icon={Plus} variant="tinted" className="shrink-0" onClick={() => onAdd(1)} label="Ho mangiato un dolce" />
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className="t-footnote text-ink-2">
          <span className={cn('block font-medium', over > 0 ? 'text-warn-ink' : 'text-ink')}>{text}.</span>
          {today > 0 ? `Oggi ${plural(today, 'dolce', 'dolci')}.` : 'Oggi nessun dolce.'} Il dolce previsto va dopo cena, non da solo.
        </p>
        <Button size="sm" variant="ghost" icon={Minus} disabled={today <= 0} onClick={() => onAdd(-1)} className="shrink-0" aria-label="Togli un dolce di oggi">
          Togli
        </Button>
      </div>
    </RowShell>
  );
}

// ───────────────────────── Scalino della settimana ─────────────────────────

const STEP_STATE_LABEL = {
  fatto: 'fatto',
  mancato: 'mancato',
  'in-corso': 'oggi, da fare',
  futuro: 'da venire',
  prima: 'prima dell’inizio',
} as const;

const STEP_MEASURE_NOTE = {
  acqua: 'Si conta da solo con i bicchieri d’acqua.',
  dolci: 'Si conta da solo: vale se non segni dolci oltre i previsti.',
} as const;

export interface StepProps {
  status: WeeklyStepStatus;
  onToggle: () => void;
}

/**
 * Scalino della settimana: la piccola abitudine scelta nella revisione della domenica. Titolo, i 7 giorni in
 * pallini e il pulsante per segnare oggi; il come sta dietro un tocco sulla riga.
 */
function StepRow({ status, onToggle }: StepProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const { step, days, done, target, todayState, manual } = status;
  const reached = done >= target;
  const doneToday = todayState === 'fatto';
  return (
    <RowShell
      id={id}
      icon={Footprints}
      tone={reached ? 'good' : 'accent'}
      label="Scalino della settimana"
      title={step.title}
      count={
        <>
          <span className={cn('t-num text-[1.125rem] leading-none', reached ? 'text-good-ink' : 'text-ink')}>{done}</span>
          <span className="t-caption text-ink-3">su {target}</span>
        </>
      }
      countLabel={`scalino della settimana, ${done} giorni su ${target}. ${days.map((d) => `${formatWeekday(d.date)} ${STEP_STATE_LABEL[d.state]}`).join(', ')}`}
      visual={
        <span className="flex items-center gap-1.5">
          {days.map((d) => (
            <motion.span
              key={d.date}
              className={cn(
                'size-3 rounded-full',
                d.state === 'fatto' && 'bg-good',
                d.state === 'mancato' && 'bg-ink-soft',
                d.state === 'futuro' && 'shadow-[inset_0_0_0_1px_var(--line-strong)]',
                d.state === 'prima' && 'border border-dashed border-line',
              )}
              style={d.state === 'in-corso' ? { boxShadow: 'inset 0 0 0 1.5px var(--accent)' } : undefined}
              initial={false}
              animate={reduce ? undefined : { scale: d.state === 'fatto' ? [0.7, 1] : 1 }}
              transition={springSnappy}
            />
          ))}
        </span>
      }
      open={open}
      onToggle={() => setOpen((o) => !o)}
      action={
        manual ? (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={doneToday}
            disabled={todayState === 'prima'}
            aria-label={doneToday ? `${step.title}: fatto oggi. Tocca per annullare` : `Segna fatto oggi: ${step.title}`}
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-90 disabled:opacity-40',
              doneToday ? 'bg-good text-[var(--on-good)]' : 'text-accent-ink',
            )}
            style={doneToday ? undefined : { background: toneSoft('accent', 16), boxShadow: toneRing('accent') }}
          >
            <Check size={20} strokeWidth={doneToday ? 3 : 2.5} aria-hidden />
          </button>
        ) : undefined
      }
    >
      <p className="t-footnote text-pretty text-ink-2">
        {step.how}
        {!manual && <span className="mt-1 block text-ink-3">{STEP_MEASURE_NOTE[step.measure === 'acqua' ? 'acqua' : 'dolci']}</span>}
      </p>
    </RowShell>
  );
}
