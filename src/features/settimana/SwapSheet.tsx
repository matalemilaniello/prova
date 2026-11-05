/**
 * Foglio delle alternative per un pasto: ricette dello stesso pasto con valori simili (docs/FASE2.md § 6.1:
 * `alternativesFor`, prima quelle con gli alimenti già nella spesa), con i valori a confronto. Tocca per scegliere (con
 * "Annulla" nel messaggio), oppure apri la ricetta per guardarla prima. In testa, solo quando serve, la domanda sui
 * cambi ripetuti (§ 6.3): l'app chiede, non decide.
 *
 * Esporta anche le azioni condivise con il foglio della ricetta: `applySwap` (il cambio salva la ricetta prevista, per
 * imparare i gusti), `excludeFromPlan` (esclusione da domani con «Annulla») e `TasteQuestion`.
 */
import { useMemo, useState } from 'react';
import { BookOpen, Check, Clock, Undo2 } from 'lucide-react';
import type { DayType, FoodExclusion, ISODate, MealSlot, Recipe } from '../../domain/types';
import { RECIPES } from '../../data/recipes';
import { FOODS } from '../../data/foods';
import { addDays, weekStart } from '../../engine/dates';
import { agreed, capitalFirst, foodWithArticle, objectPronoun, tasteQuestion } from '../../engine/exclusions';
import { type MealEntry } from '../../engine/menu';
import { recipeNutrition } from '../../engine/nutrition';
import { alternativesFor, doneRates, exclusionImpact, weekMealsFor } from '../../engine/similar';
import { fmtNumber, listIt } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { usePlanDay } from '../../state/hooks';
import { Button, Callout, IconButton, Pill, Pressable, Sheet } from '../../ui';
import { DishArt } from './art/DishArt';

const SLOT_ARTICLE: Record<MealSlot, string> = {
  colazione: 'la colazione',
  spuntino: 'lo spuntino',
  pranzo: 'il pranzo',
  merenda: 'la merenda',
  cena: 'la cena',
};

const SLOT_FEM: Record<MealSlot, boolean> = { colazione: true, spuntino: false, pranzo: false, merenda: true, cena: true };

/** "Pranzo cambiato", "Cena cambiata". */
export function slotChangedText(slot: MealSlot): string {
  const name = slot.charAt(0).toUpperCase() + slot.slice(1);
  return `${name} ${SLOT_FEM[slot] ? 'cambiata' : 'cambiato'}`;
}

export function slotArticle(slot: MealSlot): string {
  return SLOT_ARTICLE[slot];
}

/**
 * Cambia la ricetta del pasto e mostra un messaggio con "Annulla". Il cambio salva anche la ricetta prevista in quel
 * momento (`DayLog.swapPlanned`), che serve a imparare i gusti senza ricostruire il menù di allora.
 */
export function applySwap(date: ISODate, slot: MealSlot, entry: Pick<MealEntry, 'plannedId' | 'recipeId'>, nextId: string) {
  const { swapRecipe, getDayLog } = useApp.getState();
  const log = getDayLog(date);
  const prevSwap = log.recipeSwaps[slot] ?? null;
  const prevPlanned = log.swapPlanned?.[slot];
  swapRecipe(date, slot, nextId === entry.plannedId ? null : nextId, entry.plannedId || undefined);
  haptic('success');
  useUi.getState().toast(slotChangedText(slot), 'good', {
    actionLabel: 'Annulla',
    onAction: () => useApp.getState().swapRecipe(date, slot, prevSwap, prevPlanned),
  });
}

/** «Tolto il tonno: cambiano 2 pasti da domani», «Tolte le zucchine e la feta dal piano». */
export function exclusionText(foodIds: readonly string[], changed: number): string {
  const names = foodIds.map(foodWithArticle);
  const head =
    foodIds.length === 1
      ? `${agreed(foodIds[0], 'Tolt')} ${names[0]}`
      : `${foodIds.every((id) => agreed(id, 'Tolt') === 'Tolte' || agreed(id, 'Tolt') === 'Tolta') ? 'Tolte' : 'Tolti'} ${listIt(names)}`;
  if (changed <= 0) return `${head} dal piano`;
  return `${head}: ${changed === 1 ? 'cambia 1 pasto' : `cambiano ${changed} pasti`} da domani`;
}

/**
 * Esclude gli alimenti dal piano da domani (oggi e i giorni passati non cambiano, § 4.9) e lo dice con «Annulla»: quanti
 * pasti cambiano nella settimana da domani. Un alimento già escluso non si tocca.
 */
