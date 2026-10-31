import { cn } from './cn';

export interface SkeletonProps {
  className?: string;
  /** Righe di testo finte (default 0: un solo blocco con la classe data). */
  lines?: number;
}

/** Segnaposto di caricamento con riflesso che scorre (fermo con riduzione del movimento). */
export function Skeleton({ className, lines = 0 }: SkeletonProps) {
  if (lines > 0) {
    return (
      <div className={cn('flex flex-col gap-2', className)} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="ritmo-skeleton block h-3.5 rounded-full" style={{ width: i === lines - 1 ? '62%' : '100%' }} />
        ))}
      </div>
    );
  }
  return <span aria-hidden className={cn('ritmo-skeleton block rounded-[12px]', className)} />;
}

/** Schermata in caricamento (usata da Suspense). */
export function ScreenSkeleton() {
  return (
    <div className="flex h-full flex-col gap-5 px-5 pt-[calc(var(--safe-top)+20px)]" role="status" aria-label="Caricamento">
      <Skeleton className="h-3 w-28 rounded-full" />
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-2 h-40 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
      <Skeleton className="h-24 w-full rounded-card" />
    </div>
  );
}
