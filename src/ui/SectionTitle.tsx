import type { ReactNode } from 'react';
import { cn } from './cn';

export interface SectionTitleProps {
  children: ReactNode;
  /** Azione a destra: un nodo, oppure { label, onPress } per un link testuale. */
  action?: ReactNode | { label: string; onPress: () => void };
  /** Testo secondario sotto il titolo. */
  subtitle?: ReactNode;
  /** 'label' (etichetta da tabellone in Barlow Condensed maiuscolo, default) o 'title' (titolo di sezione). */
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
  // Griglia: titolo e azione sulla stessa linea di base, il sottotitolo sotto su tutta la larghezza.
  // Così l'azione resta sempre accanto al titolo, anche con un sottotitolo su più righe.
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 px-1', className)}>
      <Tag id={id} className={cn('min-w-0', variant === 'label' ? 't-label text-ink-3' : 't-title-2 text-ink')}>
        {children}
      </Tag>
      {act ? <div className="shrink-0 justify-self-end whitespace-nowrap">{act}</div> : <span aria-hidden />}
      {subtitle && <p className="t-footnote col-span-2 mt-1 text-ink-2">{subtitle}</p>}
    </div>
  );
}
