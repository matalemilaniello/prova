import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { DemoBadge } from './DemoBadge';
import { useApp } from '../state/store';

export interface ScreenProps {
  /** Titolo grande (Barlow Condensed 36 px); compare piccolo nella barra quando scorri. */
  title: string;
  /** Riga piccola sopra il titolo (es. la data), in maiuscoletto. */
  eyebrow?: ReactNode;
  /** Testo o elementi sotto il titolo. */
  subtitle?: ReactNode;
  /** Azioni a destra del titolo (IconButton…). */
  actions?: ReactNode;
  /** Pulsante "indietro" nella barra in alto. */
  onBack?: () => void;
  backLabel?: string;
  /** Fascia che resta attaccata in alto sotto la barra (es. un Segmented). */
  toolbar?: ReactNode;
  /** Spazio in fondo: 'tabbar' (default, sopra la barra delle schede) o 'safe' (solo la safe area). */
  bottom?: 'tabbar' | 'safe';
  /** Classi del contenitore dei contenuti (default: colonna con spazi da 24 px). */
  contentClassName?: string;
  className?: string;
  children?: ReactNode;
}

const sidePad: CSSProperties = {
  paddingLeft: 'calc(var(--gutter) + var(--safe-left))',
  paddingRight: 'calc(var(--gutter) + var(--safe-right))',
};

/** Evento per tornare in cima alla schermata attiva (tocco sulla scheda già selezionata). */
export const SCROLL_TOP_EVENT = 'ritmo:scroll-top';

/**
 * Schermata con titolo grande in stile iOS, azioni a destra, sottotitolo e contenuto che scorre
 * con lo spazio per la barra delle schede. Quando scorri compare una barra sfocata con il titolo piccolo.
 */
export function Screen({
  title,
  eyebrow,
  subtitle,
  actions,
  onBack,
  backLabel = 'Indietro',
  toolbar,
  bottom = 'tabbar',
  contentClassName,
  className,
  children,
}: ScreenProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const demo = useApp((st) => st.settings.demoData);
  const { scrollY } = useScroll({ container: scrollRef });
  const barOpacity = useTransform(scrollY, [8, 44], [0, 1]);
  const titleOpacity = useTransform(scrollY, [40, 68], [0, 1]);
  const titleY = useTransform(scrollY, [40, 68], [6, 0]);
  const largeOpacity = useTransform(scrollY, [0, 48], [1, 0]);

  useEffect(() => {
    const onTop = () => {
      const el = scrollRef.current;
      if (!el || !el.closest('[data-screen-active="true"]')) return;
      el.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener(SCROLL_TOP_EVENT, onTop);
    return () => window.removeEventListener(SCROLL_TOP_EVENT, onTop);
  }, []);

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      {/* Barra compatta: sfocata, compare scorrendo. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        <motion.div
          aria-hidden
          className="glass absolute inset-0 border-b border-[var(--bar-line)]"
          style={{ opacity: onBack ? 1 : barOpacity }}
        />
        <div className="relative flex h-[calc(var(--safe-top)+44px)] items-end" style={sidePad}>
          <div className="flex h-11 w-full items-center">
            <div className="flex w-1/4 items-center">
              {onBack && (
                <button
                  type="button"
                  onClick={() => {
                    haptic('selection');
                    onBack();
                  }}
                  className="pointer-events-auto -ml-2 flex h-11 items-center gap-0.5 pr-2 text-[1.0625rem] font-medium text-accent-ink"
                >
                  <ChevronLeft size={26} strokeWidth={2.4} aria-hidden />
                  {backLabel}
                </button>
              )}
            </div>
            <motion.div className="t-headline min-w-0 flex-1 truncate text-center" style={{ opacity: titleOpacity, y: titleY }} aria-hidden>
              {title}
            </motion.div>
            <div className="w-1/4" />
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden overscroll-y-contain" data-scroll-container>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px]" style={{ background: 'var(--floodlight)' }} />
        <motion.header
          className={cn('relative pb-5', onBack ? 'pt-[calc(var(--safe-top)+52px)]' : 'pt-[calc(var(--safe-top)+14px)]')}
          style={{ ...sidePad, opacity: largeOpacity }}
        >
          {(eyebrow || demo) && (
            <div className="flex min-h-6 items-center justify-between gap-3">
              <div className="t-label min-w-0 truncate text-ink-3">{eyebrow}</div>
              <DemoBadge />
            </div>
          )}
          <div className={cn('flex items-center justify-between gap-3', Boolean(eyebrow || demo) && 'mt-1.5')}>
            <h1 className="t-large-title min-w-0 text-ink">{title}</h1>
            {actions && <div className="-mr-1 flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
          {subtitle && <div className="t-callout mt-2 text-ink-2">{subtitle}</div>}
        </motion.header>

        {toolbar && (
          <div className="sticky top-[calc(var(--safe-top)+44px)] z-10 pb-3 pt-2" style={sidePad}>
            <motion.div aria-hidden className="glass absolute inset-0 border-b border-[var(--bar-line)]" style={{ opacity: barOpacity }} />
            <div className="relative">{toolbar}</div>
          </div>
        )}

        <main
          className={cn(
            'relative flex flex-col gap-6',
            bottom === 'tabbar' ? 'pb-[calc(var(--tabbar-h)+32px)]' : 'pb-[max(var(--safe-bottom),24px)]',
            contentClassName,
          )}
          style={sidePad}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
