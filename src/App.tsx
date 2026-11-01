import { lazy, Suspense } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { AppShell } from './app/AppShell';
import { ErrorBoundary } from './app/ErrorBoundary';
import { OverlayHost } from './app/OverlayHost';
import { useThemeSync } from './app/theme';
import { useApp } from './state/store';
import { ScreenSkeleton } from './ui/Skeleton';
import { ToastHost } from './ui/ToastHost';

const BenvenutoScreen = lazy(() => import('./features/benvenuto/BenvenutoScreen'));

export default function App() {
  useThemeSync();
  const onboarded = useApp((s) => s.onboarded);

  return (
    <MotionConfig reducedMotion="user">
      {/* Ultimo livello: qualunque errore lascia sempre la via per esportare i dati o ripartire. */}
      <ErrorBoundary area="app" root>
        <AnimatePresence mode="wait" initial={false}>
          {onboarded ? (
            <motion.div key="app" className="h-dvh" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <AppShell />
            </motion.div>
          ) : (
            <motion.div key="benvenuto" className="h-dvh" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <ErrorBoundary area="benvenuto">
                <Suspense fallback={<ScreenSkeleton />}>
                  <BenvenutoScreen />
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
        <OverlayHost />
      </ErrorBoundary>
      <ToastHost />
      <div className="ritmo-status-scrim" aria-hidden />
    </MotionConfig>
  );
}
