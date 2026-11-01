import { useCallback, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Moon } from 'lucide-react';
import type { Plan, SleepPlan } from '../../../domain/types';
import { minToHHMM, nightMinutes } from '../../../engine/dates';
import { isOnTargetFor, sleepHours } from '../../../engine/sleep';
import { fmtDateCompact, fmtDelta, fmtHours } from '../../../lib/format';
import { Segmented } from '../../../ui';
import type { SleepPoint } from '../series';
import { mondayTicks } from './axis';
import { BigValue, ChartCard, HoursValue, LegendItem } from './ChartCard';
import { ChartSvg, labelStyle, ScrubRule, useGeometry, useScrub, YGrid, type Geometry } from './frame';
import { linear, topRoundedRect } from './scale';

const HEIGHT = 180;
const COLOR = 'var(--riposo)';
const SOFT = `color-mix(in srgb, ${COLOR} 40%, transparent)`;

type Mode = 'ore' | 'orari';

export interface SleepChartProps {
  points: SleepPoint[];
  sleep: SleepPlan;
  /** Settimana del piano: nelle sere di calcio l'orario in orario è quello dopo la partita. */
  week?: Plan['week'];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Media di orari serali (00:10 dopo 23:50), in minuti "notturni". */
function meanBed(points: SleepPoint[]): number | null {
  return mean(points.map((p) => p.bed).filter((b): b is string => Boolean(b)).map(nightMinutes));
}

function DateAxis({ points, xAt, geo }: { points: SleepPoint[]; xAt: (i: number) => number; geo: Geometry }) {
  return (
    <g aria-hidden>
      {mondayTicks(
        points.map((p) => p.date),
        xAt,
        geo,
      ).map((t) => (
        <text key={t.x} x={t.x} y={geo.bottom + 17} textAnchor={t.anchor} style={labelStyle()}>
          {t.label}
        </text>
      ))}
    </g>
  );
}

/**
 * Sonno a barre. "Ore": ore a letto per notte (dagli orari del controllo, non il sonno misurato) con la
 * linea dell'obiettivo.
 * "Orari": ogni notte è una barra da quando sei andato a letto alla sveglia, con l'orario obiettivo
 * e quello della fase attuale: si vede l'orario a letto che si anticipa settimana dopo settimana.
 */
export function SleepChart({ points, sleep, week = [] }: SleepChartProps) {
  const [mode, setMode] = useState<Mode>('ore');
  const { ref, geo } = useGeometry(HEIGHT, { top: 14, right: 44, bottom: 24, left: 8 });
  const reduce = useReducedMotion();
  const n = points.length;
  const slot = geo.innerW / Math.max(1, n);
  const xAt = useCallback((i: number) => geo.left + slot * (i + 0.5), [geo.left, slot]);
  const scrub = useScrub(n, xAt);
  const barW = Math.max(3, Math.min(13, slot * 0.6));

  const targetH = sleepHours(sleep.target, sleep.wake);
  const phaseH = sleepHours(sleep.current, sleep.wake);
  const hours = points.map((p) => p.hours).filter((h): h is number => h !== null);
  const timed = points.filter((p) => p.bed && p.wake);
  const hasData = hours.length > 0;
  const lastIdx = (() => {
    for (let i = n - 1; i >= 0; i--) if (points[i].hours !== null || points[i].bed) return i;
    return -1;
  })();
  const sel = scrub.index !== null ? points[scrub.index] : null;
  const last7 = points.slice(-7);
  const prev7 = points.slice(-14, -7);

  // ── Ore ──
  const hiH = Math.max(9, Math.ceil(Math.max(targetH, ...hours, 0)));
  const yH = linear(0, hiH, geo.bottom, geo.top);
  const phaseOk = (h: number) => h >= phaseH - 0.25;

  // ── Orari (minuti notturni: 23:30 = 1410, 07:15 = 1875) ──
  const beds = timed.map((p) => nightMinutes(p.bed!));
  const wakes = timed.map((p) => nightMinutes(p.wake!));
  const lo = Math.floor((Math.min(nightMinutes(sleep.target), ...beds) - 20) / 60) * 60;
  const hi = Math.ceil((Math.max(nightMinutes(sleep.wake), ...wakes) + 10) / 60) * 60;
  const yT = linear(lo, hi, geo.top, geo.bottom);
  const timeTicks: number[] = [];
  const step = hi - lo > 8 * 60 ? 120 : 60;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) timeTicks.push(v);

