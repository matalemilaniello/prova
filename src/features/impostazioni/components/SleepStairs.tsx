/**
 * La "scala del sonno": l'orario a letto che si anticipa di un passo a settimana fino all'obiettivo.
 * Grafico SVG disegnato a mano, in scala, leggibile in entrambi i temi.
 * Le ore sono tempo a letto, non sonno: del tempo a letto se ne dorme l'85-90% (`estimatedSleep`).
 */
import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BedDouble } from 'lucide-react';
import type { HHMM, SleepPlan } from '../../../domain/types';
import { nightMinutes } from '../../../engine/dates';
import { estimatedSleepLabel, sleepHours } from '../../../engine/sleep';
import { fmtHours } from '../../../lib/format';
import { Button, Callout, cn, toneColor, toneInk } from '../../../ui';
import { shortTimeInBed, sleepSteps, suggestedBedtime } from '../lib';

const W = 320;
const H = 132;
const PAD = { l: 6, r: 6, t: 26, b: 24 };
/** Etichette da tabellone: Barlow Condensed maiuscolo (il mono resta per gli orari). */
const CAPS = { textTransform: 'uppercase', letterSpacing: '0.06em' } as const;

/** "6 h 30" tutto su una riga: `fmtHours` usa già spazi indivisibili. */
const hours = (h: number) => fmtHours(h);

export function SleepStairs({ sleep, className }: { sleep: SleepPlan; className?: string }) {
  const id = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const steps = sleepSteps(sleep, 12);
  const weeks = steps.length - 1;
  const atTarget = weeks === 0;
  const now = sleepHours(sleep.current, sleep.wake);
  const goal = sleepHours(atTarget ? sleep.current : sleep.target, sleep.wake);

  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const maxM = nightMinutes(sleep.current);
  const minM = atTarget ? maxM - 60 : nightMinutes(sleep.target);
  const y = (bed: string) => PAD.t + ((maxM - nightMinutes(bed)) / Math.max(1, maxM - minM)) * innerH;
  const n = steps.length;
  const segW = innerW / n;
  const x = (i: number) => PAD.l + i * segW;

  let d = `M ${x(0)} ${y(steps[0].bed)}`;
  steps.forEach((_, i) => {
    d += ` H ${x(i + 1)}`;
    if (i + 1 < n) d += ` V ${y(steps[i + 1].bed)}`;
  });
  const area = `${d} V ${H - PAD.b} H ${x(0)} Z`;
  const yTarget = y(steps[n - 1].bed);
  const riposo = toneColor('riposo');
  const good = toneColor('good');

  const goalBed = atTarget ? sleep.current : sleep.target;
  const goalSleep = estimatedSleepLabel(goalBed, sleep.wake);
  const label = atTarget
    ? `Orario a letto ${sleep.current}: sei già all’obiettivo, ${hours(now)} a letto ogni notte, ${goalSleep}.`
    : `Da ${sleep.current} a ${sleep.target} in ${weeks} settimane: da ${hours(now)} a ${hours(goal)} a letto ogni notte. All’obiettivo, ${goalSleep}.`;

  return (
    <figure className={cn('flex flex-col gap-3', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={label}>
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={riposo} stopOpacity="0.26" />
            <stop offset="1" stopColor={riposo} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Righe di fondo, come le linee del campo. */}
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + t * innerH} y2={PAD.t + t * innerH} stroke="var(--line)" strokeWidth="1" strokeDasharray={t === 1 ? undefined : '2 4'} />
        ))}
        {!atTarget && <line x1={PAD.l} x2={W - PAD.r} y1={yTarget} y2={yTarget} stroke={good} strokeWidth="1.25" strokeDasharray="4 4" opacity="0.7" />}
        <motion.path
          d={area}
          fill={`url(#fill-${id})`}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.35 }}
        />
        <motion.path
          d={d}
          fill="none"
          stroke={riposo}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        {steps.map((s, i) => (
          <motion.circle
            key={i}
            cx={x(i)}
            cy={y(s.bed)}
            r={i === 0 ? 4.5 : 3}
            fill={i === 0 ? riposo : 'var(--card)'}
            stroke={riposo}
            strokeWidth="2"
            initial={reduce ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26, delay: reduce ? 0 : 0.12 + (i / n) * 0.9 }}
            style={{ transformOrigin: `${x(i)}px ${y(s.bed)}px` }}
          />
        ))}
        <text x={x(0)} y={y(steps[0].bed) - 10} className="font-mono" fontSize="11" fontWeight="500" fill="var(--ink)">
          {sleep.current}
        </text>
        <text x={x(0)} y={H - 6} className="font-display" fontSize="11" fontWeight="600" fill="var(--ink-3)" style={CAPS}>
          Questa settimana
        </text>
        {!atTarget && (
          <text x={W - PAD.r} y={yTarget - 10} textAnchor="end" className="font-mono" fontSize="11" fontWeight="500" fill={toneInk('good')}>
            {sleep.target}
          </text>
        )}
        {!atTarget && (
          <text x={W - PAD.r} y={H - 6} textAnchor="end" className="font-display" fontSize="11" fontWeight="600" fill="var(--ink-3)" style={CAPS}>
            {weeks === 1 ? 'Tra 1 settimana' : `Tra ${weeks} settimane`}
          </text>
        )}
      </svg>
      <figcaption className="t-footnote text-ink-2">
        {atTarget ? (
          <>
            Sei già all’obiettivo: <strong className="font-semibold text-ink">{hours(now)}</strong> a letto ogni notte, {goalSleep}. L’orario resta questo.
          </>
        ) : (
          <>
            Da <strong className="font-semibold text-ink">{hours(now)}</strong> a{' '}
            <strong className="font-semibold text-ink">{hours(goal)}</strong> a letto ogni notte, un passo di {sleep.stepMin} minuti a settimana. All’obiettivo,{' '}
            {goalSleep}.
          </>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * Suggerimento sotto la scala del sonno quando l'obiettivo lascia meno di 8 ore a letto (con 7 h 30 se ne
 * dormono circa 6 h 30, lo dice già la didascalia del grafico). Con `onApply` offre di spostare l'obiettivo
 * all'orario giusto per la sveglia.
 */
export function SleepTargetHint({ sleep, onApply, className }: { sleep: SleepPlan; onApply?: (target: HHMM) => void; className?: string }) {
  if (!shortTimeInBed(sleep)) return null;
  const better = suggestedBedtime(sleep.wake);
  return (
    <Callout
      tone="accent"
      icon={BedDouble}
      title="Per circa 7 ore di sonno servono 8 ore a letto"
      className={className}
      action={
        onApply ? (
          <Button variant="secondary" size="sm" onClick={() => onApply(better)}>
            Obiettivo alle {better}
          </Button>
        ) : undefined
      }
    >
      Con la sveglia alle {sleep.wake} vuol dire a letto alle {better}, perché del tempo a letto si dorme tra l’85 e il 90%.
    </Callout>
  );
}
