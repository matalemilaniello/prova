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
  /**
   * Batterie di lampade negli angoli (default true). Spegnile dove l'angolo alto ospita già un controllo
   * (es. un contatore dei passi) e restano coni, aloni e righe.
   */
  lamps?: boolean;
  className?: string;
  style?: CSSProperties;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/**
 * Una batteria di 6 lampade (3 × 2) in un telaio di circa 30 × 18 pt, inclinata verso il centro del campo e
 * tagliata appena dal bordo dello schermo, come un traliccio che continua fuori dall'inquadratura.
 * Più la giornata avanza (`on`), più le lampade sono piene e l'alone largo.
 */
function LampBank({ side, on, light }: { side: 'left' | 'right'; on: number; light: string }) {
  return (
    <span
      aria-hidden
      className="absolute"
      style={{
        top: 'calc(var(--safe-top) + 3px)',
        [side]: `calc(var(--safe-${side}) - 5px)`,
        transform: `rotate(${side === 'left' ? 18 : -18}deg)`,
        transformOrigin: side === 'left' ? 'top left' : 'top right',
      }}
    >
      {/* Alone: la luce che si apre attorno alla batteria */}
      <span
        className="absolute left-1/2 top-1/2 size-[96px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: `radial-gradient(closest-side, rgb(${light} / ${0.2 + 0.3 * on}), rgb(${light} / ${0.06 + 0.08 * on}) 55%, transparent)`,
          mixBlendMode: 'var(--cone-blend)' as CSSProperties['mixBlendMode'],
          opacity: 'var(--halo-strength, 1)' as unknown as number,
        }}
      />
      <span
        className="relative grid grid-cols-3 gap-[2px] rounded-[4px] p-[2.5px]"
        style={{ background: 'var(--lamp-housing)', boxShadow: 'inset 0 0 0 1px var(--lamp-frame)' }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="block h-[5px] w-[7px] rounded-[1.5px]"
            style={{
              background: 'var(--lamp)',
              opacity: 0.6 + 0.4 * on,
              boxShadow: `0 0 ${3 + 6 * on}px ${0.5 + 1.5 * on}px var(--lamp-halo)`,
            }}
          />
        ))}
      </span>
    </span>
  );
}

/**
 * Riflettori del campo di sera: due batterie di lampade negli angoli alti, due coni di luce bianco calda
 * che scendono verso il centro e le righe del campo appena accennate. È l'elemento firma di Ritmo: sta
 * dietro l'intestazione di ogni schermata (Screen) e dei pannelli a schermo intero.
 *
 * L'intensità segue la giornata (più voci fatte, più luce); a giornata chiusa un bagliore breve (`flare`);
 * dopo il coprifuoco la luce cala e vira al lilla (`curfew`). Nel tema chiaro è una partita di giorno: le
 * lampade restano accese ma tenui, i coni sono una velatura ambra e le righe del campo un po' più marcate.
 */
export function Floodlights({ intensity = 0.5, tone, flare, curfew, pitch = true, height = 360, lamps = true, className, style }: FloodlightsProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const k = clamp01(intensity) * (curfew ? 0.55 : 1);
  const light = curfew ? '205 195 255' : 'var(--light-warm)';
  // Coni ben visibili nei primi 200 pt: da 0,07 al mattino a 0,16 a giornata piena (nel tema scuro), più un
  // fascio centrale più stretto che dà la direzione della luce.
  const coneAlpha = 0.07 + 0.09 * k;
  const beamAlpha = 0.05 + 0.08 * k;
  const haloAlpha = 0.08 + 0.12 * k;
  const edge = tone && tone !== 'neutral' ? toneColor(tone) : 'rgb(var(--light-warm))';
  const flareKey = typeof flare === 'number' ? flare : flare ? 1 : 0;
  // Centrocampo: il cerchio passa dietro il titolo, la linea di metà campo sotto l'intestazione.
  const cy = Math.round(height * 0.66);
  const radius = Math.min(120, Math.round(height * 0.33));

  const cones = (alpha: number, beam: number, id: string) => (
    <>
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ filter: 'blur(10px)', mixBlendMode: 'var(--cone-blend)' as CSSProperties['mixBlendMode'] }}
      >
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: `rgb(${light})`, stopOpacity: 1 }} />
            <stop offset="0.45" style={{ stopColor: `rgb(${light})`, stopOpacity: 0.55 }} />
            <stop offset="1" style={{ stopColor: `rgb(${light})`, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <g opacity={alpha} fill={`url(#${id}-g)`}>
          <polygon points="0,-4 9,-4 74,100 30,100" />
          <polygon points="91,-4 100,-4 70,100 26,100" />
        </g>
      </svg>
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ filter: 'blur(5px)', mixBlendMode: 'var(--cone-blend)' as CSSProperties['mixBlendMode'] }}
      >
        <g opacity={beam} fill={`url(#${id}-g)`}>
          <polygon points="2,-2 6,-2 56,80 40,80" />
          <polygon points="94,-2 98,-2 60,80 44,80" />
        </g>
      </svg>
    </>
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
        {cones(coneAlpha, beamAlpha, `${uid}-c`)}
      </div>

      {/* Bordo dei coni: un filo del colore del tono al 10% */}
      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <g stroke={edge} strokeOpacity={0.1} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" style={{ filter: 'blur(0.4px)' }}>
          <line x1="9" y1="-4" x2="74" y2="100" vectorEffect="non-scaling-stroke" />
          <line x1="91" y1="-4" x2="26" y2="100" vectorEffect="non-scaling-stroke" />
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
      {lamps && (
        <>
          <LampBank side="left" on={k} light={light} />
          <LampBank side="right" on={k} light={light} />
        </>
      )}

      {/* Bagliore di giornata chiusa */}
      {flareKey !== 0 && !reduce && (
        <motion.div
          key={flareKey}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.9, times: [0, 0.22, 1], ease: 'easeOut' }}
        >
          {cones(0.3, 0.24, `${uid}-f`)}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(60% 40% at 4% -4%, rgb(${light} / 0.3), transparent 72%), radial-gradient(60% 40% at 96% -4%, rgb(${light} / 0.3), transparent 72%)`,
              mixBlendMode: 'var(--cone-blend)' as CSSProperties['mixBlendMode'],
            }}
          />
        </motion.div>
      )}
    </div>
  );
}
