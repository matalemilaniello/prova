import { beforeEach, describe, expect, it } from 'vitest';
import type { Plan } from '../../domain/types';
import { buildDay, effectiveStatus, shoppingTarget, STARTER_SHOPPING_ID } from '../../engine/timeline';
import { shoppingList, shoppingProgress } from '../../engine/shopping';
import { useApp } from '../../state/store';
import { setItemStatusSynced } from './shoppingSync';

// Settimana del 9 novembre 2026: benvenuto completato mercoledì 11 alle 15:30, spesa di avvio alle 16:00.
const MON = '2026-11-09';
const WED = '2026-11-11';

function setup() {
  useApp.getState().resetAll();
  useApp.setState((s) => ({ plan: { ...s.plan, startDate: MON, firstUse: { date: WED, time: '15:30' } } as Plan }));
  const state = useApp.getState();
  const item = buildDay(WED, state).find((i) => i.id === STARTER_SHOPPING_ID)!;
  return { item, keys: shoppingTarget(WED, state, item)!.keys };
}

/** La lista come la mostra Settimana: settimana del primo avvio, da mercoledì. */
const settimana = () => {
  const s = useApp.getState();
  return shoppingProgress(shoppingList(MON, s, { fromDate: WED }), s.shoppingChecked[MON]);
};

describe('spesa segnata in Oggi e lista di Settimana', () => {
  beforeEach(() => useApp.getState().resetAll());

  it('fatto in Oggi spunta tutta la lista; l’Annulla rimette le spunte di prima', () => {
    const { item, keys } = setup();
    expect(keys.length).toBeGreaterThan(3);
    // Due prodotti già presi da Settimana.
    useApp.setState({ shoppingChecked: { [MON]: keys.slice(0, 2) } });
    setItemStatusSynced(WED, item, 'fatto');
    expect(settimana()).toMatchObject({ done: keys.length, total: keys.length });
    expect(effectiveStatus(WED, useApp.getState())[STARTER_SHOPPING_ID]).toBe('fatto');
    setItemStatusSynced(WED, item, null);
    expect(useApp.getState().shoppingChecked[MON]).toEqual(keys.slice(0, 2));
    expect(effectiveStatus(WED, useApp.getState())[STARTER_SHOPPING_ID]).toBeUndefined();
  });

  it('saltata dopo fatto: la lista torna com’era', () => {
    const { item, keys } = setup();
    setItemStatusSynced(WED, item, 'fatto');
    setItemStatusSynced(WED, item, 'saltato');
    expect(useApp.getState().shoppingChecked[MON]).toEqual([]);
    expect(settimana().done).toBe(0);
    expect(keys.length).toBeGreaterThan(0);
  });

  it('dopo un riavvio, annullare la spesa toglie le spunte della lista e lascia la dispensa', () => {
    const { item, keys } = setup();
    // Stato salvato da una sessione precedente: voce fatta e lista completa, più un prodotto da dispensa.
    useApp.setState({ shoppingChecked: { [MON]: [...keys, 'olio-evo'] } });
    useApp.getState().setItemStatus(WED, item.id, 'fatto');
    setItemStatusSynced(WED, item, null);
    expect(useApp.getState().shoppingChecked[MON]).toEqual(['olio-evo']);
    expect(effectiveStatus(WED, useApp.getState())[STARTER_SHOPPING_ID]).toBeUndefined();
  });

  it('le altre voci non toccano la lista', () => {
    const { keys } = setup();
    useApp.setState({ shoppingChecked: { [MON]: keys.slice(0, 1) } });
    const pasto = buildDay(WED, useApp.getState()).find((i) => i.kind === 'pasto' && i.slot === 'cena')!;
    setItemStatusSynced(WED, pasto, 'fatto');
    expect(useApp.getState().shoppingChecked[MON]).toEqual(keys.slice(0, 1));
  });
});
