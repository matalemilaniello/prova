import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Apple, ChevronDown, Drumstick, Flame, Wheat } from 'lucide-react';
import type { MacroTarget } from '../../../domain/types';
import type { DayNutritionDetail } from '../../../engine/nutrition';
import { fmtNumber } from '../../../lib/format';
import { haptic } from '../../../lib/haptics';
import { Card, cn, spring, toneColor, toneInk, toneRing, toneSoft, type AnyTone } from '../../../ui';
import { BOARD_LABEL } from '../kinds';

/** Porzioni di frutta e verdura al giorno. */
export const VEG_TARGET = 5;

interface Row {
  key: string;
  label: string;
  /** Unità accanto al numero dell'anello ('' per le porzioni). */
  short: string;
  unit: string;
  /** Genere dell'unità per le frasi dei lettori di schermo (le kcal e le porzioni sono femminili). */
  fem: boolean;
  planned: number;
  eaten: number;
  target: number;
  tone: AnyTone;
  icon: typeof Flame;
  decimals?: number;
}

const round = (n: number, dec: number) => (dec ? Math.round(n * 2) / 2 : Math.round(n));

/**
 * Anello piccolo di un valore, coerente con il numero sotto: l'arco è il già mangiato rispetto all'obiettivo del
 * giorno. Prima del primo pasto segnato l'anello è tratteggiato nel colore del valore: il menù c'è, si deve ancora
 * mangiare (non un anello vuoto, che sembrerebbe un errore).
 */
function MiniRing({ value, dashed, tone, icon: Icon }: { value: number; dashed: boolean; tone: AnyTone; icon: typeof Flame }) {
  const reduce = useReducedMotion();
  const size = 46;
  const stroke = 4.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  // 16 trattini uguali, senza un pezzo spezzato dove il cerchio si chiude.
  const seg = c / 16;
  const tr = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 140, damping: 24 };
  return (
    <span aria-hidden className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        {dashed ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={toneColor(tone)} strokeWidth={2} strokeDasharray={`${seg * 0.42} ${seg * 0.58}`} />
        ) : (
          <>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={toneColor(tone)}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              initial={reduce ? false : { strokeDashoffset: c }}
              animate={{ strokeDashoffset: c * (1 - v), opacity: v > 0 ? 1 : 0 }}
              transition={tr}
            />
          </>
        )}
      </svg>
      <Icon size={17} strokeWidth={2.2} className="relative" style={{ color: toneInk(tone) }} />
    </span>
  );
}

/**
 * Barra di un valore (dettaglio aperto): la parte prevista dal menù è una capsula vuota con il bordo di 1 px
 * nel colore del valore (l'ambra è luce, non riempimento); la parte già mangiata è piena. La tacca è l'obiettivo.
 */
function Bar({ planned, eaten, target, tone }: { planned: number; eaten: number; target: number; tone: AnyTone }) {
  const reduce = useReducedMotion();
  const scale = Math.max(target, planned, 1);
  const p = Math.min(1, planned / scale);
  const e = Math.min(1, eaten / scale);
  const t = target / scale;
  const tr = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 160, damping: 26 };
  return (
    <div aria-hidden className="relative mt-2 h-2 rounded-full bg-ink-soft">
      <motion.span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: toneSoft(tone, 16), boxShadow: toneRing(tone, 75) }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${p * 100}%` }}
        transition={tr}
      />
      <motion.span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: toneColor(tone) }}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${e * 100}%` }}
        transition={tr}
      />
      {t < 0.995 && <span className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink-2" style={{ left: `calc(${t * 100}% - 1px)` }} />}
    </div>
  );
}

export interface DayValuesProps {
  planned: DayNutritionDetail;
  eaten: DayNutritionDetail;
  target: MacroTarget;
  minimal: boolean;
}

/**
 * Valori del giorno stimati dal menù, chiusi di base in una riga di quattro anelli (energia, proteine, fibre,
 * frutta e verdura). Un solo riferimento, l'obiettivo del giorno, lo stesso dell'intestazione e di Settimana
 * ("2.716 di 2.800"): prima del primo pasto segnato il numero è il previsto dal menù, con l'anello tratteggiato,
 * poi il già mangiato, con l'arco sull'obiettivo. Il tocco apre il dettaglio: il menù contro l'obiettivo, con la tacca.
 */
