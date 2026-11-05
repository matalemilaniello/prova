/**
 * Selettore della foto come `<label>` (docs/FASE2.md § 7.1). Safari su iPhone apre un `<input type="file">` solo dentro
 * un gesto dell'utente: un `click()` lanciato da un effetto viene bloccato. Il tocco sulla riga, o sul pulsante, è il
 * gesto. L'input è `accept="image/*"` senza `capture`, così su iPhone si sceglie tra fotocamera e libreria. Se l'utente
 * annulla il selettore non succede niente.
 */
import { useId, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { haptic } from '../../lib/haptics';
import { cn, renderIcon, toneColor, toneRing, toneSoft, type AnyTone, type IconLike } from '../../ui';

interface PickInputProps {
  onPick: (file: File) => void;
  id: string;
}

function PickInput({ onPick, id }: PickInputProps) {
  return (
    <input
      id={id}
      type="file"
      accept="image/*"
      className="sr-only"
      onChange={(e) => {
        const file = e.target.files?.[0];
        // Svuota il campo: la stessa foto scelta di nuovo deve far partire un altro `change`.
        e.target.value = '';
        if (!file) return;
        haptic('selection');
        onPick(file);
      }}
    />
  );
}

export interface PhotoPickRowProps {
  icon: IconLike;
  iconTone?: AnyTone;
  title: ReactNode;
  subtitle?: ReactNode;
  onPick: (file: File) => void;
}

/** Riga di lista (stesso aspetto di `ListRow`) che apre il selettore della foto. */
export function PhotoPickRow({ icon, iconTone = 'accent', title, subtitle, onPick }: PhotoPickRowProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-ink-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent"
    >
      <PickInput id={id} onPick={onPick} />
      <span
        aria-hidden
        className="grid size-[30px] shrink-0 place-items-center rounded-[9px]"
        style={{ background: toneSoft(iconTone, 18), boxShadow: toneRing(iconTone, 22), color: toneColor(iconTone) }}
      >
        {renderIcon(icon, 17, 2.2)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col py-0.5">
        <span className="t-callout font-medium text-ink">{title}</span>
        {subtitle && <span className="t-footnote mt-0.5 text-ink-2">{subtitle}</span>}
      </span>
      <ChevronRight aria-hidden size={18} strokeWidth={2.2} className="-mr-1 shrink-0 text-ink-3" />
    </label>
  );
}

const PICK_VARIANT = {
  primary: 'bg-accent text-on-accent shadow-[0_1px_0_rgb(255_255_255/0.25)_inset,0_6px_18px_-8px_var(--accent-glow)]',
  secondary: 'bg-control text-ink border border-control-line',
} as const;

export interface PhotoPickButtonProps {
  icon?: IconLike;
  variant?: keyof typeof PICK_VARIANT;
  children: ReactNode;
  onPick: (file: File) => void;
  className?: string;
}

/** Pulsante grande (stesso aspetto di `Button size="lg"`) che apre il selettore: «Scatta di nuovo». */
export function PhotoPickButton({ icon, variant = 'primary', children, onPick, className }: PhotoPickButtonProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        'relative inline-flex h-[52px] w-full cursor-pointer select-none items-center justify-center gap-2.5 whitespace-nowrap rounded-[16px] px-6 text-[1.0625rem] font-semibold tracking-[-0.005em] transition-transform duration-150 active:scale-[0.97] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
        PICK_VARIANT[variant],
        className,
      )}
    >
      <PickInput id={id} onPick={onPick} />
      {renderIcon(icon, 20, 2.2)}
      <span>{children}</span>
    </label>
  );
}
