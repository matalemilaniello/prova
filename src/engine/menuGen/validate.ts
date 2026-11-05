/**
 * Validatore del menù di una settimana (docs/FASE2.md § 4.2, § 4.10): i vincoli duri H0-H6 in ordine di priorità, con i
 * codici di `Violation.code`. Lo usano la rotazione e il menù di avvio nei test, il generatore nel controllo finale e i
 * ritocchi del coach (onda 3B), che si tengono solo se non aggiungono violazioni.
 *
 * - H0 · esclusioni e divieti A1-A3: `escluso`, `vietato`.
 * - H1 · contesto del giorno: `pre-calcio`, `recupero`, `fibre-pranzo-calcio`, `legumi-vigilia`, `legumi-calcio`,
 *   `preparazione-domenica`, `carboidrati-partita` (6 g/kg raggiungibili entro `CARB_SCALE_MAX` e kcal entro ±5% a
 *   partita e vigilia), `da-portare` (pasti che cadono nel lavoro), `pasto-vuoto`, `pasto-sbagliato`, `preparazione`
 *   (una ricetta da preparazione senza il suo compito della domenica).
 * - H2 · giorno: `kcal-giorno` (±8%), `proteine-giorno` (≥ obiettivo − 10 g, ≤ +25%), `carboidrati-giorno` e
 *   `grassi-giorno` (±15%, grassi ≥ 20% delle kcal e ≥ obiettivo − 15 g), `fibre-giorno` (A7: 30-45 g, 40 con il calcio
 *   la sera o alla vigilia), `vegetali-giorno` (A6: 5 porzioni).
 * - H3 · prevenzione: `carne-rossa-settimana` (A4), `riso-settimana` e `riso-cottura` (A5), `legumi-settimana` e
 *   `legumi-giorno` (A8), `integrali-settimana` (A9), `zuccheri-liberi` (A10).
 * - H4 · spesa: `prodotti` (≤ 40), `confezione`, `doppione`, `prodotti-nuovi` (al massimo 2 freschi nuovi a settimana).
 * - H5 · stagione: `fuori-stagione`.
 * - H6 · varietà: `varieta` (pesce e uova 2-3 pasti, colazioni, spuntini, pranzi e cene), `preparazione-tempo` (4-6 compiti,
 *   60-90 minuti).
 *
 * La porzione di ogni giorno è quella che l'utente vede: tipo di giorno effettivo e scala dei carboidrati di
 * `carbScaleForMeals` (obiettivo della data, limiti dell'energia, minimo di partita). Puro: niente orologio, niente stato.
 */
import type { MenuWeek, Violation } from '../../domain/types';
import type { MenuValidationCtx } from './context';
import { MEAL_SLOTS } from '../menu';
import { daySummary, gridOf, LEGUME_MEAL_THRESHOLD_G, prepSummaryOf, recipeStats, SLOT_COUNT, weekPurchasesAtScale1, weekResult, type DayRules } from './stats';

/** Violazioni dure del menù nel contesto della settimana; vuoto se il menù è valido. Non lancia mai eccezioni. */
export function validateMenuWeek(week: MenuWeek, ctx: MenuValidationCtx): Violation[] {
  try {
    const grid = gridOf(week);
    const rules: DayRules = { month: ctx.month, excluded: ctx.excluded ?? new Set(), starter: ctx.rules === 'avvio' };
    const days = ctx.days.slice(0, 7).map((day, d) => daySummary(grid.slice(d * SLOT_COUNT, (d + 1) * SLOT_COUNT), d, day, rules, true));
    const prep = prepSummaryOf(grid, week.prep ?? []);
    const previousPurchases = ctx.previous ? weekPurchasesAtScale1(ctx.previous, ctx.days.map((d) => d.dayType)) : undefined;
    const w = weekResult(days, grid, prep, { rules, days: ctx.days, ...(ctx.previous ? { previous: ctx.previous, previousPurchases } : {}) }, true);
    return [...days.flatMap((d) => d.sink.list ?? []), ...(w.sink.list ?? [])];
  } catch {
    return [{ code: 'menu-illeggibile', hard: true, message: 'Il menù non si legge.' }];
  }
}

/** Il menù è valido nel contesto (nessuna violazione dura). */
export function isMenuWeekValid(week: MenuWeek, ctx: MenuValidationCtx): boolean {
  return validateMenuWeek(week, ctx).every((v) => !v.hard);
}

/** Numeri di varietà e prevenzione di un menù, alla porzione del giorno di palestra (per i motivi della proposta). */
export interface MenuWeekSummary {
  fishMeals: number;
  oilyFishMeals: number;
  /** Pranzi e cene con un piatto di legumi. */
  legumeMeals: number;
  riceMeals: number;
  eggMeals: number;
  redMeatMeals: number;
}

export function menuWeekSummary(week: MenuWeek): MenuWeekSummary {
  const out: MenuWeekSummary = { fishMeals: 0, oilyFishMeals: 0, legumeMeals: 0, riceMeals: 0, eggMeals: 0, redMeatMeals: 0 };
  for (const day of week.days ?? []) {
    for (const slot of MEAL_SLOTS) {
      const id = day?.meals?.[slot];
      const st = id ? recipeStats(id, 'palestra') : null;
      if (!st) continue;
      if (st.fish) out.fishMeals++;
      if (st.oilyFish) out.oilyFishMeals++;
      if ((slot === 'pranzo' || slot === 'cena') && st.fixed.legumeG + st.scaled.legumeG >= LEGUME_MEAL_THRESHOLD_G) out.legumeMeals++;
      if (st.rice) out.riceMeals++;
      if (st.wholeEgg) out.eggMeals++;
      if (st.fixed.redMeatG + st.scaled.redMeatG > 0) out.redMeatMeals++;
    }
  }
  return out;
}
