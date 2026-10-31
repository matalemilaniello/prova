import type { ReactNode } from 'react';
import { cn } from './cn';

export interface SectionTitleProps {
  children: ReactNode;
  /** Azione a destra: un nodo, oppure { label, onPress } per un link testuale. */
  action?: ReactNode | { label: string; onPress: () => void };
  /** Testo secondario sotto il titolo. */
  subtitle?: ReactNode;
  /** 'label' (maiuscoletto mono, default) o 'title' (Barlow Condensed). */
  variant?: 'label' | 'title';
  as?: 'h2' | 'h3';
  id?: string;
  className?: string;
}

/** Titolo di sezione con azione facoltativa a destra. */
export function SectionTitle({ children, action, subtitle, variant = 'label', as = 'h2', id, className }: SectionTitleProps) {
  const Tag = as;
  const act =
    action && typeof action === 'object' && 'label' in (action as object) && 'onPress' in (action as object) ? (
      <button
        type="button"
        onClick={(action as { onPress: () => void }).onPress}
        className="hit-44 t-footnote font-semibold text-accent-ink"
      >
        {(action as { label: string }).label}
      </button>
    ) : (
      (action as ReactNode)
    );
  return (
    <div className={cn('flex items-end justify-between gap-3 px-1', className)}>
      <div className="min-w-0">
        <Tag id={id} className={variant === 'label' ? 't-label text-ink-3' : 't-title-2 text-ink'}>
          {children}
        </Tag>
        {subtitle && <p className="t-footnote mt-1 text-ink-2">{subtitle}</p>}
      </div>
      {act && <div className="shrink-0 whitespace-nowrap">{act}</div>}
    </div>
  );
}
