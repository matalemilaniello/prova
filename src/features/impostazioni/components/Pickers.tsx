/**
 * Scelte visive condivise: zone di dolore (pillole + zona personalizzata), tema (una riga a tre voci)
 * e il marchio di Ritmo.
 */
import { useId, useState } from 'react';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import type { ThemePref } from '../../../domain/types';
import { SUGGESTED_PAIN_SITES } from '../../../data/defaults';
import { haptic } from '../../../lib/haptics';
import { Chip, Segmented, cn, springSnappy } from '../../../ui';
import { normalizeSite } from '../lib';

// ───────────────────────── Zone di dolore ─────────────────────────

export interface PainSitesPickerProps {
  value: string[];
  onChange: (sites: string[]) => void;
  className?: string;
}

export function PainSitesPicker({ value, onChange, className }: PainSitesPickerProps) {
  const [custom, setCustom] = useState('');
  const inputId = useId();
  const suggested = SUGGESTED_PAIN_SITES as readonly string[];
  const extra = value.filter((v) => !suggested.some((s) => s.toLowerCase() === v.toLowerCase()));
  const all = [...suggested, ...extra];
  const has = (site: string) => value.some((v) => v.toLowerCase() === site.toLowerCase());
  const toggle = (site: string, on: boolean) => onChange(on ? [...value, site] : value.filter((v) => v.toLowerCase() !== site.toLowerCase()));

  const add = () => {
    const site = normalizeSite(custom);
    if (!site) return;
    const existing = all.find((s) => s.toLowerCase() === site.toLowerCase());
    if (existing) {
      if (!has(existing)) toggle(existing, true);
    } else onChange([...value, site]);
    haptic('success');
    setCustom('');
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Zone da monitorare">
        {all.map((site) => (
          <Chip key={site} selected={has(site)} onChange={(on) => toggle(site, on)}>
            {site}
          </Chip>
        ))}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Aggiungi un’altra zona
        </label>
        <div className="flex h-11 min-w-0 flex-1 items-center rounded-full border border-dashed border-line-strong bg-field px-4 focus-within:border-[var(--focus)]">
          <input
            id={inputId}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Altra zona, es. Polpaccio"
            maxLength={28}
            enterKeyHint="done"
            autoCapitalize="sentences"
            className="min-w-0 flex-1 bg-transparent text-[1rem] text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <motion.button
          type="submit"
          aria-label="Aggiungi la zona"
          disabled={!normalizeSite(custom)}
          whileTap={{ scale: 0.9 }}
          transition={springSnappy}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-opacity disabled:bg-control disabled:text-ink-3"
        >
          <Plus size={20} strokeWidth={2.6} aria-hidden />
        </motion.button>
      </form>
    </div>
  );
}

// ───────────────────────── Tema ─────────────────────────

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'sistema', label: 'Sistema' },
  { value: 'scuro', label: 'Scuro' },
  { value: 'chiaro', label: 'Chiaro' },
];

/** Tema dell'app: una riga sola, senza anteprime (il tema si vede appena lo si tocca). */
export function ThemePicker({ value, onChange }: { value: ThemePref; onChange: (t: ThemePref) => void }) {
  return <Segmented aria-label="Tema" options={THEME_OPTIONS} value={value} onChange={onChange} />;
}

// ───────────────────────── Marchio ─────────────────────────

/** L'icona di Ritmo (anello di luce e "R" condensata), disegnata in linea. */
export function AppMark({ size = 64, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} aria-hidden>
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15253F" />
          <stop offset="0.55" stopColor="#0C1626" />
          <stop offset="1" stopColor="#070C16" />
        </linearGradient>
        <radialGradient id={`fl${id}`} cx="0.78" cy="0.04" r="0.75">
          <stop offset="0" stopColor="#F5C04A" stopOpacity="0.3" />
          <stop offset="0.45" stopColor="#F5C04A" stopOpacity="0.07" />
          <stop offset="1" stopColor="#F5C04A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`arc${id}`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE29A" />
          <stop offset="0.5" stopColor="#F5C04A" />
          <stop offset="1" stopColor="#E39A1C" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#bg${id})`} />
      <rect width="512" height="512" rx="116" fill={`url(#fl${id})`} />
      <circle cx="256" cy="256" r="166" fill="none" stroke="#FFFFFF" strokeOpacity="0.07" strokeWidth="30" />
      <circle
        cx="256"
        cy="256"
        r="166"
        fill="none"
        stroke={`url(#arc${id})`}
        strokeWidth="30"
        strokeLinecap="round"
        strokeDasharray="834.4 1043.0"
        transform="rotate(-90 256 256)"
      />
      <circle cx="98.1" cy="204.7" r="9" fill="#FFF6DC" />
      <path
        d="M193 154 H269 C298 154 317 173 317 203 V221 C317 245 303 261 283 267 L323 358 H274 L239 272 V358 H193 Z M239 194 V234 H265 C274 234 278 228 278 220 V207 C278 199 274 194 265 194 Z"
        fill="#F4F7FB"
        fillRule="evenodd"
      />
    </svg>
  );
}
