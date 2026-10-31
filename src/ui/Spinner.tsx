import { cn } from './cn';

export interface SpinnerProps {
  size?: number;
  className?: string;
  /** Testo per i lettori di schermo (default "Caricamento"). */
  label?: string;
}

/** Indicatore di attività circolare, eredita il colore del testo. */
export function Spinner({ size = 18, className, label = 'Caricamento' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex', className)}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'ritmo-spin 0.8s linear infinite' }} aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}