export function DayValues({ planned, eaten, target, minimal }: DayValuesProps) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const id = useId();
  const rows: Row[] = [
    { key: 'kcal', label: 'Energia', short: 'kcal', unit: 'kcal', fem: true, planned: planned.total.kcal, eaten: eaten.total.kcal, target: target.kcal, tone: 'accent', icon: Flame },
    { key: 'prot', label: 'Proteine', short: 'g', unit: 'g', fem: false, planned: planned.total.proteinG, eaten: eaten.total.proteinG, target: target.proteinG, tone: 'palestra', icon: Drumstick },
    { key: 'fib', label: 'Fibre', short: 'g', unit: 'g', fem: false, planned: planned.total.fiberG, eaten: eaten.total.fiberG, target: target.fiberG, tone: 'leggero', icon: Wheat },
    { key: 'veg', label: 'Frutta e verdura', short: '', unit: 'porzioni', fem: true, planned: planned.vegPortions, eaten: eaten.vegPortions, target: VEG_TARGET, tone: 'good', icon: Apple, decimals: 1 },
  ];
  const nothing = planned.total.kcal <= 0;
  const eatenOf = (r: Row) => (minimal ? 0 : r.eaten);
  // Basta un pasto segnato perché i quattro numeri diventino il già mangiato (anche uno 0 di frutta è un dato).
  const started = !minimal && eaten.total.kcal > 0;
  const fmt = (r: Row, n: number) => fmtNumber(round(n, r.decimals ?? 0), r.decimals ?? 0);
  const summary = rows
    .map((r) => {
      const [ate, planned] = r.fem ? ['mangiate', 'previste'] : ['mangiati', 'previsti'];
      const goal = `su un obiettivo di ${fmt(r, r.target)}`;
      return started
        ? `${r.label}: ${fmt(r, eatenOf(r))} ${r.unit} già ${ate} ${goal}, ${fmt(r, r.planned)} ${planned} dal menù`
        : `${r.label}: ${fmt(r, r.planned)} ${r.unit} ${planned} dal menù ${goal}`;
    })
    .join('. ');

  if (nothing) {
    return (
      <Card padding="md" as="section" aria-labelledby="oggi-valori">
        <h3 id="oggi-valori" className={cn(BOARD_LABEL, 'text-ink-3')}>
          Valori del giorno
        </h3>
        <p className="t-callout mt-2 text-ink-2">Il menù di oggi non ha ancora ricette: i valori compaiono quando ci sono.</p>
      </Card>
    );
  }

  return (
    <Card padding="none" as="section" aria-labelledby="oggi-valori">
      <button
        type="button"
        onClick={() => {
          haptic('selection');
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-controls={id}
        className="block w-full rounded-card p-4 text-left transition-colors duration-150 active:bg-ink-soft"
      >
        <span className="flex items-center justify-between gap-3">
          <span id="oggi-valori" className={cn(BOARD_LABEL, 'text-ink-3')}>
            Valori del giorno
            <span className="normal-case tracking-normal font-sans font-medium">{started ? ' · già mangiato' : ' · previsti dal menù'}</span>
          </span>
          <ChevronDown size={18} strokeWidth={2.5} aria-hidden className={cn('shrink-0 text-ink-3 transition-transform duration-200', open && 'rotate-180')} />
        </span>
        <span className="sr-only">{summary}</span>
        <span aria-hidden className="mt-2.5 grid grid-cols-4 gap-2">
          {rows.map((r) => (
            <span key={r.key} className="flex min-w-0 flex-col items-center text-center">
              <MiniRing value={r.target > 0 ? eatenOf(r) / r.target : 0} dashed={!started} tone={r.tone} icon={r.icon} />
              <span className="t-num mt-1.5 whitespace-nowrap text-[1.0625rem] leading-none text-ink">
                {fmt(r, started ? eatenOf(r) : r.planned)}
                {r.short && <span className="t-caption ml-0.5 font-sans text-ink-3">{r.short}</span>}
              </span>
              <span className="t-caption mt-0.5 truncate tabular text-ink-3">{`di ${fmt(r, r.target)}`}</span>
            </span>
          ))}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="detail"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="border-t border-line px-4 pb-4 pt-3.5">
              <ul className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                {rows.map((r) => {
                  const dec = r.decimals ?? 0;
                  return (
                    <li key={r.key} className="min-w-0">
                      <span className="t-caption block truncate font-medium text-ink-2">{r.label}</span>
                      <span className="mt-0.5 flex items-baseline gap-1 whitespace-nowrap">
                        <span className="t-num text-[1.25rem] leading-none text-ink">{fmtNumber(round(r.planned, dec), dec)}</span>
                        <span className="t-caption tabular text-ink-3">
                          / {fmtNumber(round(r.target, dec), dec)} {r.unit}
                        </span>
                      </span>
                      <Bar planned={r.planned} eaten={eatenOf(r)} target={r.target} tone={r.tone} />
                    </li>
                  );
                })}
              </ul>
              <div aria-hidden className="t-caption mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-3.5 rounded-full bg-ink-2" />
                  {minimal ? 'Giornata minima: conta il menù' : 'Già mangiato'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-3.5 rounded-full bg-ink-soft shadow-[inset_0_0_0_1px_var(--ink-3)]" />
                  Previsto
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-0.5 rounded-full bg-ink-2" />
                  Obiettivo
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