  // ── Intestazione ──
  const avgH = mean(last7.map((p) => p.hours).filter((h): h is number => h !== null));
  const prevAvgH = mean(prev7.map((p) => p.hours).filter((h): h is number => h !== null));
  const bedAvg = meanBed(last7);
  const bedPrev = meanBed(prev7);

  // La media si dice su quante notti è fatta: nei primi giorni sono meno di sette.
  const nightsLabel = (n: number) => (n === 1 ? '1 notte' : `media ${n} notti`);
  const hoursLabel = nightsLabel(last7.filter((p) => p.hours !== null && p.hours !== undefined).length);
  const bedLabel = nightsLabel(last7.filter((p) => p.bed).length);

  let value: React.ReactNode;
  let caption: React.ReactNode;
  if (mode === 'ore') {
    const v = sel ? sel.hours : avgH;
    value = v !== null && v !== undefined ? <HoursValue hours={v} /> : undefined;
    const delta = avgH !== null && prevAvgH !== null ? Math.round((avgH - prevAvgH) * 60) : null;
    caption = sel ? (
      <span>{fmtDateCompact(sel.date)}</span>
    ) : delta !== null && delta !== 0 ? (
      <span className="tabular" style={{ color: delta > 0 ? 'var(--good-ink)' : 'var(--warn-ink)' }}>
        {fmtDelta(delta, 'min', 0)} <span className="text-ink-3">{hoursLabel}</span>
      </span>
    ) : (
      <span className="text-ink-3">{hoursLabel}</span>
    );
  } else {
    const v = sel ? (sel.bed ? nightMinutes(sel.bed) : null) : bedAvg;
    value = v !== null ? <BigValue value={minToHHMM(v)} /> : undefined;
    const delta = bedAvg !== null && bedPrev !== null ? Math.round(bedAvg - bedPrev) : null;
    caption = sel ? (
      <span>
        {fmtDateCompact(sel.date)}
        {sel.wake && <span className="text-ink-3"> · sveglia {sel.wake}</span>}
      </span>
    ) : delta !== null && delta !== 0 ? (
      <span className="tabular" style={{ color: delta < 0 ? 'var(--good-ink)' : 'var(--warn-ink)' }}>
        {fmtDelta(delta, 'min', 0)} <span className="text-ink-3">a letto, {bedLabel}</span>
      </span>
    ) : (
      <span className="text-ink-3">a letto, {bedLabel}</span>
    );
  }

  const nightsOk = hours.filter(phaseOk).length;
  const label =
    mode === 'ore'
      ? `Ore a letto per notte negli ultimi ${n} giorni. Media degli ultimi 7 giorni ${avgH !== null ? fmtHours(avgH) : 'non disponibile'}; obiettivo ${fmtHours(targetH)}; almeno ${fmtHours(phaseH)} in ${nightsOk} notti su ${hours.length}.`
      : `Orari a letto per notte negli ultimi ${n} giorni. A letto in media alle ${bedAvg !== null ? minToHHMM(bedAvg) : 'non disponibile'}; fase attuale ${sleep.current}, obiettivo ${sleep.target}.`;

  const lineY = (v: number) => Math.round(v) + 0.5;

