/**
 * Cornice comune dei grafici: misura della larghezza, griglia con etichette, etichette delle date,
 * punto finale evidenziato e "scrub" (dito, mouse o frecce) per leggere il valore di un giorno.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { haptic } from '../../../lib/haptics';

export interface Geometry {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  innerW: number;
  innerH: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_PAD: Padding = { top: 14, right: 38, bottom: 24, left: 10 };

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Larghezza del contenitore (con ResizeObserver) e geometria del grafico. */
export function useGeometry(height: number, pad: Padding = DEFAULT_PAD) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(334);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const geo: Geometry = {
    width,
    height,
    left: pad.left,
    right: width - pad.right,
    top: pad.top,
    bottom: height - pad.bottom,
    innerW: Math.max(10, width - pad.left - pad.right),
    innerH: Math.max(10, height - pad.top - pad.bottom),
  };
  return { ref, geo };
}

/**
 * Lettura di un punto: tocco e trascinamento (iOS Health), passaggio del mouse, frecce da tastiera.
 * `xAt(i)` dà la x del punto i in coordinate del grafico.
 */
export function useScrub(count: number, xAt: (i: number) => number) {
  const [index, setIndex] = useState<number | null>(null);
  const down = useRef(false);
  const last = useRef<number | null>(null);

  const nearest = useCallback(
    (x: number) => {
      let best = 0;
      let dist = Infinity;
      for (let i = 0; i < count; i++) {
        const d = Math.abs(xAt(i) - x);
        if (d < dist) {
          dist = d;
          best = i;
        }
      }
      return best;
    },
    [count, xAt],
  );

  const set = useCallback((i: number | null) => {
    if (i !== null && i !== last.current) haptic('selection');
    last.current = i;
    setIndex(i);
  }, []);

  const fromEvent = (e: PointerEvent<SVGElement>) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    return nearest(e.clientX - rect.left);
  };

  const bind = {
    onPointerDown: (e: PointerEvent<SVGElement>) => {
      down.current = true;
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* non supportato */
      }
      set(fromEvent(e));
    },
    onPointerMove: (e: PointerEvent<SVGElement>) => {
      if (down.current || e.pointerType === 'mouse') set(fromEvent(e));
    },
    onPointerUp: (e: PointerEvent<SVGElement>) => {
      down.current = false;
      if (e.pointerType !== 'mouse') set(null);
    },
    onPointerCancel: () => {
      down.current = false;
      set(null);
    },
    onPointerLeave: (e: PointerEvent<SVGElement>) => {
      if (e.pointerType === 'mouse' && !down.current) set(null);
    },
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!count) return;
    const cur = index ?? count;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
    else if (e.key === 'ArrowRight') next = index === null ? count - 1 : Math.min(count - 1, cur + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else if (e.key === 'Escape') {
      set(null);
      return;
    } else return;
    e.preventDefault();
    set(next);
  };

  return { index, bind, onKeyDown, clear: () => set(null) };
}

// ───────────────────────── Primitive SVG ─────────────────────────

const LABEL_STYLE = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10.5,
  letterSpacing: '0.02em',
  fill: 'var(--ink-3)',
  fontVariantNumeric: 'tabular-nums',
} as const;

export function labelStyle(extra: Record<string, string | number> = {}) {
  return { ...LABEL_STYLE, ...extra };
}

/** Righe orizzontali con le etichette a destra (come Salute di iOS). */
export function YGrid({ geo, ticks, y, format, strongZero = false }: { geo: Geometry; ticks: number[]; y: (v: number) => number; format: (v: number) => string; strongZero?: boolean }) {
  return (
    <g aria-hidden>
      {ticks.map((t, i) => {
        const yy = Math.round(y(t)) + 0.5;
        const base = i === 0;
        return (
          <g key={t}>
            <line
              x1={geo.left - 4}
              x2={geo.right + 4}
              y1={yy}
              y2={yy}
              style={{ stroke: base && strongZero ? 'var(--line-strong)' : 'var(--line)', strokeWidth: 1, strokeDasharray: base ? undefined : '2 4' }}
            />
            <text x={geo.width} y={yy} dy="0.34em" textAnchor="end" style={LABEL_STYLE}>
              {format(t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Etichette dell'asse orizzontale. */
export function XLabels({ geo, items }: { geo: Geometry; items: { x: number; label: string; anchor?: 'start' | 'middle' | 'end' }[] }) {
  return (
    <g aria-hidden>
      {items.map((it) => (
        <text key={`${it.x}-${it.label}`} x={it.x} y={geo.bottom + 17} textAnchor={it.anchor ?? 'middle'} style={LABEL_STYLE}>
          {it.label}
        </text>
      ))}
    </g>
  );
}

/** Punto finale: alone tenue, pallino pieno, anello del colore della card. */
export function EndDot({ x, y, color, r = 4.5 }: { x: number; y: number; color: string; r?: number }) {
  return (
    <g aria-hidden>
      <circle cx={x} cy={y} r={r + 6} style={{ fill: color, opacity: 0.18 }} />
      <circle cx={x} cy={y} r={r + 1.75} style={{ fill: 'var(--card)' }} />
      <circle cx={x} cy={y} r={r} style={{ fill: color }} />
    </g>
  );
}

/** Linea verticale della lettura. */
export function ScrubRule({ geo, x }: { geo: Geometry; x: number }) {
  return <line aria-hidden x1={x} x2={x} y1={geo.top - 6} y2={geo.bottom} style={{ stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '3 3' }} />;
}

/** Contenitore SVG accessibile: descrizione per i lettori di schermo, focus visibile, frecce per leggere. */
export function ChartSvg({
  geo,
  label,
  onKeyDown,
  children,
  className,
}: {
  geo: Geometry;
  label: string;
  onKeyDown?: (e: KeyboardEvent) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      width={geo.width}
      height={geo.height}
      viewBox={`0 0 ${geo.width} ${geo.height}`}
      role="img"
      aria-label={label}
      tabIndex={onKeyDown ? 0 : undefined}
      onKeyDown={onKeyDown}
      className={className ?? 'block overflow-visible rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]'}
      style={{ touchAction: 'pan-y', WebkitTapHighlightColor: 'transparent' }}
    >
      {children}
    </svg>
  );
}
