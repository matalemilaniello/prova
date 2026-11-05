/**
 * Piano B al bar: il pasto di adesso, la combinazione consigliata per pasto e tipo di giorno,
 * i totali di una scelta e i dolci rimasti della settimana. Funzioni pure, testate.
 */
import type { AppData, BarOption, DayType, ISODate, MealSlot, Nutrients } from '../../domain/types';
import { BAR_OPTIONS, type BarPlanBOption } from '../../data/barPlanB';
import { addDays, hhmmToMin, weekDates, weekStart, weekdayOf } from '../../engine/dates';
import { dayTypeFor, effectiveDayType, isMatchEve, MEAL_SLOTS } from '../../engine/menu';
import { dayNutritionDetail, type NutritionState } from '../../engine/nutrition';
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
          ids: ['cappuccino', 'toast', 'yogurt-frutta'],
          why: eve
            ? 'Vigilia della partita: proteine da latte, toast e yogurt, carboidrati facili dalla frutta. Il pieno vero arriva a pranzo e a cena.'
            : 'Proteine da latte, toast e yogurt, carboidrati facili dalla frutta. Il pieno per il calcio arriva a pranzo e a merenda.',
        };
      }
      return {
        ids: ['cappuccino', 'toast', 'yogurt-frutta'],
        why: 'Toast e yogurt portano le proteine che alla colazione del bar mancano quasi sempre: arrivi allo spuntino senza fame.',
      };
    case 'spuntino':
      return calcio
        ? {
            ids: ['panino-verdure'],
            why: eve ? 'Alla vigilia servono più carboidrati: un panino magro tiene fino a pranzo.' : 'Nei giorni di calcio servono più carboidrati: un panino magro tiene fino a pranzo.',
          }
        : { ids: ['yogurt-frutta', 'frutta-secca'], why: 'Fermenti dallo yogurt, grassi buoni dalla frutta secca e circa 13 g di proteine in tutto: tiene fino a pranzo.' };
    case 'pranzo':
      if (calcio) {
        return {
          ids: ['panino-pollo', 'macedonia', 'spremuta'],
          why: eve
            ? 'Vigilia della partita: tanti carboidrati per riempire le scorte di domani, proteine magre e pochi grassi.'
            : 'Tanti carboidrati, proteine magre e pochi grassi: stasera arrivi in campo carico e leggero.',
        };
      }
      return dayType === 'palestra'
        ? { ids: ['panino-pollo', 'macedonia'], why: 'Proteine magre, carboidrati e una porzione di frutta: un pranzo completo in cinque minuti.' }
        : { ids: ['insalatona', 'macedonia'], why: 'Verdure e proteine nello stesso piatto, più un frutto per i carboidrati: un pranzo leggero per una giornata tranquilla.' };
    case 'merenda':
      if (preFootball) {
        return { ids: ['panino-verdure', 'spremuta'], why: 'Carboidrati digeribili e pochi grassi: arrivi al calcio carico e leggero.' };
      }
      return eve
        ? { ids: ['yogurt-frutta', 'macedonia'], why: 'Vigilia della partita: yogurt e frutta, carboidrati facili che non appesantiscono la cena.' }
        : { ids: ['yogurt-frutta', 'frutta-secca'], why: 'Una merenda che sazia senza appesantire la cena.' };
    case 'cena':
      if (calcio) {
        return {
          ids: ['panino-pollo', 'yogurt-frutta'],
          why: eve
            ? 'Vigilia della partita: carboidrati per le scorte e circa 35 g di proteine magre, leggero prima di dormire.'
            : 'Carboidrati e circa 35 g di proteine per recuperare, leggero prima di dormire.',
        };
      }
      return dayType === 'palestra'
        ? { ids: ['panino-pollo', 'yogurt-frutta'], why: 'Dopo la palestra: carboidrati e circa 35 g di proteine per il recupero, leggero prima di dormire.' }
        : { ids: ['insalatona', 'yogurt-frutta'], why: 'Verdure e proteine, più uno yogurt con la frutta: una cena leggera e completa.' };
  }
}

/**
 * Opzioni del piano B senza gli alimenti esclusi dall'utente (docs/FASE2.md § 6.5): un'opzione che contiene un alimento
 * escluso (`BarPlanBOption.contains`) non compare. `excluded` è `excludedFoods(plan, giorno)`.
 */
export function barOptionsFor(excluded: ReadonlySet<string>, options: readonly BarPlanBOption[] = BAR_OPTIONS): BarPlanBOption[] {
  return options.filter((o) => !(o.contains ?? []).some((id) => excluded.has(id)));
}

/** Testo della combinazione quando le esclusioni ne hanno tolto una parte. */
export const COMBO_WITHOUT_EXCLUDED = 'La combinazione consigliata, senza quello che hai tolto dal piano.';

/** La combinazione con le sole opzioni ammesse; se le esclusioni ne tolgono una, il motivo lo dice. */
export function allowedCombo(combo: BarCombo, options: readonly BarOption[]): BarCombo {
  const ids = combo.ids.filter((id) => options.some((o) => o.id === id));
  return ids.length === combo.ids.length ? combo : { ids, why: COMBO_WITHOUT_EXCLUDED };
}

/** Nei giorni di calcio la scelta del bar arriva almeno a questa quota del pasto previsto (kcal e carboidrati). */
export const CALCIO_MEAL_SHARE = 0.85;
/** …senza superarlo di più di così: un secondo piatto di amido non sostituisce una spremuta. */
export const CALCIO_MEAL_CAP = 1.25;

/** Aggiunte ricche di carboidrati, dalle più leggere: frutta, poi un piatto di amido. */
const CARB_TOP_UPS = ['spremuta', 'macedonia', 'trancio-pizza', 'pasta-pomodoro'] as const;
type TopUp = (typeof CARB_TOP_UPS)[number];

