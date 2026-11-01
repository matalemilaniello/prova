/**
 * Controlli in stile Impostazioni di iOS, condivisi da Impostazioni e Benvenuto:
 * orario a pillola, stepper compatto, righe di modulo con campo in linea, scelte a schede, conferma nella pagina.
 */
import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Minus, Plus } from 'lucide-react';
import type { HHMM } from '../../../domain/types';
import { fmtNumber } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { cn, parseItalianNumber, renderIcon, springSnappy, toneColor, toneInk, toneOn, toneRing, toneSoft, type AnyTone, type IconLike } from '../../../ui';

/**
 * Tessera dell'icona, come nelle righe delle liste: fondo tenue, anello di 1 px e icona nel colore del tono.
 * Nel tema scuro i toni caldi restano blu e la luce sta nell'anello e nell'icona.
 */
export function tileStyle(tone: AnyTone): { background: string; boxShadow: string; color: string } {
  return { background: toneSoft(tone, 18), boxShadow: toneRing(tone, 22), color: toneColor(tone) };
}

// ───────────────────────── Orario a pillola ─────────────────────────

export interface TimePillProps {
  value: HHMM;
  onChange: (v: HHMM) => void;
  /** Etichetta per i lettori di schermo. */
  label: string;
  tone?: AnyTone;
  disabled?: boolean;
  className?: string;
}

/**
 * Orario 'HH:MM' come pillola tappabile (come nelle Impostazioni di iOS): il campo nativo resta sopra,
 * invisibile, e apre la rotella del sistema. Sempre a 24 ore.
 */
export function TimePill({ value, onChange, label, tone, disabled, className }: TimePillProps) {
  return (
    <span
      className={cn(
        'relative inline-flex h-9 shrink-0 items-center rounded-[10px] px-3 transition-shadow duration-150',
        'focus-within:shadow-[0_0_0_2px_var(--focus)]',
        tone ? '' : 'bg-control text-ink',
        disabled && 'opacity-40',
        className,
      )}
      style={tone ? { background: toneSoft(tone, 16), boxShadow: toneRing(tone, 22), color: toneInk(tone) } : undefined}
    >
      <span aria-hidden className="t-num text-[1.25rem] leading-none">
        {value || '--:--'}
      </span>
      <input
        type="time"
        value={value}
        aria-label={label}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value) {
            haptic('selection');
            onChange(e.target.value);
          }
        }}
        onClick={(e) => {
          try {
            (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
          } catch {
            /* il browser apre il selettore da solo */
          }
        }}
        className="absolute inset-0 h-full min-h-0 w-full cursor-pointer opacity-0 disabled:cursor-default"
      />
    </span>
  );
}

// ───────────────────────── Stepper compatto ─────────────────────────

export interface MiniStepperProps {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  format?: (n: number) => string;
  disabled?: boolean;
}

