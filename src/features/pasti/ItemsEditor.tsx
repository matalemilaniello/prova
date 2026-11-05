/**
 * Elenco modificabile degli alimenti di una stima o di un piatto (§ 7.4, § 8.3): nome, porzione a mano per l'archivio,
 * grammi con passi di 10 g sotto i 100 g e di 25 g sopra, un «?» sugli alimenti incerti, «Aggiungi un alimento» con la
 * ricerca nell'archivio. Un alimento fuori archivio senza valori chiede di sceglierne uno dall'archivio.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleHelp, Plus, Search, X } from 'lucide-react';
import type { EstimateConfidence, EstimatedItem, Food } from '../../domain/types';
import { itemName, itemResolved, portionHint, stepGrams } from '../../engine/estimate';
import { fmtNumber } from '../../lib/format';
import { Button, Card, IconButton, ListGroup, ListRow, Stepper, TextInput, cn } from '../../ui';
import { defaultGrams, searchFoods } from './logic';

/** Un alimento nell'editor: la forma compatta con una chiave stabile e, dalla foto, la confidenza. */
export interface EditorItem extends EstimatedItem {
  key: string;
  confidence?: EstimateConfidence;
}

let keySeq = 0;
/** Chiave nuova per un alimento aggiunto a mano (solo interfaccia). */
export const newItemKey = () => `n${++keySeq}`;

/** Grammi con i passi della scheda: lo `Stepper` del design system, con il passo che dipende dal valore. */
function GramsStepper({ value, onChange, label }: { value: number; onChange: (g: number) => void; label: string }) {
  return (
    <Stepper
      label={`Grammi di ${label}`}
      hideLabel
      unit="g"
      min={5}
      max={1500}
      step={5}
      value={value}
      format={(n) => fmtNumber(Math.round(n))}
      onChange={(next) => onChange(stepGrams(value, next > value ? 1 : -1))}
      className="w-[156px] shrink-0"
    />
  );
}

/** Ricerca nell'archivio (e nelle sole stime): un campo e al massimo 8 risultati. */
export function FoodSearch({ onPick, onCancel }: { onPick: (food: Food) => void; onCancel: () => void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchFoods(q), [q]);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const id = window.setTimeout(() => ref.current?.focus({ preventScroll: true }), 120);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="flex flex-col gap-2">
      <TextInput
        ref={ref}
        value={q}
        onChange={setQ}
        placeholder="Cerca un alimento"
        aria-label="Cerca un alimento"
        enterKeyHint="search"
        leading={<Search size={18} aria-hidden className="text-ink-3" />}
      />
      {results.length > 0 && (
        <ListGroup>
          {results.map((f) => (
            <ListRow key={f.id} title={f.name} chevron={false} onPress={() => onPick(f)} />
          ))}
        </ListGroup>
      )}
      {q.trim() !== '' && results.length === 0 && <p className="t-footnote px-1 text-ink-2">Nessun alimento con questo nome.</p>}
      <Button variant="ghost" size="sm" className="self-start" onClick={onCancel}>
        Annulla
      </Button>
    </div>
  );
}

export interface ItemsEditorProps {
  items: EditorItem[];
  onChange: (items: EditorItem[]) => void;
  /** Alimenti al massimo: oltre, «Aggiungi un alimento» non compare. */
  max: number;
  /** Ricerca aperta dall'esterno (il pulsante «Aggiungi un alimento» del piede). */
  searchOpen?: boolean;
  onSearchOpenChange?: (open: boolean) => void;
}

export function ItemsEditor({ items, onChange, max, searchOpen, onSearchOpenChange }: ItemsEditorProps) {
  const [ownSearch, setOwnSearch] = useState(false);
  const adding = searchOpen ?? ownSearch;
  const setAdding = (v: boolean) => (onSearchOpenChange ? onSearchOpenChange(v) : setOwnSearch(v));
  // Alimento senza valori da sostituire con uno dell'archivio.
  const [replacing, setReplacing] = useState<string | null>(null);

  const update = (key: string, patch: Partial<EditorItem>) => onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key: string) => onChange(items.filter((i) => i.key !== key));
  const add = (food: Food) => {
    onChange([...items, { key: newItemKey(), foodId: food.id, grams: defaultGrams(food), confidence: 'alta' }]);
    setAdding(false);
  };
  const replace = (key: string, food: Food) => {
    onChange(items.map((i) => (i.key === key ? { key: i.key, foodId: food.id, grams: i.grams, role: i.role, confidence: 'alta' } : i)));
    setReplacing(null);
  };

  return (
    <section className="flex flex-col gap-2" aria-label="Alimenti">
      <h3 className="t-label px-1 text-ink-3">Alimenti</h3>
      {items.length > 0 && (
        <Card padding="none">
          <ul>
            {items.map((it, i) => {
              const name = itemName(it);
              const resolved = itemResolved(it);
              const hint = resolved ? portionHint(it) : null;
              return (
                <li
                  key={it.key}
                  data-item={it.key}
                  data-unresolved={resolved ? undefined : 'true'}
                  className={cn('flex flex-col gap-2 py-3 pl-4 pr-2', i > 0 && 'border-t border-line')}
                >
                  <div className="flex items-start gap-2">
                    <span className="t-callout flex min-w-0 flex-1 items-center gap-1.5 pt-1.5 font-medium text-ink">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
                      {it.confidence === 'bassa' && (
                        <CircleHelp size={15} strokeWidth={2.4} className="shrink-0 text-warn-ink" aria-label="Stima incerta" role="img" />
                      )}
                    </span>
                    <IconButton icon={X} label={`Togli ${name}`} variant="plain" size="sm" onClick={() => remove(it.key)} />
                  </div>
                  {replacing === it.key ? (
                    <FoodSearch onPick={(f) => replace(it.key, f)} onCancel={() => setReplacing(null)} />
                  ) : resolved ? (
                    <div className="-mt-1 flex items-center justify-between gap-3">
                      <span className="t-footnote min-w-0 text-ink-2">{hint}</span>
                      <GramsStepper label={name} value={it.grams} onChange={(g) => update(it.key, { grams: g })} />
                    </div>
                  ) : (
                    <>
                      <span className="t-footnote -mt-1 text-warn-ink">Senza valori: scegline uno dall’archivio</span>
                      <Button variant="secondary" size="sm" icon={Search} className="self-start" onClick={() => setReplacing(it.key)}>
                        Scegli dall’archivio
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {adding ? (
        <FoodSearch onPick={add} onCancel={() => setAdding(false)} />
      ) : (
        items.length < max && (
          <Button variant="ghost" size="sm" icon={Plus} className="self-start" onClick={() => setAdding(true)}>
            Aggiungi un alimento
          </Button>
        )
      )}
    </section>
  );
}
