/**
 * Piano B al bar: il pasto di adesso, la combinazione consigliata per pasto e tipo di giorno,
 * i totali di una scelta e i dolci rimasti della settimana. Funzioni pure, testate.
 */
import type { AppData, BarOption, DayType, ISODate, MealSlot, Nutrients } from '../../domain/types';
import { BAR_OPTIONS } from '../../data/barPlanB';
import { addDays, hhmmToMin, weekDates, weekStart, weekdayOf } from '../../engine/dates';
import { dayTypeFor, effectiveDayType, isMatchEve, MEAL_SLOTS } from '../../engine/menu';
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

/**
 * Combinazione consigliata: poche voci, coerenti con il pasto e con il tipo di giorno, con le proteine che
 * l'app chiede altrove (almeno 20 g a colazione, 30 g a pranzo e a cena). `dayType` è il tipo effettivo
 * (la vigilia della partita mangia come un giorno di calcio); `matchEve` cambia solo la spiegazione.
 * Un'opzione "con un accorgimento" entra solo insieme a quello che il suo motivo chiede (il toast con un
 * frutto o una spremuta).
 */
export function barCombo(slot: MealSlot, dayType: DayType, preFootball: boolean, matchEve = false): BarCombo {
  const calcio = dayType === 'calcio';
  const eve = calcio && matchEve;
  switch (slot) {
    case 'colazione':
      if (calcio) {
        return {
          ids: ['cappuccino', 'toast', 'spremuta'],
          why: eve
            ? 'Vigilia della partita: proteine dal toast e dal latte, carboidrati facili dalla spremuta. Il pieno vero arriva a pranzo e a cena.'
            : 'Proteine dal toast e dal latte, carboidrati facili dalla spremuta. Il pieno per il calcio arriva a pranzo e a merenda.',
        };
      }
      return {
        ids: ['cappuccino', 'toast', 'macedonia'],
        why: 'Il toast porta le proteine che alla colazione del bar mancano quasi sempre, il frutto la fibra: arrivi allo spuntino senza fame.',
      };
    case 'spuntino':
      return calcio
        ? {
            ids: ['panino-tacchino'],
            why: eve ? 'Alla vigilia servono più carboidrati: un panino magro tiene fino a pranzo.' : 'Nei giorni di calcio servono più carboidrati: un panino magro tiene fino a pranzo.',
          }
        : { ids: ['yogurt-frutta', 'frutta-secca'], why: 'Proteine e fermenti dallo yogurt, grassi buoni dalla frutta secca: tiene fino a pranzo.' };
    case 'pranzo':
      if (calcio) {
        return {
          ids: ['panino-bresaola', 'macedonia', 'spremuta'],
          why: eve
            ? 'Vigilia della partita: tanti carboidrati per riempire le scorte di domani, proteine magre e pochi grassi.'
            : 'Tanti carboidrati, proteine magre e pochi grassi: stasera arrivi in campo carico e leggero.',
        };
      }
      return dayType === 'palestra'
        ? { ids: ['panino-bresaola', 'macedonia'], why: 'Proteine magre, carboidrati e una porzione di frutta: un pranzo completo in cinque minuti.' }
        : { ids: ['insalatona', 'macedonia'], why: 'Verdure e proteine nello stesso piatto, più un frutto per i carboidrati: un pranzo leggero per una giornata tranquilla.' };
    case 'merenda':
      if (preFootball) {
        return { ids: ['panino-tacchino', 'spremuta'], why: 'Carboidrati digeribili e pochi grassi: arrivi al calcio carico e leggero.' };
      }
      return eve
        ? { ids: ['yogurt-frutta', 'macedonia'], why: 'Vigilia della partita: yogurt e frutta, carboidrati facili che non appesantiscono la cena.' }
        : { ids: ['yogurt-frutta', 'frutta-secca'], why: 'Una merenda che sazia senza appesantire la cena.' };
    case 'cena':
      if (calcio) {
        return {
          ids: ['panino-bresaola', 'yogurt-frutta'],
          why: eve
            ? 'Vigilia della partita: carboidrati per le scorte e circa 35 g di proteine magre, leggero prima di dormire.'
            : 'Carboidrati e circa 35 g di proteine per recuperare, leggero prima di dormire.',
        };
      }
      return dayType === 'palestra'
        ? { ids: ['panino-bresaola', 'yogurt-frutta'], why: 'Dopo la palestra: carboidrati e circa 35 g di proteine per il recupero, leggero prima di dormire.' }
        : { ids: ['insalatona', 'yogurt-frutta'], why: 'Verdure e proteine, più uno yogurt con la frutta: una cena leggera e completa.' };
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
  /** Tipo effettivo per le scelte: la vigilia della partita vale come un giorno di calcio. */
  dayType: DayType;
  /** Tipo previsto dalla settimana: colore ed etichetta del giorno. */
  scheduledDayType: DayType;
  /** Vigilia della partita in un giorno senza calcio: si mangia come un giorno di calcio. */
  matchEve: boolean;
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
  const scheduledDayType = dayTypeFor(today, plan);
  const dayType = effectiveDayType(today, plan);
  const matchEve = scheduledDayType !== 'calcio' && isMatchEve(today, plan);
  const slot = currentSlot(nowMin < cutoff ? nowMin + 1440 : nowMin, schedule, plan);
  return { today, dayType, scheduledDayType, matchEve, schedule, slot, preFootball: isEveningFootball(day) };
}
