import { useCallback, useEffect, useRef } from 'react';
import { haptic } from '../lib/haptics';

export interface LongPressOptions {
  /** Tocco breve (se non è scattata la pressione lunga). */
  onPress?: () => void;
  /** Millisecondi per la pressione lunga (default 450). */
  delay?: number;
  /** Spostamento oltre il quale il gesto diventa uno scorrimento e si annulla (default 10 px). */
  moveTolerance?: number;
}

/**
 * Tocco breve e pressione lunga sullo stesso elemento (es. voce della timeline: tocco = fatto,
 * pressione lunga = foglio con le opzioni). Vibra quando scatta la pressione lunga, annulla se il dito
 * scorre, blocca il menu contestuale. Tastiera: Invio = tocco, Maiusc+Invio o tasto menu = pressione lunga.
 *
 *   const lp = useLongPress(() => openOptions(), { onPress: markDone });
 *   <button {...lp}>…</button>
 */
export function useLongPress(onLongPress: () => void, { onPress, delay = 450, moveTolerance = 10 }: LongPressOptions = {}) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cbLong = useRef(onLongPress);
  const cbPress = useRef(onPress);
  cbLong.current = onLongPress;
  cbPress.current = onPress;

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        haptic('medium');
        cbLong.current();
      }, delay);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current || timer.current === null) return;
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > moveTolerance) {
        clear();
        start.current = null;
      }
    },
    onPointerUp: () => clear(),
    onPointerLeave: () => clear(),
    onPointerCancel: () => {
      clear();
      start.current = null;
    },
    onClick: (e: React.MouseEvent) => {
      if (fired.current) {
        e.preventDefault();
        fired.current = false;
        return;
      }
      if (start.current === null && e.detail > 0) return; // era uno scorrimento
      cbPress.current?.();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' && e.shiftKey) || e.key === 'ContextMenu') {
        e.preventDefault();
        cbLong.current();
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
