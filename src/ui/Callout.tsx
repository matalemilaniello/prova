import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from './cn';
import { renderIcon, type IconLike } from './icon';
import { toneColor, toneEdge, toneInk, toneRing, toneSoft, type Tone } from './tones';

export interface CalloutProps {
  /** neutral: informazione · accent: consiglio · good: tutto bene · warn: attenzione · bad: fermati. */
  tone?: Tone;
  title?: ReactNode;
  /** Icona al posto di quella del tono. */
  icon?: IconLike;
  /** Azione in fondo (Button size="sm" variant="ghost"…). */
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

const ICON: Record<Tone, IconLike> = { neutral: Info, accent: Info, good: CircleCheck, warn: TriangleAlert, bad: CircleAlert };

/**
 * Riquadro di avviso o consiglio (dolore sopra soglia, anteprima senza rete, privacy…).
 * I toni caldi (accento, attenzione) non colorano il fondo: nel tema scuro stanno su una superficie blu, nel chiaro
 * su una superficie bianca (`--callout-warm-bg`), con anello e luce di bordo nel colore del tono. Il colore è nella
 * luce, nell'icona e nel titolo.
 */
export function Callout({ tone = 'neutral', title, icon, action, className, children }: CalloutProps) {
  const role = tone === 'bad' || tone === 'warn' ? 'alert' : 'note';
  const neutral = tone === 'neutral';
  const warm = tone === 'accent' || tone === 'warn';
  const ring = warm
    ? `inset 0 0 0 1px color-mix(in srgb, ${toneColor(tone)} var(--callout-warm-ring, 24%), transparent)`
    : toneRing(tone, 24);
  return (
    <div
      role={role}
      className={cn('flex gap-3 rounded-[16px] p-3.5', className)}
      style={{
        background: neutral ? 'var(--ink-soft)' : warm ? `var(--callout-warm-bg, ${toneSoft(tone, 9)})` : toneSoft(tone, 11),
        boxShadow: neutral ? 'inset 0 0 0 1px var(--control-line)' : `${toneEdge(tone, 42)}, ${ring}`,
      }}
    >
      <span className="mt-px shrink-0" style={{ color: neutral ? 'var(--ink-2)' : toneColor(tone) }} aria-hidden>
        {renderIcon(icon ?? ICON[tone], 20, 2.2)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && (
          <p className="t-callout font-semibold" style={{ color: neutral ? 'var(--ink)' : toneInk(tone) }}>
            {title}
          </p>
        )}
        {children && <div className="t-footnote text-ink-2">{children}</div>}
        {action && <div className="-mb-1 mt-1 -ml-3.5">{action}</div>}
      </div>
    </div>
  );
}
