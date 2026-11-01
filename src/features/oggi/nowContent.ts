/**
 * Testi della card "Adesso", senza interfaccia: si possono verificare nei test.
 *
 * I valori dei pasti arrivano già calcolati da `dayNutritionDetail` (tipo di giorno effettivo, vigilia
 * compresa, e scala del piano `dayCarbScale`): sono gli stessi numeri di Settimana e della scheda della ricetta.
 */
import type { HHMM, MealSlot, Nutrients } from '../../domain/types';
import { RECIPES } from '../../data/recipes';
import { SESSIONS } from '../../data/sessions';
import { STARTER_SHOPPING_ID, type DayItem, type NowPick } from '../../engine/timeline';
import type { SessionDuration } from '../../engine/training';
import { fmtKcal, fmtMinutes } from '../../lib/format';

export interface NowContent {
  kicker: string;
  headline: string;
  sub?: string;
  meta: string[];
}

export interface NowContentContext {
  /** Valori dei pasti del giorno per slot (`dayNutritionDetail(date, state).bySlot`). */
  mealValues: Partial<Record<MealSlot, Nutrients>>;
  /** Minuti al coprifuoco (negativo se passato). */
  curfewIn: number;
  bed: HHMM;
  /** L'etichetta in alto dice già tra quanto: le pillole non lo ripetono. */
  timeShown: boolean;
  /** Durata della seduta come in Allenamento (`gymDuration`): senza, vale `estMin`. */
  gym?: Pick<SessionDuration, 'own' | 'physio'> | null;
}

/** Il conto alla rovescia sta nell'etichetta solo entro 4 ore. */
export const COUNTDOWN_MAX_MIN = 240;

/** Parte dell'etichetta in alto e durata da tenere in minuscolo ("Adesso", "da 10 min"). */
export function stateLabel(pick: NowPick): { label: string; time?: string } {
  const d = pick.deltaMin;
  if (pick.item.kind === 'minima' && pick.item.id !== 'minima:telefono' && pick.state === 'adesso') return { label: 'Da fare oggi' };
  if (pick.state === 'adesso') return d < -2 ? { label: 'Adesso', time: `da ${fmtMinutes(-d)}` } : { label: 'Adesso' };
  if (pick.state === 'prossima') return d <= COUNTDOWN_MAX_MIN ? { label: 'Prossima', time: `tra ${fmtMinutes(d)}` } : { label: 'Prossima' };
  return { label: 'Da segnare' };
}

/** Valori del pasto della voce, presi dal dettaglio del giorno (null se la voce non ha ricetta). */
export function mealNutrientsFor(item: DayItem, mealValues: Partial<Record<MealSlot, Nutrients>>): Nutrients | null {
  if (item.kind !== 'pasto' || !item.slot || !item.ref) return null;
  return mealValues[item.slot] ?? null;
}

export function nowContent(item: DayItem, ctx: NowContentContext): NowContent {
  switch (item.kind) {
    case 'pasto': {
      const recipe = item.ref ? RECIPES[item.ref] : undefined;
      if (!recipe) return { kicker: item.title, headline: item.detail ?? item.title, meta: [] };
      const n = mealNutrientsFor(item, ctx.mealValues);
      return {
        kicker: item.title,
        headline: recipe.name,
        meta: [n ? fmtKcal(n.kcal) : '', n ? `${Math.round(n.proteinG)} g proteine` : '', fmtMinutes(recipe.prepMin)].filter(Boolean),
      };
    }
    case 'palestra': {
      const s = SESSIONS[item.ref ?? ''];
      return {
        kicker: item.title,
        headline: s?.subtitle ?? item.title,
        sub: s?.focus,
        meta: [
          ctx.gym ? fmtMinutes(ctx.gym.own) : s ? fmtMinutes(s.estMin) : '',
          ctx.gym?.physio ? `+ ${ctx.gym.physio} dal fisioterapista` : '',
          item.detail?.startsWith('Facoltativa') ? 'Facoltativa' : '',
        ].filter(Boolean),
      };
    }
    case 'calcio':
      return { kicker: 'Calcio', headline: item.title, meta: (item.detail ?? '').split(', ').filter(Boolean) };
    case 'controllo':
      return { kicker: 'Mattino', headline: item.title, meta: ['Meno di 30 secondi'] };
    case 'coprifuoco':
      return {
        kicker: 'Sera',
        headline: 'Telefono fuori dalla camera',
        meta: [ctx.timeShown ? '' : ctx.curfewIn > 0 ? `Tra ${fmtMinutes(ctx.curfewIn)}` : 'È ora', `A letto alle ${ctx.bed}`].filter(Boolean),
      };
    case 'letto':
      return { kicker: 'Notte', headline: 'A letto', meta: (item.detail ?? '').split(' · ').filter(Boolean) };
    case 'fisio':
      return { kicker: 'Fisioterapista', headline: item.title, meta: (item.detail ?? '').split(' · ').filter(Boolean) };
    case 'integratori':
      return { kicker: item.title, headline: item.detail ?? item.title, meta: ['Con il pasto'] };
    case 'minima':
      return { kicker: 'Giornata minima', headline: item.title, sub: item.detail, meta: [] };
    case 'spesa':
      if (item.id === STARTER_SHOPPING_ID) {
        return {
          kicker: 'Primi giorni',
          headline: item.title,
          sub: 'La lista copre i pasti fino alla prima preparazione: ricette veloci, niente da cucinare in anticipo.',
          meta: ['Lista pronta'],
        };
      }
      return {
        kicker: 'Rito del sabato',
        headline: item.title,
        sub: 'La lista somma tutti i pasti della settimana prossima, divisa per reparto.',
        meta: ['Lista pronta'],
      };
    case 'preparazione':
      return {
        kicker: 'Rito della domenica',
        headline: item.title,
        sub: 'Una volta sola: pranzi e basi pronti per i giorni feriali.',
        meta: (item.detail ?? '').split(' · ').filter(Boolean),
      };
    case 'revisione':
      return {
        kicker: 'Rito della domenica',
        headline: 'Revisione della settimana',
        sub: 'Voti, peso, sonno, dolori e carico: il piano si corregge da qui.',
        meta: ['10 minuti'],
      };
  }
}
