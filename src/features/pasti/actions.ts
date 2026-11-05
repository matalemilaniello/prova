/**
 * Azioni del foglio dei pasti (§ 7.5, § 8.2): la conferma scrive stima e stato della voce in una sola transazione
 * (`setEatenMeal`), con l'avviso «Annulla» che rimette tutto com'era (`mealSnapshot` e `restoreMeal`). Niente si salva
 * prima della conferma.
 */
import type { EatenMeal, ISODate, MealSlot, MyDish, Portion } from '../../domain/types';
import { currentDate } from '../../engine/dates';
import { dishMeal, newDish } from '../../engine/dishes';
import { oneLine } from '../../engine/estimate';
import { haptic } from '../../lib/haptics';
import { uid } from '../../lib/id';
import { thumbnail } from '../../lib/image';
import { useApp, useUi } from '../../state/store';
import { markedToast } from './logic';

const lowerFirst = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Nota della voce per un pasto sostituito: quello che si è mangiato al posto del previsto. */
export function mealNote(meal: EatenMeal): string {
  if (meal.asPlanned) return '';
  const name = lowerFirst(oneLine(meal.label, 40));
  return meal.source === 'piatto' ? `Il mio piatto: ${name}` : `Dalla foto: ${name}`;
}

/**
 * Segna un pasto stimato (foto o piatto salvato) con l'avviso «Annulla». `onUndo` avvisa chi ha ancora il foglio aperto
 * (la scheda torna modificabile).
 */
export function markEatenMeal(date: ISODate, slot: MealSlot, meal: EatenMeal, opts: { onUndo?: () => void; afterUndo?: () => void } = {}): void {
  const s = useApp.getState();
  const snap = s.mealSnapshot(date, slot);
  s.setEatenMeal(date, slot, meal, { note: mealNote(meal) });
  haptic('success');
  useUi.getState().toast(markedToast(slot, meal.nutrients.kcal), 'good', {
    actionLabel: 'Annulla',
    onAction: () => {
      useApp.getState().restoreMeal(date, slot, snap);
      opts.onUndo?.();
      opts.afterUndo?.();
    },
  });
}

/** Segna un piatto salvato alla porzione scelta; la porzione resta scelta per la volta dopo. */
export function markDish(date: ISODate, slot: MealSlot, dish: MyDish, portion: Portion, asPlanned: boolean): void {
  const prevPortion = dish.lastPortion;
  markEatenMeal(date, slot, dishMeal(dish, portion, asPlanned), {
    afterUndo: () => {
      if (prevPortion !== portion) useApp.getState().updateDish(dish.id, { lastPortion: prevPortion ?? 1 });
    },
  });
  if (dish.lastPortion !== portion) useApp.getState().updateDish(dish.id, { lastPortion: portion });
}

/**
 * Salva tra i miei piatti gli alimenti di una stima confermata, con la miniatura da 96 px della foto (se c'è e se si
 * riesce a ridurla). Restituisce il piatto salvato, o null se non c'era niente da salvare.
 */
export async function saveDishFromMeal(slot: MealSlot, meal: EatenMeal, name: string, photo?: string | null): Promise<MyDish | null> {
  const dish = newDish({ id: uid('piatto'), name, slot, items: meal.items ?? [], createdAt: currentDate().toISOString() });
  if (!dish) return null;
  const thumb = photo ? await thumbnail(photo) : null;
  useApp.getState().saveDish(dish, thumb ?? undefined);
  haptic('success');
  useUi.getState().toast('Salvato tra i miei piatti', 'good');
  return dish;
}
