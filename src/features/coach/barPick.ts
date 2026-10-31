/**
 * Piano B al bar: il pasto di adesso, la combinazione consigliata per pasto e tipo di giorno,
 * i totali di una scelta e i dolci rimasti della settimana. Funzioni pure, testate.
 */
import type { AppData, BarOption, DayType, ISODate, MealSlot, Nutrients } from '../../domain/types';
import { BAR_OPTIONS } from '../../data/barPlanB';
import { addDays, hhmmToMin, weekDates, weekStart, weekdayOf } from '../../engine/dates';
import { MEAL_SLOTS } from '../../engine/menu';
import { dayCutoffMin, dayMinutes, isEveningFootball, mealSchedule, type MealSchedule } from '../../engine/timeline';

export const VERDICT_ORDER: BarOption['verdict'][] = ['si', 'meglio', 'programmato'];

/**
 * Pasto più vicino all'ora attuale (quello appena passato vale fino a 75 minuti dopo).
 * `now` è in minuti della giornata: dopo mezzanotte e prima della sveglia vale 24:00 e oltre.
 */
export function currentSlot(now: number, schedule: Record<MealSlot, MealSchedule>, plan: Pick<AppData['plan'], 'sleep'>): MealSlot {
  let best: MealSlot = 'colazione';
  let bestScore = Infinity;
  for (const slot of MEAL_SLOTS) {
    const t = dayMinutes(schedule[slot].time, plan);
    const diff = now - t; // positivo: il pasto è passato
    // Un pasto già passato da poco resta quello giusto; quelli futuri pesano per la distanza.
    const score = diff >= 0 ? (diff <= 75 ? diff * 0.5 : diff * 2) : -diff;
    if (score < bestScore) {
      bestScore = score;
      best = slot;
    }
  }
  return best;
}

export interface BarCombo {
  ids: string[];
  why: string;
}

/** Combinazione consigliata: poche voci, coerenti con il pasto e con il tipo di giorno. */
export function barCombo(slot: MealSlot, dayType: DayType, preFootball: boolean): BarCombo {
  const calcio = dayType === 'calcio';
  switch (slot) {
    case 'colazione':
      return calcio
        ? { ids: ['cappuccino', 'yogurt-frutta', 'spremuta'], why: 'Latte, yogurt e frutta: proteine e carboidrati facili per una giornata di calcio.' }
        : { ids: ['cappuccino', 'yogurt-frutta'], why: 'Proteine del latte e dello yogurt, più una porzione di frutta: arrivi allo spuntino senza fame.' };
    case 'spuntino':
      return calcio
        ? { ids: ['panino-tacchino'], why: 'Nei giorni di calcio servono più carboidrati: un panino magro tiene fino a pranzo.' }
        : { ids: ['yogurt-frutta', 'frutta-secca'], why: 'Proteine e fermenti dallo yogurt, grassi buoni dalla frutta secca: tiene fino a pranzo.' };
    case 'pranzo':
      if (calcio) {
        return { ids: ['pasta-pomodoro', 'macedonia'], why: 'Carboidrati facili da digerire per stasera. Chiedi di aggiungere tonno o un uovo per le proteine.' };
      }
      return dayType === 'palestra'
        ? { ids: ['panino-bresaola', 'macedonia'], why: 'Proteine magre e una porzione di frutta: un pranzo completo in cinque minuti.' }
        : { ids: ['insalatona', 'macedonia'], why: 'Verdure e proteine nello stesso piatto, più la frutta. Prendi anche il pane.' };
    case 'merenda':
      return preFootball
        ? { ids: ['panino-tacchino', 'spremuta'], why: 'Carboidrati digeribili e pochi grassi: arrivi al calcio carico e leggero.' }
        : { ids: ['yogurt-frutta', 'frutta-secca'], why: 'Una merenda che sazia senza appesantire la cena.' };
    case 'cena':
      return calcio
        ? { ids: ['pasta-pomodoro', 'yogurt-frutta'], why: 'Dopo il calcio: carboidrati per recuperare e proteine dello yogurt, leggero prima di dormire.' }
        : { ids: ['insalatona'], why: 'Se ceni fuori, verdure e proteine con il pane: leggero e completo.' };
  }
}

/** Le opzioni esistenti, nell'ordine dato (gli id che mancano si saltano). */
export function optionsById(ids: readonly string[], options: readonly BarOption[] = BAR_OPTIONS): BarOption[] {
  const map = new Map(options.map((o) => [o.id, o]));
  return ids.map((id) => map.get(id)).filter((o): o is BarOption => Boolean(o));
}

export function sumApprox(list: readonly BarOption[]): Nutrients {
  return list.reduce<Nutrients>(
    (t, o) => ({
      kcal: t.kcal + o.approx.kcal,
      proteinG: t.proteinG + o.approx.proteinG,
      carbG: t.carbG + o.approx.carbG,
      fatG: t.fatG + o.approx.fatG,
      fiberG: t.fiberG + o.approx.fiberG,
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 },
  );
}

/** Dolci mangiati da lunedì a oggi compreso. */
export function sweetsThisWeek(dayLogs: AppData['dayLogs'], today: ISODate): number {
  return weekDates(weekStart(today))
    .filter((d) => d <= today)
    .reduce((n, d) => n + (dayLogs[d]?.sweets ?? 0), 0);
}

export interface BarContext {
  today: ISODate;
  dayType: DayType;
  schedule: Record<MealSlot, MealSchedule>;
  slot: MealSlot;
  preFootball: boolean;
}

/** Contesto del foglio: giornata (dopo mezzanotte vale ieri), orari dei pasti e pasto di adesso. */
export function barContext(state: Pick<AppData, 'plan'>, calendarDay: ISODate, nowHHMM: string): BarContext {
  const plan = state.plan;
  const nowMin = hhmmToMin(nowHHMM);
  const cutoff = dayCutoffMin(plan);
  const today = nowMin < cutoff ? addDays(calendarDay, -1) : calendarDay;
  const day = plan.week.find((d) => d.weekday === weekdayOf(today));
  const schedule = mealSchedule(day, plan);
  const dayType = day?.dayType ?? 'riposo';
  const slot = currentSlot(nowMin < cutoff ? nowMin + 1440 : nowMin, schedule, plan);
  return { today, dayType, schedule, slot, preFootball: isEveningFootball(day) };
}
