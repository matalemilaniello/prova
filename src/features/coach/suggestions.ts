/**
 * Suggerimenti rapidi del coach, in ordine utile per il momento della giornata.
 */
import { CalendarCheck, ChefHat, Coffee, Dumbbell, type LucideIcon } from 'lucide-react';

export type SuggestionId = 'bar' | 'cucina' | 'palestra' | 'settimana';

export interface Suggestion {
  id: SuggestionId;
  text: string;
  /** Testo breve per la pillola. */
  short: string;
  icon: LucideIcon;
}

export const SUGGESTIONS: Record<SuggestionId, Suggestion> = {
  bar: { id: 'bar', text: 'Sono al bar, cosa prendo?', short: 'Sono al bar, cosa prendo?', icon: Coffee },
  cucina: { id: 'cucina', text: 'Cosa cucino stasera con quello che ho?', short: 'Cosa cucino stasera?', icon: ChefHat },
  palestra: { id: 'palestra', text: 'Salto la palestra?', short: 'Salto la palestra?', icon: Dumbbell },
  settimana: { id: 'settimana', text: "Com'è andata la settimana?", short: "Com'è andata la settimana?", icon: CalendarCheck },
};

export interface SuggestionContext {
  /** Minuti dalla mezzanotte. */
  nowMin: number;
  /** 0 = lunedì … 6 = domenica. */
  weekday: number;
  /** Oggi c'è una seduta di palestra ancora da fare. */
  gymPending: boolean;
}

/** Tutti e quattro i suggerimenti, nell'ordine più utile adesso. */
export function orderedSuggestions(ctx: SuggestionContext): Suggestion[] {
  const score: Record<SuggestionId, number> = { bar: 0, cucina: 0, palestra: 0, settimana: 0 };
  const h = ctx.nowMin / 60;
  if (h < 12) score.bar += 3;
  else if (h < 15.5) score.bar += 2;
  if (h >= 16) score.cucina += 3;
  if (ctx.gymPending) score.palestra += h < 19 ? 4 : 1;
  if (ctx.weekday === 6 || (ctx.weekday === 0 && h < 12)) score.settimana += 5;
  else if (ctx.weekday >= 4) score.settimana += 1;
  const order: SuggestionId[] = ['bar', 'cucina', 'palestra', 'settimana'];
  return order
    .map((id, i) => ({ id, s: score[id] - i * 0.01 }))
    .sort((a, b) => b.s - a.s)
    .map(({ id }) => SUGGESTIONS[id]);
}
