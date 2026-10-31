/**
 * Tema: Settings.theme ('sistema' | 'scuro' | 'chiaro') → data-theme su <html> e meta theme-color.
 * Con 'sistema' segue prefers-color-scheme e i suoi cambi.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ThemePref } from '../domain/types';
import { useApp } from '../state/store';

export type ResolvedTheme = 'scuro' | 'chiaro';

/** Colore della barra di sistema per tema (= --bg). */
export const THEME_COLOR: Record<ResolvedTheme, string> = { scuro: '#0A1220', chiaro: '#F3F5F9' };

let override: ResolvedTheme | null = null;

/** Tema imposto dall'URL (?theme=), non salvato. */
export function setThemeOverride(t: ResolvedTheme | null) {
  override = t;
}

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null);

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (override) return override;
  if (pref === 'scuro' || pref === 'chiaro') return pref;
  return media()?.matches ? 'chiaro' : 'scuro';
}

type DocWithVT = Document & { startViewTransition?: (cb: () => void) => unknown };

/**
 * Applica il tema. Con `animate` (cambio fatto dall'utente) dissolve dolcemente tra i due temi
 * con la View Transitions API, se c'è e se il movimento non è ridotto.
 */
export function applyTheme(t: ResolvedTheme, animate = false) {
  const root = document.documentElement;
  if (root.dataset.theme !== t) {
    const doc = document as DocWithVT;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (animate && !reduce && typeof doc.startViewTransition === 'function') {
      try {
        doc.startViewTransition(() => {
          root.dataset.theme = t;
        });
      } catch {
        root.dataset.theme = t;
      }
    } else {
      root.dataset.theme = t;
    }
  }
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[t];
  window.dispatchEvent(new Event('ritmo:theme'));
}

function subscribeTheme(cb: () => void) {
  window.addEventListener('ritmo:theme', cb);
  return () => window.removeEventListener('ritmo:theme', cb);
}

/** Tema effettivo, aggiornato quando cambia. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribeTheme,
    () => (document.documentElement.dataset.theme === 'chiaro' ? 'chiaro' : 'scuro'),
    () => 'scuro',
  );
}

/** Tiene sincronizzati data-theme e theme-color con le impostazioni e con il sistema. */
export function useThemeSync() {
  const pref = useApp((s) => s.settings.theme);
  const first = useRef(true);
  useEffect(() => {
    // Una scelta esplicita nelle impostazioni vince sul tema forzato dall'URL.
    if (!first.current) setThemeOverride(null);
    applyTheme(resolveTheme(pref), !first.current);
    first.current = false;
    const m = media();
    if (!m || pref !== 'sistema') return;
    const onChange = () => applyTheme(resolveTheme(pref), true);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [pref]);
}
