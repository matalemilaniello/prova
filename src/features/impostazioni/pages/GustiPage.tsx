/**
 * Impostazioni › Gusti (docs/FASE2.md § 6.2): gli alimenti esclusi dall'utente, con «Riattiva», e «Aggiungi un
 * alimento» con la ricerca nell'archivio (senza dispensa né divieti di prevenzione, che non si vedono qui). Un'esclusione
 * vale da domani. Se le esclusioni fanno mancare fibre, verdura o lasciano pasti senza ricetta, una riga lo dice (§ 6.4).
 */
import { useMemo, useState } from 'react';
import { Salad, Search } from 'lucide-react';
import type { FoodExclusion } from '../../../domain/types';
import { FOODS } from '../../../data/foods';
import { addDays, formatDayLong } from '../../../engine/dates';
import { agreed, foodLabel, foodWithArticle, searchableFoods, userExclusions } from '../../../engine/exclusions';
import { exclusionWarnings } from '../../../engine/similar';
import { capitalize, listIt, plural } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { usePlanDay } from '../../../state/hooks';
import { useApp, useUi } from '../../../state/store';
import { Button, Callout, EmptyState, ListGroup, ListRow, TextInput } from '../../../ui';
import { excludeFromPlan } from '../../settimana/SwapSheet';
import { Page, type PageProps } from './Page';

/** Da dove viene l'esclusione, accordato all'alimento: «Tolte da una ricetta», «Aggiunto qui». */
function originText(e: FoodExclusion): string {
  if (e.origin === 'non-mi-piace') return `${agreed(e.foodId, 'Tolt')} da una ricetta`;
  if (e.origin === 'cambi-ripetuti') return `${agreed(e.foodId, 'Tolt')} dopo i cambi ripetuti`;
  return `${agreed(e.foodId, 'Aggiunt')} qui`;
}

/** Testo di ricerca senza accenti né maiuscole. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();

/** Risultati in vista al massimo. */
const MAX_RESULTS = 8;

export default function GustiPage({ onBack, backLabel }: PageProps) {
  const plan = useApp((s) => s.plan);
  const today = usePlanDay();
  const [query, setQuery] = useState('');
  const excluded = userExclusions(plan);
  const ids = new Set(excluded.map((e) => e.foodId));

  const results = useMemo(() => {
    const q = norm(query);
    if (q.length < 2) return [];
    return searchableFoods()
      .filter((id) => !plan.exclusions?.some((e) => e.foodId === id))
      .filter((id) => norm(foodLabel(id)).includes(q) || norm(FOODS[id]?.name ?? '').includes(q))
      .sort((a, b) => Number(!norm(foodLabel(a)).startsWith(q)) - Number(!norm(foodLabel(b)).startsWith(q)) || foodLabel(a).localeCompare(foodLabel(b), 'it'))
      .slice(0, MAX_RESULTS);
  }, [query, plan.exclusions]);

  const warning = useMemo(() => warningText(plan, today), [plan, today]);

  const reactivate = (e: FoodExclusion) => {
    haptic('selection');
    useApp.getState().removeExclusion(e.foodId);
    useUi.getState().toast(`${agreed(e.foodId, 'Riattivat')} ${foodWithArticle(e.foodId)}`, 'good', {
      actionLabel: 'Annulla',
      onAction: () => useApp.getState().addExclusion(e.foodId, e.origin, e.since),
    });
  };

  const sinceText = (e: FoodExclusion) => (e.since > today ? (e.since === addDays(today, 1) ? 'da domani' : `da ${formatDayLong(e.since)}`) : '');

  return (
    <Page title="Gusti" subtitle="Quello che togli sparisce da menù, alternative, spesa, piano B e consigli del coach." onBack={onBack} backLabel={backLabel}>
      {excluded.length ? (
        <ListGroup title="Non mangio">
          {excluded.map((e) => (
            <ListRow
              key={e.foodId}
              title={capitalize(foodLabel(e.foodId))}
              subtitle={[originText(e), sinceText(e)].filter(Boolean).join(', ')}
              trailing={
                <Button variant="secondary" size="sm" onClick={() => reactivate(e)} aria-label={`Riattiva: ${foodLabel(e.foodId)}`}>
                  Riattiva
                </Button>
              }
            />
          ))}
        </ListGroup>
      ) : (
        <EmptyState compact icon={Salad} title="Niente da togliere" text="Quando un alimento non ti piace, toccalo nella ricetta: sparisce da tutto il piano." />
      )}

      {warning && <Callout>{warning}</Callout>}

      <section className="flex flex-col gap-2" aria-labelledby="gusti-aggiungi">
        <h3 id="gusti-aggiungi" className="t-label px-1 text-ink-3">
          Aggiungi un alimento
        </h3>
        <TextInput value={query} onChange={setQuery} placeholder="Cerca nell’archivio" leading={<Search size={18} strokeWidth={2.2} aria-hidden />} aria-label="Cerca un alimento da togliere" />
        {results.length > 0 && (
          <ListGroup>
            {results.map((id) => (
              <ListRow
                key={id}
                title={capitalize(foodLabel(id))}
                trailing={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      excludeFromPlan([id], 'impostazioni', today);
                      setQuery('');
                    }}
                    aria-label={`Togli dal piano: ${foodLabel(id)}`}
                  >
                    Togli
                  </Button>
                }
              />
            ))}
          </ListGroup>
        )}
        {norm(query).length >= 2 && results.length === 0 && (
          <p className="t-footnote px-1 text-ink-3">{ids.size && searchableFoods().some((id) => ids.has(id) && norm(foodLabel(id)).includes(norm(query))) ? 'È già tra quelli che non mangi.' : 'Nessun alimento con questo nome nell’archivio.'}</p>
        )}
      </section>
    </Page>
  );
}

/** «Senza il pane integrale alcuni giorni hanno meno fibre.» e i pasti rimasti da scegliere, oppure null. */
function warningText(plan: Parameters<typeof exclusionWarnings>[0], today: string): string | null {
  const ex = userExclusions(plan);
  if (!ex.length) return null;
  const w = exclusionWarnings(plan, addDays(today, 1), 14);
  const less: string[] = [];
  if (w.fiberDays) less.push('meno fibre');
  if (w.vegDays) less.push('meno verdura e frutta');
  const parts: string[] = [];
  const without = `Senza ${listIt(ex.map((e) => foodWithArticle(e.foodId)))}`;
  if (less.length) parts.push(`${without} alcuni giorni hanno ${listIt(less)}.`);
  if (w.cleared.length) {
    const n = w.cleared.length;
    parts.push(`${less.length ? '' : `${without}, `}${plural(n, 'pasto', 'pasti')} delle prossime due settimane ${n === 1 ? 'resta' : 'restano'} senza una ricetta adatta: in Oggi ${n === 1 ? 'lo scegli' : 'li scegli'} tu.`);
  }
  return parts.length ? capitalize(parts.join(' ')) : null;
}
