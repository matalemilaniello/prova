/**
 * Testi e scelte del foglio dei pasti (`mealLog`, docs/FASE2.md § 7.4, § 7.6, § 8.2), senza React: si provano da soli.
 */
import type { DayLog, Food, HHMM, ISODate, MealSlot, MyDish, Plan } from '../../domain/types';
import { ESTIMATE_FOODS } from '../../data/estimateFoods';
import { FOODS } from '../../data/foods';
import { roundKcal10, type DraftValues } from '../../engine/estimate';
import { mealTimesFor } from '../../engine/mealTimes';
import { MEAL_SLOTS } from '../../engine/menu';
import { dayMinutes } from '../../engine/sleep';
import type { TaskResult } from '../../lib/claudeTasks';
import { fmtKcal, fmtNumber, MEAL_SLOT_LABEL } from '../../lib/format';
import { PHOTO_TEXT } from '../../engine/coachTasks/photo';

/** Articolo e accordi di ogni pasto: «il pranzo previsto», «la cena segnata». */
export const SLOT_WORDS: Record<MealSlot, { the: string; planned: string; done: string }> = {
  colazione: { the: 'la colazione', planned: 'prevista', done: 'segnata' },
  spuntino: { the: 'lo spuntino', planned: 'previsto', done: 'segnato' },
  pranzo: { the: 'il pranzo', planned: 'previsto', done: 'segnato' },
  merenda: { the: 'la merenda', planned: 'prevista', done: 'segnata' },
  cena: { the: 'la cena', planned: 'prevista', done: 'segnata' },
};

/** «Conta come il pranzo previsto» oppure «Conta come pasto sostituito» (§ 7.5). */
export function countsAsText(slot: MealSlot, asPlanned: boolean): string {
  const w = SLOT_WORDS[slot];
  return asPlanned ? `Conta come ${w.the} ${w.planned}` : 'Conta come pasto sostituito';
}

/** «Segna il pranzo», «Segna la cena». */
export function markLabel(slot: MealSlot): string {
  return `Segna ${SLOT_WORDS[slot].the}`;
}

/** Avviso dopo la conferma: «Pranzo segnato: 720 kcal». */
export function markedToast(slot: MealSlot, kcal: number): string {
  return `${MEAL_SLOT_LABEL[slot]} ${SLOT_WORDS[slot].done}: ${fmtKcal(roundKcal10(kcal))}`;
}

/** Kcal della scheda: «720 kcal» oppure, con un alimento incerto che pesa, «circa 820 kcal (620-1.020)». */
export function kcalText(v: Pick<DraftValues, 'kcalShown' | 'range'>): string {
  if (!v.range) return fmtKcal(v.kcalShown);
  return `circa ${fmtKcal(v.kcalShown)} (${fmtNumber(v.range.low)}-${fmtNumber(v.range.high)})`;
}

/** Riga di un piatto nell'elenco: «640 kcal · P 38 g» della porzione normale. */
export function dishLine(dish: Pick<MyDish, 'nutrients'>): string {
  return `${fmtKcal(roundKcal10(dish.nutrients.kcal))} · P ${fmtNumber(Math.round(dish.nutrients.proteinG))} g`;
}

/**
 * Pasto proposto per una foto della chat: il più vicino all'ora del messaggio tra quelli non ancora segnati (tutti, se
 * sono già tutti segnati). Gli orari sono quelli del giorno (`mealTimesFor`: lavoro e calcio compresi).
 */
export function nearestOpenSlot(iso: ISODate, at: HHMM, plan: Pick<Plan, 'mealTimes' | 'sleep' | 'week'>, log: Pick<DayLog, 'status'> | undefined): MealSlot {
  const times = mealTimesFor(iso, plan);
  const open = MEAL_SLOTS.filter((s) => !log?.status?.[`pasto:${s}`]);
  const pool = open.length ? open : MEAL_SLOTS;
  const now = dayMinutes(at, plan);
  let best = pool[0];
  let gap = Number.POSITIVE_INFINITY;
  for (const s of pool) {
    const d = Math.abs(dayMinutes(times[s].time, plan) - now);
    if (d < gap) {
      gap = d;
      best = s;
    }
  }
  return best;
}

// ───────────────────────── Ricerca degli alimenti ─────────────────────────

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Alimenti che si possono aggiungere a una stima: archivio (senza sale e spezie) e sole stime. */
function addable(): Food[] {
  const archive = Object.values(FOODS).filter((f) => !f.pantry || f.id === 'olio-evo');
  return [...archive, ...ESTIMATE_FOODS];
}

/** Ricerca per nome nell'archivio e nelle sole stime: prima chi comincia con la parola, poi chi la contiene. */
export function searchFoods(query: string, limit = 8): Food[] {
  const q = fold(query);
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored: { food: Food; score: number }[] = [];
  for (const food of addable()) {
    const name = fold(food.name);
    if (!words.every((w) => name.includes(w))) continue;
    const score = name.startsWith(q) ? 0 : name.split(/[\s,]+/).some((w) => w.startsWith(words[0])) ? 1 : 2;
    scored.push({ food, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.food.name.length - b.food.name.length || a.food.name.localeCompare(b.food.name, 'it'))
    .slice(0, limit)
    .map((s) => s.food);
}

/** Grammi proposti quando si aggiunge un alimento: una porzione a mano, altrimenti 100 g. */
export function defaultGrams(food: Food): number {
  const u = food.unitGrams;
  const g = u.palmo ?? u.pugno ?? u['mano a coppa'] ?? u.vasetto ?? u.tazza ?? u.bicchiere ?? (u.fetta ? u.fetta * 2 : undefined) ?? u.manciata ?? u.cucchiaio ?? 100;
  return Math.max(5, Math.round(g / 5) * 5);
}

// ───────────────────────── Esiti della lettura (§ 7.6) ─────────────────────────

export const MEAL_LOG_TEXT = {
  reading: 'Il coach guarda il piatto…',
  offline: 'Serve la rete per leggere la foto.',
  notFood: 'Non vedo un piatto in questa foto.',
  unreadable: 'La foto non si legge bene. Scatta di nuovo, con più luce e il piatto intero.',
  noKey: 'Per leggere le foto serve la chiave del coach, nelle impostazioni del coach.',
  noPhoto: 'Scegli la foto del piatto: il coach la legge e tu controlli i grammi.',
  badFile: 'Questa foto non si apre. Scegline un’altra.',
} as const;

export interface FailureView {
  text: string;
  /** «Riprova» ha senso. */
  retry: boolean;
  /** Senza rete: il foglio mostra le uscite offline (i miei piatti, piano B). */
  offline: boolean;
}

/**
 * Cosa mostra il foglio per una lettura non riuscita. Rifiuto e risposta non valida o incompleta con i testi della foto;
 * «Riprova» una volta sola per la risposta non valida (`retried`); gli errori dell'API e della rete con i testi di
 * `lib/claude.ts`. Null per una lettura annullata da chi l'ha chiesta.
 */
export function failureView(res: Extract<TaskResult<unknown>, { ok: false }>, retried: boolean): FailureView | null {
  switch (res.kind) {
    case 'annullata':
      return null;
    case 'offline':
      return { text: MEAL_LOG_TEXT.offline, retry: true, offline: true };
    case 'rifiuto':
      return { text: PHOTO_TEXT.rifiuto, retry: true, offline: false };
    case 'non-valida':
    case 'incompleta':
      return { text: PHOTO_TEXT.nonValida, retry: !retried, offline: false };
    default:
      return { text: res.message, retry: res.retryable, offline: false };
  }
}
