import type { DayType } from '../domain/types';

/** Toni semantici del design system. */
export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad';
/** Toni semantici più i colori dei tipi di giorno. */
export type AnyTone = Tone | DayType;

/** Colore pieno del tono (variabile CSS). */
export function toneColor(tone: AnyTone): string {
  switch (tone) {
    case 'neutral':
      return 'var(--ink-2)';
    case 'accent':
      return 'var(--accent)';
    default:
      return `var(--${tone})`;
  }
}

/** Colore del testo del tono, leggibile su card (nel chiaro l'accento usa accent-ink). */
export function toneInk(tone: AnyTone): string {
  switch (tone) {
    case 'neutral':
      return 'var(--ink-2)';
    case 'accent':
      return 'var(--accent-ink)';
    default:
      return `var(--${tone}-ink)`;
  }
}

/** Toni caldi: diluiti sul blu notte diventano grigio oliva, quindi nel tema scuro non si diluiscono. */
const WARM = new Set<AnyTone>(['accent', 'calcio', 'warn']);

/**
 * Sfondo tenue del tono. Nel tema chiaro mescola il colore con la trasparenza. Nel tema scuro i toni caldi
 * (accento, calcio, attenzione) restano una superficie blu (`--warm-tint`) e il colore passa a testo, icona e
 * anello (`toneRing`): l'ambra è luce, non riempimento. Con `pct` ≥ 30 (riempimenti pieni, barre) il colore
 * si mescola sempre.
 */
export function toneSoft(tone: AnyTone, pct = 14): string {
  if (tone === 'neutral') return 'var(--ink-soft)';
  const mix = `color-mix(in srgb, ${toneColor(tone)} ${pct}%, transparent)`;
  if (pct < 30 && WARM.has(tone)) return `var(--warm-tint, ${mix})`;
  return mix;
}

/**
 * Anello interno di 1 px nel colore del tono (box-shadow), da affiancare a `toneSoft` su tessere, pillole e
 * riquadri: nel tema scuro è il bordo di luce che sostituisce il fondo colorato.
 */
export function toneRing(tone: AnyTone, pct = 30): string {
  if (tone === 'neutral') return 'inset 0 0 0 1px var(--control-line)';
  return `inset 0 0 0 1px color-mix(in srgb, ${toneColor(tone)} ${pct}%, transparent)`;
}

/** Luce di bordo in alto (box-shadow inset di 1 px), come un riflettore che sfiora la superficie. */
export function toneEdge(tone: AnyTone, pct = 45): string {
  return `inset 0 1px 0 0 color-mix(in srgb, ${toneColor(tone)} ${pct}%, transparent)`;
}

/** Colore del testo sopra il tono pieno (contrasto AA in entrambi i temi). */
export function toneOn(tone: AnyTone): string {
  switch (tone) {
    case 'neutral':
      return 'var(--bg)';
    case 'accent':
      return 'var(--on-accent)';
    default:
      return `var(--on-${tone})`;
  }
}
