import type { ReactNode } from 'react';
import { cn } from './cn';
import { renderIcon, type IconLike } from './icon';

export interface EmptyStateProps {
  icon?: IconLike;
  title: string;
  text?: ReactNode;
  /** Pulsante o link. */
  action?: ReactNode;
  /** Versione compatta per l'interno delle card. */
  compact?: boolean;
  className?: string;
}

/** Stato vuoto: icona in un cerchio con le righe del campo, titolo, testo, azione. */
export function EmptyState({ icon, title, text, action, compact, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12', className)}>
      {icon && (
        <span
          aria-hidden
          className={cn('relative grid place-items-center rounded-full text-accent-ink', compact ? 'mb-1 size-12' : 'mb-2 size-16')}
          style={{ background: 'radial-gradient(circle at 50% 30%, var(--accent-soft), transparent 70%)' }}
        >
          <span className="absolute inset-0 rounded-full border border-dashed border-line-strong" />
          {renderIcon(icon, compact ? 22 : 28, 1.8)}
        </span>
      )}
      <h3 className={cn(compact ? 't-headline' : 't-title-2', 'text-ink')}>{title}</h3>
      {text && <p className="t-callout max-w-[32ch] text-ink-2">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
