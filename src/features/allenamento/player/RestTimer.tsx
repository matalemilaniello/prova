import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, SkipForward } from 'lucide-react';
import { haptic } from '../../../lib/haptics';
import { cn, springSnappy } from '../../../ui';
import type { RestState } from '../draft';

export interface RestTimerProps {
  rest: RestState;
  /** Cosa viene dopo (es. "Serie 3 · 22 kg × 10"). */
  nextLabel?: string;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
  /** Chiamata una volta quando il tempo scade. */
  onElapsed: () => void;
  /** Chiude il riquadro dopo la fine. */
  onDismiss: () => void;
}

const SIZE = 84;
const STROKE = 6;

/** Vibrazione decisa a fine recupero (si sente anche con il telefono sulla panca). */
function buzz() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([180, 90, 180, 90, 320]);
      return;
    }
  } catch {
    /* ignora */
  }
  haptic('success');
}

/** Secondi rimanenti, aggiornati 4 volte al secondo (si basa sull'orario, non sui tick: regge lo schermo spento). */
function useRemaining(endsAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    const onVis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [endsAt]);
  return Math.max(0, (endsAt - now) / 1000);
}

/**
 * Timer circolare del recupero (o della tenuta negli esercizi a tempo).
 * L'anello si svuota, a fine tempo vibra e diventa verde.
 */
export function RestTimer({ rest, nextLabel, onAdjust, onSkip, onElapsed, onDismiss }: RestTimerProps) {
  const reduce = useReducedMotion();
  const remaining = useRemaining(rest.endsAt);
  const finished = remaining <= 0.05;
  const fired = useRef(false);
  const hold = rest.mode === 'tenuta';
  // Un recupero finito da un pezzo (seduta riaperta dopo) si chiude in silenzio, senza vibrare.
  const stale = useRef(rest.endsAt < Date.now() - 3000);
  const lastEnds = useRef(rest.endsAt);
  if (lastEnds.current !== rest.endsAt) {
    lastEnds.current = rest.endsAt;
    stale.current = false;
  }

  useEffect(() => {
    if (finished && !fired.current) {
      fired.current = true;
      if (stale.current) return onDismiss();
      buzz();
      onElapsed();
    }
    if (!finished) fired.current = false;
  }, [finished, onElapsed, onDismiss]);

  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const frac = rest.total > 0 ? Math.min(1, remaining / rest.total) : 0;
  const secs = Math.ceil(remaining);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const color = finished ? 'var(--good)' : hold ? 'var(--accent)' : 'var(--palestra)';
  const urgent = !finished && secs <= 5;

  return (
    <div className="flex items-center gap-4" role="timer" aria-live="off" aria-label={finished ? 'Recupero finito' : `${hold ? 'Tenuta' : 'Recupero'}: ${clock}`}>
      <div className="relative grid shrink-0 place-items-center" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="var(--ink-soft)" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={finished ? 0 : c * (1 - frac)}
            style={{ transition: reduce ? undefined : 'stroke-dashoffset 260ms linear, stroke 300ms ease' }}
          />
        </svg>
        {finished && !reduce && (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1 rounded-full"
            style={{ border: '2px solid var(--good)', animation: 'ritmo-glow 1.1s var(--ease-out) both', boxShadow: '0 0 22px var(--good)' }}
          />
        )}
        <div className="relative flex flex-col items-center">
          {finished ? (
            <Check size={34} strokeWidth={2.6} className="text-good-ink" aria-hidden />
          ) : (
            <motion.span
              key={urgent ? secs : 'steady'}
              initial={urgent && !reduce ? { scale: 1.18 } : false}
              animate={{ scale: 1 }}
              transition={springSnappy}
              className={cn('t-num text-[1.625rem]', urgent ? 'text-accent-ink' : 'text-ink')}
            >
              {clock}
            </motion.span>
          )}
        </div>
      </div>

      <span className="sr-only" aria-live="assertive">
        {finished ? (hold ? 'Tenuta finita' : 'Recupero finito, tocca a te') : ''}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <p className="t-label" style={{ color: finished ? 'var(--good-ink)' : hold ? 'var(--accent-ink)' : 'var(--palestra-ink)' }}>
            {finished ? (hold ? 'Tenuta finita' : 'Recupero finito') : hold ? 'Tenuta' : 'Recupero'}
          </p>
          <p className="t-callout mt-0.5 truncate font-semibold text-ink">{finished ? (hold ? 'Segnata, riprendi fiato' : 'Tocca a te') : nextLabel ?? 'Respira e preparati'}</p>
        </div>
        <div className="flex items-center gap-2">
          {finished ? (
            <button type="button" onClick={onDismiss} className="h-10 flex-1 rounded-[12px] bg-good-soft px-3 text-[0.875rem] font-semibold text-good-ink">
              Chiudi
            </button>
          ) : (
            <>
              {!hold && (
                <>
                  <AdjustButton label="Togli 15 secondi" onClick={() => onAdjust(-15)}>
                    −15
                  </AdjustButton>
                  <AdjustButton label="Aggiungi 15 secondi" onClick={() => onAdjust(15)}>
                    +15
                  </AdjustButton>
                </>
              )}
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                transition={springSnappy}
                onClick={() => {
                  haptic('selection');
                  onSkip();
                }}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-control px-3 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--control-line)]"
              >
                <SkipForward size={15} strokeWidth={2.4} aria-hidden />
                {hold ? 'Ferma' : 'Salta'}
              </motion.button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AdjustButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      whileTap={{ scale: 0.92 }}
      transition={springSnappy}
      onClick={() => {
        haptic('selection');
        onClick();
      }}
      className="t-mono h-10 w-[52px] shrink-0 rounded-[12px] bg-control text-[0.875rem] font-medium text-ink shadow-[inset_0_0_0_1px_var(--control-line)]"
    >
      {children}
    </motion.button>
  );
}
