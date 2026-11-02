/**
 * Testi della card "Adesso", senza interfaccia: si possono verificare nei test.
 *
 * I valori dei pasti arrivano già calcolati da `dayNutritionDetail` (tipo di giorno effettivo, vigilia
 * compresa, e scala del piano `dayCarbScale`): sono gli stessi numeri di Settimana e della scheda della ricetta.
 */
import type { HHMM, MealSlot, Nutrients, WorkoutSession } from '../../domain/types';
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
  /** Seduta del giorno (`sessionFor`: blocco in vigore, settimana scaricata o leggera); senza, la seduta fissa dello slot. */
  session?: WorkoutSession | null;
  /** Prima spesa dei giorni di avvio, per i pasti che vengono prima (`DayItem.preShopping`). */
  shopping?: { time: HHMM; tomorrow: boolean } | null;
}

/** Cosa dice la card Adesso di un pasto prima della spesa: niente ricetta, solo come comporre il piatto. */
export const PRE_SHOPPING_HEADLINE = 'Con quello che hai in casa';

function preShoppingSub(shopping: NowContentContext['shopping']): string {
  const when = !shopping ? '' : shopping.tomorrow ? ` di domani alle ${shopping.time}` : ` delle ${shopping.time}`;
  return `Proteine, un carboidrato e frutta o verdura. Il menù parte dopo la spesa${when}.`;
}

/** Pillola dei pasti che cadono durante il lavoro (`DayItem.carry`). */
export const CARRY_META = 'Da portare';

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

/**
 * Categoria nell'occhiello della card Adesso ("Prossima · tra 55 min · Merenda pre-partita"): breve, fino alla
 * prima virgola, e taciuta quando il titolo la dice già ("Controllo del mattino" non ripete "Mattino").
 */
export function eyebrowKicker(kicker: string, headline: string): string | null {
  const k = kicker.split(',')[0].trim();
  if (!k || headline.toLowerCase().includes(k.toLowerCase())) return null;
  return k;
}

/** Valori del pasto della voce, presi dal dettaglio del giorno (null se la voce non ha ricetta). */
export function mealNutrientsFor(item: DayItem, mealValues: Partial<Record<MealSlot, Nutrients>>): Nutrients | null {
  if (item.kind !== 'pasto' || !item.slot || !item.ref) return null;
  return mealValues[item.slot] ?? null;
}

export function nowContent(item: DayItem, ctx: NowContentContext): NowContent {
  switch (item.kind) {
    case 'pasto': {
      if (item.preShopping) return { kicker: item.title, headline: PRE_SHOPPING_HEADLINE, sub: preShoppingSub(ctx.shopping), meta: [] };
      const recipe = item.ref ? RECIPES[item.ref] : undefined;
      // Un pasto che cade durante il lavoro lo dice per primo: si porta da casa.
      const carry = item.carry ? CARRY_META : '';
      if (!recipe) return { kicker: item.title, headline: item.detail ?? item.title, meta: [carry].filter(Boolean) };
      const n = mealNutrientsFor(item, ctx.mealValues);
      return {
        kicker: item.title,
        headline: recipe.name,
        meta: [carry, n ? fmtKcal(n.kcal) : '', n ? `${Math.round(n.proteinG)} g proteine` : '', fmtMinutes(recipe.prepMin)].filter(Boolean),
      };
    }
    case 'palestra': {
      const s = ctx.session ?? SESSIONS[item.ref ?? ''];
      return {
        kicker: item.title,
        headline: s?.subtitle ?? item.title,
        // La seduta e, a parte, il blocco del fisioterapista: nella card protagonista "45 + 24 min" non si capirebbe.
        meta: [
          ctx.gym ? fmtMinutes(ctx.gym.own) : s ? fmtMinutes(s.estMin) : '',
          ctx.gym?.physio ? `+\u00a0${fmtMinutes(ctx.gym.physio)} dal fisioterapista` : '',
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
      return { kicker: item.title, headline: item.detail ?? item.title, meta: [item.carry ? 'Da portare con il pasto' : 'Con il pasto'] };
    case 'minima':
      return { kicker: 'Giornata minima', headline: item.title, sub: item.detail, meta: item.carry ? [CARRY_META] : [] };
    case 'spesa':
      if (item.id === STARTER_SHOPPING_ID) {
        // Solo il numero dei prodotti: che le ricette siano veloci lo dice il menù, la pillola restava su due righe.
        return { kicker: 'Primi giorni', headline: item.title, meta: [item.detail?.split(',')[0] ?? ''].filter(Boolean) };
      }
      return { kicker: 'Rito del sabato', headline: item.title, meta: ['Lista pronta, per reparto'] };
    case 'preparazione':
      return { kicker: 'Rito della domenica', headline: item.title, meta: (item.detail ?? '').split(' · ').filter(Boolean) };
    case 'revisione':
      return { kicker: 'Rito della domenica', headline: 'Revisione della settimana', meta: ['10 minuti'] };
  }
}
