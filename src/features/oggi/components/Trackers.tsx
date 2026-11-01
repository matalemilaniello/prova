import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Cookie, GlassWater, Minus, Plus } from 'lucide-react';
import { fmtLiters, fmtNumber, plural } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Button, Card, IconButton, NumberTicker, Pill, cn, toneColor, toneInk, toneRing, toneSoft } from '../../../ui';

const GLASS_L = 0.25;

export interface WaterCardProps {
  glasses: number;
  targetL: number;
  /** Litri in più del giorno (es. calcio: sudore da reintegrare). */
  extraL?: number;
  extraReason?: string;
  onAdd: (delta: number) => void;
}

/**
 * Acqua: bicchieri da 250 ml verso l'obiettivo. Tocca un bicchiere per arrivare fin lì.
 * Oltre 6 bicchieri vanno su più righe, così ogni bersaglio resta largo almeno 44 px.
 */
export function WaterCard({ glasses, targetL: baseL, extraL = 0, extraReason, onAdd }: WaterCardProps) {
  const reduce = useReducedMotion();
  const targetL = baseL + extraL;
  const target = Math.max(1, Math.round(targetL / GLASS_L));
  const rows = Math.ceil(target / 6);
  const perRow = Math.ceil(target / rows);
  const reached = glasses >= target;
  const extra = Math.max(0, glasses - target);

  const setTo = (n: number) => {
    const next = n === glasses ? n - 1 : n;
    if (next === glasses) return;
    haptic(next > glasses ? (next >= target && glasses < target ? 'success' : 'light') : 'selection');
    onAdd(next - glasses);
  };

  return (
    <Card padding="none" as="section" aria-labelledby="oggi-acqua">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[11px]" style={{ background: toneSoft('palestra', 16), boxShadow: toneRing('palestra'), color: toneInk('palestra') }}>
            <GlassWater size={19} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="oggi-acqua" className="t-headline text-ink">
              Acqua
            </h3>
            <p className="t-footnote text-ink-2">
              {fmtLiters(glasses * GLASS_L)} su {fmtLiters(targetL)}
              {extraL > 0 && extraReason ? <span className="text-ink-3"> · {extraReason}</span> : null}
            </p>
          </div>
          {reached ? (
            <Pill tone="good" size="sm">
              {extra > 0 ? `Obiettivo +${extra}` : 'Obiettivo raggiunto'}
            </Pill>
          ) : (
            <p className="flex items-baseline gap-0.5" aria-label={`${glasses} bicchieri su ${target}`}>
              <NumberTicker value={glasses} className="t-num text-[1.75rem] text-ink" />
              <span className="t-callout text-ink-3">/{target}</span>
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-x-[5px] gap-y-2" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }} role="group" aria-label="Bicchieri d’acqua">
          {Array.from({ length: target }, (_, i) => {
            const full = i < glasses;
            return (
              <button
                key={i}
                type="button"
                aria-label={`${plural(i + 1, 'bicchiere', 'bicchieri')}`}
                aria-pressed={full}
                onClick={() => setTo(i + 1)}
                className="group relative h-11 touch-manipulation"
              >
                <Glass full={full} reduce={Boolean(reduce)} />
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2.5">
          <IconButton icon={Minus} label="Togli un bicchiere" variant="tinted" size="md" disabled={glasses <= 0} onClick={() => onAdd(-1)} />
          <Button icon={Plus} variant="secondary" className="flex-1" onClick={() => onAdd(1)} haptic={glasses + 1 === target ? 'success' : 'light'}>
            Un bicchiere
          </Button>
        </div>
      </div>
    </Card>
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

export interface SweetsCardProps {
  /** Dolci della settimana fino a oggi. */
  week: number;
  today: number;
  planned: number;
  onAdd: (delta: number) => void;
}

/** Dolci: quanti dei previsti della settimana restano, e il pulsante per segnarne uno. */
export function SweetsCard({ week, today, planned, onAdd }: SweetsCardProps) {
  const remaining = Math.max(0, planned - week);
  const over = Math.max(0, week - planned);
  const dots = Math.max(planned, week);
  const text =
    over > 0
      ? `${plural(over, 'dolce', 'dolci')} oltre i previsti`
      : remaining > 0
        ? `${fmtNumber(remaining)} su ${fmtNumber(planned)} previsti ${remaining === 1 ? 'rimasto' : 'rimasti'}`
        : 'Previsti della settimana finiti';

  return (
    <Card padding="none" as="section" aria-labelledby="oggi-dolci">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[11px]" style={{ background: toneSoft('riposo', 16), boxShadow: toneRing('riposo'), color: toneInk('riposo') }}>
            <Cookie size={19} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="oggi-dolci" className="t-headline text-ink">
              Dolci della settimana
            </h3>
            <p className={cn('t-footnote', over > 0 ? 'font-medium text-warn-ink' : 'text-ink-2')}>{text}</p>
          </div>
          <span className="flex items-center gap-1" aria-hidden>
            {Array.from({ length: dots }, (_, i) => {
              const eaten = i < week;
              const isOver = i >= planned;
              return (
                <motion.span
                  key={i}
                  className="size-3 rounded-full"
                  initial={false}
                  animate={{
                    backgroundColor: eaten ? (isOver ? 'var(--warn)' : 'var(--riposo)') : 'rgba(0,0,0,0)',
                    scale: 1,
                  }}
                  style={{ boxShadow: eaten ? 'none' : 'inset 0 0 0 1.5px var(--line-strong)' }}
                />
              );
            })}
          </span>
        </div>

        <div className="mt-4 flex gap-2.5">
          <IconButton icon={Minus} label="Togli un dolce di oggi" variant="tinted" size="md" disabled={today <= 0} onClick={() => onAdd(-1)} />
          <Button icon={Plus} variant="secondary" className="flex-1" onClick={() => onAdd(1)}>
            Ho mangiato un dolce
          </Button>
        </div>
        {today > 0 && <p className="t-caption mt-2.5 px-1 text-ink-3">Oggi {plural(today, 'dolce', 'dolci')}.</p>}
      </div>
    </Card>
  );
}
