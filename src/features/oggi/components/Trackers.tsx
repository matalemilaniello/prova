import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Cookie, GlassWater, Minus, Plus } from 'lucide-react';
import { fmtLiters, fmtNumber, plural } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Button, Card, IconButton, NumberTicker, cn, spring, toneColor, toneInk, toneRing, toneSoft, type AnyTone } from '../../../ui';

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
 * Acqua e dolci in una card sola, una riga ciascuno: titolo, avanzamento a tacche e il pulsante per aggiungere.
 * Il tocco sulla riga apre il dettaglio (i bicchieri da toccare, togliere un dolce di oggi).
 */
export function TrackersCard({ water, sweets }: { water: WaterProps; sweets: SweetsProps }) {
  return (
    <Card padding="none" as="section" aria-label="Acqua e dolci">
      <WaterRow {...water} />
      <div aria-hidden className="mx-4 h-px bg-line" />
      <SweetsRow {...sweets} />
    </Card>
  );
}

/** Tacche di avanzamento: una per bicchiere o per dolce previsto; quelle oltre il previsto prendono `overTone`. */
function Ticks({ filled, total, tone, overTone }: { filled: number; total: number; tone: AnyTone; overTone?: AnyTone }) {
  const reduce = useReducedMotion();
  const n = Math.max(total, overTone ? filled : total);
  return (
    <span aria-hidden className="flex min-w-0 flex-1 gap-1">
      {Array.from({ length: n }, (_, i) => {
        const on = i < filled;
        const over = i >= total;
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
  title: string;
  subtitle: ReactNode;
  subtitleTone?: 'warn';
  count: ReactNode;
  countLabel: string;
  ticks: ReactNode;
  open: boolean;
  onToggle: () => void;
  action: ReactNode;
  children: ReactNode;
}

function RowShell({ id, icon: Icon, tone, title, subtitle, subtitleTone, count, countLabel, ticks, open, onToggle, action, children }: RowShellProps) {
  return (
    <div className="px-4 py-3">
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
          className="-my-1 -ml-1 flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-control py-1 pl-1 text-left transition-colors duration-150 active:bg-ink-soft"
        >
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[11px]" style={{ background: toneSoft(tone, 16), boxShadow: toneRing(tone), color: toneInk(tone) }}>
            <Icon size={19} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-headline block truncate text-ink">{title}</span>
            <span className={cn('t-footnote block truncate', subtitleTone === 'warn' ? 'font-medium text-warn-ink' : 'text-ink-2')}>{subtitle}</span>
          </span>
        </button>
        {action}
      </div>
      <div aria-hidden className="mt-2 flex items-center gap-3 pl-12">
        {ticks}
        <span className="flex w-10 shrink-0 items-baseline justify-end">{count}</span>
        <ChevronDown size={16} strokeWidth={2.5} className={cn('-ml-1.5 mr-3.5 shrink-0 text-ink-3 transition-transform duration-200', open && 'rotate-180')} />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} key="detail" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring} className="overflow-hidden">
            <div className="pt-3">{children}</div>
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
      subtitle={
        <>
          {fmtLiters(glasses * GLASS_L)} su {fmtLiters(targetL)}
          {extraL > 0 && extraReason ? <span className="text-ink-3"> · {extraReason}</span> : null}
        </>
      }
      count={
        <>
          <NumberTicker value={glasses} className={cn('t-num text-[1.125rem] leading-none', reached ? 'text-good-ink' : 'text-ink')} />
          <span className="t-caption text-ink-3">/{target}</span>
        </>
      }
      countLabel={`${plural(glasses, 'bicchiere', 'bicchieri')} su ${target}`}
      ticks={<Ticks filled={glasses} total={target} tone={reached ? 'good' : 'palestra'} />}
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
        <p className="t-caption text-ink-3">Tocca un bicchiere per arrivare fin lì.</p>
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

/** Dolci: quanti dei previsti della settimana restano, e il pulsante per segnarne uno. */
function SweetsRow({ week, today, planned, onAdd }: SweetsProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const remaining = Math.max(0, planned - week);
  const over = Math.max(0, week - planned);
  const text =
    over > 0
      ? `${plural(over, 'dolce', 'dolci')} oltre i previsti`
      : remaining > 0
        ? `${fmtNumber(remaining)} su ${fmtNumber(planned)} previsti ${remaining === 1 ? 'rimasto' : 'rimasti'}`
        : 'Previsti della settimana finiti';

  return (
    <RowShell
      id={id}
      icon={Cookie}
      tone="riposo"
      title="Dolci della settimana"
      subtitle={text}
      subtitleTone={over > 0 ? 'warn' : undefined}
      count={
        <>
          <span className={cn('t-num text-[1.125rem] leading-none', over > 0 ? 'text-warn-ink' : 'text-ink')}>{fmtNumber(week)}</span>
          <span className="t-caption text-ink-3">/{planned}</span>
        </>
      }
      countLabel={`${plural(week, 'dolce', 'dolci')} su ${planned} previsti`}
      ticks={<Ticks filled={week} total={planned} tone="riposo" overTone="warn" />}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      action={
        <IconButton icon={Plus} variant="tinted" className="shrink-0" onClick={() => onAdd(1)} label="Ho mangiato un dolce" />
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className="t-footnote text-ink-2">{today > 0 ? `Oggi ${plural(today, 'dolce', 'dolci')}.` : 'Oggi nessun dolce.'} Il dolce previsto va dopo cena, non da solo.</p>
        <Button size="sm" variant="ghost" icon={Minus} disabled={today <= 0} onClick={() => onAdd(-1)} className="shrink-0" aria-label="Togli un dolce di oggi">
          Togli
        </Button>
      </div>
    </RowShell>
  );
}