export function excludeFromPlan(foodIds: readonly string[], origin: FoodExclusion['origin'], today: ISODate) {
  const st = useApp.getState();
  const since = addDays(today, 1);
  const fresh = [...new Set(foodIds)].filter((id) => !st.plan.exclusions?.some((e) => e.foodId === id));
  if (!fresh.length) return;
  const changed = exclusionImpact(st.plan, fresh, since, 7, st.dayLogs);
  for (const id of fresh) st.addExclusion(id, origin, since);
  haptic('success');
  useUi.getState().toast(exclusionText(fresh, changed), 'good', {
    actionLabel: 'Annulla',
    onAction: () => {
      const s2 = useApp.getState();
      for (const id of fresh) s2.removeExclusion(id);
    },
  });
}

/**
 * La domanda sui cambi ripetuti in testa alle alternative di un pasto che contiene l'alimento (§ 6.3): «Il tonno lo
 * cambi spesso: 3 volte in 4 settimane. Lo tolgo dal piano?» con «Toglilo» e «Tienilo». Niente se non serve.
 */
export function TasteQuestion({ recipe, today, className }: { recipe?: Recipe; today: ISODate; className?: string }) {
  const plan = useApp((s) => s.plan);
  const dayLogs = useApp((s) => s.dayLogs);
  const q = useMemo(() => tasteQuestion({ plan, dayLogs }, today, recipe), [plan, dayLogs, today, recipe]);
  if (!q) return null;
  const pron = objectPronoun(q.foodId);
  return (
    <Callout
      className={className}
      action={
        <div className="flex flex-wrap gap-2 pl-3.5">
          <Button size="sm" variant="secondary" onClick={() => excludeFromPlan([q.foodId], 'cambi-ripetuti', today)}>
            {`Togli${pron}`}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              haptic('selection');
              useApp.getState().markTasteAsked(q.foodId, today);
            }}
          >
            {`Tieni${pron}`}
          </Button>
        </div>
      }
    >
      {`${capitalFirst(foodWithArticle(q.foodId))} ${pron} cambi spesso: ${q.swaps} volte in 4 settimane. ${capitalFirst(pron)} tolgo dal piano?`}
    </Callout>
  );
}

/** Alternative del pasto per il foglio: valori simili, poi quelle che usano la spesa della settimana. */
export function useAlternatives(date: ISODate, entry: MealEntry | undefined, scale?: number) {
  const plan = useApp((s) => s.plan);
  const dayLogs = useApp((s) => s.dayLogs);
  const checkedKeys = useApp((s) => s.shoppingChecked);
  const today = usePlanDay();
  return useMemo(() => {
    if (!entry) return { recipes: [] as Recipe[], widened: false };
    const state = { plan, dayLogs };
    const ws = weekStart(date);
    return alternativesFor(entry, {
      date,
      plan,
      week: weekMealsFor(ws, state),
      scale,
      checked: new Set(checkedKeys[ws] ?? []),
      doneRate: doneRates(state, today),
    });
  }, [date, entry, scale, plan, dayLogs, checkedKeys, today]);
}

/** Riga del foglio quando la banda dei valori si è allargata. */
export const WIDENED_TEXT = 'Nessuna con valori vicini: queste si scostano fino al 20%.';

export interface SwapSheetProps {
  open: boolean;
  onClose: () => void;
  date: ISODate;
  slot: MealSlot;
  entry: MealEntry;
  dayType: DayType;
  /** Scala del piano per le righe di carboidrati (`dayCarbScale`), così i valori sono quelli del menù. */
  scale?: number;
  /** Titolo del pasto ("Merenda pre-partita"). */
  title?: string;
  /** Giorno di avvio: niente alternative che richiedono la preparazione della domenica (non ne arrivano mai). */
  starter?: boolean;
}

/** Alternative in vista prima di «Tutte» (§ 6.1, come nel foglio della ricetta). */
const SHOWN = 3;