  return (
    <ChartCard
      title="Sonno"
      subtitle={mode === 'ore' ? 'Ore a letto per notte' : 'Dal letto alla sveglia'}
      value={value}
      caption={caption}
      toolbar={
        timed.length > 0 ? (
          <Segmented
            aria-label="Vista del sonno"
            size="sm"
            value={mode}
            onChange={(m) => {
              scrub.clear();
              setMode(m);
            }}
            options={[
              { value: 'ore', label: 'Ore' },
              { value: 'orari', label: 'Orari' },
            ]}
          />
        ) : undefined
      }
      empty={hasData ? null : { icon: Moon, title: 'Nessuna notte registrata', text: 'Segna a che ora sei andato a letto nel controllo del mattino.' }}
      legend={
        mode === 'ore' ? (
          <>
            <LegendItem color={COLOR} kind="square">
              Almeno {fmtHours(phaseH)}
            </LegendItem>
            <LegendItem color={SOFT} kind="square">
              Meno
            </LegendItem>
            <LegendItem color="var(--ink-2)" kind="dash">
              Obiettivo {fmtHours(targetH)} a letto
            </LegendItem>
          </>
        ) : (
          <>
            <LegendItem color={COLOR} kind="square">
              In orario
            </LegendItem>
            <LegendItem color={SOFT} kind="square">
              Tardi
            </LegendItem>
            <LegendItem color={COLOR} kind="line">
              Fase {sleep.current}
            </LegendItem>
            <LegendItem color="var(--ink-2)" kind="dash">
              Obiettivo {sleep.target}
            </LegendItem>
          </>
        )
      }
      footnote={mode === 'orari' ? `In orario: a letto entro 15 minuti dalla fase attuale (dopo il calcio serale, dall’orario previsto per quella sera). Ogni settimana con 5 notti in orario la fase si anticipa di ${sleep.stepMin} minuti.` : undefined}
    >
      <div ref={ref}>
        {hasData && (
          <ChartSvg geo={geo} label={label} onKeyDown={scrub.onKeyDown}>
            {mode === 'ore' ? (
              <>
                <YGrid geo={geo} ticks={[0, 2, 4, 6, 8].filter((t) => t <= hiH)} y={yH} format={(v) => `${v} h`} strongZero />
                <DateAxis points={points} xAt={xAt} geo={geo} />
                <g aria-hidden>
                  {points.map((p, i) => {
                    if (p.hours === null) return null;
                    const top = yH(p.hours);
                    const active = scrub.index === i;
                    return (
                      <motion.path
                        key={`h-${p.date}`}
                        d={topRoundedRect(xAt(i) - barW / 2, top, barW, geo.bottom - top, Math.min(4, barW / 2))}
                        style={{ fill: phaseOk(p.hours) ? COLOR : SOFT, opacity: scrub.index !== null && !active ? 0.45 : 1, originY: 1 }}
                        initial={reduce ? false : { scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 34, delay: Math.min(0.45, i * 0.012) }}
                      />
                    );
                  })}
                </g>
                <line aria-hidden x1={geo.left - 4} x2={geo.right + 4} y1={lineY(yH(targetH))} y2={lineY(yH(targetH))} style={{ stroke: 'var(--ink-2)', strokeWidth: 1.25, strokeDasharray: '5 4' }} />
              </>
            ) : (
              <>
                <YGrid geo={geo} ticks={timeTicks} y={yT} format={(v) => minToHHMM(v)} />
                <DateAxis points={points} xAt={xAt} geo={geo} />
                <g aria-hidden>
                  {points.map((p, i) => {
                    if (!p.bed || !p.wake) return null;
                    const top = yT(nightMinutes(p.bed));
                    const bottom = yT(nightMinutes(p.wake));
                    const ok = isOnTargetFor(p.bed, p.date, { sleep, week });
                    const active = scrub.index === i;
                    return (
                      <motion.rect
                        key={`t-${p.date}`}
                        x={xAt(i) - barW / 2}
                        y={top}
                        width={barW}
                        height={Math.max(2, bottom - top)}
                        rx={barW / 2}
                        style={{ fill: ok ? COLOR : SOFT, opacity: scrub.index !== null && !active ? 0.45 : 1, originY: 0 }}
                        initial={reduce ? false : { scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 34, delay: Math.min(0.45, i * 0.012) }}
                      />
                    );
                  })}
                </g>
                <line aria-hidden x1={geo.left - 4} x2={geo.right + 4} y1={lineY(yT(nightMinutes(sleep.current)))} y2={lineY(yT(nightMinutes(sleep.current)))} style={{ stroke: COLOR, strokeWidth: 1.5 }} />
                <line aria-hidden x1={geo.left - 4} x2={geo.right + 4} y1={lineY(yT(nightMinutes(sleep.target)))} y2={lineY(yT(nightMinutes(sleep.target)))} style={{ stroke: 'var(--ink-2)', strokeWidth: 1.25, strokeDasharray: '5 4' }} />
              </>
            )}
            {scrub.index === null && lastIdx >= 0 && (
              <circle
                aria-hidden
                cx={xAt(lastIdx)}
                cy={mode === 'ore' ? yH(points[lastIdx].hours ?? 0) - 7 : yT(nightMinutes(points[lastIdx].bed ?? sleep.current)) - 7}
                r={2.5}
                style={{ fill: 'var(--ink)' }}
              />
            )}
            {sel && scrub.index !== null && <ScrubRule geo={geo} x={xAt(scrub.index)} />}
            <rect x={0} y={0} width={geo.width} height={geo.height} fill="transparent" {...scrub.bind} />
          </ChartSvg>
        )}
      </div>
    </ChartCard>
  );
}