/** − valore + in una riga di lista. Frecce da tastiera. */
export function MiniStepper({ value, onChange, label, min = 0, max = 9999, step = 1, unit, format, disabled }: MiniStepperProps) {
  const dec = (String(step).split('.')[1] ?? '').length;
  const fmt = format ?? ((n: number) => fmtNumber(n, dec, dec > 0));
  const set = (n: number) => {
    const v = Math.min(max, Math.max(min, Number((Math.round(n / step) * step).toFixed(dec))));
    if (v !== value) {
      haptic('selection');
      onChange(v);
    }
  };
  const btn = (dir: 1 | -1) => {
    const off = disabled || (dir < 0 ? value <= min : value >= max);
    return (
      <motion.button
        type="button"
        aria-label={`${dir < 0 ? 'Diminuisci' : 'Aumenta'} ${label}`}
        disabled={off}
        whileTap={off ? undefined : { scale: 0.88 }}
        transition={springSnappy}
        onClick={() => set(value + dir * step)}
        className="hit-44 grid size-8 place-items-center rounded-full bg-control text-ink disabled:opacity-30"
      >
        {dir < 0 ? <Minus size={16} strokeWidth={2.6} aria-hidden /> : <Plus size={16} strokeWidth={2.6} aria-hidden />}
      </motion.button>
    );
  };
  return (
    <div
      className="flex shrink-0 items-center gap-2"
      role="spinbutton"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${fmt(value)}${unit ? ` ${unit}` : ''}`}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') (e.preventDefault(), set(value + step));
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') (e.preventDefault(), set(value - step));
      }}
    >
      {btn(-1)}
      <span className="flex min-w-[4.5rem] items-baseline justify-center gap-1">
        <span className="t-num text-[1.375rem] text-ink">{fmt(value)}</span>
        {unit && <span className="t-unit text-ink-3">{unit}</span>}
      </span>
      {btn(1)}
    </div>
  );
}

// ───────────────────────── Righe di modulo ─────────────────────────

export interface FormRowProps {
  label: ReactNode;
  icon?: IconLike;
  iconTone?: AnyTone;
  /** Testo sotto l'etichetta. */
  hint?: ReactNode;
  /** Errore: sostituisce l'aiuto, in rosso. */
  error?: string;
  /** id del campo, per collegare l'etichetta. */
  htmlFor?: string;
  /** Controllo a destra. */
  children?: ReactNode;
  className?: string;
}

/** Riga di un gruppo: etichetta a sinistra, controllo a destra (orario, numero, interruttore…). */
export function FormRow({ label, icon, iconTone = 'accent', hint, error, htmlFor, children, className }: FormRowProps) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div className={cn('flex min-h-[56px] items-center gap-3 px-4 py-2.5', className)}>
      {icon && (
        <span
          aria-hidden
          className="grid size-[30px] shrink-0 place-items-center rounded-[9px]"
          style={tileStyle(iconTone)}
        >
          {renderIcon(icon, 17, 2.2)}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <Label htmlFor={htmlFor} className="t-callout font-medium text-ink">
          {label}
        </Label>
        <AnimatePresence initial={false} mode="wait">
          {(error || hint) && (
            <motion.span
              key={error ? 'e' : 'h'}
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              role={error ? 'alert' : undefined}
              className={cn('t-footnote mt-0.5', error ? 'text-bad-ink' : 'text-ink-3')}
            >
              {error ?? hint}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {children}
    </div>
  );
}

export interface InlineNumberProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type' | 'min' | 'max' | 'size'> {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  decimals?: number;
  unit?: string;
  invalid?: boolean;
  /** Larghezza del campo in caratteri (default 5). */
  chars?: number;
}

const toText = (v: number | undefined, decimals: number) => (v === undefined || !Number.isFinite(v) || v === 0 ? '' : fmtNumber(v, decimals).replace(/\./g, ''));

/** Numero allineato a destra, senza bordo, per le righe di un gruppo. Accetta la virgola. */
export const InlineNumber = forwardRef<HTMLInputElement, InlineNumberProps>(function InlineNumber(
  { value, onChange, decimals = 0, unit, invalid, chars = 5, className, onBlur, onFocus, ...rest },
  ref,
) {
  const [text, setText] = useState(() => toText(value, decimals));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(toText(value, decimals));
  }, [value, decimals, focused]);
  return (
    <span
      className={cn(
        'flex h-10 shrink-0 items-baseline justify-end gap-1 rounded-[10px] px-2.5 pt-[7px] transition-[background-color,box-shadow] duration-150',
        focused ? 'bg-field shadow-[0_0_0_2px_var(--focus)]' : invalid ? 'bg-bad-soft' : 'bg-transparent',
        className,
      )}
    >
      <input
        ref={ref}
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        enterKeyHint="next"
        value={text}
        aria-invalid={invalid || undefined}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d,.]/g, '');
          setText(raw);
          onChange(parseItalianNumber(raw));
        }}
        onBlur={(e) => {
          setFocused(false);
          let n = parseItalianNumber(text);
          if (n !== undefined) {
            const f = 10 ** decimals;
            n = Math.round(n * f) / f;
          }
          onChange(n);
          setText(toText(n, decimals));
          onBlur?.(e);
        }}
        style={{ width: `${chars + 0.5}ch` }}
        className={cn(
          't-num bg-transparent text-right text-[1.375rem] leading-none tracking-normal text-ink outline-none placeholder:font-sans placeholder:text-[0.9375rem] placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-3',
          invalid && !focused && 'text-bad-ink',
        )}
        {...rest}
      />
      {unit && <span className="t-unit text-[0.8125rem] text-ink-3">{unit}</span>}
    </span>
  );
});

// ───────────────────────── Scelte a schede ─────────────────────────

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  text?: ReactNode;
  icon?: IconLike;
  tone?: AnyTone;
}

export interface ChoiceCardsProps<T extends string> {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
  'aria-label': string;
  columns?: 1 | 2 | 4;
  /** Superficie delle schede non scelte (in un foglio grigio servono card bianche). */
  surface?: 'card' | 'control';
  className?: string;
}

/** Gruppo di schede a scelta singola (radio), con frecce da tastiera. */
export function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  columns = 2,
  surface = 'card',
  className,
}: ChoiceCardsProps<T>) {
  const group = useId();
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    haptic('selection');
    onChange(next.value);
    requestAnimationFrame(() => document.getElementById(`${group}-${next.value}`)?.focus());
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('grid gap-2.5', columns === 1 ? 'grid-cols-1' : columns === 4 ? 'grid-cols-4' : 'grid-cols-2', className)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') (e.preventDefault(), move(1));
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') (e.preventDefault(), move(-1));
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        const tone = o.tone ?? 'accent';
        // Su più colonne il segno di spunta va nell'angolo in basso: a 360 px "Ricomposizione" occupa tutta la riga.
        const corner = columns !== 1;
        const mark = (
          <span
            aria-hidden
            className={cn(
              'grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-200',
              !on && 'shadow-[inset_0_0_0_1.5px_var(--line-strong)]',
              corner && 'absolute bottom-3 right-3',
            )}
            style={on ? { background: toneColor(tone), color: toneOn(tone) } : undefined}
          >
            {on && <Check size={13} strokeWidth={3.2} />}
          </span>
        );
        return (
          <motion.button
            key={o.value}
            id={`${group}-${o.value}`}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            whileTap={{ scale: 0.97 }}
            transition={springSnappy}
            onClick={() => {
              if (!on) haptic('selection');
              onChange(o.value);
            }}
            className={cn(
              'relative flex min-h-[44px] flex-col items-start gap-1 rounded-[16px] p-3.5 text-left transition-[background-color,box-shadow] duration-200',
              !on && (surface === 'card' ? 'bg-card shadow-card' : 'bg-control'),
            )}
            style={on ? { background: toneSoft(tone, 13), boxShadow: `inset 0 0 0 1.5px ${toneColor(tone)}` } : undefined}
          >
            <span className="flex w-full items-center gap-2">
              {o.icon && (
                <span aria-hidden style={{ color: on ? toneInk(tone) : 'var(--ink-2)' }}>
                  {renderIcon(o.icon, 18, 2.2)}
                </span>
              )}
              <span className={cn('t-callout min-w-0 flex-1 font-semibold text-ink', corner && !o.text && 'pr-6')}>{o.label}</span>
              {!corner && mark}
            </span>
            {o.text && <span className={cn('t-footnote text-ink-2', corner && 'pr-6')}>{o.text}</span>}
            {corner && mark}
          </motion.button>
        );
      })}
    </div>
  );
}

// ───────────────────────── Conferma nella pagina ─────────────────────────

export interface InlineRevealProps {
  open: boolean;
  children: ReactNode;
  className?: string;
}

/** Contenuto che si apre e si chiude in altezza (per conferme e campi aggiuntivi). */
export function InlineReveal({ open, children, className }: InlineRevealProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          className={cn('overflow-hidden', className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Titolo di sezione dentro una pagina (stesso stile di ListGroup). */
export function GroupLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="t-label px-1 text-ink-3">
      {children}
    </h3>
  );
}

// ───────────────────────── Testo in linea ─────────────────────────

export interface InlineTextProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
}

/** Testo allineato a destra in una riga di gruppo (es. il nome). */
export const InlineText = forwardRef<HTMLInputElement, InlineTextProps>(function InlineText({ value, onChange, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-10 min-w-0 max-w-[60%] flex-1 rounded-[10px] bg-transparent px-2.5 text-right text-[1rem] text-ink outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-ink-3 focus:bg-field focus:shadow-[0_0_0_2px_var(--focus)]',
        className,
      )}
      {...rest}
    />
  );
});

// ───────────────────────── Riga a scelta multipla ─────────────────────────

export interface SelectRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  icon?: IconLike;
  tone?: AnyTone;
  disabled?: boolean;
}

/** Riga con casella di scelta (incluso / escluso), senza barrare il testo come nella spesa. */
export function SelectRow({ checked, onChange, title, subtitle, meta, icon, tone = 'accent', disabled }: SelectRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        haptic('selection');
        onChange(!checked);
      }}
      className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-ink-soft disabled:opacity-45"
    >
      {icon && (
        <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-[9px]" style={tileStyle(tone)}>
          {renderIcon(icon, 17, 2.2)}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-callout font-medium text-ink">{title}</span>
        {subtitle && <span className="t-footnote mt-0.5 text-ink-2">{subtitle}</span>}
      </span>
      {meta !== undefined && <span className="t-caption shrink-0 tabular text-ink-3">{meta}</span>}
      <motion.span
        aria-hidden
        className="grid size-[24px] shrink-0 place-items-center rounded-full"
        initial={false}
        animate={{
          backgroundColor: checked ? 'var(--accent)' : 'rgba(0,0,0,0)',
          boxShadow: checked ? 'inset 0 0 0 1.5px var(--accent)' : 'inset 0 0 0 1.5px var(--line-strong)',
        }}
        transition={springSnappy}
      >
        <motion.span initial={false} animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.4 }} transition={springSnappy} className="text-on-accent">
          <Check size={14} strokeWidth={3.4} />
        </motion.span>
      </motion.span>
    </button>
  );
}

// ───────────────────────── Scelta compatta ─────────────────────────

export interface CompactChoiceProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  'aria-label': string;
}

/** Scelta singola a tasselli uguali: per etichette che in un controllo segmentato verrebbero tagliate. */
export function CompactChoice<T extends string>({ options, value, onChange, 'aria-label': ariaLabel }: CompactChoiceProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <motion.button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            whileTap={{ scale: 0.95 }}
            transition={springSnappy}
            onClick={() => {
              if (!on) haptic('selection');
              onChange(o.value);
            }}
            className={cn(
              'h-11 truncate rounded-[12px] px-1 text-[0.875rem] font-semibold transition-[background-color,box-shadow,color] duration-200',
              on ? 'bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'bg-card text-ink-2 shadow-card',
            )}
          >
            {o.label}
          </motion.button>
        );
      })}
    </div>
  );
}
