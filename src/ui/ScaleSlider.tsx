import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { haptic } from '../lib/haptics';
import { fmtNumber } from '../lib/format';
import { cn } from './cn';
import { springSnappy } from './motion';

export type ScaleScheme = 'pain' | 'energy' | 'neutral';

export interface ScaleSliderProps {
  /**
   * Undefined = non ancora indicato: niente cursore, linea tratteggiata e l'invito a toccarla.
   * Nessun valore di partenza, così un dato mai dato non sembra già registrato.
   */
  value: number | undefined;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /**
   * pain: verde → ambra → rosso (0 = nessun dolore) · energy: rosso → ambra → verde ·
   * neutral: accento.
   */
  scheme?: ScaleScheme;
  lowLabel?: string;
  highLabel?: string;
  /** Soglia da evidenziare sulla pista (es. soglia del dolore). */
  threshold?: number;
  /** Valore di riferimento (es. quello di ieri): un piccolo anello vuoto sulla pista. */
  ghost?: number;
  /** Come leggere il riferimento ai lettori di schermo, es. "ieri" (default "l'ultima volta"). */
  ghostLabel?: string;
  /** Descrizione del valore per i lettori di schermo e sotto il numero (es. "lieve"). */
  describe?: (v: number) => string;
  /** Invito mostrato quando il valore non è indicato. Default "Tocca un punto della linea". */
  placeholder?: string;
  hideLabel?: boolean;
  className?: string;
}

const GRADIENT: Record<ScaleScheme, string> = {
  pain: 'linear-gradient(90deg, var(--good), color-mix(in oklch, var(--good) 45%, var(--warn)) 30%, var(--warn) 55%, var(--bad))',
  energy: 'linear-gradient(90deg, var(--bad), var(--warn) 45%, color-mix(in oklch, var(--warn) 45%, var(--good)) 70%, var(--good))',
  // L'ambra è luce: piena, mai diluita sul blu (diventerebbe oliva).
  neutral: 'var(--accent)',
};

/** Colore del valore sulla scala. */
export function scaleColor(v: number, min: number, max: number, scheme: ScaleScheme): string {
  const t = (v - min) / Math.max(1, max - min);
  if (scheme === 'neutral') return 'var(--accent)';
  const x = scheme === 'pain' ? t : 1 - t;
  // Energia: da 7 su 10 è già buona (verde); dolore: verde solo fino a 2-3.
  if (x <= (scheme === 'energy' ? 0.35 : 0.25)) return 'var(--good)';
  if (x <= 0.6) return 'var(--warn)';
  return 'var(--bad)';
}

/** Metà larghezza del cursore: la pista utile parte e finisce a questa distanza dai bordi. */
const INSET = 15;
/** Spostamento oltre il quale un tocco diventa un trascinamento (o uno scorrimento della pagina). */
const SLOP = 8;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Scala 0-10 con pista a gradiente, tacche e valore grande.
 *
 * Il valore si sceglie toccando un punto qualsiasi della linea (anche su iPhone, dove l'input range nativo
 * risponde solo trascinando il cursore) o trascinando in orizzontale; uno scorrimento verticale lascia
 * scorrere la pagina senza cambiare nulla. L'input range nativo resta sotto per tastiera e VoiceOver.
 */
