import { useId, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from './cn';
import { toneColor, type AnyTone } from './tones';

export interface FloodlightsProps {
  /** Quanto sono accesi, 0-1 (es. l'avanzamento della giornata). Default 0,5. */
  intensity?: number;
  /** Tinge appena il bordo dei coni (10%) con il colore del tono, es. il tipo di giorno. Default neutro. */
  tone?: AnyTone;
  /**
   * Impulso di 900 ms a piena luce (giornata chiusa). Passa true, oppure un numero che cambia a ogni
   * evento per riaccenderlo. Spento con la riduzione del movimento.
   */
  flare?: boolean | number;
  /** Dopo il coprifuoco: le luci calano e virano verso il lilla. */
  curfew?: boolean;
  /** Righe del campo (cerchio di centrocampo e linea di metà campo). Default true. */
  pitch?: boolean;
  /** Altezza del livello in px. Default 360. */
  height?: number;
  className?: string;
  style?: CSSProperties;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/** Una batteria di 4 lampade (2 × 2), inclinata verso il centro del campo. */
function LampBank({ side, on }: { side: 'left' | 'right'; on: number }) {
  return (
    <span
      aria-hidden
      className="absolute grid grid-cols-2 gap-[2px] rounded-[3px] p-[2px]"
      style={{
        top: 'calc(var(--safe-top) + 6px)',
        [side]: 'calc(var(--safe-' + side + ') + 6px)',
        transform: `rotate(${side === 'left' ? -28 : 28}deg)`,
        background: 'rgb(150 180 240 / 0.08)',
        opacity: 0.55 + 0.45 * on,
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="block h-[3px] w-[6px] rounded-[1.5px]"
          style={{ background: 'var(--lamp)', boxShadow: `0 0 ${3 + 4 * on}px ${1 + on}px var(--lamp-halo)` }}
        />
      ))}
    </span>
  );
}

/**
 * Riflettori del campo di sera: due batterie di lampade negli angoli alti, due coni di luce bianco calda
 * che scendono verso il centro e le righe del campo appena accennate. È l'elemento firma di Ritmo: sta
 * dietro l'intestazione di ogni schermata (Screen) e dei pannelli a schermo intero.
 *
 * L'intensità segue la giornata (più voci fatte, più luce); a giornata chiusa un bagliore breve (`flare`);
 * dopo il coprifuoco la luce cala e vira al lilla (`curfew`). Nel tema chiaro le lampade sono spente e
 * restano solo una velatura calda leggerissima e le righe.
 */
export function Floodlights({ intensity = 0.5, tone, flare, curfew, pitch = true, height = 360, className, style }: FloodlightsProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const k = clamp01(intensity) * (curfew ? 0.55 : 1);
  const light = curfew ? '205 195 255' : 'var(--light-warm)';
  const coneAlpha = 0.04 + 0.08 * k;
  const haloAlpha = 0.05 + 0.09 * k;
  const edge = tone && tone !== 'neutral' ? toneColor(tone) : 'rgb(var(--light-warm))';
  const flareKey = typeof flare === 'number' ? flare : flare ? 1 : 0;
  // Centrocampo: il cerchio passa dietro il titolo, la linea di metà campo sotto l'intestazione.
  const cy = Math.round(height * 0.66);
  const radius = Math.min(120, Math.round(height * 0.33));

  const cones = (alpha: number, id: string) => (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ filter: 'blur(9px)', mixBlendMode: 'var(--cone-blend)' as CSSProperties['mixBlendMode'] }}
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: `rgb(${light})`, stopOpacity: 1 }} />
          <stop offset="0.5" style={{ stopColor: `rgb(${light})`, stopOpacity: 0.42 }} />
          <stop offset="1" style={{ stopColor: `rgb(${light})`, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <g opacity={alpha} fill={`url(#${id}-g)`}>
        <polygon points="1,-4 10,-4 72,100 34,100" />
        <polygon points="90,-4 99,-4 66,100 28,100" />
      </g>
    </svg>
  );

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-x-0 top-0 overflow-hidden', className)}
      style={{
        height,
        maskImage: 'linear-gradient(to bottom, #000 62%, transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, #000 62%, transparent)',
        ...style,
      }}
    >
      {/* Aloni delle lampade negli angoli */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(52% 34% at 4% -4%, rgb(${light} / ${haloAlpha}), transparent 72%), radial-gradient(52% 34% at 96% -4%, rgb(${light} / ${haloAlpha}), transparent 72%)`,
          mixBlendMode: 'var(--cone-blend)' as CSSProperties['mixBlendMode'],
          opacity: 'var(--cone-strength, 1)' as unknown as number,
        }}
      />

      {/* Coni di luce */}
      <div className="absolute inset-0" style={{ opacity: 'var(--cone-strength, 1)' as unknown as number }}>
        {cones(coneAlpha, `${uid}-c`)}
      </div>

      {/* Bordo dei coni: un filo del colore del tono al 10% */}
      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <g stroke={edge} strokeOpacity={0.1} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" style={{ filter: 'blur(0.4px)' }}>
          <line x1="10" y1="-4" x2="72" y2="100" vectorEffect="non-scaling-stroke" />
          <line x1="90" y1="-4" x2="28" y2="100" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>

      {/* Righe del campo: metà campo e cerchio di centrocampo, la linea sfuma verso i bordi */}
      {pitch && (
        <svg aria-hidden className="absolute inset-0 h-full w-full" fill="none" strokeWidth={1.5}>
          <defs>
            <linearGradient id={`${uid}-l`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--pitch-line)', stopOpacity: 0 }} />
              <stop offset="0.22" style={{ stopColor: 'var(--pitch-line)', stopOpacity: 1 }} />
              <stop offset="0.78" style={{ stopColor: 'var(--pitch-line)', stopOpacity: 1 }} />
              <stop offset="1" style={{ stopColor: 'var(--pitch-line)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <rect x="0" y={cy - 0.75} width="100%" height={1.5} fill={`url(#${uid}-l)`} />
          <circle cx="50%" cy={cy} r={radius} stroke="var(--pitch-line)" />
          <circle cx="50%" cy={cy} r={2.5} fill="var(--pitch-line)" />
        </svg>
      )}

      {/* Lampade */}
      <LampBank side="left" on={k} />
      <LampBank side="right" on={k} />

      {/* Bagliore di giornata chiusa */}
      {flareKey !== 0 && !reduce && (
        <motion.div
          key={flareKey}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.9, times: [0, 0.22, 1], ease: 'easeOut' }}
        >
          {cones(0.22, `${uid}-f`)}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(60% 40% at 4% -4%, rgb(${light} / 0.22), transparent 72%), radial-gradient(60% 40% at 96% -4%, rgb(${light} / 0.22), transparent 72%)`,
              mixBlendMode: 'var(--cone-blend)' as CSSProperties['mixBlendMode'],
            }}
          />
        </motion.div>
      )}
    </div>
  );
}
