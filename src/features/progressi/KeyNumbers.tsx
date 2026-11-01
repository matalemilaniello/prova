import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Goal } from '../../domain/types';
import { MIN_WEIGH_INS, type PeriodStats } from '../../engine/review';
import { fmtHours, plural } from '../../lib/format';
import { Card, Stat, type StatDelta } from '../../ui';
import { weightTone } from './charts/WeightChart';

type Tone = StatDelta['tone'];

/** Divisori a croce, rientrati ai bordi come nei gruppi di iOS (seguono l'altezza delle righe). */
const LINE = "after:absolute after:h-px after:bg-line before:absolute before:w-px before:bg-line";
const CELL = [
  `relative py-4 pl-4 pr-3 ${LINE} after:bottom-0 after:left-4 after:right-0`,
  `relative py-4 pl-4 pr-3 ${LINE} after:bottom-0 after:left-0 after:right-4 before:left-0 before:top-4 before:bottom-0`,
  'relative py-4 pl-4 pr-3',
  `relative py-4 pl-4 pr-3 ${LINE} after:hidden before:left-0 before:top-0 before:bottom-4`,
];

/** Variazione da mostrare, oppure null se arrotondata è zero (allora si scrive "stabile"). */
function delta(value: number | null, unit: string, decimals: number, tone: (v: number) => Tone): StatDelta | null {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** decimals;
  const r = Math.round(value * f) / f;
  if (r === 0) return null;
  return { value: r, unit, decimals, tone: tone(r) };
}

function Stable({ children = 'stabile' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-ink-2">
      <ArrowRight size={14} strokeWidth={2.6} aria-hidden />
      {children}
    </span>
  );
}

/**
 * Numeri chiave degli ultimi 7 giorni, confrontati con i 7 precedenti: peso medio, ore a letto,
 * aderenza e fibre stimate. Una sola card divisa in quattro, come i riepiloghi di Salute.
 */
export function KeyNumbers({ stats, goal, adherenceReady = true }: { stats: PeriodStats; goal: Goal; adherenceReady?: boolean }) {
  // Con meno di 4 pesate la variazione è rumore: si dice quante ne mancano.
  const enoughWeights = stats.weighIns >= MIN_WEIGH_INS;
  const hasPrevWeight = enoughWeights && stats.weightAvg !== null && stats.weightPrevAvg !== null;
  const wDelta = hasPrevWeight
    ? delta(stats.weightAvg! - stats.weightPrevAvg!, 'kg', 1, (v) => weightTone(goal, v, stats.weightPrevAvg!))
    : null;

  const hasPrevSleep = stats.sleepAvgH !== null && stats.prevSleepAvgH !== null;
  const sDelta = hasPrevSleep
    ? delta((stats.sleepAvgH! - stats.prevSleepAvgH!) * 60, 'min', 0, (v) => (v >= 10 ? 'good' : v <= -10 ? 'bad' : 'neutral'))
    : null;

  // Finché nessun giorno chiuso ha qualcosa di segnato l'aderenza non c'è ancora: un trattino, non uno zero.
  const adh = stats.adherence !== null && adherenceReady ? Math.round(stats.adherence * 100) : null;
  const adhPrev = stats.prevAdherence !== null ? Math.round(stats.prevAdherence * 100) : null;
  const aDelta =
    adh !== null && adhPrev !== null
      ? delta(adh - adhPrev, Math.abs(adh - adhPrev) === 1 ? 'punto' : 'punti', 0, (v) => (v >= 3 ? 'good' : v <= -3 ? 'bad' : 'neutral'))
      : null;

  const fiber = stats.fiberAvgG;
  const target = stats.fiberTargetG;
  // Stessa regola della proposta della revisione: contro il menù di avvio nei primi giorni.
  const fiberLow = stats.fiberLow;
  const fDelta =
    fiber !== null && stats.prevFiberAvgG !== null
      ? delta(fiber - stats.prevFiberAvgG, 'g', 0, (v) => (v >= 2 && fiber < target + 5 ? 'good' : v <= -2 && fiber < target ? 'bad' : 'neutral'))
      : null;

  const cells = [
    <Stat
      key="peso"
      label="Peso medio"
      value={stats.weightAvg}
      decimals={1}
      unit="kg"
      delta={wDelta ?? undefined}
      caption={
        wDelta ? undefined : hasPrevWeight ? <Stable /> : !enoughWeights ? `servono ${MIN_WEIGH_INS} pesate${stats.weighIns ? `, ${stats.weighIns === 1 ? 'fatta 1' : `fatte ${stats.weighIns}`}` : ''}` : `${stats.weighIns} pesate`
      }
    />,
    <Stat
      key="sonno"
      label="Ore a letto"
      value={stats.sleepAvgH !== null ? fmtHours(stats.sleepAvgH) : null}
      delta={sDelta ?? undefined}
      caption={sDelta ? undefined : hasPrevSleep ? <Stable /> : stats.sleepNights ? `${stats.sleepNights} ${stats.sleepNights === 1 ? 'notte' : 'notti'}` : 'Nessuna notte'}
    />,
    <Stat
      key="aderenza"
      label="Aderenza"
      value={adh}
      unit="%"
      delta={aDelta ?? undefined}
      caption={
        aDelta ? undefined : adhPrev !== null && adh !== null ? <Stable /> : adh !== null ? plural(stats.successfulDays, 'giornata riuscita', 'giornate riuscite') : 'dal primo giorno segnato'
      }
    />,
    <Stat
      key="fibre"
      label="Fibre stimate"
      value={fiber !== null ? Math.round(fiber) : null}
      unit="g"
      color={fiberLow ? 'var(--warn-ink)' : undefined}
      delta={fDelta ?? undefined}
      caption={fDelta || fiber === null || stats.prevFiberAvgG === null ? `obiettivo ${target} g` : <Stable>stabili, obiettivo {target} g</Stable>}
    />,
  ];

  return (
    <Card as="section" padding="none" aria-label="Numeri degli ultimi 7 giorni">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
        <h2 className="t-label text-ink-3">Ultimi 7 giorni</h2>
        <span className="t-caption text-ink-3">rispetto ai 7 prima</span>
      </div>
      <div className="grid grid-cols-2">
        {cells.map((c, i) => (
          <div key={i} className={CELL[i]}>
            {c}
          </div>
        ))}
      </div>
    </Card>
  );
}