export function ScaleSlider({
  value,
  onChange,
  label,
  min = 0,
  max = 10,
  step = 1,
  scheme = 'pain',
  lowLabel,
  highLabel,
  threshold,
  ghost,
  ghostLabel = 'l’ultima volta',
  describe,
  placeholder = 'Tocca un punto della linea',
  hideLabel,
  className,
}: ScaleSliderProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; active: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const span = Math.max(1e-9, max - min);
  const decimals = step < 1 ? Math.min(2, (String(step).split('.')[1] ?? '').length || 1) : 0;
  const snap = (n: number) => clamp(Math.round((n - min) / step) * step + min, min, max);
  const set = value !== undefined && Number.isFinite(value);
  const hasGhost = ghost !== undefined && Number.isFinite(ghost);
  // Senza valore l'input nativo (solo tastiera e VoiceOver) parte dal riferimento, o dal minimo: mai da metà scala.
  const rest = hasGhost ? snap(ghost) : min;
  const v = set ? clamp(value, min, max) : rest;
  const frac = (v - min) / span;
  const pct = frac * 100;
  const color = set ? scaleColor(v, min, max, scheme) : 'var(--ink-3)';
  const ticks = Math.round(span / step) + 1;
  const at = (n: number) => `calc(${INSET}px + (100% - ${INSET * 2}px) * ${(clamp(n, min, max) - min) / span})`;
  const fmt = (n: number) => fmtNumber(n, decimals);

  const commit = (n: number) => {
    if (n === value) return;
    haptic('selection');
    onChange(n);
  };

  const valueAt = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return v;
    const r = el.getBoundingClientRect();
    const t = clamp((clientX - r.left - INSET) / Math.max(1, r.width - INSET * 2), 0, 1);
    return snap(min + t * span);
  };

  const begin = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    g.active = true;
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* il puntatore è già stato rilasciato */
    }
  };

  const end = () => {
    gesture.current = null;
    setDragging(false);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false };
    const el = trackRef.current;
    const nearThumb =
      set && el ? Math.abs(e.clientX - (el.getBoundingClientRect().left + INSET + (el.clientWidth - INSET * 2) * frac)) < 24 : false;
    // Mouse e penna rispondono subito; con il dito si aspetta di capire se è un tocco, un trascinamento
    // orizzontale o lo scorrimento della pagina (che non deve cambiare il valore). Sul cursore si trascina subito.
    if (e.pointerType !== 'touch' || nearThumb) {
      begin(e);
      if (!nearThumb) commit(valueAt(e.clientX));
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.active) {
      const dx = Math.abs(e.clientX - g.x);
      const dy = Math.abs(e.clientY - g.y);
      if (dy > SLOP && dy >= dx) {
        end();
        return;
      }
      if (dx <= SLOP) return;
      begin(e);
    }
    commit(valueAt(e.clientX));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.active && Math.hypot(e.clientX - g.x, e.clientY - g.y) <= SLOP + 2) commit(valueAt(e.clientX));
    end();
  };

  const valueText = set ? `${fmt(v)}${describe ? `, ${describe(v)}` : ''}` : 'non indicato';
  const ghostText = hasGhost ? `; ${ghostLabel} ${fmtNumber(ghost, 1)}` : '';

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className={cn('flex min-h-8 flex-wrap items-baseline gap-x-3 gap-y-0.5', hideLabel ? 'justify-end' : 'justify-between')}>
        {!hideLabel && (
          <label htmlFor={id} className="t-headline min-w-0 text-ink">
            {label}
          </label>
        )}
        {set ? (
          <div className="ml-auto flex items-baseline gap-1.5" aria-hidden>
            <motion.span
              key={v}
              initial={{ scale: 0.86, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={springSnappy}
              className="t-num inline-block text-[2rem]"
              style={{ color }}
            >
              {fmt(v)}
            </motion.span>
            {describe && <span className="t-footnote text-ink-2">{describe(v)}</span>}
          </div>
        ) : (
          <span className="t-footnote ml-auto text-right text-ink-3" aria-hidden>
            {placeholder}
          </span>
        )}
      </div>

      <div
        ref={trackRef}
        data-no-drag
        className="relative h-11 cursor-pointer touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={end}
        onLostPointerCapture={() => gesture.current?.active && end()}
      >
        {/* Input nativo: tastiera e lettori di schermo. Il tocco lo gestisce il contenitore (vedi sopra). */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          aria-label={hideLabel ? label : undefined}
          aria-valuetext={`${valueText}${ghostText}`}
          onChange={(e) => commit(snap(Number(e.target.value)))}
          onKeyDown={(e) => {
            if (!set && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              commit(rest);
            }
          }}
          className="ritmo-range pointer-events-none absolute inset-0"
        />

        {set ? (
          <div
            className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full"
            style={{ left: INSET, right: INSET }}
            aria-hidden
          >
            {/* Pista vuota neutra (i colori diluiti sul blu diventano fango); il colore è solo nella parte piena. */}
            <div className="absolute inset-0 bg-[var(--ring-track)]" />
            <div
              className={cn('absolute inset-y-0 left-0 rounded-full', !dragging && !reduce && 'transition-[width] duration-200 ease-out')}
              style={{ width: `${pct}%`, background: GRADIENT[scheme], backgroundSize: `${(100 / Math.max(pct, 1)) * 100}% 100%` }}
            />
            <div className="absolute inset-0 flex justify-between">
              {Array.from({ length: ticks }, (_, i) => (
                <span key={i} className="my-auto h-1 w-1 rounded-full bg-[var(--bg)] opacity-60" />
              ))}
            </div>
          </div>
        ) : (
          // Non indicato: linea tratteggiata, nessun cursore. Si accende con il focus da tastiera.
          <div
            className="ritmo-dash pointer-events-none absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
            style={{
              left: INSET,
              right: INSET,
              backgroundImage: 'repeating-linear-gradient(90deg, var(--ink-4) 0 6px, transparent 6px 12px)',
            }}
            aria-hidden
          >
            <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-ink-4" />
            <span className="absolute -right-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-ink-4" />
          </div>
        )}

        {threshold !== undefined && Number.isFinite(threshold) && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-2"
            style={{ left: at(threshold) }}
          />
        )}

        {hasGhost && (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card',
              set ? 'size-3.5 border-ink-3' : 'size-4 border-ink-2',
            )}
            style={{ left: at(ghost) }}
          />
        )}

        {set && (
          <div className="ritmo-thumb-rail pointer-events-none absolute inset-y-0" style={{ left: INSET, right: INSET }} aria-hidden>
            <motion.span
              className="ritmo-thumb absolute top-1/2 size-7 rounded-full bg-white"
              style={{ x: '-50%', y: '-50%', boxShadow: `0 0 0 3px ${color}, 0 2px 10px rgb(0 0 0 / 0.32)` }}
              initial={{ left: `${pct}%`, scale: 0.6, opacity: 0 }}
              animate={{ left: `${pct}%`, scale: dragging ? 1.1 : 1, opacity: 1 }}
              transition={dragging || reduce ? { left: { duration: 0 }, default: springSnappy } : springSnappy}
            />
          </div>
        )}
      </div>

      {(lowLabel || highLabel) && (
        <div className="t-caption flex justify-between text-ink-3" aria-hidden>
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}
