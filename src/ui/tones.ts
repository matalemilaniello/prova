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

/** Sfondo tenue del tono (mescola il colore con la trasparenza). */
export function toneSoft(tone: AnyTone, pct = 14): string {
  if (tone === 'neutral') return 'var(--ink-soft)';
  return `color-mix(in srgb, ${toneColor(tone)} ${pct}%, transparent)`;
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
