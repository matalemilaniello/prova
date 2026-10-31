import { motion, useReducedMotion } from 'motion/react';
import type { MacroTarget } from '../../../domain/types';
import type { DayNutritionDetail } from '../../../engine/nutrition';
import { fmtNumber } from '../../../lib/format';
import { Card, toneColor, toneSoft, type AnyTone } from '../../../ui';

/** Porzioni di frutta e verdura al giorno. */
export const VEG_TARGET = 5;

interface Row {
  key: string;
  label: string;
  unit: string;
  planned: number;
  eaten: number;
  target: number;
  tone: AnyTone;
  decimals?: number;
}

function Bar({ planned, eaten, target, tone }: { planned: number; eaten: number; target: number; tone: AnyTone }) {
  const reduce = useReducedMotion();
  const scale = Math.max(target, planned, 1);
  const p = Math.min(1, planned / scale);
  const e = Math.min(1, eaten / scale);
  const t = target / scale;
  const tr = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 160, damping: 26 };
  return (
    <div aria-hidden className="relative mt-2 h-2 overflow-hidden rounded-full bg-ink-soft">
      <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: toneSoft(tone, 38) }} initial={reduce ? false : { width: 0 }} animate={{ width: `${p * 100}%` }} transition={tr} />
      <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: toneColor(tone) }} initial={reduce ? false : { width: 0 }} animate={{ width: `${e * 100}%` }} transition={tr} />
      {t < 0.995 && <span className="absolute inset-y-0 w-0.5 bg-ink-2" style={{ left: `calc(${t * 100}% - 1px)` }} />}
    </div>
  );
}

export interface DayValuesProps {
  planned: DayNutritionDetail;
  eaten: DayNutritionDetail;
  target: MacroTarget;
  minimal: boolean;
}

/** Valori del giorno stimati dal menù rispetto all'obiettivo; la parte piena è quanto è già stato mangiato. */
export function DayValues({ planned, eaten, target, minimal }: DayValuesProps) {
  const rows: Row[] = [
    { key: 'kcal', label: 'Energia', unit: 'kcal', planned: planned.total.kcal, eaten: eaten.total.kcal, target: target.kcal, tone: 'accent' },
    { key: 'prot', label: 'Proteine', unit: 'g', planned: planned.total.proteinG, eaten: eaten.total.proteinG, target: target.proteinG, tone: 'palestra' },
    { key: 'fib', label: 'Fibre', unit: 'g', planned: planned.total.fiberG, eaten: eaten.total.fiberG, target: target.fiberG, tone: 'leggero' },
    { key: 'veg', label: 'Frutta e verdura', unit: 'porzioni', planned: planned.vegPortions, eaten: eaten.vegPortions, target: VEG_TARGET, tone: 'good', decimals: 1 },
  ];
  const nothing = planned.total.kcal <= 0;

  return (
    <Card padding="none" as="section" aria-labelledby="oggi-valori">
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="oggi-valori" className="t-headline text-ink">
            Valori del giorno
          </h3>
          <span className="t-caption text-ink-3">stimati dal menù</span>
        </div>
        {nothing ? (
          <p className="t-callout mt-2 text-ink-2">Il menù di oggi non ha ancora ricette: i valori compaiono quando ci sono.</p>
        ) : (
          <ul className="mt-3.5 flex flex-col gap-3.5">
            {rows.map((r) => {
              const dec = r.decimals ?? 0;
              const round = (n: number) => (dec ? Math.round(n * 2) / 2 : Math.round(n));
              return (
                <li key={r.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="t-footnote font-medium text-ink-2">{r.label}</span>
                    <span className="t-footnote tabular text-ink-3">
                      <span className="t-num text-[1.0625rem] text-ink">{fmtNumber(round(r.planned), dec)}</span>
                      {' / '}
                      {fmtNumber(round(r.target), dec)} {r.unit}
                    </span>
                  </div>
                  <Bar planned={r.planned} eaten={minimal ? 0 : r.eaten} target={r.target} tone={r.tone} />
                  <span className="sr-only">
                    {`${r.label}: previsti ${fmtNumber(round(r.planned), dec)} su ${fmtNumber(round(r.target), dec)} ${r.unit}, già mangiati ${fmtNumber(round(r.eaten), dec)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {!nothing && (
          <div className="t-caption mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-3.5 rounded-full bg-ink-2" />
              {minimal ? 'Giornata minima: conta il menù' : 'Già mangiato'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-3.5 rounded-full bg-ink-soft shadow-[inset_0_0_0_1px_var(--line-strong)]" />
              Previsto dal menù
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-0.5 bg-ink-2" />
              Obiettivo
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
