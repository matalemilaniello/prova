import { useCallback, useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Dumbbell } from 'lucide-react';
import { fmtNumber, fmtPercent } from '../../../lib/format';
import { Pill } from '../../../ui';
import type { LoadWeek } from '../series';
import { weekLabel } from './axis';
import { BigValue, ChartCard, LegendItem } from './ChartCard';
import { ChartSvg, labelStyle, useGeometry, useScrub, YGrid } from './frame';
import { linear, niceDomain, safeId, topRoundedRect } from './scale';

const HEIGHT = 152;
const GYM = 'var(--palestra)';
const BALL = 'var(--calcio)';

/** Settimane della media che fa la soglia: "delle 3 settimane precedenti", "della settimana precedente". */
function previousWeeksText(n: number): string {
  return n === 1 ? 'della settimana precedente' : `delle ${n} settimane precedenti`;
}

/** Come si legge: la stessa regola di Allenamento, con il numero vero di settimane nella media. */
export function loadNote(cur: Pick<LoadWeek, 'threshold' | 'previousWeeks'> | undefined): string {
  const what = 'Il carico di una seduta o di una partita è minuti × RPE (unità arbitrarie, UA).';
  const why = 'i picchi improvvisi si associano a più infortuni, meglio salire per gradi.';
  if (!cur || cur.threshold === null || cur.previousWeeks === 0) {
    return `${what} La soglia compare con 2 settimane di storico ed è il 120% della media delle settimane precedenti, fino a 4: ${why}`;
  }
  const n = cur.previousWeeks;
  return `${what} La soglia è il 120% della media ${previousWeeksText(n)}${n < 4 ? ' (poi delle ultime 4)' : ''}: ${why}`;
}

