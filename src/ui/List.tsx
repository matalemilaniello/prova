import { Children, isValidElement, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { renderIcon, type IconLike } from './icon';
import { toneColor, toneRing, toneSoft, type AnyTone } from './tones';

export interface ListGroupProps {
  /** Etichetta sopra il gruppo (maiuscoletto). */
  title?: ReactNode;
  /** Nota sotto il gruppo. */
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Gruppo di righe in stile Impostazioni di iOS, con divisori rientrati. */
export function ListGroup({ title, footer, className, children }: ListGroupProps) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      {title && <h3 className="t-label px-1 text-ink-3">{title}</h3>}
      <div className="overflow-hidden rounded-card bg-card shadow-card">
        {items.map((child, i) => (
          <div key={child.key ?? i} className={cn(i > 0 && 'relative before:absolute before:right-0 before:left-4 before:top-0 before:h-px before:bg-line')}>
            {child}
          </div>
        ))}
      </div>
      {footer && <p className="t-footnote px-1 text-ink-3">{footer}</p>}
    </section>
  );
}

export interface ListRowProps {
  icon?: IconLike;
  /** Colore del quadratino dell'icona. */
  iconTone?: AnyTone;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Valore a destra (testo secondario). */
  value?: ReactNode;
  /** Elemento a destra personalizzato (Toggle, Pill…). */
  trailing?: ReactNode;
  /** Freccia a destra (default true se onPress). */
  chevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Riga di lista: icona, titolo, sottotitolo, valore o controllo a destra. */
export function ListRow({
  icon,
  iconTone = 'accent',
  title,
  subtitle,
  value,
  trailing,
  chevron,
  onPress,
  destructive,
  disabled,
  className,
}: ListRowProps) {
  const showChevron = chevron ?? Boolean(onPress);
  const body = (
    <>
      {icon && (
        <span
          aria-hidden
          className="grid size-[30px] shrink-0 place-items-center rounded-[9px]"
          style={{ background: toneSoft(iconTone, 18), boxShadow: toneRing(iconTone, 22), color: toneColor(iconTone) }}
        >
          {renderIcon(icon, 17, 2.2)}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col py-0.5">
        <span className={cn('t-callout font-medium', destructive ? 'text-bad' : 'text-ink')}>{title}</span>
        {subtitle && <span className="t-footnote mt-0.5 text-ink-2">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="t-callout max-w-[55%] shrink-0 text-right text-ink-2 [overflow-wrap:anywhere]">{value}</span>}
      {trailing}
      {showChevron && <ChevronRight aria-hidden size={18} strokeWidth={2.2} className="-mr-1 shrink-0 text-ink-3" />}
    </>
  );
  const cls = cn('flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left', disabled && 'opacity-50', className);
  if (onPress) {
    return (
      <motion.button
        type="button"
        disabled={disabled}
        whileTap={{ backgroundColor: 'var(--ink-soft)' }}
        onClick={() => {
          haptic('selection');
          onPress();
        }}
        className={cls}
      >
        {body}
      </motion.button>
    );
  }
  return <div className={cls}>{body}</div>;
}
