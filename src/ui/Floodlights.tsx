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

/*
 * Geometria della torre faro nell'angolo sinistro (quella destra è speculare), in pt dal bordo alto e sinistro
 * della safe area. La testa (26 × 16 pt) è inclinata di 20° verso il centro del campo e tagliata appena dal
 * bordo; il traliccio scende verso l'esterno e sfuma, come una torre che continua fuori dall'inquadratura.
 * Lo spigolo basso della testa resta sopra la riga dell'occhiello (24 pt) e il traliccio nel margine laterale.
 */
const HEAD = { cx: 14, cy: 9, w: 26, h: 16, tilt: 20 } as const;
const LAMP_COLS = 4;
const LAMP_ROWS = 2;
const LAMP_R = 1.9;
/** Lunghezza visibile del traliccio prima che sfumi del tutto. */
const MAST_LEN = 40;

/**
 * Una torre faro: testa in acciaio con 8 lampade tonde (4 × 2), visiera in alto, staffa e traliccio a
 * rombi che entra dall'angolo. Più la giornata avanza (`on`), più le lampade sono piene e l'alone largo.
 * Nel tema chiaro il telaio è grigio acciaio scuro e le lampade bianche con un alone ambra sottile; nel
 * tema scuro il telaio quasi sparisce nella notte e restano le lampade accese.
 */
function LampBank({ side, on, light, uid }: { side: 'left' | 'right'; on: number; light: string; uid: string }) {
  const id = `${uid}-${side}`;
  const { w, h } = HEAD;
  const pitchX = (w - 4) / LAMP_COLS;
  const pitchY = (h - 4.5) / LAMP_ROWS;
  const lamps: { x: number; y: number }[] = [];
  for (let r = 0; r < LAMP_ROWS; r++) {
    for (let c = 0; c < LAMP_COLS; c++) {
      lamps.push({ x: -w / 2 + 2 + pitchX * (c + 0.5), y: -h / 2 + 3 + pitchY * (r + 0.5) });
    }
  }
  // Traliccio: due montanti e i diagonali a zigzag, dalla staffa fin dove sfuma.
  const mastTop = h / 2 + 1.5;
  const mastW = 2.6;
  const zig: string[] = [];
  for (let y = mastTop, i = 0; y <= mastTop + MAST_LEN; y += 4.4, i++) zig.push(`${i % 2 ? mastW : -mastW},${y.toFixed(1)}`);
  const haloSize = 96;
  return (
    <span
      aria-hidden
      className="absolute"
      style={{
        top: 'var(--safe-top)',
        [side]: `var(--safe-${side})`,
        width: 48,
        height: 64,
        transform: side === 'right' ? 'scaleX(-1)' : undefined,
      }}
    >
      {/* Alone: la luce che si apre attorno alla testa */}
      <span
        className="absolute rounded-full"
        style={{
          left: HEAD.cx - haloSize / 2,
          top: HEAD.cy - haloSize / 2,
          width: haloSize,
          height: haloSize,
          background: `radial-gradient(closest-side, rgb(${light} / ${0.2 + 0.3 * on}), rgb(${light} / ${0.06 + 0.08 * on}) 55%, transparent)`,
          mixBlendMode: 'var(--cone-blend)' as CSSProperties['mixBlendMode'],
          opacity: 'var(--halo-strength, 1)' as unknown as number,
        }}
      />
      <svg aria-hidden width={48} height={64} viewBox="0 0 48 64" overflow="visible" className="absolute inset-0">
        <defs>
          <linearGradient id={`${id}-mast`} gradientUnits="userSpaceOnUse" x1="0" y1={mastTop} x2="0" y2={mastTop + MAST_LEN}>
            <stop offset="0" style={{ stopColor: 'var(--lamp-mast)', stopOpacity: 1 }} />
            <stop offset="0.55" style={{ stopColor: 'var(--lamp-mast)', stopOpacity: 0.6 }} />
            <stop offset="1" style={{ stopColor: 'var(--lamp-mast)', stopOpacity: 0 }} />
          </linearGradient>
          <filter id={`${id}-bloom`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={0.9 + 0.9 * on} />
          </filter>
        </defs>
        <g transform={`translate(${HEAD.cx} ${HEAD.cy}) rotate(${HEAD.tilt})`}>
          {/* Traliccio */}
          <g style={{ stroke: `url(#${id}-mast)` }} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1={-mastW} y1={mastTop} x2={-mastW} y2={mastTop + MAST_LEN} strokeWidth={1.1} />
            <line x1={mastW} y1={mastTop} x2={mastW} y2={mastTop + MAST_LEN} strokeWidth={1.1} />
            <polyline points={zig.join(' ')} strokeWidth={0.7} />
          </g>
          {/* Staffa sotto la testa */}
          <path d={`M ${-w / 2 + 6} ${h / 2} L ${w / 2 - 6} ${h / 2} L ${mastW + 0.6} ${mastTop + 1.2} L ${-mastW - 0.6} ${mastTop + 1.2} Z`} style={{ fill: 'var(--lamp-frame)' }} />
          {/* Testa: telaio in acciaio e visiera */}
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2.2} style={{ fill: 'var(--lamp-housing)', stroke: 'var(--lamp-frame)' }} strokeWidth={1} />
          <rect x={-w / 2 - 1} y={-h / 2 - 1.6} width={w + 2} height={2.2} rx={1.1} style={{ fill: 'var(--lamp-frame)' }} />
          {/* Lampade: un alone sfocato e il nucleo acceso */}
          <g filter={`url(#${id}-bloom)`} style={{ fill: 'var(--lamp-halo)' }} opacity={0.55 + 0.45 * on}>
            {lamps.map((l, i) => (
              <circle key={i} cx={l.x} cy={l.y} r={LAMP_R + 0.9 + 0.5 * on} />
            ))}
          </g>
          <g style={{ fill: 'var(--lamp)', stroke: 'var(--lamp-rim)' }} strokeWidth={0.5} opacity={0.78 + 0.22 * on}>
            {lamps.map((l, i) => (
              <circle key={i} cx={l.x} cy={l.y} r={LAMP_R} />
            ))}
          </g>
        </g>
      </svg>
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
          <LampBank side="left" on={k} light={light} uid={uid} />
          <LampBank side="right" on={k} light={light} uid={uid} />
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