const TOP_UP_WORDS: Record<TopUp, string> = {
  spremuta: 'la spremuta',
  macedonia: 'la macedonia',
  'trancio-pizza': 'il trancio di pizza',
  'pasta-pomodoro': 'la pasta al pomodoro',
};

/** Valori del pasto previsto dal menù in quel giorno (sostituzioni e scala del piano comprese), o null. */
export function plannedMeal(state: NutritionState, date: ISODate, slot: MealSlot): Nutrients | null {
  const n = dayNutritionDetail(date, state).bySlot[slot];
  return n && n.kcal > 0 ? n : null;
}

/**
 * Nei giorni di calcio e alla vigilia i carboidrati servono davvero: se la scelta resta sotto l'85% del pasto
 * previsto (calorie o carboidrati), si aggiungono uno o due elementi ricchi di carboidrati (spremuta,
 * macedonia, trancio di pizza, pasta al pomodoro), scegliendo la combinazione più vicina al pasto previsto
 * con meno voci e senza superarlo di oltre il 25%. Il trancio arriva solo con la frutta e la pasta solo con
 * un panino proteico accanto, come chiedono i loro accorgimenti. Negli altri giorni la scelta resta com'è.
 */
/** "alla cena prevista", "al pranzo previsto". */
const PLANNED_MEAL: Record<MealSlot, string> = {
  colazione: 'alla colazione prevista',
  spuntino: 'allo spuntino previsto',
  pranzo: 'al pranzo previsto',
  merenda: 'alla merenda prevista',
  cena: 'alla cena prevista',
};

export function fitCombo(
  combo: BarCombo,
  dayType: DayType,
  planned: Pick<Nutrients, 'kcal' | 'carbG'> | null,
  slot?: MealSlot,
  options: readonly BarOption[] = BAR_OPTIONS,
): BarCombo {
  if (dayType !== 'calcio' || !planned || planned.kcal <= 0) return combo;
  const totals = (ids: readonly string[]) => sumApprox(optionsById(ids, options));
  const reaches = (t: Nutrients) => t.kcal >= planned.kcal * CALCIO_MEAL_SHARE && (planned.carbG <= 0 || t.carbG >= planned.carbG * CALCIO_MEAL_SHARE);
  const base = totals(combo.ids);
  if (reaches(base)) return combo;
  const free = CARB_TOP_UPS.filter((id) => !combo.ids.includes(id) && options.some((o) => o.id === id));
  const sets: TopUp[][] = [[]];
  free.forEach((a, i) => {
    sets.push([a]);
    for (const b of free.slice(i + 1)) sets.push([a, b]);
  });
  const distance = (t: Nutrients) => Math.abs(t.kcal - planned.kcal) / planned.kcal + (planned.carbG > 0 ? Math.abs(t.carbG - planned.carbG) / planned.carbG : 0);
  let best: { add: TopUp[]; score: number } | null = null;
  for (const add of sets) {
    const ids = [...combo.ids, ...add];
    const t = totals(ids);
    if (add.length && (t.kcal > planned.kcal * CALCIO_MEAL_CAP || (planned.carbG > 0 && t.carbG > planned.carbG * CALCIO_MEAL_CAP))) continue;
    if (ids.includes('trancio-pizza') && !ids.includes('macedonia')) continue;
    if (ids.includes('pasta-pomodoro') && sumApprox(optionsById(ids.filter((id) => id !== 'pasta-pomodoro'), options)).proteinG < 25) continue;
    const score = (reaches(t) ? 0 : 10) + distance(t) + add.length * 0.08;
    if (!best || score < best.score) best = { add, score };
  }
  if (!best || !best.add.length) return combo;
  const words = best.add.map((id) => TOP_UP_WORDS[id]).join(' e ');
  const target = slot ? PLANNED_MEAL[slot] : 'al pasto previsto';
  return {
    ids: [...combo.ids, ...best.add],
    why: `${combo.why} ${words.charAt(0).toUpperCase()}${words.slice(1)} ${best.add.length > 1 ? 'portano' : 'porta'} i carboidrati vicino ${target}.`,
  };
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

/**
 * Porzioni di frutta e verdura (80 g l'una) di una porzione tipica del banco. Stime prudenti: la rucola di un
 * panino non fa una porzione, il pomodoro di un sugo mezza; la spremuta non conta, perché la fibra resta nella
 * polpa (lo stesso consiglio che dà la revisione).
 */
export const BAR_VEG_PORTIONS: Readonly<Record<string, number>> = {
  insalatona: 2,
  macedonia: 2,
  'yogurt-frutta': 1,
  'panino-verdure': 0.5,
  'pasta-pomodoro': 0.5,
};

/** Un ordine al bar come lo salva il diario (`DayLog.barMeals`): etichetta, valori e porzioni di vegetali. */
export interface BarOrder {
  label: string;
  nutrients: Nutrients;
  vegPortions: number;
}

/** L'ordine delle voci scelte, o null se non c'è niente: "Panino con pollo, insalata e pomodoro e macedonia o frutto fresco". */
export function barOrder(list: readonly BarOption[]): BarOrder | null {
  if (!list.length) return null;
  const names = list.map((o, i) => (i === 0 ? o.name : lowerFirst(o.name)));
  const label = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  const vegPortions = list.reduce((s, o) => s + (BAR_VEG_PORTIONS[o.id] ?? 0), 0);
  return { label, nutrients: sumApprox(list), vegPortions };
}

/** Minuscola iniziale, tranne per le sigle ("Toast" diventa "toast", "UHT" resta). */
export function lowerFirst(s: string): string {
  return s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
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
