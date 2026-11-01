/**
 * Scelte visive condivise: zone di dolore (pillole + zona personalizzata), tema (anteprime in miniatura)
 * e il marchio di Ritmo.
 */
import { useId, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Plus } from 'lucide-react';
import type { ThemePref } from '../../../domain/types';
import { SUGGESTED_PAIN_SITES } from '../../../data/defaults';
import { haptic } from '../../../lib/haptics';
import { Chip, cn, springSnappy } from '../../../ui';
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

const THEME_OPTIONS: { value: ThemePref; label: string; hint: string }[] = [
  { value: 'sistema', label: 'Sistema', hint: 'Come l’iPhone' },
  { value: 'scuro', label: 'Scuro', hint: 'Campo di sera' },
  { value: 'chiaro', label: 'Chiaro', hint: 'Giorno di partita' },
];

/** Colori delle anteprime: ritraggono ciascun tema a prescindere da quello attivo. */
const MOCK = {
  scuro: { bg: '#0A1220', card: '#142036', line: '#22324D', ink: '#EEF2F8', ink3: '#6E7E99', accent: '#F5C04A', palestra: '#6EA8FE' },
  chiaro: { bg: '#F3F5F9', card: '#FFFFFF', line: '#DCE2EC', ink: '#0D1A2C', ink3: '#7D8BA3', accent: '#E3A21F', palestra: '#2F6FE0' },
};

function MiniScreen({ theme }: { theme: 'scuro' | 'chiaro' }) {
  const c = MOCK[theme];
  return (
    <svg viewBox="0 0 90 120" className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width="90" height="120" fill={c.bg} />
      <rect x="10" y="12" width="26" height="6" rx="3" fill={c.ink} opacity="0.9" />
      <rect x="10" y="22" width="16" height="3" rx="1.5" fill={c.ink3} />
      <rect x="8" y="32" width="74" height="34" rx="8" fill={c.card} stroke={theme === 'chiaro' ? c.line : 'none'} strokeWidth="0.75" />
      <circle cx="26" cy="49" r="10" fill="none" stroke={c.line} strokeWidth="3.5" />
      <circle cx="26" cy="49" r="10" fill="none" stroke={c.accent} strokeWidth="3.5" strokeLinecap="round" strokeDasharray="44 63" transform="rotate(-90 26 49)" />
      <rect x="42" y="43" width="32" height="4" rx="2" fill={c.ink} opacity="0.85" />
      <rect x="42" y="51" width="22" height="3" rx="1.5" fill={c.ink3} />
      <rect x="8" y="72" width="74" height="18" rx="6" fill={c.card} stroke={theme === 'chiaro' ? c.line : 'none'} strokeWidth="0.75" />
      <rect x="14" y="79" width="4" height="4" rx="2" fill={c.palestra} />
      <rect x="22" y="79" width="34" height="4" rx="2" fill={c.ink} opacity="0.7" />
      <rect x="8" y="94" width="74" height="18" rx="6" fill={c.card} stroke={theme === 'chiaro' ? c.line : 'none'} strokeWidth="0.75" />
      <rect x="14" y="101" width="4" height="4" rx="2" fill={c.accent} />
      <rect x="22" y="101" width="28" height="4" rx="2" fill={c.ink} opacity="0.7" />
    </svg>
  );
}

export function ThemePicker({ value, onChange }: { value: ThemePref; onChange: (t: ThemePref) => void }) {
  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-3">
      {THEME_OPTIONS.map((o) => {
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
            className="flex flex-col items-center gap-2 rounded-[18px] p-1"
          >
            <span
              className={cn(
                'relative block aspect-[3/4] w-full overflow-hidden rounded-[14px] transition-shadow duration-200',
                on ? 'shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--accent)]' : 'shadow-[0_0_0_1px_var(--line)]',
              )}
            >
              {o.value === 'sistema' ? (
                <>
                  <MiniScreen theme="chiaro" />
                  <span className="absolute inset-0" style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}>
                    <MiniScreen theme="scuro" />
                  </span>
                </>
              ) : (
                <MiniScreen theme={o.value} />
              )}
            </span>
            <span className="flex flex-col items-center gap-0.5">
              <span className="t-footnote font-semibold text-ink">{o.label}</span>
              <span className="text-[0.6875rem] leading-tight text-ink-3">{o.hint}</span>
            </span>
            <span
              aria-hidden
              className={cn('mt-auto grid size-[22px] place-items-center rounded-full transition-colors duration-200', on ? 'bg-accent text-on-accent' : 'shadow-[inset_0_0_0_1.5px_var(--line-strong)]')}
            >
              {on && <Check size={14} strokeWidth={3.2} />}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
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
