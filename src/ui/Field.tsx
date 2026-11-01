import {
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown, Clock } from 'lucide-react';
import type { HHMM } from '../domain/types';
import { fmtNumber } from '../lib/format';
import { cn } from './cn';

// ───────────────────────── Field ─────────────────────────

export interface FieldProps {
  label: ReactNode;
  /** Testo d'aiuto sotto il campo. */
  hint?: ReactNode;
  /** Errore: sostituisce l'aiuto, colora il bordo e viene annunciato. */
  error?: string;
  /** Mostra "facoltativo" accanto all'etichetta. */
  optional?: boolean;
  className?: string;
  /** Un solo campo (TextInput, NumberInput, TimeInput, Select, TextArea…): riceve id e aria. */
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; invalid?: boolean }>;
}

/** Etichetta + campo + aiuto o errore, collegati per i lettori di schermo. */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const child = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        'aria-describedby': hint || error ? hintId : undefined,
        'aria-invalid': error ? true : undefined,
        invalid: Boolean(error) || children.props.invalid,
      })
    : children;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={children.props.id ?? id} className="t-footnote flex items-baseline gap-1.5 px-1 font-semibold text-ink-2">
        {label}
        {optional && <span className="font-normal text-ink-3">facoltativo</span>}
      </label>
      {child}
      {(error || hint) && (
        <p id={hintId} role={error ? 'alert' : undefined} className={cn('t-footnote px-1', error ? 'text-bad-ink' : 'text-ink-3')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

const BOX =
  'flex min-h-12 w-full items-center gap-2 rounded-control border bg-field px-3.5 transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--focus)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus)_22%,transparent)]';
const INPUT = 'min-w-0 flex-1 bg-transparent py-3 text-[1rem] text-ink outline-none placeholder:text-ink-3 disabled:opacity-50';

// ───────────────────────── TextInput ─────────────────────────

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  invalid?: boolean;
}

/** Campo di testo (16 px: niente zoom su iOS). */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { value, onChange, leading, trailing, invalid, className, ...rest },
  ref,
) {
  return (
    <div className={cn(BOX, invalid ? 'border-bad' : 'border-line', className)}>
      {leading && <span className="shrink-0 text-ink-3">{leading}</span>}
      <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} {...rest} />
      {trailing && <span className="shrink-0 text-ink-3">{trailing}</span>}
    </div>
  );
});

// ───────────────────────── NumberInput ─────────────────────────

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type' | 'min' | 'max'> {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  /** Cifre decimali ammesse (default 0). */
  decimals?: number;
  min?: number;
  max?: number;
  /** Unità a destra, es. "kg". */
  unit?: string;
  invalid?: boolean;
}

/** Interpreta un numero scritto all'italiana ("70,2") o con il punto. */
export function parseItalianNumber(s: string): number | undefined {
  const t = s.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!t || t === '-' || t === '.') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

const toText = (v: number | undefined, decimals: number) => (v === undefined || !Number.isFinite(v) ? '' : fmtNumber(v, decimals).replace(/\./g, ''));

/** Campo numerico con tastiera decimale e virgola italiana. Valida su min/max all'uscita. */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, decimals = 0, min, max, unit, invalid, className, onBlur, placeholder, ...rest },
  ref,
) {
  const [text, setText] = useState(() => toText(value, decimals));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(toText(value, decimals));
  }, [value, decimals, focused]);

  return (
    <div className={cn(BOX, invalid ? 'border-bad' : 'border-line', className)}>
      <input
        ref={ref}
        type="text"
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        enterKeyHint="done"
        value={text}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d,.-]/g, '');
          setText(raw);
          onChange(parseItalianNumber(raw));
        }}
        onBlur={(e) => {
          setFocused(false);
          let n = parseItalianNumber(text);
          if (n !== undefined) {
            if (min !== undefined) n = Math.max(min, n);
            if (max !== undefined) n = Math.min(max, n);
            const f = 10 ** decimals;
            n = Math.round(n * f) / f;
          }
          onChange(n);
          setText(toText(n, decimals));
          onBlur?.(e);
        }}
        className={cn(INPUT, 't-num text-[1.25rem] tracking-normal')}
        {...rest}
      />
      {unit && <span className="t-unit shrink-0 text-[0.875rem] text-ink-3">{unit}</span>}
    </div>
  );
});

// ───────────────────────── TimeInput ─────────────────────────

export interface TimeInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: HHMM;
  onChange: (value: HHMM) => void;
  invalid?: boolean;
}

/**
 * Orario 'HH:MM' con il selettore a rotelle di iOS. Il valore si mostra sempre a 24 ore
 * (il campo nativo resta sopra, invisibile, e riceve tocco e tastiera).
 */
export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(function TimeInput(
  { value, onChange, invalid, className, disabled, ...rest },
  ref,
) {
  return (
    <div className={cn(BOX, 'relative', invalid ? 'border-bad' : 'border-line', disabled && 'opacity-50', className)}>
      <Clock aria-hidden size={18} className="shrink-0 text-ink-3" />
      <span aria-hidden className="t-num min-w-0 flex-1 py-3 text-[1.25rem] tracking-normal text-ink">
        {value || '--:--'}
      </span>
      <input
        ref={ref}
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        {...rest}
      />
    </div>
  );
});

// ───────────────────────── Select ─────────────────────────

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  invalid?: boolean;
}

/** Menu a tendina nativo (su iPhone apre la rotella di sistema). */
export function Select<T extends string>({ value, onChange, options, invalid, className, ...rest }: SelectProps<T>) {
  return (
    <div className={cn(BOX, 'relative pr-10', invalid ? 'border-bad' : 'border-line', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(INPUT, 'cursor-pointer appearance-none')}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden size={18} className="pointer-events-none absolute right-3.5 text-ink-3" />
    </div>
  );
}

// ───────────────────────── TextArea ─────────────────────────

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { value, onChange, invalid, className, rows = 3, ...rest },
  ref,
) {
  return (
    <div className={cn(BOX, 'items-stretch', invalid ? 'border-bad' : 'border-line', className)}>
      <textarea ref={ref} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={cn(INPUT, 'resize-none leading-snug')} {...rest} />
    </div>
  );
});
