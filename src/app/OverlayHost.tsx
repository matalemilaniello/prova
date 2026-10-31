/**
 * Host dei pannelli: legge ui.overlay e monta il componente di contratto (SPEC §6).
 * I componenti sono caricati a richiesta e pre-caricati quando l'app è inattiva.
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
};

const RecipeSheet = lazy(loaders.recipe);
const CheckInSheet = lazy(loaders.checkin);
const SessionPlayer = lazy(loaders.session);
const FootballSheet = lazy(loaders.football);
const BarPlanBSheet = lazy(loaders.barPlanB);

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
  }
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
                  I tuoi dati sono al sicuro. Chiudi e riprova; se succede ancora, riapri l&apos;app.
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
