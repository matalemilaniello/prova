/**
 * Vibrazione leggera al tocco.
 * - Android e browser con Vibration API: navigator.vibrate.
 * - iOS (Safari 18+, anche installata come app): non ha navigator.vibrate, ma attivare un
 *   `<input type="checkbox" switch>` produce il "tic" del sistema. Funziona solo dentro un gesto.
 * La vibrazione non è movimento: non dipende da prefers-reduced-motion. Si spegne con setHapticsEnabled(false).
 */

export type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  selection: 8,
  light: 12,
  medium: 20,
  success: [12, 60, 18],
  warning: [20, 80, 20],
  error: [30, 60, 30, 60, 30],
};

let enabled = true;

export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

let iosSwitch: HTMLLabelElement | null = null;

function iosTick(times = 1) {
  if (typeof document === 'undefined') return;
  try {
    if (!iosSwitch) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9px;top:-9px';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitch = label;
    }
    const label = iosSwitch;
    const tick = () => {
      // Il clic sull'etichetta può spostare il focus sull'interruttore nascosto: lo restituiamo subito.
      const prev = document.activeElement as HTMLElement | null;
      label.click();
      if (prev && document.activeElement !== prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
    for (let i = 0; i < times; i++) {
      if (i === 0) tick();
      else window.setTimeout(tick, i * 90);
    }
  } catch {
    /* nessuna vibrazione disponibile */
  }
}

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1));

/** Vibrazione breve. Da chiamare dentro un gestore di tocco. */
export function haptic(kind: HapticKind = 'light'): void {
  if (!enabled || typeof navigator === 'undefined') return;
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERNS[kind]);
      return;
    }
    if (isIOS()) iosTick(kind === 'success' || kind === 'warning' ? 2 : kind === 'error' ? 3 : 1);
  } catch {
    /* ignora */
  }
}