export function LoadChart({ weeks }: { weeks: LoadWeek[] }) {
  const { ref, geo } = useGeometry(HEIGHT, { top: 18, right: 44, bottom: 24, left: 6 });
  const reduce = useReducedMotion();
  const pid = safeId(useId());
  const n = weeks.length;
  const slot = geo.innerW / Math.max(1, n);
  const xAt = useCallback((i: number) => geo.left + slot * (i + 0.5), [geo.left, slot]);
  const scrub = useScrub(n, xAt);
  const hasData = weeks.some((w) => w.total > 0);

  const max = Math.max(1, ...weeks.map((w) => Math.max(w.total + w.planned, w.threshold ?? 0)));
  const dom = niceDomain(0, max * 1.04, 3);
  const y = linear(0, dom.hi, geo.bottom, geo.top);
  const barW = Math.min(26, slot * 0.56);

  const cur = weeks[n - 1];
  const sel = scrub.index !== null ? weeks[scrub.index] : null;
  const shown = sel ?? cur;
  const caption = shown ? (
    sel ? (
      <span>
        {weekLabel(sel.weekStart, null)}
        {sel.ratio !== null && <span className="text-ink-3"> · {fmtPercent(sel.ratio)} della media</span>}
      </span>
    ) : shown.planned > 0 ? (
      <span className="tabular">
        +{fmtNumber(shown.planned)} <span className="text-ink-3">in programma</span>
      </span>
    ) : shown.ratio !== null ? (
      <span className="tabular">
        {fmtPercent(shown.ratio)} <span className="text-ink-3">della media</span>
      </span>
    ) : (
      <span className="text-ink-3">questa settimana</span>
    )
  ) : undefined;

  const label = hasData
    ? `Carico settimanale delle ultime ${n} settimane, palestra e calcio in unità arbitrarie. Questa settimana ${fmtNumber(cur?.total ?? 0)}${cur?.planned ? `, più ${fmtNumber(cur.planned)} in programma` : ''}${cur?.threshold ? `; soglia ${fmtNumber(cur.threshold)}` : ''}.`
    : 'Nessuna seduta registrata';

  return (
    <ChartCard
      title="Carico settimanale"
      badge={cur?.alert ? <Pill tone="warn">Oltre la soglia</Pill> : undefined}
      value={shown ? <BigValue value={fmtNumber(shown.total)} unit="UA" /> : undefined}
      caption={caption}
      empty={hasData ? null : { icon: Dumbbell, title: 'Nessuna seduta registrata', text: 'Le sedute di palestra e le partite registrate formano il carico della settimana.' }}
      legendBehind
      legend={
        <>
          <LegendItem color={GYM} kind="square">
            Palestra
          </LegendItem>
          <LegendItem color={BALL} kind="square">
            Calcio
          </LegendItem>
          {weeks.some((w) => w.planned > 0) && (
            <LegendItem color="var(--ink-3)" kind="ring">
              In programma
            </LegendItem>
          )}
          <LegendItem color="var(--warn)" kind="dash">
            Soglia 120%
          </LegendItem>
        </>
      }
      footnote={loadNote(cur)}
    >
      <div ref={ref}>
        {hasData && (
          <ChartSvg geo={geo} label={label} onKeyDown={scrub.onKeyDown}>
            <defs>
              <pattern id={`${pid}-hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" style={{ fill: 'var(--ink-3)', opacity: 0.08 }} />
                <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: 'var(--ink-3)', strokeWidth: 1.4, opacity: 0.45 }} />
              </pattern>
            </defs>
            <YGrid geo={geo} ticks={dom.ticks} y={y} format={(v) => fmtNumber(v)} strongZero />
            <g aria-hidden>
              {weeks.map((w, i) => (
                <text
                  key={w.weekStart}
                  x={xAt(i)}
                  y={geo.bottom + 17}
                  textAnchor="middle"
                  style={labelStyle(w.current ? { fill: 'var(--ink)', fontWeight: 600 } : {})}
                >
                  {weekLabel(w.weekStart, i > 0 ? weeks[i - 1].weekStart : null)}
                </text>
              ))}
            </g>
            {weeks.map((w, i) => {
              const x = xAt(i) - barW / 2;
              const yGymTop = y(w.gym);
              const yBallTop = y(w.total);
              const yPlanTop = y(w.total + w.planned);
              const dim = scrub.index !== null && scrub.index !== i;
              const gap = w.gym > 0 && w.football > 0 ? 1.5 : 0;
              return (
                <motion.g
                  key={w.weekStart}
                  aria-hidden
                  style={{ opacity: dim ? 0.4 : 1, originY: 1 }}
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 32, delay: i * 0.04 }}
                >
                  {w.planned > 0 && (
                    <path
                      d={topRoundedRect(x, yPlanTop, barW, yBallTop - yPlanTop + (w.total > 0 ? 6 : 0), 5)}
                      style={{ fill: `url(#${pid}-hatch)`, stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '3 2.5', strokeOpacity: 0.7 }}
                    />
                  )}
                  {w.gym > 0 && (
                    <path
                      d={w.football > 0 ? `M${x},${geo.bottom}V${yGymTop}H${x + barW}V${geo.bottom}Z` : topRoundedRect(x, yGymTop, barW, geo.bottom - yGymTop, 5)}
                      style={{ fill: GYM }}
                    />
                  )}
                  {w.football > 0 && <path d={topRoundedRect(x, yBallTop, barW, Math.max(0, yGymTop - yBallTop - gap), 5)} style={{ fill: BALL }} />}
                </motion.g>
              );
            })}
            <g aria-hidden>
              {weeks.map((w, i) =>
                w.threshold === null ? null : (
                  <line
                    key={w.weekStart}
                    x1={xAt(i) - slot / 2 + 3}
                    x2={xAt(i) + slot / 2 - 3}
                    y1={Math.round(y(w.threshold)) + 0.5}
                    y2={Math.round(y(w.threshold)) + 0.5}
                    style={{ stroke: 'var(--warn)', strokeWidth: 1.5, strokeDasharray: '4 3', strokeLinecap: 'round' }}
                  />
                ),
              )}
            </g>
            {sel && scrub.index !== null && (
              <rect
                aria-hidden
                x={xAt(scrub.index) - slot / 2 + 1}
                y={geo.top - 8}
                width={slot - 2}
                height={geo.bottom - geo.top + 8}
                rx={8}
                style={{ fill: 'var(--ink-soft)' }}
              />
            )}
            <rect x={0} y={0} width={geo.width} height={geo.height} fill="transparent" {...scrub.bind} />
          </ChartSvg>
        )}
      </div>
    </ChartCard>
  );
}