export function SwapSheet({ open, onClose, date, slot, entry, dayType, scale, title }: SwapSheetProps) {
  const today = usePlanDay();
  const alts = useAlternatives(date, entry, scale);
  const [all, setAll] = useState(false);
  const options = alts.recipes.filter((r) => r.id !== entry.recipeId);
  const planned = entry.swapped && entry.plannedId ? RECIPES[entry.plannedId] : undefined;
  const full = planned ? [planned, ...options.filter((r) => r.id !== planned.id)] : options;
  const list = all ? full : full.slice(0, SHOWN);
  const cur = recipeNutrition(entry.recipe, dayType, FOODS, scale);

  const choose = (id: string) => {
    applySwap(date, slot, entry, id);
    onClose();
  };
  const preview = (id: string) => {
    onClose();
    useUi.getState().open({ type: 'recipe', recipeId: id, date, slot });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Alternative per ${SLOT_ARTICLE[slot]}`}
      subtitle={title && title.toLowerCase() !== slot ? `${title}. Valori adattati a questo giorno.` : 'Valori adattati a questo giorno. Tocca per scegliere.'}
    >
      <TasteQuestion recipe={RECIPES[entry.plannedId] ?? entry.recipe} today={today} className="mb-4" />
      {entry.recipe && (
        <div className="mb-4 flex items-center gap-3 rounded-[16px] bg-card-2 p-3">
          <DishArt recipe={entry.recipe} dayType={dayType} variant="thumb" className="size-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="t-caption text-ink-3">Adesso nel menù</p>
            <p className="t-callout truncate font-medium text-ink">{entry.recipe.name}</p>
          </div>
          <span className="t-caption shrink-0 font-medium tabular text-ink-2">{fmtNumber(Math.round(cur.kcal))} kcal</span>
        </div>
      )}
      {alts.widened && list.length > 0 && <p className="t-footnote mb-3 px-1 text-ink-3">{WIDENED_TEXT}</p>}
      <ul className="overflow-hidden rounded-card bg-card shadow-card">
        {list.map((r, i) => {
          const n = recipeNutrition(r, dayType, FOODS, scale);
          const dk = Math.round(n.kcal - cur.kcal);
          const dp = Math.round(n.proteinG - cur.proteinG);
          const isPlanned = planned?.id === r.id;
          return (
            <li key={r.id} className={i > 0 ? 'relative before:absolute before:left-[76px] before:right-0 before:top-0 before:h-px before:bg-line' : undefined}>
              <div className="flex items-center gap-1 pr-2">
                <Pressable onPress={() => choose(r.id)} pressScale={0.985} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3" aria-label={`Usa ${r.name}`}>
                  <DishArt recipe={r} dayType={dayType} variant="thumb" className="size-[52px] shrink-0" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {isPlanned && (
                      <Pill tone="accent" size="sm" icon={Undo2}>
                        Quella del menù
                      </Pill>
                    )}
                    <span className="t-callout line-clamp-2 font-medium text-ink">{r.name}</span>
                    <span className="t-footnote flex flex-col text-ink-2">
                      <span>
                        <span className="tabular">{fmtNumber(Math.round(n.kcal))} kcal</span> <Delta v={dk} unit="kcal" />
                        <span aria-hidden className="text-ink-3"> · </span>
                        <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                          <Clock aria-hidden size={12} strokeWidth={2.2} />
                          {r.batch ? `${r.prepMin} min, dalla domenica` : `${r.prepMin} min`}
                        </span>
                      </span>
                      <span>
                        <span className="tabular">{fmtNumber(Math.round(n.proteinG))}</span> g di proteine <Delta v={dp} unit="g" />
                      </span>
                    </span>
                  </span>
                </Pressable>
                <IconButton icon={BookOpen} label={`Apri la ricetta: ${r.name}`} variant="plain" size="sm" onClick={() => preview(r.id)} />
              </div>
            </li>
          );
        })}
      </ul>
      {full.length > SHOWN && (
        <div className="mt-2">
          <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? 'Meno' : `Tutte (${full.length})`}
          </Button>
        </div>
      )}
      {list.length === 0 && (
        <p className="t-callout flex items-center gap-2 py-6 text-ink-2">
          <Check aria-hidden size={18} /> Per questo pasto non ci sono alternative con valori simili.
        </p>
      )}
      <p className="t-footnote mt-3 px-1 text-ink-3">La spesa della settimana si aggiorna da sola con la ricetta scelta.</p>
    </Sheet>
  );
}

function Delta({ v, unit }: { v: number; unit: string }) {
  if (Math.abs(v) < (unit === 'kcal' ? 15 : 2)) return null;
  const up = v > 0;
  return (
    <span className="t-mono text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
      ({up ? '+' : '−'}
      {fmtNumber(Math.abs(v))})
    </span>
  );
}
