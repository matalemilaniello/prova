/**
 * Quadrante delle 24 ore: la giornata già decisa in un colpo d'occhio.
 * Archi per sonno, calcio, palestra e fisioterapista, puntini per i pasti, tacca del coprifuoco.
 * È l'anello del marchio di Ritmo, riempito con il piano.
 */
import { motion, useReducedMotion } from 'motion/react';
import { Dumbbell, HeartPulse, Moon } from 'lucide-react';
import type { Plan, Weekday } from '../../domain/types';
import { hhmmToMin } from '../../engine/dates';
import { curfewFor } from '../../engine/sleep';
import { mealSchedule, PHYSIO_AFTER_LUNCH_MIN } from '../../engine/timeline';
import { SESSIONS } from '../../data/sessions';
import { useResolvedTheme } from '../../app/theme';
import { BallIcon, cn, renderIcon, toneColor, toneInk, type AnyTone, type IconLike } from '../../ui';

const S = 280;
const C = S / 2;
const R = 104;
const STROKE = 13;

const polar = (min: number, r: number): [number, number] => {
  const a = (min / 1440) * Math.PI * 2 - Math.PI / 2;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

function arcPath(from: number, to: number, r: number): string {
  const span = (((to - from) % 1440) + 1440) % 1440 || 1440;
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(from + span - 0.01, r);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${span > 720 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

interface Arc {
  key: string;
  from: number;
  to: number;
  tone: AnyTone;
  icon: IconLike;
  label: string;
}

/** Archi e pasti della giornata tipo del giorno indicato. */
export function dialData(plan: Plan, weekday: Weekday) {
  const day = plan.week.find((d) => d.weekday === weekday);
  const meals = mealSchedule(day, plan);
  const arcs: Arc[] = [
    { key: 'sonno', from: hhmmToMin(plan.sleep.current), to: hhmmToMin(plan.sleep.wake), tone: 'riposo', icon: Moon, label: 'Sonno' },
  ];
  if (day?.gymSessionId) {
    const start = hhmmToMin(day.gymTime ?? '17:00');
    arcs.push({ key: 'palestra', from: start, to: start + (SESSIONS[day.gymSessionId]?.estMin ?? 55), tone: 'palestra', icon: Dumbbell, label: 'Palestra' });
  }
  if (day?.football) {
    const start = hhmmToMin(day.football.time);
    arcs.push({ key: 'calcio', from: start, to: start + day.football.durationMin, tone: 'calcio', icon: BallIcon, label: 'Calcio' });
  }
  if (day?.physio) {
    const start = hhmmToMin(meals.pranzo.time) + PHYSIO_AFTER_LUNCH_MIN;
    arcs.push({ key: 'fisio', from: start, to: start + 25, tone: 'leggero', icon: HeartPulse, label: 'Fisioterapista' });
  }
  const mealMins = Object.values(meals).map((m) => hhmmToMin(m.time));
  const curfew = hhmmToMin(curfewFor('', plan));
  return { arcs, mealMins, curfew };
}

export interface DayDialProps {
  plan: Plan;
  weekday: Weekday;
  /** Diametro in px (default 280). */
  size?: number;
  className?: string;
  /** Ritardo dell'animazione d'ingresso, in secondi. */
  delay?: number;
}

export function DayDial({ plan, weekday, size = S, className, delay = 0.15 }: DayDialProps) {
  const reduce = useReducedMotion();
  const dark = useResolvedTheme() === 'scuro';
  const { arcs, mealMins, curfew } = dialData(plan, weekday);
  // Alone degli archi: al buio i toni caldi brillano di luce bianca calda (l'ambra diluita sul blu diventa oliva).
  const halo = (tone: AnyTone) => (dark && (tone === 'calcio' || tone === 'accent' || tone === 'warn') ? 'rgb(var(--light-warm))' : toneColor(tone));
  const ease = [0.22, 1, 0.36, 1] as const;
  const label = `Giornata tipo: ${arcs.map((a) => a.label.toLowerCase()).join(', ')} e ${mealMins.length} pasti.`;

  return (
    <div className={cn('relative', className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      {/* Bagliore dei riflettori dietro al quadrante. */}
      <div
        aria-hidden
        className="absolute inset-[8%] rounded-full"
        style={{ background: 'radial-gradient(circle at 50% 40%, var(--accent-soft), transparent 68%)' }}
      />
      <svg viewBox={`0 0 ${S} ${S}`} width={size} height={size} className="relative overflow-visible" aria-hidden>
        {/* Tacche delle ore. */}
        {Array.from({ length: 24 }, (_, h) => {
          const major = h % 6 === 0;
          const [x1, y1] = polar(h * 60, R + STROKE / 2 + 7);
          const [x2, y2] = polar(h * 60, R + STROKE / 2 + (major ? 14 : 10));
          return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke={major ? 'var(--ink-3)' : 'var(--line-strong)'} strokeWidth={major ? 1.6 : 1} strokeLinecap="round" />;
        })}
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = polar(h * 60, R + STROKE / 2 + 26);
          return (
            <text key={h} x={x} y={y + 3.5} textAnchor="middle" className="font-mono" fontSize="10.5" fontWeight="500" fill="var(--ink-3)">
              {String(h).padStart(2, '0')}
            </text>
          );
        })}

        {/* Pista. */}
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--line)" strokeWidth={STROKE} opacity="0.85" />

        {/* Archi delle attività. */}
        {arcs.map((a, i) => (
          <g key={a.key}>
            <motion.path
              d={arcPath(a.from, a.to, R)}
              fill="none"
              stroke={halo(a.tone)}
              strokeWidth={STROKE + 6}
              strokeLinecap="round"
              opacity={0.18}
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease, delay: delay + i * 0.18 }}
              style={{ filter: 'blur(4px)' }}
            />
            <motion.path
              d={arcPath(a.from, a.to, R)}
              fill="none"
              stroke={toneColor(a.tone)}
              strokeWidth={STROKE}
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease, delay: delay + i * 0.18 }}
            />
          </g>
        ))}

        {/* Pasti. */}
        {mealMins.map((m, i) => {
          const [x, y] = polar(m, R);
          return (
            <motion.circle
              key={i}
              cx={x}
              cy={y}
              r={4.2}
              fill="var(--ink)"
              stroke="var(--bg)"
              strokeWidth={2}
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 520, damping: 22, delay: delay + 0.55 + i * 0.07 }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            />
          );
        })}

        {/* Coprifuoco del telefono: tacca all'interno. */}
        {(() => {
          const [x1, y1] = polar(curfew, R - STROKE / 2 - 3);
          const [x2, y2] = polar(curfew, R - STROKE / 2 - 12);
          return (
            <motion.line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--accent)"
              strokeWidth={2.4}
              strokeLinecap="round"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 1 }}
            />
          );
        })()}
      </svg>

      {/* Icone a metà degli archi. */}
      {arcs.map((a, i) => {
        const span = (((a.to - a.from) % 1440) + 1440) % 1440;
        const [x, y] = polar(a.from + span / 2, R + (span < 90 ? 0 : 0));
        const scale = size / S;
        return (
          <motion.span
            key={a.key}
            aria-hidden
            className="absolute grid size-[30px] place-items-center rounded-full shadow-[0_4px_14px_-4px_rgb(0_0_0/0.4)]"
            style={{ left: x * scale - 15, top: y * scale - 15, background: toneColor(a.tone), color: `var(--on-${a.tone})` }}
            initial={reduce ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22, delay: delay + 0.45 + i * 0.18 }}
          >
            {renderIcon(a.icon, 15, 2.5)}
          </motion.span>
        );
      })}

      {/* Centro: il marchio. */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-1.5">
          <svg viewBox="180 140 160 232" width={size * 0.17} height={size * 0.17 * 1.45} aria-hidden>
            <path
              d="M193 154 H269 C298 154 317 173 317 203 V221 C317 245 303 261 283 267 L323 358 H274 L239 272 V358 H193 Z M239 194 V234 H265 C274 234 278 228 278 220 V207 C278 199 274 194 265 194 Z"
              fill="var(--ink)"
              fillRule="evenodd"
            />
          </svg>
          <span className="t-label" style={{ color: toneInk('accent') }}>
            24 ore
          </span>
        </div>
      </div>
    </div>
  );
}
