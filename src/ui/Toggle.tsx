import { motion } from 'motion/react';
import { haptic } from '../lib/haptics';
import { cn } from './cn';
import { springSnappy } from './motion';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Etichetta accessibile (obbligatoria se non c'è un testo visibile collegato con aria-labelledby). */
  label?: string;
  'aria-labelledby'?: string;
  disabled?: boolean;
  /** Colore quando è acceso (default accent). */
  tone?: 'accent' | 'good';
  id?: string;
  className?: string;
}

/** Interruttore iOS (51×31) con pomello a molla. */
export function Toggle({ checked, onChange, label, disabled, tone = 'accent', className, id, ...rest }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={rest['aria-labelledby']}
      disabled={disabled}
      onClick={() => {
        haptic('light');
        onChange(!checked);
      }}
      className={cn(
        'hit-44 relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-200',
        // Disattivato: niente ambra trasparente (sul blu diventa oliva), pista neutra e pollice attenuato.
        disabled
          ? 'cursor-default bg-control ring-1 ring-inset ring-[var(--control-line)] [&>*]:opacity-60'
          : checked
            ? tone === 'good'
              ? 'bg-good'
              : 'bg-accent'
            : 'bg-[color-mix(in_srgb,var(--ink-3)_38%,transparent)]',
        className,
      )}
    >
      <motion.span
        aria-hidden
        className="block size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)]"
        animate={{ x: checked ? 20 : 0 }}
        transition={springSnappy}
      />
    </button>
  );
}
