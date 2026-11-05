/** Cosa prevede il piano per un pasto: la ricetta (con gli scambi del giorno), il tipo di giorno, la stima già segnata. */
import { useMemo } from 'react';
import type { DayType, EatenMeal, ISODate, MealSlot, Recipe } from '../../domain/types';
import { mealsForDate } from '../../engine/menu';
import { dayCarbScale, eatenMeal } from '../../engine/nutrition';
import { useDayLog, useNutritionState } from '../../state/hooks';

export interface MealContext {
  planned?: Recipe;
  dayType: DayType;
  carbScale: number;
  /** Stima che vale già per la voce: la foto nuova la sostituisce e la scheda lo dice. */
  previous: EatenMeal | null;
}

export function useMealContext(date: ISODate, slot: MealSlot): MealContext {
  const ns = useNutritionState();
  const log = useDayLog(date);
  return useMemo(() => {
    const meals = mealsForDate(date, ns);
    return {
      planned: meals.bySlot[slot]?.recipe,
      dayType: meals.dayType,
      carbScale: dayCarbScale(date, ns),
      previous: eatenMeal(log, slot),
    };
  }, [date, slot, ns, log]);
}
