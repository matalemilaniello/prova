import { useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, HeartPulse } from 'lucide-react';
import { fmtDateCompact, fmtNumber } from '../../../lib/format';
import { Pill, toneColor, toneInk, type AnyTone } from '../../../ui';
import type { Trend } from '../../../engine/review';
import type { PainPoint } from '../series';
import { mondayTicks } from './axis';
import { ChartCard } from './ChartCard';
import { ChartSvg, labelStyle, ScrubRule, useGeometry, useScrub, YGrid } from './frame';
import { linear, monotonePath, segments } from './scale';

const HEIGHT = 146;

/** Colori delle zone: distinti in entrambi i temi, mai il rosso (riservato a "fermati"). */
export const SITE_TONES: AnyTone[] = ['palestra', 'riposo', 'leggero', 'calcio', 'good'];

export interface PainSeries {
  site: string;
  points: PainPoint[];
  tone: AnyTone;
  /** Media degli ultimi 7 giorni e tendenza (dai numeri della revisione). */
  avg: number | null;
  trend: Trend | null;
}

export function PainChart({ series, threshold }: { series: PainSeries[]; threshold: number }) {
  const { ref, geo } = useGeometry(HEIGHT, { top: 14, right: 38, bottom: 24, left: 10 });
  const reduce = useReducedMotion();
  const n = series[0]?.points.length ?? 0;
  const xAt = useCallback((i: number) => geo.left + (n <= 1 ? geo.innerW / 2 : (i * geo.innerW) / (n - 1)), [geo.left, geo.innerW, n]);
  const scrub = useScrub(n, xAt);
  const hasData = series.some((s) => s.points.some((p) => p.value !== null));

  const maxV = Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.value ?? 0)));
  const hi = Math.min(10, Math.max(6, threshold + 2, Math.ceil(maxV) + 1));
  const step = 2;
  const ticks = Array.from({ length: Math.floor(hi / step) + 1 }, (_, i) => i * step);
  const top = ticks[ticks.length - 1];
  const y = linear(0, top, geo.bottom, geo.top);
  const ty = Math.round(y(threshold)) + 0.5;

  const sel = scrub.index;
  const over = series.some((s) => (s.avg ?? 0) > threshold);
  const rising = series.some((s) => s.trend === 'su');

  const label = hasData
    ? `Dolore per zona, scala da 0 a 10, linea con la media di 3 giorni. ${series
        .map((s) => `${s.site}: media di 7 giorni ${s.avg !== null ? fmtNumber(s.avg, 1) : 'non disponibile'}${s.trend === 'su' ? ', in aumento' : s.trend === 'giu' ? ', in calo' : ''}`)
        .join('. ')}. Soglia ${threshold}.`
    : 'Nessun dolore registrato';

  return (
    <ChartCard
      title="Dolore"
      badge={
        hasData ? (
          over ? (
            <Pill tone="warn" size="sm">
              Sopra soglia
            </Pill>
          ) : rising ? (
            <Pill tone="warn" size="sm">
              In aumento
            </Pill>
          ) : (
            <Pill tone="good" size="sm">
              Sotto soglia
            </Pill>
          )
        ) : undefined
      }
      caption={sel !== null && series[0] ? <span>{fmtDateCompact(series[0].points[sel].date)}</span> : undefined}
      empty={
        hasData
          ? null
          : { icon: HeartPulse, title: 'Nessun dolore registrato', text: 'Nel controllo del mattino indica il dolore delle zone che monitori, da 0 a 10.' }
      }
      legend={series.map((s) => {
        const v = sel !== null ? s.points[sel]?.value : s.avg;
        const TrendIcon = s.trend === 'su' ? ArrowUpRight : s.trend === 'giu' ? ArrowDownRight : ArrowRight;
        return (
          <span key={s.site} className="t-footnote inline-flex items-center gap-1.5 text-ink-2">
            <span aria-hidden className="h-[3px] w-4 rounded-full" style={{ background: toneColor(s.tone) }} />
            <span className="font-semibold text-ink">{s.site}</span>
            <span className="font-semibold tabular-nums" style={{ color: toneInk(s.tone) }}>
              {v === null || v === undefined ? '–' : fmtNumber(v, 1)}
            </span>
            {sel === null && s.trend && (
              <TrendIcon
                size={14}
                strokeWidth={2.6}
                aria-label={s.trend === 'su' ? 'in aumento' : s.trend === 'giu' ? 'in calo' : 'stabile'}
                style={{ color: s.trend === 'su' ? 'var(--warn-ink)' : s.trend === 'giu' ? 'var(--good-ink)' : 'var(--ink-3)' }}
              />
            )}
          </span>
        );
      })}
      footnote={`Dolore da 0 a 10 nel controllo del mattino. La linea è la media di 3 giorni, il numero accanto alla zona la media degli ultimi 7. Sopra la soglia di ${threshold} il piano frena i carichi.`}
    >
      <div ref={ref}>
        {hasData && (
          <ChartSvg geo={geo} label={label} onKeyDown={scrub.onKeyDown}>
            <YGrid geo={geo} ticks={ticks} y={y} format={(v) => String(v)} />
            <g aria-hidden>
              {mondayTicks(
                series[0].points.map((p) => p.date),
                xAt,
                geo,
              ).map((t) => (
                <text key={t.x} x={t.x} y={geo.bottom + 17} textAnchor={t.anchor} style={labelStyle()}>
                  {t.label}
                </text>
              ))}
            </g>
            {/* Zona sopra soglia, appena velata */}
            <rect aria-hidden x={geo.left - 4} y={geo.top} width={geo.innerW + 8} height={Math.max(0, ty - geo.top)} style={{ fill: 'var(--warn)', opacity: 0.06 }} />
            <line aria-hidden x1={geo.left - 4} x2={geo.right + 4} y1={ty} y2={ty} style={{ stroke: 'var(--warn)', strokeWidth: 1.25, strokeDasharray: '5 4' }} />
            <text aria-hidden x={geo.right} y={ty - 6} textAnchor="end" style={labelStyle({ fill: 'var(--warn-ink)', fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600, letterSpacing: 0 })}>
              Soglia {threshold}
            </text>

            {series.map((s, si) => {
              const segs = segments(s.points, (p, i) => (p.smooth === null ? null : { x: xAt(i), y: y(p.smooth) }));
              const color = toneColor(s.tone);
              let lastIdx = -1;
              for (let i = s.points.length - 1; i >= 0; i--)
                if (s.points[i].smooth !== null) {
                  lastIdx = i;
                  break;
                }
              return (
                <g key={s.site} aria-hidden>
                  {s.points.map((p, i) =>
                    p.value === null ? null : (
                      <circle
                        key={p.date}
                        cx={xAt(i)}
                        cy={y(p.value)}
                        r={sel === i ? 3.5 : 2}
                        style={sel === i ? { fill: color } : { fill: 'var(--card)', stroke: color, strokeWidth: 1 }}
                      />
                    ),
                  )}
                  {segs.map((seg, k) => (
                    <motion.path
                      key={k}
                      d={monotonePath(seg)}
                      style={{ fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }}
                      initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.9, delay: 0.1 + si * 0.12, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ))}
                  {lastIdx >= 0 && sel === null && (
                    <>
                      <circle cx={xAt(lastIdx)} cy={y(s.points[lastIdx].smooth ?? 0)} r={5.25} style={{ fill: 'var(--card)' }} />
                      <circle cx={xAt(lastIdx)} cy={y(s.points[lastIdx].smooth ?? 0)} r={3.75} style={{ fill: color }} />
                    </>
                  )}
                </g>
              );
            })}
            {sel !== null && <ScrubRule geo={geo} x={xAt(sel)} />}
            <rect x={0} y={0} width={geo.width} height={geo.height} fill="transparent" {...scrub.bind} />
          </ChartSvg>
        )}
      </div>
    </ChartCard>
  );
}
