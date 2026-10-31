import { useId, type ReactNode } from 'react';
import { Card, EmptyState, cn, type IconLike } from '../../../ui';

export interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  /** Numero protagonista a destra (cambia durante la lettura di un punto). */
  value?: ReactNode;
  /** Riga sotto il valore: variazione o data letta. */
  caption?: ReactNode;
  /** Elemento accanto al titolo (es. una pillola di stato). */
  badge?: ReactNode;
  /** Fascia tra intestazione e grafico (es. un controllo segmentato). */
  toolbar?: ReactNode;
  legend?: ReactNode;
  /** Nota in fondo, sotto la legenda. */
  footnote?: ReactNode;
  empty?: { icon?: IconLike; title: string; text?: ReactNode; action?: ReactNode } | null;
  className?: string;
  children?: ReactNode;
}

/** Card di un grafico: titolo, valore che risponde alla lettura, grafico a tutta larghezza, legenda. */
export function ChartCard({ title, subtitle, value, caption, badge, toolbar, legend, footnote, empty, className, children }: ChartCardProps) {
  const id = useId();
  return (
    <Card as="section" padding="none" aria-labelledby={id} className={cn('overflow-hidden', className)}>
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 id={id} className="t-headline text-ink">
              {title}
            </h3>
            {badge}
          </div>
          {subtitle && <p className="t-footnote mt-0.5 text-ink-3">{subtitle}</p>}
        </div>
        {!empty && (value !== undefined || caption) && (
          <div className="flex min-w-0 shrink-0 flex-col items-end text-right" aria-live="polite" aria-atomic="true">
            {value !== undefined && <div className="flex items-baseline gap-1">{value}</div>}
            {caption && <div className="t-footnote mt-1 whitespace-nowrap text-ink-2">{caption}</div>}
          </div>
        )}
      </header>
      {toolbar && !empty && <div className="px-4 pt-3">{toolbar}</div>}
      {empty ? (
        <EmptyState compact icon={empty.icon} title={empty.title} text={empty.text} action={empty.action} className="pb-7 pt-5" />
      ) : (
        <>
          <div className="px-2 pt-3">{children}</div>
          {(legend || footnote) && (
            <footer className="flex flex-col gap-2 px-4 pb-4 pt-2">
              {legend && <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">{legend}</div>}
              {footnote && <p className="t-caption text-ink-3">{footnote}</p>}
            </footer>
          )}
          {!legend && !footnote && <div className="h-3" />}
        </>
      )}
    </Card>
  );
}

/** Valore grande con unità, per l'intestazione dei grafici. */
export function BigValue({ value, unit, color }: { value: string; unit?: string; color?: string }) {
  return (
    <>
      <span className="t-num text-[1.75rem] leading-none" style={{ color: color ?? 'var(--ink)' }}>
        {value}
      </span>
      {unit && <span className="t-mono text-[0.75rem] text-ink-2">{unit}</span>}
    </>
  );
}

/** Voce della legenda: segno grafico (punto, linea, tratteggio, quadrato) e testo. */
export function LegendItem({
  color,
  kind = 'dot',
  children,
}: {
  color: string;
  kind?: 'dot' | 'line' | 'dash' | 'square' | 'ring';
  children: ReactNode;
}) {
  const mark =
    kind === 'line' ? (
      <span className="h-[3px] w-4 rounded-full" style={{ background: color }} />
    ) : kind === 'dash' ? (
      <span className="w-4 border-t-2 border-dashed" style={{ borderColor: color }} />
    ) : kind === 'square' ? (
      <span className="size-2.5 rounded-[3px]" style={{ background: color }} />
    ) : kind === 'ring' ? (
      <span className="size-2.5 rounded-[3px]" style={{ boxShadow: `inset 0 0 0 1.5px ${color}` }} />
    ) : (
      <span className="size-2 rounded-full" style={{ background: color }} />
    );
  return (
    <span className="t-caption inline-flex items-center gap-1.5 text-ink-2">
      <span aria-hidden className="flex items-center">
        {mark}
      </span>
      {children}
    </span>
  );
}

/** Durata in ore e minuti con le unità piccole: "6 h 58". */
export function HoursValue({ hours, size = 'text-[1.75rem]' }: { hours: number; size?: string }) {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="sr-only">{m > 0 ? `${h} ore e ${m} minuti` : `${h} ore`}</span>
      <span aria-hidden className={cn('t-num leading-none text-ink', size)}>{h}</span>
      <span aria-hidden className="t-mono text-[0.75rem] text-ink-2">h</span>
      {m > 0 && (
        <span aria-hidden className={cn('t-num leading-none text-ink', size)}>
          {String(m).padStart(2, '0')}
        </span>
      )}
    </span>
  );
}
