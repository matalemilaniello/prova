/**
 * La spesa segnata in Oggi e la lista di Settimana dicono la stessa cosa. Segnando fatta una voce della spesa
 * (`rito:spesa`, `rito:spesa-avvio`) si spuntano anche tutte le voci della sua lista; annullandola, saltandola
 * o segnandola sostituita torna la lista di prima. Al contrario, spuntare la lista in Settimana segna già la voce
 * in Oggi (`derivedStatus`).
 */
import type { ISODate, ItemStatus } from '../../domain/types';
import { derivedStatus, shoppingTarget, type DayItem } from '../../engine/timeline';
import { useApp } from '../../state/store';

/** Spunte della lista prima che Oggi la completasse, per settimana: l'Annulla le rimette com'erano. */
const before = new Map<ISODate, string[]>();

type Item = Pick<DayItem, 'id' | 'kind' | 'time' | 'title'>;

/** `setItemStatus` dello store, con la lista della spesa allineata alla voce. Per tutte le voci di Oggi. */
export function setItemStatusSynced(date: ISODate, item: Item, status: ItemStatus | null, note?: string): void {
  if (item.kind === 'spesa') syncShoppingList(date, item, status);
  useApp.getState().setItemStatus(date, item.id, status, note);
}

function syncShoppingList(date: ISODate, item: Item, next: ItemStatus | null): void {
  const app = useApp.getState();
  const target = shoppingTarget(date, app, item);
  if (!target || !target.keys.length) return;
  const { weekStart, keys } = target;
  const current = app.shoppingChecked[weekStart] ?? [];
  const write = (list: string[]) => useApp.setState((s) => ({ shoppingChecked: { ...s.shoppingChecked, [weekStart]: list } }));

  if (next === 'fatto') {
    if (!before.has(weekStart)) before.set(weekStart, current);
    const have = new Set(current);
    const missing = keys.filter((k) => !have.has(k));
    if (missing.length) write([...current, ...missing]);
    return;
  }

  const saved = before.get(weekStart);
  if (saved) {
    before.delete(weekStart);
    write(saved);
    return;
  }
  // Dopo un riavvio la lista di prima non c'è più: se la spesa era segnata fatta e la lista risulta completa, le sue
  // voci tornano da prendere (i prodotti da dispensa restano), altrimenti la voce resterebbe fatta dalle spunte.
  const was = app.dayLogs[date]?.status?.[item.id];
  if (was === 'fatto' && derivedStatus(date, app, item as DayItem) === 'fatto') {
    const drop = new Set(keys);
    write(current.filter((k) => !drop.has(k)));
  }
}
