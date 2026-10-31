import { useCallback, useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Scale } from 'lucide-react';
import type { Goal } from '../../../domain/types';
import { fmtDateCompact, fmtDelta, fmtNumber } from '../../../lib/format';
import { useUi } from '../../../state/store';
import { Button } from '../../../ui';
import type { WeightPoint } from '../series';
import { mondayTicks } from './axis';
import { BigValue, ChartCard, LegendItem } from './ChartCard';
import { ChartSvg, EndDot, ScrubRule, useGeometry, useScrub, YGrid } from './frame';
import { areaPath, linear, monotonePath, niceDomain, safeId, segments } from './scale';

const HEIGHT = 184;

/** "−1,0 kg", "+0,4 kg", "0,0 kg": sempre un decimale, segno tipografico. */
export function signedKg(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${fmtNumber(Math.abs(r), 1, true)} kg`;
}
const ACCENT = 'var(--accent)';

/** Tono della variazione di peso secondo l'obiettivo. */
export function weightTone(goal: Goal, deltaKg: number, refKg: number): 'good' | 'bad' | 'neutral' {
  const pct = refKg > 0 ? deltaKg / refKg : 0;
  if (goal === 'dimagrimento') return pct < -0.0025 ? 'good' : pct > 0.0025 ? 'bad' : 'neutral';
  if (goal === 'massa') return pct > 0.001 ? 'good' : pct < -0.0025 ? 'bad' : 'neutral';
  return Math.abs(pct) > 0.01 ? 'bad' : 'neutral';
}

export function WeightChart({ points, today }: { points: WeightPoint[]; today: string }) {
  const { ref, geo } = useGeometry(HEIGHT);
  const reduce = useReducedMotion();
  const gid = safeId(useId());
  const n = points.length;
  const xAt = useCallback((i: number) => geo.left + (n <= 1 ? geo.innerW / 2 : (i * geo.innerW) / (n - 1)), [geo.left, geo.innerW, n]);
  const scrub = useScrub(n, xAt);

  const values = points.flatMap((p) => [p.weight, p.trend]).filter((v): v is number => v !== null);
  const hasData = values.length > 0;
  const dom = hasData ? niceDomain(Math.min(...values) - 0.15, Math.max(...values) + 0.15, 4, 1) : niceDomain(0, 1);
  const y = linear(dom.lo, dom.hi, geo.bottom, geo.top);
  const decimals = dom.step < 1 ? 1 : 0;

  const trendSegs = segments(points, (p, i) => (p.trend === null ? null : { x: xAt(i), y: y(p.trend) }));
  const lastIdx = (() => {
    for (let i = n - 1; i >= 0; i--) if (points[i].trend !== null) return i;
    return -1;
  })();
  const firstIdx = points.findIndex((p) => p.trend !== null);
  const last = lastIdx >= 0 ? points[lastIdx] : null;
  const first = firstIdx >= 0 ? points[firstIdx] : null;
  const change = last && first && lastIdx > firstIdx ? (last.trend ?? 0) - (first.trend ?? 0) : null;
  const weeks = Math.max(1, Math.round((lastIdx - firstIdx) / 7));

  const sel = scrub.index !== null ? points[scrub.index] : null;
  // Con una sola pesata la media non c'è ancora: si mostra l'ultima pesata.
  const lastWeighed = [...points].reverse().find((p) => p.weight !== null) ?? null;
  const weighIns = points.reduce((k, p) => k + (p.weight !== null ? 1 : 0), 0);
  const shown = sel ?? last ?? lastWeighed;
  const shownValue = sel ? (sel.weight ?? sel.trend) : (last?.trend ?? lastWeighed?.weight ?? null);

  const caption = sel ? (
    <span>
      {fmtDateCompact(sel.date)}
      {sel.weight !== null && sel.trend !== null && <span className="text-ink-3"> · media {fmtNumber(sel.trend, 1, true)}</span>}
      {sel.weight === null && <span className="text-ink-3"> · media</span>}
    </span>
  ) : change !== null ? (
    <span className="tabular">
      {signedKg(change)} <span className="text-ink-3">in {weeks === 1 ? '1 settimana' : `${weeks} settimane`}</span>
    </span>
  ) : !last && weighIns > 0 ? (
    <span className="text-ink-3">{weighIns === 1 ? 'prima pesata' : 'media 7 giorni'}</span>
  ) : (
    <span className="text-ink-3">media 7 giorni</span>
  );

  const label = hasData
    ? `Peso degli ultimi ${n} giorni. Media mobile di 7 giorni a ${fmtNumber(last?.trend ?? 0, 1, true)} chili${change !== null ? `, variazione ${fmtDelta(change, 'chili', 1)}` : ''}. Usa le frecce per leggere i singoli giorni.`
    : 'Nessuna pesata';

  return (
    <ChartCard
      title="Peso"
      subtitle="Media mobile di 7 giorni"
      value={shownValue !== null && shown ? <BigValue value={fmtNumber(shownValue, 1, true)} unit="kg" /> : undefined}
      caption={caption}
      empty={
        hasData
          ? null
          : {
              icon: Scale,
              title: 'Nessuna pesata ancora',
              text: 'Pesati al mattino, a digiuno, nel controllo del mattino: qui comparirà la media di 7 giorni.',
              action: (
                <Button size="sm" variant="secondary" onClick={() => useUi.getState().open({ type: 'checkin', date: today })}>
                  Fai il controllo
                </Button>
              ),
            }
      }
      legend={
        <>
          <LegendItem color="var(--ink-3)">Pesata</LegendItem>
          <LegendItem color={ACCENT} kind="line">
            Media 7 giorni
          </LegendItem>
        </>
      }
    >
      <div ref={ref}>
        {hasData && (
          <ChartSvg geo={geo} label={label} onKeyDown={scrub.onKeyDown}>
            <defs>
              <linearGradient id={`${gid}-area`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" style={{ stopColor: ACCENT, stopOpacity: 0.3 }} />
                <stop offset="100%" style={{ stopColor: ACCENT, stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <YGrid geo={geo} ticks={dom.ticks} y={y} format={(v) => fmtNumber(v, decimals, decimals > 0)} />
            <g aria-hidden>
              {mondayTicks(
                points.map((p) => p.date),
                xAt,
                geo,
              ).map((t) => (
                <text
                  key={t.x}
                  x={t.x}
                  y={geo.bottom + 17}
                  textAnchor={t.anchor}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fill: 'var(--ink-3)', letterSpacing: '0.02em' }}
                >
                  {t.label}
                </text>
              ))}
            </g>

            {trendSegs.map((seg, i) => (
              <motion.path
                key={`a${i}`}
                d={areaPath(seg, geo.bottom)}
                style={{ fill: `url(#${gid}-area)` }}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.35 }}
                aria-hidden
              />
            ))}

            <g aria-hidden>
              {points.map((p, i) =>
                p.weight === null ? null : (
                  <circle
                    key={p.date}
                    cx={xAt(i)}
                    cy={y(p.weight)}
                    r={scrub.index === i ? 4 : 2.6}
                    style={{ fill: scrub.index === i ? 'var(--ink)' : 'var(--ink-3)', opacity: scrub.index === i ? 1 : 0.75 }}
                  />
                ),
              )}
            </g>

            {trendSegs.map((seg, i) => (
              <motion.path
                key={`l${i}`}
                d={monotonePath(seg)}
                style={{ fill: 'none', stroke: ACCENT, strokeWidth: 2.75, strokeLinecap: 'round', strokeLinejoin: 'round' }}
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                aria-hidden
              />
            ))}

            {last && scrub.index === null && <EndDot x={xAt(lastIdx)} y={y(last.trend ?? 0)} color={ACCENT} />}

            {sel && scrub.index !== null && (
              <g aria-hidden>
                <ScrubRule geo={geo} x={xAt(scrub.index)} />
                {sel.trend !== null && <EndDot x={xAt(scrub.index)} y={y(sel.trend)} color={ACCENT} r={4} />}
              </g>
            )}

            <rect x={0} y={0} width={geo.width} height={geo.height} fill="transparent" {...scrub.bind} />
          </ChartSvg>
        )}
      </div>
    </ChartCard>
  );
}
