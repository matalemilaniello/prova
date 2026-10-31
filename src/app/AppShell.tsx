/**
 * Guscio dell'app: schermate tenute in vita (scroll e stato restano quando cambi scheda),
 * barra delle schede sfocata con la "luce dei riflettori" che segue la scheda attiva.
 */
import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CalendarDays, ChartLine, Dumbbell, MessageCircle, Sun, type LucideIcon } from 'lucide-react';
import OggiScreen from '../features/oggi/OggiScreen';
import { haptic } from '../lib/haptics';
import { ScreenSkeleton } from '../ui/Skeleton';
import { SCROLL_TOP_EVENT } from '../ui/Screen';
import { cn } from '../ui/cn';
import { spring } from '../ui/motion';
import { ErrorBoundary } from './ErrorBoundary';
import { navigate, TAB_ROUTES, useRoute, type Route } from './router';

type ScreenComponent = ComponentType | LazyExoticComponent<ComponentType>;

const SCREENS: Record<Route, ScreenComponent> = {
  oggi: OggiScreen,
  settimana: lazy(() => import('../features/settimana/SettimanaScreen')),
  allenamento: lazy(() => import('../features/allenamento/AllenamentoScreen')),
  coach: lazy(() => import('../features/coach/CoachScreen')),
  progressi: lazy(() => import('../features/progressi/ProgressiScreen')),
  impostazioni: lazy(() => import('../features/impostazioni/ImpostazioniScreen')),
  kit: lazy(() => import('./KitScreen')),
};

const TABS: { route: Route; label: string; icon: LucideIcon }[] = [
  { route: 'oggi', label: 'Oggi', icon: Sun },
  { route: 'settimana', label: 'Settimana', icon: CalendarDays },
  { route: 'allenamento', label: 'Allenamento', icon: Dumbbell },
  { route: 'coach', label: 'Coach', icon: MessageCircle },
  { route: 'progressi', label: 'Progressi', icon: ChartLine },
];

function TabBar({ route }: { route: Route }) {
  const reduce = useReducedMotion();
  return (
    <nav
      aria-label="Sezioni"
      className="glass absolute inset-0 border-t border-[var(--bar-line)]"
      style={{ paddingLeft: 'var(--safe-left)', paddingRight: 'var(--safe-right)' }}
    >
      <ul className="mx-auto flex h-[var(--tabbar-core)] max-w-[560px] items-stretch">
        {TABS.map(({ route: r, label, icon: Icon }) => {
          const active = r === route;
          return (
            <li key={r} className="relative flex flex-1">
              {active && (
                <motion.span
                  layoutId="tab-light"
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
                  transition={reduce ? { duration: 0 } : spring}
                >
                  <span className="relative block h-[3px] w-7 rounded-b-full bg-accent shadow-[0_0_12px_2px_var(--accent-glow)]" />
                  <span
                    className="absolute top-0 h-10 w-16"
                    style={{ background: 'radial-gradient(60% 100% at 50% 0%, var(--accent-soft), transparent 75%)' }}
                  />
                </motion.span>
              )}
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  haptic('selection');
                  if (active) window.dispatchEvent(new Event(SCROLL_TOP_EVENT));
                  else navigate(r);
                }}
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-[3px] pt-1 transition-colors duration-200',
                  active ? 'text-accent-ink' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                <motion.span
                  animate={reduce ? undefined : { scale: active ? 1 : 0.94, y: active ? -1 : 0 }}
                  transition={spring}
                  className="grid place-items-center"
                >
                  <Icon size={24} strokeWidth={active ? 2.3 : 1.9} aria-hidden />
                </motion.span>
                <span className={cn('text-[0.6875rem] leading-none tracking-[0.01em]', active ? 'font-semibold' : 'font-medium')}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell() {
  const route = useRoute();
  const [visited, setVisited] = useState<Route[]>(() => [route]);

  useEffect(() => {
    setVisited((v) => (v.includes(route) ? v : [...v, route]));
  }, [route]);

  // Precarica le altre schede dopo il primo disegno.
  useEffect(() => {
    const id = window.setTimeout(() => {
      void import('../features/settimana/SettimanaScreen');
      void import('../features/allenamento/AllenamentoScreen');
      void import('../features/coach/CoachScreen');
      void import('../features/progressi/ProgressiScreen');
    }, 1800);
    return () => window.clearTimeout(id);
  }, []);

  const showTabs = TAB_ROUTES.includes(route);
  const layers = visited.includes(route) ? visited : [...visited, route];

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      {layers.map((r) => {
        const Comp = SCREENS[r];
        const active = r === route;
        return (
          <section
            key={r}
            data-screen={r}
            data-screen-active={active}
            aria-hidden={!active}
            inert={!active}
            className={cn('absolute inset-0', active ? 'visible z-[1] ritmo-screen-enter' : 'invisible z-0')}
          >
            <ErrorBoundary area={`schermata ${r}`}>
              <Suspense fallback={<ScreenSkeleton />}>
                <Comp />
              </Suspense>
            </ErrorBoundary>
          </section>
        );
      })}
      <motion.div
        initial={false}
        animate={{ y: showTabs ? 0 : 'calc(100% + 8px)' }}
        transition={spring}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 [&>*]:pointer-events-auto"
        style={{ height: 'var(--tabbar-h)' }}
        aria-hidden={!showTabs}
        inert={!showTabs}
      >
        <TabBar route={route} />
      </motion.div>
    </div>
  );
}
