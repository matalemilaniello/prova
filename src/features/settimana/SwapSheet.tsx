/**
 * Foglio delle alternative per un pasto: ricette dello stesso pasto con valori a confronto.
 * Tocca per scegliere (con "Annulla" nel messaggio), oppure apri la ricetta per guardarla prima.
 */
import { BookOpen, Check, Clock, Undo2 } from 'lucide-react';
import type { DayType, ISODate, MealSlot } from '../../domain/types';
import { RECIPES } from '../../data/recipes';
import { swapOptions, type MealEntry } from '../../engine/menu';
import { FOODS } from '../../data/foods';
import { recipeNutrition } from '../../engine/nutrition';
import { fmtNumber } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { IconButton, Pill, Pressable, Sheet } from '../../ui';
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

/** Cambia la ricetta del pasto e mostra un messaggio con "Annulla". */
export function applySwap(date: ISODate, slot: MealSlot, entry: Pick<MealEntry, 'plannedId' | 'recipeId'>, nextId: string) {
  const { swapRecipe, getDayLog } = useApp.getState();
  const prevSwap = getDayLog(date).recipeSwaps[slot] ?? null;
  swapRecipe(date, slot, nextId === entry.plannedId ? null : nextId);
  haptic('success');
  useUi.getState().toast(slotChangedText(slot), 'good', {
    actionLabel: 'Annulla',
    onAction: () => useApp.getState().swapRecipe(date, slot, prevSwap),
  });
}

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
}

export function SwapSheet({ open, onClose, date, slot, entry, dayType, scale, title }: SwapSheetProps) {
  const baseId = entry.plannedId || entry.recipeId;
  const options = swapOptions(baseId, slot, 6).filter((r) => r.id !== entry.recipeId);
  const planned = entry.swapped && entry.plannedId ? RECIPES[entry.plannedId] : undefined;
  const list = planned ? [planned, ...options.filter((r) => r.id !== planned.id)] : options;
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
      {entry.recipe && (
        <div className="mb-4 flex items-center gap-3 rounded-[16px] bg-card-2 p-3">
          <DishArt recipe={entry.recipe} dayType={dayType} variant="thumb" className="size-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="t-caption text-ink-3">Adesso nel menù</p>
            <p className="t-callout truncate font-medium text-ink">{entry.recipe.name}</p>
          </div>
          <span className="t-mono shrink-0 text-[0.75rem] text-ink-2">{fmtNumber(Math.round(cur.kcal))} kcal</span>
        </div>
      )}
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
                          {r.prepMin} min
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
      {list.length === 0 && (
        <p className="t-callout flex items-center gap-2 py-6 text-ink-2">
          <Check aria-hidden size={18} /> Per questo pasto non ci sono alternative.
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
