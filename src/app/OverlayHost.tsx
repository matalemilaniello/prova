/**
 * Host dei pannelli: legge ui.overlay e monta il componente di contratto (SPEC §6).
 * I componenti sono caricati a richiesta e pre-caricati quando l'app è inattiva.
 *
 * Pannelli della fase 2 (docs/FASE2.md § 11.3): `planProposal` e `mealLog` sono i fogli veri
 * (`features/piano/PlanProposalSheet`, `features/pasti/MealLogSheet`); `supplement` per ora mostra un segnaposto, che
 * l'onda che lo costruisce sostituisce con il caricamento del suo file.
 */
import { lazy, Suspense, useEffect, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Overlay } from '../domain/types';
import { useUi } from '../state/store';
import { IS_PREVIEW } from './env';
import { ErrorBoundary } from './ErrorBoundary';
import { Sheet } from '../ui/Sheet';

const loaders = {
  recipe: () => import('../features/settimana/RecipeSheet'),
  checkin: () => import('../features/oggi/CheckInSheet'),
  session: () => import('../features/allenamento/SessionPlayer'),
  football: () => import('../features/oggi/FootballSheet'),
  barPlanB: () => import('../features/coach/BarPlanBSheet'),
  planProposal: () => import('../features/piano/PlanProposalSheet'),
  mealLog: () => import('../features/pasti/MealLogSheet'),
};

const RecipeSheet = lazy(loaders.recipe);
const CheckInSheet = lazy(loaders.checkin);
const SessionPlayer = lazy(loaders.session);
const FootballSheet = lazy(loaders.football);
const BarPlanBSheet = lazy(loaders.barPlanB);
const PlanProposalSheet = lazy(loaders.planProposal);
const MealLogSheet = lazy(loaders.mealLog);

/** Scarica in anticipo i pannelli, così si aprono subito. */
export function preloadOverlays() {
  for (const load of Object.values(loaders)) load().catch(() => undefined);
}

function keyOf(o: NonNullable<Overlay>): string {
  switch (o.type) {
    case 'recipe':
      return `recipe:${o.recipeId}:${o.date}:${o.slot ?? ''}`;
    case 'checkin':
      return `checkin:${o.date}`;
    case 'session':
      return `session:${o.sessionId}:${o.date}`;
    case 'football':
      return `football:${o.date}:${o.itemId}`;
    case 'barPlanB':
      return `barPlanB:${o.slot ?? ''}`;
    case 'mealLog':
      return `mealLog:${o.date}:${o.slot}:${o.mode}:${o.chatMessageId ?? ''}`;
    case 'planProposal':
      return `planProposal:${o.id}`;
    case 'supplement':
      return `supplement:${o.supplementId ?? ''}`;
  }
}

/** Titoli dei pannelli della fase 2 non ancora costruiti. */
const PLACEHOLDER_TITLE = {
  supplement: 'Integratore',
} as const;

/** Segnaposto di un pannello della fase 2: si apre e si chiude, senza dati. */
function PlaceholderSheet({ type, onClose }: { type: keyof typeof PLACEHOLDER_TITLE; onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title={PLACEHOLDER_TITLE[type]}>
      <p className="t-callout pb-2 text-ink-2">Questa parte arriva con un prossimo aggiornamento di Ritmo.</p>
    </Sheet>
  );
}

function render(o: NonNullable<Overlay>, onClose: () => void) {
  switch (o.type) {
    case 'recipe':
      return <RecipeSheet recipeId={o.recipeId} date={o.date} slot={o.slot} onClose={onClose} />;
    case 'checkin':
      return <CheckInSheet date={o.date} onClose={onClose} />;
    case 'session':
      return <SessionPlayer sessionId={o.sessionId} date={o.date} onClose={onClose} />;
    case 'football':
      return <FootballSheet date={o.date} kind={o.kind} itemId={o.itemId} onClose={onClose} />;
    case 'barPlanB':
      return <BarPlanBSheet slot={o.slot} onClose={onClose} />;
    case 'planProposal':
      return <PlanProposalSheet id={o.id} onClose={onClose} />;
    case 'mealLog':
      return <MealLogSheet date={o.date} slot={o.slot} mode={o.mode} chatMessageId={o.chatMessageId} onClose={onClose} />;
    case 'supplement':
      return <PlaceholderSheet type={o.type} onClose={onClose} />;
  }
}

/**
 * Il tasto o il gesto "indietro" (Android, browser) chiude il pannello invece di lasciare la schermata.
 * Nell'anteprima (iframe) la cronologia non si tocca.
 */
function useBackCloses(open: boolean, close: () => void) {
  const pushed = useRef(false);
  const selfBackAt = useRef(0);
  useEffect(() => {
    if (IS_PREVIEW) return;
    try {
      if (open && !pushed.current) {
        history.pushState({ ...(history.state ?? {}), ritmoOverlay: true }, '');
        pushed.current = true;
      } else if (!open && pushed.current) {
        pushed.current = false;
        if (history.state?.ritmoOverlay) {
          selfBackAt.current = Date.now();
          history.back();
        }
      }
    } catch {
      pushed.current = false;
    }
  }, [open]);
  useEffect(() => {
    if (IS_PREVIEW) return;
    const onPop = () => {
      // Il popstate generato dal nostro history.back() non deve chiudere un pannello appena aperto.
      if (Date.now() - selfBackAt.current < 400) return;
      if (pushed.current) {
        pushed.current = false;
        close();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [close]);
}

export function OverlayHost() {
  const overlay = useUi((s) => s.overlay);
  const close = useUi((s) => s.close);
  useBackCloses(overlay !== null, close);

  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(preloadOverlays, { timeout: 4000 });
    else window.setTimeout(preloadOverlays, 2500);
  }, []);

  return (
    <Suspense fallback={null}>
      <AnimatePresence>
        {overlay && (
          <ErrorBoundary
            key={keyOf(overlay)}
            area={`pannello ${overlay.type}`}
            onReset={close}
            fallback={(reset) => (
              <Sheet open onClose={reset} title="Il pannello non si è aperto">
                <p className="t-callout pb-2 text-ink-2">
                  I tuoi dati sono al sicuro. Chiudi e riprova; se succede ancora, riapri l’app.
                </p>
              </Sheet>
            )}
          >
            {render(overlay, close)}
          </ErrorBoundary>
        )}
      </AnimatePresence>
    </Suspense>
  );
}
