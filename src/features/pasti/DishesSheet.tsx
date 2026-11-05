/**
 * I miei piatti nel foglio `mealLog` (docs/FASE2.md § 8.2, § 8.3): offline, senza chiave, in 3 tocchi dal foglio della
 * voce («I miei piatti», il piatto, «Segna»).
 *
 * Elenco: miniatura, nome, «640 kcal · P 38 g» della porzione normale; prima quelli nati in questo pasto, poi i più usati
 * (contati dal diario), poi i più recenti; la ricerca oltre 8 piatti. Tocco su un piatto: Metà · Normale · Abbondante
 * (già scelta l'ultima porzione), i valori ricalcolati, «Conta come la cena prevista · Cambia», «Segna la cena».
 * «Modifica» nell'intestazione: nome, grammi (lo stesso editor della scheda della foto), elimina con conferma nella
 * pagina. Eliminare un piatto non tocca il diario. Un solo foglio per le tre viste: cambia il contenuto, non il foglio.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search, Trash2, UtensilsCrossed } from 'lucide-react';
import type { ISODate, MealSlot, MyDish, Portion } from '../../domain/types';
import { DISH_PRUNE_FROM, DISH_SEARCH_FROM, PORTION_LABEL, PORTIONS, dishMatchesPlanned, dishUsage, scaleDish, searchDishes, sortDishes, unusedDishes } from '../../engine/dishes';
import { MAX_MEAL_ITEMS, MEAL_KCAL_MAX, itemResolved, roundKcal10 } from '../../engine/estimate';
import { fmtKcal, fmtNumber, MEAL_SLOT_LABEL } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { useApp, useUi } from '../../state/store';
import { Button, Card, EmptyState, Field, NumberTicker, Segmented, Sheet, TextInput, cn } from '../../ui';
import { markDish } from './actions';
import { ItemsEditor, newItemKey, type EditorItem } from './ItemsEditor';
import { countsAsText, dishLine, markLabel } from './logic';
import { KcalCheckLine, Macros, Photo, PlannedRow } from './parts';
import { useMealContext } from './useMealContext';

type View = 'list' | 'detail' | 'edit';
type PortionKey = '0.5' | '1' | '1.5';

export function DishesSheet({ date, slot, onClose }: { date: ISODate; slot: MealSlot; onClose: () => void }) {
  const dishes = useApp((s) => s.dishes);
  const thumbs = useApp((s) => s.dishThumbs);
  const dayLogs = useApp((s) => s.dayLogs);
  const ctx = useMealContext(date, slot);

  const [view, setView] = useState<View>('list');
  const [dishId, setDishId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  // Vista del piatto.
  const [portion, setPortion] = useState<Portion>(1);
  const [asPlanned, setAsPlanned] = useState(false);
  // Modifica del piatto.
  const [name, setName] = useState('');
  const [items, setItems] = useState<EditorItem[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const usage = useMemo(() => dishUsage(dayLogs, dishes ?? []), [dayLogs, dishes]);
  const sorted = useMemo(() => sortDishes(dishes ?? [], usage, slot), [dishes, usage, slot]);
  const shown = useMemo(() => (query.trim() ? searchDishes(sorted, query) : sorted), [sorted, query]);
  const dish = dishId ? (dishes ?? []).find((d) => d.id === dishId) : undefined;
  const scaled = useMemo(() => (dish ? scaleDish(dish, portion) : null), [dish, portion]);
  const current: View = view !== 'list' && !dish ? 'list' : view;

  const openDish = (d: MyDish) => {
    haptic('selection');
    setDishId(d.id);
    if (editing) {
      setName(d.name);
      setItems(d.items.map((i) => ({ ...i, key: newItemKey() })));
      setConfirmDelete(false);
      setView('edit');
    } else {
      setPortion(d.lastPortion ?? 1);
      setAsPlanned(dishMatchesPlanned(d, ctx.planned));
      setView('detail');
    }
  };
  const back = () => setView('list');

  const mark = () => {
    if (!dish) return;
    markDish(date, slot, dish, portion, asPlanned && Boolean(ctx.planned));
    onClose();
  };

  const resolved = items.filter(itemResolved);
  const save = () => {
    if (!dish) return;
    if (!name.trim()) return nameRef.current?.focus();
    if (!resolved.length) return;
    useApp.getState().updateDish(dish.id, { name: name.trim(), items: resolved.map(({ key: _k, confidence: _c, ...rest }) => rest) });
    haptic('success');
    useUi.getState().toast('Piatto aggiornato', 'good');
    back();
  };
  const remove = () => {
    if (!dish) return;
    useApp.getState().deleteDish(dish.id);
    haptic('warning');
    useUi.getState().toast('Piatto eliminato', 'neutral');
    setDishId(null);
    back();
  };

  // ───────────── Intestazione e piede ─────────────
  const total = dishes?.length ?? 0;
  let title = 'I miei piatti';
  let subtitle: string | undefined = MEAL_SLOT_LABEL[slot];
  let headerAction: ReactNode =
    total > 0 ? (
      <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)}>
        {editing ? 'Fine' : 'Modifica'}
      </Button>
    ) : undefined;
  let footer: ReactNode = (
    <Button variant="secondary" fullWidth size="lg" onClick={onClose}>
      Chiudi
    </Button>
  );
  if (current === 'detail' && dish && scaled) {
    title = dish.name;
    headerAction = undefined;
    footer =
      scaled.nutrients.kcal > MEAL_KCAL_MAX ? (
        <Button variant="secondary" fullWidth size="lg" onClick={() => setPortion(1)}>
          Torna alla porzione normale
        </Button>
      ) : (
        <Button fullWidth size="lg" haptic={false} onClick={mark}>
          {markLabel(slot)}
        </Button>
      );
  } else if (current === 'edit' && dish) {
    title = 'Modifica il piatto';
    subtitle = undefined;
    headerAction = undefined;
    footer = confirmDelete ? (
      <div className="flex flex-col gap-2.5">
        <Button variant="danger" fullWidth size="lg" icon={Trash2} onClick={remove}>
          Elimina
        </Button>
        <Button variant="secondary" fullWidth size="lg" onClick={() => setConfirmDelete(false)}>
          Annulla
        </Button>
      </div>
    ) : (
      <Button fullWidth size="lg" haptic={false} onClick={save}>
        {!name.trim() ? 'Scrivi il nome' : resolved.length ? 'Salva' : 'Aggiungi un alimento'}
      </Button>
    );
  }

  const unused = total > DISH_PRUNE_FROM ? unusedDishes(dishes ?? [], usage).length : 0;
  const backRow = (
    <Button variant="ghost" size="sm" icon={ChevronLeft} className="-ml-2 self-start" onClick={back}>
      I miei piatti
    </Button>
  );

  return (
    <Sheet open onClose={onClose} size="large" title={title} subtitle={subtitle} headerAction={headerAction} footer={footer}>
      <div className="flex flex-col gap-4 pb-2">
        {current === 'list' && (
          <>
            {total === 0 && (
              <EmptyState icon={UtensilsCrossed} title="Nessun piatto salvato" text="Fotografa un piatto e salvalo: qui lo ritrovi e lo segni anche senza rete." />
            )}
            {total > DISH_SEARCH_FROM && (
              <TextInput value={query} onChange={setQuery} placeholder="Cerca un piatto" aria-label="Cerca un piatto" leading={<Search size={18} aria-hidden className="text-ink-3" />} />
            )}
            {editing && <p className="t-footnote px-1 text-ink-2">Tocca un piatto per cambiare nome e grammi, o per eliminarlo.</p>}
            {unused > 0 && !editing && (
              <p className="t-footnote px-1 text-ink-2">
                Hai più di {DISH_PRUNE_FROM} piatti: in Modifica togli quelli mai segnati ({fmtNumber(unused)}).
              </p>
            )}
            {shown.length > 0 && (
              <Card padding="none">
                <ul>
                  {shown.map((d, i) => (
                    <li key={d.id} className={cn(i > 0 && 'border-t border-line')}>
                      <button
                        type="button"
                        onClick={() => openDish(d)}
                        className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-ink-soft"
                      >
                        <Photo src={thumbs?.[d.id]} size={44} alt="" dish />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="t-callout font-medium text-ink [overflow-wrap:anywhere]">{d.name}</span>
                          <span className="t-footnote text-ink-2">{dishLine(d)}</span>
                        </span>
                        <ChevronRight aria-hidden size={18} strokeWidth={2.2} className="-mr-1 shrink-0 text-ink-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {total > 0 && shown.length === 0 && <p className="t-footnote px-1 text-ink-2">Nessun piatto con questo nome.</p>}
          </>
        )}

        {current === 'detail' && dish && scaled && (
          <>
            {backRow}
            {ctx.previous && <p className="t-footnote px-1 text-ink-2">Sostituisce la stima di prima: {fmtKcal(roundKcal10(ctx.previous.nutrients.kcal))}</p>}
            <Segmented<PortionKey>
              aria-label="Porzione"
              value={String(portion) as PortionKey}
              onChange={(v) => setPortion(Number(v) as Portion)}
              options={PORTIONS.map((p) => ({ value: String(p) as PortionKey, label: PORTION_LABEL[p] }))}
            />
            <Card padding="lg">
              <div className="flex items-center gap-4">
                <Photo src={thumbs?.[dish.id]} size={64} alt="" dish />
                <div className="flex items-baseline gap-1.5">
                  <NumberTicker value={roundKcal10(scaled.nutrients.kcal)} format={(x) => fmtNumber(Math.round(x))} className="t-num text-[2.75rem] leading-none text-ink" />
                  <span className="t-unit text-ink-2">kcal</span>
                </div>
              </div>
              <Macros nutrients={scaled.nutrients} />
            </Card>
            <PlannedRow text={countsAsText(slot, asPlanned && Boolean(ctx.planned))} canChange={Boolean(ctx.planned)} onChange={() => setAsPlanned((v) => !v)} />
            <KcalCheckLine kcal={scaled.nutrients.kcal} />
          </>
        )}

        {current === 'edit' && dish && (
          <>
            {backRow}
            {confirmDelete ? (
              <p className="t-callout px-1 text-ink">Eliminare «{dish.name}»? I pasti già segnati restano nel diario.</p>
            ) : (
              <>
                <Field label="Nome">
                  <TextInput ref={nameRef} value={name} onChange={(v) => setName(v.slice(0, 40))} maxLength={40} autoComplete="off" />
                </Field>
                <ItemsEditor items={items} onChange={setItems} max={MAX_MEAL_ITEMS} />
                <Button variant="ghost" size="sm" icon={Trash2} className="self-start" onClick={() => setConfirmDelete(true)}>
                  Elimina il piatto
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
